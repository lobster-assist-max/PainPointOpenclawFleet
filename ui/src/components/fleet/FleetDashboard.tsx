/**
 * FleetDashboard — the main overview page for a Fleet.
 *
 * Shows: KPI summary cards, bot grid sorted by health (attention-first),
 * active alerts panel, and recent activity feed.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Wifi,
  WifiOff,
  DollarSign,
  Activity,
  AlertTriangle,
  Radio,
  Plus,
  Search,
  ChevronRight,
  Rocket,
  RefreshCw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFleetStatus, useFleetAlerts, useFleetTags } from "@/hooks/useFleetMonitor";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import { useToast } from "@/context/ToastContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { alertSeverityBadge, alertSeverityBadgeDefault } from "@/lib/status-colors";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { BotStatusCard } from "./BotStatusCard";
import { FilterBar, useFilteredBots, useGroupedBots, type SortKey, type GroupKey } from "./FilterBar";
import { IntelligenceWidget } from "./IntelligenceWidget";
import { BudgetWidget } from "./BudgetWidget";
import { FleetHeatmap } from "./FleetHeatmap";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { agentToBotStatus } from "@/lib/agent-to-bot-status";
import { healthGradeLetter, healthScoreTextColor, botChannelsDown, botIsDegraded, getDisplayStatus } from "@/lib/bot-display-helpers";
import { timeAgo, toTimestamp } from "@/lib/timeAgo";
import type { BotStatus, FleetAlert, BotTag } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// KPI Row
// ---------------------------------------------------------------------------

function FleetKpiRow({ bots, onShowDegraded, onShowOffline, onShowBusiest }: { bots: BotStatus[]; onShowDegraded?: () => void; onShowOffline?: () => void; onShowBusiest?: () => void }) {
  const online = bots.filter((b) => b.connectionState === "monitoring").length;
  const errored = bots.filter((b) => b.connectionState === "error").length;
  // Count bots whose display status is "offline" (dormant/error/disconnected) so
  // the KPI can drill down to them — consistent with the Avg Health "degraded"
  // and Month Spend "/costs" drill-downs. Idle (connecting/backoff) bots aren't
  // offline, so they're excluded.
  const offline = bots.filter((b) => getDisplayStatus(b.connectionState) === "offline").length;
  const totalSessions = bots.reduce((sum, b) => sum + b.activeSessions, 0);
  const totalMonthCost = bots.reduce((sum, b) => sum + (b.monthCostUsd ?? 0), 0);
  // Average only over bots that actually have a health score — a bot whose
  // score hasn't been computed yet (just connected, metrics loop not caught up)
  // shouldn't drag the fleet average toward 0.
  const scored = bots.filter((b) => b.healthScore != null);
  const hasHealth = scored.length > 0;
  const avgHealth = hasHealth
    ? Math.round(scored.reduce((sum, b) => sum + (b.healthScore?.overall ?? 0), 0) / scored.length)
    : 0;
  // Count degraded bots so the always-visible KPI flags an actionable problem
  // even when the average looks fine — a single failing bot can hide behind a
  // healthy fleet average. Use the shared botIsDegraded (monitoring + channels
  // down OR health < 60) so this "N degraded" flag matches the amber card tone
  // (#272) and every other "degraded" surface, instead of missing bots whose
  // customer channels are down but whose overall health still reads ≥ 60.
  const degradedCount = bots.filter(botIsDegraded).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={Wifi}
          value={`${online}/${bots.length}`}
          label="Bots Online"
          // Drill down to the offline bots when any exist (filters the grid via
          // the "offline" status search), the same close-the-loop affordance as
          // the Avg Health "degraded" and Month Spend "/costs" cards.
          onClick={offline > 0 ? onShowOffline : undefined}
          description={
            errored > 0 ? (
              <span className="text-destructive">
                {errored} with errors{offline > 0 && onShowOffline ? " — view" : ""}
              </span>
            ) : offline > 0 ? (
              <span className="text-muted-foreground">
                {offline} offline{onShowOffline ? " — view" : ""}
              </span>
            ) : undefined
          }
        />
      </div>
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={Activity}
          value={totalSessions}
          label="Active Sessions"
          // Drill down to the busiest bots by sorting the grid on live session
          // count — the same close-the-loop affordance as the other KPIs.
          onClick={totalSessions > 0 ? onShowBusiest : undefined}
          description={
            totalSessions > 0 && onShowBusiest ? (
              <span className="text-muted-foreground">busiest first — view</span>
            ) : undefined
          }
        />
      </div>
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={Radio}
          // Show a real "0" (red) for an all-dead fleet \u2014 only an unscored fleet
          // (metrics loop not caught up) reads "\u2014". Color-code by grade so the
          // fleet health reads red/orange/green at a glance, consistent with the
          // per-bot health badges.
          value={hasHealth ? `${avgHealth} (${healthGradeLetter(avgHealth)})` : "\u2014"}
          valueClassName={hasHealth ? healthScoreTextColor(avgHealth) : undefined}
          label="Avg Health Score"
          // When bots are degraded, make the card a drill-down: clicking filters
          // the grid to the degraded bots (reuses the "degraded" search from #272),
          // the same close-the-loop affordance as the ChannelHealthBanner.
          onClick={degradedCount > 0 ? onShowDegraded : undefined}
          description={
            degradedCount > 0 ? (
              <span className="text-orange-600 dark:text-orange-400">
                {degradedCount} degraded{onShowDegraded ? " \u2014 view" : ""}
              </span>
            ) : undefined
          }
        />
      </div>
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={DollarSign}
          // FleetKpiRow only renders when bots exist (the page returns an empty
          // state earlier), and monthCostUsd is always a real number, so $0.00
          // honestly means "no spend yet" \u2014 don't show "\u2014 / Connect bots to track"
          // (misleading: the bots ARE connected). Same "genuine zero vs no data"
          // distinction as the Avg Health Score KPI.
          value={`$${totalMonthCost.toFixed(2)}`}
          label="Month Spend"
          // Drill down to the full cost breakdown (by bot, provider, channel,
          // budgets) — the KPI was a dead static number.
          to="/costs"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert Banner (compact, shown at top when alerts are firing)
// ---------------------------------------------------------------------------

function AlertBanner({ alerts }: { alerts: FleetAlert[] }) {
  const firing = alerts.filter((a) => a.state === "firing");
  if (firing.length === 0) return null;

  const critical = firing.filter((a) => a.severity === "critical").length;
  const warnings = firing.filter((a) => a.severity === "warning").length;

  // The banner is the fleet's most prominent alert signal — make it actionable
  // by linking to the Alerts page where alerts can be acknowledged/resolved.
  return (
    <Link
      to="/alerts"
      className="group flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 no-underline text-inherit transition-colors hover:bg-amber-100/60 dark:hover:bg-amber-950/40"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <p className="text-sm">
        <span className="font-medium">{firing.length} active alert{firing.length !== 1 ? "s" : ""}</span>
        {critical > 0 && (
          <span className="ml-2 text-red-600 dark:text-red-400 font-medium">
            {critical} critical
          </span>
        )}
        {warnings > 0 && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            {warnings} warning{warnings !== 1 ? "s" : ""}
          </span>
        )}
      </p>
      <ChevronRight className="ml-auto h-4 w-4 text-amber-600/60 dark:text-amber-400/60 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Channel Health Banner — fleet-level "are we reaching customers?" roll-up.
// A bot connected to its gateway but with customer channels (LINE/WhatsApp/…)
// down is invisible in the KPIs (it still counts as "online"). This surfaces the
// per-bot channel signal at the fleet level and, when clicked, filters the grid
// to the affected bots so an operator can act on it directly.
// ---------------------------------------------------------------------------

function ChannelHealthBanner({
  fullyDown,
  partiallyDown,
  active,
  onToggle,
}: {
  fullyDown: number;
  partiallyDown: number;
  active: boolean;
  onToggle: () => void;
}) {
  const total = fullyDown + partiallyDown;
  if (total === 0) return null;

  // Fully-down bots (0 channels connected) are the most severe — they reach no
  // customers at all — so the banner reads red when any exist, else amber.
  const severe = fullyDown > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
        severe
          ? "border-red-500/30 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/60 dark:hover:bg-red-950/40"
          : "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/40",
        active && "ring-1 ring-inset " + (severe ? "ring-red-500/50" : "ring-amber-500/50"),
      )}
    >
      <Radio
        className={cn(
          "h-4 w-4 shrink-0",
          severe ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
        )}
      />
      <p>
        <span className="font-medium">
          {total} bot{total !== 1 ? "s" : ""} with customer channels down
        </span>
        {fullyDown > 0 && (
          <span className="ml-2 text-red-600 dark:text-red-400 font-medium">
            {fullyDown} unreachable
          </span>
        )}
        {partiallyDown > 0 && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            {partiallyDown} partially down
          </span>
        )}
      </p>
      <span className="ml-auto text-xs text-muted-foreground shrink-0">
        {active ? "Show all bots" : "Show affected →"}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Alert List
// ---------------------------------------------------------------------------

function AlertList({ alerts }: { alerts: FleetAlert[] }) {
  // Show only what still needs attention (firing + acknowledged), not resolved
  // history — the dashboard list is a to-do surface, not an audit log. Each row
  // links to the offending bot's detail page so an operator can investigate.
  // Sort firing-before-acknowledged then newest-first so a firing (esp.
  // critical) alert is never buried out of the top-5 by more-recently-
  // acknowledged ones — the server returns all states newest-first, so without
  // this a burst of acks could hide an older firing alert. Matches the Bot
  // Detail Active Alerts ordering (#273).
  const active = alerts
    .filter((a) => a.state === "firing" || a.state === "acknowledged")
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === "firing" ? -1 : 1;
      // NaN-safe so a malformed firedAt can't make the order non-deterministic.
      return toTimestamp(b.firedAt) - toTimestamp(a.firedAt);
    });
  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Active Alerts</h3>
        <Link
          to="/alerts"
          className="text-xs font-medium text-primary hover:underline no-underline"
        >
          View all →
        </Link>
      </div>
      <div className="space-y-1.5">
        {active.slice(0, 5).map((alert) => (
          <Link
            key={alert.id}
            to={`/bots/${alert.botId}`}
            className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm no-underline text-inherit transition-colors hover:bg-accent"
          >
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0",
                alertSeverityBadge[alert.severity] ?? alertSeverityBadgeDefault,
              )}
            >
              {alert.severity}
            </span>
            {alert.state === "acknowledged" && (
              <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground shrink-0">
                ack
              </span>
            )}
            <span className="shrink-0">{alert.botEmoji}</span>
            <span className="font-medium truncate shrink-0 max-w-[8rem]">{alert.botName}</span>
            <span className="truncate text-muted-foreground">{alert.message}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {timeAgo(alert.firedAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bot Grid — supports grouping via FilterBar
// ---------------------------------------------------------------------------

function BotGrid({
  groups,
  onClear,
  alertsByBot,
}: {
  groups: Map<string, BotStatus[]>;
  onClear?: () => void;
  alertsByBot?: Map<string, number>;
}) {
  // A search/tag filter that matches nothing yields groups whose only entry is
  // empty. Render an explicit "no matches" state instead of a blank area so the
  // operator knows the fleet has bots — just none match the current filters.
  const total = Array.from(groups.values()).reduce((n, list) => n + list.length, 0);
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed py-10 text-center">
        <Search className="mx-auto h-6 w-6 text-muted-foreground/60" />
        <p className="mt-2 text-sm text-muted-foreground">
          No bots match your filters.
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([groupName, bots]) => (
        <div key={groupName}>
          {groups.size > 1 && (
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              {groupName} ({bots.length})
            </h4>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots.map((bot) => (
              <BotStatusCard
                key={bot.botId}
                bot={bot}
                alertCount={alertsByBot?.get(bot.botId) ?? 0}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function FleetDashboard() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openOnboarding } = useDialog();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  // Bulk "reconnect all offline" — after a partial launch (some gateways
  // unreachable during the best-effort connect) or a fleet-wide monitor
  // restart, bots show as offline and previously had to be reconnected one at a
  // time from each bot's detail page. This drives them all back online in one
  // click.
  const [reconnecting, setReconnecting] = useState(false);

  // Filter/sort/group state
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  // Default to attention-first so the demo dashboard surfaces the bots that need
  // an operator's eyes (alerting + degraded + low-health) at the top of the grid.
  const [sortBy, setSortBy] = useState<SortKey>("attention");
  const [searchQuery, setSearchQuery] = useState("");
  // When true, the grid shows only bots with customer channels down (toggled by
  // the ChannelHealthBanner).
  const [channelIssuesOnly, setChannelIssuesOnly] = useState(false);

  const {
    data: fleet,
    isLoading: fleetLoading,
    error: fleetError,
  } = useFleetStatus();

  // DB agents fallback: load agents from database so bots show even if fleet-monitor is offline
  const { data: dbAgents, isLoading: dbAgentsLoading, error: dbAgentsError } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: alerts } = useFleetAlerts();
  const { data: tagsData } = useFleetTags();
  const tags: BotTag[] = tagsData?.tags ?? [];

  useEffect(() => {
    setBreadcrumbs([{ label: "Fleet Dashboard" }]);
  }, [setBreadcrumbs]);

  const handleToggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  // Merge fleet-monitor bots with DB agents as fallback
  // NOTE: all hooks must be above early returns (Rules of Hooks)
  const isFleetMonitorOffline = !fleetLoading && (fleetError || !fleet?.bots?.length);
  const usingDbFallback = isFleetMonitorOffline && !!dbAgents?.length;

  const bots = useMemo(() => {
    if (!selectedCompanyId) return [];
    const fleetBots = fleet?.bots ?? [];
    if (fleetBots.length === 0) {
      // Fleet-monitor offline (or tracking no bots): fall back to DB agents
      // (openclaw_gateway type) as-is — the offline banner explains their status.
      if (!dbAgents) return [];
      return dbAgents
        .filter((a) => a.adapterType === "openclaw_gateway")
        .map(agentToBotStatus);
    }
    // Fleet-monitor is live. Merge in any DB agents it ISN'T tracking — e.g. a
    // bot the onboarding Launch flow created but whose gateway was unreachable
    // during the best-effort connect. Without this a partially-connected fleet
    // silently hides the un-connected bots (the live list short-circuited the
    // DB fallback). They're genuinely not live, so render them as dormant rather
    // than with their stale DB "active"→"monitoring" status.
    const fleetIds = new Set(fleetBots.map((b) => b.botId));
    const dbOnly = (dbAgents ?? [])
      .filter((a) => a.adapterType === "openclaw_gateway" && !fleetIds.has(a.id))
      .map((a) => ({ ...agentToBotStatus(a), connectionState: "dormant" as const }));
    return [...fleetBots, ...dbOnly];
  }, [fleet, dbAgents, selectedCompanyId]);

  const activeAlerts = alerts ?? [];

  // Count firing alerts per bot so the grid can flag which bots are alerting AND
  // the "attention" sort can surface them at the top — otherwise an alerting bot
  // is indistinguishable from a healthy one in the grid. Computed before
  // useFilteredBots so the attention sort can consume it.
  const alertsByBot = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activeAlerts) {
      if (a.state === "firing") m.set(a.botId, (m.get(a.botId) ?? 0) + 1);
    }
    return m;
  }, [activeAlerts]);

  const filteredBots = useFilteredBots(bots, tags, activeTags, searchQuery, sortBy, alertsByBot);

  // Fleet-level channel-connectivity roll-up. Computed from the whole fleet
  // (not the filtered subset) so the banner reflects the true count regardless
  // of the active grid filters. Live-only: DB-fallback bots report null counts,
  // so botChannelsDown is false and the banner stays hidden offline.
  const channelStats = useMemo(() => {
    let fullyDown = 0;
    let partiallyDown = 0;
    for (const b of bots) {
      if (botChannelsDown(b)) {
        if (b.channelsConnected === 0) fullyDown += 1;
        else partiallyDown += 1;
      }
    }
    return { fullyDown, partiallyDown };
  }, [bots]);

  // Auto-clear the channel filter when nothing is affected (e.g. channels
  // recovered) so the grid doesn't get stuck showing an empty "affected" view.
  const hasChannelIssues = channelStats.fullyDown + channelStats.partiallyDown > 0;
  // Reset the toggle state too — otherwise it lingers true after issues clear,
  // and if a *different* bot's channels later go down the grid would silently
  // re-filter to the affected subset without the operator re-clicking the banner.
  useEffect(() => {
    if (!hasChannelIssues) setChannelIssuesOnly(false);
  }, [hasChannelIssues]);
  const displayBots = useMemo(
    () =>
      channelIssuesOnly && hasChannelIssues
        ? filteredBots.filter(botChannelsDown)
        : filteredBots,
    [filteredBots, channelIssuesOnly, hasChannelIssues],
  );
  const groupedBots = useGroupedBots(displayBots, tags, groupBy);

  // Offline bots that carry a stored gateway URL can be reconnected in bulk.
  // (A bot with no gatewayUrl — e.g. a manually-added agent — can't be
  // reconnected without one, so it's excluded from the bulk action.)
  const reconnectableBots = useMemo(
    () =>
      bots.filter(
        (b) => getDisplayStatus(b.connectionState) === "offline" && !!b.gatewayUrl,
      ),
    [bots],
  );

  async function handleReconnectAll() {
    if (!selectedCompanyId || reconnectableBots.length === 0 || reconnecting) return;
    setReconnecting(true);
    try {
      const results = await Promise.allSettled(
        reconnectableBots.map((b) =>
          fleetMonitorApi.connect({
            botId: b.botId,
            agentId: b.botId,
            gatewayUrl: b.gatewayUrl,
            // The connect token isn't persisted (it's a transient handshake
            // bearer); a device-auth gateway reconnects without it, a
            // token-gated one must be reconnected individually with its token
            // from the bot's detail page.
            token: "",
            companyId: selectedCompanyId,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const total = reconnectableBots.length;
      // Refetch once after the whole batch rather than per-bot, so the grid
      // flips the reconnected bots to live without N intermediate refetches.
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
      if (ok === total) {
        pushToast({
          title: `Reconnected ${total} bot${total !== 1 ? "s" : ""}`,
          tone: "success",
        });
      } else {
        pushToast({
          title: `Reconnected ${ok} of ${total} bots`,
          body: `${total - ok} still offline — the gateway may be unreachable, or needs a token (reconnect it from its detail page).`,
          tone: "warn",
          ttlMs: 8000,
        });
      }
    } finally {
      setReconnecting(false);
    }
  }

  // Early returns (after all hooks)
  if (!selectedCompanyId) {
    return <EmptyState icon={Radio} message="Select a fleet to view its dashboard." />;
  }

  if (fleetLoading && !dbAgents) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!fleetLoading && dbAgentsLoading && !fleet?.bots?.length) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (bots.length === 0) {
    // Distinguish between "no bots exist" and "fleet-monitor error with no DB fallback"
    if (fleetError && !dbAgents?.length && dbAgentsError) {
      return (
        <div className="space-y-4 p-1">
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 px-4 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-red-700 dark:text-red-300">
              Failed to load bots — both fleet monitor and database are unreachable.
            </span>
          </div>
          <EmptyState
            icon={WifiOff}
            message="Check that your Fleet server and database are running."
            action="Retry"
            onAction={() => window.location.reload()}
          />
        </div>
      );
    }
    if (fleetError && !dbAgents?.length) {
      return (
        <div className="space-y-4 p-1">
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 px-4 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-red-700 dark:text-red-300">
              Failed to reach fleet monitor{fleetError instanceof Error ? `: ${fleetError.message}` : ""}. Check that the fleet-monitor service is running.
            </span>
          </div>
          <EmptyState
            icon={WifiOff}
            message="Connect a bot to get started, or check your fleet-monitor service."
            action="Connect Bot"
            onAction={() => navigate("/dashboard/connect")}
          />
        </div>
      );
    }
    // A fleet with no bots is the primary Phase-1 entry point. Offer BOTH the
    // full onboarding wizard (build the org chart + connect several bots at once,
    // into THIS company via initialStep 2) and the single-bot connect path — the
    // shared EmptyState only supports one action, so render a dual-action block.
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="bg-muted/50 p-4 mb-4">
          <Rocket className="h-10 w-10 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground mb-1">No bots connected yet.</p>
        <p className="text-xs text-muted-foreground/70 mb-4 max-w-sm">
          Launch a fleet to build your org chart and connect several bots at once,
          or add a single bot.
        </p>
        <div className="flex items-center gap-2">
          <Button
            onClick={() =>
              openOnboarding({ initialStep: 2, companyId: selectedCompanyId })
            }
          >
            <Rocket className="h-4 w-4 mr-1.5" />
            Launch a Fleet
          </Button>
          <button
            type="button"
            onClick={() => navigate("/dashboard/connect")}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Plus className="h-4 w-4" />
            Connect a single bot
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Alert banner */}
      <AlertBanner alerts={activeAlerts} />

      {/* Customer-channel health — surfaces bots that aren't reaching customers.
          Clicking filters the grid to the affected bots. */}
      <ChannelHealthBanner
        fullyDown={channelStats.fullyDown}
        partiallyDown={channelStats.partiallyDown}
        active={channelIssuesOnly}
        onToggle={() => setChannelIssuesOnly((v) => !v)}
      />

      {/* DB-fallback indicator. Distinguish a genuinely unreachable fleet monitor
          (fleetError) from a monitor that's up but reporting no live bots — the
          latter isn't "offline", the bots just aren't connected (matches the
          accurate wording used on the BotDetail page). */}
      {usingDbFallback && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 text-sm">
          <WifiOff className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-blue-700 dark:text-blue-300">
            {fleetError
              ? `Fleet monitor unreachable — showing saved bot data. Live health, sessions, and cost metrics are unavailable.${fleetError instanceof Error && fleetError.message ? ` (${fleetError.message})` : ""}`
              : "Showing saved bot data — these bots aren't connected to the live fleet monitor. Live health, sessions, and cost metrics are unavailable."}
          </span>
        </div>
      )}

      {/* Intelligence recommendations */}
      <IntelligenceWidget companyId={selectedCompanyId} />

      {/* KPI summary */}
      <FleetKpiRow
        bots={bots}
        onShowDegraded={() => setSearchQuery("degraded")}
        onShowOffline={() => setSearchQuery("offline")}
        onShowBusiest={() => setSortBy("sessions")}
      />

      {/* Budget widget */}
      <BudgetWidget companyId={selectedCompanyId} />

      {/* Fleet health heatmap */}
      <div className="rounded-xl border border-border bg-card p-4">
        <FleetHeatmap companyId={selectedCompanyId} />
      </div>

      {/* Filter bar — always shown so search + sort work even on a tagless
          (freshly onboarded) fleet. FilterBar hides the tag chips + tag-based
          grouping internally when there are no tags. */}
      <FilterBar
        tags={tags}
        activeTags={activeTags}
        onToggleTag={handleToggleTag}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Bot grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Bots ({displayBots.length}{displayBots.length !== bots.length ? ` of ${bots.length}` : ""})
          </h2>
          <div className="flex items-center gap-2">
            {/* Bulk-reconnect the offline bots (partial launch / monitor
                restart) instead of visiting each bot's detail page. */}
            {reconnectableBots.length > 0 && (
              <button
                type="button"
                onClick={handleReconnectAll}
                disabled={reconnecting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title={`Reconnect ${reconnectableBots.length} offline bot${reconnectableBots.length !== 1 ? "s" : ""}`}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", reconnecting && "animate-spin")} />
                {reconnecting
                  ? "Reconnecting…"
                  : `Reconnect Offline (${reconnectableBots.length})`}
              </button>
            )}
            {/* Grow the fleet via the org-chart onboarding flow (into this
                company), not just add one bot — keeps the multi-bot Launch path
                reachable from a populated dashboard. */}
            <button
              type="button"
              onClick={() =>
                openOnboarding({ initialStep: 2, companyId: selectedCompanyId })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              <Rocket className="h-3.5 w-3.5" />
              Launch Fleet
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard/connect")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Connect Bot
            </button>
          </div>
        </div>
        <BotGrid
          groups={groupedBots}
          alertsByBot={alertsByBot}
          onClear={
            searchQuery || activeTags.length > 0 || channelIssuesOnly
              ? () => {
                  setSearchQuery("");
                  setActiveTags([]);
                  setChannelIssuesOnly(false);
                }
              : undefined
          }
        />
      </div>

      {/* Alerts */}
      <AlertList alerts={activeAlerts} />
    </div>
  );
}
