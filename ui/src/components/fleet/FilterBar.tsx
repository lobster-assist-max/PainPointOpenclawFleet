/**
 * FilterBar — Tag-based filtering, grouping, sorting, and search for the Fleet Dashboard.
 *
 * Displays tag filter chips, a group-by dropdown, sort-by dropdown, and search input.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Search,
  Tag,
  X,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BotStatus } from "@/api/fleet-monitor";
import type { BotTag } from "@/api/fleet-monitor";

// ── Types ──────────────────────────────────────────────────────────────────

export type SortKey = "health" | "cost" | "name" | "lastActive";
export type GroupKey = "none" | "environment" | "channel" | "team" | "model";

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
          <div className="absolute top-full mt-1 left-0 z-50 min-w-[120px] rounded-lg border bg-popover shadow-md py-1" role="listbox" aria-label={label}>
            {options.map((opt) => (
              <button
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

  return (
    <div className={cn("space-y-2", className)}>
      {/* Row 1: Tag chips + Search */}
      <div className="flex items-center gap-2 flex-wrap">
        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        {/* All button */}
        <button
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

        {/* Search (right-aligned) */}
        <div className="ml-auto relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search bots..."
            aria-label="Search bots"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-44 rounded-lg border bg-background pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Row 2: Group by + Sort by */}
      <div className="flex items-center gap-2">
        <Dropdown
          icon={Tag}
          label="Group by"
          value={groupBy}
          options={GROUP_OPTIONS}
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

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (bot) =>
          bot.name.toLowerCase().includes(q) ||
          bot.botId.toLowerCase().includes(q) ||
          bot.emoji.includes(q),
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "health":
          return (a.healthScore?.overall ?? 0) - (b.healthScore?.overall ?? 0);
        case "name":
          return a.name.localeCompare(b.name);
        case "lastActive":
          return (
            new Date(b.freshness.lastUpdated).getTime() -
            new Date(a.freshness.lastUpdated).getTime()
          );
        case "cost":
        default:
          return 0; // cost sorting needs usage data
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

    return groups;
  }, [bots, tags, groupBy]);
}
