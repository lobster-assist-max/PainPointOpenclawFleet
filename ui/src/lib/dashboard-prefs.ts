/**
 * dashboard-prefs — persist the Fleet Dashboard's sort + group-by preference
 * across reloads.
 *
 * The dashboard's sort/group controls previously reset to their defaults on
 * every page reload, so an operator who set "Sort by cost" or "Group by status"
 * lost it the moment they refreshed. These helpers persist the *explicit* user
 * choice (not the transient KPI drill-downs) to localStorage, validated against
 * the known key sets so a stale/corrupt stored value can never break the sort.
 *
 * Follows the repo's `fleet:` localStorage-key + try/catch (private-browsing
 * safe) convention.
 */

import type { SortKey, GroupKey } from "@/components/fleet/FilterBar";

const SORT_STORAGE_KEY = "fleet:dashboard-sort";
const GROUP_STORAGE_KEY = "fleet:dashboard-group";

// Runtime allow-lists — the single source of truth for validation. Kept in sync
// with the SortKey/GroupKey unions in FilterBar; the `satisfies` guards below
// fail the build if a union member is dropped from these arrays.
const VALID_SORT_KEYS = [
  "attention",
  "health",
  "cost",
  "sessions",
  "name",
  "lastActive",
] as const satisfies readonly SortKey[];

const VALID_GROUP_KEYS = [
  "none",
  "status",
  "environment",
  "channel",
  "team",
  "model",
] as const satisfies readonly GroupKey[];

export function loadDashboardSort(): SortKey | null {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return v && (VALID_SORT_KEYS as readonly string[]).includes(v) ? (v as SortKey) : null;
  } catch {
    /* localStorage unavailable (private browsing) */
    return null;
  }
}

export function saveDashboardSort(key: SortKey): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, key);
  } catch {
    /* localStorage unavailable (private browsing) */
  }
}

export function loadDashboardGroup(): GroupKey | null {
  try {
    const v = localStorage.getItem(GROUP_STORAGE_KEY);
    return v && (VALID_GROUP_KEYS as readonly string[]).includes(v) ? (v as GroupKey) : null;
  } catch {
    /* localStorage unavailable (private browsing) */
    return null;
  }
}

export function saveDashboardGroup(key: GroupKey): void {
  try {
    localStorage.setItem(GROUP_STORAGE_KEY, key);
  } catch {
    /* localStorage unavailable (private browsing) */
  }
}
