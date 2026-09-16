// dsh-open-in-app-plus — browser half.
//
// One MERGED Session-header split button. The shipped `dsh-client-ui-open-in-app`
// renders its own split button in `conversation.session.header.utilities` under
// the cell id `open-in-app` (order -10), and this package used to add a SECOND
// dropdown beside it (order 5). Two adjacent dropdowns for one task is noise, so
// this package now takes over that cell instead: the slot contract states that
// reusing a shipped id "puts you in THAT cell and replaces it", and the merged
// control serves BOTH catalogs from one menu.
//
// Selection is namespaced (`ship:` / `plus:`) because the two catalogs have
// independent id spaces, and each entry launches through the route that owns it:
// the shipped entries through the upstream `/open-in-app` routes, the custom
// ones through this package's host routes.
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
      "button.title": "在 {app} 中打开工作区",
      "menu.shipped": "打开方式",
      "menu.custom": "自定义工具",
      "menu.toggle": "选择打开方式",
      "menu.empty": "没有可用的打开方式。",
      "menu.configHint": "在 {path} 里添加自定义条目。",
      "menu.configError": "配置文件有问题：{detail}",
      "menu.unavailable": "未安装：{list}",
      "state.launching": "正在打开…",
      "state.launched": "已交给 {app} 打开",
      "state.failed": "打开失败：{detail}",
    };
    const EN = {
      "button.title": "Open the workspace in {app}",
      "menu.shipped": "Open in",
      "menu.custom": "Custom tools",
      "menu.toggle": "Choose an app to open in",
      "menu.empty": "No applications are available.",
      "menu.configHint": "Add entries in {path}.",
      "menu.configError": "Config problem: {detail}",
      "menu.unavailable": "Not installed: {list}",
      "state.launching": "Opening…",
      "state.launched": "Handed to {app}",
      "state.failed": "Launch failed: {detail}",
    };

    /**
     * Product names for the shipped catalog, copied verbatim from the upstream
     * `open-in-app` dictionaries. The shipped route only returns ids, so the
     * merged menu needs its own label table; an unknown id falls back to the raw
     * id rather than disappearing.
     */
    const SHIPPED_LABELS = {
      cursor: "Cursor",
      vscode: "VS Code",
      vscodeinsiders: "VS Code Insiders",
      windsurf: "Windsurf",
      zed: "Zed",
      sublimetext: "Sublime Text",
      xcode: "Xcode",
      androidstudio: "Android Studio",
      intellij: "IntelliJ IDEA",
      pycharm: "PyCharm",
      webstorm: "WebStorm",
      phpstorm: "PhpStorm",
      goland: "GoLand",
      rider: "Rider",
      rustrover: "RustRover",
      fork: "Fork",
      sourcetree: "Sourcetree",
      github: "GitHub Desktop",
      tower: "Tower",
      gitkraken: "GitKraken",
      smartgit: "SmartGit",
      sublimemerge: "Sublime Merge",
      ghostty: "Ghostty",
      warp: "Warp",
      iterm: "iTerm2",
      kitty: "kitty",
      windowsterminal: "Windows Terminal",
      gitbash: "Git Bash",
      gnometerminal: "GNOME Terminal",
      konsole: "Konsole",
      finder: "访达",
      explorer: "文件资源管理器",
      filemanager: "文件管理器",
      terminal: "终端",
    };

    const API = {
      shippedApps: "/open-in-app/apps",
      shippedOpen: "/open-in-app/open",
      shippedIcon: "/open-in-app/icon/",
      customApps: "/open-in-app-plus/apps",
      customOpen: "/open-in-app-plus/open",
    };
    const CHOICE_KEY = "dsh.open-in-app-plus.choice";

    // The merged control reproduces the shipped split button's dress, so taking
    // over the cell is not a visual change: same 28px pill, same hairline
    // divider, same 15px bundle icon in the main half.
    const CSS = `
.cx-oi { position: relative; display: inline-flex; align-items: center; }
.cx-oi-split {
  box-sizing: border-box; height: 28px; overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l4, #ffffff26);
  border-radius: 14px; display: inline-flex; align-items: stretch;
}
.cx-oi-main, .cx-oi-chev {
  display: inline-flex; align-items: center; gap: 5px;
  border: 0; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-primary, #f5f5f5);
  font: inherit; font-size: 11px; line-height: 16px; white-space: nowrap;
}
.cx-oi-main { padding: 5px 6px 5px 7px; }
.cx-oi-chev {
  border-left: .5px solid var(--dsw-alias-border-l4, #ffffff26);
  color: var(--dsw-alias-label-secondary, #a6a6a6);
  padding: 5px 6px 5px 4px;
}
.cx-oi-main:hover:not(:disabled), .cx-oi-chev:hover,
.cx-oi-main:focus-visible, .cx-oi-chev:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover, #ffffff14);
}
.cx-oi-main:disabled { color: var(--dsw-alias-label-dimmed, #6b6b6b); cursor: wait; }
.cx-oi-main[data-state="error"] {
  color: var(--dsw-alias-state-error-primary, #f85149);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-state-error-primary, #f85149);
}
.cx-oi-icon { flex: none; object-fit: contain; user-select: none; display: block; }
.cx-oi-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40;
  min-width: 224px; max-width: 340px; max-height: 60vh; overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #2a2a2a);
  box-shadow: 0 8px 24px #00000059;
}
.cx-oi-group {
  padding: 6px 8px 2px; font-size: 10.5px; letter-spacing: .3px;
  text-transform: uppercase; color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.cx-oi-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l2, #ffffff1f); }
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

    function writeChoice(key) {
      try {
        localStorage.setItem(CHOICE_KEY, key);
      } catch {
        /* privacy modes can reject writes; the choice is then page-lifetime */
      }
    }

    /** Generic fallback glyph for a custom entry, whose bundle icon is unknown. */
    function ToolGlyph({ size }) {
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
          class: "cx-oi-icon",
        },
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
        {
          width: 11,
          height: 11,
          viewBox: "0 0 10 10",
          fill: "none",
          "aria-hidden": "true",
        },
        h("path", {
          d: "M2 3.5 5 6.5 8 3.5",
          stroke: "currentColor",
          "stroke-width": 1.4,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
    }

    /**
     * One entry's leading icon: the host-served bundle icon for a shipped app, a
     * generic glyph for a custom tool. A failed image is remembered per page so a
     * 404 is fetched once instead of on every menu open.
     */
    function EntryIcon({ entry, size }) {
      const [failed, setFailed] = useState(false);
      if (entry.source !== "ship" || failed) return h(ToolGlyph, { size });
      return h("img", {
        class: "cx-oi-icon",
        width: size,
        height: size,
        src: API.shippedIcon + encodeURIComponent(entry.id),
        alt: "",
        "aria-hidden": "true",
        onError: () => setFailed(true),
      });
    }

    /** The merged header control. `catalogs`/`launch` arrive via the inject face. */
    function OpenInAppMerged(props) {
      const { sessionId, useSessions, t, loadCatalogs, launch } = props;
      const cwd = useSessions((state) => state.byId?.[sessionId]?.cwd);
      const [catalogs, setCatalogs] = useState(null);
      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const [status, setStatus] = useState(null);
      const rootRef = useRef(null);

      useEffect(() => {
        let live = true;
        loadCatalogs()
          .then((next) => {
            if (live) setCatalogs(next);
          })
          .catch(() => {
            if (live) {
              setCatalogs({ shipped: [], custom: [], unavailable: [], configPath: "", configError: null });
            }
          });
        return () => {
          live = false;
        };
      }, [loadCatalogs]);

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

      const shipped = catalogs?.shipped ?? [];
      const custom = catalogs?.custom ?? [];
      const entries = [...shipped, ...custom];

      // Mirror the shipped control: without a workspace directory there is
      // nothing to open, so the control stays out of the header entirely.
      if (typeof cwd !== "string" || cwd === "") return null;

      const remembered = readChoice();
      const current =
        entries.find((entry) => entry.key === remembered) ?? shipped[0] ?? custom[0] ?? null;

      // Nothing at all resolved: stay out of the header rather than occupying
      // space with a menu that cannot do anything.
      if (catalogs !== null && entries.length === 0 && !catalogs.configError) return null;
      if (current === null) return null;

      const run = (entry) => {
        setOpen(false);
        if (busy) return;
        setBusy(true);
        setStatus({ kind: "launching" });
        writeChoice(entry.key);
        launch(entry, cwd)
          .then(() => setStatus({ kind: "launched", app: entry.label }))
          .catch((error) => setStatus({ kind: "failed", detail: String(error?.message ?? error) }))
          .finally(() => {
            setBusy(false);
            setTimeout(() => setStatus(null), 4000);
          });
      };

      const phase = status?.kind === "failed" ? "error" : busy ? "busy" : "idle";
      const title =
        status?.kind === "failed"
          ? t("state.failed", { detail: status.detail })
          : t("button.title", { app: current.label });

      const item = (entry) =>
        h(
          "button",
          {
            key: entry.key,
            type: "button",
            role: "menuitem",
            class: "cx-oi-item",
            "data-current": entry.key === current.key ? "1" : "0",
            onClick: () => run(entry),
          },
          h(EntryIcon, { entry, size: 16 }),
          h("span", null, entry.label),
          entry.source === "plus" ? h("span", { class: "cx-oi-kind" }, entry.kind) : null,
        );

      return h(
        "div",
        { class: "cx-oi", ref: rootRef },
        h(
          "div",
          { class: "cx-oi-split" },
          h(
            "button",
            {
              type: "button",
              class: "cx-oi-main",
              "data-state": phase,
              title,
              "aria-label": title,
              disabled: busy,
              onClick: () => run(current),
            },
            h(EntryIcon, { entry: current, size: 15 }),
          ),
          h(
            "button",
            {
              type: "button",
              class: "cx-oi-chev",
              title: t("menu.toggle"),
              "aria-label": t("menu.toggle"),
              "aria-haspopup": "menu",
              "aria-expanded": open ? "true" : "false",
              onClick: () => setOpen((value) => !value),
            },
            h(Chevron),
          ),
        ),
        open
          ? h(
              "div",
              { class: "cx-oi-menu", role: "menu" },
              catalogs?.configError
                ? h(
                    "div",
                    { class: "cx-oi-note" },
                    t("menu.configError", { detail: catalogs.configError }),
                  )
                : null,
              shipped.length > 0 ? h("div", { class: "cx-oi-group" }, t("menu.shipped")) : null,
              ...shipped.map(item),
              custom.length > 0 && shipped.length > 0 ? h("div", { class: "cx-oi-sep" }) : null,
              custom.length > 0 ? h("div", { class: "cx-oi-group" }, t("menu.custom")) : null,
              ...custom.map(item),
              entries.length === 0 ? h("div", { class: "cx-oi-note" }, t("menu.empty")) : null,
              catalogs?.unavailable?.length
                ? h(
                    "div",
                    { class: "cx-oi-note" },
                    t("menu.unavailable", {
                      list: catalogs.unavailable.map((entry) => entry.id).join(", "),
                    }),
                  )
                : null,
              catalogs?.configPath
                ? h(
                    "div",
                    { class: "cx-oi-note" },
                    h("span", null, t("menu.configHint", { path: catalogs.configPath })),
                  )
                : null,
            )
          : null,
      );
    }

    async function getJson(url, label) {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`${label} route answered ${response.status}`);
      return response.json();
    }

    /** Shipped entries, normalized into the same shape as the custom ones. */
    async function loadShipped() {
      let payload;
      try {
        payload = await getJson(API.shippedApps, "shipped apps");
      } catch {
        // The upstream host plugin may be absent; the custom catalog still works.
        return [];
      }
      const ids = Array.isArray(payload?.apps) ? payload.apps : [];
      return ids
        .filter((id) => typeof id === "string" && id !== "")
        .map((id) => ({
          key: `ship:${id}`,
          id,
          source: "ship",
          label: SHIPPED_LABELS[id] ?? id,
        }));
    }

    async function loadCustom() {
      const payload = await getJson(API.customApps, "custom apps");
      const apps = Array.isArray(payload?.apps) ? payload.apps : [];
      return {
        apps: apps.map((app) => ({
          key: `plus:${app.id}`,
          id: app.id,
          source: "plus",
          kind: app.kind === "app" ? "app" : "cli",
          label: typeof app.label === "string" ? app.label : app.id,
        })),
        unavailable: Array.isArray(payload?.unavailable) ? payload.unavailable : [],
        configPath: typeof payload?.configPath === "string" ? payload.configPath : "",
        configError: typeof payload?.configError === "string" ? payload.configError : null,
      };
    }

    /** Both catalogs in one read, so the menu is consistent within one open. */
    async function loadCatalogs() {
      const [shipped, custom] = await Promise.all([loadShipped(), loadCustom()]);
      return { shipped, custom: custom.apps, unavailable: custom.unavailable, configPath: custom.configPath, configError: custom.configError };
    }

    /** Launch through the route that owns the entry's catalog. */
    async function launchEntry(entry, path) {
      const url = entry.source === "ship" ? API.shippedOpen : API.customOpen;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: entry.id, path }),
      });
      if (!response.ok) {
        let detail = `${url} answered ${response.status}`;
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
      // Reuse the shipped cell id on purpose: the slot is a list, and reusing an
      // occupied id replaces that occupant instead of adding a second control.
      ctx.slots.inject("conversation.session.header.utilities", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "open-in-app",
            order: -10,
            locale: NS,
            label: () => "Open in",
            inject: () => ({
              loadCatalogs,
              launch: (entry, path) => launchEntry(entry, path),
            }),
          },
          OpenInAppMerged,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    return module.exports;
  },
});
