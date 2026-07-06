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

import { AlertTriangle, Radio, Activity, Clock, RefreshCw, Check, Gauge, Star } from "lucide-react";
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
  contextPercent,
  contextTextColor,
} from "@/lib/bot-display-helpers";
import { pixelArtAvatarUrl } from "@/lib/pixel-art-avatar";
import { useFleetTags } from "@/hooks/useFleetMonitor";
import type { BotStatus, BotTag } from "@/api/fleet-monitor";

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
  /** When true, render a selection checkbox for bulk actions. */
  selectable?: boolean;
  /** Whether this bot is currently selected. */
  selected?: boolean;
  /** Toggle this bot's selection. */
  onToggleSelect?: (bot: BotStatus) => void;
  /** Whether this bot is pinned (drives the star icon fill). */
  pinned?: boolean;
  /** Toggle this bot's pinned state. */
  onTogglePin?: (bot: BotStatus) => void;
}

export function BotStatusRow({
  bot,
  alertCount = 0,
  onReconnect,
  reconnecting = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  pinned = false,
  onTogglePin,
}: BotStatusRowProps) {
  const status = getDisplayStatus(bot.connectionState);
  const { dot } = STATUS_CONFIG[status];
  const role = bot.roleId ? getRoleById(bot.roleId) : null;

  // Tags come from the shared, deduped fleet-tags query (same as the card view),
  // so the list view keeps tag visibility at parity with the grid cards.
  const { data: tagsData } = useFleetTags();
  const botTags: BotTag[] = (tagsData?.tags ?? []).filter(
    (t) => t.botId === bot.botId,
  );

  const alerting = alertCount > 0;
  const degraded = botIsDegraded(bot);
  // Context-window occupancy — a real "bot nearing its limit" signal shown as
  // the full ContextBar on the card + exported to CSV, but previously invisible
  // in the dense list view. Compact colored "N%" here for parity.
  const ctxPct = contextPercent(bot);
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
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        {selectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={selected ? `Deselect ${bot.name}` : `Select ${bot.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect?.(bot);
            }}
            className={cn(
              "shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors",
              selected
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border bg-background hover:border-primary",
            )}
            title={selected ? "Deselect" : "Select"}
          >
            {selected && <Check className="h-3 w-3" />}
          </button>
        )}
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

        {/* Tags — parity with the card view; compact, hidden on narrow screens */}
        {botTags.length > 0 && (
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {botTags.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={{
                  borderColor: t.color
                    ? `color-mix(in srgb, ${t.color} 40%, transparent)`
                    : undefined,
                  color: t.color ?? undefined,
                  backgroundColor: t.color
                    ? `color-mix(in srgb, ${t.color} 12%, transparent)`
                    : undefined,
                }}
              >
                {t.label}
              </span>
            ))}
            {botTags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{botTags.length - 2}
              </span>
            )}
          </div>
        )}

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
          {ctxPct != null && (
            <span
              className={cn("inline-flex items-center gap-0.5", contextTextColor(ctxPct))}
              title={`Context window ${ctxPct}% full`}
            >
              <Gauge className="h-3 w-3" />
              {ctxPct}%
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

        {/* Pin toggle + alert + health badges (always visible) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onTogglePin && (
            <button
              type="button"
              aria-label={pinned ? `Unpin ${bot.name}` : `Pin ${bot.name}`}
              aria-pressed={pinned}
              title={pinned ? "Unpin" : "Pin to top"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTogglePin(bot);
              }}
              className={cn(
                "transition-colors",
                pinned
                  ? "text-amber-500"
                  : "text-muted-foreground/40 hover:text-amber-500",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
            </button>
          )}
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
