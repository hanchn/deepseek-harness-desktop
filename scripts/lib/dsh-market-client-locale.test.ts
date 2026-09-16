// Every `t('…')` the vendored dsh-market client uses must exist in both locale
// dictionaries, and each message that is called with values must actually name
// those values.
//
// The client is a browser bundle this repository does not build (the plugin
// ships built `lib/`), so a missing key cannot fail a type check — it just
// renders the raw key in the UI. This reads the bundle as text and holds the
// two dictionaries to that contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CLIENT = new URL("../../plugins/dsh-market/lib/client.js", import.meta.url);
const source = readFileSync(CLIENT, "utf8");

/** The `const NAME = { … }` literal, matched by brace depth so nesting is safe. */
function objectLiteral(name: string): string {
  const start = source.indexOf(`const ${name} = {`);
  assert.notEqual(start, -1, `${name} dictionary not found`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(source.indexOf("{", start), index + 1);
    }
  }
  assert.fail(`${name} dictionary is not balanced`);
}

/** Top-level keys of a flat object literal: six-space indented `key:` lines. */
function keysOf(literal: string): Set<string> {
  const keys = new Set<string>();
  for (const match of literal.matchAll(/^\s{6}"([A-Za-z][A-Za-z0-9.]*)":/gm)) keys.add(match[1]);
  return keys;
}

/** Every locale key the client asks for, with or without an interpolation bag. */
function usedKeys(): Set<string> {
  const used = new Set<string>();
  for (const match of source.matchAll(/\bt\(\s*(["'])([A-Za-z][A-Za-z0-9.]*)\1/g)) used.add(match[2]);
  return used;
}

/** The value names in a `{ … }` bag: `count` shorthand, or the `count` of `count: x`. */
function bagNames(bag: string): Set<string> {
  const names = new Set<string>();
  for (const part of bag.split(",")) {
    const [head] = part.split(":");
    const name = head.trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
  }
  return names;
}

/** `t("key", { alpha, beta: x })` — the names the call passes in. */
function interpolationCalls(): Map<string, Set<string>> {
  const calls = new Map<string, Set<string>>();
  for (const match of source.matchAll(/\bt\(\s*(["'])([A-Za-z][A-Za-z0-9.]*)\1\s*,\s*\{([^}]*)\}/g)) {
    const names = calls.get(match[2]) ?? new Set<string>();
    for (const name of bagNames(match[3])) names.add(name);
    calls.set(match[2], names);
  }
  return calls;
}

/** The `{placeholder}` names a dictionary entry interpolates. */
function placeholdersOf(literal: string, key: string): Set<string> {
  const line = new RegExp(`^\\s{6}"${key.replace(/\./g, "\\.")}":\\s*(.*)$`, "m").exec(literal);
  const names = new Set<string>();
  if (line === null) return names;
  for (const match of line[1].matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) names.add(match[1]);
  return names;
}

test("the dsh-market client resolves every locale key it uses", () => {
  const zh = keysOf(objectLiteral("ZH"));
  const en = keysOf(objectLiteral("EN"));
  assert.ok(zh.size > 40, "sanity: the dictionaries are parsed, not empty");
  assert.deepEqual([...usedKeys()].filter((key) => !zh.has(key)), [], "keys missing from the Chinese dictionary");
  assert.deepEqual([...usedKeys()].filter((key) => !en.has(key)), [], "keys missing from the English dictionary");
});

test("both dsh-market dictionaries offer the same keys", () => {
  const zh = keysOf(objectLiteral("ZH"));
  const en = keysOf(objectLiteral("EN"));
  assert.deepEqual([...zh].filter((key) => !en.has(key)), [], "Chinese-only keys");
  assert.deepEqual([...en].filter((key) => !zh.has(key)), [], "English-only keys");
});

test("every interpolated call names values its message actually uses", () => {
  const zh = objectLiteral("ZH");
  const en = objectLiteral("EN");
  const missing: string[] = [];
  for (const [key, names] of interpolationCalls()) {
    for (const locale of [
      ["zh", zh],
      ["en", en],
    ] as const) {
      const available = placeholdersOf(locale[1], key);
      for (const name of names) {
        if (!available.has(name)) missing.push(`${locale[0]} ${key}: {${name}} is not in the message`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
