//! Local usage and account-balance reporting for the controller.
//!
//! Everything here is read-only over data the user already owns:
//!
//! * `<DSH_HOME>/sessions/<project>/<session>/session.v3.jsonl.zstd` — the
//!   durable Harness session logs. Each event is appended as its own zstd
//!   frame, so the reader decodes a concatenation of frames rather than a
//!   single stream.
//! * `<DSH_HOME>/.credentials.yaml` — the Harness credential store, read only
//!   to obtain the provider key the balance request needs. The launch
//!   environment wins over the file, exactly like the Harness credential
//!   lookup order.
//!
//! The token numbers are provider-reported, not estimated: every
//! `assistant/message` event carries the usage of one billed attempt, where
//! `inputTokens` is cache-miss input, `cacheReadTokens` is cache-hit input and
//! `outputTokens` already includes reasoning tokens. Spend, by contrast, is an
//! estimate: no provider endpoint returns a local bill, so calls are priced
//! with the published DeepSeek rate card ([`PRICING_SOURCE_URL`]) at the
//! peak/off-peak window each call actually fell into.
//!
//! Nothing in this module logs, returns or persists a credential: the key is
//! used for one authenticated request and dropped.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::secure_fs;

/// Widest daily history the report will build, whatever the caller asks for.
pub const MAX_HISTORY_DAYS: u32 = 365;
/// Largest single session log this reader will buffer. A log beyond this is
/// counted as unreadable instead of being pulled into memory.
const MAX_LOG_BYTES: u64 = 256 * 1024 * 1024;
/// The credential store is a small YAML document; anything larger is not ours.
const MAX_CREDENTIAL_BYTES: u64 = 64 * 1024;
/// zstd frame magic. Session logs concatenate one frame per event.
const ZSTD_MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];
/// Placeholder for a usage event that arrived before any model was named.
const UNKNOWN_MODEL: &str = "unknown";
/// Provider key name in the launch environment and in the credential store.
const PROVIDER_KEY_NAME: &str = "DEEPSEEK_API_KEY";
/// The official billing endpoint for the account balance.
const BALANCE_URL: &str = "https://api.deepseek.com/user/balance";
const BALANCE_TIMEOUT: Duration = Duration::from_secs(15);
/// Usage events older than the session header's own creation time belong to a
/// seeded/forked parent replay: counting them would bill the parent's calls
/// twice. A small slack absorbs clock adjustments between boot and first call.
const INHERITED_EVENT_SLACK_MS: i64 = 5_000;

// ─────────────────────────────── pricing ───────────────────────────────

/// Published per-million-token prices for one model, in USD, off-peak.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rate {
    pub cache_hit: f64,
    pub cache_miss: f64,
    pub output: f64,
}

/// Peak hours are billed at twice the off-peak rate.
pub const PRICING_PEAK_MULTIPLIER: f64 = 2.0;
/// Weekday peak windows in UTC: 01:00–04:00 and 06:00–10:00.
pub const PRICING_PEAK_WINDOWS_UTC: [&str; 2] = ["01:00-04:00", "06:00-10:00"];
pub const PRICING_SOURCE_URL: &str = "https://api-docs.deepseek.com/quick_start/pricing";
/// Date the compiled-in rate card was read from [`PRICING_SOURCE_URL`].
pub const PRICING_SOURCE_DATE: &str = "2026-09-16";

/// Compiled-in rate card. Prices change; the panel always shows the source and
/// date next to an estimate, and an unknown model is reported as token-only
/// rather than priced at a guess.
const RATE_CARD: [(&str, Rate); 2] = [
    (
        "deepseek-flash",
        Rate {
            cache_hit: 0.003,
            cache_miss: 0.15,
            output: 0.6,
        },
    ),
    (
        "deepseek-v4-pro",
        Rate {
            cache_hit: 0.022,
            cache_miss: 0.66,
            output: 1.98,
        },
    ),
];

/// Retired aliases the provider still accepts and bills at the same rate.
const RATE_ALIASES: [(&str, &str); 2] = [
    ("deepseek-v4-flash", "deepseek-flash"),
    ("deepseek-v4-flash-vision-exp", "deepseek-flash"),
];

/// Price one model id, or `None` when the rate card does not cover it.
pub fn rate_for(model: &str) -> Option<Rate> {
    let candidate = model.trim().to_ascii_lowercase();
    if candidate.is_empty() {
        return None;
    }
    for (alias, canonical) in RATE_ALIASES {
        if candidate == alias {
            return rate_for(canonical);
        }
    }
    for (name, rate) in RATE_CARD {
        // A dated variant such as `deepseek-v4-pro-0813` is the same rate.
        if candidate == name || candidate.starts_with(&format!("{name}-")) {
            return Some(rate);
        }
    }
    None
}

/// Whether a call at this instant is billed at the peak rate. Peak hours are
/// UTC 01:00–04:00 and 06:00–10:00, Monday through Friday.
pub fn is_peak(utc_epoch_day: i64, second_of_day: u32) -> bool {
    let weekday = (utc_epoch_day + 3).rem_euclid(7); // 0 = Monday
    if weekday >= 5 {
        return false;
    }
    let hour = second_of_day / 3_600;
    (1..4).contains(&hour) || (6..10).contains(&hour)
}

