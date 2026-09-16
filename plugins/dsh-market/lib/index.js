// dsh-market — host half.
//
// Three surfaces behind the composition's browser-trust fence:
//   * CLI catalog: resolve each curated binary on PATH and read its version.
//     Detection ONLY — this plugin never installs anything; it hands the user an
//     install command to copy.
//   * Skill marketplace: a skill-repository catalog ranked by GitHub Stars,
//     plus browse a GitHub source pinned to a full commit, and install a skill
//     directory into a workspace or user skill root.
//   * Custom skills: create/update/remove skills this plugin authored.
//
// Supply-chain stance (mirrors this repository's vendored-skill discipline):
//   * sources resolve to a 40-hex commit before anything is browsed or
//     installed — never a mutable branch;
//   * every install writes a provenance `SOURCE.md` next to the skill;
//   * a skill directory this plugin did not create is READ-ONLY here. The
//     repository vendors packs into `.agents/skills` and forbids hand-editing
//     them, so an unmarked directory is listed and never written or deleted.
//   * the catalog is a DISCOVERY surface only: Stars rank repositories for the
//     page, and installing a catalog entry still goes through the same pinned
//     commit + provenance path as a configured source.
//
// Security: node builtins only (a profile plugin cannot resolve harness
// packages), argv-only child processes, no shell, bounded JSON bodies, and
// every route behind `connection.requestRejection`.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve as resolvePath, sep } from "node:path";

/** Cordis function-plugin name. */
export const name = "dsh-market";
/** Route carrier, trust fence, and PATH resolver. */
export const inject = ["webServer", "connection", "subprocess"];

const PREFIX = "/dsh-market";
const ROUTE = {
  cli: `${PREFIX}/cli`,
  catalog: `${PREFIX}/catalog`,
  skills: `${PREFIX}/skills`,
  sources: `${PREFIX}/sources`,
  workspaces: `${PREFIX}/workspaces`,
  browse: `${PREFIX}/source/browse`,
  resolve: `${PREFIX}/source/resolve`,
  install: `${PREFIX}/skills/install`,
  save: `${PREFIX}/skills/save`,
  remove: `${PREFIX}/skills/remove`,
};

const MAX_BODY_BYTES = 256 * 1024;
const MARKER = ".dsh-market.json";
/** A skill directory name; also the guard against path traversal. */
const SKILL_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
/** `owner/name`; also the guard against a crafted repository identifier. */
const REPO = /^[\w.-]+\/[\w.-]+$/;

/** Built-in skill source. Verified reachable and stable at the pinned commit. */
const BUILTIN_SOURCES = [
  {
    id: "anthropic-skills",
    label: "Anthropic Skills",
    repo: "anthropics/skills",
    path: "skills",
    homepage: "https://github.com/anthropics/skills",
    license: "see repository",
  },
];

/**
 * Topics that carry agent-skill repositories. One search per topic, merged and
 * sorted by stars: GitHub Stars are the only public per-repository "rating"
 * available without an account. They rate the REPOSITORY, not a single skill —
 * the page says so instead of implying a per-skill score.
 */
const CATALOG_TOPICS = ["agent-skills", "claude-skills", "claude-skill", "codex-skills"];
/** Search results kept per topic before merging. */
const CATALOG_PER_TOPIC = 30;
/** Entries the page shows after merging and sorting by stars. */
const CATALOG_LIMIT = 40;
/** A cached catalog is served for this long before a refresh is attempted. */
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
/** Never read a catalog cache file larger than this. */
const CATALOG_MAX_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── environment ────────────────────────────────────────────────────────────

function dshHome() {
  const value = process.env.DSH_HOME;
  return typeof value === "string" && value.trim() !== "" ? value : join(homedir(), ".dsh");
}

/** Mirrors `@deepseek-ai/dsh-skill-filesystem`'s user root. */
function userSkillsDir() {
  const override = process.env.DSH_AGENTS_HOME;
  const agentsHome =
    typeof override === "string" && override !== "" ? override : join(homedir(), ".agents");
  return join(agentsHome, "skills");
}

function marketConfigPath() {
  return join(dshHome(), "market.json");
}

