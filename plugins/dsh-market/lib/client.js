// dsh-market — browser half.
//
// One Settings section ("市场") with three tabs:
//   * CLI 市场      — detected CLIs with their install command to copy;
//   * Skill 市场    — browse a commit-pinned source and install a skill;
//   * 自定义 Skill  — author/remove skills this page owns.
//
// Loaded through package.json's `dsh.client` declaration + exports["./client"].

window.__ModuleLoader__.load({
  id: "dsh-market",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect } = React;

    const NS = "dsh-market";
    const ZH = {
      "section.label": "市场",
      "tab.cli": "CLI 市场",
      "tab.skills": "Skill 市场",
      "tab.custom": "自定义 Skill",
      "scope.user": "用户级",
      "scope.workspace": "工作区",
      "scope.label": "安装位置",
      "scope.userHint": "装到所有项目都能用的位置",
      "scope.workspaceHint": "只装到选中的这个工作区",
      "scope.pick": "选择工作区…",
      "scope.customPath": "或手动输入绝对路径",
      "common.loading": "读取中…",
      "common.retry": "重试",
      "common.copy": "复制命令",
      "common.copied": "已复制",
      "common.install": "安装",
      "common.remove": "删除",
      "common.cancel": "取消",
      "common.confirm": "确认",
      "common.save": "保存",
      "common.close": "关闭",
      "common.refresh": "刷新",
      "common.openSite": "主页",
      "common.files": "{count} 个文件",
      "cli.title": "已安装的 CLI",
      "cli.subtitle": "只做检测与展示：DSH 不会代你运行安装器，命令由你复制后自行执行。",
      "cli.installed": "已安装",
      "cli.missing": "未安装",
      "cli.managers": "包管理器",
      "cli.managerMissing": "未检测到",
      "cli.noManager": "本机没有可用的 {manager}，需要先安装包管理器。",
      "cli.failed": "读取 CLI 目录失败：{detail}",
      "cli.versionUnknown": "版本未知",
      "skills.title": "Skill 市场",
      "skills.subtitle": "按 GitHub Stars 排序挑选技能仓库，再固定到某个 commit 安装；装完写下 SOURCE.md 溯源，不会覆盖本仓库 vendored 的技能。",
      "skills.catalog": "技能目录（按 GitHub Stars 排序）",
      "skills.ratingNote": "评分是仓库的 GitHub Stars，不是单个技能的评分；安装只认固定 commit。",
      "skills.refreshCatalog": "刷新目录",
      "skills.catalogUpdated": "目录更新于 {time}",
      "skills.catalogOffline": "刷新失败，显示上次成功的结果（{time}）",
      "skills.catalogPartial": "部分主题刷新失败：{detail}",
      "skills.catalogFailed": "读取技能目录失败：{detail}",
      "skills.catalogEmpty": "目录里还没有条目，点「刷新目录」重试。",
      "skills.filter": "筛选仓库名…",
      "skills.sourceSection": "或按固定来源浏览",
      "skills.truncated": "这个仓库的文件树被 GitHub 截断，列表可能不完整；安装会被拒绝。",
      "skills.source": "来源",
      "skills.pin": "固定到 commit",
      "skills.resolve": "解析最新 commit",
      "skills.pinnedAt": "本次固定：{ref}",
      "skills.browse": "浏览技能",
      "skills.empty": "这个来源下没有找到技能目录。",
      "skills.failed": "读取来源失败：{detail}",
      "skills.installConfirm": "从 {repo} @ {ref} 安装 {name}？",
      "skills.installing": "安装中…",
      "skills.installed": "已安装 {name}",
      "skills.installFailed": "安装失败：{detail}",
      "skills.alreadyThere": "同名目录已存在",
      "custom.title": "自定义 Skill",
      "custom.subtitle": "管理你自己的技能：本页创建的可以编辑，来源安装的可以删除，其余目录只读。",
      "custom.groupCustom": "本页创建",
      "custom.groupSource": "来源安装",
      "custom.groupReadonly": "已安装（只读）",
      "custom.groupCount": "{count} 个",
      "custom.new": "新建技能",
      "custom.edit": "编辑",
      "custom.name": "名称（小写字母/数字/连字符）",
      "custom.description": "描述（模型据此判断何时使用）",
      "custom.body": "正文（Markdown）",
      "custom.readonly": "只读",
      "custom.bySource": "来源安装",
      "custom.byPage": "本页创建",
      "custom.readonlyNote": "不是本页创建的，只能查看。路径：{dir}",
      "custom.saved": "已保存 {name}",
      "custom.saveFailed": "保存失败：{detail}",
      "custom.removeConfirm": "删除 {name}？目录会被整个移除。",
      "custom.removed": "已删除 {name}",
      "custom.removeFailed": "删除失败：{detail}",
      "custom.none": "这个位置还没有技能。",
      "custom.dir": "目录：{dir}",
      "custom.provenance": "该目录的溯源文件",
    };
    const EN = {
      "section.label": "Market",
      "tab.cli": "CLI market",
      "tab.skills": "Skill market",
      "tab.custom": "Custom skills",
      "scope.user": "User",
      "scope.workspace": "Workspace",
      "scope.label": "Install into",
      "scope.userHint": "Available to every project",
      "scope.workspaceHint": "Only the selected workspace",
      "scope.pick": "Pick a workspace…",
      "scope.customPath": "Or type an absolute path",
      "common.loading": "Loading…",
      "common.retry": "Retry",
      "common.copy": "Copy command",
      "common.copied": "Copied",
      "common.install": "Install",
      "common.remove": "Delete",
      "common.cancel": "Cancel",
      "common.confirm": "Confirm",
      "common.save": "Save",
      "common.close": "Close",
      "common.refresh": "Refresh",
      "common.openSite": "Homepage",
      "common.files": "{count} files",
      "cli.title": "Detected CLIs",
      "cli.subtitle": "Detection and display only — DSH never runs an installer for you; copy the command and run it yourself.",
      "cli.installed": "Installed",
      "cli.missing": "Not installed",
      "cli.managers": "Package managers",
      "cli.managerMissing": "not found",
      "cli.noManager": "No {manager} on this machine — install the package manager first.",
      "cli.failed": "Could not read the CLI catalog: {detail}",
      "cli.versionUnknown": "version unknown",
      "skills.title": "Skill market",
      "skills.subtitle": "Pick a skill repository ranked by GitHub Stars, then install it pinned to a commit; every install writes SOURCE.md provenance and never overwrites the skills vendored in this repository.",
      "skills.catalog": "Skill catalog (ranked by GitHub Stars)",
      "skills.ratingNote": "The rating is the repository's GitHub Stars, not a per-skill score; installs only ever use a pinned commit.",
      "skills.refreshCatalog": "Refresh catalog",
      "skills.catalogUpdated": "Catalog updated {time}",
      "skills.catalogOffline": "Refresh failed — showing the last successful result ({time})",
      "skills.catalogPartial": "Some topics failed to refresh: {detail}",
      "skills.catalogFailed": "Could not read the skill catalog: {detail}",
      "skills.catalogEmpty": "The catalog has no entries yet — try refreshing.",
      "skills.filter": "Filter repositories…",
      "skills.sourceSection": "Or browse a fixed source",
      "skills.truncated": "GitHub truncated this repository's file tree, so the list may be incomplete; installing from it is refused.",
      "skills.source": "Source",
      "skills.pin": "Pinned to commit",
      "skills.resolve": "Resolve latest commit",
      "skills.pinnedAt": "Pinned this time: {ref}",
      "skills.browse": "Browse skills",
      "skills.empty": "No skill directories found in this source.",
      "skills.failed": "Could not read the source: {detail}",
      "skills.installConfirm": "Install {name} from {repo} @ {ref}?",
      "skills.installing": "Installing…",
      "skills.installed": "Installed {name}",
      "skills.installFailed": "Install failed: {detail}",
      "skills.alreadyThere": "a directory with this name exists",
      "custom.title": "Custom skills",
      "custom.subtitle": "Manage your own skills here: skills this page created can be edited, source installs can be deleted, everything else is read-only.",
      "custom.groupCustom": "Created here",
      "custom.groupSource": "From source",
      "custom.groupReadonly": "Installed (read-only)",
      "custom.groupCount": "{count}",
      "custom.new": "New skill",
      "custom.edit": "Edit",
      "custom.name": "Name (lowercase letters, digits, hyphens)",
      "custom.description": "Description (how the model decides to use it)",
      "custom.body": "Body (Markdown)",
      "custom.readonly": "Read-only",
      "custom.bySource": "From source",
      "custom.byPage": "Created here",
      "custom.readonlyNote": "Not created here, so it is view-only. Path: {dir}",
      "custom.saved": "Saved {name}",
      "custom.saveFailed": "Save failed: {detail}",
      "custom.removeConfirm": "Delete {name}? The whole directory is removed.",
      "custom.removed": "Deleted {name}",
      "custom.removeFailed": "Delete failed: {detail}",
      "custom.none": "No skills in this location yet.",
      "custom.dir": "Directory: {dir}",
      "custom.provenance": "Provenance files in this directory",
    };

    const CSS = `
.mk { display: flex; flex-direction: column; gap: 14px; }
.mk-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--dsw-alias-border-l1, #ffffff12); }
.mk-tab {
  padding: 7px 12px; border: 0; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary, #a6a6a6); font: inherit; font-size: 13px;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.mk-tab:hover { color: var(--dsw-alias-label-primary, #f5f5f5); }
.mk-tab[data-active="1"] { color: var(--dsw-alias-label-primary, #f5f5f5); border-bottom-color: var(--dsw-alias-label-primary, #f5f5f5); }
.mk-sub { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-tertiary, #8c8c8c); }
.mk-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mk-scope { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--dsw-alias-label-secondary, #a6a6a6); }
.mk-btn {
  padding: 5px 10px; border-radius: 7px; font: inherit; font-size: 12px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f);
  background: transparent; color: var(--dsw-alias-label-primary, #f5f5f5);
}
.mk-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #ffffff14); }
.mk-btn:disabled { opacity: .45; cursor: default; }
.mk-btn[data-variant="primary"] { background: var(--dsw-alias-brand-primary, #f5f5f5); color: var(--dsw-alias-label-primary-foreground, #0d0d0d); border-color: transparent; }
.mk-btn[data-variant="danger"] { color: #f85149; border-color: #f8514966; }
.mk-input, .mk-select, .mk-area {
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, #2a2a2a); color: var(--dsw-alias-label-primary, #f5f5f5);
  font: inherit; font-size: 12.5px; padding: 6px 8px; width: 100%;
}
.mk-select.mk-narrow { width: auto; min-width: 120px; }
.mk-select.mk-wide { width: auto; min-width: 230px; max-width: 100%; }
.mk-spacer { flex: 1; }
.mk-area { min-height: 190px; resize: vertical; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; line-height: 1.5; }
.mk-field { display: flex; flex-direction: column; gap: 5px; }
.mk-label { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #8c8c8c); }
.mk-card {
  border: 1px solid var(--dsw-alias-border-l1, #ffffff12); border-radius: 10px;
  padding: 10px 12px; display: flex; flex-direction: column; gap: 7px;
  background: var(--dsw-alias-bg-layer-1, #171717);
}
.mk-card-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.mk-name { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary, #f5f5f5); }
.mk-desc { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #a6a6a6); }
.mk-badge {
  font-size: 10.5px; padding: 2px 7px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, #ffffff1f); color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.mk-badge[data-tone="ok"] { color: #3fb950; border-color: #3fb95066; }
.mk-badge[data-tone="warn"] { color: #d29922; border-color: #d2992266; }
.mk-mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #8c8c8c); word-break: break-all; }
.mk-cmd {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 7px;
  background: var(--dsw-alias-markdown-code-block, #171717);
  border: 1px solid var(--dsw-alias-border-l1, #ffffff12);
}
.mk-cmd code { flex: 1; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; color: var(--dsw-alias-label-primary, #f5f5f5); }
.mk-note { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #8c8c8c); line-height: 1.5; }
.mk-err { font-size: 12px; color: #f85149; line-height: 1.5; }
.mk-ok { font-size: 12px; color: #3fb950; }
.mk-list { display: flex; flex-direction: column; gap: 8px; }
.mk-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 9px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover, #ffffff14); font-size: 12px; }
.mk-hr { height: 1px; border: 0; margin: 2px 0; background: var(--dsw-alias-border-l1, #ffffff12); }
.mk-cards { display: flex; flex-direction: column; gap: 8px; max-height: 330px; overflow-y: auto; padding-right: 2px; }
.mk-badge[data-tone="rating"] { color: #d29922; border-color: #d2992266; font-variant-numeric: tabular-nums; }
.mk-group { display: flex; flex-direction: column; gap: 8px; }
.mk-group-head {
  display: flex; align-items: center; gap: 6px; padding: 2px 0; border: 0; background: transparent;
  cursor: pointer; font: inherit; font-size: 12px; font-weight: 600;
  color: var(--dsw-alias-label-secondary, #a6a6a6);
}
.mk-group-head:hover { color: var(--dsw-alias-label-primary, #f5f5f5); }
.mk-caret { font-size: 10px; color: var(--dsw-alias-label-tertiary, #8c8c8c); }
.mk-details { display: flex; flex-direction: column; gap: 8px; }
.mk-details > summary { cursor: pointer; }
`;

    function injectStyles() {
      const tagId = "dsh-market/styles";
      if (typeof document === "undefined") return;
      let el = document.querySelector('style[data-plugin-css="' + tagId + '"]');
      if (!el) {
        el = document.createElement("style");
        el.dataset.plugin = "dsh-market";
        el.dataset.pluginCss = tagId;
        document.head.appendChild(el);
      }
      el.textContent = CSS;
    }

    // ── transport ──────────────────────────────────────────────────────────
    async function request(path, options) {
      const response = await fetch(path, options);
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload?.message ?? `${path} answered ${response.status}`);
      }
      return payload;
    }
    const getJson = (path) => request(path, { headers: { accept: "application/json" } });
    const postJson = (path, body) =>
      request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const query = (params) => {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string" && value !== "") search.set(key, value);
      }
      const text = search.toString();
      return text === "" ? "" : `?${text}`;
    };

    /** 12345 → "12.3k". Stars only, so the page needs no locale number format. */
    function formatStars(value) {
      const stars = Number(value);
      if (!Number.isFinite(stars) || stars <= 0) return "0";
      if (stars < 1000) return String(Math.floor(stars));
      const thousands = stars / 1000;
      return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
    }

    /** Local stamp for a cache timestamp; a bad value must not break the panel. */
    function formatStamp(ms) {
      try {
        return new Date(Number(ms)).toLocaleString();
      } catch {
        return "";
      }
    }

    // ── shared bits ────────────────────────────────────────────────────────
    function CopyButton({ text, t, label }) {
      const [copied, setCopied] = useState(false);
      return h(
        "button",
        {
          type: "button",
          class: "mk-btn",
          onClick: () => {
            const write = navigator.clipboard?.writeText?.(text);
            if (write && typeof write.then === "function") {
              write.then(() => setCopied(true)).catch(() => setCopied(true));
            } else {
              setCopied(true);
            }
            setTimeout(() => setCopied(false), 1600);
          },
        },
        copied ? t("common.copied") : (label ?? t("common.copy")),
      );
    }

    function ScopePicker({ t, scope, setScope, root, setRoot, workspaces }) {
      return h(
        "div",
        { class: "mk-scope" },
        h("span", null, t("scope.label")),
        h(
          "select",
          {
            class: "mk-select mk-narrow",
            value: scope,
            "aria-label": t("scope.label"),
            onChange: (event) => setScope(event.target.value),
          },
          h("option", { value: "user" }, t("scope.user")),
          h("option", { value: "workspace" }, t("scope.workspace")),
        ),
        scope === "user"
          ? h("span", { class: "mk-note" }, t("scope.userHint"))
          : h(
              "select",
              {
                class: "mk-select mk-wide",
                value: root ?? "",
                "aria-label": t("scope.pick"),
                onChange: (event) => setRoot(event.target.value),
              },
              h("option", { value: "" }, t("scope.pick")),
              ...workspaces.map((space) =>
                h("option", { key: space.path, value: space.path }, `${space.title} — ${space.path}`),
              ),
            ),
      );
    }

    // ── tab 1: CLI market ──────────────────────────────────────────────────
    function CliTab({ t, api }) {
      const [state, setState] = useState({ status: "loading" });
      const load = () => {
        setState({ status: "loading" });
        api
          .cli()
          .then((data) => setState({ status: "ready", data }))
          .catch((error) => setState({ status: "error", detail: String(error?.message ?? error) }));
      };
      useEffect(load, []);

      if (state.status === "loading") return h("div", { class: "mk-sub" }, t("common.loading"));
      if (state.status === "error") {
        return h(
          "div",
          { class: "mk" },
          h("div", { class: "mk-err" }, t("cli.failed", { detail: state.detail })),
          h("div", null, h("button", { class: "mk-btn", onClick: load }, t("common.retry"))),
        );
      }
      const { tools, managers } = state.data;
      const missingManagers = ["npm", "brew", "uv"].filter((key) => managers[key] !== true);
      return h(
        "div",
        { class: "mk" },
        h("div", { class: "mk-sub" }, t("cli.subtitle")),
        h(
          "div",
          { class: "mk-row" },
          h("span", { class: "mk-label" }, t("cli.managers")),
          ...["npm", "brew", "uv"].map((key) =>
            h(
              "span",
              { key, class: "mk-badge", "data-tone": managers[key] ? "ok" : "warn" },
              `${key}: ${managers[key] ? "✓" : t("cli.managerMissing")}`,
            ),
          ),
          h("button", { class: "mk-btn", onClick: load }, t("common.refresh")),
        ),
        h(
          "div",
          { class: "mk-list" },
          ...tools.map((tool) =>
            h(
              "div",
              { key: tool.id, class: "mk-card" },
              h(
                "div",
                { class: "mk-card-head" },
                h("span", { class: "mk-name" }, tool.name),
                h(
                  "span",
                  { class: "mk-badge", "data-tone": tool.installed ? "ok" : "warn" },
                  tool.installed ? t("cli.installed") : t("cli.missing"),
                ),
                tool.installed && tool.version
                  ? h("span", { class: "mk-mono" }, tool.version)
                  : tool.installed
                    ? h("span", { class: "mk-mono" }, t("cli.versionUnknown"))
                    : null,
                h("div", { class: "mk-spacer" }),
                h(
                  "button",
                  {
                    class: "mk-btn",
                    onClick: () => window.open(tool.homepage, "_blank", "noopener,noreferrer"),
                  },
                  t("common.openSite"),
                ),
              ),
              h("div", { class: "mk-desc" }, tool.summary),
              tool.installed && tool.path ? h("div", { class: "mk-mono" }, tool.path) : null,
              ...tool.commands.map((entry) =>
                h(
                  "div",
                  { key: entry.manager },
                  h(
                    "div",
                    { class: "mk-cmd" },
                    h("code", null, entry.command),
                    h(CopyButton, { text: entry.command, t }),
                  ),
                  entry.available
                    ? null
                    : h("div", { class: "mk-note" }, t("cli.noManager", { manager: entry.manager })),
                ),
              ),
              tool.installed
                ? null
                : h(
                    "div",
                    { class: "mk-note" },
                    tool.commands.length > 0 ? "" : t("cli.managerMissing"),
                  ),
            ),
          ),
        ),
        missingManagers.length === 0 ? null : null,
      );
    }

    // ── tab 2: skill market ────────────────────────────────────────────────
    //
    // Discovery is separate from installation on purpose: the catalog ranks
    // repositories by GitHub Stars, and picking one only ever browses it at a
    // resolved commit. The install then happens against that pin, never a branch.
    function SkillMarketTab({ t, api, scope, root }) {
      const [sources, setSources] = useState(null);
      const [sourceId, setSourceId] = useState("");
      const [catalog, setCatalog] = useState({ status: "loading", items: [], fetchedAtMs: null, cache: null, failures: [] });
      const [filter, setFilter] = useState("");
      /** Where the visible listing came from: a catalog repo or a fixed source. */
      const [target, setTarget] = useState(null);
      const [listing, setListing] = useState(null);
      const [busy, setBusy] = useState("");
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);
      const [confirming, setConfirming] = useState(null);

      const loadCatalog = (refresh) => {
        setBusy(refresh ? "catalog:refresh" : "catalog");
        setError(null);
        api
          .catalog(refresh)
          .then((data) =>
            setCatalog({
              status: "ready",
              items: Array.isArray(data?.items) ? data.items : [],
              fetchedAtMs: data?.fetchedAtMs ?? null,
              cache: data?.cache?.status ?? "live",
              failures: Array.isArray(data?.failures) ? data.failures : [],
            }),
          )
          .catch((failure) =>
            setCatalog((previous) => ({ ...previous, status: "error", detail: String(failure?.message ?? failure) })),
          )
          .finally(() => setBusy(""));
      };

      useEffect(() => {
        loadCatalog(false);
      }, []);

      useEffect(() => {
        api
          .sources()
          .then((data) => {
            setSources(data);
            const first = Array.isArray(data?.sources) ? data.sources[0] : null;
            if (first) setSourceId((current) => (current === "" ? first.id : current));
          })
          .catch((failure) => setSources({ sources: [], configError: String(failure?.message ?? failure) }));
      }, []);

      const openListing = (nextTarget) => {
        setBusy(nextTarget.kind === "catalog" ? `browse:${nextTarget.repo}` : "browse");
        setError(null);
        setNotice(null);
        setConfirming(null);
        const request = nextTarget.kind === "catalog" ? api.browseRepo(nextTarget.repo) : api.browse(nextTarget.id);
        request
          .then((data) => {
            setListing(data);
            setTarget(nextTarget);
          })
          .catch((failure) => setError(String(failure?.message ?? failure)))
          .finally(() => setBusy(""));
      };

      const install = (skillName) => {
        if (target === null || listing === null) return;
        setBusy(`install:${skillName}`);
        setError(null);
        // The browsed base path travels with the install so the pinned commit
        // and the pinned directory always belong to the same listing.
        const identity = target.kind === "catalog" ? { repo: target.repo } : { source: target.id };
        api
          .install({ ...identity, ref: listing.ref, path: listing.path, skill: skillName, scope, root, confirm: true })
          .then((result) => {
            setNotice(t("skills.installed", { name: result.installed }));
            setConfirming(null);
          })
          .catch((failure) => setError(t("skills.installFailed", { detail: String(failure?.message ?? failure) })))
          .finally(() => setBusy(""));
      };

      const needle = filter.trim().toLowerCase();
      const items =
        needle === ""
          ? catalog.items
          : catalog.items.filter((item) =>
              `${item.repo} ${item.description ?? ""}`.toLowerCase().includes(needle),
            );

      return h(
        "div",
        { class: "mk" },
        h("div", { class: "mk-sub" }, t("skills.subtitle")),
        h("div", { class: "mk-note" }, t("skills.ratingNote")),
        error ? h("div", { class: "mk-err" }, error) : null,
        notice ? h("div", { class: "mk-ok" }, notice) : null,
        h(
          "div",
          { class: "mk-row" },
          h("span", { class: "mk-label" }, t("skills.catalog")),
          catalog.items.length > 0 ? h("span", { class: "mk-badge" }, String(catalog.items.length)) : null,
          h("div", { class: "mk-spacer" }),
          h(
            "button",
            { class: "mk-btn", disabled: busy !== "", onClick: () => loadCatalog(true) },
            busy === "catalog:refresh" ? t("common.loading") : t("skills.refreshCatalog"),
          ),
        ),
        catalog.status === "loading" ? h("div", { class: "mk-sub" }, t("common.loading")) : null,
        catalog.status === "error" ? h("div", { class: "mk-err" }, t("skills.catalogFailed", { detail: catalog.detail })) : null,
        catalog.status === "ready" && catalog.fetchedAtMs !== null
          ? h(
              "div",
              { class: "mk-note" },
              catalog.cache === "offline"
                ? t("skills.catalogOffline", { time: formatStamp(catalog.fetchedAtMs) })
                : t("skills.catalogUpdated", { time: formatStamp(catalog.fetchedAtMs) }),
            )
          : null,
        catalog.status === "ready" && catalog.failures.length > 0
          ? h("div", { class: "mk-note" }, t("skills.catalogPartial", { detail: catalog.failures.join("; ") }))
          : null,
        catalog.status === "ready" && catalog.items.length === 0
          ? h("div", { class: "mk-sub" }, t("skills.catalogEmpty"))
          : null,
        catalog.status === "ready" && catalog.items.length > 0
          ? h("input", {
              class: "mk-input",
              value: filter,
              spellcheck: "false",
              placeholder: t("skills.filter"),
              "aria-label": t("skills.filter"),
              onChange: (event) => setFilter(event.target.value),
            })
          : null,
        items.length > 0
          ? h(
              "div",
              { class: "mk-cards" },
              ...items.map((item) =>
                h(
                  "div",
                  { key: item.repo, class: "mk-card" },
                  h(
                    "div",
                    { class: "mk-card-head" },
                    h("span", { class: "mk-name" }, item.repo),
                    h(
                      "span",
                      { class: "mk-badge", "data-tone": "rating", title: t("skills.ratingNote") },
                      `★ ${formatStars(item.stars)}`,
                    ),
                    item.license ? h("span", { class: "mk-badge" }, item.license) : null,
                    h("div", { class: "mk-spacer" }),
                    h(
                      "button",
                      {
                        class: "mk-btn",
                        "data-variant":
                          target?.kind === "catalog" && target.repo === item.repo ? "primary" : null,
                        disabled: busy !== "",
                        onClick: () => openListing({ kind: "catalog", repo: item.repo }),
                      },
                      t("skills.browse"),
                    ),
                  ),
                  item.description ? h("div", { class: "mk-desc" }, item.description) : null,
                ),
              ),
            )
          : null,
        listing !== null
          ? h(
              "div",
              { class: "mk" },
              h("hr", { class: "mk-hr" }),
              h(
                "div",
                { class: "mk-row" },
                h("span", { class: "mk-label" }, t("skills.pinnedAt", { ref: String(listing.ref).slice(0, 7) })),
                h("span", { class: "mk-badge" }, listing.source.repo),
                h("span", { class: "mk-mono" }, listing.path === "" ? "/" : listing.path),
              ),
              listing.truncated ? h("div", { class: "mk-err" }, t("skills.truncated")) : null,
              listing.skills.length === 0
                ? h("div", { class: "mk-sub" }, t("skills.empty"))
                : h(
                    "div",
                    { class: "mk-list" },
                    ...listing.skills.map((skill) =>
                      h(
                        "div",
                        { key: skill.name, class: "mk-card" },
                        h(
                          "div",
                          { class: "mk-card-head" },
                          h("span", { class: "mk-name" }, skill.name),
                          h("span", { class: "mk-badge" }, t("common.files", { count: skill.files })),
                          h("div", { class: "mk-spacer" }),
                          confirming === skill.name
                            ? null
                            : h(
                                "button",
                                {
                                  class: "mk-btn",
                                  "data-variant": "primary",
                                  disabled: busy !== "" || listing.truncated || (scope === "workspace" && !root),
                                  onClick: () => setConfirming(skill.name),
                                },
                                t("common.install"),
                              ),
                        ),
                        skill.description ? h("div", { class: "mk-desc" }, skill.description) : null,
                        confirming === skill.name
                          ? h(
                              "div",
                              { class: "mk-confirm" },
                              h(
                                "span",
                                null,
                                t("skills.installConfirm", {
                                  name: skill.name,
                                  repo: listing.source.repo,
                                  ref: String(listing.ref).slice(0, 7),
                                }),
                              ),
                              h(
                                "button",
                                {
                                  class: "mk-btn",
                                  "data-variant": "primary",
                                  disabled: busy !== "",
                                  onClick: () => install(skill.name),
                                },
                                busy === `install:${skill.name}` ? t("skills.installing") : t("common.confirm"),
                              ),
                              h(
                                "button",
                                { class: "mk-btn", disabled: busy !== "", onClick: () => setConfirming(null) },
                                t("common.cancel"),
                              ),
                            )
                          : null,
                      ),
                    ),
                  ),
            )
          : null,
        h(
          "details",
          { class: "mk-details" },
          h("summary", { class: "mk-note" }, t("skills.sourceSection")),
          h(
            "div",
            { class: "mk" },
            h(
              "div",
              { class: "mk-row" },
              h("span", { class: "mk-label" }, t("skills.source")),
              h(
                "select",
                {
                  class: "mk-select mk-wide",
                  value: sourceId,
                  "aria-label": t("skills.source"),
                  onChange: (event) => setSourceId(event.target.value),
                },
                ...((sources?.sources ?? []).map((source) =>
                  h("option", { key: source.id, value: source.id }, `${source.label} (${source.repo})`),
                )),
              ),
              h(
                "button",
                {
                  class: "mk-btn",
                  disabled: !sourceId || busy !== "",
                  onClick: () => openListing({ kind: "source", id: sourceId }),
                },
                t("skills.browse"),
              ),
            ),
            h("div", { class: "mk-note" }, t("skills.pin")),
            sources?.configError ? h("div", { class: "mk-err" }, sources.configError) : null,
          ),
        ),
      );
    }

    // ── tab 3: custom skills ───────────────────────────────────────────────
    //
    // One inventory, three groups: what this page authored, what it installed
    // from a pinned source, and everything it merely found (read-only, collapsed
    // by default). Without the grouping this tab reads like a second catalog,
    // because a skills root is mostly third-party directories.
    const SKILL_GROUPS = ["custom", "source", "readonly"];

    function CustomSkillTab({ t, api, scope, root }) {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);
      const [form, setForm] = useState(null);
      const [confirming, setConfirming] = useState(null);
      const [openGroups, setOpenGroups] = useState({ custom: true, source: true, readonly: false });

      const load = () => {
        setError(null);
        api
          .skills(scope, root)
          .then(setData)
          .catch((failure) => setError(String(failure?.message ?? failure)));
      };
      useEffect(load, [scope, root]);

      const save = () => {
        setError(null);
        api
          .save({ scope, root, name: form.name.trim(), description: form.description, body: form.body })
          .then(() => {
            setNotice(t("custom.saved", { name: form.name.trim() }));
            setForm(null);
            load();
          })
          .catch((failure) => setError(t("custom.saveFailed", { detail: String(failure?.message ?? failure) })));
      };

      const remove = (name) => {
        setError(null);
        api
          .remove({ scope, root, name, confirm: true })
          .then(() => {
            setNotice(t("custom.removed", { name }));
            setConfirming(null);
            load();
          })
          .catch((failure) => setError(t("custom.removeFailed", { detail: String(failure?.message ?? failure) })));
      };

      const groupLabel = (id) =>
        id === "custom" ? t("custom.groupCustom") : id === "source" ? t("custom.groupSource") : t("custom.groupReadonly");

      /** Unknown or missing provenance counts as read-only, never as editable. */
      const groupOf = (skill) => (skill.origin === "custom" || skill.origin === "source" ? skill.origin : "readonly");

      const skillCard = (skill) =>
        h(
          "div",
          { key: skill.name, class: "mk-card" },
          h(
            "div",
            { class: "mk-card-head" },
            h("span", { class: "mk-name" }, skill.name),
            h(
              "span",
              { class: "mk-badge", "data-tone": groupOf(skill) === "readonly" ? "warn" : "ok" },
              skill.origin === "custom" ? t("custom.byPage") : skill.origin === "source" ? t("custom.bySource") : t("custom.readonly"),
            ),
            h("span", { class: "mk-badge" }, t("common.files", { count: skill.files })),
            h("div", { class: "mk-spacer" }),
            skill.origin === "custom"
              ? h(
                  "button",
                  {
                    class: "mk-btn",
                    onClick: () => setForm({ name: skill.name, description: skill.description, body: skill.body }),
                  },
                  t("custom.edit"),
                )
              : null,
            skill.origin === "readonly"
              ? null
              : h(
                  "button",
                  { class: "mk-btn", "data-variant": "danger", onClick: () => setConfirming(skill.name) },
                  t("common.remove"),
                ),
          ),
          skill.description ? h("div", { class: "mk-desc" }, skill.description) : null,
          skill.origin === "readonly"
            ? h("div", { class: "mk-note" }, t("custom.readonlyNote", { dir: skill.dir }))
            : h("div", { class: "mk-mono" }, skill.dir),
          skill.source
            ? h("div", { class: "mk-mono" }, `${skill.source.repo} @ ${String(skill.source.ref).slice(0, 7)}`)
            : null,
          confirming === skill.name
            ? h(
                "div",
                { class: "mk-confirm" },
                h("span", null, t("custom.removeConfirm", { name: skill.name })),
                h(
                  "button",
                  { class: "mk-btn", "data-variant": "danger", onClick: () => remove(skill.name) },
                  t("common.confirm"),
                ),
                h("button", { class: "mk-btn", onClick: () => setConfirming(null) }, t("common.cancel")),
              )
            : null,
        );

      const groups =
        data === null
          ? []
          : SKILL_GROUPS.map((id) => ({ id, skills: data.skills.filter((skill) => groupOf(skill) === id) })).filter(
              (group) => group.skills.length > 0,
            );

      return h(
        "div",
        { class: "mk" },
        h("div", { class: "mk-sub" }, t("custom.subtitle")),
        error ? h("div", { class: "mk-err" }, error) : null,
        notice ? h("div", { class: "mk-ok" }, notice) : null,
        data?.provenance?.length
          ? h(
              "div",
              { class: "mk-note" },
              `${t("custom.provenance")}: `,
              ...data.provenance.map((note) =>
                h("div", { key: note.file, class: "mk-mono" },
                  `${note.file}${note.repository ? ` · ${note.repository}` : ""}${note.commit ? ` @ ${note.commit.slice(0, 7)}` : ""}${note.license ? ` · ${note.license}` : ""}`),
              ),
            )
          : null,
        h(
          "div",
          { class: "mk-row" },
          h(
            "button",
            {
              class: "mk-btn",
              "data-variant": "primary",
              disabled: scope === "workspace" && !root,
              onClick: () => setForm({ name: "", description: "", body: "" }),
            },
            t("custom.new"),
          ),
          h("button", { class: "mk-btn", onClick: load }, t("common.refresh")),
          data ? h("span", { class: "mk-mono" }, t("custom.dir", { dir: data.dir })) : null,
        ),
        form
          ? h(
              "div",
              { class: "mk-card" },
              h(
                "div",
                { class: "mk-field" },
                h("span", { class: "mk-label" }, t("custom.name")),
                h("input", {
                  class: "mk-input",
                  value: form.name,
                  spellcheck: "false",
                  onChange: (event) => setForm({ ...form, name: event.target.value }),
                }),
              ),
              h(
                "div",
                { class: "mk-field" },
                h("span", { class: "mk-label" }, t("custom.description")),
                h("input", {
                  class: "mk-input",
                  value: form.description,
                  onChange: (event) => setForm({ ...form, description: event.target.value }),
                }),
              ),
              h(
                "div",
                { class: "mk-field" },
                h("span", { class: "mk-label" }, t("custom.body")),
                h("textarea", {
                  class: "mk-area",
                  value: form.body,
                  onChange: (event) => setForm({ ...form, body: event.target.value }),
                }),
              ),
              h(
                "div",
                { class: "mk-row" },
                h(
                  "button",
                  {
                    class: "mk-btn",
                    "data-variant": "primary",
                    disabled: form.name.trim() === "" || form.description.trim() === "" || form.body.trim() === "",
                    onClick: save,
                  },
                  t("common.save"),
                ),
                h("button", { class: "mk-btn", onClick: () => setForm(null) }, t("common.cancel")),
              ),
            )
          : null,
        data === null
          ? h("div", { class: "mk-sub" }, t("common.loading"))
          : data.skills.length === 0
            ? h("div", { class: "mk-sub" }, t("custom.none"))
            : groups.map((group) =>
                h(
                  "div",
                  { key: group.id, class: "mk-group" },
                  h(
                    "button",
                    {
                      type: "button",
                      class: "mk-group-head",
                      "data-open": openGroups[group.id] ? "1" : "0",
                      "aria-expanded": openGroups[group.id] ? "true" : "false",
                      onClick: () => setOpenGroups({ ...openGroups, [group.id]: !openGroups[group.id] }),
                    },
                    h("span", { class: "mk-caret" }, openGroups[group.id] ? "▾" : "▸"),
                    h("span", null, `${groupLabel(group.id)} · ${t("custom.groupCount", { count: group.skills.length })}`),
                  ),
                  openGroups[group.id] ? h("div", { class: "mk-list" }, ...group.skills.map(skillCard)) : null,
                ),
              ),
      );
    }

    // ── section shell ──────────────────────────────────────────────────────
    /**
     * Renders the real failure instead of an empty panel: a section that throws
     * must say so, otherwise a blank column is indistinguishable from "no data".
     */
    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        if (this.state.error !== null) {
          return h(
            "div",
            { class: "mk-err" },
            `market section failed to render: ${String(this.state.error?.message ?? this.state.error)}`,
          );
        }
        return this.props.children;
      }
    }

    function MarketSection(props) {
      const { t, api, useWorkspaces } = props;
      const [tab, setTab] = useState("cli");
      const [scope, setScope] = useState("user");
      const [root, setRoot] = useState("");
      const [workspaces, setWorkspaces] = useState([]);

      useEffect(() => {
        let live = true;
        api
          .workspaces()
          .then((data) => {
            if (live) setWorkspaces(Array.isArray(data?.workspaces) ? data.workspaces : []);
          })
          .catch(() => {
            if (live) setWorkspaces([]);
          });
        return () => {
          live = false;
        };
      }, []);

      const scoped = tab !== "cli";
      return h(
        "div",
        { class: "mk" },
        h(
          "div",
          { class: "mk-tabs", role: "tablist" },
          ...[
            ["cli", t("tab.cli")],
            ["skills", t("tab.skills")],
            ["custom", t("tab.custom")],
          ].map(([id, label]) =>
            h(
              "button",
              {
                key: id,
                type: "button",
                role: "tab",
                class: "mk-tab",
                "data-active": tab === id ? "1" : "0",
                "aria-selected": tab === id ? "true" : "false",
                onClick: () => setTab(id),
              },
              label,
            ),
          ),
        ),
        scoped
          ? h(ScopePicker, { t, scope, setScope, root, setRoot, workspaces })
          : null,
        tab === "cli"
          ? h(CliTab, { t, api })
          : tab === "skills"
            ? h(SkillMarketTab, { t, api, scope, root })
            : h(CustomSkillTab, { t, api, scope, root }),
      );
    }

    const inject = ["slots", "locale"];

    async function apply(ctx) {
      injectStyles();
      const locale = ctx.locale || (typeof ctx.get === "function" ? ctx.get("locale") : undefined);
      if (locale && typeof locale.register === "function") {
        ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), "dsh-market.locale");
      }
      const bound = locale && typeof locale.bind === "function" ? locale.bind(NS) : null;
      const fallback = (key, values) => {
        const dict = ZH;
        const text = dict[key] ?? key;
        return values
          ? text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`))
          : text;
      };

      const api = {
        cli: () => getJson("/dsh-market/cli"),
        catalog: (refresh) => getJson(`/dsh-market/catalog${refresh ? "?refresh=1" : ""}`),
        workspaces: () => getJson("/dsh-market/workspaces"),
        sources: () => getJson("/dsh-market/sources"),
        skills: (scope, root) => getJson(`/dsh-market/skills${query({ scope, root })}`),
        browse: (source, path) => getJson(`/dsh-market/source/browse${query({ source, path })}`),
        browseRepo: (repo, path) => getJson(`/dsh-market/source/browse${query({ repo, path })}`),
        resolve: (source) => getJson(`/dsh-market/source/resolve${query({ source })}`),
        install: (body) => postJson("/dsh-market/skills/install", body),
        save: (body) => postJson("/dsh-market/skills/save", body),
        remove: (body) => postJson("/dsh-market/skills/remove", body),
      };

      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "market",
            order: 50,
            label: () => (bound ?? fallback)("section.label"),
            locale: NS,
            // `t` travels through the inject face as well: the section slot does
            // not guarantee a locale-bound prop, and every string here needs one.
            inject: () => ({ api, t: bound ?? fallback }),
          },
          (props) => h(Boundary, null, h(MarketSection, { ...props, t: props.t ?? bound ?? fallback })),
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    return module.exports;
  },
});
