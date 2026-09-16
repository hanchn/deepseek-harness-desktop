// dsh-usage-stats — host half.
//
// The browser half needs numbers that no session projection can answer: today's
// usage across every session on this machine, the all-time total, and the
// account balance. This half folds them into one read-only JSON route.
//
// Where the numbers come from (all local, all read-only):
//   * `<DSH_HOME>/sessions/<project>/<session>/session.v3.jsonl.zstd` — the
//     durable session logs. The Harness appends one zstd frame per event, and
//     every `assistant/message` event carries the provider-reported usage of one
//     billed attempt (cache-miss input, cache-hit input, output — output already
//     includes reasoning tokens).
//   * `<DSH_HOME>/.credentials.yaml` — read only to authenticate one balance
//     request. The key never leaves this process, is never logged, and is never
//     part of the response body.
//
// Spend is an estimate, not a bill: no endpoint returns a local bill, so calls
// are priced with the published Chinese rate card (CNY, the same currency the
// balance is denominated in) at the peak/off-peak window each call fell into. A
// model outside the card keeps its token counts and reports no cost at all,
// rather than a made-up zero.

import { appendFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

/** Cordis function-plugin name. */
export const name = "usage-stats";

/** The route carrier and the trust fence guarding the route. */
export const inject = ["webServer", "connection"];

/** Exact GET route serving the folded report. */
const REPORT_ROUTE = "/usage-stats/report";
/** POST route where the browser half records what it did. */
const CLIENT_LOG_ROUTE = "/usage-stats/log";
/** Bounded self-check log, kept next to the rest of the harness home. */
const CLIENT_LOG_MAX_BYTES = 64 * 1024;
const MAX_CLIENT_LOG_BODY = 4 * 1024;

/** zstd frame magic; session logs concatenate one frame per event. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
/** Largest single log this reader will buffer. */
const MAX_LOG_BYTES = 256 * 1024 * 1024;
/** Credential documents are tiny; anything larger is not ours. */
const MAX_CREDENTIAL_BYTES = 64 * 1024;
/** Balance is a network fact; one request per this window is plenty. */
const BALANCE_TTL_MS = 5 * 60 * 1000;
const BALANCE_TIMEOUT_MS = 15 * 1000;
/** Provider key name in the launch environment and in the credential store. */
const PROVIDER_KEY_NAME = "DEEPSEEK_API_KEY";
/** Official billing endpoint. */
const BALANCE_URL = "https://api.deepseek.com/user/balance";
/** Days of daily history the panel shows, today included. */
const HISTORY_DAYS = 14;
/** Usage events older than the session header belong to a seeded parent. */
const INHERITED_EVENT_SLACK_MS = 5000;

/**
 * Published per-million-token prices for one model, off-peak, in the currency
 * the balance is denominated in (the official Chinese card is quoted in CNY, so
 * no exchange rate is ever invented here).
 */
const RATE_CARD = [
  { model: "deepseek-flash", cacheHit: 0.02, cacheMiss: 1, output: 4 },
  { model: "deepseek-v4-pro", cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
];
/** Currency of both the rate card and the balance. */
const CURRENCY = "CNY";
/** Retired ids the provider still accepts at the same rate. */
const RATE_ALIASES = {
  "deepseek-v4-flash": "deepseek-flash",
  "deepseek-v4-flash-vision-exp": "deepseek-flash",
};
/** Peak hours are billed at twice the off-peak rate. */
const PEAK_MULTIPLIER = 2;
const PRICING_SOURCE_URL = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing";
const PRICING_SOURCE_DATE = "2026-09-16";

/** DSH_HOME as this host process sees it, with the documented fallback. */
function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv;
  return join(homedir(), ".dsh");
}

/** Rate for one model id, or null when the card does not cover it. */
function rateFor(model) {
  const candidate = String(model ?? "").trim().toLowerCase();
  if (candidate === "") return null;
  const alias = RATE_ALIASES[candidate];
  if (alias !== undefined) return rateFor(alias);
  for (const rate of RATE_CARD) {
    if (candidate === rate.model || candidate.startsWith(`${rate.model}-`)) return rate;
  }
  return null;
}

/**
 * Whether an instant is billed at the peak rate: UTC 01:00–04:00 and
 * 06:00–10:00, Monday through Friday (the same windows the Chinese card states
 * as Beijing time 09:00–12:00 and 14:00–18:00).
 */
function isPeak(timeMs) {
  const date = new Date(timeMs);
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = Monday
  if (weekday >= 5) return false;
  const hour = date.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

/** Cost of one call in the card's currency. */
function callCost(rate, peak, usage) {
  const million = 1_000_000;
  const multiplier = peak ? PEAK_MULTIPLIER : 1;
  // The provider bills no separate cache-write line: a write is a cache miss.
  return (
    multiplier *
    ((usage.uncachedInput / million) * rate.cacheMiss +
      (usage.cacheRead / million) * rate.cacheHit +
      (usage.cacheWrite / million) * rate.cacheMiss +
      (usage.output / million) * rate.output)
  );
}

/** Local day index (days since the epoch, in this host's timezone). */
function localDayIndex(timeMs) {
  return Math.floor((timeMs + -new Date(timeMs).getTimezoneOffset() * 60_000) / 86_400_000);
}

/** `YYYY-MM-DD` for a local day index. */
function formatDay(dayIndex) {
  const date = new Date(dayIndex * 86_400_000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Local-clock label for one UTC peak window, e.g. `09:00-12:00` at UTC+8. */
function localWindowLabel(startUtcHour, endUtcHour, offsetMinutes) {
  const label = (hour) => {
    const shifted = (((hour * 60 + offsetMinutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(shifted / 60)).padStart(2, "0")}:${String(shifted % 60).padStart(2, "0")}`;
  };
  return `${label(startUtcHour)}-${label(endUtcHour)}`;
}

/** First instant after `fromMs` whose peak/off-peak state differs. */
function nextPeakTransition(fromMs) {
  const current = isPeak(fromMs);
  const step = 60_000;
  const limit = fromMs + 8 * 24 * 60 * 60 * 1000;
  for (let at = Math.floor(fromMs / step) * step + step; at <= limit; at += step) {
    if (isPeak(at) !== current) return { at, toPeak: !current };
  }
  return null;
}

/**
 * Decode a concatenated-frame session log. A torn frame is skipped rather than
 * failing the whole log: losing one event beats losing today's usage.
 */
function decodeFrames(buffer) {
  let text = "";
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(ZSTD_MAGIC, offset);
    if (start === -1) break;
    const nextMagic = buffer.indexOf(ZSTD_MAGIC, start + ZSTD_MAGIC.length);
    const end = nextMagic === -1 ? buffer.length : nextMagic;
    try {
      text += zstdDecompressSync(buffer.subarray(start, end)).toString("utf8");
    } catch {
      offset = start + 1;
      continue;
    }
    offset = end;
  }
  return text;
}

/** An empty per-model bucket. */
function emptyBucket() {
  return {
    calls: 0,
    uncachedInput: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    reasoning: 0,
    cost: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
  };
}

/** Add one bucket into another, field by field. */
function addBucket(into, bucket) {
  into.calls += bucket.calls;
  into.uncachedInput += bucket.uncachedInput;
  into.cacheRead += bucket.cacheRead;
  into.cacheWrite += bucket.cacheWrite;
  into.output += bucket.output;
  into.reasoning += bucket.reasoning;
  into.cost += bucket.cost;
  into.pricedCalls += bucket.pricedCalls;
  into.unpricedCalls += bucket.unpricedCalls;
}

/** Detached totals: `total` tokens and a priced-only `cost`. */
function finish(sum) {
  return {
    ...sum,
    total: sum.uncachedInput + sum.cacheRead + sum.cacheWrite + sum.output,
    cost: sum.pricedCalls > 0 ? sum.cost : null,
  };
}

/**
 * Fold one decoded log into per-day, per-model buckets keyed by day index and
 * then by `provider/model`.
 */
function foldLog(text, into) {
  let provider = "";
  let model = "";
  let stepTimeMs = null;
  let createdAtMs = null;

  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    switch (event?.type) {
      case "session":
        if (typeof event.createdAt === "number") createdAtMs = event.createdAt;
        break;
      case "request/header": {
        const config = event.data?.header?.config;
        if (typeof config?.provider === "string" && config.provider !== "") provider = config.provider;
        if (typeof config?.model === "string" && config.model !== "") model = config.model;
        break;
      }
      case "request/context":
        if (typeof event.data?.provider === "string" && event.data.provider !== "") provider = event.data.provider;
        if (typeof event.data?.model === "string" && event.data.model !== "") model = event.data.model;
        break;
      case "step/start":
        if (typeof event.time === "number") stepTimeMs = event.time;
        break;
      case "assistant/message": {
        const usage = event.data?.usage;
        if (usage === undefined || usage === null) break;
        const timeMs = stepTimeMs ?? event.time;
        if (typeof timeMs !== "number") break;
        // Replayed events from a seeded parent predate this session's creation.
        if (createdAtMs !== null && timeMs + INHERITED_EVENT_SLACK_MS < createdAtMs) break;
        const dayIndex = localDayIndex(timeMs);
        if (!into.has(dayIndex)) into.set(dayIndex, new Map());
        const byModel = into.get(dayIndex);
        const key = `${provider || "unknown"}/${model || "unknown"}`;
        const bucket = byModel.get(key) ?? emptyBucket();
        const tokens = {
          uncachedInput: Number(usage.inputTokens) || 0,
          cacheRead: Number(usage.cacheReadTokens) || 0,
          cacheWrite: Number(usage.cacheWriteTokens) || 0,
          output: Number(usage.outputTokens) || 0,
        };
        bucket.calls += 1;
        bucket.uncachedInput += tokens.uncachedInput;
        bucket.cacheRead += tokens.cacheRead;
        bucket.cacheWrite += tokens.cacheWrite;
        bucket.output += tokens.output;
        bucket.reasoning += Number(usage.reasoningTokens) || 0;
        const rate = rateFor(model);
        if (rate === null) {
          bucket.unpricedCalls += 1;
        } else {
          bucket.cost += callCost(rate, isPeak(timeMs), tokens);
          bucket.pricedCalls += 1;
        }
        byModel.set(key, bucket);
        break;
      }
      default:
        break;
    }
  }
}

/** Every session log on this machine, newest last. Symlinks are never followed. */
function sessionLogPaths(sessionsRoot) {
  const paths = [];
  let projects;
  try {
    projects = readdirSync(sessionsRoot, { withFileTypes: true });
  } catch {
    return paths;
  }
  for (const project of projects) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue;
    const projectPath = join(sessionsRoot, project.name);
    let sessions;
    try {
      sessions = readdirSync(projectPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory() || session.isSymbolicLink()) continue;
      const directory = join(projectPath, session.name);
      for (const candidate of ["session.v3.jsonl.zstd", "session.jsonl.zstd"]) {
        const file = join(directory, candidate);
        let stats;
        try {
          stats = statSync(file);
        } catch {
          continue;
        }
        if (!stats.isFile()) break;
        paths.push({ file, mtimeMs: stats.mtimeMs, size: stats.size });
        break;
      }
    }
  }
  return paths;
}

/** Per-file fold cache: a log is decoded again only when it actually changed. */
const fileCache = new Map();

/** Fold one log, reusing the cached fold while its mtime and size are stable. */
function foldFile(entry) {
  const cached = fileCache.get(entry.file);
  if (cached !== undefined && cached.mtimeMs === entry.mtimeMs && cached.size === entry.size) {
    return cached;
  }
  let byDay = new Map();
  let unreadable = false;
  try {
    if (entry.size <= MAX_LOG_BYTES) {
      foldLog(decodeFrames(readFileSync(entry.file)), byDay);
    } else {
      unreadable = true;
    }
  } catch {
    unreadable = true;
    byDay = new Map();
  }
  const record = { mtimeMs: entry.mtimeMs, size: entry.size, byDay, unreadable };
  fileCache.set(entry.file, record);
  return record;
}

/** Per-model rows sorted by tokens, from a `provider/model` bucket map. */
function modelRows(byModel) {
  return [...byModel.entries()]
    .map(([key, bucket]) => {
      const separator = key.indexOf("/");
      return {
        provider: key.slice(0, separator),
        model: key.slice(separator + 1),
        ...bucket,
        total: bucket.uncachedInput + bucket.cacheRead + bucket.cacheWrite + bucket.output,
        cost: bucket.pricedCalls > 0 ? bucket.cost : null,
      };
    })
    .sort((left, right) => right.total - left.total || left.model.localeCompare(right.model));
}

/**
 * The whole local picture: today, the all-time total, the daily history, and
 * the peak-window clock. Every log is read at most once per change.
 */
function usageReport() {
  const now = Date.now();
  const today = localDayIndex(now);
  const offsetMinutes = -new Date(now).getTimezoneOffset();
  const logs = sessionLogPaths(join(dshHome(), "sessions"));

  const dayTotals = (dayIndex) => {
    const sum = emptyBucket();
    for (const entry of logs) {
      const byModel = foldFile(entry).byDay.get(dayIndex);
      if (byModel === undefined) continue;
      for (const bucket of byModel.values()) addBucket(sum, bucket);
    }
    return finish(sum);
  };

  const todayModels = new Map();
  const cumulative = emptyBucket();
  const cumulativeModels = new Map();
  let unreadableLogs = 0;

  for (const entry of logs) {
    const record = foldFile(entry);
    if (record.unreadable) unreadableLogs += 1;
    for (const [dayIndex, byModel] of record.byDay) {
      for (const [key, bucket] of byModel) {
        addBucket(cumulative, bucket);
        if (!cumulativeModels.has(key)) cumulativeModels.set(key, emptyBucket());
        addBucket(cumulativeModels.get(key), bucket);
        if (dayIndex !== today) continue;
        if (!todayModels.has(key)) todayModels.set(key, emptyBucket());
        addBucket(todayModels.get(key), bucket);
      }
    }
  }

  const history = [];
  for (let day = today - HISTORY_DAYS + 1; day <= today; day += 1) {
    history.push({ day: formatDay(day), ...dayTotals(day) });
  }

  return {
    generatedAt: now,
    day: formatDay(today),
    peak: isPeak(now),
    peakWindowsLocal: [
      localWindowLabel(1, 4, offsetMinutes),
      localWindowLabel(6, 10, offsetMinutes),
    ],
    nextTransition: nextPeakTransition(now),
    sessionsScanned: logs.length,
    unreadableLogs,
    today: finish(todayModels.size === 0 ? emptyBucket() : [...todayModels.values()].reduce((sum, bucket) => (addBucket(sum, bucket), sum), emptyBucket())),
    models: modelRows(todayModels),
    cumulative: finish(cumulative),
    cumulativeModels: modelRows(cumulativeModels),
    history,
    pricing: {
      currency: CURRENCY,
      units: "per 1M tokens",
      peakMultiplier: PEAK_MULTIPLIER,
      peakWindowsUtc: ["01:00-04:00", "06:00-10:00"],
      sourceUrl: PRICING_SOURCE_URL,
      sourceDate: PRICING_SOURCE_DATE,
      models: RATE_CARD,
    },
  };
}

/**
 * Extract one reference value from the credential document.
 *
 * The store is a versioned document with `refs:`/`records:` sections; its
 * pre-release shape was a flat mapping at column zero. Only a plain single-line
 * scalar is accepted — a block scalar is refused rather than guessed at, because
 * a wrong value would silently send the wrong credential.
 */
export function credentialValue(text, wanted) {
  const scalar = (value) => {
    const trimmed = String(value ?? "").trim();
    if (trimmed === "" || /^[|>&*!%@`]/.test(trimmed)) return null;
    const quote = trimmed[0];
    if (quote === '"' || quote === "'") {
      if (trimmed.length < 2 || !trimmed.endsWith(quote)) return null;
      const inner = trimmed.slice(1, -1);
      return inner.includes(quote) || inner === "" ? null : inner;
    }
    return trimmed;
  };

  let section = null;
  let versioned = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indented = line.startsWith(" ") || line.startsWith("\t");
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!indented) {
      if (key === "version") {
        versioned = true;
        continue;
      }
      if (value === "" && (key === "refs" || key === "records")) {
        section = key;
        continue;
      }
      if (key === wanted && !versioned) return scalar(value);
      section = null;
      continue;
    }
    if (section !== "refs") continue;
    if (key === wanted) return scalar(value);
  }
  return null;
}

/** The provider key: the launch environment wins, exactly like the Harness. */
function providerKey() {
  const fromEnv = process.env[PROVIDER_KEY_NAME];
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv;
  const file = join(dshHome(), ".credentials.yaml");
  try {
    const stats = statSync(file);
    if (!stats.isFile() || stats.size > MAX_CREDENTIAL_BYTES) return null;
    return credentialValue(readFileSync(file, "utf8"), PROVIDER_KEY_NAME);
  } catch {
    return null;
  }
}

/** Last balance outcome, so the provider is asked at most once per window. */
let balanceCache = null;

/** One balance attempt, reduced to data the browser may see. */
async function fetchBalance() {
  const key = providerKey();
  if (key === null) return { error: "no-credential", entries: [], available: null };
  let response;
  try {
    response = await fetch(BALANCE_URL, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      error: error?.name === "TimeoutError" ? "timeout" : "unavailable",
      entries: [],
      available: null,
    };
  }
  if (response.status === 401 || response.status === 403) {
    return { error: "key-rejected", entries: [], available: null };
  }
  if (!response.ok) return { error: `http-${response.status}`, entries: [], available: null };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { error: "invalid-response", entries: [], available: null };
  }
  const infos = Array.isArray(payload?.balance_infos) ? payload.balance_infos : null;
  if (infos === null) return { error: "invalid-response", entries: [], available: null };
  return {
    error: null,
    available: payload?.is_available === true,
    entries: infos.map((info) => ({
      currency: String(info?.currency ?? ""),
      total: String(info?.total_balance ?? ""),
      granted: String(info?.granted_balance ?? ""),
      toppedUp: String(info?.topped_up_balance ?? ""),
    })),
  };
}

