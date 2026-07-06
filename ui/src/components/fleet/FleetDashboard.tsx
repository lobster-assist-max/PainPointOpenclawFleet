/**
 * FleetDashboard — the main overview page for a Fleet.
 *
 * Shows: KPI summary cards, bot grid sorted by health (attention-first),
 * active alerts panel, and a recent-activity feed backed by the fleet audit log.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  Rocket,
  RefreshCw,
  History,
  Ban,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFleetStatus, useFleetAlerts, useFleetTags, useFleetAudit, useReconnectBot } from "@/hooks/useFleetMonitor";
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
import { BotStatusRow } from "./BotStatusRow";
import { FilterBar, useFilteredBots, useGroupedBots, type SortKey, type GroupKey, type ViewMode } from "./FilterBar";
import { IntelligenceWidget } from "./IntelligenceWidget";
import { BudgetWidget } from "./BudgetWidget";
import { FleetHeatmap } from "./FleetHeatmap";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { agentToBotStatus } from "@/lib/agent-to-bot-status";
import { healthGradeLetter, healthScoreTextColor, botChannelsDown, botIsDegraded, getDisplayStatus, describeAuditAction, describeAuditDetail } from "@/lib/bot-display-helpers";
import {
  loadDashboardSort,
  saveDashboardSort,
  loadDashboardGroup,
  saveDashboardGroup,
  loadDashboardView,
  saveDashboardView,
} from "@/lib/dashboard-prefs";
import { timeAgo, toTimestamp } from "@/lib/timeAgo";
import type { BotStatus, FleetAlert, BotTag } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Live status indicator
// ---------------------------------------------------------------------------

/**
 * A live-freshness pill for the fleet dashboard. The status query polls every
 * 10s silently, so without this an operator watching a live demo has no signal
 * that the data is fresh (or, worse, has gone stale). Shows a pulsing green dot
 * + relative "updated Ns ago" when the fleet monitor is live; a muted dot +
 * "saved data" when falling back to the DB. Ticks every 5s so the relative time
 * stays current between polls — a stalled monitor visibly ages from "just now"
 * to "1m ago", "2m ago", …
 */
