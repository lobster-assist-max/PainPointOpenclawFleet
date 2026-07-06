/**
 * FilterBar — Tag-based filtering, grouping, sorting, and search for the Fleet Dashboard.
 *
 * Displays tag filter chips, a group-by dropdown, sort-by dropdown, and search input.
 */

import { useState, useMemo } from "react";
import {
  Search,
  Tag,
  X,
  ChevronDown,
  ArrowUpDown,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoleById, roleTier } from "@/lib/fleet-roles";
import { getDisplayStatus, botIsDegraded, contextPercent, healthGradeLetter } from "@/lib/bot-display-helpers";
import type { BotStatus } from "@/api/fleet-monitor";
import type { BotTag } from "@/api/fleet-monitor";

// ── Types ──────────────────────────────────────────────────────────────────

export type SortKey = "attention" | "health" | "cost" | "sessions" | "context" | "name" | "role" | "lastActive";
export type GroupKey = "none" | "status" | "grade" | "role" | "environment" | "channel" | "team" | "model";
export type ViewMode = "grid" | "list";

interface FilterBarProps {
  tags: BotTag[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  groupBy: GroupKey;
  onGroupByChange: (key: GroupKey) => void;
  sortBy: SortKey;
  onSortByChange: (key: SortKey) => void;
  /** Grid (card) vs list (dense row) rendering of the bot grid. */
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Optional ref to the search input so a page-level "/" shortcut can focus it. */
  searchInputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

// ── Sort/Group Labels ──────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "attention", label: "Attention" },
  { key: "health", label: "Health" },
  { key: "cost", label: "Cost" },
  { key: "sessions", label: "Sessions" },
  { key: "context", label: "Context" },
  { key: "role", label: "Role" },
  { key: "name", label: "Name" },
  { key: "lastActive", label: "Last Active" },
];

const GROUP_OPTIONS: { key: GroupKey; label: string }[] = [
  { key: "none", label: "None" },
  { key: "status", label: "Status" },
  { key: "grade", label: "Health Grade" },
  { key: "role", label: "Role" },
  { key: "environment", label: "Environment" },
  { key: "channel", label: "Channel" },
  { key: "team", label: "Team" },
  { key: "model", label: "Model" },
];

// ── Tag Chip ───────────────────────────────────────────────────────────────

function TagChip({
  tag,
  isActive,
  onToggle,
}: {
  tag: BotTag;
  isActive: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border bg-background hover:bg-accent text-foreground",
      )}
    >
      {tag.color && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: tag.color }}
          aria-hidden="true"
        />
      )}
      {tag.label}
      {isActive && <X className="h-3 w-3 ml-0.5" />}
    </button>
  );
}

// ── Dropdown ───────────────────────────────────────────────────────────────