/** Cached balance, refreshed at most once per window. */
async function balance() {
  const now = Date.now();
  if (balanceCache !== null && now - balanceCache.at < BALANCE_TTL_MS) return balanceCache;
  balanceCache = { at: now, ...(await fetchBalance()) };
  return balanceCache;
}

/** JSON response; every field here is live and cached only briefly. */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

/** The whole report: the local fold plus the cached balance. */
async function report() {
  const account = await balance();
  return {
    ...usageReport(),
    balance: {
      at: account.at ?? null,
      available: account.available ?? null,
      error: account.error ?? null,
      entries: account.entries ?? [],
    },
  };
}

export function apply(ctx) {
  const connectionOf = () => Reflect.get(ctx, "connection");

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: REPORT_ROUTE,
        handler: async (req, res) => {
          // The same Host/Origin fence and browser-auth cookie as every shipped
          // route: an untrusted page must not read local usage.
          const rejection = connectionOf().requestRejection(req);
          if (rejection !== undefined) {
            res.statusCode = rejection;
            res.end();
            return;
          }
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("allow", "GET");
            res.end();
            return;
          }
          try {
            sendJson(res, 200, await report());
          } catch (error) {
            sendJson(res, 500, {
              error: "report-failed",
              message: String(error?.message ?? error),
            });
          }
        },
      }),
    `usage-stats: GET ${REPORT_ROUTE}`,
  );

  // The browser half posts short status lines here. Without it a client-side
  // failure is invisible from the terminal: the row simply never behaves.
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: CLIENT_LOG_ROUTE,
        handler: async (req, res) => {
          const rejection = connectionOf().requestRejection(req);
          if (rejection !== undefined) {
            res.statusCode = rejection;
            res.end();
            return;
          }
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("allow", "POST");
            res.end();
            return;
          }
          let text = "";
          let size = 0;
          let tooLarge = false;
          for await (const chunk of req) {
            size += chunk.byteLength;
            if (size > MAX_CLIENT_LOG_BODY) {
              tooLarge = true;
              req.resume();
              break;
            }
            text += chunk.toString("utf8");
          }
          if (tooLarge) {
            sendJson(res, 413, { error: "payload-too-large" });
            return;
          }
          try {
            const file = join(dshHome(), "usage-stats-client.log");
            const existing = statSync(file, { throwIfNoEntry: false });
            if (existing !== undefined && existing.size > CLIENT_LOG_MAX_BYTES) writeFileSync(file, "");
            appendFileSync(file, `${new Date().toISOString()} ${text.trim()}\n`);
            sendJson(res, 200, { ok: true });
          } catch (error) {
            sendJson(res, 500, { error: "log-failed", message: String(error?.message ?? error) });
          }
        },
      }),
    `usage-stats: POST ${CLIENT_LOG_ROUTE}`,
  );
}

/** Test seam for the pure pieces. */
export const __internals = { credentialValue, rateFor, isPeak, decodeFrames, foldLog };
