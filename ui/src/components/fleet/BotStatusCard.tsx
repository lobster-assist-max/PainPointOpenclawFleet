/**
 * BotStatusCard — Dashboard card for a single bot.
 *
 * Displays per Bot Card Spec:
 *  - Square avatar (large)
 *  - Name + role/position
 *  - Status indicator (Online / Offline / Idle)
 *  - Bio / description
 *  - Context % progress bar
 *  - Monthly token cost
 *  - Skills badges (first 5, "+N more")
 */

import { useState } from "react";
import { AlertTriangle, Radio, Activity, Clock, RefreshCw } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { getRoleById } from "@/lib/fleet-roles";
import { getDisplayStatus, STATUS_CONFIG, contextBarColor, healthBadgeClasses, botIsDegraded, formatUptime } from "@/lib/bot-display-helpers";
import { pixelArtAvatarUrl } from "@/lib/pixel-art-avatar";
import { useFleetTags } from "@/hooks/useFleetMonitor";
import type { BotStatus, BotTag } from "@/api/fleet-monitor";
import { ContextBar } from "./ContextBar";
import { SkillBadges } from "./SkillBadges";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AvatarSquare({
  src,
  emoji,
  name,
  botId,
  roleId,
}: {
  src: string | null;
  emoji: string;
  name: string;
  botId: string;
  roleId: string | null;
}) {
  const [pixelArtFailed, setPixelArtFailed] = useState(false);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-24 w-24 rounded-xl object-cover shrink-0 shadow-sm"
      />
    );
  }
  if (botId && !pixelArtFailed) {
    return (
      <img
        src={pixelArtAvatarUrl(botId, roleId)}
        alt={name}
        className="h-24 w-24 rounded-xl object-cover shrink-0 shadow-sm bg-primary/10"
        onError={() => setPixelArtFailed(true)}
      />
    );
  }
  return (
    <div className="h-24 w-24 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 shadow-sm">
      <span className="text-5xl">{emoji || "\u{1F916}"}</span>
    </div>
  );
}


