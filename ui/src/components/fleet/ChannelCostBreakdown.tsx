/**
 * ChannelCostBreakdown — cost attribution by messaging channel.
 *
 * Parses session keys to identify channel origin (LINE, Telegram, etc.)
 * and attributes token costs to each channel.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  channelBrandColor,
  channelBrandColorDefault,
} from "@/lib/status-colors";
import { estimateCostUsd } from "@/hooks/useFleetMonitor";
import type { BotUsageReport } from "@/api/fleet-monitor";

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
  usage: BotUsageReport | null | undefined;
  className?: string;
}

// ---------------------------------------------------------------------------
// Channel extraction from session key
// ---------------------------------------------------------------------------

function extractChannel(sessionKey: string): string {
  // agent:lobster:channel:line → "line"
  const channelMatch = sessionKey.match(/:channel:(\w+)/);
  if (channelMatch) return channelMatch[1];

  // agent:lobster:peer:xxx → "direct"
  if (sessionKey.includes(":peer:")) return "direct";

  // agent:lobster:guild:xxx → "group"
  if (sessionKey.includes(":guild:")) return "group";

  // cron:xxx → "cron"
  if (sessionKey.startsWith("cron:") || sessionKey.includes("cron:")) return "cron";

  return "other";
}

function channelDisplayName(channel: string): string {
  switch (channel) {
    case "line":
      return "LINE";
    case "telegram":
      return "Telegram";
    case "discord":
      return "Discord";
    case "whatsapp":
      return "WhatsApp";
    case "web":
      return "Web Chat";
    case "direct":
      return "Direct";
    case "group":
      return "Group";
    case "cron":
      return "Cron Jobs";
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelCostBreakdown({ usage, className }: ChannelCostBreakdownProps) {
  const breakdown = useMemo<ChannelCost[]>(() => {
    if (!usage?.sessions) return [];

    // Group sessions by channel
    const channelMap = new Map<
      string,
      { sessions: number; input: number; output: number; cached: number }
    >();

    for (const session of usage.sessions) {
      const channel = extractChannel(session.sessionKey);
      const existing = channelMap.get(channel) ?? {
        sessions: 0,
        input: 0,
        output: 0,
        cached: 0,
      };
      existing.sessions += 1;
      existing.input += session.inputTokens;
      existing.output += session.outputTokens;
      existing.cached += session.cachedInputTokens;
      channelMap.set(channel, existing);
    }

    // Calculate costs
    const totalCost = estimateCostUsd(usage.total);
    const result: ChannelCost[] = [];

    for (const [channel, data] of channelMap) {
      const cost = estimateCostUsd({
        inputTokens: data.input,
        outputTokens: data.output,
        cachedInputTokens: data.cached,
      });
      result.push({
        channel,
        sessions: data.sessions,
        inputTokens: data.input,
        outputTokens: data.output,
        cachedTokens: data.cached,
        estimatedCostUsd: cost,
        percentOfTotal: totalCost > 0 ? (cost / totalCost) * 100 : 0,
        avgCostPerSession: data.sessions > 0 ? cost / data.sessions : 0,
      });
    }

    // Sort by cost descending
    return result.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
  }, [usage]);

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

  if (!usage || breakdown.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground text-center py-4", className)}>
        No usage data available
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-medium">Cost by Channel</h3>

      {/* Channel bars */}
      <div className="space-y-2">
        {breakdown.map((channel) => {
          const color =
            channelBrandColor[channel.channel as keyof typeof channelBrandColor] ??
            channelBrandColorDefault;

          return (
            <div key={channel.channel} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
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
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${channel.percentOfTotal}%`,
                    backgroundColor: color,
                  }}
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
            const color =
              channelBrandColor[channel.channel as keyof typeof channelBrandColor] ??
              channelBrandColorDefault;
            const isHighest =
              mostExpensivePerSession?.channel === channel.channel &&
              breakdown.length > 1;

            return (
              <div key={channel.channel} className="flex items-center gap-1 text-xs">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
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
