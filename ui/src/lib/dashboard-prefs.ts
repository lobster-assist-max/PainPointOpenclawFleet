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

import type { SortKey, GroupKey, ViewMode, SortDir } from "@/components/fleet/FilterBar";

const SORT_STORAGE_KEY = "fleet:dashboard-sort";
const SORT_DIR_STORAGE_KEY = "fleet:dashboard-sort-dir";
const GROUP_STORAGE_KEY = "fleet:dashboard-group";
const VIEW_STORAGE_KEY = "fleet:dashboard-view";
// Pinned bots are per-company (bot ids are only unique within a company), so
// the company id is part of the key.
const PIN_STORAGE_PREFIX = "fleet:pinned-bots:";

const VALID_VIEW_MODES = ["grid", "list"] as const satisfies readonly ViewMode[];
const VALID_SORT_DIRS = ["default", "reversed"] as const satisfies readonly SortDir[];

// Runtime allow-lists — the single source of truth for validation. Kept in sync
// with the SortKey/GroupKey unions in FilterBar; the `satisfies` guards below
// fail the build if a union member is dropped from these arrays.
const VALID_SORT_KEYS = [
  "attention",
  "health",
  "cost",
  "budget",
  "sessions",
  "context",
  "channels",
  "uptime",
  "role",
  "name",
  "lastActive",
] as const satisfies readonly SortKey[];

const VALID_GROUP_KEYS = [
  "none",
  "status",
  "grade",
  "role",
  "environment",
  "channel",
  "team",
  "model",
] as const satisfies readonly GroupKey[];

// Compile-time EXHAUSTIVENESS guard. `satisfies readonly SortKey[]` above only
// checks each array element is a valid SortKey — it does NOT catch a union
// member missing from the array (which would silently break persistence + the
// URL-seed parsers for that key). These assertions fail the build if any
// SortKey/GroupKey is absent from its allow-list.
type _AllSortKeysPresent = [SortKey] extends [(typeof VALID_SORT_KEYS)[number]]
  ? true
  : ["missing SortKey(s):", Exclude<SortKey, (typeof VALID_SORT_KEYS)[number]>];
type _AllGroupKeysPresent = [GroupKey] extends [(typeof VALID_GROUP_KEYS)[number]]
  ? true
  : ["missing GroupKey(s):", Exclude<GroupKey, (typeof VALID_GROUP_KEYS)[number]>];
const _assertAllSortKeys: _AllSortKeysPresent = true;
const _assertAllGroupKeys: _AllGroupKeysPresent = true;
void _assertAllSortKeys;
void _assertAllGroupKeys;

// Validate-or-null parsers for an arbitrary string (e.g. a URL query param) —
// the same runtime allow-lists as the localStorage loaders, so a shared
// `?sort=cost&group=status` link can seed the view safely and a bogus/stale
// param (`?sort=bogus`) is ignored rather than breaking the sort.
export function parseSortKey(v: string | null | undefined): SortKey | null {
  return v && (VALID_SORT_KEYS as readonly string[]).includes(v) ? (v as SortKey) : null;
}

export function parseGroupKey(v: string | null | undefined): GroupKey | null {
  return v && (VALID_GROUP_KEYS as readonly string[]).includes(v) ? (v as GroupKey) : null;
}

export function parseSortDir(v: string | null | undefined): SortDir | null {
  return v && (VALID_SORT_DIRS as readonly string[]).includes(v) ? (v as SortDir) : null;
}

export function parseViewMode(v: string | null | undefined): ViewMode | null {
  return v && (VALID_VIEW_MODES as readonly string[]).includes(v) ? (v as ViewMode) : null;
}

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

export function loadDashboardSortDir(): SortDir | null {
  try {
    const v = localStorage.getItem(SORT_DIR_STORAGE_KEY);
    return v && (VALID_SORT_DIRS as readonly string[]).includes(v) ? (v as SortDir) : null;
  } catch {
    /* localStorage unavailable (private browsing) */
    return null;
  }
}