/// Cost of one call in USD at the given rate.
fn call_cost(rate: Rate, peak: bool, tokens: &Tokens) -> f64 {
    let million = 1_000_000.0;
    let multiplier = if peak { PRICING_PEAK_MULTIPLIER } else { 1.0 };
    let uncached_input = tokens.uncached_input as f64 / million * rate.cache_miss;
    let cache_read = tokens.cache_read as f64 / million * rate.cache_hit;
    // DeepSeek bills no separate cache-write line: a write is a cache miss.
    let cache_write = tokens.cache_write as f64 / million * rate.cache_miss;
    let output = tokens.output as f64 / million * rate.output;
    multiplier * (uncached_input + cache_read + cache_write + output)
}

// ───────────────────────────── calendar helpers ─────────────────────────────

/// Milliseconds at or after `time_ms` for the local day containing it.
fn local_day_index(time_ms: i64, tz_offset_minutes: i32) -> i64 {
    let shifted = time_ms + i64::from(tz_offset_minutes) * 60_000;
    shifted.div_euclid(86_400_000)
}

/// Civil date from a day index relative to 1970-01-01 (Howard Hinnant's
/// algorithm): avoids a date-library dependency for one fixed format.
fn civil_from_days(day: i64) -> (i64, u32, u32) {
    let z = day + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day_of_month = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (
        if month <= 2 { year + 1 } else { year },
        month,
        day_of_month,
    )
}

/// `YYYY-MM-DD` for a local day index.
fn format_day(day: i64) -> String {
    let (year, month, day_of_month) = civil_from_days(day);
    format!("{year:04}-{month:02}-{day_of_month:02}")
}

// ────────────────────────────── log decoding ──────────────────────────────

/// Find the next zstd frame magic at or after the start of `bytes`.
fn find_magic(bytes: &[u8]) -> Option<usize> {
    if bytes.len() < ZSTD_MAGIC.len() {
        return None;
    }
    bytes
        .windows(ZSTD_MAGIC.len())
        .position(|window| window == ZSTD_MAGIC)
}

/// Decode every zstd frame in a concatenated session log.
///
/// Returns the decoded bytes plus the number of frames that could not be
/// decoded. A torn or corrupt frame is skipped rather than failing the whole
/// log: losing one event is preferable to losing today's usage entirely.
fn decode_frames(bytes: &[u8]) -> (Vec<u8>, usize) {
    use ruzstd::decoding::{BlockDecodingStrategy, FrameDecoder};

    let mut output = Vec::new();
    let mut broken = 0usize;
    let mut offset = 0usize;
    while offset < bytes.len() {
        let start = match find_magic(&bytes[offset..]) {
            Some(relative) => offset + relative,
            None => break,
        };
        let mut input = &bytes[start..];
        let mut decoder = FrameDecoder::new();
        if decoder.init(&mut input).is_err() {
            broken += 1;
            offset = start + 1;
            continue;
        }
        let mut frame_ok = true;
        loop {
            let remaining_before = input.len();
            if decoder
                .decode_blocks(&mut input, BlockDecodingStrategy::All)
                .is_err()
            {
                frame_ok = false;
                break;
            }
            if let Some(chunk) = decoder.collect() {
                output.extend_from_slice(&chunk);
            }
            if decoder.is_finished() {
                break;
            }
            // A frame that cannot finish and cannot consume input is torn.
            if input.len() == remaining_before {
                frame_ok = false;
                break;
            }
        }
        if frame_ok {
            let consumed = bytes.len() - input.len();
            offset = consumed.max(start + 1);
        } else {
            broken += 1;
            offset = start + 1;
        }
    }
    (output, broken)
}

// ──────────────────────────────── folding ────────────────────────────────

/// Provider-reported tokens of one or more calls.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Tokens {
    calls: u64,
    uncached_input: u64,
    cache_read: u64,
    cache_write: u64,
    output: u64,
    reasoning: u64,
}

impl Tokens {
    fn total(&self) -> u64 {
        self.uncached_input + self.cache_read + self.cache_write + self.output
    }

    fn add(&mut self, other: &Tokens) {
        self.calls += other.calls;
        self.uncached_input += other.uncached_input;
        self.cache_read += other.cache_read;
        self.cache_write += other.cache_write;
        self.output += other.output;
        self.reasoning += other.reasoning;
    }
}

/// Tokens plus estimated spend for one (local day, provider, model) bucket.
#[derive(Clone, Default)]
struct Bucket {
    tokens: Tokens,
    cost_usd: f64,
    priced_calls: u64,
    unpriced_calls: u64,
}

