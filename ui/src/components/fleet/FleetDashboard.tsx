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
  Download,
  Tag,
  CheckSquare,
  Star,
  Gauge,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFleetStatus, useFleetAlerts, useFleetTags, useFleetAudit, useReconnectBot, useAddTag } from "@/hooks/useFleetMonitor";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import { useToast } from "@/context/ToastContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { Button } from "@/components/ui/button";
import { useNavigate, Link, useSearchParams } from "@/lib/router";
import { cn } from "@/lib/utils";
import { alertSeverityBadge, alertSeverityBadgeDefault } from "@/lib/status-colors";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { BotStatusCard } from "./BotStatusCard";
import { BotStatusRow } from "./BotStatusRow";
import { FilterBar, useFilteredBots, useGroupedBots, type SortKey, type GroupKey, type ViewMode, type SortDir } from "./FilterBar";
import { IntelligenceWidget } from "./IntelligenceWidget";
import { BudgetWidget } from "./BudgetWidget";
import { FleetHeatmap } from "./FleetHeatmap";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { agentToBotStatus } from "@/lib/agent-to-bot-status";
import { healthGradeLetter, healthScoreTextColor, healthScoreBarColor, healthBadgeClasses, botChannelsDown, botIsDegraded, botNeedsAttention, botOverBudget, contextPercent, getDisplayStatus, describeAuditAction, describeAuditDetail, TAG_CATEGORIES, slugifyTag, type TagCategory } from "@/lib/bot-display-helpers";
import {
  loadDashboardSort,
  saveDashboardSort,
  loadDashboardSortDir,
  saveDashboardSortDir,
  loadDashboardGroup,
  saveDashboardGroup,
  loadDashboardView,
  saveDashboardView,
  loadPinnedBots,
  savePinnedBots,
} from "@/lib/dashboard-prefs";
import { timeAgo, toTimestamp } from "@/lib/timeAgo";
import { botsToCsv, downloadCsv, csvFilterSlug } from "@/lib/fleet-csv";
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
  onRefresh,
}: {
  updatedAt: number;
  isFetching: boolean;
  offline: boolean;
  // Force an immediate refetch of the live fleet data (status/agents/alerts/tags)
  // instead of waiting up to 10s for the next poll — useful right after a
  // launch/reconnect/tag action, or when demoing.
  onRefresh: () => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  if (offline) {
    return (
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:cursor-default"
        title="Live fleet monitor is unreachable — click to retry"
        aria-label="Retry fleet monitor connection"
      >
        <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
        Offline · saved data
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:cursor-default"
      title="Live fleet monitor — auto-refreshes every 10s. Click to refresh now."
      aria-label="Refresh fleet data now"
    >
      <span className="relative flex h-2 w-2 group-hover:hidden">
        {isFetching && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {/* On hover, swap the pulse dot for a refresh glyph to advertise the action. */}
      <RefreshCw
        className={cn(
          "hidden h-3 w-3 group-hover:inline",
          isFetching && "animate-spin",
        )}
      />
      Live · updated {updatedAt ? timeAgo(new Date(updatedAt)) : "just now"}
    </button>
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
  // Count bots that have blown past their monthly token budget so the Month
  // Spend KPI can flag cost overrun — the total $ alone gives no signal that
  // some bots are over budget. Same "surface the actionable problem in the
  // always-visible KPI" pattern as the Avg Health "N degraded" flag.
  const overBudgetCount = bots.filter(botOverBudget).length;

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
          // Flag cost overrun at the fleet level — the $ total alone gave no
          // signal that any bots were over their monthly budget (previously only
          // visible per-bot via the red budget bar or the Over-budget quick
          // filter). Clicking the card opens /costs, where budgets are managed.
          description={
            overBudgetCount > 0 ? (
              <span className="text-red-600 dark:text-red-400">
                {overBudgetCount} over budget — view
              </span>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health Distribution Bar
// ---------------------------------------------------------------------------

// Representative score inside each grade band, used only to reuse the shared
// grade→color helpers (healthScoreBarColor / healthBadgeClasses) so the
// distribution colors always agree with the per-bot health badges.
const GRADE_BAND_SCORE: Record<string, number> = { A: 95, B: 80, C: 65, D: 45, F: 20 };
const GRADE_BANDS: { letter: string; token: string }[] = [
  { letter: "A", token: "grade:a" },
  { letter: "B", token: "grade:b" },
  { letter: "C", token: "grade:c" },
  { letter: "D", token: "grade:d" },
  { letter: "F", token: "grade:f" },
];

/**
 * A compact stacked bar showing the fleet's health composition by grade
 * (A/B/C/D/F + unscored). The Avg Health KPI alone can't convey this — an
 * 82-average fleet could be "mostly A with two Fs" or "uniformly C", very
 * different operational states. Each segment + legend chip drills into the grid
 * filtered to that grade band (via a "grade:<x>" search token), so an operator
 * can isolate, e.g., every failing bot in one click. Hidden when no bot is
 * scored yet (the KPI already reads "—" then).
 */
function HealthDistributionBar({
  bots,
  onDrillGrade,
}: {
  bots: BotStatus[];
  onDrillGrade: (token: string) => void;
}) {
  const scored = bots.filter((b) => b.healthScore != null);
  if (scored.length === 0) return null;

  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const b of scored) counts[healthGradeLetter(b.healthScore!.overall)]++;
  const total = bots.length;
  const unscored = total - scored.length;
  const segments = GRADE_BANDS.map((g) => ({ ...g, count: counts[g.letter] })).filter(
    (g) => g.count > 0,
  );

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Fleet Health Distribution
        </span>
        <span className="text-[11px] text-muted-foreground">
          {scored.length} of {total} scored
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
        {segments.map((g) => (
          <button
            key={g.letter}
            type="button"
            onClick={() => onDrillGrade(g.token)}
            className={cn(
              "h-full transition-opacity hover:opacity-80",
              healthScoreBarColor(GRADE_BAND_SCORE[g.letter]),
            )}
            style={{ width: `${(g.count / total) * 100}%` }}
            title={`${g.count} bot${g.count !== 1 ? "s" : ""} at grade ${g.letter} — click to filter`}
            aria-label={`${g.count} bots at grade ${g.letter}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {segments.map((g) => (
          <button
            key={g.letter}
            type="button"
            onClick={() => onDrillGrade(g.token)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-opacity hover:opacity-80",
              healthBadgeClasses(GRADE_BAND_SCORE[g.letter]),
            )}
            title={`Filter to grade ${g.letter} bots`}
          >
            {g.letter} {g.count}
          </button>
        ))}
        {unscored > 0 && (
          <button
            type="button"
            onClick={() => onDrillGrade("grade:none")}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/70"
            title="Filter to bots with no health score computed yet"
          >
            Unscored {unscored}
          </button>
        )}
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
// Context Pressure Banner — fleet-level "which bots are about to run out of
// context?" roll-up. A bot over 80% of its context window (the red ContextBar
// danger zone) is on the verge of losing conversation history — a real
// operational concern the per-bot ContextBar surfaces but the KPIs don't.
// Clicking filters the grid to the affected bots (via the "context:high" token).
// ---------------------------------------------------------------------------

function ContextPressureBanner({
  count,
  active,
  onToggle,
}: {
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-left text-sm transition-colors hover:bg-amber-100/60 dark:hover:bg-amber-950/40",
        active && "ring-1 ring-inset ring-amber-500/50",
      )}
    >
      <Gauge className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p>
        <span className="font-medium">
          {count} bot{count !== 1 ? "s" : ""} near the context limit
        </span>
        <span className="ml-2 text-amber-600 dark:text-amber-400">over 80% of context window used</span>
      </p>
      <span className="ml-auto text-xs text-muted-foreground shrink-0">
        {active ? "Show all bots" : "Show affected →"}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Quick Filters — one-click status filter chips
// ---------------------------------------------------------------------------

// A compact, always-visible chip row that consolidates the dashboard's powerful
// status search tokens (alerting / grade:f / degraded / offline / channels /
// context:high / pinned) into a discoverable, one-click control. Each token was previously
// reachable only by typing it (undiscoverable — advertised in an aria-label a
// sighted operator never sees) or via a scattered banner/KPI drill-down. Here
// they live together with live counts. A chip renders only when its count > 0,
// so a healthy fleet shows nothing; clicking applies the token, clicking the
// active chip clears it — matching the banner toggle pattern.
type QuickFilter = {
  token: string;
  label: string;
  count: number;
  icon: typeof AlertTriangle;
  tone: string; // inactive text color
};

function QuickFilters({
  filters,
  activeToken,
  totalBots,
  onApply,
  onClear,
}: {
  filters: QuickFilter[];
  activeToken: string;
  totalBots: number;
  onApply: (token: string) => void;
  onClear: () => void;
}) {
  const shown = filters.filter((f) => f.count > 0);
  // When the fleet has bots but NONE carry a problem signal, show a positive
  // "all clear" confirmation instead of an empty row — so an operator (and Alex
  // during a demo) gets an at-a-glance green verdict, not just the absence of
  // red chips. Only when there are genuinely bots to assess (an empty fleet
  // shows nothing).
  if (shown.length === 0) {
    if (totalBots === 0) return null;
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
        role="status"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        All systems healthy — no bots need attention
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filters">
      <span className="text-xs font-medium text-muted-foreground mr-1">Quick filters:</span>
      {shown.map((f) => {
        const active = activeToken === f.token;
        const Icon = f.icon;
        return (
          <button
            key={f.token}
            type="button"
            onClick={() => (active ? onClear() : onApply(f.token))}
            aria-pressed={active}
            title={active ? `Clear ${f.label} filter` : `Show ${f.label.toLowerCase()} bots`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : cn("border-border hover:bg-accent", f.tone),
            )}
          >
            <Icon className="h-3 w-3" />
            {f.label}
            <span className="ml-0.5 rounded-full bg-muted px-1 tabular-nums text-[10px] text-muted-foreground">
              {f.count}
            </span>
          </button>
        );
      })}
    </div>
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
          // A budget audit target's id is a raw UUID that means nothing to an
          // operator — surface the humanized detail (scope + limit) instead, and
          // make the row a drill-down to the Costs page where budgets live.
          const isBudget = entry.targetType === "budget";
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
                  {isBot ? (
                    <>
                      {botInfo
                        ? `${botInfo.emoji ? `${botInfo.emoji} ` : ""}${botInfo.name}`
                        : "bot"}
                      {detail && (
                        <span className="text-muted-foreground/70"> · {detail}</span>
                      )}
                    </>
                  ) : (
                    // Non-bot target (e.g. a budget): show the humanized detail
                    // (scope + limit) rather than the raw "budget: <uuid>". Fall
                    // back to the plain target-type word when there's no detail.
                    detail ?? entry.targetType
                  )}
                </span>
              )}
              <span className="ml-auto flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                <span className="hidden sm:inline">{entry.userRole || entry.userId}</span>
                {timeAgo(entry.createdAt)}
              </span>
            </>
          );
          if (isBot) {
            return (
              <Link
                key={entry.id}
                to={`/bots/${entry.targetId}`}
                className="flex items-center gap-2 px-3 py-2 text-sm no-underline text-inherit transition-colors hover:bg-accent first:rounded-t-xl last:rounded-b-xl"
              >
                {row}
              </Link>
            );
          }
          // A budget operation drills down to the Costs page (where budgets are
          // managed) — consistent with the bot rows linking to the bot's detail.
          if (isBudget) {
            return (
              <Link
                key={entry.id}
                to="/costs"
                className="flex items-center gap-2 px-3 py-2 text-sm no-underline text-inherit transition-colors hover:bg-accent first:rounded-t-xl last:rounded-b-xl"
              >
                {row}
              </Link>
            );
          }
          return (
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
  selectable = false,
  selectedIds,
  onToggleSelect,
  pinnedIds,
  onTogglePin,
}: {
  groups: Map<string, BotStatus[]>;
  /** "grid" renders cards; "list" renders dense rows for scanning a large fleet. */
  viewMode?: ViewMode;
  onClear?: () => void;
  alertsByBot?: Map<string, number>;
  /** Per-card quick reconnect for an offline bot (threaded to BotStatusCard). */
  onReconnect?: (bot: BotStatus) => void;
  reconnectingBotId?: string | null;
  /** Bulk-selection mode — renders a checkbox on each card/row. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (bot: BotStatus) => void;
  /** Pinned bots (star fill) + toggle handler, threaded to card/row. */
  pinnedIds?: Set<string>;
  onTogglePin?: (bot: BotStatus) => void;
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
                      selectable={selectable}
                      selected={selectedIds?.has(bot.botId) ?? false}
                      onToggleSelect={onToggleSelect}
                      pinned={pinnedIds?.has(bot.botId) ?? false}
                      onTogglePin={onTogglePin}
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
                      selectable={selectable}
                      selected={selectedIds?.has(bot.botId) ?? false}
                      onToggleSelect={onToggleSelect}
                      pinned={pinnedIds?.has(bot.botId) ?? false}
                      onTogglePin={onTogglePin}
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
// Bulk action bar
// ---------------------------------------------------------------------------

/**
 * The action bar shown while bulk-selection mode is on. Lets an operator tag,
 * reconnect, or export the selected bots in one action. Owns the tag label +
 * category input locally; everything else is a callback into the dashboard.
 */
function BulkActionBar({
  selectedCount,
  hiddenCount,
  reconnectableCount,
  disconnectableCount,
  displayedCount,
  allDisplayedSelected,
  busy,
  onToggleSelectAll,
  onClearSelection,
  onExit,
  onTag,
  onReconnect,
  onDisconnect,
  onRemove,
  onExport,
  allSelectedPinned,
  onPin,
}: {
  selectedCount: number;
  hiddenCount: number;
  reconnectableCount: number;
  disconnectableCount: number;
  displayedCount: number;
  allDisplayedSelected: boolean;
  busy: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onExit: () => void;
  onTag: (label: string, category: TagCategory) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onExport: () => void;
  allSelectedPinned: boolean;
  onPin: (pin: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<TagCategory>("custom");
  // Two-step confirm for the destructive lifecycle actions (bulk disconnect /
  // bulk remove) — matches the per-bot Disconnect/Remove confirm convention.
  // Any change to the selection cancels a pending confirm so the operator
  // re-confirms against the set they actually mean to act on.
  const [confirm, setConfirm] = useState<"disconnect" | "remove" | null>(null);
  useEffect(() => {
    setConfirm(null);
  }, [selectedCount]);
  const none = selectedCount === 0;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-sm font-semibold text-foreground">
        {selectedCount} selected
        {hiddenCount > 0 && (
          <span
            className="ml-1.5 font-normal text-xs text-amber-600 dark:text-amber-400"
            title={`${hiddenCount} selected bot${hiddenCount !== 1 ? "s are" : " is"} hidden by the active filter — bulk actions still affect ${hiddenCount !== 1 ? "them" : "it"}`}
          >
            ({hiddenCount} hidden)
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onToggleSelectAll}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
        title={allDisplayedSelected ? "Deselect all displayed bots" : "Select all displayed bots"}
      >
        <CheckSquare className="h-3.5 w-3.5" />
        {allDisplayedSelected ? "Deselect all" : `Select all (${displayedCount})`}
      </button>
      {!none && (
        <button
          type="button"
          onClick={onClearSelection}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* Bulk tag */}
        <div className="flex items-center gap-1">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="tag label"
            aria-label="Bulk tag label"
            disabled={none || busy}
            className="w-28 rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && label.trim()) {
                onTag(label, category);
                setLabel("");
              }
            }}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TagCategory)}
            aria-label="Bulk tag category"
            disabled={none || busy}
            className="rounded-md border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
          >
            {TAG_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (label.trim()) {
                onTag(label, category);
                setLabel("");
              }
            }}
            disabled={none || busy || !label.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Tag
          </button>
        </div>

        {/* Bulk reconnect (offline selected) */}
        {reconnectableCount > 0 && (
          <button
            type="button"
            onClick={onReconnect}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-50"
            title={`Reconnect ${reconnectableCount} offline selected bot${reconnectableCount !== 1 ? "s" : ""}`}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            Reconnect ({reconnectableCount})
          </button>
        )}

        {/* Bulk disconnect (live selected → dormant). Reversible; still a
            two-step confirm because it acts on several bots at once. */}
        {disconnectableCount > 0 &&
          (confirm === "disconnect" ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">
                Disconnect {disconnectableCount}?
              </span>
              <button
                type="button"
                onClick={() => {
                  setConfirm(null);
                  onDisconnect();
                }}
                className="rounded-md border border-amber-500/50 bg-amber-100/60 dark:bg-amber-950/40 px-2 py-1 font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-950/60 transition-colors"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-md border px-2 py-1 hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm("disconnect")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              title={`Disconnect ${disconnectableCount} live selected bot${disconnectableCount !== 1 ? "s" : ""} (reversible — they stay as dormant cards)`}
            >
              <WifiOff className="h-3.5 w-3.5" />
              Disconnect ({disconnectableCount})
            </button>
          ))}

        {/* Bulk pin / unpin */}
        <button
          type="button"
          onClick={() => onPin(!allSelectedPinned)}
          disabled={none}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
          title={allSelectedPinned ? "Unpin selected bots" : "Pin selected bots to the top of the grid"}
        >
          <Star className={cn("h-3.5 w-3.5", allSelectedPinned && "fill-amber-400 text-amber-400")} />
          {allSelectedPinned ? "Unpin" : "Pin"}
        </button>

        {/* Bulk export */}
        <button
          type="button"
          onClick={onExport}
          disabled={none}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>

        {/* Bulk remove (permanent). Two-step confirm — decommissions the
            selected bots (drops the live connection, deletes the DB agent). The
            per-bot Remove lives on each detail page; this is the bulk path. */}
        {confirm === "remove" ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <span className="font-medium text-red-600 dark:text-red-400">
              Remove {selectedCount} permanently?
            </span>
            <button
              type="button"
              onClick={() => {
                setConfirm(null);
                onRemove();
              }}
              className="rounded-md border border-red-500/50 bg-red-100/60 dark:bg-red-950/40 px-2 py-1 font-semibold text-red-700 dark:text-red-300 hover:bg-red-200/60 dark:hover:bg-red-950/60 transition-colors"
            >
              Yes, remove
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="rounded-md border px-2 py-1 hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm("remove")}
            disabled={none || busy}
            className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-50/50 dark:bg-red-950/20 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100/60 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Permanently remove the selected bots from the fleet"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}

        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Done
        </button>
      </div>
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
  // Bulk selection — an operator can select several bots and act on the whole
  // subset at once (tag them, reconnect the offline ones, export a selection),
  // rather than only being able to reconnect ALL offline bots or act one at a
  // time. `selectionMode` shows the checkboxes; `selectedIds` tracks the picks.
  const addTag = useAddTag();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
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
  // Sort direction — "default" (each sort's natural order) or "reversed". Lets an
  // operator flip any sort (e.g. HEALTHIEST-first, LONGEST-uptime-first). Persisted.
  const [sortDir, setSortDir] = useState<SortDir>(() => loadDashboardSortDir() ?? "default");
  // Grid (card) vs list (dense row) rendering, persisted so a page reload keeps
  // the operator's choice. Grid is the default.
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadDashboardView() ?? "grid");
  // The active filter/search token is synced to the URL `?filter=` param so a
  // filtered view (a KPI/Quick-Filter drill-down like "grade:f"/"needs-attention",
  // or a manual search) is BOOKMARKABLE + SHAREABLE, survives a hard reload
  // (unlike sort/group/view it isn't in localStorage — it's transient per-view),
  // and is preserved when drilling into a bot's detail page and hitting Back
  // (the dashboard remounts and re-seeds from the URL). Seed once at mount from
  // the URL; the write effect below keeps the URL in step as the token changes.
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("filter") ?? "");
  // Pinned bots — float to the top of the grid regardless of the active sort.
  // Per-company + persisted so an operator's "keep these in view" picks survive
  // a reload. Reloaded when the selected company changes.
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() =>
    selectedCompanyId ? loadPinnedBots(selectedCompanyId) : new Set(),
  );
  // On company switch: reload this company's pins AND reset the grid's transient
  // view state. Without clearing search/tags a filter token (e.g. "alerting" /
  // "grade:f") or a typed search from the previous company leaks into the new
  // company's grid, showing a confusing filtered/empty view; and leaving
  // selection mode on strands the operator with a phantom bulk bar over the
  // (pruned-to-empty) selection. Pins are per-company + persisted, so they
  // reload; the rest is transient and reset to the clean default.
  const prevCompanyRef = useRef(selectedCompanyId);
  useEffect(() => {
    setPinnedIds(selectedCompanyId ? loadPinnedBots(selectedCompanyId) : new Set());
    // Only reset the transient view state on an ACTUAL company change between two
    // defined companies — NOT on the initial mount (or the undefined→co-A resolve
    // once CompanyContext loads), which would wipe a URL-seeded ?filter= on load.
    if (prevCompanyRef.current && prevCompanyRef.current !== selectedCompanyId) {
      setSearchQuery("");
      setActiveTags([]);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
    prevCompanyRef.current = selectedCompanyId;
  }, [selectedCompanyId]);
  // Keep the URL `?filter=` param in step with the active filter/search token so
  // the current filtered view is always shareable. `replace` so typing doesn't
  // spam the history stack; other query params are preserved. Reading is
  // seed-at-mount only (above), so this never loops back into searchQuery.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (searchQuery) next.set("filter", searchQuery);
        else next.delete("filter");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSearchParams identity is stable; syncing on searchQuery only
  }, [searchQuery]);
  const togglePin = (bot: BotStatus) => {
    if (!selectedCompanyId) return;
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bot.botId)) next.delete(bot.botId);
      else next.add(bot.botId);
      savePinnedBots(selectedCompanyId, next);
      return next;
    });
  };

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
  const handleSortDirToggle = () => {
    setSortDir((prev) => {
      const next: SortDir = prev === "reversed" ? "default" : "reversed";
      saveDashboardSortDir(next);
      return next;
    });
  };
  const handleGroupByChange = (key: GroupKey) => {
    setGroupBy(key);
    saveDashboardGroup(key);
  };
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    saveDashboardView(mode);
  };
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

  // Force an immediate refresh of the live fleet data instead of waiting up to
  // 10s for the next poll. Invalidates the same queries the poll refreshes:
  // fleet status (bot cards), the DB-agent fallback list, alerts, and tags.
  const handleManualRefresh = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alertsAll(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: ["fleet", "tags"] });
  };

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

  // Prune bulk-selection ids that no longer exist in the fleet (e.g. a selected
  // bot was removed via its detail page, or a company switch replaced the roster)
  // so the "N selected" count and bulk actions never reference phantom bots.
  // Returns prev unchanged when nothing was pruned, so this can't loop.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(bots.map((b) => b.botId));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [bots]);

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

  const filteredBots = useFilteredBots(bots, tags, activeTags, searchQuery, sortBy, sortDir, alertsByBot, pinnedIds);

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

  // Fleet-level context-pressure roll-up — bots over 80% of their context
  // window (the red ContextBar danger zone), computed over the whole fleet so
  // the banner count is accurate regardless of the active grid filters.
  // Live-only: a bot with no live context reading (DB-fallback / just connected)
  // returns null, so it's never counted.
  const contextPressureCount = useMemo(
    () => bots.filter((b) => (contextPercent(b) ?? -1) > 80).length,
    [bots],
  );

  // Fleet-wide count of bots needing attention — the UNION of every problem
  // signal (firing alert OR degraded OR context pressure OR cost overrun). Single
  // source of truth: fed into BOTH the "Needs attention" quick-filter chip and
  // the always-visible grid-header badge, so the two counts can never diverge.
  const attentionCount = useMemo(
    () =>
      bots.filter((b) => botNeedsAttention(b, (alertsByBot.get(b.botId) ?? 0) > 0))
        .length,
    [bots, alertsByBot],
  );

  // Live counts for the discoverable Quick Filters chip row — one entry per
  // status search token, computed over the WHOLE fleet so a chip's count is
  // accurate regardless of the active grid filter. Chips render only when their
  // count > 0 (a healthy fleet shows none), so this consolidates the otherwise
  // undiscoverable typed tokens + scattered banner/KPI drill-downs into one
  // always-visible control.
  const quickFilters = useMemo<QuickFilter[]>(
    () => [
      {
        // The UNION of every problem signal (firing alert OR degraded OR context
        // pressure) — "just show me everything wrong right now". Leads the row
        // because it's the broadest, most useful triage filter; the chips below
        // (Alerting/Failing/Degraded/…) each drill into one slice of it.
        token: "attention",
        label: "Needs attention",
        count: attentionCount,
        icon: ShieldAlert,
        tone: "text-red-600 dark:text-red-400",
      },
      {
        token: "alerting",
        label: "Alerting",
        count: alertsByBot.size,
        icon: AlertTriangle,
        tone: "text-red-600 dark:text-red-400",
      },
      {
        // Failing (grade-F) bots — the single most critical health band: a bot
        // still connected/serving but scoring below 40. Reachable from the
        // Health Distribution bar's F segment, but that bar is hidden until bots
        // are scored — this puts the failing set in the always-visible,
        // discoverable Quick Filters row too. Reuses the "grade:f" search token.
        token: "grade:f",
        label: "Failing",
        count: bots.filter(
          (b) => b.healthScore != null && healthGradeLetter(b.healthScore.overall) === "F",
        ).length,
        icon: TrendingDown,
        tone: "text-red-600 dark:text-red-400",
      },
      {
        token: "degraded",
        label: "Degraded",
        count: bots.filter(botIsDegraded).length,
        icon: Activity,
        tone: "text-amber-600 dark:text-amber-400",
      },
      {
        token: "channels",
        label: "Channels down",
        count: channelStats.fullyDown + channelStats.partiallyDown,
        icon: Radio,
        tone: "text-red-600 dark:text-red-400",
      },
      {
        token: "context:high",
        label: "Context high",
        count: contextPressureCount,
        icon: Gauge,
        tone: "text-amber-600 dark:text-amber-400",
      },
      {
        // Bots that have spent MORE than their monthly token budget — cost
        // overrun, previously only visible as the red budget bar on the card.
        // Filtering here + Export CSV produces a ready over-budget report.
        token: "over-budget",
        label: "Over budget",
        count: bots.filter(botOverBudget).length,
        icon: DollarSign,
        tone: "text-red-600 dark:text-red-400",
      },
      {
        token: "offline",
        label: "Offline",
        count: bots.filter((b) => getDisplayStatus(b.connectionState) === "offline").length,
        icon: WifiOff,
        tone: "text-muted-foreground",
      },
      {
        token: "pinned",
        label: "Pinned",
        count: pinnedIds.size,
        icon: Star,
        tone: "text-primary",
      },
    ],
    [bots, alertsByBot, attentionCount, channelStats, contextPressureCount, pinnedIds],
  );

  // The channel-issues drill-down is now the composable "channels" search token
  // (matching degraded/alerting/context:high), so no bespoke filter state is
  // needed — filteredBots already reflects it when the query is "channels".
  const displayBots = filteredBots;
  const groupedBots = useGroupedBots(displayBots, tags, groupBy);

  // Any filter active (typed search or tag chips — the channel-issues filter is
  // now the "channels" search token, covered by searchQuery). Drives the header
  // "Clear filters" button + the empty-grid clear affordance.
  const filtersActive = !!searchQuery || activeTags.length > 0;
  const clearFilters = () => {
    setSearchQuery("");
    setActiveTags([]);
  };

  // Global Escape clears every active filter (search token + tag chips) when the
  // operator isn't typing in a field. After a Quick-Filter chip or KPI drill-down
  // there was no keyboard way back to the full grid — Escape in the search box
  // (#290) only clears the query when focus is inside it. A ref keeps this handler
  // stable while always seeing the current filter state.
  const clearFiltersRef = useRef<() => void>(clearFilters);
  clearFiltersRef.current = clearFilters;
  const filtersActiveRef = useRef(filtersActive);
  filtersActiveRef.current = filtersActive;
  const selectionModeRef = useRef(selectionMode);
  selectionModeRef.current = selectionMode;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      // Let a focused field (incl. the search box's own Escape-to-clear) handle it.
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el instanceof HTMLElement && el.isContentEditable)
      )
        return;
      // Back out one step per Escape: exit bulk-selection mode first (a common
      // "get me out" reflex once you're picking bots), then — on the next press —
      // clear any active filter. Previously Escape only cleared filters, so an
      // operator in selection mode with no filter had no keyboard way out.
      if (selectionModeRef.current) {
        e.preventDefault();
        setSelectionMode(false);
        setSelectedIds(new Set());
        return;
      }
      if (!filtersActiveRef.current) return;
      e.preventDefault();
      clearFiltersRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Export the currently-displayed roster (respects the active filters/search,
  // so an operator exports exactly what they're looking at) to a CSV download —
  // for a review, spreadsheet, or report.
  const handleExportCsv = () => {
    if (displayBots.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    // Name the file for the active filter so an exported triage subset is
    // self-describing (e.g. Failing → fleet-grade-f-<date>.csv), not the
    // generic roster name.
    const slug = filtersActive ? csvFilterSlug(searchQuery) : "roster";
    downloadCsv(`fleet-${slug}-${date}.csv`, botsToCsv(displayBots, tags, alertsByBot));
  };
  // A KPI/banner drill-down should show EXACTLY its intended set — clear any
  // active tag filter first, otherwise the intersection with a lingering filter
  // could surface an empty or unexpected grid.
  const drillToSearch = (query: string) => {
    setActiveTags([]);
    setSearchQuery(query);
  };
  // A "sort" drill-down (e.g. the Active Sessions KPI → busiest-first) should
  // show the WHOLE fleet in the new order — clear any active search/tag filter
  // first, otherwise "busiest first" would sort only the current filtered
  // subset (e.g. the degraded bots), which isn't the intended drill-down.
  // Mirrors drillToSearch clearing filters for filter drill-downs.
  const drillToSort = (sort: SortKey) => {
    setSearchQuery("");
    setActiveTags([]);
    setSortBy(sort);
    // Honor the drill-down's intended order (e.g. "busiest first") — a lingering
    // "reversed" direction would invert it. Persist so it sticks like a manual choice.
    setSortDir("default");
    saveDashboardSortDir("default");
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

  // --- Bulk selection actions ----------------------------------------------
  const toggleSelect = (bot: BotStatus) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bot.botId)) next.delete(bot.botId);
      else next.add(bot.botId);
      return next;
    });
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Bulk-tag every selected bot in one action (e.g. tag a whole department
  // "production"). Slugifies the label the same way BotTagsManager does and
  // fires one addTag per bot concurrently; a bot that already has the tag is
  // rejected server-side and counted as skipped in the summary toast.
  async function handleBulkTag(rawLabel: string, category: TagCategory) {
    const label = rawLabel.trim();
    const tag = slugifyTag(label);
    const targets = bots.filter((b) => selectedIds.has(b.botId));
    if (!tag || targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    const color = TAG_CATEGORIES.find((c) => c.value === category)?.color;
    try {
      const results = await Promise.allSettled(
        targets.map((b) =>
          addTag.mutateAsync({ botId: b.botId, tag, label: label.slice(0, 128), color, category }),
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      pushToast({
        title: `Tagged ${ok} of ${targets.length} bot${targets.length !== 1 ? "s" : ""} "${label}"`,
        body:
          ok < targets.length
            ? `${targets.length - ok} skipped (already had the tag, or the request failed).`
            : undefined,
        tone: ok > 0 ? "success" : "warn",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  // Reconnect the offline (gateway-carrying) bots among the selection.
  async function handleBulkReconnect() {
    const targets = bots.filter(
      (b) =>
        selectedIds.has(b.botId) &&
        getDisplayStatus(b.connectionState) === "offline" &&
        !!b.gatewayUrl,
    );
    if (!selectedCompanyId || targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((b) =>
          fleetMonitorApi.connect({
            botId: b.botId,
            agentId: b.botId,
            gatewayUrl: b.gatewayUrl,
            token: "",
            companyId: selectedCompanyId,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alertsAll(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: ["fleet", "audit"] });
      pushToast({
        title:
          ok === targets.length
            ? `Reconnected ${ok} bot${ok !== 1 ? "s" : ""}`
            : `Reconnected ${ok} of ${targets.length} bots`,
        tone: ok === targets.length ? "success" : "warn",
        ttlMs: ok === targets.length ? undefined : 8000,
      });
    } finally {
      setBulkBusy(false);
    }
  }

  // Disconnect the live (non-offline) bots among the selection → dormant. The
  // reversible bulk complement to the per-bot Disconnect (#232): a disconnected
  // bot stays as a dormant card and can be reconnected. Offline/dormant selected
  // bots have no live connection to drop, so they're skipped.
  async function handleBulkDisconnect() {
    const targets = bots.filter(
      (b) =>
        selectedIds.has(b.botId) &&
        getDisplayStatus(b.connectionState) !== "offline",
    );
    if (!selectedCompanyId || targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((b) => fleetMonitorApi.disconnect(b.botId, selectedCompanyId)),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alertsAll(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: ["fleet", "audit"] });
      pushToast({
        title:
          ok === targets.length
            ? `Disconnected ${ok} bot${ok !== 1 ? "s" : ""}`
            : `Disconnected ${ok} of ${targets.length} bots`,
        body: "Disconnected bots stay as dormant cards and can be reconnected.",
        tone: ok === targets.length ? "success" : "warn",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  // Permanently remove the selected bots from the fleet. Mirrors the per-bot
  // Remove (#298): drop the live gateway connection (best-effort, only if
  // tracked) so the monitor stops tracking it, then delete the DB agent so it
  // no longer appears via the dashboard's DB fallback either. Destructive — the
  // BulkActionBar requires a confirm click before calling this.
  async function handleBulkRemove() {
    const targets = bots.filter((b) => selectedIds.has(b.botId));
    if (!selectedCompanyId || targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map(async (b) => {
          if (getDisplayStatus(b.connectionState) !== "offline") {
            try {
              await fleetMonitorApi.disconnect(b.botId, selectedCompanyId);
            } catch {
              /* best-effort — the bot may already be offline; proceed to delete */
            }
          }
          return agentsApi.remove(b.botId, selectedCompanyId);
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.status(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alertsAll(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: ["fleet", "audit"] });
      // Drop the removed bots from the selection now for instant feedback (the
      // [bots] prune effect also catches this once the roster refetches).
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const b of targets) next.delete(b.botId);
        return next;
      });
      pushToast({
        title:
          ok === targets.length
            ? `Removed ${ok} bot${ok !== 1 ? "s" : ""} from the fleet`
            : `Removed ${ok} of ${targets.length} bots`,
        body:
          ok < targets.length
            ? `${targets.length - ok} could not be removed.`
            : undefined,
        tone: ok === targets.length ? "success" : "warn",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  // Export just the selected bots to CSV (the header export covers the whole
  // displayed roster; this covers a hand-picked subset).
  function handleBulkExport() {
    const targets = bots.filter((b) => selectedIds.has(b.botId));
    if (targets.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`fleet-selection-${date}.csv`, botsToCsv(targets, tags, alertsByBot));
  }

  // Pin or unpin every selected bot in one action (the per-card star only
  // toggles one at a time, #310). `pin=true` adds all selected to the pinned
  // set, `pin=false` removes them; persisted per company so the picks survive
  // a reload like the per-card toggle.
  function handleBulkPin(pin: boolean) {
    if (!selectedCompanyId || selectedIds.size === 0) return;
    setPinnedIds((prev) => {
      const next = new Set(prev);
      for (const id of selectedIds) {
        if (pin) next.add(id);
        else next.delete(id);
      }
      savePinnedBots(selectedCompanyId, next);
      return next;
    });
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
          {/* The DB + agent-create API work independently of fleet-monitor, so a
              fresh-company operator can still launch a full org-chart fleet (or
              connect a single bot) here — bots just come up cached-only until
              the monitor is reachable. Mirror the no-bots dual-action block. */}
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-muted/50 p-4 mb-4">
              <WifiOff className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Launch a fleet or connect a bot — they'll come online once the
              fleet-monitor service is reachable.
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

  // Derived bulk-selection values (safe here — all hooks ran above).
  const selectedCount = selectedIds.size;
  // Selected bots hidden by the active filter/search. Bulk actions target the
  // whole selection (bots.filter, not displayBots), so a selected bot filtered
  // out of view is still tagged/reconnected/exported — flag the count so the
  // operator knows the action affects bots they can't currently see.
  const hiddenSelectedCount = selectedCount - displayBots.filter((b) => selectedIds.has(b.botId)).length;
  const reconnectableSelectedCount = bots.filter(
    (b) =>
      selectedIds.has(b.botId) &&
      getDisplayStatus(b.connectionState) === "offline" &&
      !!b.gatewayUrl,
  ).length;
  // Selected bots that are live-tracked (not offline) → have a connection to
  // drop. Bulk disconnect only shows when at least one selected bot is live.
  const disconnectableSelectedCount = bots.filter(
    (b) =>
      selectedIds.has(b.botId) &&
      getDisplayStatus(b.connectionState) !== "offline",
  ).length;
  // All selected bots already pinned → the bulk pin button offers "Unpin";
  // otherwise "Pin" (pins the whole selection, including any not-yet-pinned).
  const allSelectedPinned =
    selectedCount > 0 && [...selectedIds].every((id) => pinnedIds.has(id));
  const allDisplayedSelected =
    displayBots.length > 0 && displayBots.every((b) => selectedIds.has(b.botId));
  const toggleSelectAllDisplayed = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (displayBots.every((b) => next.has(b.botId))) {
        for (const b of displayBots) next.delete(b.botId);
      } else {
        for (const b of displayBots) next.add(b.botId);
      }
      return next;
    });

  return (
    <div className="space-y-6 p-1">
      {/* Alert banner */}
      <AlertBanner alerts={activeAlerts} onFilterAlerting={() => drillToSearch("alerting")} />

      {/* Customer-channel health — surfaces bots that aren't reaching customers.
          Clicking filters the grid to the affected bots via the "channels"
          search token; clicking again clears it (same composable drill-down as
          the alerting/context:high banners). */}
      <ChannelHealthBanner
        fullyDown={channelStats.fullyDown}
        partiallyDown={channelStats.partiallyDown}
        active={searchQuery === "channels"}
        onToggle={() =>
          searchQuery === "channels" ? clearFilters() : drillToSearch("channels")
        }
      />

      {/* Context-window pressure — surfaces bots about to lose conversation
          history (over 80% context). Clicking filters the grid to them via the
          "context:high" search token; clicking again clears it. */}
      <ContextPressureBanner
        count={contextPressureCount}
        active={searchQuery === "context:high"}
        onToggle={() =>
          searchQuery === "context:high" ? clearFilters() : drillToSearch("context:high")
        }
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

      {/* Fleet health composition — the average KPI can't convey the spread
          (an 82-avg fleet could be all-C or mostly-A-with-two-Fs). Each grade
          band drills into the grid. */}
      <HealthDistributionBar bots={bots} onDrillGrade={drillToSearch} />

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
        sortDir={sortDir}
        onSortDirToggle={handleSortDirToggle}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
      />

      {/* Quick-filter chips — discoverable one-click access to the status search
          tokens (alerting/failing/degraded/channels/context/offline/pinned) with
          live counts; each renders only when there's something to filter. */}
      <QuickFilters
        filters={quickFilters}
        activeToken={searchQuery}
        totalBots={bots.length}
        onApply={drillToSearch}
        onClear={clearFilters}
      />

      {/* Bot grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Bots ({displayBots.length}{displayBots.length !== bots.length ? ` of ${bots.length}` : ""})
            </h2>
            {/* Always-visible attention total — persists in the header even when
                the quick-filter chip row is scrolled past. One click drills the
                grid to exactly the bots needing eyes. */}
            {attentionCount > 0 && (
              <button
                type="button"
                onClick={() => drillToSearch("attention")}
                className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-50/60 dark:bg-red-950/20 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100/70 dark:hover:bg-red-950/40 transition-colors"
                title={`${attentionCount} bot${attentionCount !== 1 ? "s" : ""} need attention — click to filter`}
              >
                <ShieldAlert className="h-3 w-3" />
                {attentionCount} need{attentionCount === 1 ? "s" : ""} attention
              </button>
            )}
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
              onRefresh={handleManualRefresh}
            />
          </div>
          <div className="flex items-center gap-2">
            {/* Enter/exit bulk-selection mode — shows a checkbox on each
                card/row and the bulk action bar (tag / reconnect / export the
                chosen subset). */}
            {displayBots.length > 0 && (
              <button
                type="button"
                onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  selectionMode
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "hover:bg-accent",
                )}
                title="Select multiple bots for bulk actions"
                aria-pressed={selectionMode}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {selectionMode
                  ? selectedIds.size > 0
                    ? `Cancel (${selectedIds.size})`
                    : "Cancel"
                  : "Select"}
              </button>
            )}
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
            {/* Export the displayed roster to CSV for review/reporting. */}
            {displayBots.length > 0 && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                title={`Export ${displayBots.length} ${filtersActive ? "filtered " : ""}bot${displayBots.length !== 1 ? "s" : ""} to CSV`}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
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
        {selectionMode && (
          <BulkActionBar
            selectedCount={selectedCount}
            hiddenCount={hiddenSelectedCount}
            reconnectableCount={reconnectableSelectedCount}
            disconnectableCount={disconnectableSelectedCount}
            displayedCount={displayBots.length}
            allDisplayedSelected={allDisplayedSelected}
            busy={bulkBusy}
            onToggleSelectAll={toggleSelectAllDisplayed}
            onClearSelection={() => setSelectedIds(new Set())}
            onExit={exitSelection}
            onTag={handleBulkTag}
            onReconnect={handleBulkReconnect}
            onDisconnect={handleBulkDisconnect}
            onRemove={handleBulkRemove}
            onExport={handleBulkExport}
            allSelectedPinned={allSelectedPinned}
            onPin={handleBulkPin}
          />
        )}
        <BotGrid
          groups={groupedBots}
          viewMode={viewMode}
          alertsByBot={alertsByBot}
          onClear={filtersActive ? clearFilters : undefined}
          onReconnect={handleReconnectOne}
          reconnectingBotId={reconnectingBotId}
          selectable={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
        />
      </div>

      {/* Alerts */}
      <AlertList alerts={activeAlerts} />

      {/* Recent activity — audit-log feed of fleet operations */}
      <RecentActivity botNames={botNames} />
    </div>
  );
}
