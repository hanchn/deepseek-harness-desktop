// Pinned definition of the official Lark/飞书 CLI (`lark-cli`) and the helpers
// that read its embedded agent skills.
//
// The CLI ships its 28 `lark-*` skill bundles inside the binary and exposes
// them through `lark-cli skills list|read`. This module is the single source of
// truth for the version this repository vendors, and it is deliberately free of
// any network access: everything it reads comes from the locally installed CLI,
// which keeps `sync-feishu-skills.ts` reproducible and reviewable.

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./common.ts";

export const feishuCli = {
  /** npm package that publishes the frozen `lark-cli` binary. */
  package: "@larksuite/cli",
  /** Executable resolved from `PATH`. */
  command: "lark-cli",
  /** Exactly the version whose embedded skills are vendored in this repo. */
  version: "1.0.90",
  repository: "https://github.com/larksuite/cli",
  license: "MIT",
  /** Every embedded skill bundle carries this name prefix. */
  skillPrefix: "lark-",
  /** `lark-cli skills list` must report exactly this many bundles. */
  skillCount: 28,
} as const;

/** Project-scoped DSH skill root: `<repo>/.agents/skills`. */
export function repoSkillsDir(): string {
  return join(repoRoot, ".agents", "skills");
}

/**
 * User-scoped DSH skill root: `$DSH_AGENTS_HOME/skills`, defaulting to
 * `~/.agents/skills`. Mirrors `@deepseek-ai/dsh-skill-filesystem`.
 */
export function userSkillsDir(): string {
  const override = process.env.DSH_AGENTS_HOME;
  const agentsHome =
    override !== undefined && override !== "" ? override : join(homedir(), ".agents");
  return join(agentsHome, "skills");
}

/** One entry of a `lark-cli skills list <path>` layer. */
export interface SkillEntry {
  path: string;
  isDir: boolean;
}

export interface FeishuCliProbe {
  path: string;
  version: string;
}

export type FeishuCliResolution =
  | { ok: true; cli: FeishuCliProbe }
  | { ok: false; problem: string };

/** `lark-cli --version` prints exactly `lark-cli version 1.0.90`. */
export function parseCliVersion(output: string): string | null {
  const match = /\b(\d+\.\d+\.\d+)\b/.exec(output);
  return match?.[1] ?? null;
}

// Upstream ships a native binary through npm, so Windows resolves it through a
// `.cmd` shim — the same shell requirement the plugin runner already applies to
// pnpm. Never enable the shell off Windows: the command is a bare name and the
// arguments are repo-controlled, but a shell would still re-parse them.
function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(feishuCli.command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

/** Resolve `lark-cli` from `PATH` and report its version. */
export function resolveFeishuCli(): FeishuCliResolution {
  const result = run(["--version"]);
  if (result.status !== 0) {
    return {
      ok: false,
      problem:
        `cannot run \`${feishuCli.command} --version\` — install ${feishuCli.package} ` +
        `(reviewed version ${feishuCli.version}): ${result.stderr.trim() || `exit ${result.status}`}`,
    };
  }
  const version = parseCliVersion(result.stdout);
  if (version === null) {
    return { ok: false, problem: `unparsable \`${feishuCli.command} --version\` output` };
  }
  return { ok: true, cli: { path: feishuCli.command, version } };
}

/**
 * Guard the pinned contract: a CLI that is missing, or that is a different
 * version, would silently vendor a different skill pack than the one reviewed.
 */
export function assertPinnedCli(resolution: FeishuCliResolution): string[] {
  if (!resolution.ok) return [resolution.problem];
  if (resolution.cli.version !== feishuCli.version) {
    return [
      `installed ${feishuCli.command} is ${resolution.cli.version} but this repo pins ` +
        `${feishuCli.version} — install ${feishuCli.package}@${feishuCli.version} or bump the pin`,
    ];
  }
  return [];
}

function parseJson<T>(label: string, stdout: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`${label}: expected JSON on stdout, got: ${stdout.slice(0, 200)}`);
  }
}

