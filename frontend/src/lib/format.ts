import type { SensorLiveReading } from "@/stores/liveStore";

/** Placeholder rendered whenever a metric has no underlying data. */
export const NO_DATA = "—";

/**
 * Formats a metric for display. Missing values (null, undefined, NaN) render as
 * NO_DATA instead of a made-up default, so the UI never shows numbers that did
 * not come from the backend.
 */
export function fmtNumber(value: unknown, digits = 1): string {
  if (value === null || value === undefined || value === "") return NO_DATA;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return NO_DATA;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtPct(value: unknown, digits = 1): string {
  const s = fmtNumber(value, digits);
  return s === NO_DATA ? s : `${s}%`;
}

export function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

/** Most recent live reading of a given sensor type, if any sensor of that type has reported. */
export function latestByType(
  readings: Record<string, SensorLiveReading>,
  type: string
): SensorLiveReading | undefined {
  let latest: SensorLiveReading | undefined;
  for (const r of Object.values(readings)) {
    if (r.type?.toLowerCase() !== type) continue;
    if (!latest || r.lastUpdated > latest.lastUpdated) latest = r;
  }
  return latest;
}
