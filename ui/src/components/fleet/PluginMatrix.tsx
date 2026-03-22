/**
 * PluginMatrix — Cross-fleet plugin inventory visualization.
 *
 * Shows a matrix of plugins × bots with:
 * - ✅/❌ for enabled/disabled
 * - Drift markers for inconsistencies
 * - Slot conflict warnings
 * - Recommendations for fixing gaps
 */

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Puzzle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fleetCardStyles, fleetInfoStyles } from "./design-tokens";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PluginInfo {
  id: string;
  kind: "channel" | "memory" | "context-engine" | "tool" | "other";
  enabled: boolean;
  slot?: string;
}

interface BotPluginInventory {
  botId: string;
  botName: string;
  botEmoji: string;
  plugins: PluginInfo[];
}

interface PluginDrift {
  pluginId: string;
  kind: string;
  present: string[];
  missing: string[];
  severity: "critical" | "warning" | "info";
  recommendation: string;
}

interface SlotConflict {
  slotName: string;
  values: Record<string, string[]>;
  recommendation: string;
}

interface PluginDriftReport {
  drifts: PluginDrift[];
  slotConflicts: SlotConflict[];
  totalPlugins: number;
  consistentPlugins: number;
}

interface PluginMatrixProps {
  inventories: BotPluginInventory[];
  driftReport?: PluginDriftReport | null;
  className?: string;
}

// ─── Plugin kind colors ─────────────────────────────────────────────────────

function kindBadgeClass(kind: string): string {
  switch (kind) {
    case "channel":
      return "bg-[#E0F2F1] text-[#264653]";
    case "memory":
      return "bg-[#D4A373]/10 text-[#9A7B5B]";
    case "context-engine":
      return "bg-purple-50 text-purple-700";
    default:
      return "bg-[#2C2420]/5 text-[#2C2420]/50";
  }
}

