import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCost,
  formatExactTokens,
  formatTokens,
  isPeakNow,
  sharePercent,
} from "../../src/lib/usage-format.ts";

test("token counts are compact per locale and exact on demand", () => {
  assert.equal(formatTokens(217_571_265, "en"), "217.57M");
  assert.equal(formatTokens(217_571_265, "zh-CN"), "2.18亿");
  assert.equal(formatTokens(748_613, "zh-CN"), "74.86万");
  assert.equal(formatExactTokens(217_571_265, "en"), "217,571,265");
  assert.equal(formatExactTokens(Number.NaN, "en"), "—");
});

test("an unpriced model never renders as zero spend", () => {
  assert.equal(formatCost(null, "en"), "—");
  assert.equal(formatCost(Number.NaN, "en"), "—");
  assert.equal(formatCost(0, "en"), "$0.00");
  assert.equal(formatCost(0.0129, "en"), "$0.0129");
  assert.equal(formatCost(0.00645, "en"), "$0.006450");
  assert.equal(formatCost(12.345, "en"), "$12.35");
});

test("peak windows mirror the billing rule at its UTC boundaries", () => {
  // 2026-09-16 is a Wednesday.
  assert.equal(isPeakNow(new Date("2026-09-16T00:00:00Z")), false);
  assert.equal(isPeakNow(new Date("2026-09-16T01:00:00Z")), true);
  assert.equal(isPeakNow(new Date("2026-09-16T03:59:59Z")), true);
  assert.equal(isPeakNow(new Date("2026-09-16T04:00:00Z")), false);
  assert.equal(isPeakNow(new Date("2026-09-16T06:00:00Z")), true);
  assert.equal(isPeakNow(new Date("2026-09-16T10:00:00Z")), false);
  // 2026-09-19 is a Saturday: no peak window applies.
  assert.equal(isPeakNow(new Date("2026-09-19T02:00:00Z")), false);
});

test("history bars stay inside their track", () => {
  assert.equal(sharePercent(5, 10), 50);
  assert.equal(sharePercent(0, 0), 0);
  assert.equal(sharePercent(20, 10), 100);
  assert.equal(sharePercent(-1, 10), 0);
});
