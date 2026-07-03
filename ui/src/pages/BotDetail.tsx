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

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import {
  useFleetStatus,
  useBotHealth,
  useBotSessions,
  useBotChannels,
  useBotCron,
  useBotUsage,
  useDisconnectBot,
  useReconnectBot,
  estimateCostUsd,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { agentToBotStatus } from "@/lib/agent-to-bot-status";
import { getRoleById } from "@/lib/fleet-roles";
import { getDisplayStatus, STATUS_CONFIG, contextBarColor, formatTokenCount, healthScoreTextColor, healthScoreBarColor, channelDisplayName, inferChannelFromSessionKey } from "@/lib/bot-display-helpers";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import type { BotStatus, BotSession } from "@/api/fleet-monitor";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Wifi,
  WifiOff,
  Zap,
  Clock,
  Radio,
  ExternalLink,
  Unplug,
  Activity,
  Coins,
  Calendar,
  Wrench,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotAvatarUpload } from "@/components/fleet/BotAvatarUpload";
import { ContextBar } from "@/components/fleet/ContextBar";
import { SkillBadges } from "@/components/fleet/SkillBadges";
import { PromptLabWidget } from "@/components/fleet/PromptLabWidget";
import { FleetHeatmap } from "@/components/fleet/FleetHeatmap";
import { TraceWaterfall } from "@/components/fleet/TraceWaterfall";
import { SessionLiveTail } from "@/components/fleet/SessionLiveTail";

// ---------------------------------------------------------------------------
// Brand tokens — CSS custom properties for dark mode support
// ---------------------------------------------------------------------------

const BRAND_CSS_VARS = {
  "--fleet-brand-primary": "#D4A373",
  "--fleet-brand-bg": "#FAF9F6",
  "--fleet-brand-bg-end": "#F5F0EB",
  "--fleet-brand-fg": "#2C2420",
} as React.CSSProperties;