/** User sources, merged over the built-ins by id. A broken file yields none. */
function readSources() {
  const file = marketConfigPath();
  const user = [];
  let error = null;
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      for (const entry of Array.isArray(parsed?.skillSources) ? parsed.skillSources : []) {
        if (typeof entry?.id !== "string" || typeof entry?.repo !== "string") continue;
        if (!REPO.test(entry.repo)) continue;
        user.push({
          id: entry.id.trim(),
          label: typeof entry.label === "string" ? entry.label : entry.repo,
          repo: entry.repo.trim(),
          path: typeof entry.path === "string" ? entry.path.trim() : "",
          homepage: typeof entry.homepage === "string" ? entry.homepage : `https://github.com/${entry.repo}`,
          license: typeof entry.license === "string" ? entry.license : "see repository",
        });
      }
    } catch (parseError) {
      error = `could not parse ${file}: ${String(parseError?.message ?? parseError)}`;
    }
  }
  const merged = new Map(BUILTIN_SOURCES.map((source) => [source.id, source]));
  for (const source of user) merged.set(source.id, source);
  return { sources: [...merged.values()], error, configPath: file };
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ── process helpers (argv only, never a shell) ─────────────────────────────

/**
 * Directories worth searching besides `PATH`.
 *
 * A macOS GUI launch hands the Harness a minimal `PATH` (`/usr/bin:/bin:…`), so
 * a tool the user installed normally (`/usr/local/bin`, Homebrew, pnpm, nvm,
 * cargo, uv) is invisible to a plain `PATH` scan. Detection that only looked at
 * `PATH` would report correctly-installed tools as missing on the desktop.
 */
function extraBinDirs() {
  const home = homedir();
  const dirs = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    join(home, ".local", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".cargo", "bin"),
    join(home, ".volta", "bin"),
    join(home, "Library", "pnpm"),
    join(home, ".npm-global", "bin"),
  ];
  // nvm keeps one bin directory per installed Node; newest first.
  try {
    const versionsDir = join(home, ".nvm", "versions", "node");
    for (const version of readdirSync(versionsDir).sort().reverse()) {
      dirs.push(join(versionsDir, version, "bin"));
    }
  } catch {
    /* nvm is optional */
  }
  return dirs;
}

function searchDirs() {
  const seen = new Set();
  const dirs = [];
  for (const dir of [...String(process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":"), ...extraBinDirs()]) {
    if (dir === "" || seen.has(dir)) continue;
    seen.add(dir);
    dirs.push(dir);
  }
  return dirs;
}

/** Resolve one PATH name, preferring the host's own resolver when present. */
async function resolveExecutable(ctx, command) {
  try {
    const resolved = await ctx.subprocess?.resolveExecutable?.(command);
    if (typeof resolved === "string" && resolved !== "" && existsSync(resolved)) return resolved;
  } catch {
    /* fall through to the local scan */
  }
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of searchDirs()) {
    for (const extension of extensions) {
      const candidate = join(dir, command + extension);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** Credential-scrubbed copy of this process's environment. */
function scrubbedEnv() {
  const out = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|COOKIE/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Environment for a version probe: the search path plus the directory of the
 * Node that runs this host. Most catalog entries are Node programs behind an
 * `#!/usr/bin/env node` shebang, and a desktop launch gives the Harness a
 * `PATH` with no `node` on it — without this, such a tool resolves but reports
 * no version at all.
 */
function probeEnv() {
  const dirs = [dirname(process.execPath), ...searchDirs()];
  return {
    ...scrubbedEnv(),
    PATH: dirs.join(process.platform === "win32" ? ";" : ":"),
  };
}

/** Run an argv command with a deadline; resolves stdout on exit 0, else null. */
function runCapture(command, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, [...args], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
        env: probeEnv(),
      });
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      settle(null);
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      if (out.length < 4096) out += String(chunk);
    });
    child.on("error", () => settle(null));
    child.on("close", (code) => settle(code === 0 ? out : null));
  });
}

/** First non-empty line of `--version` output, trimmed to something readable. */
function firstVersionLine(output) {
  if (typeof output !== "string") return null;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (line !== "") return line.slice(0, 120);
  }
  return null;
}

// ── CLI catalog ────────────────────────────────────────────────────────────

function loadCatalog() {
  return JSON.parse(readFileSync(new URL("./cli-catalog.json", import.meta.url), "utf8"));
}

/**
 * Install commands are DERIVED from the catalog's package fields so the shown
 * command always matches a package name that exists in that registry.
 */
