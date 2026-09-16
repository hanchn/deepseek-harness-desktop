// Vendor the agent skills embedded in the official Lark/飞书 CLI into a DSH
// skill root, so a DSH session can operate Feishu through `lark-cli`.
//
//   node scripts/sync-feishu-skills.ts                 # write <repo>/.agents/skills
//   node scripts/sync-feishu-skills.ts --check         # assert no drift (CI/review)
//   node scripts/sync-feishu-skills.ts --target user   # write ~/.agents/skills
//
// The CLI is the source of truth and must match the pinned version: the whole
// point of vendoring is that the reviewed bytes cannot change underneath us.
// Nothing here touches the network — the files come from the installed binary.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fail, info, normalizeLineEndings, ok } from "./lib/common.ts";
import {
  assertPinnedCli,
  collectSkillFiles,
  feishuCli,
  listSkillNames,
  normalizeSkillBody,
  repoSkillsDir,
  resolveFeishuCli,
  userSkillsDir,
  type SkillFile,
} from "./lib/feishu-cli.ts";

interface Target {
  label: string;
  dir: string;
}

function selectedTarget(): Target {
  const index = process.argv.indexOf("--target");
  const value = index >= 0 ? process.argv[index + 1] : "repo";
  if (value === "repo") return { label: "project", dir: repoSkillsDir() };
  if (value === "user") return { label: "user", dir: userSkillsDir() };
  fail(`--target must be "repo" or "user" (got ${JSON.stringify(value ?? "")})`);
}

/**
 * The CLI reports paths relative to the skills root. Reject anything that could
 * escape it before we create or remove a single file.
 */
function assertContained(root: string, relativePath: string, skillName: string): string {
  if (isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error(`refusing non-portable skill path: ${relativePath}`);
  }
  if (!relativePath.startsWith(`${skillName}/`)) {
    throw new Error(`skill path escapes its bundle ${skillName}: ${relativePath}`);
  }
  const absolute = resolve(root, relativePath);
  const inside = relative(resolve(root), absolute);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error(`skill path escapes the skills root: ${relativePath}`);
  }
  return absolute;
}

function readIfPresent(path: string): string | null {
  if (!existsSync(path)) return null;
  return normalizeLineEndings(readFileSync(path, "utf8"));
}

/** Existing vendored `lark-*` directories, excluding the attribution files. */
function existingBundles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(feishuCli.skillPrefix))
    .map((entry) => entry.name)
    .sort();
}

function collectAll(skillNames: string[]): SkillFile[] {
  const files: SkillFile[] = [];
  for (const skillName of skillNames) {
    info(`reading embedded skill ${skillName}`);
    files.push(...collectSkillFiles(skillName));
  }
  return files;
}

function writeAll(root: string, files: SkillFile[], skillNames: string[]): void {
  for (const file of files) {
    const destination = assertContained(root, file.relativePath, file.relativePath.split("/")[0]!);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.content, "utf8");
  }

  // A bundle the pinned CLI no longer embeds must disappear, otherwise a stale
  // skill keeps advertising commands that no longer exist.
  const expected = new Set(skillNames);
  for (const bundle of existingBundles(root)) {
    if (!expected.has(bundle)) {
      info(`removing stale bundle ${bundle}`);
      rmSync(join(root, bundle), { recursive: true, force: true });
    }
  }
}

function checkAll(root: string, files: SkillFile[], skillNames: string[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    const destination = assertContained(root, file.relativePath, file.relativePath.split("/")[0]!);
    const actual = readIfPresent(destination);
    if (actual === null) {
      problems.push(`missing: ${file.relativePath}`);
    } else if (actual !== file.content) {
      problems.push(`differs: ${file.relativePath}`);
    }
  }

  const expected = new Set(skillNames);
  for (const bundle of existingBundles(root)) {
    if (!expected.has(bundle)) problems.push(`stale bundle: ${bundle}`);
  }

  // Catch a hand-added file that no longer corresponds to anything embedded.
  const vendored = new Set(files.map((file) => file.relativePath));
  for (const bundle of skillNames) {
    const bundleRoot = join(root, bundle);
    if (!existsSync(bundleRoot)) continue;
    for (const found of walkFiles(bundleRoot)) {
      const relativePath = `${bundle}/${found}`;
      if (!vendored.has(relativePath)) problems.push(`untracked: ${relativePath}`);
    }
  }
  return problems;
}

function walkFiles(root: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const next = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walkFiles(root, next));
    else found.push(next);
  }
  return found.sort();
}

function main(): void {
  const check = process.argv.includes("--check");
  const target = selectedTarget();

  const resolution = resolveFeishuCli();
  const pinProblems = assertPinnedCli(resolution);
  if (pinProblems.length > 0) fail(pinProblems.join("\n"));
  if (!resolution.ok) fail("unreachable: resolution reported failure without a problem");
  ok(`lark-cli ${resolution.cli.version} (pinned) resolved from PATH`);

  const skillNames = listSkillNames();
  if (skillNames.length !== feishuCli.skillCount) {
    fail(
      `lark-cli ${feishuCli.version} embeds ${skillNames.length} skills but this repo pins ` +
        `${feishuCli.skillCount} — bump feishuCli.skillCount after reviewing the change`,
    );
  }
  const misnamed = skillNames.filter((name) => !name.startsWith(feishuCli.skillPrefix));
  if (misnamed.length > 0) fail(`unexpected non-${feishuCli.skillPrefix} skill names: ${misnamed.join(", ")}`);

  const files = collectAll(skillNames);
  info(`${skillNames.length} skills · ${files.length} files → ${target.dir}`);

  if (check) {
    const problems = checkAll(target.dir, files, skillNames);
    if (problems.length > 0) {
      fail(
        `vendored Feishu skills are out of sync with lark-cli ${feishuCli.version}:\n` +
          problems.map((problem) => `  - ${problem}`).join("\n") +
          `\nrun: node scripts/sync-feishu-skills.ts`,
      );
    }
    ok(`vendored skills match lark-cli ${feishuCli.version} (${files.length} files)`);
    return;
  }

  // Re-normalize bodies on write so a CRLF checkout does not produce a diff.
  writeAll(
    target.dir,
    files.map((file) => ({ ...file, content: normalizeSkillBody(file.content) })),
    skillNames,
  );
  ok(`wrote ${files.length} files for ${skillNames.length} ${target.label} skills`);
}

main();