function MonthCostDisplay({ cost, budget }: { cost: number; budget: number | null }) {
  // Raw usage can exceed 100% when a bot is over budget; clamp the displayed
  // width AND aria-valuenow to [0,100] so the progressbar stays valid against
  // the declared aria-valuemax (an over-budget bar reads a full red 100%).
  const pct = budget != null && budget > 0 ? Math.round((cost / budget) * 100) : 0;
  const clampedPct = Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Month Token</span>
        <span>
          ${cost.toFixed(2)}
          {budget != null && budget > 0 ? ` / $${budget.toFixed(0)}` : ""}
        </span>
      </div>
      {budget != null && budget > 0 && (
        <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              contextBarColor(pct),
            )}
            style={{ width: `${clampedPct}%` }}
            role="progressbar"
            aria-valuenow={clampedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Monthly budget usage"
          />
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface BotStatusCardProps {
  bot: BotStatus;
  className?: string;
  /** Number of firing alerts for this bot (flagged in the header). */
  alertCount?: number;
  /**
   * Quick-reconnect handler for an offline bot with a stored gateway URL.
   * When provided, an offline card shows a "Reconnect" button so an operator can
   * bring a single bot back online from the grid — the per-card complement to the
   * bulk "Reconnect Offline" button and the per-detail-page reconnect.
   */
  onReconnect?: (bot: BotStatus) => void;
  /** True while THIS bot's reconnect is in flight (spinner + disabled). */
  reconnecting?: boolean;
}

export function BotStatusCard({ bot, className, alertCount = 0, onReconnect, reconnecting = false }: BotStatusCardProps) {
  const status = getDisplayStatus(bot.connectionState);
  const { dot, label } = STATUS_CONFIG[status];
  const role = bot.roleId ? getRoleById(bot.roleId) : null;
  // Tags come from a separate shared query (React Query dedupes across cards);
  // surfacing them here closes the loop — tags assigned on Bot Detail are now
  // visible on the grid, not just filterable.
  const { data: tagsData } = useFleetTags();
  const botTags: BotTag[] = (tagsData?.tags ?? []).filter((t) => t.botId === bot.botId);

  // A firing alert or a degraded-but-online state (customer channels down / low
  // health) must make the whole card pop, not just the per-badge signals — a
  // healthy online bot and a degraded one otherwise share the identical border.
  // Priority: alerting (red) > degraded (amber) > online (normal) > offline (dim).
  const alerting = alertCount > 0;
  const degraded = botIsDegraded(bot);
  const cardTone = alerting
    ? "border-red-400/60 bg-red-50/30 dark:border-red-500/40 dark:bg-red-950/10"
    : degraded
      ? "border-amber-400/60 bg-amber-50/30 dark:border-amber-500/40 dark:bg-amber-950/10"
      : status === "online"
        ? "border-border bg-background"
        : "border-border/60 bg-background/70 opacity-90";

  return (
    <Link
      to={`/bots/${bot.botId}`}
      className="no-underline text-inherit"
    >
      <div
        className={cn(
          "group flex flex-col gap-3 rounded-xl border p-4 transition-all",
          "hover:shadow-md hover:-translate-y-0.5",
          cardTone,
          className,
        )}
      >
        {/* Header: Avatar + Name + Role + Status */}
        <div className="flex gap-3">
          <AvatarSquare src={bot.avatar} emoji={bot.emoji} name={bot.name} botId={bot.botId} roleId={bot.roleId} />
          <div className="flex flex-col justify-center min-w-0 gap-0.5">
            <p className="text-sm font-semibold truncate">
              {bot.emoji && <span className="mr-1">{bot.emoji}</span>}
              {bot.name}
            </p>
            {role && (
              <p className="text-xs text-muted-foreground truncate">
                {role.title} / {role.subtitle}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
              <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
              <span className="text-xs text-muted-foreground">{label}</span>
              {/* Channel connectivity — a bot connected to its gateway but with
                  customer channels down needs to be visible at a glance, not
                  hidden behind a green "Online" dot. Amber/red when any down. */}
              {bot.channelsTotal != null && bot.channelsTotal > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[11px] tabular-nums",
                    bot.channelsConnected != null && bot.channelsConnected < bot.channelsTotal
                      ? bot.channelsConnected === 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                  title={`${bot.channelsConnected ?? 0} of ${bot.channelsTotal} customer channels connected`}
                >
                  <Radio className="h-3 w-3" />
                  {bot.channelsConnected ?? 0}/{bot.channelsTotal}
                </span>
              )}
              {/* Active sessions — shows which bots are actively serving live
                  customer conversations right now (the fleet total is a KPI, but
                  the per-bot count is only visible here). */}
              {bot.activeSessions > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground"
                  title={`${bot.activeSessions} active session${bot.activeSessions !== 1 ? "s" : ""}`}
                >
                  <Activity className="h-3 w-3" />
                  {bot.activeSessions}
                </span>
              )}
              {/* Uptime — a stability signal (was only shown on Bot Detail). A
                  bot that's been up for days reads differently from one just
                  (re)connected. Shown only when online with a known uptime. */}
              {status === "online" && bot.uptime != null && bot.uptime > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground"
                  title={`Up for ${formatUptime(bot.uptime)}`}
                >
                  <Clock className="h-3 w-3" />
                  {formatUptime(bot.uptime)}
                </span>
              )}
            </div>
          </div>
          {/* Right-aligned badges: firing-alert flag + health score. */}
          <div className="ml-auto flex shrink-0 items-start gap-1.5">
            {/* Alert flag — an alerting bot must stand out in the grid, not hide
                behind a green "Online" dot. */}
            {alertCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400"
                title={`${alertCount} active alert${alertCount !== 1 ? "s" : ""}`}
              >
                <AlertTriangle className="h-3 w-3" />
                {alertCount}
              </span>
            )}
            {/* Health badge — surfaces the real 0–100 health score so a
                connected-but-degraded bot (e.g. channels down) is visible at a
                glance rather than hiding behind a green "Online" dot. */}
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
          </div>
        </div>

        {/* Bio / Description */}
        {bot.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {bot.description}
          </p>
        )}

        {/* Context % progress bar */}
        {bot.contextTokens != null && bot.contextMaxTokens != null && bot.contextMaxTokens > 0 && (
          <ContextBar tokens={bot.contextTokens} maxTokens={bot.contextMaxTokens} />
        )}

        {/* Monthly token cost */}
        {bot.monthCostUsd != null && (
          <MonthCostDisplay cost={bot.monthCostUsd} budget={bot.monthBudgetUsd} />
        )}

        {/* Skills badges */}
        {bot.skills.length > 0 && <SkillBadges skills={bot.skills} />}

        {/* Tags — assigned on Bot Detail, filterable/groupable on the grid */}
        {botTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {botTags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
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
            {botTags.length > 3 && (
              <span className="text-[10px] text-muted-foreground self-center">
                +{botTags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Quick reconnect — an offline bot (partial launch / dropped gateway)
            can be brought back online right from the grid, not just from the bulk
            button or its detail page. Nested-in-link is safe: preventDefault +
            stopPropagation keep the card's navigation from firing (same pattern
            SkillBadges already uses). Only shown when a stored gateway URL exists
            — a token-gated bot may still need its token from the detail page. */}
        {onReconnect && status === "offline" && bot.gatewayUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!reconnecting) onReconnect(bot);
            }}
            disabled={reconnecting}
            className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Reconnect this bot to the live fleet monitor"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", reconnecting && "animate-spin")} />
            {reconnecting ? "Reconnecting…" : "Reconnect"}
          </button>
        )}
      </div>
    </Link>
  );
}
