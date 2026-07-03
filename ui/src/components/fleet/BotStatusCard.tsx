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
import { AlertTriangle, Radio } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { getRoleById } from "@/lib/fleet-roles";
import { getDisplayStatus, STATUS_CONFIG, contextBarColor, healthBadgeClasses } from "@/lib/bot-display-helpers";
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
              contextBarColor(Math.round((cost / budget) * 100)),
            )}
            style={{ width: `${Math.min(100, Math.round((cost / budget) * 100))}%` }}
            role="progressbar"
            aria-valuenow={Math.round((cost / budget) * 100)}
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
}

export function BotStatusCard({ bot, className, alertCount = 0 }: BotStatusCardProps) {
  const status = getDisplayStatus(bot.connectionState);
  const { dot, label } = STATUS_CONFIG[status];
  const role = bot.roleId ? getRoleById(bot.roleId) : null;
  // Tags come from a separate shared query (React Query dedupes across cards);
  // surfacing them here closes the loop — tags assigned on Bot Detail are now
  // visible on the grid, not just filterable.
  const { data: tagsData } = useFleetTags();
  const botTags: BotTag[] = (tagsData?.tags ?? []).filter((t) => t.botId === bot.botId);

  return (
    <Link
      to={`/bots/${bot.botId}`}
      className="no-underline text-inherit"
    >
      <div
        className={cn(
          "group flex flex-col gap-3 rounded-xl border p-4 transition-all",
          "hover:shadow-md hover:-translate-y-0.5",
          status === "online"
            ? "border-border bg-background"
            : "border-border/60 bg-background/70 opacity-90",
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
            <div className="flex items-center gap-1.5 mt-0.5">
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
      </div>
    </Link>
  );
}
