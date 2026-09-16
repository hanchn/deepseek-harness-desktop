// Host half of dsh-market: the inventory the Market page renders, the user
// source file it merges over the built-ins, and the read-only invariant that
// protects skills this page did not create.
//
// The plugin ships built JS with no declarations, so it is imported through a
// non-literal dynamic import (typed locally here). Only routes that touch no
// network are exercised: browsing and installing both resolve a GitHub commit
// first, so those stay covered by a live probe rather than by this test.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

const INDEX = new URL("../../plugins/dsh-market/lib/index.js", import.meta.url);

interface RouteSpec {
  handler: (req: unknown, res: unknown) => Promise<void>;
}
interface Json {
  [key: string]: unknown;
}
interface Result {
  status: number;
  json: Json;
}

const homes: string[] = [];

/** A temp DSH_HOME plus a mounted plugin whose routes can be called directly. */
async function mount() {
  const home = mkdtempSync(join(tmpdir(), "dsh-market-test-"));
  homes.push(home);
  process.env.DSH_HOME = home;
  process.env.DSH_AGENTS_HOME = join(home, "agents");
  mkdirSync(join(home, "agents", "skills"), { recursive: true });

  const { apply } = (await import(INDEX.href)) as { apply: (ctx: unknown) => void };
  const routes = new Map<string, RouteSpec>();
  apply({
    effect: (fn: () => void) => {
      fn();
      return () => {};
    },
    webServer: {
      register: (spec: { kind: string; path: string; handler: RouteSpec["handler"] }) => {
        routes.set(`${spec.kind} ${spec.path}`, spec);
        return () => {};
      },
    },
    connection: { requestRejection: () => undefined },
    get: () => undefined,
    inject: () => {},
    logger: { warn: () => {}, error: () => {} },
  });

  const request = async (method: string, path: string, query = "", payload?: Json): Promise<Result> => {
    const spec = routes.get(`exact ${path}`);
    assert.ok(spec, `route not registered: ${path}`);
    const req = Object.assign(Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]), {
      method,
      url: `${path}${query}`,
      headers: payload === undefined ? {} : { "content-type": "application/json" },
    });
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (chunk?: Buffer | string) => {
        if (chunk !== undefined) chunks.push(Buffer.from(chunk));
      },
    };
    await spec.handler(req, res);
    const body = Buffer.concat(chunks).toString("utf8");
    return { status: res.statusCode, json: body === "" ? {} : (JSON.parse(body) as Json) };
  };

  const skillFile = (name: string, frontmatter: string) => {
    const dir = join(home, "agents", "skills", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\nbody of ${name}\n`);
    return dir;
  };

  return { home, request, skillFile };
}

test("the inventory separates what this page owns from what it only found", async () => {
  const { request, skillFile } = await mount();

  // A hand-placed skill (the repository's own vendored ones look like this) with
  // a block-scalar description — the form `description: |` that most 1688 and
  // linkfox skills use.
  skillFile("1688-shopkeeper", "name: 1688-shopkeeper\ndescription: |\n  选品铺货与商机趋势。\n  第二行也要保留。");
  // Skills this page authored and installed, told apart by their marker.
  const custom = skillFile("created-here", "name: created-here\ndescription: plain");
  writeFileSync(join(custom, ".dsh-market.json"), JSON.stringify({ kind: "custom" }));
  const sourced = skillFile("from-source", "name: from-source\ndescription: pinned");
  writeFileSync(
    join(sourced, ".dsh-market.json"),
    JSON.stringify({ kind: "source", repo: "owner/repo", ref: "a".repeat(40), path: "skills/from-source" }),
  );

  const result = await request("GET", "/dsh-market/skills", "?scope=user");
  assert.equal(result.status, 200);
  const skills = result.json.skills as Array<{
    name: string;
    description: string;
    origin: string;
    source: { repo: string } | null;
  }>;
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  assert.equal(skills.length, 3);
  assert.equal(byName.get("1688-shopkeeper")?.origin, "readonly");
  assert.equal(byName.get("created-here")?.origin, "custom");
  assert.equal(byName.get("from-source")?.origin, "source");
  assert.equal(byName.get("from-source")?.source?.repo, "owner/repo");
  assert.equal(
    byName.get("1688-shopkeeper")?.description,
    "选品铺货与商机趋势。\n第二行也要保留。",
    "a block scalar keeps every line, not the literal '|'",
  );
  assert.deepEqual(result.json.dir, join(String(process.env.DSH_AGENTS_HOME), "skills"));
});

test("a skill this page did not create cannot be edited or deleted", async () => {
  const { request, skillFile } = await mount();
  const dir = skillFile("1688-shopkeeper", "name: 1688-shopkeeper\ndescription: hand made");

  const removed = await request("POST", "/dsh-market/skills/remove", "", {
    scope: "user",
    name: "1688-shopkeeper",
    confirm: true,
  });
  assert.equal(removed.status, 409);
  assert.equal(removed.json.code, "read-only");
  assert.ok(existsSync(join(dir, "SKILL.md")), "the read-only skill is still on disk");

  const saved = await request("POST", "/dsh-market/skills/save", "", {
    scope: "user",
    name: "1688-shopkeeper",
    description: "edited",
    body: "edited",
  });
  assert.equal(saved.status, 409);
  assert.ok(readFileSync(join(dir, "SKILL.md"), "utf8").includes("hand made"));
});

test("user sources merge over the built-ins, and a broken file degrades to a notice", async () => {
  const { home, request } = await mount();
  writeFileSync(
    join(home, "market.json"),
    JSON.stringify({
      skillSources: [
        { id: "1688-shopkeeper", label: "1688 选品", repo: "next-1688/1688-shopkeeper", path: "" },
        { id: "linkfox-skills", label: "LinkFox", repo: "linkfox-ai/linkfox-skills", path: "skills" },
        { id: "bad", label: "no repo", path: "skills" },
      ],
    }),
  );

  const merged = await request("GET", "/dsh-market/sources");
  assert.equal(merged.status, 200);
  assert.equal(merged.json.configError, null);
  const sources = merged.json.sources as Array<{ id: string; repo: string; path: string }>;
  assert.deepEqual(
    sources.map((source) => source.id),
    ["anthropic-skills", "1688-shopkeeper", "linkfox-skills"],
    "the built-in survives and the entry without a repo is dropped",
  );
  assert.deepEqual(
    sources.filter((source) => source.id === "linkfox-skills").map((source) => source.path),
    ["skills"],
  );

  writeFileSync(join(home, "market.json"), "{ not json");
  const broken = await request("GET", "/dsh-market/sources");
  assert.equal(broken.status, 200);
  assert.match(String(broken.json.configError), /market\.json/);
  assert.deepEqual(
    (broken.json.sources as Array<{ id: string }>).map((source) => source.id),
    ["anthropic-skills"],
    "a broken file yields the built-ins, never a half-merged list",
  );
});

test.after(() => {
  delete process.env.DSH_HOME;
  delete process.env.DSH_AGENTS_HOME;
  for (const home of homes) rmSync(home, { recursive: true, force: true });
});