export function saveDashboardSortDir(dir: SortDir): void {
  try {
    localStorage.setItem(SORT_DIR_STORAGE_KEY, dir);
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

export function loadDashboardView(): ViewMode | null {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    return v && (VALID_VIEW_MODES as readonly string[]).includes(v) ? (v as ViewMode) : null;
  } catch {
    /* localStorage unavailable (private browsing) */
    return null;
  }
}

export function saveDashboardView(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    /* localStorage unavailable (private browsing) */
  }
}

/**
 * Bots an operator has pinned so they always float to the top of the grid
 * (and to the top of their group when grouped), regardless of the active sort —
 * useful for keeping a handful of important bots in view on a large fleet.
 * Stored per company, validated so a corrupt/legacy value degrades to empty.
 */
export function loadPinnedBots(companyId: string): Set<string> {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_PREFIX + companyId);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    /* localStorage unavailable (private browsing) or corrupt JSON */
    return new Set();
  }
}

export function savePinnedBots(companyId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(PIN_STORAGE_PREFIX + companyId, JSON.stringify([...ids]));
  } catch {
    /* localStorage unavailable (private browsing) */
  }
}

/**
 * Saved views — named presets bundling the full dashboard view (filter token +
 * sort + sort-direction + group + grid/list). The URL already makes a view
 * shareable (#333/#335) and Reset returns to default (#337), but there was no
 * way to *name and re-apply* a favourite view (e.g. "Over budget, by cost").
 * Views are cross-company (they're filter/sort config, not bot-specific), so
 * they're stored globally. Validated on load so a corrupt/legacy entry degrades
 * to being dropped rather than breaking the menu.
 */
export interface DashboardView {
  searchQuery: string;
  sortBy: SortKey;
  sortDir: SortDir;
  groupBy: GroupKey;
  viewMode: ViewMode;
}

export interface SavedView extends DashboardView {
  name: string;
}

const SAVED_VIEWS_STORAGE_KEY = "fleet:saved-views";
const MAX_SAVED_VIEWS = 24;

function coerceSavedView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  // Re-validate every field against its allow-list; fall back to the default
  // for any missing/corrupt field so a stale view still applies cleanly.
  return {
    name,
    searchQuery: typeof o.searchQuery === "string" ? o.searchQuery : "",
    sortBy: parseSortKey(typeof o.sortBy === "string" ? o.sortBy : null) ?? "attention",
    sortDir: parseSortDir(typeof o.sortDir === "string" ? o.sortDir : null) ?? "default",
    groupBy: parseGroupKey(typeof o.groupBy === "string" ? o.groupBy : null) ?? "none",
    viewMode: parseViewMode(typeof o.viewMode === "string" ? o.viewMode : null) ?? "grid",
  };
}

export function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(coerceSavedView)
      .filter((v): v is SavedView => v !== null)
      .slice(0, MAX_SAVED_VIEWS);
  } catch {
    /* localStorage unavailable (private browsing) or corrupt JSON */
    return [];
  }
}

/**
 * Persist a named view. A same-name save OVERWRITES (an operator re-saving
 * "Triage" updates it in place) and keeps its original position; a new name is
 * appended. Returns the resulting list so the caller can update its state.
 */
export function saveView(view: SavedView): SavedView[] {
  const name = view.name.trim();
  if (!name) return loadSavedViews();
  const existing = loadSavedViews();
  const next = { ...view, name };
  const idx = existing.findIndex((v) => v.name.toLowerCase() === name.toLowerCase());
  const merged =
    idx >= 0
      ? existing.map((v, i) => (i === idx ? next : v))
      : [...existing, next].slice(0, MAX_SAVED_VIEWS);
  try {
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* localStorage unavailable (private browsing) */
  }
  return merged;
}

export function deleteSavedView(name: string): SavedView[] {
  const merged = loadSavedViews().filter(
    (v) => v.name.toLowerCase() !== name.trim().toLowerCase(),
  );
  try {
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* localStorage unavailable (private browsing) */
  }
  return merged;
}
