// Host half of the installed-state fix: read the profile manifest, decide which
// catalog rows are installed, and resolve what `dsh plugin remove` may target.
//
// The profile is built on disk here because the point of the fix is that the
// profile — not the loader — is the authority. A loader that has not seen the
// plugin yet (the state right after an install, before a Harness restart) must
// not cost the plugin its status.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";

import { InstallerService } from "../../plugins/dsh-plugin-market/lib/services/installer.js";
import type { PluginCacheLike } from "../../plugins/dsh-plugin-market/lib/services/installer.js";

const home = mkdtempSync(join(tmpdir(), "dsh-plugin-market-"));
const profileDir = join(home, "profiles", "web");
mkdirSync(profileDir, { recursive: true });
process.env.DSH_HOME = home;

after(() => {
  delete process.env.DSH_HOME;
  rmSync(home, { recursive: true, force: true });
});

/** Catalog rows, including the same-name decoys the old matcher turned green. */
const rows = [
  { id: "github:MeteorNOX/DeepSeek-Balance-Whale-Widget", name: "DeepSeek-Balance-Whale-Widget" },
  { id: "github:dsh-market/dsh-market", name: "dsh-market" },
  { id: "github:2BingLing/dsh-market", name: "dsh-market" },
  { id: "npm:whale-on-desk", name: "whale-on-desk" },
];

interface Stub {
  cache: PluginCacheLike;
  applied: string[][];
}

function stubCache(): Stub {
  const applied: string[][] = [];
  return {
    applied,
    cache: {
      getPlugin: () => null,
      listIdentities: () => rows,
      applyInstalledIds: (ids) => {
        applied.push([...ids]);
        return ids.length;
      },
      setInstalled: () => {},
      addInstallLog: () => 1,
      updateInstallLog: () => {},
    },
  };
}

function writeManifest(manifest: unknown): void {
  writeFileSync(join(profileDir, "package.json"), JSON.stringify(manifest, null, 2));
}

function writeInstalledVersion(name: string, version: string): void {
  const dir = join(profileDir, "node_modules", ...name.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }));
}

beforeEach(() => {
  writeManifest({ dependencies: {}, dsh: { profile: { bundles: [] } } });
});

test("the manifest, not the loader, decides which catalog rows are installed", async () => {
  writeManifest({
    dependencies: {
      "dsh-market": "file:/tmp/plugins/dsh-market",
      "dsh-whale-widget": "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
    },
    dsh: { profile: { bundles: ["dsh-whale-widget"] } },
  });
  const { cache, applied } = stubCache();
  // An empty loader is exactly the post-install, pre-restart state.
  const installer = new InstallerService(cache, "dsh", "web", true);
  installer.bindLoader({ entries: () => [] });

  const result = await installer.refreshInstalledFlags();
  assert.deepEqual(result, { updated: true, profile: "web", installed: 1, error: null });
  assert.deepEqual(applied, [["github:MeteorNOX/DeepSeek-Balance-Whale-Widget"]]);
});

test("an unreadable profile keeps the last known flags instead of clearing them", async () => {
  rmSync(join(profileDir, "package.json"), { force: true });
  const { cache, applied } = stubCache();
  const installer = new InstallerService(cache, "dsh", "web", true);

  const result = await installer.refreshInstalledFlags();
  assert.equal(result.updated, false);
  assert.match(result.error ?? "", /no profile manifest/);
  assert.deepEqual(applied, [], "an unreadable profile must not wipe the flags");
  assert.match(installer.profileError ?? "", /no profile manifest/);
});

test("the installed list carries source, version and enabled state", async () => {
  writeManifest({
    dependencies: {
      "dsh-market": "file:/tmp/plugins/dsh-market",
      "dsh-whale-widget": "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
    },
    dsh: { profile: { bundles: ["dsh-whale-widget"] } },
  });
  writeInstalledVersion("dsh-whale-widget", "0.3.2");
  const { cache } = stubCache();
  const installer = new InstallerService(cache, "dsh", "web", true);

  const snapshot = await installer.getInstalled();
  assert.equal(snapshot.error, null);
  assert.equal(snapshot.profile, "web");
  const byName = new Map(snapshot.plugins.map((entry) => [entry.name, entry]));
  assert.equal(byName.get("dsh-whale-widget")?.version, "0.3.2");
  assert.equal(byName.get("dsh-whale-widget")?.active, true);
  assert.equal(byName.get("dsh-whale-widget")?.catalogId, "github:MeteorNOX/DeepSeek-Balance-Whale-Widget");
  assert.equal(byName.get("dsh-market")?.kind, "local");
  assert.equal(byName.get("dsh-market")?.version, null);
  assert.equal(byName.get("dsh-market")?.active, false);
});

test("uninstall targets the installed package, never a same-named other source", () => {
  writeManifest({
    dependencies: {
      "dsh-market": "file:/tmp/plugins/dsh-market",
      "dsh-whale-widget": "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
    },
    dsh: { profile: { bundles: [] } },
  });
  const { cache } = stubCache();
  const installer = new InstallerService(cache, "dsh", "web", true);

  // The installed tab uninstalls by the profile's own key.
  assert.deepEqual(installer.resolveUninstallTarget("dsh-whale-widget", "web"), {
    name: "dsh-whale-widget",
    catalogId: "github:MeteorNOX/DeepSeek-Balance-Whale-Widget",
  });
  // A catalog id resolves through the dependency SPEC, not through its name.
  assert.deepEqual(
    installer.resolveUninstallTarget("github:MeteorNOX/DeepSeek-Balance-Whale-Widget", "web"),
    { name: "dsh-whale-widget", catalogId: "github:MeteorNOX/DeepSeek-Balance-Whale-Widget" },
  );
  assert.deepEqual(installer.resolveUninstallTarget("dsh-market", "web"), {
    name: "dsh-market",
    catalogId: null,
  });
  // `github:dsh-market/dsh-market` is a DIFFERENT source from the local copy:
  // resolving it to `dsh-market` would remove the user's local plugin.
  assert.match(
    installer.resolveUninstallTarget("github:dsh-market/dsh-market", "web").error ?? "",
    /is not installed in profile "web"/,
  );
  assert.match(
    installer.resolveUninstallTarget("npm:whale-on-desk", "web").error ?? "",
    /is not installed in profile "web"/,
  );
  assert.match(installer.resolveUninstallTarget("", "web").error ?? "", /pluginId is required/);
});