function driftSeverityBorder(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-l-red-500";
    case "warning":
      return "border-l-[#D4A373]";
    default:
      return "border-l-[#2A9D8F]";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PluginMatrix({
  inventories,
  driftReport,
  className,
}: PluginMatrixProps) {
  // Build unified plugin list across all bots
  const allPlugins = useMemo(() => {
    const pluginMap = new Map<string, { kind: string; bots: Map<string, boolean> }>();

    for (const inv of inventories) {
      for (const plugin of inv.plugins) {
        if (!pluginMap.has(plugin.id)) {
          pluginMap.set(plugin.id, { kind: plugin.kind, bots: new Map() });
        }
      }
    }

    // Fill in presence/absence for each bot
    for (const [pluginId, entry] of pluginMap) {
      for (const inv of inventories) {
        entry.bots.set(
          inv.botId,
          inv.plugins.some((p) => p.id === pluginId),
        );
      }
    }

    return Array.from(pluginMap.entries())
      .sort(([, a], [, b]) => {
        // Sort: channels first, then memory, then others
        const kindOrder = { channel: 0, memory: 1, "context-engine": 2, tool: 3, other: 4 };
        const ka = kindOrder[a.kind as keyof typeof kindOrder] ?? 4;
        const kb = kindOrder[b.kind as keyof typeof kindOrder] ?? 4;
        return ka - kb;
      });
  }, [inventories]);

  // Drift lookup
  const driftMap = useMemo(() => {
    const map = new Map<string, PluginDrift>();
    if (driftReport) {
      for (const drift of driftReport.drifts) {
        map.set(drift.pluginId, drift);
      }
    }
    return map;
  }, [driftReport]);

  if (inventories.length === 0) {
    return (
      <div className={cn(fleetCardStyles.default, "p-8 text-center", className)}>
        <Puzzle className="mx-auto h-12 w-12 text-[#E0E0E0] mb-3" />
        <h3 className="text-sm font-medium text-[#2C2420]/60 mb-1">
          No Plugin Data
        </h3>
        <p className="text-xs text-[#2C2420]/40">
          Connect bots to see their plugin inventory.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(fleetCardStyles.default, "overflow-hidden", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E0E0E0]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-[#D4A373]" />
          <h3 className="text-sm font-medium text-[#2C2420]">Plugin Inventory</h3>
          {driftReport && (
            <span className={fleetInfoStyles.badge}>
              {driftReport.consistentPlugins}/{driftReport.totalPlugins} consistent
            </span>
          )}
        </div>
        {driftReport && driftReport.drifts.length > 0 && (
          <span className="text-xs text-[#D4A373] flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {driftReport.drifts.length} drifts
          </span>
        )}
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E0E0E0]/30">
              <th className="text-left px-4 py-2 font-medium text-[#2C2420]/60 sticky left-0 bg-[#FAF9F6]/95 backdrop-blur-sm">
                Plugin
              </th>
              <th className="text-left px-2 py-2 font-medium text-[#2C2420]/60">
                Type
              </th>
              {inventories.map((inv) => (
                <th
                  key={inv.botId}
                  className="text-center px-3 py-2 font-medium text-[#2C2420]/60"
                >
                  <span title={inv.botName}>{inv.botEmoji}</span>
                </th>
              ))}
              <th className="text-left px-3 py-2 font-medium text-[#2C2420]/60">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {allPlugins.map(([pluginId, { kind, bots }]) => {
              const drift = driftMap.get(pluginId);
              const allEnabled = Array.from(bots.values()).every(Boolean);
              const noneEnabled = Array.from(bots.values()).every((v) => !v);

              return (
                <tr
                  key={pluginId}
                  className={cn(
                    "border-b border-[#E0E0E0]/20 hover:bg-[#FAF9F6]/70 transition-colors",
                    drift && "bg-[#D4A373]/[0.03]",
                  )}
                >
                  {/* Plugin name */}
                  <td className="px-4 py-2 font-medium text-[#2C2420] sticky left-0 bg-[#FAF9F6]/95 backdrop-blur-sm">
                    {pluginId}
                  </td>

                  {/* Kind badge */}
                  <td className="px-2 py-2">
                    <span
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        kindBadgeClass(kind),
                      )}
                    >
                      {kind}
                    </span>
                  </td>

                  {/* Per-bot status */}
                  {inventories.map((inv) => {
                    const enabled = bots.get(inv.botId) ?? false;
                    return (
                      <td key={inv.botId} className="text-center px-3 py-2">
                        {enabled ? (
                          <CheckCircle2 className="h-4 w-4 text-[#27BD74] inline-block" />
                        ) : (
                          <XCircle className="h-4 w-4 text-[#E0E0E0] inline-block" />
                        )}
                      </td>
                    );
                  })}

                  {/* Status */}
                  <td className="px-3 py-2">
                    {allEnabled && (
                      <span className="text-[10px] text-[#27BD74] font-medium">
                        Consistent
                      </span>
                    )}
                    {drift && (
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          drift.severity === "critical"
                            ? "text-red-600"
                            : drift.severity === "warning"
                              ? "text-[#D4A373]"
                              : "text-[#2A9D8F]",
                        )}
                      >
                        {drift.missing.length} missing
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Drift recommendations */}
      {driftReport && driftReport.drifts.length > 0 && (
        <div className="px-4 py-3 border-t border-[#E0E0E0]/50 space-y-2">
          <h4 className="text-[10px] font-semibold text-[#2C2420]/50 uppercase tracking-wider">
            Recommendations
          </h4>
          {driftReport.drifts.slice(0, 3).map((drift) => (
            <div
              key={drift.pluginId}
              className={cn(
                "text-xs px-3 py-2 rounded-lg border-l-2",
                driftSeverityBorder(drift.severity),
                "bg-[#FAF9F6]/70",
              )}
            >
              <span className="font-medium text-[#2C2420]">{drift.pluginId}</span>
              <span className="text-[#2C2420]/50"> — {drift.recommendation}</span>
            </div>
          ))}
        </div>
      )}

      {/* Slot conflicts */}
      {driftReport && driftReport.slotConflicts.length > 0 && (
        <div className="px-4 py-3 border-t border-[#E0E0E0]/50 space-y-2">
          <h4 className="text-[10px] font-semibold text-red-500 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Slot Conflicts
          </h4>
          {driftReport.slotConflicts.map((conflict) => (
            <div
              key={conflict.slotName}
              className="text-xs px-3 py-2 rounded-lg border-l-2 border-l-red-500 bg-red-50/50"
            >
              <span className="font-medium text-red-700">{conflict.slotName}</span>
              <span className="text-red-600/70"> — {conflict.recommendation}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
