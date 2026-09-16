// The merged Session-header control in `plugins/dsh-open-in-app-plus` cannot be
// verified in a browser from CI: the Harness fences its own pages behind a
// browser-auth cookie. These tests instead drive the plugin's browser half
// headlessly — load it through a stubbed module loader, then render the
// registered occupant with a minimal hook runtime and assert the merge contract:
// it takes over the shipped `open-in-app` cell, and each entry launches through
// the route that owns its catalog.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const pluginClient = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  "plugins/dsh-open-in-app-plus/lib/client.js",
);

interface SlotRegistration {
  options: {
    name: string;
    id: string;
    order: number;
    inject: () => Record<string, unknown>;
  };
  component: (props: Record<string, unknown>) => unknown;
}

interface Rendered {
  type: unknown;
  props: Record<string, any>;
  children: unknown[];
}

/** Minimal hook runtime: one state slot per call site, re-rendered on demand. */
function createHooks() {
  const states: unknown[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;
  return {
    begin() {
      for (const cleanup of effects) if (typeof cleanup === "function") cleanup();
      effects.length = 0;
      cursor = 0;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      const set = (next: unknown) => {
        states[index] = typeof next === "function" ? (next as (p: unknown) => unknown)(states[index]) : next;
      };
      return [states[index], set];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useEffect(callback: () => void | (() => void)) {
      const index = cursor++;
      const cleanup = callback();
      if (typeof cleanup === "function") effects[index] = cleanup;
    },
    async settle() {
      // The plugin's catalog read is `Promise.all` over two awaited fetches, so a
      // couple of microtask ticks are not enough; one macrotask flushes them all.
      for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

interface Harness {
  registration: SlotRegistration;
  hooks: ReturnType<typeof createHooks>;
}

/** The inject face's catalog reader, typed for the test's own use. */
function catalogLoader(registration: SlotRegistration): () => Promise<unknown> {
  const face = registration.options.inject() as { loadCatalogs: () => Promise<unknown> };
  return face.loadCatalogs;
}

function loadPlugin(catalogs: { shipped: string[]; custom: unknown[]; unavailable?: unknown[] }) {
  const source = readFileSync(pluginClient, "utf8");
  let definition: { id: string; factory: (require: (id: string) => unknown) => any } | undefined;
  const styleTags: unknown[] = [];

  const hooks = createHooks();
  const React = {
    createElement: (type: unknown, props: Record<string, any> | null, ...children: unknown[]) => ({
      type,
      props: props ?? {},
      children,
    }),
    useState: (initial: unknown) => hooks.useState(initial),
    useEffect: (callback: () => void | (() => void)) => hooks.useEffect(callback),
    useRef: (initial: unknown) => hooks.useRef(initial),
  };

  const sandbox = {
    window: { __ModuleLoader__: { load: (def: typeof definition) => (definition = def) } },
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {}, textContent: "" }),
      head: { appendChild: (el: unknown) => styleTags.push(el) },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("open-in-app-plus")
          ? { apps: catalogs.custom, unavailable: catalogs.unavailable ?? [], configPath: "/tmp/x.json", configError: null }
          : { apps: catalogs.shipped },
    }),
    console,
    setTimeout,
    clearTimeout,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: pluginClient });

  assert.ok(definition, "the plugin must call window.__ModuleLoader__.load");
  const require = (id: string) => {
    if (id === "react") return React;
    throw new Error(`unexpected require: ${id}`);
  };
  return { exports: definition!.factory(require), hooks };
}

async function applyPlugin(catalogs: { shipped: string[]; custom: unknown[] }) {
  const { exports: plugin, hooks } = loadPlugin(catalogs);
  const registrations: SlotRegistration[] = [];
  const ctx = {
    effect: (fn: () => void) => fn(),
    get: () => undefined,
    locale: { register: () => {} },
    slots: {
      inject: (_name: string, cb: () => void) => cb(),
      register: (options: SlotRegistration["options"], component: SlotRegistration["component"]) => {
        registrations.push({ options, component });
      },
    },
  };
  await plugin.apply(ctx);
  assert.equal(registrations.length, 1, "the plugin registers exactly one header occupant");
  return { registration: registrations[0]!, hooks };
}

function find(node: unknown, predicate: (node: Rendered) => boolean): Rendered | null {
  if (node === null || typeof node !== "object") return null;
  const rendered = node as Rendered;
  if (predicate(rendered)) return rendered;
  for (const child of rendered.children ?? []) {
    const found = find(child, predicate);
    if (found !== null) return found;
  }
  return null;
}

function classOf(node: Rendered): string {
  return typeof node.props?.class === "string" ? node.props.class : "";
}

test("the plugin takes over the shipped open-in-app cell instead of adding a second control", async () => {
  const { registration } = await applyPlugin({ shipped: ["finder"], custom: [] });
  assert.equal(registration.options.name, "conversation.session.header.utilities");
  assert.equal(registration.options.id, "open-in-app");
  assert.equal(registration.options.order, -10);
  assert.equal(typeof registration.component, "function");
});

test("one menu serves both catalogs and each entry launches through its own route", async () => {
  const { registration, hooks } = await applyPlugin({
    shipped: ["finder", "cursor"],
    custom: [{ id: "trae", label: "Trae", kind: "app" }],
  });

  const launches: Array<{ id: string; source: string; path: string }> = [];
  const props = {
    sessionId: "s1",
    useSessions: (selector: (state: any) => unknown) => selector({ byId: { s1: { cwd: "/work" } } }),
    t: (key: string) => key,
    loadCatalogs: catalogLoader(registration),
    launch: (entry: { id: string; source: string }, path: string) => {
      launches.push({ id: entry.id, source: entry.source, path });
      return Promise.resolve();
    },
  };

  const render = () => {
    hooks.begin();
    return registration.component(props) as Rendered | null;
  };

  // First pass: the catalog request is still in flight, so nothing renders yet.
  assert.equal(render(), null);
  await hooks.settle();
  const closed = render();
  assert.ok(closed, "the control renders once the catalogs resolve");

  const chevron = find(closed, (node) => classOf(node) === "cx-oi-chev");
  assert.ok(chevron, "the merged control is a split button with its own chevron");
  chevron.props.onClick();

  const open = render();
  const items = [] as Rendered[];
  const collect = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const rendered = node as Rendered;
    if (classOf(rendered) === "cx-oi-item") items.push(rendered);
    for (const child of rendered.children ?? []) collect(child);
  };
  collect(open);
  assert.equal(items.length, 3, "both shipped apps and the custom entry are in one menu");

  // Shipped entries go through the upstream route, custom ones through ours.
  const labels = items.map((item) => (item.children[1] as Rendered).children[0]);
  assert.deepEqual(labels, ["访达", "Cursor", "Trae"]);
  items[0]!.props.onClick();
  await hooks.settle();
  items[2]!.props.onClick();
  await hooks.settle();
  assert.deepEqual(launches, [
    { id: "finder", source: "ship", path: "/work" },
    { id: "trae", source: "plus", path: "/work" },
  ]);
});

test("the control stays out of the header when the session has no workspace directory", async () => {
  const { registration, hooks } = await applyPlugin({ shipped: ["finder"], custom: [] });
  hooks.begin();
  const props = {
    sessionId: "s1",
    useSessions: (selector: (state: any) => unknown) => selector({ byId: { s1: { cwd: "" } } }),
    t: (key: string) => key,
    loadCatalogs: catalogLoader(registration),
    launch: () => Promise.resolve(),
  };
  assert.equal(registration.component(props), null);
});