/// Fold one decoded session log into `buckets`.
///
/// Returns the number of usage events skipped as inherited from a parent
/// session, and the number of unreadable (non-JSON) lines.
fn fold_log(
    bytes: &[u8],
    tz_offset_minutes: i32,
    buckets: &mut HashMap<(i64, String, String), Bucket>,
) -> (u64, usize) {
    let (decoded, _broken_frames) = decode_frames(bytes);
    let text = String::from_utf8_lossy(&decoded);

    let mut provider = String::new();
    let mut model = String::new();
    let mut step_time_ms: Option<i64> = None;
    let mut created_at_ms: Option<i64> = None;
    let mut inherited = 0u64;
    let mut unreadable = 0usize;

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let event: Value = match serde_json::from_str(line) {
            Ok(event) => event,
            Err(_) => {
                unreadable += 1;
                continue;
            }
        };
        match event.get("type").and_then(Value::as_str).unwrap_or("") {
            "session" => {
                created_at_ms = event
                    .get("createdAt")
                    .and_then(Value::as_i64)
                    .or(created_at_ms);
            }
            "request/header" => {
                if let Some(config) = event.pointer("/data/header/config") {
                    provider = text_field(config, "provider", &provider);
                    model = text_field(config, "model", &model);
                }
            }
            "request/context" => {
                if let Some(data) = event.get("data") {
                    provider = text_field(data, "provider", &provider);
                    model = text_field(data, "model", &model);
                }
            }
            "step/start" => {
                // A step's start is the closest available proxy for when the
                // provider started billing that request.
                step_time_ms = event.get("time").and_then(Value::as_i64).or(step_time_ms);
            }
            "assistant/message" => {
                let Some(usage) = event.pointer("/data/usage") else {
                    continue;
                };
                let Some(time_ms) = step_time_ms.or_else(|| event_time_ms(&event)) else {
                    continue;
                };
                if let Some(created_at) = created_at_ms {
                    if time_ms + INHERITED_EVENT_SLACK_MS < created_at {
                        inherited += 1;
                        continue;
                    }
                }
                let tokens = usage_tokens(usage);
                let utc_day = time_ms.div_euclid(86_400_000);
                let second_of_day = time_ms.rem_euclid(86_400_000) / 1_000;
                let peak = is_peak(utc_day, second_of_day as u32);
                let key = (
                    local_day_index(time_ms, tz_offset_minutes),
                    if provider.is_empty() {
                        UNKNOWN_MODEL.to_string()
                    } else {
                        provider.clone()
                    },
                    if model.is_empty() {
                        UNKNOWN_MODEL.to_string()
                    } else {
                        model.clone()
                    },
                );
                let bucket = buckets.entry(key).or_default();
                bucket.tokens.add(&tokens);
                match rate_for(&model) {
                    Some(rate) => {
                        bucket.cost_usd += call_cost(rate, peak, &tokens);
                        bucket.priced_calls += 1;
                    }
                    None => bucket.unpriced_calls += 1,
                }
            }
            _ => {}
        }
    }
    (inherited, unreadable)
}

fn event_time_ms(event: &Value) -> Option<i64> {
    event.get("time").and_then(Value::as_i64)
}

/// Read a non-empty string field, keeping the previous value when absent.
fn text_field(source: &Value, key: &str, previous: &str) -> String {
    match source.get(key).and_then(Value::as_str) {
        Some(value) if !value.trim().is_empty() => value.to_string(),
        _ => previous.to_string(),
    }
}

/// Provider-reported usage of one billed attempt.
fn usage_tokens(usage: &Value) -> Tokens {
    let number = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or_default();
    Tokens {
        calls: 1,
        uncached_input: number("inputTokens"),
        cache_read: number("cacheReadTokens"),
        cache_write: number("cacheWriteTokens"),
        output: number("outputTokens"),
        reasoning: number("reasoningTokens"),
    }
}

// ──────────────────────────────── report ────────────────────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TokenTotals {
    pub calls: u64,
    pub uncached_input: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub output: u64,
    pub reasoning: u64,
    pub total: u64,
}

