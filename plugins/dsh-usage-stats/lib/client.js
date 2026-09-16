// dsh-usage-stats — browser half.
//
// Adds one row under the composer (`conversation.composer.dock`, the stats line
// area) showing today's spend and the account balance, and opens a detail panel
// when it is clicked.
//
// Refresh policy: no timer. The figures are read once when the row mounts and
// again whenever the session changes — entering a conversation, or starting a
// new one, is the refresh trigger. Opening the detail panel refreshes too, and
// the panel carries its own refresh button.
//
// Placement note: that slot renders its entries as stacked rows in a column, so
// this row simply *is* a row under the composer. No absolute positioning, no
// negative margins and no upstream class names are involved — the arrangement
// follows from the slot itself.

window.__ModuleLoader__.load({
  id: "dsh-usage-stats",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const { useEffect, useState } = React;
    const h = React.createElement;

    /** Plugin namespace, also the style-tag id. */
    const NS = "usage-stats";
    /** Host route serving the folded report. */
    const REPORT_URL = "/usage-stats/report";
    /** Host route recording what this half did, for terminal-side diagnosis. */
    const LOG_URL = "/usage-stats/log";

    const CSS = `
.usage-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2px calc(var(--dsh-composer-side-clearance, 16px) + 16px) 4px;
  border: none;
  background: none;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
}
.usage-row:hover {
  color: var(--dsw-alias-label-secondary, #a6a6a6);
}
.usage-row-label {
  opacity: 0.85;
}
.usage-row-value {
  color: var(--dsw-alias-label-secondary, #a6a6a6);
}
.usage-card {
  /* In normal flow under the row: no fixed positioning, no overlay, so no
     ancestor's clipping or stacking context can hide it. */
  width: min(560px, 100%);
  max-height: min(40vh, 420px);
  margin: 0 auto 6px;
  overflow: auto;
  padding: 12px 14px 10px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #2a2a2a);
  color: var(--dsw-alias-label-secondary, #a6a6a6);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  cursor: default;
}
.usage-card h4 {
  margin: 14px 0 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.usage-card h4:first-child { margin-top: 0; }
.usage-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.usage-head-spacer { margin-left: auto; }
.usage-btn {
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  border-radius: 6px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.usage-btn:hover { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.usage-pill {
  padding: 1px 8px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  border-radius: 999px;
  font-size: 11px;
}
.usage-pill[data-peak="true"] {
  color: var(--dsw-alias-label-warning, #d29922);
  border-color: currentColor;
}
.usage-line {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 8px;
  padding: 3px 0;
  border-top: 1px solid var(--dsw-alias-border-l1, #ffffff12);
}
.usage-line:first-of-type { border-top: none; }
.usage-line-key { color: var(--dsw-alias-label-tertiary, #8c8c8c); }
.usage-line-value {
  color: var(--dsw-alias-label-primary, #f5f5f5);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  text-align: right;
}
.usage-day {
  display: grid;
  grid-template-columns: 52px 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 2px 0;
}
.usage-day[data-today="true"] .usage-line-value { color: var(--dsw-alias-label-primary, #f5f5f5); }
.usage-day-bar {
  height: 5px;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  overflow: hidden;
}
.usage-day-bar > i {
  display: block;
  height: 100%;
  background: var(--dsw-alias-brand-primary, #4d6bfe);
  opacity: 0.75;
}
.usage-note {
  margin-top: 10px;
  font-size: 10px;
  opacity: 0.7;
}
`;

    /** Fallback labels when the frame hands us no translator for our namespace. */
    const LABELS = {
      zh: {
        spendToday: "今日花费",
        balance: "余量",
        detail: "用量明细",
        refresh: "刷新",
        close: "关闭",
        loading: "加载中…",
        today: "今日用量",
        todaySplit: "今日构成",
        cumulative: "历史累积",
        peakHours: "高峰时段",
        peakNow: "高峰计价中",
        offPeakNow: "低谷计价",
        nextAt: "下次切换",
        toPeak: "转高峰",
        toOffPeak: "转低谷",
        calls: "次调用",
        tokens: "Token",
        spend: "花费",
        inputMiss: "未命中缓存",
        inputHit: "命中缓存",
        output: "输出",
        modelsToday: "今日按模型",
        modelsAll: "累积按模型",
        history: "历史用量",
        days: "天",
        granted: "赠送",
        toppedUp: "充值",
        estimate: "花费按官方价估算",
        unpriced: "次未计价",
        empty: "暂无用量",
        noCredential: "未配置 API Key",
        keyRejected: "Key 被服务商拒绝",
        timeout: "余量查询超时",
        unavailable: "余量服务不可达",
        invalid: "余量返回异常",
      },
      en: {
        spendToday: "Today",
        balance: "Balance",
        detail: "Usage detail",
        refresh: "Refresh",
        close: "Close",
        loading: "Loading…",
        today: "Today",
        todaySplit: "Today's split",
        cumulative: "All-time",
        peakHours: "Peak windows",
        peakNow: "peak pricing",
        offPeakNow: "off-peak",
        nextAt: "Next change",
        toPeak: "to peak",
        toOffPeak: "to off-peak",
        calls: "calls",
        tokens: "Tokens",
        spend: "Spend",
        inputMiss: "cache miss",
        inputHit: "cache hit",
        output: "output",
        modelsToday: "Today by model",
        modelsAll: "All-time by model",
        history: "Daily history",
        days: "days",
        granted: "granted",
        toppedUp: "topped up",
        estimate: "spend estimated from the published rate card",
        unpriced: "unpriced",
        empty: "no usage yet",
        noCredential: "no API key configured",
        keyRejected: "the provider rejected the key",
        timeout: "balance request timed out",
        unavailable: "balance service unreachable",
        invalid: "balance response unrecognised",
      },
    };

    const isZh = () => /^zh/i.test(String(navigator?.language ?? ""));
    const localeTag = () => (isZh() ? "zh-CN" : "en");

    /** Fire-and-forget status line; diagnostics must never break the row. */
    function report(detail, error) {
      try {
        void fetch(LOG_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ detail, error: error === undefined || error === null ? null : String(error) }),
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    }

    /** Labels: the frame translator when it knows us, our table always. */
    function labels(t) {
      const dict = isZh() ? LABELS.zh : LABELS.en;
      return (key, values) => {
        if (typeof t === "function") {
          try {
            const translated = t(`${NS}.${key}`, values);
            if (typeof translated === "string" && translated !== `${NS}.${key}`) return translated;
          } catch {
            /* fall through to the table */
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
      let element = document.querySelector(`style[data-plugin-css="${tagId}"]`);
      if (element === null) {
        element = document.createElement("style");
        element.dataset.plugin = NS;
        element.dataset.pluginCss = tagId;
        document.head.appendChild(element);
      }
      element.textContent = CSS;
    }

    function formatExact(value) {
      if (!Number.isFinite(value)) return "—";
      return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 0 }).format(value);
    }

    /** Money in the account's currency; an unpriced model is `—`, never `¥0.00`. */
    function formatCost(amount) {
      if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
      const digits = amount === 0 ? 2 : amount < 0.01 ? 6 : amount < 1 ? 4 : 2;
      return `¥${new Intl.NumberFormat(localeTag(), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(amount)}`;
    }

    function formatClock(timeMs) {
      const at = new Date(timeMs);
      if (Number.isNaN(at.getTime())) return "—";
      const time = at.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", hour12: false });
      return at.toDateString() === new Date().toDateString()
        ? time
        : `${at.toLocaleDateString(localeTag(), { month: "2-digit", day: "2-digit" })} ${time}`;
    }

    const BALANCE_ERRORS = {
      "no-credential": "noCredential",
      "key-rejected": "keyRejected",
      timeout: "timeout",
      unavailable: "unavailable",
      "invalid-response": "invalid",
    };

    /** Balance as text, or null when there is nothing to show. */
    function balanceText(report, t) {
      const account = report?.balance;
      if (account === undefined || account === null) return null;
      if (account.error !== null && account.error !== undefined) {
        return t(BALANCE_ERRORS[account.error] ?? "unavailable");
      }
      const entries = Array.isArray(account.entries) ? account.entries : [];
      if (entries.length === 0) return null;
      return entries.map((entry) => `${entry.total} ${entry.currency}`).join(" · ");
    }

    /**
     * The report, refreshed on mount and whenever the session changes — no
     * timer. `sessionId` is undefined for a fresh conversation until it is
     * created, which is itself a change and refreshes again.
     */
    function useReport(sessionId) {
      const [report, setReport] = useState(null);
      const [failed, setFailed] = useState(false);
      const [busy, setBusy] = useState(false);
      const [revision, setRevision] = useState(0);

      useEffect(() => {
        let alive = true;
        setBusy(true);
        const read = async () => {
          try {
            const response = await fetch(REPORT_URL, { headers: { accept: "application/json" } });
            if (!response.ok) throw new Error(`route answered ${response.status}`);
            const payload = await response.json();
            if (alive) {
              setReport(payload);
              setFailed(false);
              report(`report ok day=${payload?.day ?? "?"} today=${payload?.today?.total ?? "?"} balance=${payload?.balance?.entries?.[0]?.total ?? "?"}`);
            }
          } catch (error) {
            if (alive) setFailed(true);
            report("report failed", error);
          } finally {
            if (alive) setBusy(false);
          }
        };
        void read();
        return () => {
          alive = false;
        };
      }, [sessionId, revision]);

      return { report, failed, busy, reload: () => setRevision((value) => value + 1) };
    }

    /** One labelled line of the detail card. */
    function line(key, value) {
      return h(
        "div",
        { className: "usage-line", key },
        h("span", { className: "usage-line-key" }, key),
        h("span", { className: "usage-line-value" }, value),
      );
    }

    /** The detail card: today, all-time, peak window, balance, models, history. */
    function Detail({ report, t, busy, onRefresh, onClose }) {
      const today = report.today ?? {};
      const cumulative = report.cumulative ?? {};
      const account = report.balance ?? {};
      const entries = Array.isArray(account.entries) ? account.entries : [];
      const models = Array.isArray(report.models) ? report.models : [];
      const cumulativeModels = Array.isArray(report.cumulativeModels) ? report.cumulativeModels : [];
      const history = [...(report.history ?? [])].reverse();
      const busiest = history.reduce((max, day) => Math.max(max, day.total ?? 0), 0);
      const transition = report.nextTransition ?? null;

      const sections = [];

      sections.push(
        h(
          "div",
          { className: "usage-head", key: "head" },
          h("h4", null, t("detail")),
          h("span", { className: "usage-pill" }, report.day ?? ""),
          h(
            "span",
            {
              className: "usage-pill",
              "data-peak": report.peak === true ? "true" : "false",
            },
            report.peak === true ? t("peakNow") : t("offPeakNow"),
          ),
          h("span", { className: "usage-head-spacer" }),
          h("button", { className: "usage-btn", type: "button", onClick: onRefresh, disabled: busy }, t("refresh")),
          h("button", { className: "usage-btn", type: "button", onClick: onClose }, "✕"),
        ),
      );

      sections.push(h("h4", { key: "today-head" }, t("today")));
      sections.push(
        line(
          t("today"),
          `${formatExact(today.total ?? 0)} ${t("tokens")} · ${formatExact(today.calls ?? 0)} ${t("calls")} · ${formatCost(today.cost ?? null)}`,
        ),
      );
      sections.push(
        line(
          t("todaySplit"),
          `${t("inputMiss")} ${formatExact(today.uncachedInput ?? 0)} · ${t("inputHit")} ${formatExact(today.cacheRead ?? 0)} · ${t("output")} ${formatExact(today.output ?? 0)}`,
        ),
      );

      sections.push(h("h4", { key: "cumulative-head" }, t("cumulative")));
      sections.push(
        line(
          t("cumulative"),
          `${formatExact(cumulative.total ?? 0)} ${t("tokens")} · ${formatExact(cumulative.calls ?? 0)} ${t("calls")} · ${formatCost(cumulative.cost ?? null)}`,
        ),
      );

      sections.push(h("h4", { key: "peak-head" }, t("peakHours")));
      sections.push(
        line(
          t("peakHours"),
          `${(report.peakWindowsLocal ?? []).join(" / ")} · ${t("nextAt")} ${transition === null ? "—" : formatClock(transition.at)} (${transition?.toPeak === true ? t("toPeak") : t("toOffPeak")})`,
        ),
      );

      sections.push(h("h4", { key: "balance-head" }, t("balance")));
      if (entries.length === 0) {
        sections.push(line(t("balance"), balanceText(report, t) ?? t("empty")));
      } else {
        for (const entry of entries) {
          sections.push(
            line(
              `${t("balance")} ${entry.currency}`,
              `${entry.total} · ${t("granted")} ${entry.granted} · ${t("toppedUp")} ${entry.toppedUp}`,
            ),
          );
        }
      }

      if (models.length > 0) {
        sections.push(h("h4", { key: "models-head" }, t("modelsToday")));
        for (const row of models) {
          const unpriced = (row.unpricedCalls ?? 0) > 0 ? ` (${row.unpricedCalls} ${t("unpriced")})` : "";
          sections.push(
            line(
              `model-${row.model}`,
              `${row.model} · ${formatExact(row.total)} ${t("tokens")} · ${formatExact(row.calls)} ${t("calls")} · ${formatCost(row.cost)}${unpriced}`,
            ),
          );
        }
      }
      if (cumulativeModels.length > 0) {
        sections.push(h("h4", { key: "cumulative-models-head" }, t("modelsAll")));
        for (const row of cumulativeModels) {
          sections.push(
            line(
              `cumodel-${row.model}`,
              `${row.model} · ${formatExact(row.total)} ${t("tokens")} · ${formatCost(row.cost)}`,
            ),
          );
        }
      }

      sections.push(h("h4", { key: "history-head" }, `${t("history")} · ${history.length} ${t("days")}`));
      for (const day of history) {
        const share = busiest > 0 ? Math.min(100, Math.max(0, ((day.total ?? 0) / busiest) * 100)) : 0;
        sections.push(
          h(
            "div",
            { className: "usage-day", key: `day-${day.day}`, "data-today": day.day === report.day ? "true" : "false" },
            h("span", { className: "usage-line-key" }, String(day.day ?? "").slice(5)),
            h("span", { className: "usage-day-bar" }, h("i", { style: `width:${share}%` })),
            h("span", { className: "usage-line-value" }, day.total > 0 ? formatExact(day.total) : "—"),
            h("span", { className: "usage-line-value" }, formatCost(day.cost)),
          ),
        );
      }

      sections.push(
        h(
          "div",
          { className: "usage-note", key: "note" },
          `${t("estimate")} · ${report.pricing?.currency ?? "CNY"} ${report.pricing?.units ?? "per 1M tokens"} · ${report.pricing?.sourceDate ?? ""}`,
        ),
      );

      return h("div", { className: "usage-card" }, sections);
    }

    /**
     * The row under the composer. `sessionId` and `t` arrive from the slot kit.
     */
    function UsageStats(props) {
      const t = labels(typeof props?.t === "function" ? props.t : null);
      const { report, failed, busy, reload } = useReport(props?.sessionId);
      const [open, setOpen] = useState(false);

      // Opening the panel is also a refresh, so the detail is never stale.
      useEffect(() => {
        if (open) reload();
      }, [open]);

      // Escape closes the panel.
      useEffect(() => {
        if (!open || typeof window === "undefined") return undefined;
        const onKey = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [open]);

      const today = report?.today ?? null;
      const balance = report === null ? null : balanceText(report, t);

      const row = h(
        "button",
        {
          type: "button",
          className: "usage-row",
          onClick: () => {
            setOpen(true);
            report("row clicked");
          },
          title: report === null ? REPORT_URL : `${t("detail")} — ${t("spendToday")} ${formatCost(today?.cost ?? null)} · ${t("balance")} ${balance ?? "—"}`,
        },
        [
          h("span", { key: "label", className: "usage-row-label" }, t("spendToday")),
          h("span", { key: "amount", className: "usage-row-value" }, busy && report === null ? t("loading") : formatCost(today?.cost ?? null)),
          h("span", { key: "sep", className: "usage-row-label" }, "·"),
          h("span", { key: "balanceLabel", className: "usage-row-label" }, t("balance")),
          h("span", { key: "balance", className: "usage-row-value" }, balance ?? "—"),
        ],
      );

      if (!open || report === null) {
        // A failed first read still leaves the row clickable, so the panel can
        // report the failure itself.
        return row;
      }

      const card = h(
        "div",
        { className: "usage-backdrop", onClick: () => setOpen(false) },
        h(Detail, { report, t, busy, onRefresh: reload, onClose: () => setOpen(false) }),
      );
      try {
        return h(React.Fragment, null, row, card);
      } catch (error) {
        report("detail render failed", error);
        return h(
          React.Fragment,
          null,
          row,
          h("div", { className: "usage-card" }, `${t("detail")} — ${String(error?.message ?? error)}`),
        );
      }
    }

    const inject = ["slots"];

    async function apply(ctx) {
      injectStyles();
      // `conversation.composer.dock` renders its entries as stacked rows under
      // the composer, which is exactly where this row belongs.
      ctx.slots.inject("conversation.composer.dock", () =>
        ctx.slots.register(
          {
            name: "conversation.composer.dock",
            id: "usage-stats",
            order: 20,
          },
          UsageStats,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    exports.UsageStats = UsageStats;
    return module.exports;
  },
});
