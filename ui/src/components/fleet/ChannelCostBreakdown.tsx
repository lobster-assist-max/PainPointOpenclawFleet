/**
 * ChannelCostBreakdown — cost attribution by messaging channel.
 *
 * Renders a fleet-wide, per-channel token-cost breakdown. Channel attribution
 * is done server-side (`/fleet-monitor/cost-by-channel` via
 * `inferChannelFromSessionKey`) — this component consumes the pre-aggregated
 * `ChannelCostEntry[]` and only computes USD cost + share.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { channelColors } from "./design-tokens";
import { channelDisplayName } from "@/lib/bot-display-helpers";
import { estimateCostUsd } from "@/hooks/useFleetMonitor";
import type { ChannelCostEntry } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelCost {
  channel: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  percentOfTotal: number;
  avgCostPerSession: number;
}

interface ChannelCostBreakdownProps {
  /** Pre-aggregated per-channel token counts (fleet-wide, tenant-scoped). */
  channels: ChannelCostEntry[] | null | undefined;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelCostBreakdown({ channels, className }: ChannelCostBreakdownProps) {
  const breakdown = useMemo<ChannelCost[]>(() => {
    if (!channels?.length) return [];

    // Compute USD cost per channel + fleet total (single pass so percentOfTotal
    // is stable even when a channel has zero billable tokens).
    const priced = channels.map((entry) => ({
      channel: entry.channel,
      sessions: entry.sessions,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cachedTokens: entry.cachedInputTokens,
      estimatedCostUsd: estimateCostUsd({
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cachedInputTokens: entry.cachedInputTokens,
      }),
    }));
    const totalCost = priced.reduce((sum, c) => sum + c.estimatedCostUsd, 0);

    return priced
      .map((c) => ({
        ...c,
        percentOfTotal: totalCost > 0 ? (c.estimatedCostUsd / totalCost) * 100 : 0,
        avgCostPerSession: c.sessions > 0 ? c.estimatedCostUsd / c.sessions : 0,
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
  }, [channels]);

  const totalCost = useMemo(
    () => breakdown.reduce((sum, c) => sum + c.estimatedCostUsd, 0),
    [breakdown],
  );

  // Find the most expensive per-session channel
  const mostExpensivePerSession = useMemo(
    () =>
      breakdown.reduce(
        (max, c) => (c.avgCostPerSession > (max?.avgCostPerSession ?? 0) ? c : max),
        null as ChannelCost | null,
      ),
    [breakdown],
  );

  if (breakdown.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground text-center py-4", className)}>
        No channel usage data yet
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-medium">Cost by Channel</h3>

      {/* Channel bars */}
      <div className="space-y-2">
        {breakdown.map((channel) => {
          const dotClass =
            channelColors[channel.channel]?.dot ?? "bg-muted-foreground";

          return (
            <div key={channel.channel} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", dotClass)}
                    aria-hidden="true"
                  />
                  <span className="font-medium">
                    {channelDisplayName(channel.channel)}
                  </span>
                  <span className="text-muted-foreground">
                    {channel.sessions} session{channel.sessions !== 1 && "s"}
                  </span>
                </div>
                <span className="font-mono">
                  ${channel.estimatedCostUsd.toFixed(2)}{" "}
                  <span className="text-muted-foreground">
                    ({channel.percentOfTotal.toFixed(0)}%)
                  </span>
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-300", dotClass)}
                  style={{ width: `${channel.percentOfTotal}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(channel.percentOfTotal)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${channel.channel} cost share`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-session average comparison */}
      <div className="border-t pt-2 space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground">
          Avg Cost per Session
        </h4>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {breakdown.map((channel) => {
            const dotClass =
              channelColors[channel.channel]?.dot ?? "bg-muted-foreground";
            const isHighest =
              mostExpensivePerSession?.channel === channel.channel &&
              breakdown.length > 1;

            return (
              <div key={channel.channel} className="flex items-center gap-1 text-xs">
                <span
                  className={cn("w-2 h-2 rounded-full", dotClass)}
                  aria-hidden="true"
                />
                <span>{channelDisplayName(channel.channel)}:</span>
                <span className={cn("font-mono", isHighest && "text-yellow-600 dark:text-yellow-400")}>
                  ${channel.avgCostPerSession.toFixed(3)}
                </span>
                {isHighest && <span className="text-yellow-600 dark:text-yellow-400">⚠️</span>}
              </div>
            );
          })}
        </div>
        {mostExpensivePerSession && breakdown.length > 1 && (
          <div className="text-xs text-muted-foreground mt-1">
            💡 {channelDisplayName(mostExpensivePerSession.channel)} sessions cost{" "}
            {(
              (mostExpensivePerSession.avgCostPerSession /
                (breakdown.reduce((s, c) => s + c.avgCostPerSession, 0) /
                  breakdown.length)) *
              100
            ).toFixed(0)}
            % more than average per session.
          </div>
        )}
      </div>
    </div>
  );
}
