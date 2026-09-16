// dsh-open-in-app-plus — browser half.
//
// One extra Session-header split button, registered *beside* the shipped
// "Open In..." control (that slot is an additive list, so the shipped entry
// stays exactly where it is). Its menu lists the custom catalog served by this
// package's host routes: the Trae / Qoder / Codex-desktop presets plus whatever
// the user adds to `$DSH_HOME/open-in-app.json`.
//
// Loaded through package.json's `dsh.client` declaration + exports["./client"].

window.__ModuleLoader__.load({
  id: "dsh-open-in-app-plus",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const NS = "open-in-app-plus";
    const ZH = {
      "button.title": "用其他工具打开工作区",
      "button.label": "其他工具",
      "menu.empty": "没有可用的自定义工具。",
      "menu.configHint": "在 {path} 里添加自定义条目。",
      "menu.configError": "配置文件有问题：{detail}",
      "menu.unavailable": "未安装：{list}",
      "state.launching": "正在打开…",
      "state.launched": "已交给 {app} 打开",
      "state.failed": "打开失败：{detail}",
      "state.noWorkspace": "当前会话还没有工作区目录",
    };
    const EN = {
      "button.title": "Open workspace in another tool",
      "button.label": "Other tools",
      "menu.empty": "No custom tools are available.",
      "menu.configHint": "Add entries in {path}.",
      "menu.configError": "Config problem: {detail}",
      "menu.unavailable": "Not installed: {list}",
      "state.launching": "Opening…",
      "state.launched": "Handed to {app}",
      "state.failed": "Launch failed: {detail}",
      "state.noWorkspace": "This session has no workspace directory yet",
    };

    const API = {
      list: "/open-in-app-plus/apps",
      open: "/open-in-app-plus/open",
    };
    const CHOICE_KEY = "dsh.open-in-app-plus.choice";

    const CSS = `
.cx-oi { position: relative; display: inline-flex; align-items: center; }
.cx-oi-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 7px 0 8px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  border-radius: 999px; background: transparent;
  color: var(--dsw-alias-label-secondary, #a6a6a6);
  font: inherit; font-size: 12px; line-height: 1; cursor: pointer;
  white-space: nowrap;
}
.cx-oi-btn:hover { background: var(--dsw-alias-interactive-bg-hover, #ffffff14); color: var(--dsw-alias-label-primary, #f5f5f5); }
.cx-oi-btn:focus-visible { outline: 2px solid var(--dsw-alias-label-primary, #f5f5f5); outline-offset: 1px; }
.cx-oi-btn[data-busy="1"] { opacity: .6; cursor: progress; }
.cx-oi-btn[data-error="1"] { border-color: #f85149; color: #f85149; }
.cx-oi-chev { opacity: .7; }
.cx-oi-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40;
  min-width: 208px; max-width: 320px; padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #2a2a2a);
  box-shadow: 0 8px 24px #00000059;
}
.cx-oi-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border: 0; border-radius: 7px; background: transparent;
  color: var(--dsw-alias-label-primary, #f5f5f5);
  font: inherit; font-size: 12.5px; text-align: left; cursor: pointer;
}
.cx-oi-item:hover { background: var(--dsw-alias-interactive-bg-hover, #ffffff14); }
.cx-oi-item[data-current="1"] { background: var(--dsw-alias-interactive-bg-hover, #ffffff14); }
.cx-oi-kind {
  margin-left: auto; font-size: 10.5px; letter-spacing: .3px;
  color: var(--dsw-alias-label-tertiary, #8c8c8c); text-transform: uppercase;
}
.cx-oi-note {
  padding: 6px 8px; font-size: 11px; line-height: 1.45;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.cx-oi-note code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10.5px; }
`;

    function injectStyles() {
      const tagId = "dsh-open-in-app-plus/styles";
      if (typeof document === "undefined") return;
      let el = document.querySelector('style[data-plugin-css="' + tagId + '"]');
      if (!el) {
        el = document.createElement("style");
        el.dataset.plugin = "dsh-open-in-app-plus";
        el.dataset.pluginCss = tagId;
        document.head.appendChild(el);
      }
      el.textContent = CSS;
    }

    function readChoice() {
      try {
        return localStorage.getItem(CHOICE_KEY) || "";
      } catch {
        return "";
      }
    }

    function writeChoice(id) {
      try {
        localStorage.setItem(CHOICE_KEY, id);
      } catch {
        /* privacy modes can reject writes; the choice is then page-lifetime */
      }
    }

    function OpenIcon() {
      return h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        h("path", {
          d: "M6.5 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8A1.5 1.5 0 0 0 13 12.5v-3",
          stroke: "currentColor",
          "stroke-width": 1.4,
          "stroke-linecap": "round",
        }),
        h("path", {
          d: "M9.5 2H14v4.5M13.6 2.4 7.8 8.2",
          stroke: "currentColor",
          "stroke-width": 1.4,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
    }

    function Chevron() {
      return h(
        "svg",
        { width: 9, height: 9, viewBox: "0 0 10 10", fill: "none", "aria-hidden": "true", class: "cx-oi-chev" },
        h("path", {
          d: "M2 3.5 5 6.5 8 3.5",
          stroke: "currentColor",
          "stroke-width": 1.4,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
    }

    /** The header control. `load`/`launch` arrive through the register inject face. */
    function OpenInAppPlusAction(props) {
      const { sessionId, useSessions, t, load, launch } = props;
      const cwd = useSessions((state) => state.byId?.[sessionId]?.cwd);
      const [catalog, setCatalog] = useState(null);
      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const [status, setStatus] = useState(null);
      const rootRef = useRef(null);

      useEffect(() => {
        let live = true;
        load()
          .then((next) => {
            if (live) setCatalog(next);
          })
          .catch(() => {
            if (live) setCatalog({ apps: [], unavailable: [], configPath: "", configError: null });
          });
        return () => {
          live = false;
        };
      }, [load]);

      useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
          document.removeEventListener("mousedown", onPointerDown);
          document.removeEventListener("keydown", onKeyDown);
        };
      }, [open]);

      const apps = catalog?.apps ?? [];
      // Only an explicit choice names the button; until then it stays generic,
      // so the control reads as "more tools" rather than as whichever app
      // happens to sort first in the catalog.
      const remembered = readChoice();
      const current = remembered ? (apps.find((app) => app.id === remembered) ?? null) : null;
      const hasWorkspace = typeof cwd === "string" && cwd !== "";

      // Nothing custom resolved: stay out of the header entirely rather than
      // occupying space with a menu that cannot do anything.
      if (catalog !== null && apps.length === 0 && !catalog.configError) return null;

      const run = (appId) => {
        setOpen(false);
        if (!hasWorkspace || busy) return;
        setBusy(true);
        setStatus({ kind: "launching" });
        writeChoice(appId);
        launch(appId, cwd)
          .then(() => {
            const app = apps.find((candidate) => candidate.id === appId);
            setStatus({ kind: "launched", app: app?.label ?? appId });
          })
          .catch((error) => setStatus({ kind: "failed", detail: String(error?.message ?? error) }))
          .finally(() => {
            setBusy(false);
            setTimeout(() => setStatus(null), 4000);
          });
      };

      const label =
        status?.kind === "launching"
          ? t("state.launching")
          : status?.kind === "launched"
            ? t("state.launched", { app: status.app })
            : status?.kind === "failed"
              ? t("state.failed", { detail: status.detail })
              : current
                ? current.label
                : t("button.label");

      return h(
        "div",
        { class: "cx-oi", ref: rootRef },
        h(
          "button",
          {
            type: "button",
            class: "cx-oi-btn",
            title: hasWorkspace ? t("button.title") : t("state.noWorkspace"),
            "aria-haspopup": "menu",
            "aria-expanded": open ? "true" : "false",
            "aria-label": t("button.title"),
            "data-busy": busy ? "1" : "0",
            "data-error": status?.kind === "failed" ? "1" : "0",
            disabled: !hasWorkspace,
            onClick: () => setOpen((value) => !value),
          },
          h(OpenIcon),
          h("span", null, label),
          h(Chevron),
        ),
        open
          ? h(
              "div",
              { class: "cx-oi-menu", role: "menu" },
              catalog?.configError
                ? h(
                    "div",
                    { class: "cx-oi-note" },
                    t("menu.configError", { detail: catalog.configError }),
                  )
                : null,
              ...apps.map((app) =>
                h(
                  "button",
                  {
                    key: app.id,
                    type: "button",
                    role: "menuitem",
                    class: "cx-oi-item",
                    "data-current": app.id === current?.id ? "1" : "0",
                    onClick: () => run(app.id),
                  },
                  h("span", null, app.label),
                  h("span", { class: "cx-oi-kind" }, app.kind === "app" ? "app" : "cli"),
                ),
              ),
              apps.length === 0
                ? h("div", { class: "cx-oi-note" }, t("menu.empty"))
                : null,
              catalog?.unavailable?.length
                ? h(
                    "div",
                    { class: "cx-oi-note" },
                    t("menu.unavailable", {
                      list: catalog.unavailable.map((entry) => entry.id).join(", "),
                    }),
                  )
                : null,
              catalog?.configPath
                ? h(
                    "div",
                    { class: "cx-oi-note" },
                    t("menu.configHint", { path: catalog.configPath }),
                  )
                : null,
            )
          : null,
      );
    }

    /** Fetch helpers handed to the component through the inject face. */
    async function listApps() {
      const response = await fetch(API.list, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`apps route answered ${response.status}`);
      return response.json();
    }

    async function launchApp(appId, path) {
      const response = await fetch(API.open, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: appId, path }),
      });
      if (!response.ok) {
        let detail = `open route answered ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.message) detail = payload.message;
        } catch {
          /* non-JSON error body keeps the status line */
        }
        throw new Error(detail);
      }
      return response.json();
    }

    const inject = ["slots", "locale"];

    async function apply(ctx) {
      injectStyles();
      const locale = ctx.locale || (typeof ctx.get === "function" ? ctx.get("locale") : undefined);
      if (locale && typeof locale.register === "function") {
        ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), "open-in-app-plus.locale");
      }
      ctx.slots.inject("conversation.session.header.utilities", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "open-in-app-plus",
            order: 5,
            locale: NS,
            label: () => "Other tools",
            inject: () => ({ load: listApps, launch: launchApp }),
          },
          OpenInAppPlusAction,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    return module.exports;
  },
});