function FleetLiveIndicator({
  updatedAt,
  isFetching,
  offline,
}: {
  updatedAt: number;
  isFetching: boolean;
  offline: boolean;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  if (offline) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        title="Live fleet monitor is unreachable — showing saved bot data"
      >
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        Offline · saved data
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title="Live fleet monitor — auto-refreshes every 10s"
    >
      <span className="relative flex h-2 w-2">
        {isFetching && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live · updated {updatedAt ? timeAgo(new Date(updatedAt)) : "just now"}
    </span>
  );
}

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

function AlertBanner({ alerts, onFilterAlerting }: { alerts: FleetAlert[]; onFilterAlerting: () => void }) {
  const firing = alerts.filter((a) => a.state === "firing");
  if (firing.length === 0) return null;

  const critical = firing.filter((a) => a.severity === "critical").length;
  const warnings = firing.filter((a) => a.severity === "warning").length;

  // The banner is the fleet's most prominent alert signal — make it doubly
  // actionable: the body filters the grid to the alerting bots (the natural
  // in-page drill-down, consistent with the ChannelHealthBanner below it), and a
  // "Manage →" link opens the Alerts page to acknowledge/resolve them.
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <button
        type="button"
        onClick={onFilterAlerting}
        title="Show alerting bots on the grid"
        className="flex-1 text-left text-sm transition-colors hover:opacity-80"
      >
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
        <span className="ml-2 text-xs text-amber-600/70 dark:text-amber-400/70">— show on grid</span>
      </button>
      <Link
        to="/alerts"
        className="ml-auto inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 no-underline transition-colors hover:bg-amber-100/60 dark:hover:bg-amber-950/40 shrink-0"
      >
        Manage
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
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
        {/* Show the total count so the operator knows there are more than the
            5 rows rendered below (the list caps at 5 to stay compact). */}
        <h3 className="text-sm font-medium text-muted-foreground">
          Active Alerts ({active.length})
        </h3>
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
// Recent Activity — the audit-log feed the dashboard doc has always promised
// but never rendered. Every fleet write (connect/disconnect, tags, budgets,
// workshop edits, avatar changes) is audited, so this surfaces what's happening
// across the fleet at a glance and links through to the full audit log.
// ---------------------------------------------------------------------------

function RecentActivity({
  botNames,
}: {
  botNames?: Map<string, { emoji: string; name: string }>;
}) {
  const { data: entries, isError } = useFleetAudit(8);
  // Only render when there's something to show — a fresh fleet with no logged
  // operations shouldn't display an empty box (and errors stay silent here: the
  // feed is a secondary surface, not the primary alert path).
  if (isError || !entries || entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Recent Activity</h3>
        <Link
          to="/dashboard/audit-log"
          className="text-xs font-medium text-primary hover:underline no-underline"
        >
          View all →
        </Link>
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
        {entries.map((entry) => {
          const isBot = entry.targetType === "bot" && !!entry.targetId;
          // Resolve a bot target's UUID to its "emoji name" (like everywhere
          // else in the fleet UI) so the feed reads "Connected bot · 🦞 小龍蝦"
          // instead of the uninformative bare word "bot". Falls back to "bot"
          // when the target isn't in the current fleet (disconnected/removed).
          const botInfo = isBot ? botNames?.get(entry.targetId!) : undefined;
          // A failed/denied fleet operation must be visible beyond color alone
          // (accessibility + easy to miss): use a result-aware leading icon and
          // an explicit text tag, not just a text-color shift.
          const isError = entry.result === "error";
          const isDenied = entry.result === "denied";
          const LeadIcon = isError ? AlertTriangle : isDenied ? Ban : History;
          // The concrete specific of the operation (tag label, edited file,
          // memory name, budget limit) — makes "Added tag" read "Added tag ·
          // production", matching the per-bot Activity trail on Bot Detail.
          const detail = describeAuditDetail(entry.action, entry.details);
          const row = (
            <>
              <LeadIcon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  isError
                    ? "text-red-600 dark:text-red-400"
                    : isDenied
                      ? "text-muted-foreground/60"
                      : "text-muted-foreground/50",
                )}
              />
              <span
                className={cn(
                  "font-medium shrink-0",
                  isError
                    ? "text-red-600 dark:text-red-400"
                    : isDenied
                      ? "text-muted-foreground/60"
                      : "text-foreground",
                )}
              >
                {describeAuditAction(entry.action)}
              </span>
              {(isError || isDenied) && (
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase shrink-0",
                    isError
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : "border text-muted-foreground",
                  )}
                >
                  {isError ? "failed" : "denied"}
                </span>
              )}
              {entry.targetId && (
                <span className="truncate text-muted-foreground min-w-0">
                  {isBot
                    ? botInfo
                      ? `${botInfo.emoji ? `${botInfo.emoji} ` : ""}${botInfo.name}`
                      : "bot"
                    : `${entry.targetType}: ${entry.targetId}`}
                  {detail && (
                    <span className="text-muted-foreground/70"> · {detail}</span>
                  )}
                </span>
              )}
              <span className="ml-auto flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                <span className="hidden sm:inline">{entry.userRole || entry.userId}</span>
                {timeAgo(entry.createdAt)}
              </span>
            </>
          );
          return isBot ? (
            <Link
              key={entry.id}
              to={`/bots/${entry.targetId}`}
              className="flex items-center gap-2 px-3 py-2 text-sm no-underline text-inherit transition-colors hover:bg-accent first:rounded-t-xl last:rounded-b-xl"
            >
              {row}
            </Link>
          ) : (
            <div key={entry.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bot Grid — supports grouping via FilterBar
// ---------------------------------------------------------------------------

function BotGrid({
  groups,
  viewMode = "grid",
  onClear,
  alertsByBot,
  onReconnect,
  reconnectingBotId,
}: {
  groups: Map<string, BotStatus[]>;
  /** "grid" renders cards; "list" renders dense rows for scanning a large fleet. */
  viewMode?: ViewMode;
  onClear?: () => void;
  alertsByBot?: Map<string, number>;
  /** Per-card quick reconnect for an offline bot (threaded to BotStatusCard). */
  onReconnect?: (bot: BotStatus) => void;
  reconnectingBotId?: string | null;
}) {
  // Per-group collapse state (only meaningful when grouped). Lets an operator
  // fold away a group they don't care about right now (e.g. collapse "Offline"
  // to focus on the live bots) on a large fleet. Session-scoped — resets on
  // navigation, which is the right lifetime for a transient view operation.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const grouped = groups.size > 1;
  const toggleGroup = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

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

  // Bulk collapse/expand — on a large fleet grouped by status/role/tag an
  // operator often wants to fold every group at once to scan just the headers
  // (each carries an online count + attention badge), then unfold the one they
  // care about. Per-group toggles alone make that N clicks; this makes it one.
  const groupNames = Array.from(groups.keys());
  const allCollapsed =
    grouped && groupNames.length > 0 && groupNames.every((n) => collapsed.has(n));
  const toggleAll = () =>
    setCollapsed(() => (allCollapsed ? new Set() : new Set(groupNames)));

  return (
    <div className="space-y-4">
      {grouped && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {allCollapsed ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        </div>
      )}
      {Array.from(groups.entries()).map(([groupName, bots]) => {
        const isCollapsed = grouped && collapsed.has(groupName);
        // Bots in this group that need eyes — alerting (firing alert) or
        // degraded (channels down / low health). Surfaced on the header so a
        // collapsed group can't silently hide a problem.
        const attention = bots.filter(
          (b) => (alertsByBot?.get(b.botId) ?? 0) > 0 || botIsDegraded(b),
        ).length;
        // Online count within the group — lets an operator gauge each group's
        // live availability at a glance (e.g. "Engineering — 2 of 5 online")
        // without expanding it. Only shown when some bots in the group are
        // offline, so an all-online group header stays clean.
        const onlineInGroup = bots.filter(
          (b) => getDisplayStatus(b.connectionState) === "online",
        ).length;
        return (
          <div key={groupName}>
            {grouped && (
              // Clickable group header — folds/unfolds this group's cards.
              <button
                type="button"
                onClick={() => toggleGroup(groupName)}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {groupName} ({bots.length})
                {onlineInGroup < bots.length && (
                  <span className="normal-case tracking-normal text-muted-foreground/70">
                    · {onlineInGroup} online
                  </span>
                )}
                {attention > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 normal-case tracking-normal">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {attention}
                  </span>
                )}
              </button>
            )}
            {!isCollapsed &&
              (viewMode === "list" ? (
                <div className="space-y-1.5">
                  {bots.map((bot) => (
                    <BotStatusRow
                      key={bot.botId}
                      bot={bot}
                      alertCount={alertsByBot?.get(bot.botId) ?? 0}
                      onReconnect={onReconnect}
                      reconnecting={reconnectingBotId === bot.botId}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bots.map((bot) => (
                    <BotStatusCard
                      key={bot.botId}
                      bot={bot}
                      alertCount={alertsByBot?.get(bot.botId) ?? 0}
                      onReconnect={onReconnect}
                      reconnecting={reconnectingBotId === bot.botId}
                    />
                  ))}
                </div>
              ))}
          </div>
        );
      })}
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
  // Per-card quick reconnect for a single offline bot — the grid complement to
  // the bulk "Reconnect Offline" button. The hook already invalidates
  // status/agents/alerts/audit on success, so the reconnected card flips to live.
  const reconnectOne = useReconnectBot();
  const reconnectingBotId = reconnectOne.isPending
    ? (reconnectOne.variables?.botId ?? null)
    : null;
  const handleReconnectOne = (bot: BotStatus) => {
    if (!bot.gatewayUrl || reconnectOne.isPending) return;
    reconnectOne.mutate(
      { botId: bot.botId, gatewayUrl: bot.gatewayUrl },
      {
        onSuccess: () =>
          pushToast({
            title: `Reconnected ${bot.name}`,
            tone: "success",
          }),
        onError: (err) =>
          pushToast({
            title: `Couldn't reconnect ${bot.name}`,
            body:
              err instanceof Error && err.message
                ? err.message
                : "The gateway may be unreachable, or needs a token — reconnect from the bot's detail page.",
            tone: "warn",
            ttlMs: 8000,
          }),
      },
    );
  };

  // Filter/sort/group state
  const [activeTags, setActiveTags] = useState<string[]>([]);
  // Restore the operator's last explicit group-by choice (persisted to
  // localStorage), falling back to "none" — so a page reload doesn't reset the
  // grouping. Validated against the known keys in dashboard-prefs.
  const [groupBy, setGroupBy] = useState<GroupKey>(() => loadDashboardGroup() ?? "none");
  // Default to attention-first so the demo dashboard surfaces the bots that need
  // an operator's eyes (alerting + degraded + low-health) at the top of the grid,
  // unless the operator has previously chosen a sort (restored from localStorage).
  const [sortBy, setSortBy] = useState<SortKey>(() => loadDashboardSort() ?? "attention");
  // Grid (card) vs list (dense row) rendering, persisted so a page reload keeps
  // the operator's choice. Grid is the default.
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadDashboardView() ?? "grid");
  const [searchQuery, setSearchQuery] = useState("");

  // Press "/" anywhere on the dashboard to jump to the bot search (a common
  // dashboard affordance) — unless the operator is already typing in a field.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Persist the operator's *explicit* sort/group choices (not the transient KPI
  // drill-downs, which call setSortBy directly) so they survive a reload.
  const handleSortByChange = (key: SortKey) => {
    setSortBy(key);
    saveDashboardSort(key);
  };
  const handleGroupByChange = (key: GroupKey) => {
    setGroupBy(key);
    saveDashboardGroup(key);
  };
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    saveDashboardView(mode);
  };
  // When true, the grid shows only bots with customer channels down (toggled by
  // the ChannelHealthBanner).
  const [channelIssuesOnly, setChannelIssuesOnly] = useState(false);

  const {
    data: fleet,
    isLoading: fleetLoading,
    error: fleetError,
    isFetching: fleetFetching,
    dataUpdatedAt: fleetUpdatedAt,
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

  // botId → "emoji name" lookup so the Recent Activity feed can render bot
  // audit targets by name instead of the bare word "bot".
  const botNames = useMemo(() => {
    const m = new Map<string, { emoji: string; name: string }>();
    for (const b of bots) m.set(b.botId, { emoji: b.emoji, name: b.name });
    return m;
  }, [bots]);

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

  // Any filter active (typed search, tag chips, or the channel-issues toggle).
  // Drives the header "Clear filters" button + the empty-grid clear affordance.
  const filtersActive = !!searchQuery || activeTags.length > 0 || channelIssuesOnly;
  const clearFilters = () => {
    setSearchQuery("");
    setActiveTags([]);
    setChannelIssuesOnly(false);
  };
  // A KPI/banner drill-down should show EXACTLY its intended set — clear any
  // active tag filter + channel toggle first, otherwise the intersection with a
  // lingering filter could surface an empty or unexpected grid.
  const drillToSearch = (query: string) => {
    setActiveTags([]);
    setChannelIssuesOnly(false);
    setSearchQuery(query);
  };
  // A "sort" drill-down (e.g. the Active Sessions KPI → busiest-first) should
  // show the WHOLE fleet in the new order — clear any active search/tag/channel
  // filter first, otherwise "busiest first" would sort only the current filtered
  // subset (e.g. the degraded bots), which isn't the intended drill-down.
  // Mirrors drillToSearch clearing filters for filter drill-downs.
  const drillToSort = (sort: SortKey) => {
    setSearchQuery("");
    setActiveTags([]);
    setChannelIssuesOnly(false);
    setSortBy(sort);
  };
  // The channel-health "Show affected" drill-down is symmetric with the search
  // drill-downs: when turning it ON, clear any active search/tags so the grid
  // shows exactly the channel-down bots (not the intersection with a lingering
  // "degraded"/tag filter) — mirroring how drillToSearch clears this toggle.
  const toggleChannelIssues = () => {
    setChannelIssuesOnly((v) => {
      if (!v) {
        setSearchQuery("");
        setActiveTags([]);
      }
      return !v;
    });
  };

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
      // Each reconnect is an audited fleet write and changes connection state
      // (which drives alerts), so refresh those feeds too — consistent with the
      // per-bot connect/reconnect mutations.
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alertsAll(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: ["fleet", "audit"] });
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
      <AlertBanner alerts={activeAlerts} onFilterAlerting={() => drillToSearch("alerting")} />

      {/* Customer-channel health — surfaces bots that aren't reaching customers.
          Clicking filters the grid to the affected bots. */}
      <ChannelHealthBanner
        fullyDown={channelStats.fullyDown}
        partiallyDown={channelStats.partiallyDown}
        active={channelIssuesOnly}
        onToggle={toggleChannelIssues}
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
        onShowDegraded={() => drillToSearch("degraded")}
        onShowOffline={() => drillToSearch("offline")}
        onShowBusiest={() => drillToSort("sessions")}
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
        onGroupByChange={handleGroupByChange}
        sortBy={sortBy}
        onSortByChange={handleSortByChange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
      />

      {/* Bot grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Bots ({displayBots.length}{displayBots.length !== bots.length ? ` of ${bots.length}` : ""})
            </h2>
            {/* Clear-all-filters — reachable even when the filtered grid is
                non-empty (the empty-state "Clear filters" only shows at 0 matches),
                so an operator who drilled down via a KPI/banner or typed a search
                can return to the full grid in one click. */}
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Clear all active filters"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
            <FleetLiveIndicator
              updatedAt={fleetUpdatedAt}
              isFetching={fleetFetching}
              offline={usingDbFallback}
            />
          </div>
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
          viewMode={viewMode}
          alertsByBot={alertsByBot}
          onClear={filtersActive ? clearFilters : undefined}
          onReconnect={handleReconnectOne}
          reconnectingBotId={reconnectingBotId}
        />
      </div>

      {/* Alerts */}
      <AlertList alerts={activeAlerts} />

      {/* Recent activity — audit-log feed of fleet operations */}
      <RecentActivity botNames={botNames} />
    </div>
  );
}
