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
} from "lucide-react";
import { useFleetStatus, useFleetAlerts, useFleetTags, estimateCostUsd } from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { cn } from "@/lib/utils";
import { alertSeverityBadge, alertSeverityBadgeDefault } from "@/lib/status-colors";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { BotStatusCard } from "./BotStatusCard";
import { FilterBar, useFilteredBots, useGroupedBots, type SortKey, type GroupKey } from "./FilterBar";
import { IntelligenceWidget } from "./IntelligenceWidget";
import { BudgetWidget } from "./BudgetWidget";
import type { BotStatus, FleetAlert, BotTag } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// KPI Row
// ---------------------------------------------------------------------------

function FleetKpiRow({ bots }: { bots: BotStatus[] }) {
  const online = bots.filter((b) => b.connectionState === "monitoring").length;
  const errored = bots.filter((b) => b.connectionState === "error").length;
  const totalSessions = bots.reduce((sum, b) => sum + b.activeSessions, 0);
  const avgHealth = bots.length
    ? Math.round(bots.reduce((sum, b) => sum + (b.healthScore?.overall ?? 0), 0) / bots.length)
    : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={Wifi}
          value={`${online}/${bots.length}`}
          label="Bots Online"
          description={errored > 0 ? <span className="text-destructive">{errored} with errors</span> : undefined}
        />
      </div>
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={Activity}
          value={totalSessions}
          label="Active Sessions"
        />
      </div>
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={Radio}
          value={avgHealth > 0 ? `${avgHealth}` : "—"}
          label="Avg Health Score"
        />
      </div>
      <div className="rounded-xl border bg-background">
        <MetricCard
          icon={DollarSign}
          value="—"
          label="Today's Cost"
          description="Connect bots to track"
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

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert List
// ---------------------------------------------------------------------------

function AlertList({ alerts }: { alerts: FleetAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Recent Alerts</h3>
      <div className="space-y-1.5">
        {alerts.slice(0, 5).map((alert) => (
          <div
            key={alert.id}
            className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
          >
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0",
                alertSeverityBadge[alert.severity] ?? alertSeverityBadgeDefault,
              )}
            >
              {alert.severity}
            </span>
            <span className="shrink-0">{alert.botEmoji}</span>
            <span className="truncate">{alert.message}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {new Date(alert.firedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bot Grid — supports grouping via FilterBar
// ---------------------------------------------------------------------------

function BotGrid({ groups }: { groups: Map<string, BotStatus[]> }) {
  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([groupName, bots]) => (
        <div key={groupName}>
          {groups.size > 1 && (
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              {groupName} ({bots.length})
            </h4>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {bots.map((bot) => (
              <BotStatusCard key={bot.botId} bot={bot} />
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
  const { openNewAgent } = useDialog();

  // Filter/sort/group state
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [sortBy, setSortBy] = useState<SortKey>("health");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: fleet,
    isLoading: fleetLoading,
    error: fleetError,
  } = useFleetStatus();

  const { data: alerts } = useFleetAlerts();
  const { data: tagsData } = useFleetTags();
  const tags: BotTag[] = (tagsData as any)?.tags ?? [];

  useEffect(() => {
    setBreadcrumbs([{ label: "Fleet Dashboard" }]);
  }, [setBreadcrumbs]);

  const handleToggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={Radio} message="Select a fleet to view its dashboard." />;
  }

  if (fleetLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (fleetError) {
    return <p className="text-sm text-destructive p-4">{fleetError.message}</p>;
  }

  const bots = fleet?.bots ?? [];
  const activeAlerts = alerts ?? [];

  if (bots.length === 0) {
    return (
      <EmptyState
        icon={WifiOff}
        message="No bots connected yet. Connect your first bot to get started."
        action="Connect Bot"
        onAction={openNewAgent}
      />
    );
  }

  const filteredBots = useFilteredBots(bots, tags, activeTags, searchQuery, sortBy);
  const groupedBots = useGroupedBots(filteredBots, tags, groupBy);

  return (
    <div className="space-y-6 p-1">
      {/* Alert banner */}
      <AlertBanner alerts={activeAlerts} />

      {/* Intelligence recommendations */}
      <IntelligenceWidget companyId={selectedCompanyId} />

      {/* KPI summary */}
      <FleetKpiRow bots={bots} />

      {/* Budget widget */}
      <BudgetWidget companyId={selectedCompanyId} />

      {/* Filter bar */}
      {tags.length > 0 && (
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
      )}

      {/* Bot grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Bots ({filteredBots.length}{filteredBots.length !== bots.length ? ` of ${bots.length}` : ""})
          </h2>
          <button
            onClick={openNewAgent}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Connect Bot
          </button>
        </div>
        <BotGrid groups={groupedBots} />
      </div>

      {/* Alerts */}
      <AlertList alerts={activeAlerts} />
    </div>
  );
}
