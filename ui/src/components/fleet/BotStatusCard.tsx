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
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { getRoleById } from "@/lib/fleet-roles";
import type { BotStatus } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type DisplayStatus = "online" | "offline" | "idle";

function getDisplayStatus(state: string): DisplayStatus {
  if (state === "monitoring") return "online";
  if (state === "dormant" || state === "error" || state === "disconnected") return "offline";
  return "idle"; // connecting, authenticating, backoff
}

const STATUS_CONFIG: Record<DisplayStatus, { dot: string; label: string }> = {
  online: { dot: "bg-green-400", label: "Online" },
  offline: { dot: "bg-red-400", label: "Offline" },
  idle: { dot: "bg-yellow-400 animate-pulse", label: "Idle" },
};

// ---------------------------------------------------------------------------
// Context bar color
// ---------------------------------------------------------------------------

function contextBarColor(percent: number): string {
  if (percent > 80) return "bg-red-500";
  if (percent >= 50) return "bg-yellow-500";
  return "bg-green-500";
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

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

function ContextProgressBar({
  tokens,
  maxTokens,
}: {
  tokens: number;
  maxTokens: number;
}) {
  const percent = maxTokens > 0 ? Math.min(100, Math.round((tokens / maxTokens) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Context</span>
        <span>
          {percent}% ({formatTokenCount(tokens)}/{formatTokenCount(maxTokens)})
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", contextBarColor(percent))}
          style={{ width: `${percent}%` }}
        />
      </div>
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

function SkillBadges({ skills }: { skills: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? skills : skills.slice(0, 5);
  const remaining = skills.length - 5;

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">Skills</span>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center rounded-md bg-[#D4A373]/10 px-2 py-0.5 text-xs font-medium text-[#2C2420]"
          >
            {skill}
          </span>
        ))}
        {!expanded && remaining > 0 && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(true);
            }}
            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            +{remaining} more
          </button>
        )}
      </div>
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
          <ContextProgressBar tokens={bot.contextTokens} maxTokens={bot.contextMaxTokens} />
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
