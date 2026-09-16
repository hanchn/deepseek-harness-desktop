import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_USAGE_WATERMARK,
  USAGE_WATERMARK_STORAGE_KEY,
  isUsageWatermarkPosition,
  loadUsageWatermarkPosition,
  saveUsageWatermarkPosition,
  type KeyValueStorage,
} from "../../src/lib/usage-watermark.ts";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

test("only the three known positions are accepted", () => {
  assert.equal(isUsageWatermarkPosition("bottom-right"), true);
  assert.equal(isUsageWatermarkPosition("top-right"), true);
  assert.equal(isUsageWatermarkPosition("hidden"), true);
  assert.equal(isUsageWatermarkPosition("left"), false);
  assert.equal(isUsageWatermarkPosition(null), false);
  assert.equal(isUsageWatermarkPosition(7), false);
});

test("a saved corner round-trips and anything else falls back", () => {
  const storage = memoryStorage();
  assert.equal(loadUsageWatermarkPosition(storage), DEFAULT_USAGE_WATERMARK);
  assert.equal(saveUsageWatermarkPosition("top-right", storage), true);
  assert.equal(storage.getItem(USAGE_WATERMARK_STORAGE_KEY), "top-right");
  assert.equal(loadUsageWatermarkPosition(storage), "top-right");
  // A value written by a future version must not be trusted.
  assert.equal(
    loadUsageWatermarkPosition(memoryStorage({ [USAGE_WATERMARK_STORAGE_KEY]: "diagonal" })),
    DEFAULT_USAGE_WATERMARK,
  );
});

test("storage failures never take the controller down", () => {
  const hostile: KeyValueStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(loadUsageWatermarkPosition(hostile), DEFAULT_USAGE_WATERMARK);
  assert.equal(saveUsageWatermarkPosition("hidden", hostile), false);
  assert.equal(loadUsageWatermarkPosition(null), DEFAULT_USAGE_WATERMARK);
  assert.equal(saveUsageWatermarkPosition("hidden", null), false);
});
