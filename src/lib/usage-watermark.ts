/**
 * Corner-usage watermark preference. This is a purely visual controller
 * choice, so it lives in the same privacy-tolerant browser storage as the
 * controller language: a restrictive WebView that refuses reads or writes
 * must never break the controller, it only loses the preference.
 */

export const USAGE_WATERMARK_STORAGE_KEY = "dsh-desktop.usage-watermark.v1";

export type UsageWatermarkPosition = "bottom-right" | "top-right" | "hidden";

/** Corner the watermark starts in when nothing was ever saved. */
export const DEFAULT_USAGE_WATERMARK: UsageWatermarkPosition = "bottom-right";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    // Resolving `localStorage` itself can throw SecurityError in
    // privacy-restricted WebViews, and this runs while the controller
    // initializes.
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function isUsageWatermarkPosition(value: unknown): value is UsageWatermarkPosition {
  return value === "bottom-right" || value === "top-right" || value === "hidden";
}

export function loadUsageWatermarkPosition(
  storage: KeyValueStorage | null = defaultStorage(),
): UsageWatermarkPosition {
  if (!storage) return DEFAULT_USAGE_WATERMARK;
  try {
    const value = storage.getItem(USAGE_WATERMARK_STORAGE_KEY);
    return isUsageWatermarkPosition(value) ? value : DEFAULT_USAGE_WATERMARK;
  } catch {
    return DEFAULT_USAGE_WATERMARK;
  }
}

export function saveUsageWatermarkPosition(
  position: UsageWatermarkPosition,
  storage: KeyValueStorage | null = defaultStorage(),
): boolean {
  if (!isUsageWatermarkPosition(position)) return false;
  if (!storage) return false;
  try {
    storage.setItem(USAGE_WATERMARK_STORAGE_KEY, position);
    return true;
  } catch {
    return false;
  }
}
