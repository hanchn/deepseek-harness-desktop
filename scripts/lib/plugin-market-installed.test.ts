// Installed-state derivation for the vendored plugin market.
//
// These cases are the two bugs users actually reported, frozen as regressions:
//
//   1. same-name false positives — a local `file:` plugin called `dsh-market`
//      marked every catalog row named `dsh-market`, and `dsh-web` matched
//      `github:zhu1090093659/dsh-web`, so unrelated entries showed an
//      "installed" badge and an uninstall button.
//   2. a freshly installed plugin losing its status — the flag was re-derived
//      from loader names right after install, and the running Harness does not
//      know the plugin until it restarts, so the status (and the uninstall
//      button, which only renders for installed rows) vanished.
//
// The fix both cases pin down: identity comes from the profile manifest.
import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogIdFromSpec,
  classifySpec,
  deriveInstalledIds,
  summarizeInstalled,
} from "../../plugins/dsh-plugin-market/lib/services/profile-state.js";

/** Catalog rows as `listIdentities()` returns them, including the decoys. */
const rows = [
  { id: "github:MeteorNOX/DeepSeek-Balance-Whale-Widget", name: "DeepSeek-Balance-Whale-Widget" },
  { id: "github:dsh-market/dsh-market", name: "dsh-market" },
  { id: "github:2BingLing/dsh-market", name: "dsh-market" },
  { id: "github:zhu1090093659/dsh-web", name: "dsh-web" },
  { id: "github:chnjames/dsh-plugin-market", name: "dsh-plugin-market" },
  { id: "npm:whale-on-desk", name: "whale-on-desk" },
];

/** The real profile that produced the report. */
const profile = {
  "dsh-market": "file:/Users/yuanjing/Desktop/deepseek-harness-desktop/plugins/dsh-market",
  "dsh-open-in-app-plus": "file:/Users/yuanjing/Desktop/deepseek-harness-desktop/plugins/dsh-open-in-app-plus",
  "dsh-plugin-market": "github:chnjames/dsh-plugin-market",
  "dsh-ui-codex": "file:/Users/yuanjing/Desktop/deepseek-harness-desktop/plugins/dsh-ui-codex",
  "dsh-whale-widget": "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
};

test("installed rows are matched by source identity, never by bare name", () => {
  assert.deepEqual(deriveInstalledIds(rows, profile), [
    "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
    "github:chnjames/dsh-plugin-market",
  ]);
});

test("a local file: copy of a name in the catalog does not claim the catalog row", () => {
  // The decoys are the exact rows the old suffix/name matcher turned green.
  const installed = deriveInstalledIds(rows, profile);
  assert.ok(!installed.includes("github:dsh-market/dsh-market"));
  assert.ok(!installed.includes("github:2BingLing/dsh-market"));
  assert.ok(!installed.includes("github:zhu1090093659/dsh-web"));
  assert.ok(!installed.includes("npm:whale-on-desk"));
});

test("a just-installed plugin stays installed while the loader is still empty", () => {
  // `deriveInstalledIds` reads the manifest, so it cannot depend on what the
  // running Harness has loaded — which is what used to wipe the flag.
  const justInstalled = { "dsh-whale-widget": "github:MeteorNOX/DeepSeek-Balance-Whale-Widget" };
  assert.deepEqual(deriveInstalledIds(rows, justInstalled), [
    "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
  ]);

  const summary = summarizeInstalled(justInstalled, rows, {
    bundles: ["dsh-whale-widget"],
    loaderNames: [],
    versions: { "dsh-whale-widget": "1.2.3" },
  });
  assert.equal(summary.length, 1);
  assert.equal(summary[0]?.name, "dsh-whale-widget");
  assert.equal(summary[0]?.catalogId, "github:MeteorNOX/DeepSeek-Balance-Whale-Widget");
  assert.equal(summary[0]?.version, "1.2.3");
  assert.equal(summary[0]?.active, true, "a profile bundle is enough to call it enabled");
});

test("the installed list says where each plugin came from", () => {
  const summary = summarizeInstalled(profile, rows, {
    bundles: ["dsh-plugin-market"],
    loaderNames: ["dsh-ui-codex"],
    versions: { "dsh-whale-widget": "0.9.0" },
  });
  const byName = new Map(summary.map((entry) => [entry.name, entry]));

  assert.equal(byName.get("dsh-market")?.kind, "local");
  assert.equal(byName.get("dsh-market")?.catalogId, null, "a local directory is no catalog row");
  assert.equal(byName.get("dsh-open-in-app-plus")?.active, false);
  assert.equal(byName.get("dsh-ui-codex")?.active, true, "the loader can still report active");
  assert.equal(byName.get("dsh-plugin-market")?.active, true, "so can the profile bundle list");
  assert.equal(byName.get("dsh-whale-widget")?.version, "0.9.0");
  assert.equal(byName.get("dsh-ui-codex")?.version, null, "unknown versions stay unknown");
  assert.deepEqual(summary.map((entry) => entry.name), [...summary.map((entry) => entry.name)].sort());
});

test("dependency specs classify into the source they install", () => {
  assert.deepEqual(classifySpec("github:owner/repo"), {
    kind: "github",
    id: "github:owner/repo",
    owner: "owner",
    repo: "repo",
  });
  assert.equal(classifySpec("github:owner/repo#v1.2.3")?.id, "github:owner/repo");
  assert.equal(classifySpec("git+https://github.com/owner/repo.git#main")?.id, "github:owner/repo");
  assert.equal(classifySpec("git+ssh://git@github.com/owner/repo.git")?.id, "github:owner/repo");
  assert.equal(classifySpec("https://github.com/owner/repo")?.id, "github:owner/repo");
  assert.equal(classifySpec("owner/repo")?.id, "github:owner/repo");
  assert.deepEqual(classifySpec("file:/tmp/plugins/dsh-market"), { kind: "local" });
  assert.deepEqual(classifySpec("link:/tmp/plugins/dsh-market"), { kind: "local" });
  assert.equal(classifySpec("npm:is-odd@3.0.1")?.name, "is-odd");
  assert.equal(classifySpec("@scope/pkg@^1.0.0")?.name, "@scope/pkg");
  assert.equal(classifySpec("is-odd@latest")?.name, "is-odd");
  assert.equal(classifySpec("https://example.com/pkg.tgz")?.kind, "other");
  assert.equal(classifySpec("   ")?.kind, "unknown");
});

test("only github and npm specs can name a catalog row", () => {
  assert.equal(catalogIdFromSpec("github:owner/repo"), "github:owner/repo");
  assert.equal(catalogIdFromSpec("npm:is-odd@3.0.1"), "npm:is-odd");
  assert.equal(catalogIdFromSpec("file:/tmp/plugins/dsh-market"), null);
  assert.equal(catalogIdFromSpec("https://example.com/pkg.tgz"), null);
});

test("an unreadable profile yields no installed rows instead of wrong ones", () => {
  assert.deepEqual(deriveInstalledIds(rows, {}), []);
  assert.deepEqual(deriveInstalledIds(rows, null), []);
  assert.deepEqual(summarizeInstalled({}, rows), []);
});
