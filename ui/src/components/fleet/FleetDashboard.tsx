/**
 * FleetDashboard — the main overview page for a Fleet.
 *
 * Shows: KPI summary cards, bot grid sorted by health (attention-first),
 * active alerts panel, and recent activity feed.
 */

import { useEffect, useMemo } from "react";
import {
  Wifi,
  WifiOff,
  DollarSign,
  Activity,
  AlertTriangle,
  Radio,
  Plus,
} from "lucide-react";
import { useFleetStatus, useFleetAlerts, estimateCostUsd } from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { cn } from "@/lib/utils";
import { alertSeverityBadge, alertSeverityBadgeDefault } from "@/lib/status-colors";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { BotStatusCard } from "./BotStatusCard";
import type { BotStatus, FleetAlert } from "@/api/fleet-monitor";

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
// Bot Grid — sorted by health score ascending (attention-first)
// ---------------------------------------------------------------------------

function BotGrid({ bots }: { bots: BotStatus[] }) {
  const sorted = useMemo(() => {
    return [...bots].sort((a, b) => {
      // Errors first, then by health score ascending
      if (a.connectionState === "error" && b.connectionState !== "error") return -1;
      if (b.connectionState === "error" && a.connectionState !== "error") return 1;
      const aScore = a.healthScore?.overall ?? 0;
      const bScore = b.healthScore?.overall ?? 0;
      return aScore - bScore;
    });
  }, [bots]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {sorted.map((bot) => (
        <BotStatusCard key={bot.botId} bot={bot} />
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

  const {
    data: fleet,
    isLoading: fleetLoading,
    error: fleetError,
  } = useFleetStatus();

  const { data: alerts } = useFleetAlerts();

  useEffect(() => {
    setBreadcrumbs([{ label: "Fleet Dashboard" }]);
  }, [setBreadcrumbs]);

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

  return (
    <div className="space-y-6 p-1">
      {/* Alert banner */}
      <AlertBanner alerts={activeAlerts} />

      {/* KPI summary */}
      <FleetKpiRow bots={bots} />

      {/* Bot grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Bots ({bots.length})
          </h2>
          <button
            onClick={openNewAgent}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Connect Bot
          </button>
        </div>
        <BotGrid bots={bots} />
      </div>

      {/* Alerts */}
      <AlertList alerts={activeAlerts} />
    </div>
  );
}