impl From<&Tokens> for TokenTotals {
    fn from(tokens: &Tokens) -> Self {
        Self {
            calls: tokens.calls,
            uncached_input: tokens.uncached_input,
            cache_read: tokens.cache_read,
            cache_write: tokens.cache_write,
            output: tokens.output,
            reasoning: tokens.reasoning,
            total: tokens.total(),
        }
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub provider: String,
    pub model: String,
    pub tokens: TokenTotals,
    /// `None` when no call of this model matched the rate card.
    pub cost_usd: Option<f64>,
    pub priced_calls: u64,
    pub unpriced_calls: u64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    pub day: String,
    pub tokens: TokenTotals,
    pub cost_usd: Option<f64>,
    pub priced_calls: u64,
    pub unpriced_calls: u64,
    pub models: Vec<ModelUsage>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PricingRow {
    pub model: String,
    pub cache_hit: f64,
    pub cache_miss: f64,
    pub output: f64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PricingInfo {
    pub currency: String,
    pub units: String,
    pub peak_multiplier: f64,
    pub peak_windows_utc: Vec<String>,
    pub source_url: String,
    pub source_date: String,
    pub models: Vec<PricingRow>,
}

impl PricingInfo {
    fn compiled_in() -> Self {
        Self {
            currency: "USD".to_string(),
            units: "per 1M tokens".to_string(),
            peak_multiplier: PRICING_PEAK_MULTIPLIER,
            peak_windows_utc: PRICING_PEAK_WINDOWS_UTC
                .iter()
                .map(|window| (*window).to_string())
                .collect(),
            source_url: PRICING_SOURCE_URL.to_string(),
            source_date: PRICING_SOURCE_DATE.to_string(),
            models: RATE_CARD
                .iter()
                .map(|(name, rate)| PricingRow {
                    model: (*name).to_string(),
                    cache_hit: rate.cache_hit,
                    cache_miss: rate.cache_miss,
                    output: rate.output,
                })
                .collect(),
        }
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub generated_at: i64,
    pub timezone_offset_minutes: i32,
    pub window_days: u32,
    pub today: DayUsage,
    pub history: Vec<DayUsage>,
    pub sessions_scanned: usize,
    pub sessions_unreadable: usize,
    pub inherited_events_skipped: u64,
    pub unreadable_lines: usize,
    pub pricing: PricingInfo,
}

/// One session log on disk, with the metadata that decides whether it can
/// still contain usage inside the reporting window.
struct SessionLog {
    path: PathBuf,
    modified_ms: i64,
}

fn modified_ms(path: &Path) -> Option<i64> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return None;
    }
    let modified = metadata.modified().ok()?;
    let since_epoch = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(since_epoch.as_millis() as i64)
}

/// Collect the session logs that can still contain in-window usage.
///
/// The window filter is a modified-time filter: an event written inside the
/// window always moves the log's modified time into the window, so an older
/// log cannot hide newer usage. A session directory is never followed through
/// a symlink, and `.lock` siblings are ignored.
fn session_logs(sessions_root: &Path, window_start_ms: i64) -> Vec<SessionLog> {
    let mut logs = Vec::new();
    let Ok(projects) = fs::read_dir(sessions_root) else {
        return logs;
    };
    for project in projects.flatten() {
        let Ok(project_type) = project.file_type() else {
            continue;
        };
        if !project_type.is_dir() {
            continue;
        }
        let Ok(sessions) = fs::read_dir(project.path()) else {
            continue;
        };
        for session in sessions.flatten() {
            let Ok(session_type) = session.file_type() else {
                continue;
            };
            if !session_type.is_dir() {
                continue;
            }
            let directory = session.path();
            // Prefer the current log; the pre-v3 file is a seed copy that is
            // fully contained in it.
            for name in ["session.v3.jsonl.zstd", "session.jsonl.zstd"] {
                let candidate = directory.join(name);
                if let Some(modified_ms) = modified_ms(&candidate) {
                    if modified_ms >= window_start_ms {
                        logs.push(SessionLog {
                            path: candidate,
                            modified_ms,
                        });
                    }
                    break;
                }
            }
        }
    }
    logs.sort_by(|left, right| {
        left.modified_ms
            .cmp(&right.modified_ms)
            .then_with(|| left.path.cmp(&right.path))
    });
    logs
}

/// Build the usage report over the last `window_days` local days.
pub fn build_report(
    dsh_home: &Path,
    window_days: u32,
    tz_offset_minutes: i32,
    now_ms: i64,
) -> UsageReport {
    let window_days = window_days.clamp(1, MAX_HISTORY_DAYS);
    let today_index = local_day_index(now_ms, tz_offset_minutes);
    let first_index = today_index - i64::from(window_days) + 1;
    let window_start_ms = first_index * 86_400_000 - i64::from(tz_offset_minutes) * 60_000;

    let logs = session_logs(&dsh_home.join("sessions"), window_start_ms);
    let mut buckets: HashMap<(i64, String, String), Bucket> = HashMap::new();
    let mut sessions_scanned = 0usize;
    let mut sessions_unreadable = 0usize;
    let mut inherited_events_skipped = 0u64;
    let mut unreadable_lines = 0usize;

    for log in &logs {
        match secure_fs::read_bounded(&log.path, MAX_LOG_BYTES) {
            Ok(Some(bytes)) => {
                sessions_scanned += 1;
                let (inherited, unreadable) = fold_log(&bytes, tz_offset_minutes, &mut buckets);
                inherited_events_skipped += inherited;
                unreadable_lines += unreadable;
            }
            // A log that vanished between listing and reading is not an
            // error worth reporting; a symlinked or oversized one is.
            Ok(None) => {}
            Err(_) => sessions_unreadable += 1,
        }
    }

    let mut history = Vec::with_capacity(window_days as usize);
    for index in first_index..=today_index {
        history.push(day_usage(&buckets, index));
    }

    UsageReport {
        today: day_usage(&buckets, today_index),
        generated_at: now_ms,
        timezone_offset_minutes: tz_offset_minutes,
        window_days,
        history,
        sessions_scanned,
        sessions_unreadable,
        inherited_events_skipped,
        unreadable_lines,
        pricing: PricingInfo::compiled_in(),
    }
}

fn day_usage(buckets: &HashMap<(i64, String, String), Bucket>, day_index: i64) -> DayUsage {
    let mut models = Vec::new();
    let mut tokens = Tokens::default();
    let mut cost_usd = 0.0;
    let mut priced_calls = 0u64;
    let mut unpriced_calls = 0u64;

    for ((day, provider, model), bucket) in buckets {
        if *day != day_index {
            continue;
        }
        models.push(ModelUsage {
            provider: provider.clone(),
            model: model.clone(),
            tokens: TokenTotals::from(&bucket.tokens),
            cost_usd: (bucket.priced_calls > 0).then_some(bucket.cost_usd),
            priced_calls: bucket.priced_calls,
            unpriced_calls: bucket.unpriced_calls,
        });
        tokens.add(&bucket.tokens);
        cost_usd += bucket.cost_usd;
        priced_calls += bucket.priced_calls;
        unpriced_calls += bucket.unpriced_calls;
    }
    models.sort_by(|left, right| {
        right
            .tokens
            .total
            .cmp(&left.tokens.total)
            .then_with(|| left.model.cmp(&right.model))
    });

    DayUsage {
        day: format_day(day_index),
        tokens: TokenTotals::from(&tokens),
        cost_usd: (priced_calls > 0).then_some(cost_usd),
        priced_calls,
        unpriced_calls,
        models,
    }
}

// ─────────────────────────────── credentials ───────────────────────────────

/// Read `name` from the launch environment, then the Harness credential store.
pub fn provider_key(dsh_home: &Path, name: &str) -> Option<String> {
    if let Ok(value) = std::env::var(name) {
        if !value.trim().is_empty() {
            return Some(value);
        }
    }
    let path = dsh_home.join(".credentials.yaml");
    let bytes = secure_fs::read_bounded(&path, MAX_CREDENTIAL_BYTES).ok()??;
    let text = String::from_utf8(bytes).ok()?;
    credential_value(&text, name)
}

/// Extract one reference value from the credential document.
///
/// The store is a versioned document with `refs:`/`records:` sections; its
/// pre-release shape was a flat mapping of reference names at column zero.
/// Only a plain single-line scalar is accepted. Quoted values are unquoted;
/// block scalars, anchors and anything else are refused rather than guessed
/// at, because a wrong value would silently send the wrong credential.
pub fn credential_value(text: &str, name: &str) -> Option<String> {
    let mut section: Option<String> = None;
    let mut versioned = false;
    for raw_line in text.lines() {
        let line = raw_line.trim_end();
        if line.trim().is_empty() || line.trim_start().starts_with('#') {
            continue;
        }
        let indented = line.starts_with(' ') || line.starts_with('\t');
        if !indented {
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            let key = key.trim();
            let value = value.trim();
            if key == "version" {
                versioned = true;
                continue;
            }
            if value.is_empty() && (key == "refs" || key == "records") {
                section = Some(key.to_string());
                continue;
            }
            // Flat pre-release document: `NAME: value` at column zero.
            if key == name && !versioned {
                return scalar(value);
            }
            section = None;
            continue;
        }
        if section.as_deref() != Some("refs") {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim() == name {
            return scalar(value.trim());
        }
    }
    None
}

/// Accept only a plain single-line scalar.
fn scalar(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let first = value.chars().next()?;
    if matches!(first, '|' | '>' | '&' | '*' | '!' | '%' | '@' | '`') {
        return None;
    }
    if value.starts_with('"') || value.starts_with('\'') {
        if value.len() < 2 {
            return None;
        }
        let quote = first;
        if !value.ends_with(quote) {
            return None;
        }
        let inner = &value[1..value.len() - 1];
        if inner.contains(quote) {
            return None;
        }
        return (!inner.is_empty()).then(|| inner.to_string());
    }
    Some(value.to_string())
}

// ─────────────────────────────── commands ───────────────────────────────

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

/// Token usage of the last `days` local days, aggregated per day and model.
#[tauri::command]
pub fn get_usage_report(
    app: AppHandle,
    days: u32,
    tz_offset_minutes: i32,
) -> Result<Value, String> {
    let paths = crate::paths::resolve(&app)?;
    let tz_offset_minutes = tz_offset_minutes.clamp(-16 * 60, 16 * 60);
    let report = build_report(&paths.dsh_home, days, tz_offset_minutes, now_ms());
    serde_json::to_value(report).map_err(|error| format!("USAGE_SERIALIZE: {error}"))
}

#[derive(Deserialize)]
struct RawBalance {
    #[serde(default)]
    is_available: bool,
    #[serde(default)]
    balance_infos: Vec<RawBalanceInfo>,
}

#[derive(Deserialize)]
struct RawBalanceInfo {
    #[serde(default)]
    currency: String,
    #[serde(default)]
    total_balance: String,
    #[serde(default)]
    granted_balance: String,
    #[serde(default)]
    topped_up_balance: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BalanceEntry {
    pub currency: String,
    pub total: String,
    pub granted: String,
    pub topped_up: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountBalance {
    pub available: bool,
    pub balances: Vec<BalanceEntry>,
    pub fetched_at: i64,
}

fn parse_balance(body: &str, fetched_at: i64) -> Result<AccountBalance, String> {
    let raw: RawBalance = serde_json::from_str(body)
        .map_err(|_| "USAGE_INVALID_RESPONSE: balance response was not recognised".to_string())?;
    Ok(AccountBalance {
        available: raw.is_available,
        balances: raw
            .balance_infos
            .into_iter()
            .map(|info| BalanceEntry {
                currency: info.currency,
                total: info.total_balance,
                granted: info.granted_balance,
                topped_up: info.topped_up_balance,
            })
            .collect(),
        fetched_at,
    })
}

/// Account balance from the provider's billing endpoint.
///
/// The request is one authenticated read; the credential is never logged and
/// never leaves this function.
#[tauri::command]
pub async fn get_account_balance(app: AppHandle) -> Result<Value, String> {
    let paths = crate::paths::resolve(&app)?;
    let key = provider_key(&paths.dsh_home, PROVIDER_KEY_NAME)
        .ok_or_else(|| "USAGE_NO_CREDENTIAL: no DeepSeek API key is configured".to_string())?;
    let client = crate::tls::client_builder()?
        .timeout(BALANCE_TIMEOUT)
        .user_agent(format!("dsh-desktop/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "USAGE_UNAVAILABLE: cannot create the balance client".to_string())?;
    let response = client
        .get(BALANCE_URL)
        .bearer_auth(&key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "USAGE_TIMEOUT: the balance request timed out".to_string()
            } else {
                "USAGE_UNAVAILABLE: the balance request could not be sent".to_string()
            }
        })?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("USAGE_KEY_REJECTED: the provider rejected the stored key".to_string());
    }
    if !status.is_success() {
        return Err(format!(
            "USAGE_HTTP_ERROR: the balance endpoint answered {}",
            status.as_u16()
        ));
    }
    let balance = parse_balance(&body, now_ms())?;
    serde_json::to_value(balance).map_err(|error| format!("USAGE_SERIALIZE: {error}"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use ruzstd::encoding::{compress_to_vec, CompressionLevel};
    use std::io::Write;

    /// 2026-09-16T07:16:36Z — a Wednesday inside the 06:00-10:00 UTC peak.
    const PEAK_MS: i64 = 1_789_542_996_000;
    /// 2026-09-16T12:00:00Z — the same Wednesday, off-peak.
    const OFF_PEAK_MS: i64 = 1_789_560_000_000;

    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dsh-usage-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Compress each line into its own frame, exactly like the session log:
    /// one newline-terminated JSON document per frame.
    fn multiframe(lines: &[String]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for line in lines {
            let mut payload = line.clone();
            payload.push('\n');
            bytes.extend_from_slice(&compress_to_vec(
                payload.as_bytes(),
                CompressionLevel::Fastest,
            ));
        }
        bytes
    }

    /// One billed attempt without provider/model: those come from the
    /// `request/header` event that precedes it, exactly like a real log.
    fn usage_line(time_ms: i64, input: u64, cache: u64, out: u64) -> String {
        serde_json::json!({
            "type": "assistant/message",
            "seq": 1,
            "time": time_ms,
            "data": {
                "turn": 1,
                "step": 1,
                "message": { "role": "assistant" },
                "usage": {
                    "inputTokens": input,
                    "outputTokens": out,
                    "totalTokens": input + cache + out,
                    "cacheReadTokens": cache,
                    "reasoningTokens": 0
                }
            }
        })
        .to_string()
    }

    /// The route announcement that names the provider and model of the calls
    /// that follow it.
    fn header_line(time_ms: i64, provider: &str, model: &str) -> String {
        serde_json::json!({
            "type": "request/header",
            "time": time_ms,
            "data": { "header": { "config": { "provider": provider, "model": model } } }
        })
        .to_string()
    }

    #[test]
    fn multi_frame_logs_decode_every_event() {
        let lines = vec![
            r#"{"type":"session","createdAt":1}"#.to_string(),
            r#"{"type":"turn/start"}"#.to_string(),
            r#"{"type":"assistant/message"}"#.to_string(),
        ];
        let (decoded, broken) = decode_frames(&multiframe(&lines));
        assert_eq!(broken, 0);
        let text = String::from_utf8(decoded).unwrap();
        let decoded_lines: Vec<&str> = text.lines().collect();
        assert_eq!(decoded_lines, lines);
    }

    #[test]
    fn a_torn_frame_does_not_lose_the_rest_of_the_log() {
        let mut bytes = multiframe(&[r#"{"type":"session","createdAt":1}"#.to_string()]);
        // A truncated frame followed by a healthy one.
        bytes.extend_from_slice(&ZSTD_MAGIC);
        bytes.extend_from_slice(&[0x04, 0x00, 0x99, 0x99]);
        bytes.extend_from_slice(&multiframe(&[r#"{"type":"turn/end"}"#.to_string()]));
        let (decoded, broken) = decode_frames(&bytes);
        assert!(broken >= 1);
        let text = String::from_utf8(decoded).unwrap();
        assert!(text.contains(r#""type":"session""#));
        assert!(text.contains(r#""type":"turn/end""#));
    }

    #[test]
    fn peak_windows_follow_the_documented_utc_hours() {
        // 2026-09-16 (Wednesday) 07:16Z is peak, 12:00Z is not.
        assert!(is_peak(20_712, 7 * 3_600 + 16 * 60));
        assert!(!is_peak(20_712, 12 * 3_600));
        assert!(!is_peak(20_712, 0));
        assert!(is_peak(20_712, 3 * 3_600 + 59 * 60));
        assert!(!is_peak(20_712, 4 * 3_600));
        // 2026-09-19 is a Saturday: the same hours are off-peak.
        assert!(!is_peak(20_715, 2 * 3_600));
    }

    #[test]
    fn day_formatting_matches_the_epoch() {
        assert_eq!(format_day(0), "1970-01-01");
        assert_eq!(format_day(19_782), "2024-02-29");
        assert_eq!(format_day(20_712), "2026-09-16");
    }

    #[test]
    fn pricing_covers_the_documented_models_only() {
        assert_eq!(
            rate_for("deepseek-flash"),
            Some(Rate {
                cache_hit: 0.003,
                cache_miss: 0.15,
                output: 0.6
            })
        );
        assert_eq!(rate_for("deepseek-flash"), rate_for("DeepSeek-Flash"));
        assert_eq!(
            rate_for("deepseek-v4-flash-vision-exp"),
            rate_for("deepseek-flash")
        );
        assert_eq!(
            rate_for("deepseek-v4-pro-0813"),
            rate_for("deepseek-v4-pro")
        );
        assert_eq!(rate_for("gpt-4o"), None);
        assert_eq!(rate_for("  "), None);
    }

    #[test]
    fn peak_calls_cost_twice_the_off_peak_rate() {
        let tokens = Tokens {
            calls: 1,
            uncached_input: 1_000,
            cache_read: 2_000_000,
            output: 500,
            ..Tokens::default()
        };
        let rate = rate_for("deepseek-flash").unwrap();
        let off_peak = call_cost(rate, false, &tokens);
        let peak = call_cost(rate, true, &tokens);
        assert!((off_peak - 0.00645).abs() < 1e-9, "{off_peak}");
        assert!((peak - 0.0129).abs() < 1e-9, "{peak}");
    }

    #[test]
    fn folding_attributes_calls_to_day_model_and_window() {
        let created = PEAK_MS - 60_000;
        let lines = vec![
            serde_json::json!({ "type": "session", "createdAt": created }).to_string(),
            header_line(created, "deepseek-official", "deepseek-flash"),
            serde_json::json!({ "type": "step/start", "time": PEAK_MS, "data": {} }).to_string(),
            usage_line(PEAK_MS + 5_000, 1_000, 2_000_000, 500),
            serde_json::json!({ "type": "step/start", "time": OFF_PEAK_MS, "data": {} })
                .to_string(),
            usage_line(OFF_PEAK_MS + 5_000, 1_000, 2_000_000, 500),
        ];
        let mut buckets = HashMap::new();
        let (inherited, unreadable) = fold_log(&multiframe(&lines), 0, &mut buckets);
        assert_eq!((inherited, unreadable), (0, 0));
        let bucket = buckets
            .get(&(
                20_712,
                "deepseek-official".to_string(),
                "deepseek-flash".to_string(),
            ))
            .unwrap();
        assert_eq!(bucket.tokens.calls, 2);
        assert_eq!(bucket.tokens.uncached_input, 2_000);
        assert_eq!(bucket.tokens.cache_read, 4_000_000);
        assert_eq!(bucket.tokens.output, 1_000);
        assert_eq!(bucket.priced_calls, 2);
        assert_eq!(bucket.unpriced_calls, 0);
        assert!((bucket.cost_usd - (0.00645 + 0.0129)).abs() < 1e-9);
    }

    #[test]
    fn a_usage_event_before_the_session_start_is_inherited_and_skipped() {
        let created = PEAK_MS;
        let lines = vec![
            serde_json::json!({ "type": "session", "createdAt": created }).to_string(),
            // Replayed from the seeded parent: its original time predates
            // this session's creation, so it is not billed here.
            usage_line(created - 600_000, 10, 10, 10),
            usage_line(created + 1_000, 10, 10, 10),
        ];
        let mut buckets = HashMap::new();
        let (inherited, _) = fold_log(&multiframe(&lines), 0, &mut buckets);
        assert_eq!(inherited, 1);
        let bucket = buckets.values().next().unwrap();
        assert_eq!(bucket.tokens.calls, 1);
        assert_eq!(bucket.tokens.output, 10);
    }

    #[test]
    fn day_buckets_follow_the_requested_timezone() {
        // 2026-09-15T23:30:00Z is 2026-09-16 07:30 in UTC+8.
        let late = 1_789_515_000_000;
        let lines = vec![
            serde_json::json!({ "type": "session", "createdAt": late - 60_000 }).to_string(),
            header_line(late - 60_000, "deepseek-official", "deepseek-flash"),
            usage_line(late, 10, 0, 10),
        ];
        let bytes = multiframe(&lines);
        let mut utc = HashMap::new();
        fold_log(&bytes, 0, &mut utc);
        let mut cst = HashMap::new();
        fold_log(&bytes, 8 * 60, &mut cst);
        assert!(utc.contains_key(&(
            20_711,
            "deepseek-official".to_string(),
            "deepseek-flash".to_string()
        )));
        assert!(cst.contains_key(&(
            20_712,
            "deepseek-official".to_string(),
            "deepseek-flash".to_string()
        )));
    }

    #[test]
    fn unknown_models_keep_their_tokens_without_a_price() {
        let lines = vec![
            serde_json::json!({ "type": "session", "createdAt": PEAK_MS - 1_000 }).to_string(),
            header_line(PEAK_MS - 1_000, "someone-else", "gpt-4o"),
            usage_line(PEAK_MS, 10, 20, 30),
        ];
        let mut buckets = HashMap::new();
        fold_log(&multiframe(&lines), 0, &mut buckets);
        let bucket = buckets
            .get(&(20_712, "someone-else".to_string(), "gpt-4o".to_string()))
            .unwrap();
        assert_eq!(bucket.tokens.calls, 1);
        assert_eq!(bucket.tokens.total(), 60);
        assert_eq!(bucket.unpriced_calls, 1);
        assert_eq!(bucket.priced_calls, 0);
        assert_eq!(bucket.cost_usd, 0.0);
    }

    #[test]
    fn credential_reader_handles_both_document_layouts() {
        let versioned = "version: 1\n\nrefs:\n  DEEPSEEK_API_KEY: sk-abc\n  OTHER: zzz\n\nrecords:\n  plugin/id:\n    kind: grant\n";
        assert_eq!(
            credential_value(versioned, "DEEPSEEK_API_KEY"),
            Some("sk-abc".to_string())
        );
        assert_eq!(credential_value(versioned, "MISSING"), None);
        let flat = "DEEPSEEK_API_KEY: sk-flat\nOPENAI_API_KEY: sk-other\n";
        assert_eq!(
            credential_value(flat, "DEEPSEEK_API_KEY"),
            Some("sk-flat".to_string())
        );
        // A quoted value is unquoted; a comment line is ignored.
        let quoted = "version: 1\nrefs:\n  # note\n  DEEPSEEK_API_KEY: \"sk-quoted\"\n";
        assert_eq!(
            credential_value(quoted, "DEEPSEEK_API_KEY"),
            Some("sk-quoted".to_string())
        );
    }

    #[test]
    fn credential_reader_refuses_ambiguous_values() {
        // A block scalar is not a value this reader can resolve safely.
        let block = "version: 1\nrefs:\n  DEEPSEEK_API_KEY: |\n    sk-multiline\n";
        assert_eq!(credential_value(block, "DEEPSEEK_API_KEY"), None);
        // An empty value means "no key" in the store; never a blank secret.
        let empty = "version: 1\nrefs:\n  DEEPSEEK_API_KEY:\n";
        assert_eq!(credential_value(empty, "DEEPSEEK_API_KEY"), None);
        // Records are a different key space and must not answer for refs.
        let records = "version: 1\nrecords:\n  DEEPSEEK_API_KEY: sk-record\n";
        assert_eq!(credential_value(records, "DEEPSEEK_API_KEY"), None);
    }

    #[test]
    fn report_walks_a_session_tree_and_summarises_the_window() {
        let home = test_dir("report");
        let session = home
            .join("sessions")
            .join("--project--")
            .join("session-abc");
        fs::create_dir_all(&session).unwrap();
        let lines = vec![
            serde_json::json!({ "type": "session", "createdAt": PEAK_MS - 1_000 }).to_string(),
            header_line(PEAK_MS - 1_000, "deepseek-official", "deepseek-flash"),
            usage_line(PEAK_MS, 1_000, 2_000_000, 500),
        ];
        let mut file = fs::File::create(session.join("session.v3.jsonl.zstd")).unwrap();
        file.write_all(&multiframe(&lines)).unwrap();
        drop(file);

        let report = build_report(&home, 30, 0, PEAK_MS + 60_000);
        assert_eq!(report.sessions_scanned, 1);
        assert_eq!(report.sessions_unreadable, 0);
        assert_eq!(report.history.len(), 30);
        assert_eq!(report.today.day, "2026-09-16");
        assert_eq!(report.today.tokens.calls, 1);
        assert_eq!(report.today.tokens.total, 2_001_500);
        assert_eq!(report.today.models.len(), 1);
        assert_eq!(report.today.models[0].model, "deepseek-flash");
        assert_eq!(report.today.unpriced_calls, 0);
        assert!((report.today.cost_usd.unwrap() - 0.0129).abs() < 1e-9);
        // Days without traffic are still present so the panel can chart them.
        assert_eq!(report.history[0].tokens.calls, 0);
        assert_eq!(report.history[0].cost_usd, None);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn logs_before_the_window_are_not_scanned() {
        let home = test_dir("window");
        let session = home.join("sessions").join("--p--").join("session-now");
        fs::create_dir_all(&session).unwrap();
        fs::write(session.join("session.v3.jsonl.zstd"), b"").unwrap();
        let root = home.join("sessions");
        // A file written now is inside a window that started yesterday, and
        // outside a window that only starts tomorrow.
        assert_eq!(session_logs(&root, now_ms() - 86_400_000).len(), 1);
        assert_eq!(session_logs(&root, now_ms() + 86_400_000).len(), 0);
        // The pre-v3 seed copy is never read alongside the current log.
        fs::write(session.join("session.jsonl.zstd"), b"").unwrap();
        assert_eq!(session_logs(&root, now_ms() - 86_400_000).len(), 1);
        let _ = fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_session_log_is_never_read() {
        let home = test_dir("symlink");
        let session = home.join("sessions").join("--p--").join("session-link");
        fs::create_dir_all(&session).unwrap();
        let target = home.join("elsewhere.jsonl.zstd");
        let lines = vec![
            serde_json::json!({ "type": "session", "createdAt": PEAK_MS - 1_000 }).to_string(),
            header_line(PEAK_MS - 1_000, "deepseek-official", "deepseek-flash"),
            usage_line(PEAK_MS, 1_000, 0, 1_000),
        ];
        fs::write(&target, multiframe(&lines)).unwrap();
        std::os::unix::fs::symlink(&target, session.join("session.v3.jsonl.zstd")).unwrap();
        // The log is not even listed: a symlink is not a regular file, and
        // the usage behind it must never be counted.
        let report = build_report(&home, 7, 0, PEAK_MS + 60_000);
        assert_eq!(report.sessions_scanned, 0);
        assert_eq!(report.today.tokens.calls, 0);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn balance_responses_are_normalised() {
        let body = r#"{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"82.58","granted_balance":"0.00","topped_up_balance":"82.58"}]}"#;
        let balance = parse_balance(body, 42).unwrap();
        assert!(balance.available);
        assert_eq!(balance.fetched_at, 42);
        assert_eq!(
            balance.balances,
            vec![BalanceEntry {
                currency: "CNY".to_string(),
                total: "82.58".to_string(),
                granted: "0.00".to_string(),
                topped_up: "82.58".to_string(),
            }]
        );
        assert!(parse_balance("not json", 0).is_err());
    }

    /// Manual cross-check against a real DSH home; never runs by default.
    #[test]
    #[ignore = "manual probe: set DSH_USAGE_PROBE_HOME to a real DSH home"]
    fn probe_real_home() {
        let Ok(home) = std::env::var("DSH_USAGE_PROBE_HOME") else {
            eprintln!("DSH_USAGE_PROBE_HOME is not set; nothing to probe");
            return;
        };
        let tz = std::env::var("DSH_USAGE_PROBE_TZ")
            .map(|value| value.parse().unwrap())
            .unwrap_or(0);
        let report = build_report(Path::new(&home), 30, tz, now_ms());
        println!("{}", serde_json::to_string(&report).unwrap());
    }
}