function installCommands(tool, managers) {
  const commands = [];
  if (typeof tool.npm === "string") {
    commands.push({
      manager: "npm",
      command: `npm install -g ${tool.npm}`,
      available: managers.npm !== null,
    });
  }
  if (typeof tool.brew === "string") {
    commands.push({
      manager: "brew",
      command: `brew install ${tool.brew}`,
      available: managers.brew !== null,
    });
  }
  if (typeof tool.uv === "string") {
    commands.push({
      manager: "uv",
      command: `uv tool install ${tool.uv}`,
      available: managers.uv !== null,
    });
  }
  return commands;
}

async function detectTools(ctx) {
  const managers = {
    npm: await resolveExecutable(ctx, "npm"),
    brew: await resolveExecutable(ctx, "brew"),
    uv: await resolveExecutable(ctx, "uv"),
  };
  const tools = [];
  for (const tool of loadCatalog().tools) {
    const executable = await resolveExecutable(ctx, tool.detect);
    let version = null;
    if (executable !== null) version = firstVersionLine(await runCapture(executable, ["--version"]));
    tools.push({
      ...tool,
      installed: executable !== null,
      path: executable,
      version,
      commands: installCommands(tool, managers),
    });
  }
  return {
    managers: {
      npm: managers.npm !== null,
      brew: managers.brew !== null,
      uv: managers.uv !== null,
    },
    tools,
  };
}

// ── skill roots, provenance, and markers ───────────────────────────────────

function resolveScope(scope, root) {
  if (scope === "user") return { scope, dir: userSkillsDir() };
  if (scope === "workspace") {
    if (typeof root !== "string" || root === "" || !isAbsolute(root)) {
      throw new HttpError(400, "bad-request", "workspace root must be an absolute path");
    }
    if (!isDir(root)) {
      throw new HttpError(404, "not-found", `workspace directory does not exist: ${root}`);
    }
    return { scope, dir: join(root, ".agents", "skills") };
  }
  throw new HttpError(400, "bad-request", 'scope must be "user" or "workspace"');
}

function assertSkillName(value) {
  if (typeof value !== "string" || !SKILL_NAME.test(value)) {
    throw new HttpError(400, "bad-request", "skill name must match [a-z0-9][a-z0-9._-]{0,63}");
  }
  return value;
}

/** Minimal `--- name: … ---` reader; no YAML dependency. */
function parseFrontmatter(text) {
  if (!text.startsWith("---")) return { fields: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { fields: {}, body: text };
  const fields = {};
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (match === null) continue;
    fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fields, body: text.slice(end + 4).replace(/^\s*\n/, "") };
}

function buildSkillMarkdown({ skillName, description, body }) {
  const quoted = /[:#]/.test(description) ? JSON.stringify(description) : description;
  return `---\nname: ${skillName}\ndescription: ${quoted}\n---\n\n${body.trimEnd()}\n`;
}

function readMarker(dir) {
  const file = join(dir, MARKER);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return typeof parsed?.kind === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Provenance notes a root carries (`<name>.SOURCE.md`), for display. */
function readProvenance(rootDir) {
  if (!isDir(rootDir)) return [];
  const notes = [];
  for (const entry of readdirSync(rootDir)) {
    if (!entry.endsWith(".SOURCE.md")) continue;
    const text = readFileSync(join(rootDir, entry), "utf8");
    notes.push({
      file: entry,
      repository: /-\s*Repository:\s*(\S+)/.exec(text)?.[1] ?? null,
      commit: /-\s*Reviewed commit:\s*`?([0-9a-f]{7,40})`?/.exec(text)?.[1] ?? null,
      license: /-\s*License:\s*(.+)/.exec(text)?.[1]?.trim() ?? null,
    });
  }
  return notes;
}

function readSkill(rootDir, entry) {
  const dir = join(rootDir, entry);
  const skillFile = join(dir, "SKILL.md");
  if (!existsSync(skillFile)) return null;
  const { fields, body } = parseFrontmatter(readFileSync(skillFile, "utf8"));
  const marker = readMarker(dir);
  return {
    name: entry,
    displayName: typeof fields.name === "string" ? fields.name : entry,
    description: typeof fields.description === "string" ? fields.description : "",
    // `custom` is authored here; `source` came from a pinned source; anything
    // else is read-only because this plugin did not create it.
    origin: marker === null ? "readonly" : marker.kind === "custom" ? "custom" : "source",
    source: marker?.repo ? { repo: marker.repo, ref: marker.ref, path: marker.path } : null,
    body,
    dir,
    files: countFiles(dir),
  };
}

function countFiles(dir, depth = 0) {
  if (depth > 4) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === MARKER) continue;
    if (entry.isDirectory()) total += countFiles(join(dir, entry.name), depth + 1);
    else total += 1;
  }
  return total;
}