function Dropdown<T extends string>({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (key: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Escape" && open) { setOpen(false); e.stopPropagation(); } }}
        aria-label={`${label}: ${current?.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{current?.label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" role="presentation" onClick={() => setOpen(false)} />
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="absolute top-full mt-1 left-0 z-50 min-w-[120px] rounded-lg border bg-popover shadow-md py-1"
            role="listbox"
            aria-label={label}
            onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); e.stopPropagation(); } }}
          >
            {options.map((opt) => (
              <button
                type="button"
                key={opt.key}
                role="option"
                aria-selected={opt.key === value}
                onClick={() => { onChange(opt.key); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                  opt.key === value && "bg-accent font-medium",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main FilterBar ─────────────────────────────────────────────────────────

export function FilterBar({
  tags,
  activeTags,
  onToggleTag,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  searchInputRef,
  className,
}: FilterBarProps) {
  // Deduplicate tags by tag key
  const uniqueTags = useMemo(() => {
    const seen = new Set<string>();
    return tags.filter((t) => {
      if (seen.has(t.tag)) return false;
      seen.add(t.tag);
      return true;
    });
  }, [tags]);

  // Tag chips + tag-based grouping only make sense when the fleet has tags.
  // Search + sort work regardless, so they render even on a tagless (freshly
  // onboarded) fleet — the FilterBar as a whole is always shown by the caller.
  const hasTags = uniqueTags.length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Row 1: Tag chips (when tags exist) + Search */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasTags && (
          <>
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

            {/* All button */}
            <button
              type="button"
              onClick={() => activeTags.length > 0 && activeTags.forEach(onToggleTag)}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                activeTags.length === 0
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background hover:bg-accent",
              )}
            >
              All
            </button>

            {uniqueTags.map((tag) => (
              <TagChip
                key={tag.tag}
                tag={tag}
                isActive={activeTags.includes(tag.tag)}
                onToggle={() => onToggleTag(tag.tag)}
              />
            ))}
          </>
        )}

        {/* Search — right-aligned next to tag chips, left when there are none.
            A KPI drill-down or banner click can set the query programmatically
            ("degraded"/"offline"/"alerting"), so an inline clear (X) + Escape
            give the operator a one-click way back to the full grid. */}
        <div className={cn("relative", hasTags && "ml-auto")}>
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search name, role, skill, tag, status…  ( / )"
            aria-label="Search bots by name, role, skill, tag, or status (e.g. offline, degraded, alerting, pinned)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchQuery) {
                e.preventDefault();
                onSearchChange("");
              }
            }}
            className={cn(
              "w-52 rounded-lg border bg-background pl-8 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
              searchQuery ? "pr-7" : "pr-3",
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              title="Clear search (Esc)"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Group by + Sort by. "Status" (live connection state) and "Role"
          (org tier) need no tags, so the Group-by dropdown is always shown; the
          tag-based options (environment/channel/team/model) are only offered when
          tags exist. */}
      <div className="flex items-center gap-2">
        <Dropdown
          icon={Tag}
          label="Group by"
          value={groupBy}
          options={
            hasTags
              ? GROUP_OPTIONS
              : GROUP_OPTIONS.filter(
                  (o) =>
                    o.key === "none" ||
                    o.key === "status" ||
                    o.key === "grade" ||
                    o.key === "role",
                )
          }
          onChange={onGroupByChange}
        />
        <Dropdown
          icon={ArrowUpDown}
          label="Sort by"
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={onSortByChange}
        />

        {/* Grid / list view toggle — a dense list view lets an operator scan
            many bots at once on a large fleet, where cards consume a lot of
            vertical space. Right-aligned so it doesn't crowd the dropdowns. */}
        <div
          className="ml-auto inline-flex items-center rounded-lg border p-0.5"
          role="group"
          aria-label="Bot view mode"
        >
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            title="Grid view"
            className={cn(
              "inline-flex items-center justify-center rounded-md p-1 transition-colors",
              viewMode === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            title="List view"
            className={cn(
              "inline-flex items-center justify-center rounded-md p-1 transition-colors",
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hook: useFilteredBots ──────────────────────────────────────────────────

export function useFilteredBots(
  bots: BotStatus[],
  tags: BotTag[],
  activeTags: string[],
  searchQuery: string,
  sortBy: SortKey,
  // Firing-alert count per botId (from the dashboard's alerts query). Needed by
  // the "attention" sort so an alerting bot surfaces at the top even when its
  // health score is normal (a firing alert isn't always a low-health signal).
  alertsByBot?: Map<string, number>,
  // Bots the operator has pinned — they float to the top of the grid (and to
  // the top of their group when grouped) regardless of the active sort.
  pinnedIds?: Set<string>,
) {
  return useMemo(() => {
    let filtered = [...bots];

    // Filter by tags
    if (activeTags.length > 0) {
      filtered = filtered.filter((bot) => {
        const botTags = tags.filter((t) => t.botId === bot.botId);
        return activeTags.some((activeTag) =>
          botTags.some((bt) => bt.tag === activeTag),
        );
      });
    }

    // Filter by search — matches name, botId, emoji, role (title + Chinese
    // subtitle), description, any skill, and any assigned tag (label + key), so
    // an operator can find a bot by what it does ("engineer", "行銷", a skill
    // name) OR by a tag they'd otherwise have to click a chip for ("production").
    // Also matches connection status ("online"/"offline"/"idle"/"dormant"/…) via
    // an EXACT-word compare (not substring) so a real search like "line" (the
    // LINE channel) doesn't accidentally match "online"/"offline".
    if (searchQuery.trim()) {
      // Trim so a manual search with stray leading/trailing spaces (" engineer ",
      // a pasted " offline ") still matches — and the exact-word status/degraded/
      // alerting compares below stay exact (drill-downs pass clean strings).
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((bot) => {
        const role = bot.roleId ? getRoleById(bot.roleId) : null;
        const statusMatch =
          q === getDisplayStatus(bot.connectionState) ||
          q === bot.connectionState.toLowerCase() ||
          // "degraded" surfaces bots that LOOK online but aren't serving well
          // (customer channels down / low health) — the same set the Sidebar
          // pulse and dashboard banners flag. Exact-word so it never matches
          // substrings of a name/skill.
          (q === "degraded" && botIsDegraded(bot)) ||
          // "alerting" surfaces bots with a firing alert — the AlertBanner
          // drill-down filters the grid to exactly this set. Completes the
          // search vocabulary alongside "degraded"/"offline".
          (q === "alerting" && (alertsByBot?.get(bot.botId) ?? 0) > 0) ||
          // "pinned" surfaces the operator's pinned bots — useful once a
          // large fleet has many pins. Exact-word like the other status tokens.
          (q === "pinned" && (pinnedIds?.has(bot.botId) ?? false));
        // "grade:<a|b|c|d|f|none>" surfaces bots at a specific health grade band —
        // the Health Distribution bar's segments drill down here so an operator
        // can isolate, e.g., every failing (grade-F) bot in one click. "none"
        // matches unscored bots (no health computed yet).
        const gradeMatch =
          q.startsWith("grade:") &&
          (q === "grade:none"
            ? bot.healthScore == null
            : bot.healthScore != null &&
              healthGradeLetter(bot.healthScore.overall).toLowerCase() === q.slice(6));
        const tagMatch = tags.some(
          (t) =>
            t.botId === bot.botId &&
            (t.label.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)),
        );
        return (
          statusMatch ||
          gradeMatch ||
          tagMatch ||
          bot.name.toLowerCase().includes(q) ||
          bot.botId.toLowerCase().includes(q) ||
          bot.emoji.includes(q) ||
          (bot.description?.toLowerCase().includes(q) ?? false) ||
          (role?.title.toLowerCase().includes(q) ?? false) ||
          (role?.subtitle.toLowerCase().includes(q) ?? false) ||
          bot.skills.some((s) => s.toLowerCase().includes(q))
        );
      });
    }

    // Sort. Health/cost break ties by name so a freshly-launched fleet (every
    // bot null-health → 100, $0 spend) still has a meaningful, deterministic
    // alphabetical order instead of arbitrary fleet order.
    filtered.sort((a, b) => {
      // Pinned bots always float to the top, regardless of the chosen sort.
      // Because groups are built from this sorted list, pinned bots also lead
      // within each group.
      if (pinnedIds && pinnedIds.size > 0) {
        const ap = pinnedIds.has(a.botId) ? 1 : 0;
        const bp = pinnedIds.has(b.botId) ? 1 : 0;
        if (ap !== bp) return bp - ap;
      }
      switch (sortBy) {
        case "attention": {
          // Attention-first: alerting bots on top (most firing alerts first),
          // then degraded bots (customer channels down / low health), then by
          // ascending health. Surfaces everything that needs an operator's eyes —
          // an alert, a channel outage, or a low score — regardless of which
          // signal fired. The health sort alone buries an alerting bot whose
          // health is normal (a firing alert isn't always a low-health signal).
          const aAlerts = alertsByBot?.get(a.botId) ?? 0;
          const bAlerts = alertsByBot?.get(b.botId) ?? 0;
          if (aAlerts !== bAlerts) return bAlerts - aAlerts;
          const aDeg = botIsDegraded(a) ? 1 : 0;
          const bDeg = botIsDegraded(b) ? 1 : 0;
          if (aDeg !== bDeg) return bDeg - aDeg;
          const hd = (a.healthScore?.overall ?? 100) - (b.healthScore?.overall ?? 100);
          return hd !== 0 ? hd : a.name.localeCompare(b.name);
        }
        case "health": {
          // Attention-first: lowest health at the top. Treat a bot whose score
          // hasn't been computed yet (just connected / DB fallback → null) as
          // "no known problem" (100), not as worst (0) — otherwise freshly
          // launched and offline-monitor bots crowd the top and bury the
          // genuinely low-health bots that actually need attention.
          const d = (a.healthScore?.overall ?? 100) - (b.healthScore?.overall ?? 100);
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }
        case "name":
          return a.name.localeCompare(b.name);
        case "role": {
          // Org seniority: CEO → C-suite → heads → ICs (role level ascending),
          // so an operator can scan the fleet top-down by the org hierarchy the
          // dashboard is built around. Bots with no known org role sort last;
          // tiebreak by name for a stable, deterministic order.
          const al = getRoleById(a.roleId ?? "")?.level ?? 99;
          const bl = getRoleById(b.roleId ?? "")?.level ?? 99;
          return al !== bl ? al - bl : a.name.localeCompare(b.name);
        }
        case "lastActive": {
          // Most-recently-active first. Guard against an unparseable timestamp
          // (a DB-fallback bot with a missing updatedAt → NaN would make the
          // comparator non-deterministic) and break ties by name so the order is
          // stable — matching the health/cost sorts.
          const bt = new Date(b.freshness.lastUpdated).getTime();
          const at = new Date(a.freshness.lastUpdated).getTime();
          const bv = Number.isFinite(bt) ? bt : 0;
          const av = Number.isFinite(at) ? at : 0;
          return bv !== av ? bv - av : a.name.localeCompare(b.name);
        }
        case "cost": {
          // Highest month-to-date spend first (spend-first). monthCostUsd is
          // real per-bot cost since Build #239; a bot with no known cost yet
          // sorts as $0.
          const d = (b.monthCostUsd ?? 0) - (a.monthCostUsd ?? 0);
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }
        case "sessions": {
          // Busiest first — bots actively serving the most live customer
          // sessions on top. activeSessions is real per-bot data (#234);
          // a DB-fallback bot with no live data sorts as 0. Tiebreak by name
          // so the order is deterministic, matching the other sorts.
          const d = b.activeSessions - a.activeSessions;
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }
        case "context": {
          // Fullest context window first — surfaces the bots nearest their
          // context limit (a real "about to lose conversation context" concern).
          // A bot with no live context data (DB-fallback / just-connected) sorts
          // as -1 so it lands below any bot with a real reading. Tiebreak by name.
          const ap = contextPercent(a) ?? -1;
          const bp = contextPercent(b) ?? -1;
          return bp !== ap ? bp - ap : a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [bots, tags, activeTags, searchQuery, sortBy, alertsByBot, pinnedIds]);
}

// ── Hook: useGroupedBots ───────────────────────────────────────────────────

export function useGroupedBots(
  bots: BotStatus[],
  tags: BotTag[],
  groupBy: GroupKey,
): Map<string, BotStatus[]> {
  return useMemo(() => {
    if (groupBy === "none") {
      return new Map([["All Bots", bots]]);
    }

    // Group by live connection status (not a tag) — Online / Idle / Offline.
    // Ordered most-available first so a scan starts with healthy bots.
    if (groupBy === "status") {
      const order = ["online", "idle", "offline"] as const;
      const labels: Record<string, string> = {
        online: "Online",
        idle: "Idle",
        offline: "Offline",
      };
      const groups = new Map<string, BotStatus[]>();
      for (const key of order) groups.set(labels[key], []);
      for (const bot of bots) {
        const label = labels[getDisplayStatus(bot.connectionState)];
        groups.get(label)!.push(bot);
      }
      // Drop empty status buckets so the grid doesn't show empty headers.
      for (const [label, list] of groups) {
        if (list.length === 0) groups.delete(label);
      }
      return groups;
    }

    // Group by health grade (A / B / C / D / F / Unscored) — a lens on the fleet
    // health composition (the same bands as the Health Distribution bar), needing
    // no tags. Ordered best-first (A → F), Unscored last, empty buckets dropped.
    if (groupBy === "grade") {
      const bandLabels: Record<string, string> = {
        A: "Grade A", B: "Grade B", C: "Grade C", D: "Grade D", F: "Grade F",
      };
      const groups = new Map<string, BotStatus[]>();
      for (const label of ["Grade A", "Grade B", "Grade C", "Grade D", "Grade F", "Unscored"])
        groups.set(label, []);
      for (const bot of bots) {
        const label =
          bot.healthScore != null
            ? bandLabels[healthGradeLetter(bot.healthScore.overall)]
            : "Unscored";
        groups.get(label)!.push(bot);
      }
      for (const [label, list] of groups) {
        if (list.length === 0) groups.delete(label);
      }
      return groups;
    }

    // Group by org tier (Leadership / Department Heads / Individual Contributors /
    // Unassigned) — a lens on the org chart the fleet is built around, needing no
    // tags. Ordered by seniority (leadership first) so a scan starts at the top.
    if (groupBy === "role") {
      const buckets = new Map<number, { label: string; list: BotStatus[] }>();
      for (const bot of bots) {
        const tier = roleTier(bot.roleId);
        const bucket = buckets.get(tier.order) ?? { label: tier.label, list: [] };
        bucket.list.push(bot);
        buckets.set(tier.order, bucket);
      }
      const ordered = new Map<string, BotStatus[]>();
      for (const order of [...buckets.keys()].sort((a, b) => a - b)) {
        const bucket = buckets.get(order)!;
        ordered.set(bucket.label, bucket.list);
      }
      return ordered;
    }

    const groups = new Map<string, BotStatus[]>();
    for (const bot of bots) {
      const botTags = tags.filter(
        (t) => t.botId === bot.botId && t.category === groupBy,
      );
      if (botTags.length === 0) {
        const list = groups.get("Ungrouped") ?? [];
        list.push(bot);
        groups.set("Ungrouped", list);
      } else {
        for (const tag of botTags) {
          const list = groups.get(tag.label) ?? [];
          list.push(bot);
          groups.set(tag.label, list);
        }
      }
    }

    // Deterministic order: named tag groups alphabetically, "Ungrouped" always
    // last. The build-order above is Map insertion order, so it shifted between
    // the 15s polls whenever bot sort order changed (the first-seen bot's tag
    // decided a group's position) — the grid group headers flickered. Sorting
    // here makes the layout stable.
    const ordered = new Map<string, BotStatus[]>();
    const names = Array.from(groups.keys())
      .filter((n) => n !== "Ungrouped")
      .sort((a, b) => a.localeCompare(b));
    for (const n of names) ordered.set(n, groups.get(n)!);
    if (groups.has("Ungrouped")) ordered.set("Ungrouped", groups.get("Ungrouped")!);
    return ordered;
  }, [bots, tags, groupBy]);
}
