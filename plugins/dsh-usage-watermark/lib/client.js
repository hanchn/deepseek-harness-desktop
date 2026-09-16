// dsh-usage-watermark — browser half.
//
// Occupies the frame-wide floating layer (`shell.overlay`): a quiet usage badge
// in the window corner, above every column and outside their scroll containers,
// so it stays put while the conversation scrolls. The layer itself is
// click-through; only the badge and its panel opt back into pointer events.
//
// Two data paths, deliberately:
//   * the *current session's* live usage comes from the host-computed
//     `tokenUsage` projection through `useSessions` — no polling, it ticks as
//     the turn runs;
//   * everything machine-wide (today's totals, the daily history, the account
//     balance, the peak-window clock) comes from this plugin's own host route
//     `GET /usage-watermark/report`, polled every 15s. Projections are per
//     session, so only the host can answer "today".
//
// Root-scope slots do not receive `useProjection`; `useSessions` with the
// session list's cached `projectionValues` is the documented path there.

window.__ModuleLoader__.load({
  id: "dsh-usage-watermark",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const { useEffect, useMemo, useState } = React;
    const h = React.createElement;

    /** Plugin namespace, also the style-tag id. */
    const NS = "usage-watermark";
    /** Host route serving the folded report. */
    const REPORT_URL = "/usage-watermark/report";
    /** Refresh cadence for the host route; it is local and cached per file. */
    const POLL_MS = 15_000;

    const CSS = `
.usage-wm {
  position: fixed;
  right: 14px;
  bottom: 14px;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  font: 11px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #2a2a2a) 82%, transparent);
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.usage-wm[data-peak="true"] {
  box-shadow: inset 2px 0 0 0 var(--dsw-alias-label-warning, #d29922);
}
.usage-wm-live { color: var(--dsw-alias-label-secondary, #a6a6a6); }
.usage-wm-sep { opacity: 0.4; }

/* The panel is a small report, not a text dump: one section per question the
   reader asks (today / rate window / balance / models / history). */
.usage-panel {
  position: fixed;
  right: 14px;
  bottom: 42px;
  z-index: 61;
  width: min(430px, 92vw);
  max-height: min(70vh, 620px);
  overflow: auto;
  padding: 12px 14px 10px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  background: var(--dsw-alias-bg-layer-2, #2a2a2a);
  color: var(--dsw-alias-label-secondary, #a6a6a6);
  font: 11px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
}
.usage-panel h4 {
  margin: 12px 0 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.usage-panel h4:first-child { margin-top: 0; }
.usage-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.usage-panel-day { font-family: ui-monospace, Menlo, monospace; opacity: 0.75; }
.usage-pill {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  font-size: 10px;
}
.usage-pill[data-peak="true"] {
  color: var(--dsw-alias-label-warning, #d29922);
  border-color: currentColor;
}
.usage-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 8px 0 2px;
}
.usage-metric {
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #ffffff12);
  background: color-mix(in srgb, currentColor 5%, transparent);
}
.usage-metric b {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #f5f5f5);
}
.usage-metric span { font-size: 10px; opacity: 0.75; }
.usage-split { margin-top: 6px; opacity: 0.8; }
.usage-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: baseline;
  padding: 3px 0;
  border-top: 1px solid var(--dsw-alias-border-l1, #ffffff12);
}
.usage-row:first-of-type { border-top: none; }
.usage-row-model { font-family: ui-monospace, Menlo, monospace; }
.usage-num { font-family: ui-monospace, Menlo, monospace; text-align: right; }
.usage-hist {
  display: grid;
  grid-template-columns: 46px 1fr 62px 58px;
  gap: 7px;
  align-items: center;
  padding: 2px 0;
}
.usage-hist[data-today="true"] { color: var(--dsw-alias-label-primary, #f5f5f5); }
.usage-hist-bar {
  height: 5px;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  overflow: hidden;
}
.usage-hist-bar > i {
  display: block;
  height: 100%;
  background: var(--dsw-alias-brand-primary, #4d6bfe);
  opacity: 0.75;
}
.usage-note { margin-top: 10px; font-size: 10px; opacity: 0.65; }
`;

    /** Fallback labels when the frame hands us no translator for our namespace. */
    const LABELS = {
      zh: {
        today: "今日用量",
        tokens: "Token 总量",
        calls: "调用",
        spend: "花费估算",
        inputMiss: "未命中缓存",
        inputHit: "命中缓存",
        output: "输出",
        peakNow: "高峰计价中",
        offPeakNow: "低谷计价",
        peakHours: "高峰时段",
        nextAt: "下次切换",
        turningPeak: "转高峰",
        turningOffPeak: "转低谷",
        balance: "账户余量",
        granted: "赠送",
        toppedUp: "充值",
        models: "按模型",
        history: "历史用量",
        days: "天",
        session: "本会话",
        empty: "暂无用量",
        estimate: "花费按官方价估算",
        unpriced: "次未计价",
        noCredential: "未配置 API Key",
        keyRejected: "Key 被服务商拒绝",
        timeout: "余量查询超时",
        unavailable: "余量服务不可达",
        invalid: "余量返回异常",
      },
      en: {
        today: "Today",
        tokens: "Tokens",
        calls: "Calls",
        spend: "Est. spend",
        inputMiss: "cache miss",
        inputHit: "cache hit",
        output: "output",
        peakNow: "peak pricing",
        offPeakNow: "off-peak",
        peakHours: "Peak windows",
        nextAt: "Next change",
        turningPeak: "to peak",
        turningOffPeak: "to off-peak",
        balance: "Balance",
        granted: "granted",
        toppedUp: "topped up",
        models: "By model",
        history: "Daily history",
        days: "days",
        session: "session",
        empty: "no usage yet",
        estimate: "spend estimated from the published rate card",
        unpriced: "unpriced",
        noCredential: "no API key configured",
        keyRejected: "the provider rejected the key",
        timeout: "balance request timed out",
        unavailable: "balance service unreachable",
        invalid: "balance response unrecognised",
      },
    };

    const isZh = () => /^zh/i.test(String(navigator?.language ?? ""));
    const localeTag = () => (isZh() ? "zh-CN" : "en");

    function labels(t) {
      const dict = isZh() ? LABELS.zh : LABELS.en;
      return (key, values) => {
        if (typeof t === "function") {
          // A throw must never take the badge down; the local table is a floor.
          try {
            const translated = t(`${NS}.${key}`, values);
            if (typeof translated === "string" && translated !== `${NS}.${key}`) return translated;
          } catch {
            /* fall through */
          }
        }
        let text = dict[key] ?? key;
        for (const [name, value] of Object.entries(values ?? {})) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
        return text;
      };
    }

    function injectStyles() {
      if (typeof document === "undefined") return;
      const tagId = `${NS}/styles`;
      let el = document.querySelector(`style[data-plugin-css="${tagId}"]`);
      if (el === null) {
        el = document.createElement("style");
        // `data-plugin` is how the module system claims and removes this tag on
        // unload or hot replacement.
        el.dataset.plugin = NS;
        el.dataset.pluginCss = tagId;
        document.head.appendChild(el);
      }
      el.textContent = CSS;
    }

    /** Compact token count (`217571265` → `218M` / `2.18亿`). */
    function formatTokens(value) {
      if (!Number.isFinite(value)) return "—";
      return new Intl.NumberFormat(localeTag(), {
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(value);
    }

    function formatExact(value) {
      if (!Number.isFinite(value)) return "—";
      return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 0 }).format(value);
    }

    /** Estimated spend; an unpriced model must never render as `$0.00`. */
    function formatCost(usd) {
      if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
      const digits = usd === 0 ? 2 : usd < 0.01 ? 6 : usd < 1 ? 4 : 2;
      return `$${new Intl.NumberFormat(localeTag(), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(usd)}`;
    }

    /** `MM-DD HH:MM` on the reader's clock, or just the time when it is today. */
    function formatTransition(transition) {
      if (transition === null || transition === undefined) return "—";
      const at = new Date(transition.at);
      if (Number.isNaN(at.getTime())) return "—";
      const sameDay = at.toDateString() === new Date().toDateString();
      const time = at.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", hour12: false });
      if (sameDay) return time;
      const day = at.toLocaleDateString(localeTag(), { month: "2-digit", day: "2-digit" });
      return `${day} ${time}`;
    }

    const BALANCE_ERRORS = {
      "no-credential": "noCredential",
      "key-rejected": "keyRejected",
      timeout: "timeout",
      unavailable: "unavailable",
      "invalid-response": "invalid",
    };

    /** One metric tile. */
    function metric(label, value) {
      return h("div", { className: "usage-metric" }, h("b", null, value), h("span", null, label));
    }

    /** The expanded panel: today, rate window, balance, models, history. */
    function Panel({ report, t, live }) {
      const today = report.today ?? {};
      const dayMax = useMemo(
        () => (report.history ?? []).reduce((max, day) => Math.max(max, day.total ?? 0), 0),
        [report.history],
      );
      const balance = report.balance ?? {};
      const entries = Array.isArray(balance.entries) ? balance.entries : [];
      const balanceError = balance.error === null || balance.error === undefined
        ? null
        : t(BALANCE_ERRORS[balance.error] ?? "unavailable");
      const transition = report.nextTransition ?? null;

      const sections = [];

      sections.push(
        h(
          "div",
          { key: "head", className: "usage-panel-head" },
          h("h4", null, t("today")),
          h("span", { className: "usage-panel-day" }, report.day ?? ""),
        ),
      );
      sections.push(
        h(
          "div",
          { key: "metrics", className: "usage-metrics" },
          metric(t("tokens"), formatTokens(today.total ?? 0)),
          metric(t("calls"), formatExact(today.calls ?? 0)),
          metric(t("spend"), formatCost(today.costUsd ?? null)),
        ),
      );
      sections.push(
        h(
          "div",
          { key: "split", className: "usage-split" },
          `${t("inputMiss")} ${formatTokens(today.uncachedInput ?? 0)} · ${t("inputHit")} ${formatTokens(today.cacheRead ?? 0)} · ${t("output")} ${formatTokens(today.output ?? 0)}`,
          live === null ? null : ` · ${t("session")} ↑${formatTokens(live.billedInput)} ↓${formatTokens(live.output)}`,
        ),
      );

      // Rate window: now-state, the local windows, and when it flips.
      sections.push(h("h4", { key: "peakHead" }, t("peakHours")));
      sections.push(
        h(
          "div",
          { key: "peak", className: "usage-panel-head" },
          h(
            "span",
            { className: "usage-pill", "data-peak": report.peak === true ? "true" : "false" },
            report.peak === true ? t("peakNow") : t("offPeakNow"),
          ),
          h(
            "span",
            null,
            `${(report.peakWindowsLocal ?? []).join(" / ")} · ${t("nextAt")} ${formatTransition(transition)}${
              transition === null ? "" : ` (${transition.toPeak ? t("turningPeak") : t("turningOffPeak")})`
            }`,
          ),
        ),
      );

      sections.push(h("h4", { key: "balanceHead" }, t("balance")));
      if (balanceError !== null) {
        sections.push(h("div", { key: "balanceError" }, balanceError));
      } else if (entries.length === 0) {
        sections.push(h("div", { key: "balanceEmpty" }, t("empty")));
      } else {
        for (const entry of entries) {
          sections.push(
            h(
              "div",
              { key: `balance-${entry.currency}`, className: "usage-row" },
              h("span", { className: "usage-row-model" }, entry.currency),
              h("span", { className: "usage-num" }, `${t("granted")} ${entry.granted} · ${t("toppedUp")} ${entry.toppedUp}`),
              h("span", { className: "usage-num" }, entry.total),
            ),
          );
        }
      }

      const models = Array.isArray(report.models) ? report.models : [];
      if (models.length > 0) {
        sections.push(h("h4", { key: "modelsHead" }, t("models")));
        for (const row of models) {
          const unpriced = (row.unpricedCalls ?? 0) > 0 ? ` (${row.unpricedCalls} ${t("unpriced")})` : "";
          sections.push(
            h(
              "div",
              { key: `model-${row.provider}/${row.model}`, className: "usage-row" },
              h("span", { className: "usage-row-model" }, row.model),
              h("span", { className: "usage-num" }, `${formatTokens(row.total)} · ${formatExact(row.calls)} ${t("calls")}`),
              h("span", { className: "usage-num" }, `${formatCost(row.costUsd)}${unpriced}`),
            ),
          );
        }
      }

      const history = [...(report.history ?? [])].reverse();
      sections.push(h("h4", { key: "historyHead" }, `${t("history")} · ${history.length} ${t("days")}`));
      for (const day of history) {
        const share = dayMax > 0 ? Math.min(100, Math.max(0, ((day.total ?? 0) / dayMax) * 100)) : 0;
        sections.push(
          h(
            "div",
            {
              key: `day-${day.day}`,
              className: "usage-hist",
              "data-today": day.day === report.day ? "true" : "false",
            },
            h("span", { className: "usage-num" }, String(day.day ?? "").slice(5)),
            h("span", { className: "usage-hist-bar" }, h("i", { style: `width:${share}%` })),
            h("span", { className: "usage-num" }, day.total > 0 ? formatTokens(day.total) : "—"),
            h("span", { className: "usage-num" }, formatCost(day.costUsd)),
          ),
        );
      }

      const pricing = report.pricing ?? {};
      sections.push(
        h(
          "div",
          { key: "note", className: "usage-note" },
          `${t("estimate")} · ${pricing.currency ?? "USD"} ${pricing.units ?? "per 1M tokens"} · ${pricing.sourceDate ?? ""}`,
        ),
      );

      return h("div", { className: "usage-panel" }, sections);
    }

    /**
     * The badge. `useSessions` arrives from the root-scope slot kit; `t` is the
     * frame translator when present.
     */
    function UsageWatermark(props) {
      const t = labels(typeof props?.t === "function" ? props.t : null);
      const useSessions = props?.useSessions;
      const [report, setReport] = useState(null);
      const [failed, setFailed] = useState(false);
      const [open, setOpen] = useState(false);

      // Live, host-computed usage of the session on screen: no polling, no host
      // round trip. `projectionValues` is the object layer's copy of the
      // projection store.
      const live =
        typeof useSessions === "function"
          ? useSessions((state) => {
              const id = state?.current;
              const usage = id === undefined ? undefined : state?.byId?.[id]?.projectionValues?.tokenUsage;
              if (usage === undefined || usage === null) return null;
              return {
                billedInput:
                  (usage.uncachedInputTokens ?? 0) +
                  (usage.cacheReadTokens ?? 0) +
                  (usage.cacheWriteTokens ?? 0),
                output: usage.outputTokens ?? 0,
              };
            })
          : null;

      useEffect(() => {
        let alive = true;
        const read = async () => {
          try {
            const response = await fetch(REPORT_URL, { headers: { accept: "application/json" } });
            if (!response.ok) throw new Error(`route answered ${response.status}`);
            const payload = await response.json();
            if (alive) {
              setReport(payload);
              setFailed(false);
            }
          } catch {
            if (alive) setFailed(true);
          }
        };
        read();
        const timer = setInterval(read, POLL_MS);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, []);

      const today = report?.today ?? null;
      const balance = report === null ? null : (() => {
        const account = report.balance ?? {};
        if (account.error !== null && account.error !== undefined) {
          return t(BALANCE_ERRORS[account.error] ?? "unavailable");
        }
        const entries = Array.isArray(account.entries) ? account.entries : [];
        return entries.length === 0 ? null : entries.map((entry) => `${entry.total} ${entry.currency}`).join(" · ");
      })();

      const segments = [];
      segments.push(h("span", { key: "today" }, `${t("today")} ${report === null ? "—" : formatTokens(today?.total ?? 0)}`));
      if (report !== null) {
        segments.push(h("span", { key: "s1", className: "usage-wm-sep" }, "·"));
        segments.push(h("span", { key: "cost" }, formatCost(today?.costUsd ?? null)));
      }
      if (balance !== null) {
        segments.push(h("span", { key: "s2", className: "usage-wm-sep" }, "·"));
        segments.push(h("span", { key: "balance" }, `${t("balance")} ${balance}`));
      }
      if (live !== null) {
        segments.push(h("span", { key: "s3", className: "usage-wm-sep" }, "·"));
        segments.push(h("span", { key: "live", className: "usage-wm-live" }, `↑${formatTokens(live.billedInput)} ↓${formatTokens(live.output)}`));
      }

      const badge = h(
        "span",
        {
          className: "usage-wm",
          "data-peak": report?.peak === true ? "true" : "false",
          onClick: () => setOpen((value) => !value),
          title: report === null ? REPORT_URL : undefined,
        },
        segments,
      );
      if (!open) return badge;
      // A fragment, not a wrapping span: the panel is a block and must never
      // end up nested inside an inline element.
      if (report === null) {
        return h(
          React.Fragment,
          null,
          badge,
          h("div", { className: "usage-panel" }, failed ? REPORT_URL : t("empty")),
        );
      }
      return h(React.Fragment, null, badge, h(Panel, { report, t, live }));
    }

    const inject = ["slots"];

    async function apply(ctx) {
      injectStyles();
      // A fresh id on the frame-wide floating layer: additive, click-through,
      // and never replacing a shipped entry.
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "usage-watermark",
            order: 100,
          },
          UsageWatermark,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    exports.UsageWatermark = UsageWatermark;
    return module.exports;
  },
});
