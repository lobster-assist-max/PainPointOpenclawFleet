const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * NaN-safe epoch-ms parse for use in sort comparators. A missing / unparseable
 * date (e.g. a DB-fallback record with no timestamp) → new Date(bad) → NaN would
 * make a `b - a` comparator non-deterministic (NaN propagates, the sort order
 * becomes unstable). Returns 0 for an invalid value so it sorts as the oldest.
 * Mirrors the NaN guard in `timeAgo` and the `Number.isFinite` guard in the
 * FilterBar "lastActive" sort — the shared home for that pattern.
 */
export function toTimestamp(date: Date | string | null | undefined): number {
  const t = new Date(date ?? "").getTime();
  return Number.isFinite(t) ? t : 0;
}

export function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  // Guard against a missing / unparseable date — without this, new Date(bad) →
  // NaN → every bucket comparison is false → falls through to "NaNmo ago".
  // Returns an em dash instead (matches the fleet timeAgo copy in useFleetMonitor).
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.round((now - then) / 1000);

  if (seconds < MINUTE) return "just now";
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return `${m}m ago`;
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return `${h}h ago`;
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return `${d}d ago`;
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return `${w}w ago`;
  }
  const mo = Math.floor(seconds / MONTH);
  return `${mo}mo ago`;
}
