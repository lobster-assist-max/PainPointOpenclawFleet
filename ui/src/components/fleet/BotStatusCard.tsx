/**
 * BotStatusCard — a card showing a single bot's live status.
 *
 * Displays: emoji, name, connection state, health score grade,
 * channel indicators, session count, data freshness, and an
 * inline 24h activity sparkline.
 */

import { useMemo } from "react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  botConnectionDot,
  botConnectionDotDefault,
  healthGradeColor,
  healthGradeColorDefault,
  channelBrandColor,
  channelBrandColorDefault,
} from "@/lib/status-colors";
import {
  connectionStateLabel,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import type { BotStatus } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Sparkline — tiny SVG line chart (no dependencies)
// ---------------------------------------------------------------------------

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 64;
  const h = 20;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("w-16 h-5 shrink-0", className)}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary/60"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Health Score Ring — circular progress indicator
// ---------------------------------------------------------------------------

function HealthRing({
  score,
  grade,
  size = 40,
}: {
  score: number;
  grade: string;
  size?: number;
}) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const colorClass = healthGradeColor[grade] ?? healthGradeColorDefault;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={colorClass}
        />
      </svg>
      <span className={cn("absolute text-[10px] font-bold", colorClass)}>{grade}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Freshness Indicator
// ---------------------------------------------------------------------------

function FreshnessIndicator({ iso }: { iso: string }) {
  const age = Date.now() - new Date(iso).getTime();
  let dotClass = "bg-green-400";
  if (age > 120_000) dotClass = "bg-red-400";
  else if (age > 30_000) dotClass = "bg-orange-400";
  else if (age > 10_000) dotClass = "bg-yellow-400";

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {timeAgo(iso)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Channel Pills
// ---------------------------------------------------------------------------

function ChannelPill({ type, connected }: { type: string; connected: boolean }) {
  const colorClass = channelBrandColor[type] ?? channelBrandColorDefault;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium border",
        connected
          ? cn(colorClass, "border-current/20 bg-current/5")
          : "text-muted-foreground border-muted line-through opacity-50",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-current" : "bg-muted-foreground")} />
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface BotStatusCardProps {
  bot: BotStatus;
  /** Optional 24-point activity sparkline data (e.g., messages per hour) */
  sparklineData?: number[];
  className?: string;
}

export function BotStatusCard({ bot, sparklineData, className }: BotStatusCardProps) {
  const dotClass = botConnectionDot[bot.connectionState] ?? botConnectionDotDefault;
  const stateLabel = connectionStateLabel(bot.connectionState);
  const isOnline = bot.connectionState === "monitoring";

  const sortedChannels = useMemo(
    () => [...bot.channels].sort((a, b) => (a.connected === b.connected ? 0 : a.connected ? -1 : 1)),
    [bot.channels],
  );

  return (
    <Link
      to={`/agents/${bot.agentId}`}
      className="no-underline text-inherit"
    >
      <div
        className={cn(
          "group flex flex-col gap-3 rounded-xl border p-4 transition-all",
          "hover:shadow-md hover:-translate-y-0.5",
          isOnline
            ? "border-border bg-background"
            : "border-border/60 bg-background/70 opacity-80",
          className,
        )}
      >
        {/* ── Header: emoji + name + health ring ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl shrink-0" role="img" aria-label={bot.name}>
              {bot.emoji || "🤖"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{bot.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} />
                <span className="text-xs text-muted-foreground">{stateLabel}</span>
              </div>
            </div>
          </div>
          {bot.healthScore && (
            <HealthRing score={bot.healthScore.overall} grade={bot.healthScore.grade} />
          )}
        </div>

        {/* ── Channels ── */}
        {sortedChannels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sortedChannels.map((ch) => (
              <ChannelPill key={ch.name} type={ch.type} connected={ch.connected} />
            ))}
          </div>
        )}

        {/* ── Stats row ── */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span title="Active sessions">
              {bot.activeSessions} session{bot.activeSessions !== 1 ? "s" : ""}
            </span>
            {bot.healthScore && (
              <span title={`Health: ${bot.healthScore.overall}/100`}>
                {bot.healthScore.overall}pts
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sparklineData && <Sparkline data={sparklineData} />}
            <FreshnessIndicator iso={bot.freshness.lastUpdated} />
          </div>
        </div>

        {/* ── Health breakdown (expand on hover) ── */}
        {bot.healthScore && (
          <div className="hidden group-hover:flex gap-1 text-[10px] text-muted-foreground">
            <span title="Connectivity">🔗 {bot.healthScore.breakdown.connectivity}</span>
            <span title="Responsiveness">⚡ {bot.healthScore.breakdown.responsiveness}</span>
            <span title="Efficiency">💰 {bot.healthScore.breakdown.efficiency}</span>
            <span title="Channels">📡 {bot.healthScore.breakdown.channels}</span>
            <span title="Cron">⏰ {bot.healthScore.breakdown.cron}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
