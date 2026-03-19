/**
 * BotDetail — Fleet-native Bot Detail page.
 *
 * Displays the full profile of a connected bot per Bot Card Spec:
 *  - Large square avatar + name + role + status
 *  - Bio / description
 *  - Context % progress bar
 *  - Monthly token cost
 *  - Skills badges (all shown, grouped)
 *  - Active sessions list
 *  - Health breakdown
 */

import { useState } from "react";
import { useParams, useNavigate, Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import {
  useFleetStatus,
  useBotHealth,
  useBotSessions,
  useBotChannels,
  connectionStateLabel,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { getRoleById } from "@/lib/fleet-roles";
import type { BotStatus, BotSession } from "@/api/fleet-monitor";
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  Zap,
  Clock,
  Radio,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------

const brand = {
  primary: "#D4A373",
  bg: "#FAF9F6",
  fg: "#2C2420",
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type DisplayStatus = "online" | "offline" | "idle";

function getDisplayStatus(state: string): DisplayStatus {
  if (state === "monitoring") return "online";
  if (state === "dormant" || state === "error" || state === "disconnected") return "offline";
  return "idle";
}

const STATUS_CONFIG: Record<DisplayStatus, { dot: string; label: string; color: string }> = {
  online: { dot: "bg-green-400", label: "Online", color: "text-green-600" },
  offline: { dot: "bg-red-400", label: "Offline", color: "text-red-500" },
  idle: { dot: "bg-yellow-400 animate-pulse", label: "Idle", color: "text-yellow-600" },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AvatarLarge({ src, emoji, name }: { src: string | null; emoji: string; name: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-32 w-32 rounded-xl object-cover shrink-0 shadow-md"
      />
    );
  }
  return (
    <div
      className="h-32 w-32 rounded-xl flex items-center justify-center shrink-0 shadow-md"
      style={{ backgroundColor: `${brand.primary}15` }}
    >
      <span className="text-6xl">{emoji || "\u{1F916}"}</span>
    </div>
  );
}

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

function ContextProgressBar({ tokens, maxTokens }: { tokens: number; maxTokens: number }) {
  const percent = maxTokens > 0 ? Math.min(100, Math.round((tokens / maxTokens) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Context</span>
        <span className="font-mono text-sm">
          {percent}% ({formatTokenCount(tokens)}/{formatTokenCount(maxTokens)})
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-muted/40 overflow-hidden">
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Month Token Cost</span>
        <span className="font-mono text-sm font-semibold">
          ${cost.toFixed(2)}
          {budget != null && budget > 0 ? ` / $${budget.toFixed(0)}` : ""}
        </span>
      </div>
      {budget != null && budget > 0 && (
        <div className="h-3 w-full rounded-full bg-muted/40 overflow-hidden">
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

function SkillBadgesFull({ skills }: { skills: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? skills : skills.slice(0, 5);
  const remaining = skills.length - 5;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold" style={{ color: brand.fg }}>Skills</h3>
      <div className="flex flex-wrap gap-2">
        {visible.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium"
            style={{ backgroundColor: `${brand.primary}18`, color: brand.fg }}
          >
            {skill}
          </span>
        ))}
        {!expanded && remaining > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center rounded-lg bg-muted px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            +{remaining} more
          </button>
        )}
      </div>
    </div>
  );
}

function HealthBar({ label, icon, score }: { label: string; icon: string; score: number }) {
  const barColor =
    score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : score >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-5 text-center shrink-0">{icon}</span>
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-sm">{score}</span>
    </div>
  );
}

function SessionsList({ sessions }: { sessions: BotSession[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No active sessions.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {sessions.slice(0, 10).map((s) => (
        <div key={s.sessionKey} className="flex items-center justify-between py-3 text-sm">
          <div className="min-w-0">
            <span className="font-mono text-xs">{s.sessionKey}</span>
            {s.title && <span className="ml-2 text-muted-foreground text-xs">&mdash; {s.title}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-3">
            <span>{s.messageCount} msgs</span>
            <span>{timeAgo(s.lastActivityAt)}</span>
          </div>
        </div>
      ))}
      {sessions.length > 10 && (
        <div className="py-2 text-xs text-muted-foreground text-center">
          +{sessions.length - 10} more sessions
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function BotDetail() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();

  const { data: fleet, isLoading } = useFleetStatus();
  const bot = fleet?.bots.find((b) => b.botId === botId);

  const { data: healthData } = useBotHealth(botId);
  const { data: sessions } = useBotSessions(botId);
  const { data: channels } = useBotChannels(botId);

  useBreadcrumbs(
    bot
      ? [
          { label: "Fleet Dashboard", to: "/dashboard" },
          { label: bot.name },
        ]
      : [{ label: "Fleet Dashboard", to: "/dashboard" }, { label: "Bot Detail" }],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading bot data...
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <WifiOff className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Bot not found or not connected to Fleet.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const status = getDisplayStatus(bot.connectionState);
  const { dot, label, color } = STATUS_CONFIG[status];
  const role = bot.roleId ? getRoleById(bot.roleId) : null;
  const health = healthData?.health ?? bot.healthScore;

  return (
    <div
      className="min-h-screen pb-12"
      style={{ background: `linear-gradient(180deg, ${brand.bg} 0%, #F5F0EB 100%)` }}
    >
      {/* Back button */}
      <div className="px-6 pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Fleet Dashboard
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-6 pt-4 space-y-6">
        {/* ── Hero: Avatar + Identity ──────────────────────────────────────── */}
        <div
          className="rounded-2xl border p-6 flex flex-col sm:flex-row gap-6"
          style={{
            backgroundColor: `${brand.bg}E6`,
            backdropFilter: "blur(12px)",
            borderColor: `${brand.primary}30`,
          }}
        >
          <AvatarLarge src={bot.avatar} emoji={bot.emoji} name={bot.name} />

          <div className="flex flex-col justify-center gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: brand.fg }}>
                {bot.emoji && <span className="mr-2">{bot.emoji}</span>}
                {bot.name}
              </h1>
              <div className="flex items-center gap-1.5">
                <span className={cn("h-3 w-3 rounded-full shrink-0", dot)} />
                <span className={cn("text-sm font-medium", color)}>{label}</span>
              </div>
            </div>

            {role && (
              <p className="text-base text-muted-foreground">
                {role.title} / {role.subtitle}
              </p>
            )}

            {bot.description && (
              <p className="text-sm leading-relaxed mt-1" style={{ color: `${brand.fg}CC` }}>
                {bot.description}
              </p>
            )}

            {/* Quick stats row */}
            <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-muted-foreground">
              {bot.activeSessions > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {bot.activeSessions} active session{bot.activeSessions !== 1 ? "s" : ""}
                </span>
              )}
              {channels && channels.length > 0 && (
                <span className="flex items-center gap-1">
                  <Wifi className="h-3.5 w-3.5" />
                  {channels.filter((c) => c.connected).length}/{channels.length} channels
                </span>
              )}
              {bot.gatewayUrl && (
                <a
                  href={bot.gatewayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Gateway
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Metrics: Context + Cost ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bot.contextTokens != null && bot.contextMaxTokens != null && bot.contextMaxTokens > 0 && (
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: `${brand.bg}E6`, borderColor: `${brand.primary}20` }}
            >
              <ContextProgressBar tokens={bot.contextTokens} maxTokens={bot.contextMaxTokens} />
            </div>
          )}

          {bot.monthCostUsd != null && (
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: `${brand.bg}E6`, borderColor: `${brand.primary}20` }}
            >
              <MonthCostDisplay cost={bot.monthCostUsd} budget={bot.monthBudgetUsd} />
            </div>
          )}
        </div>

        {/* ── Skills ───────────────────────────────────────────────────────── */}
        {bot.skills.length > 0 && (
          <div
            className="rounded-xl border p-5"
            style={{ backgroundColor: `${brand.bg}E6`, borderColor: `${brand.primary}20` }}
          >
            <SkillBadgesFull skills={bot.skills} />
          </div>
        )}

        {/* ── Health Breakdown ─────────────────────────────────────────────── */}
        {health && (
          <div
            className="rounded-xl border p-5 space-y-4"
            style={{ backgroundColor: `${brand.bg}E6`, borderColor: `${brand.primary}20` }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: brand.fg }}>
                <Zap className="h-4 w-4" />
                Health Score
              </h3>
              <span
                className={cn(
                  "text-xl font-bold",
                  health.overall >= 80
                    ? "text-green-600"
                    : health.overall >= 60
                      ? "text-yellow-600"
                      : "text-red-600",
                )}
              >
                {health.overall}/100 ({health.grade})
              </span>
            </div>
            <div className="space-y-2.5">
              <HealthBar icon="\u{1F517}" label="Connectivity" score={health.breakdown.connectivity} />
              <HealthBar icon="\u{26A1}" label="Responsiveness" score={health.breakdown.responsiveness} />
              <HealthBar icon="\u{1F4B0}" label="Efficiency" score={health.breakdown.efficiency} />
              <HealthBar icon="\u{1F4E1}" label="Channels" score={health.breakdown.channels} />
              <HealthBar icon="\u{23F0}" label="Cron" score={health.breakdown.cron} />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
              <span>Trend:</span>
              <span>
                {health.trend === "improving"
                  ? "\u{1F4C8} Improving"
                  : health.trend === "degrading"
                    ? "\u{1F4C9} Degrading"
                    : "\u{2192} Stable"}
              </span>
            </div>
          </div>
        )}

        {/* ── Active Sessions ──────────────────────────────────────────────── */}
        <div
          className="rounded-xl border p-5 space-y-3"
          style={{ backgroundColor: `${brand.bg}E6`, borderColor: `${brand.primary}20` }}
        >
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: brand.fg }}>
            <Clock className="h-4 w-4" />
            Active Sessions
            {sessions && sessions.length > 0 && (
              <span className="text-muted-foreground font-normal">({sessions.length})</span>
            )}
          </h3>
          <SessionsList sessions={sessions ?? []} />
        </div>

        {/* ── Channels ─────────────────────────────────────────────────────── */}
        {channels && channels.length > 0 && (
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: `${brand.bg}E6`, borderColor: `${brand.primary}20` }}
          >
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: brand.fg }}>
              <Radio className="h-4 w-4" />
              Channels
            </h3>
            <div className="divide-y divide-border">
              {channels.map((ch) => (
                <div key={ch.name} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block w-2.5 h-2.5 rounded-full",
                        ch.connected ? "bg-green-500" : "bg-neutral-400",
                      )}
                    />
                    <span className="font-medium capitalize">{ch.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{ch.messageCount24h} msgs/24h</span>
                    <span>{ch.connected ? "Connected" : "Disconnected"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Link to Paperclip Agent Detail (advanced) ───────────────────── */}
        {bot.agentId && (
          <div className="flex justify-center pt-2">
            <Link
              to={`/agents/${bot.agentId}`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
            >
              View advanced agent settings &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
