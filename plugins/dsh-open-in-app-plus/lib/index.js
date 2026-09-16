// dsh-open-in-app-plus — host half.
//
// Adds launchable applications that the shipped `dsh-host-open-in-app` catalog
// cannot carry: its catalog is fixed at build time and its README records
// configurable custom handlers as deferred, so extra editors arrive through
// this package instead.
//
// Security has exactly one home, here:
//   * every route asks the composition's `connection` service for a rejection
//     first (Host/Origin fence + browser-auth cookie) — same fence the shipped
//     open-in-app routes use;
//   * the browser sends an application id and a directory path, never a
//     command: the argv is resolved host-side from a trusted local config, so
//     a hostile page cannot turn this into an arbitrary-execution endpoint;
//   * no shell is ever involved — `spawn(command, argv)` only;
//   * bodies are `application/json`, bounded, and the path must be an existing
//     absolute directory;
//   * children spawn detached, with a credential-scrubbed environment and no
//     inherited stdio.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { stat } from "node:fs/promises";

/** Cordis function-plugin name. */
export const name = "open-in-app-plus";

/** The route carrier, the trust fence guarding every route, and PATH lookup. */
export const inject = ["webServer", "connection", "subprocess"];

/** GET route serving the merged custom catalog. */
const APPS_ROUTE = "/open-in-app-plus/apps";
/** POST route launching one catalog entry on one workspace directory. */
const OPEN_ROUTE = "/open-in-app-plus/open";

/** Request bodies are tiny; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024;
/** Default early-failure watch window for a launch. */
const DEFAULT_WATCH_MS = 1000;

/**
 * Built-in presets. They mirror the tools this feature exists for and are only
 * offered when the host can actually see them; `codex` targets the ChatGPT
 * desktop app, which is the Codex desktop surface that ships as an app bundle.
 * Users add their own entries in `$DSH_HOME/open-in-app.json`.
 */
const PRESETS = [
  { id: "trae", label: "Trae", kind: "app", app: "Trae" },
  { id: "qoder", label: "Qoder", kind: "app", app: "Qoder" },
  { id: "qoderwork", label: "QoderWork CN", kind: "app", app: "QoderWork CN" },
  { id: "codex", label: "Codex (ChatGPT)", kind: "app", app: "ChatGPT" },
];

/** Directories a macOS bundle may live in, in lookup order. */
function appDirs() {
  return [
    "/Applications",
    join(homedir(), "Applications"),
    "/System/Applications",
    "/System/Applications/Utilities",
  ];
}

/** Absolute bundle path for a macOS application name, or null when absent. */
function resolveAppBundle(appName) {
  const candidates = /\.app$/i.test(appName)
    ? [appName, ...appDirs().map((dir) => join(dir, appName))]
    : appDirs().map((dir) => join(dir, `${appName}.app`));
  for (const candidate of candidates) {
    if (isAbsolute(candidate) && existsSync(candidate)) return candidate;
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

/** DSH_HOME as this host process sees it, with a documented fallback. */
function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv;
  return join(homedir(), ".dsh");
}

/** Path of the user-editable catalog file. */
function configPath() {
  return join(dshHome(), "open-in-app.json");
}

/**
 * Read the user catalog. A missing file is the normal case; a malformed file is
 * reported to the model-facing side by simply yielding no user entries, because
 * a bad config must never take the feature (or the page) down.
 */
function readUserCatalog() {
  const file = configPath();
  if (!existsSync(file)) return { apps: [], error: null };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const apps = Array.isArray(parsed?.apps) ? parsed.apps : [];
    const cleaned = [];
    for (const entry of apps) {
      if (typeof entry?.id !== "string" || entry.id.trim() === "") continue;
      if (typeof entry?.label !== "string" || entry.label.trim() === "") continue;
      if (entry.kind !== "app" && entry.kind !== "cli") continue;
      if (entry.kind === "app" && typeof entry.app !== "string") continue;
      if (entry.kind === "cli" && typeof entry.command !== "string") continue;
      cleaned.push({
        id: entry.id.trim(),
        label: entry.label.trim(),
        kind: entry.kind,
        app: typeof entry.app === "string" ? entry.app : undefined,
        command: typeof entry.command === "string" ? entry.command : undefined,
        args: Array.isArray(entry.args) ? entry.args.filter((a) => typeof a === "string") : [],
        cwd: entry.cwd === true,
      });
    }
    return {
      apps: cleaned,
      error: apps.length !== cleaned.length ? "some entries were ignored (invalid shape)" : null,
      watchMs: Number.isFinite(parsed?.launchWatchMs) ? parsed.launchWatchMs : undefined,
    };
  } catch (error) {
    return { apps: [], error: `could not parse ${file}: ${String(error?.message ?? error)}` };
  }
}

/**
 * Merge presets with the user catalog (user entries win by id) and keep only
 * entries the host can actually launch.
 */
async function resolveCatalog(ctx) {
  const user = readUserCatalog();
  const merged = new Map();
  for (const preset of PRESETS) merged.set(preset.id, preset);
  for (const entry of user.apps) merged.set(entry.id, entry);

  const available = [];
  const unavailable = [];
  for (const entry of merged.values()) {
    if (entry.kind === "app") {
      const bundle = resolveAppBundle(entry.app);
      if (bundle === null) {
        unavailable.push({ id: entry.id, reason: "application not installed" });
        continue;
      }
      available.push({ ...entry, bundle });
      continue;
    }
    let executable = null;
    try {
      executable = await ctx.subprocess.resolveExecutable(entry.command);
    } catch {
      executable = null;
    }
    if (executable === null) {
      unavailable.push({ id: entry.id, reason: `command not on PATH: ${entry.command}` });
      continue;
    }
    available.push({ ...entry, executable });
  }
  return {
    available,
    unavailable,
    watchMs: user.watchMs ?? DEFAULT_WATCH_MS,
    error: user.error,
  };
}