function listSkills(rootDir) {
  const skills = [];
  if (isDir(rootDir)) {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const skill = readSkill(rootDir, entry.name);
      if (skill !== null) skills.push(skill);
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return {
    dir: rootDir,
    exists: isDir(rootDir),
    skills,
    provenance: readProvenance(rootDir),
  };
}

/**
 * Workspaces the registry knows about, read from the host's own store so the
 * page can offer a picker without depending on client snapshot shapes. The
 * store is versioned internal state, so a missing or unreadable file degrades
 * to an empty list and the page falls back to a typed path.
 */
function listWorkspaces() {
  const file = join(dshHome(), "storages", "workspace.json");
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const table = parsed?.tables?.workspaces;
    if (typeof table !== "object" || table === null) return [];
    const rows = [];
    for (const value of Object.values(table)) {
      if (typeof value?.path !== "string" || value.path === "") continue;
      rows.push({
        id: typeof value.id === "string" ? value.id : value.path,
        title: typeof value.title === "string" && value.title !== "" ? value.title : value.path,
        path: value.path,
      });
    }
    rows.sort((a, b) => a.title.localeCompare(b.title));
    return rows;
  } catch {
    return [];
  }
}

/** Writable only when this plugin owns the directory. */
function assertOwned(rootDir, skillName, { allowMissing }) {
  const dir = join(rootDir, assertSkillName(skillName));
  if (!existsSync(dir)) {
    if (allowMissing) return dir;
    throw new HttpError(404, "not-found", `skill not installed: ${skillName}`);
  }
  if (!isDir(dir)) throw new HttpError(400, "bad-request", `${skillName} is not a directory`);
  if (readMarker(dir) === null) {
    throw new HttpError(
      409,
      "read-only",
      `${skillName} was not created by this page (no ${MARKER}); it is treated as read-only. Edit it externally at ${dir}`,
    );
  }
  return dir;
}

// ── GitHub (pinned commit only) ────────────────────────────────────────────

async function githubJson(path, timeoutMs = 15000) {
  let response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "dsh-market" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new HttpError(502, "github-unreachable", `GitHub 无法访问：${String(error?.message ?? error)}`);
  }
  if (response.status === 403 || response.status === 429) {
    throw new HttpError(429, "github-rate-limit", "GitHub API 触发限流（未认证每小时 60 次），请稍后重试");
  }
  if (response.status === 404) {
    throw new HttpError(404, "github-not-found", `GitHub 上找不到：${path}`);
  }
  if (!response.ok) {
    throw new HttpError(502, "github-error", `GitHub API 返回 ${response.status}`);
  }
  return response.json();
}

/** Resolve a source's default branch to a full commit — the pin we browse at. */
async function resolveSourceCommit(source) {
  const commits = await githubJson(`/repos/${source.repo}/commits?per_page=1`);
  const sha = Array.isArray(commits) ? commits[0]?.sha : null;
  if (typeof sha !== "string" || !COMMIT.test(sha)) {
    throw new HttpError(502, "github-error", `无法解析 ${source.repo} 的提交`);
  }
  return sha;
}

// ── rated skill catalog (GitHub Stars) ─────────────────────────────────────
//
// Discovery only. A catalog row carries no install authority: the page sends
// the repository back through the same pinned-commit browse/install path as a
// configured source, so nothing here can install a moving branch.

function skillCatalogPath() {
  return join(dshHome(), "market-catalog.json");
}

/**
 * Whitelist one search result (or one cached row) into the shape the page
 * renders. Never pass a GitHub payload through: the page must not be handed
 * arbitrary fields from a remote response.
 */
