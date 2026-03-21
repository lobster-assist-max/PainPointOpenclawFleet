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

import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { getRoleById } from "@/lib/fleet-roles";
import { getDisplayStatus, STATUS_CONFIG, contextBarColor } from "@/lib/bot-display-helpers";
import type { BotStatus } from "@/api/fleet-monitor";
import { ContextBar } from "./ContextBar";
import { SkillBadges } from "./SkillBadges";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AvatarSquare({ src, emoji, name }: { src: string | null; emoji: string; name: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-24 w-24 rounded-xl object-cover shrink-0 shadow-sm"
      />
    );
  }
  return (
    <div className="h-24 w-24 rounded-xl bg-[#D4A373]/10 flex items-center justify-center shrink-0 shadow-sm">
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
}

export function BotStatusCard({ bot, className }: BotStatusCardProps) {
  const status = getDisplayStatus(bot.connectionState);
  const { dot, label } = STATUS_CONFIG[status];
  const role = bot.roleId ? getRoleById(bot.roleId) : null;

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
          <AvatarSquare src={bot.avatar} emoji={bot.emoji} name={bot.name} />
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
            </div>
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
      </div>
    </Link>
  );
}
