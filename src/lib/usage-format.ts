/**
 * Presentation helpers for the usage panel. Pure functions only: the panel
 * renders numbers the Rust report already decided, so every conversion that
 * could be wrong lives here with a test.
 */

// Type-only, so the `.js` specifier the NodeNext test config needs is erased
// before Vite ever resolves it.
import type { ControllerLocale } from "./controller-i18n.js";

/** Compact token count for a metric tile (`217571265` → `218M`). */
export function formatTokens(value: number, locale: ControllerLocale): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Exact, grouped token count for a tooltip or a table cell. */
export function formatExactTokens(value: number, locale: ControllerLocale): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/**
 * Estimated spend in USD. `null` means the rate card does not cover the model,
 * which must never render as `$0.00`: an unpriced call is unknown, not free.
 */
export function formatCost(usd: number | null, locale: ControllerLocale): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  const digits = usd === 0 ? 2 : usd < 0.01 ? 6 : usd < 1 ? 4 : 2;
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(usd);
  return `$${value}`;
}

/**
 * Whether an instant falls inside a peak window: 01:00–04:00 and 06:00–10:00
 * UTC, Monday through Friday. Mirrors `usage::is_peak` in the Rust side.
 */
export function isPeakNow(date: Date): boolean {
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = Monday
  if (weekday >= 5) return false;
  const hour = date.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

/** Share of a total, clamped to `0..100`, for the history bar. */
export function sharePercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}