const BRAND_CSS_VARS_DARK: Record<string, string> = {
  "--fleet-brand-primary": "#C4956A",
  "--fleet-brand-bg": "#1C1917",
  "--fleet-brand-bg-end": "#1A1614",
  "--fleet-brand-fg": "#F5F0EB",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
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


function HealthBar({ label, icon, score }: { label: string; icon: string; score: number }) {
  // Grade-aligned color (A/B/C/D/F) so the per-dimension bars match the grade
  // letter, the overall-score color, and the dashboard health badge.
  const barColor = healthScoreBarColor(score);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-5 text-center shrink-0">{icon}</span>
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${score}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} score`}
        />
      </div>
      <span className="w-10 text-right font-mono text-sm">{score}</span>
    </div>
  );
}

function SessionsList({
  sessions,
  selectedSessionKey,
  onSelect,
}: {
  sessions: BotSession[];
  selectedSessionKey: string | null;
  onSelect: (sessionKey: string) => void;
}) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No active sessions.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {sessions.slice(0, 10).map((s) => {
        const isSelected = s.sessionKey === selectedSessionKey;
        return (
          <button
            key={s.sessionKey}
            type="button"
            onClick={() => onSelect(s.sessionKey)}
            aria-pressed={isSelected}
            aria-label={`View live tail for session ${s.sessionKey}`}
            className={cn(
              "flex w-full items-center justify-between py-3 text-sm text-left rounded-md px-2 -mx-2 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isSelected && "bg-primary/10",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {/* Channel badge — the raw sessionKey (botId:peer:U123…) is cryptic;
                  surface which messaging channel the session belongs to. */}
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {channelDisplayName(inferChannelFromSessionKey(s.sessionKey))}
              </span>
              <span className="font-mono text-xs truncate">{s.sessionKey}</span>
              {s.title && <span className="text-muted-foreground text-xs truncate">&mdash; {s.title}</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-3">
              <span>{s.messageCount} msgs</span>
              <span>{timeAgo(s.lastActivityAt)}</span>
            </div>
          </button>
        );
      })}
      {sessions.length > 10 && (
        <div className="py-2 text-xs text-muted-foreground text-center">
          +{sessions.length - 10} more sessions
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token Usage
// ---------------------------------------------------------------------------

function TokenUsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums" style={{ color: "var(--fleet-brand-fg)" }}>
        {value}
      </span>
    </div>
  );
}

function TokenUsageSection({ total }: { total: { inputTokens: number; outputTokens: number; cachedInputTokens: number } }) {
  const cost = estimateCostUsd(total);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <TokenUsageStat label="Input" value={formatTokenCount(total.inputTokens)} />
      <TokenUsageStat label="Output" value={formatTokenCount(total.outputTokens)} />
      <TokenUsageStat label="Cached" value={formatTokenCount(total.cachedInputTokens)} />
      <TokenUsageStat label="Est. cost" value={`$${cost.toFixed(2)}`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function BotDetail() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const isDark = useDarkMode();

  const { data: fleet, isLoading: fleetLoading } = useFleetStatus();
  const fleetBot = fleet?.bots.find((b) => b.botId === botId);

  // DB agent fallback: load from database when fleet-monitor doesn't have this bot
  const { data: dbAgent, isLoading: dbLoading } = useQuery({
    queryKey: queryKeys.agents.detail(botId!),
    queryFn: () => agentsApi.get(botId!, selectedCompanyId ?? undefined),
    enabled: !!botId && !fleetBot,
  });

  const bot = useMemo(() => {
    if (fleetBot) return fleetBot;
    if (dbAgent) return agentToBotStatus(dbAgent);
    return undefined;
  }, [fleetBot, dbAgent]);

  // Show the loading state while EITHER source is still resolving. Using `&&`
  // here meant "Bot not found" briefly flashed whenever fleet status was already
  // cached but this bot needs the DB fallback (fleetLoading=false, dbLoading=true
  // → false), since `bot` is still undefined at that point.
  const isLoading = fleetLoading || dbLoading;
  // We're rendering a non-live bot (from the DB) whenever fleet-monitor doesn't
  // track it — this covers BOTH "fleet-monitor offline" AND "fleet-monitor online
  // but this bot is dormant / never connected". In every such case `bot` came
  // from the DB agent (if neither source had it we already returned "not found"
  // above), so the live health/sessions/channels sections have no data and their
  // error banners would be spurious. Guarding on the old fleet-error-only
  // condition left a dormant bot's page cluttered with "Failed to load…" errors.
  const usingDbFallback = !fleetBot;

  const { data: healthData, isError: healthError, isLoading: healthLoading } = useBotHealth(botId);
  const { data: sessions, isError: sessionsError, isLoading: sessionsLoading } = useBotSessions(botId);
  const { data: channels, isError: channelsError, isLoading: channelsLoading } = useBotChannels(botId);
  const { data: cronJobs, isError: cronError, isLoading: cronLoading } = useBotCron(botId);
  // Month-to-date window (UTC), matching the server's monthCostUsd computation
  // (fleet-metrics-provider) so the Token Usage "Est. cost" agrees with the
  // "Month Token" cost card on this same page instead of showing an all-time
  // total. Memoized at mount so the query key stays stable (a live `to` would
  // churn the cache every render).
  const monthWindow = useMemo(() => {
    const now = new Date();
    return {
      from: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ).toISOString(),
      to: now.toISOString(),
    };
  }, []);
  const { data: usage, isError: usageError, isLoading: usageLoading } = useBotUsage(
    botId,
    monthWindow.from,
    monthWindow.to,
  );
  // MEMORY.md preview — read-only. Only meaningful for a live bot (the gateway
  // file-read RPC is unreachable for a dormant/DB-fallback bot), so gate on the
  // live-fleet condition like the other gateway-backed sections.
  const {
    data: memoryFile,
    isError: memoryError,
    isLoading: memoryLoading,
  } = useQuery({
    queryKey: queryKeys.fleet.botFile(botId!, "MEMORY.md"),
    queryFn: () => fleetMonitorApi.botFile(botId!, "MEMORY.md", selectedCompanyId ?? undefined),
    enabled: !!botId && !!fleetBot,
  });
  const disconnectMutation = useDisconnectBot();
  const reconnectMutation = useReconnectBot();

  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs(
      bot
        ? [
            { label: "Fleet Dashboard", href: "/dashboard" },
            { label: bot.name },
          ]
        : [{ label: "Fleet Dashboard", href: "/dashboard" }, { label: "Bot Detail" }],
    );
  }, [setBreadcrumbs, bot]);

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
  const allBotIds = (fleet?.bots ?? []).map((b) => b.botId).filter((id) => id !== bot.botId);

  return (
    <div
      className="min-h-screen pb-12"
      style={{
        ...(isDark ? BRAND_CSS_VARS_DARK : BRAND_CSS_VARS) as React.CSSProperties,
        background: "linear-gradient(180deg, var(--fleet-brand-bg) 0%, var(--fleet-brand-bg-end) 100%)",
      }}
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
        {/* Fleet-monitor offline indicator */}
        {usingDbFallback && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 text-sm">
            <WifiOff className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-blue-700 dark:text-blue-300 flex-1 min-w-0">
              Showing saved bot data — this bot isn't connected to the live fleet monitor. Live health, sessions, and uptime are unavailable.
            </span>
            {bot.gatewayUrl && (
              <button
                type="button"
                onClick={() =>
                  reconnectMutation.mutate({ botId: bot.botId, gatewayUrl: bot.gatewayUrl })
                }
                disabled={reconnectMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                aria-label="Reconnect bot to live fleet monitor"
              >
                {reconnectMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wifi className="h-3.5 w-3.5" />
                )}
                {reconnectMutation.isPending ? "Reconnecting…" : "Reconnect"}
              </button>
            )}
          </div>
        )}
        {reconnectMutation.isError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Reconnect failed:{" "}
              {reconnectMutation.error instanceof Error
                ? reconnectMutation.error.message
                : "gateway unreachable"}
            </span>
          </div>
        )}

        {/* ── Hero: Avatar + Identity ──────────────────────────────────────── */}
        <div
          className="rounded-2xl border p-6 flex flex-col sm:flex-row gap-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)",
            backdropFilter: "blur(12px)",
            borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 19%, transparent)",
          }}
        >
          <BotAvatarUpload
            botId={bot.botId}
            currentAvatar={bot.avatar}
            emoji={bot.emoji}
            name={bot.name}
            roleId={bot.roleId}
            companyId={selectedCompanyId}
            size="lg"
            editable
            onAvatarChange={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(bot.botId) });
              queryClient.invalidateQueries({ queryKey: ["agents"] });
            }}
          />

          <div className="flex flex-col justify-center gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: "var(--fleet-brand-fg)" }}>
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
              <p className="text-sm leading-relaxed mt-1" style={{ color: "color-mix(in srgb, var(--fleet-brand-fg) 80%, transparent)" }}>
                {bot.description}
              </p>
            )}

            {/* Quick stats row */}
            <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-muted-foreground">
              {bot.uptime != null && bot.uptime > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" />
                  Uptime: {formatUptime(bot.uptime)}
                </span>
              )}
              {bot.activeSessions > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {bot.activeSessions} active session{bot.activeSessions !== 1 ? "s" : ""}
                </span>
              )}
              {channels && channels.length > 0 && (() => {
                const connectedCount = channels.filter((c) => c.connected).length;
                // Color-code the quick-stat so a bot with customer channels down
                // reads amber/red at a glance in the hero (consistent with the
                // dashboard card's channel badge and the Channels-section warning).
                const colorClass =
                  connectedCount < channels.length
                    ? connectedCount === 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-amber-600 dark:text-amber-400"
                    : "";
                return (
                  <span className={cn("flex items-center gap-1", colorClass)}>
                    <Wifi className="h-3.5 w-3.5" />
                    {connectedCount}/{channels.length} channels
                  </span>
                );
              })()}
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
              <Link
                to={`/bots/${botId}/workshop`}
                className="flex items-center gap-1 hover:text-foreground transition-colors no-underline"
              >
                <Wrench className="h-3.5 w-3.5" />
                Workshop
              </Link>
            </div>
          </div>
        </div>

        {/* ── Metrics: Context + Cost ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bot.contextTokens != null && bot.contextMaxTokens != null && bot.contextMaxTokens > 0 && (
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
            >
              <ContextBar tokens={bot.contextTokens} maxTokens={bot.contextMaxTokens} />
            </div>
          )}

          {bot.monthCostUsd != null && (
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
            >
              <MonthCostDisplay cost={bot.monthCostUsd} budget={bot.monthBudgetUsd} />
            </div>
          )}
        </div>

        {/* ── Skills ───────────────────────────────────────────────────────── */}
        {bot.skills.length > 0 && (
          <div
            className="rounded-xl border p-5"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            {/* Detail page has room — show every skill (matches the "all shown"
                intent), not the 5-badge "+N more" truncation used on cards. */}
            <SkillBadges skills={bot.skills} limit={bot.skills.length} />
          </div>
        )}

        {/* ── Health Breakdown ─────────────────────────────────────────────── */}
        {healthLoading && !usingDbFallback && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading health metrics...
          </div>
        )}
        {healthError && !usingDbFallback && !healthLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Failed to load health metrics. The bot may be temporarily unreachable.
          </div>
        )}
        {health && (
          <div
            className="rounded-xl border p-5 space-y-4"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--fleet-brand-fg)" }}>
                <Zap className="h-4 w-4" />
                Health Score
              </h3>
              <span className={cn("text-xl font-bold", healthScoreTextColor(health.overall))}>
                {health.overall}/100 ({health.grade})
              </span>
            </div>
            <div className="space-y-2.5">
              <HealthBar icon="🔗" label="Connectivity" score={health.breakdown.connectivity} />
              <HealthBar icon="⚡" label="Responsiveness" score={health.breakdown.responsiveness} />
              <HealthBar icon="💰" label="Efficiency" score={health.breakdown.efficiency} />
              <HealthBar icon="📡" label="Channels" score={health.breakdown.channels} />
              <HealthBar icon="⏰" label="Cron" score={health.breakdown.cron} />
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

        {/* ── Token Usage ──────────────────────────────────────────────────── */}
        {!usingDbFallback && (
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--fleet-brand-fg)" }}>
              <Coins className="h-4 w-4" />
              Token Usage (This Month)
            </h3>
            {usageLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading token usage...
              </div>
            ) : usageError ? (
              <p className="text-sm text-red-600 dark:text-red-400">Failed to load token usage.</p>
            ) : usage ? (
              <TokenUsageSection total={usage.total} />
            ) : (
              <p className="text-sm text-muted-foreground">No token usage recorded yet.</p>
            )}
          </div>
        )}

        {/* ── Active Sessions ──────────────────────────────────────────────── */}
        <div
          className="rounded-xl border p-5 space-y-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
        >
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--fleet-brand-fg)" }}>
            <Clock className="h-4 w-4" />
            Active Sessions
            {sessions && sessions.length > 0 && (
              <span className="text-muted-foreground font-normal">({sessions.length})</span>
            )}
          </h3>
          {sessionsLoading && !usingDbFallback ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sessions...
            </div>
          ) : sessionsError && !usingDbFallback ? (
            <p className="text-sm text-red-600 dark:text-red-400">Failed to load sessions.</p>
          ) : (
            <SessionsList
              sessions={sessions ?? []}
              selectedSessionKey={selectedSessionKey}
              onSelect={(key) => setSelectedSessionKey((cur) => (cur === key ? null : key))}
            />
          )}
          {selectedSessionKey && !usingDbFallback && (
            <div className="pt-2">
              <SessionLiveTail
                botId={bot.botId}
                sessionKey={selectedSessionKey}
                botEmoji={bot.emoji}
                botName={bot.name}
              />
            </div>
          )}
        </div>

        {/* ── Channels ─────────────────────────────────────────────────────── */}
        {channelsLoading && !usingDbFallback && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading channels...
          </div>
        )}
        {channelsError && !usingDbFallback && !channelsLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Failed to load channel data.
          </div>
        )}
        {channels && channels.length > 0 && (
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--fleet-brand-fg)" }}>
              <Radio className="h-4 w-4" />
              Channels
            </h3>
            {/* Surface the "connected to gateway but not serving customers" state
                the channel-aware health score catches: a monitoring bot with
                disconnected customer channels is degraded, not healthy. */}
            {(() => {
              const down = channels.filter((c) => !c.connected).length;
              if (down === 0) return null;
              const allDown = down === channels.length;
              return (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2.5 text-xs",
                    allDown
                      ? "border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                      : "border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400",
                  )}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {allDown
                    ? "All customer channels are disconnected — this bot isn't reachable by customers."
                    : `${down} of ${channels.length} customer channels disconnected.`}
                </div>
              );
            })()}
            <div className="divide-y divide-border">
              {channels.map((ch) => (
                <div key={ch.name} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block w-2.5 h-2.5 rounded-full",
                        ch.connected ? "bg-green-500" : "bg-neutral-400",
                      )}
                      aria-label={ch.connected ? "Connected" : "Disconnected"}
                    />
                    <span className="font-medium">{channelDisplayName(ch.name)}</span>
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

        {/* ── Memory (MEMORY.md) ───────────────────────────────────────────── */}
        {!usingDbFallback && (
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--fleet-brand-fg)" }}>
                <FileText className="h-4 w-4" />
                Memory (MEMORY.md)
              </h3>
              <Link
                to={`/bots/${bot.botId}/workshop`}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
              >
                Edit in Workshop &rarr;
              </Link>
            </div>
            {memoryLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading memory...
              </div>
            ) : memoryError ? (
              <p className="text-sm text-muted-foreground">No MEMORY.md found for this bot.</p>
            ) : memoryFile ? (
              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 rounded-md p-3 max-h-60 overflow-y-auto">
                {memoryFile}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No MEMORY.md found for this bot.</p>
            )}
          </div>
        )}

        {/* ── Scheduled Tasks (Cron) ───────────────────────────────────────── */}
        {cronLoading && !usingDbFallback && !cronJobs && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scheduled tasks...
          </div>
        )}
        {cronError && !usingDbFallback && !cronLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Failed to load scheduled tasks.
          </div>
        )}
        {cronJobs && cronJobs.length > 0 && (
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--fleet-brand-fg)" }}>
              <Calendar className="h-4 w-4" />
              Scheduled Tasks ({cronJobs.length})
            </h3>
            <div className="divide-y divide-border">
              {cronJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("text-xs", job.enabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}
                      aria-label={job.enabled ? "Enabled" : "Disabled"}
                    >
                      {job.enabled ? "●" : "○"}
                    </span>
                    <span className="font-medium">{job.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{job.schedule}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.lastRunAt ? (
                      <span>
                        {job.lastRunStatus === "success" ? "✅" : "❌"} {timeAgo(job.lastRunAt)}
                      </span>
                    ) : (
                      <span>Never run</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Health Heatmap ───────────────────────────────────────────────── */}
        {bot.agentId && (
          <div
            className="rounded-xl border p-5"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            <FleetHeatmap botId={bot.agentId} />
          </div>
        )}

        {/* ── Agent Turn Traces ────────────────────────────────────────────── */}
        {!usingDbFallback && (
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
          >
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--fleet-brand-fg)" }}>
              <Activity className="h-4 w-4" />
              Agent Turn Traces
            </h3>
            <TraceWaterfall botId={bot.botId} />
          </div>
        )}

        {/* ── Prompt Lab ───────────────────────────────────────────────────── */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)" }}
        >
          <PromptLabWidget botId={bot.botId} allBotIds={allBotIds} companyId={selectedCompanyId ?? undefined} />
        </div>

        {/* ── Link to Fleet Agent Detail (advanced) ──────────────────────── */}
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

        {/* ── Disconnect Bot ──────────────────────────────────────────────── */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)", borderColor: "rgba(239,68,68,0.2)" }}
        >
          {!showDisconnectConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Disconnect Bot</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Remove this bot from the fleet. The bot itself will continue running.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() => setShowDisconnectConfirm(true)}
              >
                <Unplug className="h-3.5 w-3.5 mr-1.5" />
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Are you sure you want to disconnect {bot.emoji} {bot.name}?
              </p>
              <p className="text-xs text-muted-foreground">
                This will stop monitoring and remove the bot from your fleet dashboard.
                You can reconnect it later from the Connect Bot wizard.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDisconnectConfirm(false)}
                  disabled={disconnectMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={disconnectMutation.isPending}
                  onClick={() => {
                    disconnectMutation.mutate(bot.botId, {
                      onSuccess: () => {
                        if (selectedCompanyId) {
                          queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
                        }
                        navigate("/dashboard");
                      },
                    });
                  }}
                >
                  {disconnectMutation.isPending ? "Disconnecting..." : "Yes, Disconnect"}
                </Button>
              </div>
              {disconnectMutation.isError && (
                <p className="text-xs text-red-600">
                  {disconnectMutation.error instanceof Error
                    ? disconnectMutation.error.message
                    : "Failed to disconnect bot."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
