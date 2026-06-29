/**
 * PluginMatrixPanel — self-fetching container for the PluginMatrix widget.
 *
 * Wires the presentational <PluginMatrix /> (which takes required props) to
 * the live `/fleet-monitor/plugin-inventory` backend. The server returns the
 * raw plugin config per bot but uses the botId as a name/emoji placeholder —
 * we enrich each inventory with the real name + emoji from fleet status so the
 * matrix column headers are readable.
 *
 * Degrades gracefully: when the fleet monitor is offline / no bots are
 * connected, it falls back to a small MOCK inventory with a [Preview] badge so
 * the Intelligence page still demonstrates the feature.
 */

import { useMemo } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PluginMatrix } from "./PluginMatrix";
import { usePluginInventory, useFleetStatus } from "@/hooks/useFleetMonitor";
import type {
  BotPluginInventory,
  PluginDriftReport,
} from "@/api/fleet-monitor";

// ── Preview fallback data ───────────────────────────────────────────────────

const MOCK_INVENTORIES: BotPluginInventory[] = [
  {
    botId: "lobster-01",
    botName: "小龍蝦",
    botEmoji: "🦞",
    plugins: [
      { id: "channel-slack", kind: "channel", enabled: true },
      { id: "channel-line", kind: "channel", enabled: true },
      { id: "memory-lancedb", kind: "memory", enabled: true, slot: "memory" },
      { id: "context-summarizer", kind: "context-engine", enabled: true, slot: "context" },
    ],
  },
  {
    botId: "squirrel-01",
    botName: "飛鼠",
    botEmoji: "🐿️",
    plugins: [
      { id: "channel-slack", kind: "channel", enabled: true },
      { id: "memory-lancedb", kind: "memory", enabled: true, slot: "memory" },
      { id: "context-summarizer", kind: "context-engine", enabled: true, slot: "context" },
    ],
  },
  {
    botId: "boar-01",
    botName: "山豬",
    botEmoji: "🐗",
    plugins: [
      { id: "channel-slack", kind: "channel", enabled: true },
      { id: "channel-line", kind: "channel", enabled: true },
      { id: "memory-core", kind: "memory", enabled: true, slot: "memory" },
    ],
  },
];

const MOCK_DRIFT_REPORT: PluginDriftReport = {
  drifts: [
    {
      pluginId: "channel-line",
      kind: "channel",
      present: ["lobster-01", "boar-01"],
      missing: ["squirrel-01"],
      severity: "warning",
      recommendation: "飛鼠 is missing the LINE channel — it can't serve LINE conversations.",
    },
    {
      pluginId: "memory-lancedb",
      kind: "memory",
      present: ["lobster-01", "squirrel-01"],
      missing: ["boar-01"],
      severity: "critical",
      recommendation: "山豬 uses memory-core instead of memory-lancedb — inconsistent recall behaviour.",
    },
  ],
  slotConflicts: [
    {
      slotName: "memory",
      values: {
        "memory-lancedb": ["lobster-01", "squirrel-01"],
        "memory-core": ["boar-01"],
      },
      recommendation: "Standardize the memory slot across the fleet (memory-lancedb recommended).",
    },
  ],
  totalPlugins: 5,
  consistentPlugins: 2,
};

// ── Component ───────────────────────────────────────────────────────────────

export function PluginMatrixPanel() {
  const { data, isLoading, isError } = usePluginInventory();
  const { data: fleet } = useFleetStatus();

  // botId → { name, emoji } from live fleet status, for column-header enrichment.
  const identityMap = useMemo(() => {
    const map = new Map<string, { name: string; emoji: string }>();
    for (const bot of fleet?.bots ?? []) {
      map.set(bot.botId, { name: bot.name, emoji: bot.emoji });
    }
    return map;
  }, [fleet]);

  const liveInventories = useMemo(() => {
    const inv = data?.inventories ?? [];
    // The server passes botId as a name/emoji placeholder — swap in the real
    // identity when fleet status knows this bot.
    return inv.map((entry) => {
      const identity = identityMap.get(entry.botId);
      return identity
        ? { ...entry, botName: identity.name, botEmoji: identity.emoji }
        : entry;
    });
  }, [data, identityMap]);

  const isLive = liveInventories.length > 0;
  const inventories = isLive ? liveInventories : MOCK_INVENTORIES;
  const driftReport = isLive ? data?.driftReport ?? null : MOCK_DRIFT_REPORT;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading plugin inventory…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live / Preview status row */}
      <div className="flex items-center justify-between">
        <span
          className={
            isLive
              ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
          }
        >
          <span
            className={
              isLive
                ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                : "h-1.5 w-1.5 rounded-full bg-amber-500"
            }
          />
          {isLive ? "Live" : "Preview"}
        </span>
        {!isLive && (
          <span className="text-xs text-muted-foreground">
            Showing demo data — connect bots to see real plugin inventory
          </span>
        )}
      </div>

      {/* Error banner (live query failed but we still render the demo matrix) */}
      {isError && !isLive && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load plugin inventory. The fleet monitor may be offline.
        </div>
      )}

      <PluginMatrix inventories={inventories} driftReport={driftReport} />
    </div>
  );
}