function normalizeSkillRepo(raw) {
  const repo = String(raw?.repo ?? raw?.full_name ?? "");
  if (!REPO.test(repo)) return null;
  const stars = Number(raw?.stars ?? raw?.stargazers_count);
  const licenseField = raw?.license;
  const license =
    typeof licenseField === "string" && licenseField !== ""
      ? licenseField
      : typeof licenseField?.spdx_id === "string" && licenseField.spdx_id !== "NOASSERTION"
        ? licenseField.spdx_id
        : typeof licenseField?.name === "string"
          ? licenseField.name
          : null;
  const homepage = raw?.homepage ?? raw?.html_url;
  const pushedAt = raw?.pushedAt ?? raw?.pushed_at;
  return {
    repo,
    label: typeof raw?.label === "string" && raw.label !== "" ? raw.label : (repo.split("/")[1] ?? repo),
    description: typeof raw?.description === "string" ? raw.description.slice(0, 500) : "",
    stars: Number.isFinite(stars) && stars > 0 ? Math.floor(stars) : 0,
    homepage: typeof homepage === "string" && homepage !== "" ? homepage : `https://github.com/${repo}`,
    license: license === null ? null : String(license).slice(0, 60),
    pushedAt: typeof pushedAt === "string" ? pushedAt : null,
  };
}

/** Last catalog we fetched, or null when there is none readable. */
function readSkillCatalogCache() {
  const file = skillCatalogPath();
  let text;
  try {
    const stats = statSync(file);
    if (!stats.isFile() || stats.size > CATALOG_MAX_BYTES) return null;
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    const fetchedAtMs = Number(parsed?.fetchedAtMs);
    if (!Number.isFinite(fetchedAtMs)) return null;
    const items = (Array.isArray(parsed?.items) ? parsed.items : [])
      .map(normalizeSkillRepo)
      .filter((item) => item !== null)
      .slice(0, CATALOG_LIMIT);
    return {
      items,
      fetchedAtMs,
      failures: (Array.isArray(parsed?.failures) ? parsed.failures : []).map(String).slice(0, 8),
    };
  } catch {
    return null;
  }
}

/** Best-effort cache write: the page still gets the live result either way. */
function writeSkillCatalogCache(catalog) {
  const file = skillCatalogPath();
  const body =
    JSON.stringify(
      {
        schemaVersion: 1,
        fetchedAtMs: catalog.fetchedAtMs,
        topics: CATALOG_TOPICS,
        failures: catalog.failures,
        items: catalog.items,
      },
      null,
      2,
    ) + "\n";
  try {
    mkdirSync(dirname(file), { recursive: true });
    const staging = `${file}.tmp`;
    writeFileSync(staging, body);
    renameSync(staging, file);
  } catch {
    /* cache is optional */
  }
}

/**
 * One stars-sorted search per topic, merged by repository and cut to the page's
 * limit. A topic that fails degrades to a note instead of an empty catalog, but
 * a total failure is an error the page must show.
 */
async function fetchSkillCatalog() {
  const merged = new Map();
  const failures = [];
  for (const topic of CATALOG_TOPICS) {
    try {
      const payload = await githubJson(
        `/search/repositories?q=${encodeURIComponent(`topic:${topic}`)}&sort=stars&order=desc&per_page=${CATALOG_PER_TOPIC}`,
      );
      for (const raw of Array.isArray(payload?.items) ? payload.items : []) {
        const item = normalizeSkillRepo(raw);
        if (item === null) continue;
        const known = merged.get(item.repo);
        if (known === undefined || item.stars > known.stars) merged.set(item.repo, item);
      }
    } catch (error) {
      failures.push(`${topic}: ${String(error?.message ?? error)}`);
    }
  }
  const items = [...merged.values()]
    .sort((a, b) => b.stars - a.stars || a.repo.localeCompare(b.repo))
    .slice(0, CATALOG_LIMIT);
  if (items.length === 0) {
    throw new HttpError(502, "github-error", `技能目录读取失败：${failures.join("；") || "GitHub 没有返回结果"}`);
  }
  return { items, fetchedAtMs: Date.now(), failures };
}

/** Cache first, one live fetch when it is stale or the page asked to refresh. */
async function skillCatalog(url) {
  const cached = readSkillCatalogCache();
  const force = url.searchParams.get("refresh") === "1";
  if (!force && cached !== null && Date.now() - cached.fetchedAtMs < CATALOG_TTL_MS) {
    return { ...cached, cache: { status: "fresh" } };
  }
  try {
    const live = await fetchSkillCatalog();
    writeSkillCatalogCache(live);
    return { ...live, cache: { status: "live" } };
  } catch (error) {
    // A stale catalog beats an empty page, and says it is stale.
    if (cached !== null) return { ...cached, cache: { status: "offline" } };
    throw error;
  }
}