/** JSON response; availability and launch outcomes are live facts. */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

/** 405 with the route's one supported method. */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader("allow", allow);
  res.end();
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling. */
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

/** `{ app, path }` only — anything else is not a launch request. */
function parseOpenBody(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { app, path } = body;
  return typeof app === "string" && typeof path === "string" ? { app, path } : null;
}

/** Substitute the `{path}` token in one argv entry. */
function expandArg(arg, path) {
  return arg.includes("{path}") ? arg.split("{path}").join(path) : arg;
}

/**
 * Spawn one launcher detached and decide success inside the watch window: a
 * spawn error or a nonzero exit within the window is a failure; a child still
 * running when the window closes is counted launched and left alone.
 */
function launchDetached(command, args, options) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, [...args], {
        detached: true,
        stdio: "ignore",
        cwd: options.cwd,
        env: scrubbedEnv(),
      });
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(watch);
      child.unref();
      outcome();
    };
    const watch = setTimeout(() => settle(resolve), options.watchMs);
    child.on("error", (error) => settle(() => reject(error)));
    child.on("exit", (code) => {
      if (code === 0) settle(resolve);
      else settle(() => reject(new Error(`launcher exited with code ${code}`)));
    });
  });
}

/** One catalog entry plus a workspace directory, out of process. */
async function launchEntry(entry, path, watchMs) {
  const args = (entry.args ?? []).map((arg) => expandArg(arg, path));
  if (entry.kind === "app") {
    // `open -a <bundle>`; the bundle path is host-resolved, never client data.
    return launchDetached("/usr/bin/open", ["-a", entry.bundle, ...args], { watchMs });
  }
  const argv = args.length > 0 ? args : [];
  return launchDetached(entry.executable, argv, {
    watchMs,
    cwd: entry.cwd === true ? path : undefined,
  });
}

export function apply(ctx) {
  const connectionOf = () => Reflect.get(ctx, "connection");
  /** Answer an untrusted request; true when it was rejected. */
  const rejected = (req, res) => {
    const rejection = connectionOf().requestRejection(req);
    if (rejection === undefined) return false;
    res.statusCode = rejection;
    res.end();
    return true;
  };

  /** Re-resolve on each read: entries come and go with the user's config file. */
  const catalog = () => resolveCatalog(ctx);

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: APPS_ROUTE,
        handler: async (req, res) => {
          if (rejected(req, res)) return;
          if (req.method !== "GET") {
            sendMethodNotAllowed(res, "GET");
            return;
          }
          const resolved = await catalog();
          sendJson(res, 200, {
            apps: resolved.available.map((entry) => ({
              id: entry.id,
              label: entry.label,
              kind: entry.kind,
            })),
            unavailable: resolved.unavailable,
            configPath: configPath(),
            configError: resolved.error,
          });
        },
      }),
    `open-in-app-plus: GET ${APPS_ROUTE}`,
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: OPEN_ROUTE,
        handler: async (req, res) => {
          if (rejected(req, res)) return;
          if (req.method !== "POST") {
            sendMethodNotAllowed(res, "POST");
            return;
          }
          if (
            String(req.headers["content-type"]).split(";", 1)[0]?.trim().toLowerCase() !==
            "application/json"
          ) {
            sendJson(res, 415, {
              code: "unsupported-media-type",
              message: "content-type must be application/json",
            });
            return;
          }
          let text;
          try {
            text = await readBoundedBody(req);
          } catch {
            sendJson(res, 400, { code: "bad-request", message: "request body unreadable" });
            return;
          }
          if (text === null) {
            sendJson(res, 413, { code: "payload-too-large", message: "request body is too large" });
            return;
          }
          const parsed = parseOpenBody(text);
          if (parsed === null) {
            sendJson(res, 400, {
              code: "bad-request",
              message: 'request body must be JSON with string "app" and "path"',
            });
            return;
          }
          const resolved = await catalog();
          const entry = resolved.available.find((candidate) => candidate.id === parsed.app);
          if (entry === undefined) {
            sendJson(res, 400, {
              code: "bad-request",
              message: `unknown or unavailable app: ${parsed.app}`,
            });
            return;
          }
          if (parsed.path === "" || !isAbsolute(parsed.path)) {
            sendJson(res, 400, {
              code: "bad-request",
              message: "path must be an absolute directory path",
            });
            return;
          }
          let directory = false;
          try {
            directory = (await stat(parsed.path)).isDirectory();
          } catch {
            directory = false;
          }
          if (!directory) {
            sendJson(res, 404, {
              code: "not-found",
              message: `directory does not exist: ${parsed.path}`,
            });
            return;
          }
          try {
            await launchEntry(entry, parsed.path, resolved.watchMs);
            sendJson(res, 200, { ok: true, app: entry.id });
          } catch (error) {
            sendJson(res, 502, {
              code: "launch-failed",
              message: `failed to launch ${entry.id}: ${String(error?.message ?? error)}`,
            });
          }
        },
      }),
    `open-in-app-plus: POST ${OPEN_ROUTE}`,
  );
}
