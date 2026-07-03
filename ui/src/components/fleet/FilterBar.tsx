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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoleById } from "@/lib/fleet-roles";
import { getDisplayStatus } from "@/lib/bot-display-helpers";
import type { BotStatus } from "@/api/fleet-monitor";
import type { BotTag } from "@/api/fleet-monitor";

// ── Types ──────────────────────────────────────────────────────────────────

export type SortKey = "health" | "cost" | "name" | "lastActive";
export type GroupKey = "none" | "status" | "environment" | "channel" | "team" | "model";

interface FilterBarProps {
  tags: BotTag[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  groupBy: GroupKey;
  onGroupByChange: (key: GroupKey) => void;
  sortBy: SortKey;
  onSortByChange: (key: SortKey) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  className?: string;
}

// ── Sort/Group Labels ──────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "health", label: "Health" },
  { key: "cost", label: "Cost" },
  { key: "name", label: "Name" },
  { key: "lastActive", label: "Last Active" },
];

const GROUP_OPTIONS: { key: GroupKey; label: string }[] = [
  { key: "none", label: "None" },
  { key: "status", label: "Status" },
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
  searchQuery,
  onSearchChange,
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

        {/* Search — right-aligned next to tag chips, left when there are none */}
        <div className={cn("relative", hasTags && "ml-auto")}>
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, role, skill, tag…"
            aria-label="Search bots by name, role, skill, or tag"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-52 rounded-lg border bg-background pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Row 2: Group by + Sort by. "Status" groups by live connection state and
          needs no tags, so the Group-by dropdown is always shown; the tag-based
          options (environment/channel/team/model) are only offered when tags exist. */}
      <div className="flex items-center gap-2">
        <Dropdown
          icon={Tag}
          label="Group by"
          value={groupBy}
          options={
            hasTags
              ? GROUP_OPTIONS
              : GROUP_OPTIONS.filter((o) => o.key === "none" || o.key === "status")
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
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((bot) => {
        const role = bot.roleId ? getRoleById(bot.roleId) : null;
        const statusMatch =
          q === getDisplayStatus(bot.connectionState) ||
          q === bot.connectionState.toLowerCase();
        const tagMatch = tags.some(
          (t) =>
            t.botId === bot.botId &&
            (t.label.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)),
        );
        return (
          statusMatch ||
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
      switch (sortBy) {
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
        case "lastActive":
          return (
            new Date(b.freshness.lastUpdated).getTime() -
            new Date(a.freshness.lastUpdated).getTime()
          );
        case "cost": {
          // Highest month-to-date spend first (spend-first). monthCostUsd is
          // real per-bot cost since Build #239; a bot with no known cost yet
          // sorts as $0.
          const d = (b.monthCostUsd ?? 0) - (a.monthCostUsd ?? 0);
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [bots, tags, activeTags, searchQuery, sortBy]);
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