function findSource(id) {
  const source = readSources().sources.find((candidate) => candidate.id === id);
  if (source === undefined) throw new HttpError(404, "unknown-source", `unknown source: ${id}`);
  return source;
}

/**
 * An ad-hoc source for one catalog repository. Its base path is empty on
 * purpose: `browseSource`/`installSkill` then derive it from the tree.
 */
function repoSource(repo) {
  const value = String(repo ?? "").trim();
  if (!REPO.test(value)) {
    throw new HttpError(400, "bad-request", `repo must look like owner/name: ${value === "" ? "(empty)" : value}`);
  }
  return {
    id: value,
    label: value,
    repo: value,
    path: "",
    homepage: `https://github.com/${value}`,
    license: "see repository",
  };
}

/** A configured source id or a catalog repository; exactly one is required. */
function resolveSource({ sourceId, repo }) {
  if (typeof repo === "string" && repo.trim() !== "") return repoSource(repo);
  return findSource(String(sourceId ?? ""));
}

/** One pinned commit's blob list — the single tree read browse and install share. */
async function pinnedTree(source, ref) {
  const pinned = COMMIT.test(String(ref)) ? ref : await resolveSourceCommit(source);
  const tree = await githubJson(`/repos/${source.repo}/git/trees/${pinned}?recursive=1`);
  const paths = (Array.isArray(tree?.tree) ? tree.tree : [])
    .filter((entry) => entry?.type === "blob" && typeof entry.path === "string" && !entry.path.includes(".."))
    .map((entry) => entry.path);
  return { pinned, paths, truncated: tree?.truncated === true };
}

/**
 * Where a repository keeps its skills.
 *
 * A configured source may pin `path` (the built-in one points at `skills/`). A
 * catalog repository does not, so the base is derived from the tree: the
 * directory holding the most `<name>/SKILL.md` children wins, ties going to the
 * shallowest and then to name order. `""` means the repository root.
 */
function detectSkillsBase(paths) {
  const counts = new Map();
  for (const path of paths) {
    const match = /^(.*?)([^/]+)\/SKILL\.md$/.exec(path);
    if (match === null) continue;
    const base = match[1].replace(/\/+$/, "");
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]),
  );
  return ranked.length === 0 ? "" : ranked[0][0];
}

/** The base to read a source at; an explicit request always wins. */
function skillsBase(source, subPath, paths) {
  const requested = typeof subPath === "string" ? subPath : source.path;
  const explicit = String(requested ?? "").replace(/^\/+|\/+$/g, "");
  return explicit === "" ? detectSkillsBase(paths) : explicit;
}

