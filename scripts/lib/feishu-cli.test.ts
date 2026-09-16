import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assertPinnedCli,
  feishuCli,
  normalizeSkillBody,
  parseCliVersion,
  repoSkillsDir,
  userSkillsDir,
} from "./feishu-cli.ts";

test("the vendored Feishu CLI version is a pinned exact release", () => {
  assert.match(feishuCli.version, /^\d+\.\d+\.\d+$/);
  assert.equal(feishuCli.package, "@larksuite/cli");
  assert.equal(feishuCli.command, "lark-cli");
  assert.equal(feishuCli.skillPrefix, "lark-");
});

test("parseCliVersion reads the CLI's version line", () => {
  assert.equal(parseCliVersion("lark-cli version 1.0.90"), "1.0.90");
  assert.equal(parseCliVersion("lark-cli version 2.11.3\n"), "2.11.3");
  assert.equal(parseCliVersion("no version here"), null);
  assert.equal(parseCliVersion(""), null);
});

test("normalizeSkillBody yields exactly one trailing newline", () => {
  assert.equal(normalizeSkillBody("a\n"), "a\n");
  assert.equal(normalizeSkillBody("a"), "a\n");
  assert.equal(normalizeSkillBody("a\n\n\n"), "a\n");
  assert.equal(normalizeSkillBody("a\r\nb\r\n"), "a\nb\n");
});

test("assertPinnedCli rejects a missing or mismatched CLI", () => {
  assert.deepEqual(assertPinnedCli({ ok: false, problem: "missing" }), ["missing"]);
  assert.deepEqual(
    assertPinnedCli({ ok: true, cli: { path: "lark-cli", version: "0.0.1" } }).length,
    1,
  );
  assert.deepEqual(
    assertPinnedCli({ ok: true, cli: { path: "lark-cli", version: feishuCli.version } }),
    [],
  );
});

test("userSkillsDir honors DSH_AGENTS_HOME", () => {
  const previous = process.env.DSH_AGENTS_HOME;
  try {
    process.env.DSH_AGENTS_HOME = "/tmp/dsh-agents-home";
    assert.equal(userSkillsDir(), join("/tmp/dsh-agents-home", "skills"));
    process.env.DSH_AGENTS_HOME = "";
    assert.equal(userSkillsDir().endsWith(join(".agents", "skills")), true);
  } finally {
    if (previous === undefined) delete process.env.DSH_AGENTS_HOME;
    else process.env.DSH_AGENTS_HOME = previous;
  }
});

// Ties the committed bytes to the pinned contract without invoking the CLI, so
// the test stays hermetic while still failing if the pack is trimmed or a
// bundle loses its `SKILL.md`.
test("the vendored pack carries every pinned skill bundle with a SKILL.md", () => {
  const root = repoSkillsDir();
  const bundles = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(feishuCli.skillPrefix))
    .map((entry) => entry.name)
    .sort();

  assert.equal(bundles.length, feishuCli.skillCount);
  for (const bundle of bundles) {
    const skillFile = join(root, bundle, "SKILL.md");
    assert.equal(existsSync(skillFile), true, `${bundle}/SKILL.md is missing`);
    const body = readFileSync(skillFile, "utf8");
    assert.match(body, /^---\n/, `${bundle}/SKILL.md has no frontmatter`);
    assert.match(body, new RegExp(`\nname: ${bundle}\n`), `${bundle}/SKILL.md names another skill`);
  }
  assert.equal(existsSync(join(root, "lark-cli-skills.SOURCE.md")), true);
  assert.equal(existsSync(join(root, "lark-cli-skills.LICENSE")), true);
});