/** Every skill bundle name the installed CLI embeds, in CLI order. */
export function listSkillNames(): string[] {
  const result = run(["skills", "list"]);
  if (result.status !== 0) {
    throw new Error(`lark-cli skills list failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  const envelope = parseJson<{ ok?: boolean; skills?: Array<{ name?: string }> }>(
    "lark-cli skills list",
    result.stdout,
  );
  if (envelope.ok === false) throw new Error("lark-cli skills list reported ok:false");
  const names = (envelope.skills ?? [])
    .map((skill) => skill.name)
    .filter((name): name is string => typeof name === "string" && name !== "");
  if (names.length === 0) throw new Error("lark-cli skills list returned no skills");
  return names;
}

/** One layer of a skill bundle, like `ls`. */
export function listSkillLayer(skillPath: string): SkillEntry[] {
  const result = run(["skills", "list", skillPath]);
  if (result.status !== 0) {
    throw new Error(
      `lark-cli skills list ${skillPath} failed: ${result.stderr.trim() || `exit ${result.status}`}`,
    );
  }
  const envelope = parseJson<{ ok?: boolean; entries?: Array<{ path?: string; is_dir?: boolean }> }>(
    `lark-cli skills list ${skillPath}`,
    result.stdout,
  );
  if (envelope.ok === false) throw new Error(`lark-cli skills list ${skillPath} reported ok:false`);
  return (envelope.entries ?? [])
    .filter(
      (entry): entry is { path: string; is_dir?: boolean } =>
        typeof entry.path === "string" && entry.path !== "",
    )
    .map((entry) => ({ path: entry.path, isDir: entry.is_dir === true }));
}

/** Raw Markdown for `SKILL.md` or any file inside a skill bundle. */
export function readSkillFile(skillPath: string): string {
  const result = run(["skills", "read", skillPath]);
  if (result.status !== 0) {
    throw new Error(
      `lark-cli skills read ${skillPath} failed: ${result.stderr.trim() || `exit ${result.status}`}`,
    );
  }
  return result.stdout;
}

export interface SkillFile {
  /** Path relative to the skills root, e.g. `lark-im/references/chat.md`. */
  relativePath: string;
  /** Normalized file body, always ending in exactly one newline. */
  content: string;
}

/**
 * Extensions the CLI embeds for agent consumption. Binary machine resources
 * (assets/, scripts/) are documented as *not* embedded, so anything outside
 * this allowlist means the pack changed shape and needs a human review rather
 * than a silent vendoring of unexpected bytes.
 */
const EMBEDDED_EXTENSIONS = [".md", ".json", ".xml"] as const;

/**
 * Walk one skill bundle depth-first and return every file it embeds.
 *
 * Git cannot store a directory whose name would collide with a file, so a
 * `SKILL.md`/sibling collision is treated as a hard error rather than a silent
 * overwrite.
 */
export function collectSkillFiles(skillName: string): SkillFile[] {
  const files: SkillFile[] = [];

  const walk = (dir: string): void => {
    const entries = [...listSkillLayer(dir)].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const entry of entries) {
      if (entry.isDir) {
        walk(entry.path);
        continue;
      }
      if (!EMBEDDED_EXTENSIONS.some((extension) => entry.path.endsWith(extension))) {
        throw new Error(`unexpected skill resource type: ${entry.path}`);
      }
      files.push({
        relativePath: entry.path,
        content: normalizeSkillBody(readSkillFile(entry.path)),
      });
    }
  };

  walk(skillName);
  if (!files.some((file) => file.relativePath === `${skillName}/SKILL.md`)) {
    throw new Error(`${skillName}: the bundle does not embed ${skillName}/SKILL.md`);
  }
  return files;
}

/**
 * The CLI emits a trailing newline; normalize so the vendored bytes are stable
 * across runs and comparable with `--check` under Git's CRLF handling.
 */
export function normalizeSkillBody(body: string): string {
  return `${body.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n`;
}