async function fetchRaw(repo, ref, path) {
  const url = `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
  const response = await fetch(url, {
    headers: { "user-agent": "dsh-market" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(502, "raw-error", `${path} 下载失败（${response.status}）`);
  return response.text();
}

/**
 * One trees request lists the whole pinned repository, so a browse costs a
 * single API call and file bodies come from raw (not rate limited).
 */
async function browseSource({ source, ref, subPath }) {
  const { pinned, paths, truncated } = await pinnedTree(source, ref);
  const base = skillsBase(source, subPath, paths);
  const prefix = base === "" ? "" : `${base}/`;
  const inBase = paths.filter((path) => prefix === "" || path.startsWith(prefix));
  const skillDirs = new Map();
  for (const path of inBase) {
    const relative = path.slice(prefix.length);
    const match = /^([^/]+)\/SKILL\.md$/.exec(relative);
    if (match !== null) skillDirs.set(match[1], []);
  }
  for (const path of inBase) {
    const relative = path.slice(prefix.length);
    const slash = relative.indexOf("/");
    if (slash <= 0) continue;
    const dir = relative.slice(0, slash);
    if (skillDirs.has(dir)) skillDirs.get(dir).push(path);
  }

  const names = [...skillDirs.keys()].filter((dir) => SKILL_NAME.test(dir)).sort();
  // Raw fetches carry no API quota, so descriptions can be read in parallel.
  const descriptions = new Map();
  const queue = [...names];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (;;) {
      const skillName = queue.shift();
      if (skillName === undefined) return;
      try {
        const text = await fetchRaw(source.repo, pinned, `${prefix}${skillName}/SKILL.md`);
        const { fields } = parseFrontmatter(text);
        descriptions.set(skillName, typeof fields.description === "string" ? fields.description : "");
      } catch {
        descriptions.set(skillName, "");
      }
    }
  });
  await Promise.all(workers);

  return {
    source: { id: source.id, label: source.label, repo: source.repo, homepage: source.homepage, license: source.license },
    ref: pinned,
    path: base,
    truncated: truncated === true,
    skills: names.map((skillName) => ({
      name: skillName,
      description: descriptions.get(skillName) ?? "",
      files: skillDirs.get(skillName).length,
    })),
  };
}

// ── skill writes ───────────────────────────────────────────────────────────

function writeFileAt(rootDir, relative, content) {
  const target = resolvePath(rootDir, relative);
  const guard = rootDir.endsWith(sep) ? rootDir : rootDir + sep;
  if (target !== rootDir && !target.startsWith(guard)) {
    throw new HttpError(400, "bad-request", `refusing to write outside the skill directory: ${relative}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

async function installSkill({ source, ref, skillName, scope, root, subPath, confirm }) {
  if (confirm !== true) {
    throw new HttpError(400, "confirmation-required", "安装前需要显式确认");
  }
  assertSkillName(skillName);
  const { pinned, paths, truncated } = await pinnedTree(source, ref);
  // A truncated tree would silently install a partial skill, so refuse it here.
  if (truncated) {
    throw new HttpError(
      502,
      "tree-truncated",
      `${source.repo} 的文件树超过 GitHub 单次响应上限，无法保证安装完整；请改用更小的仓库`,
    );
  }
  const { dir } = resolveScope(scope, root);
  const base = skillsBase(source, subPath, paths);
  const prefix = base === "" ? "" : `${base}/`;
  // An existing directory that this plugin does not own is never overwritten.
  assertOwned(dir, skillName, { allowMissing: true });

  const skillPrefix = `${prefix}${skillName}/`;
  const files = paths
    .filter((path) => path.startsWith(skillPrefix))
    .map((path) => path.slice(skillPrefix.length))
    .filter((relative) => relative !== "");
  if (!files.includes("SKILL.md")) {
    throw new HttpError(404, "no-skill", `${source.repo}@${pinned.slice(0, 7)} 里没有 ${skillPrefix}SKILL.md`);
  }

  const target = join(dir, skillName);
  for (const relative of files) {
    const body = await fetchRaw(source.repo, pinned, `${skillPrefix}${relative}`);
    writeFileAt(target, relative, body);
  }
  writeFileSync(
    join(target, MARKER),
    JSON.stringify({ kind: "source", repo: source.repo, ref: pinned, path: `${prefix}${skillName}` }, null, 2) + "\n",
  );
  writeFileSync(
    join(target, "SOURCE.md"),
    [
      `# ${skillName} source`,
      "",
      `- Repository: https://github.com/${source.repo}`,
      `- Pinned commit: \`${pinned}\``,
      `- Path: \`${prefix}${skillName}\``,
      `- License: ${source.license}`,
      "",
      "Installed by dsh-market from an explicit commit. Reinstall from the Market page",
      "to update; editing the files by hand makes them drift from the pinned commit.",
      "",
    ].join("\n"),
  );
  return { installed: skillName, dir: target, ref: pinned, path: base, files: files.length };
}

function saveSkill({ scope, root, skillName, description, body }) {
  assertSkillName(skillName);
  if (typeof description !== "string" || description.trim() === "") {
    throw new HttpError(400, "bad-request", "description is required");
  }
  if (typeof body !== "string" || body.trim() === "") {
    throw new HttpError(400, "bad-request", "body is required");
  }
  const { dir } = resolveScope(scope, root);
  const target = assertOwned(dir, skillName, { allowMissing: true });
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), buildSkillMarkdown({ skillName, description, body }));
  writeFileSync(join(target, MARKER), JSON.stringify({ kind: "custom" }, null, 2) + "\n");
  return { saved: skillName, dir: target };
}

function removeSkill({ scope, root, skillName, confirm }) {
  if (confirm !== true) {
    throw new HttpError(400, "confirmation-required", "删除前需要显式确认");
  }
  const { dir } = resolveScope(scope, root);
  const target = assertOwned(dir, skillName, { allowMissing: false });
  rmSync(target, { recursive: true, force: true });
  return { removed: skillName, dir: target };
}

