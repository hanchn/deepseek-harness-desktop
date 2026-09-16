// Every `t('…')` the vendored market client uses must exist in both locale
// dictionaries, and the two dictionaries must offer the same keys.
//
// The client is a browser bundle this repository does not build (the plugin
// ships built `lib/`), so a missing key cannot fail a type check — it just
// renders the raw key in the UI. This reads the bundle as text and holds the
// dictionaries to that contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CLIENT = new URL("../../plugins/dsh-plugin-market/lib/client.js", import.meta.url);
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
  for (const match of literal.matchAll(/^\s{6}([A-Za-z][A-Za-z0-9]*):/gm)) keys.add(match[1]);
  return keys;
}

/** Every locale key the client asks for. */
function usedKeys(): Set<string> {
  const used = new Set<string>();
  for (const match of source.matchAll(/\bt\((["'])([A-Za-z][A-Za-z0-9]*)\1\)/g)) used.add(match[2]);
  return used;
}

test("the market client resolves every locale key it uses", () => {
  const zh = keysOf(objectLiteral("ZH"));
  const en = keysOf(objectLiteral("EN"));
  const used = usedKeys();

  assert.ok(zh.size > 40, "sanity: the dictionaries are parsed, not empty");
  assert.deepEqual(
    [...used].filter((key) => !zh.has(key)),
    [],
    "keys missing from the Chinese dictionary",
  );
  assert.deepEqual(
    [...used].filter((key) => !en.has(key)),
    [],
    "keys missing from the English dictionary",
  );
});

test("both market dictionaries offer the same keys", () => {
  const zh = keysOf(objectLiteral("ZH"));
  const en = keysOf(objectLiteral("EN"));
  assert.deepEqual([...zh].filter((key) => !en.has(key)), [], "Chinese-only keys");
  assert.deepEqual([...en].filter((key) => !zh.has(key)), [], "English-only keys");
});
