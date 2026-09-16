// Resolving an installation package from a vendored (symlinked) plugin.
//
// A profile `file:` dependency is a symlink, so Node resolves the plugin's REAL
// path and never walks through `<DSH_HOME>/profiles/node_modules` — the anchor
// DSH itself relies on for `@deepseek-ai/*`. These cases pin the fallback that
// keeps a vendored plugin loading, and the manifest reading it depends on.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import test, { after } from "node:test";

import {
  loadDshPackage,
  packageAnchors,
  packageEntryCandidates,
} from "../../plugins/dsh-plugin-market/lib/services/dsh-package.js";

const home = mkdtempSync(join(tmpdir(), "dsh-package-anchor-"));
after(() => rmSync(home, { recursive: true, force: true }));

/** A package installed into one of the anchors. */
function installPackage(dir: string, manifest: Record<string, unknown>, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  for (const [relative, body] of Object.entries(files)) {
    mkdirSync(join(dir, relative, ".."), { recursive: true });
    writeFileSync(join(dir, relative), body);
  }
}

test("manifest exports pick the runtime entry, most specific first", () => {
  // The shape @deepseek-ai/dsh-typert-protocol ships.
  assert.deepEqual(
    packageEntryCandidates({
      type: "module",
      main: "lib/index.js",
      exports: { ".": { types: "./lib/types/index.d.ts", default: "./lib/index.js" } },
    }),
    ["./lib/index.js", "lib/index.js", "index.js"],
  );
  assert.deepEqual(packageEntryCandidates({ exports: "./main.mjs" }), ["./main.mjs", "index.js"]);
  assert.deepEqual(packageEntryCandidates({ exports: { ".": { import: "./esm.js", require: "./cjs.cjs" } } }), [
    "./esm.js",
    "./cjs.cjs",
    "index.js",
  ]);
  assert.deepEqual(packageEntryCandidates({ module: "esm.js", main: "cjs.js" }), ["esm.js", "cjs.js", "index.js"]);
  assert.deepEqual(packageEntryCandidates({}), ["index.js"]);
  // A subpath-only exports map leaves no root entry to import.
  assert.deepEqual(packageEntryCandidates({ exports: { "./types": "./types.js" }, main: "lib/index.js" }), [
    "lib/index.js",
    "index.js",
  ]);
});

test("anchors follow the installation layout, then the running Harness entry", () => {
  const anchors = packageAnchors("@deepseek-ai/dsh-typert-protocol", {
    home: "/home/u/.dsh",
    argv1: `/app/harness/node_modules/@deepseek-ai/dsh/lib/bin.js`,
  });
  assert.deepEqual(anchors, [
    join("/home/u/.dsh", "profiles", "node_modules", "@deepseek-ai", "dsh-typert-protocol"),
    join("/home/u/.dsh", "node_modules", "@deepseek-ai", "dsh-typert-protocol"),
    join("/app/harness/node_modules", "@deepseek-ai", "dsh-typert-protocol"),
  ]);
  // Without a booted Harness entry there is simply one anchor fewer.
  assert.equal(packageAnchors("sql.js", { home: "/h", argv1: "/usr/bin/node" }).length, 2);
});

test("a package the profile cannot see is still found through the anchor", async () => {
  const shared = join(home, "profiles", "node_modules", "@demo", "peer");
  installPackage(
    shared,
    { name: "@demo/peer", version: "1.0.0", type: "module", exports: { ".": { default: "./lib/index.js" } } },
    { "lib/index.js": 'export const marker = "from-anchor";\n' },
  );

  // No bare resolution is possible from this repository, which is the point.
  const loaded = await loadDshPackage("@demo/peer", { home, argv1: "/usr/bin/node" });
  assert.equal(loaded.marker, "from-anchor");
});

test("an unresolvable package reports every attempt", async () => {
  await assert.rejects(
    () => loadDshPackage("@demo/missing", { home, argv1: `${sep}app${sep}node_modules${sep}dsh${sep}bin.js` }),
    (error: Error) => {
      assert.match(error.message, /cannot resolve @demo\/missing/);
      assert.match(error.message, /Cannot find package '@demo\/missing'/);
      return true;
    },
  );
});

test("a package directory without a readable manifest is skipped, not fatal", async () => {
  installPackage(join(home, "profiles", "node_modules", "@demo", "broken"), {}, { "lib/index.js": "export {};\n" });
  // `{}` has no entry candidates other than index.js, which is absent.
  await assert.rejects(() => loadDshPackage("@demo/broken", { home, argv1: "/usr/bin/node" }), /cannot resolve/);
});