// ── routes ─────────────────────────────────────────────────────────────────

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader("allow", allow);
  res.end();
}

async function readBoundedBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

async function readJsonBody(req) {
  if (String(req.headers["content-type"]).split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "unsupported-media-type", "content-type must be application/json");
  }
  const text = await readBoundedBody(req);
  if (text === null) throw new HttpError(413, "payload-too-large", "request body is too large");
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    return parsed;
  } catch {
    throw new HttpError(400, "bad-request", "request body must be a JSON object");
  }
}

export function apply(ctx) {
  const connectionOf = () => Reflect.get(ctx, "connection");
  const rejected = (req, res) => {
    const rejection = connectionOf().requestRejection(req);
    if (rejection === undefined) return false;
    res.statusCode = rejection;
    res.end();
    return true;
  };

  const register = (method, path, handler, { body = false } = {}) => {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path,
          handler: async (req, res) => {
            if (rejected(req, res)) return;
            if (req.method !== method) {
              sendMethodNotAllowed(res, method);
              return;
            }
            try {
              const payload = body ? await readJsonBody(req) : {};
              const result = await handler(payload, new URL(String(req.url), "http://localhost"));
              sendJson(res, 200, result);
            } catch (error) {
              if (error instanceof HttpError) {
                sendJson(res, error.status, { code: error.code, message: error.message });
                return;
              }
              sendJson(res, 500, { code: "internal", message: String(error?.message ?? error) });
            }
          },
        }),
      `dsh-market: ${method} ${path}`,
    );
  };

  register("GET", ROUTE.cli, async () => detectTools(ctx));
  register("GET", ROUTE.catalog, async (_payload, url) => skillCatalog(url));
  register("GET", ROUTE.workspaces, async () => ({ workspaces: listWorkspaces() }));
  register("GET", ROUTE.sources, async () => {
    const { sources, error, configPath } = readSources();
    return {
      sources,
      configError: error,
      configPath,
      userSkillsDir: userSkillsDir(),
    };
  });
  register(
    "GET",
    ROUTE.skills,
    async (_payload, url) => {
      const scope = url.searchParams.get("scope") ?? "user";
      const root = url.searchParams.get("root") ?? undefined;
      const resolved = resolveScope(scope, root);
      return { scope: resolved.scope, ...listSkills(resolved.dir) };
    },
  );
  register(
    "GET",
    ROUTE.browse,
    async (_payload, url) => {
      const source = resolveSource({
        sourceId: url.searchParams.get("source"),
        repo: url.searchParams.get("repo"),
      });
      const path = url.searchParams.get("path");
      return browseSource({
        source,
        ref: url.searchParams.get("ref") ?? "",
        subPath: path === null ? undefined : path,
      });
    },
  );
  register(
    "GET",
    ROUTE.resolve,
    async (_payload, url) => {
      const source = resolveSource({
        sourceId: url.searchParams.get("source"),
        repo: url.searchParams.get("repo"),
      });
      return { source: source.id, ref: await resolveSourceCommit(source) };
    },
  );
  register(
    "POST",
    ROUTE.install,
    async (payload) =>
      installSkill({
        source: resolveSource({
          sourceId: payload.source,
          repo: typeof payload.repo === "string" ? payload.repo : undefined,
        }),
        ref: String(payload.ref ?? ""),
        skillName: String(payload.skill ?? ""),
        scope: String(payload.scope ?? "user"),
        root: typeof payload.root === "string" ? payload.root : undefined,
        subPath: typeof payload.path === "string" ? payload.path : undefined,
        confirm: payload.confirm === true,
      }),
    { body: true },
  );
  register(
    "POST",
    ROUTE.save,
    async (payload) =>
      saveSkill({
        scope: String(payload.scope ?? "user"),
        root: typeof payload.root === "string" ? payload.root : undefined,
        skillName: String(payload.name ?? ""),
        description: String(payload.description ?? ""),
        body: String(payload.body ?? ""),
      }),
    { body: true },
  );
  register(
    "POST",
    ROUTE.remove,
    async (payload) =>
      removeSkill({
        scope: String(payload.scope ?? "user"),
        root: typeof payload.root === "string" ? payload.root : undefined,
        skillName: String(payload.name ?? ""),
        confirm: payload.confirm === true,
      }),
    { body: true },
  );
}
