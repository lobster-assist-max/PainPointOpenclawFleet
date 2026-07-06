/**
 * BotStatusRow — Compact single-row rendering of a bot for the Fleet Dashboard's
 * "list" view.
 *
 * The card view (BotStatusCard) is rich but tall — on a large fleet an operator
 * can only see a handful of bots per screen. This dense row condenses the same
 * key signals (avatar · name/role · status · channels · sessions · uptime ·
 * health · alerts · month cost · reconnect) into one line so many bots can be
 * scanned at once. Shares the card's alerting-red / degraded-amber tone logic so
 * problem bots pop here too.
 */

import { AlertTriangle, Radio, Activity, Clock, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { getRoleById } from "@/lib/fleet-roles";
import {
  getDisplayStatus,
  STATUS_CONFIG,
  healthBadgeClasses,
  botIsDegraded,
  formatUptime,
} from "@/lib/bot-display-helpers";
import { pixelArtAvatarUrl } from "@/lib/pixel-art-avatar";
import type { BotStatus } from "@/api/fleet-monitor";

function RowAvatar({ bot }: { bot: BotStatus }) {
  const [failed, setFailed] = useState(false);
  if (bot.avatar) {
    return (
      <img
        src={bot.avatar}
        alt={bot.name}
        className="h-9 w-9 rounded-lg object-cover shrink-0"
      />
    );
  }
  if (bot.botId && !failed) {
    return (
      <img
        src={pixelArtAvatarUrl(bot.botId, bot.roleId)}
        alt={bot.name}
        className="h-9 w-9 rounded-lg object-cover shrink-0 bg-primary/10"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <span className="text-lg">{bot.emoji || "\u{1F916}"}</span>
    </div>
  );
}

interface BotStatusRowProps {
  bot: BotStatus;
  alertCount?: number;
  onReconnect?: (bot: BotStatus) => void;
  reconnecting?: boolean;
}

export function BotStatusRow({
  bot,
  alertCount = 0,
  onReconnect,
  reconnecting = false,
}: BotStatusRowProps) {
  const status = getDisplayStatus(bot.connectionState);
  const { dot } = STATUS_CONFIG[status];
  const role = bot.roleId ? getRoleById(bot.roleId) : null;

  const alerting = alertCount > 0;
  const degraded = botIsDegraded(bot);
  const rowTone = alerting
    ? "border-red-400/50 bg-red-50/30 dark:border-red-500/30 dark:bg-red-950/10"
    : degraded
      ? "border-amber-400/50 bg-amber-50/30 dark:border-amber-500/30 dark:bg-amber-950/10"
      : status === "online"
        ? "border-border bg-background"
        : "border-border/60 bg-background/70 opacity-90";

  return (
    <Link to={`/bots/${bot.botId}`} className="no-underline text-inherit">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-accent",
          rowTone,
        )}
      >
        {/* Status dot + avatar */}
        <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
        <RowAvatar bot={bot} />

        {/* Name + role */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {bot.emoji && <span className="mr-1">{bot.emoji}</span>}
            {bot.name}
          </p>
          {role && (
            <p className="text-xs text-muted-foreground truncate">
              {role.title}
            </p>
          )}
        </div>

        {/* Compact metric badges (hidden on narrow screens, shown ≥sm) */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground shrink-0">
          {bot.channelsTotal != null && bot.channelsTotal > 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5",
                bot.channelsConnected != null && bot.channelsConnected < bot.channelsTotal
                  ? bot.channelsConnected === 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                  : "",
              )}
              title={`${bot.channelsConnected ?? 0} of ${bot.channelsTotal} customer channels connected`}
            >
              <Radio className="h-3 w-3" />
              {bot.channelsConnected ?? 0}/{bot.channelsTotal}
            </span>
          )}
          {bot.activeSessions > 0 && (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${bot.activeSessions} active session${bot.activeSessions !== 1 ? "s" : ""}`}
            >
              <Activity className="h-3 w-3" />
              {bot.activeSessions}
            </span>
          )}
          {status === "online" && bot.uptime != null && bot.uptime > 0 && (
            <span
              className="hidden md:inline-flex items-center gap-0.5"
              title={`Up for ${formatUptime(bot.uptime)}`}
            >
              <Clock className="h-3 w-3" />
              {formatUptime(bot.uptime)}
            </span>
          )}
          {bot.monthCostUsd != null && bot.monthCostUsd > 0 && (
            <span title="Month-to-date token cost">${bot.monthCostUsd.toFixed(2)}</span>
          )}
        </div>

        {/* Alert + health badges (always visible) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {alertCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400"
              title={`${alertCount} active alert${alertCount !== 1 ? "s" : ""}`}
            >
              <AlertTriangle className="h-3 w-3" />
              {alertCount}
            </span>
          )}
          {bot.healthScore != null && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                healthBadgeClasses(bot.healthScore.overall),
              )}
              title={`Health ${bot.healthScore.overall}/100 (grade ${bot.healthScore.grade})`}
            >
              {bot.healthScore.overall}
            </span>
          )}
          {onReconnect && status === "offline" && bot.gatewayUrl && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!reconnecting) onReconnect(bot);
              }}
              disabled={reconnecting}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Reconnect this bot to the live fleet monitor"
            >
              <RefreshCw className={cn("h-3 w-3", reconnecting && "animate-spin")} />
              {reconnecting ? "…" : "Reconnect"}
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}
