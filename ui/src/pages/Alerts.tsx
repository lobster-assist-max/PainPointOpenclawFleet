/**
 * Fleet Alerts & Notifications page.
 *
 * Displays all fleet alerts (active + resolved) with filtering,
 * severity badges, acknowledge/resolve actions, and alert rule management.
 */

import { useEffect, useState } from "react";
import { Link } from "@/lib/router";
import { useFleetAlerts, useAcknowledgeAlert, timeAgo } from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import { alertSeverityBadge, alertSeverityBadgeDefault } from "@/lib/status-colors";
import type { AlertState, FleetAlert } from "@/api/fleet-monitor";
import { fleetAlertsApi } from "@/api/fleet-monitor";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";

type TabFilter = "all" | AlertState;

const TAB_ITEMS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "firing", label: "Active" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
];

function severityIcon(severity: string): string {
  switch (severity) {
    case "critical":
      return "\u{1F534}"; // red circle
    case "warning":
      return "\u{1F7E1}"; // yellow circle
    default:
      return "\u{1F535}"; // blue circle
  }
}

function stateLabel(state: AlertState): string {
  switch (state) {
    case "firing":
      return "Active";
    case "acknowledged":
      return "Acknowledged";
    case "resolved":
      return "Resolved";
    default:
      return state;
  }
}

function stateBadgeClass(state: AlertState): string {
  switch (state) {
    case "firing":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "acknowledged":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    case "resolved":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function AlertRow({
  alert,
  onAcknowledge,
  onResolve,
}: {
  alert: FleetAlert;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
      {/* Severity icon */}
      <div className="flex-shrink-0 pt-0.5 text-base">
        {severityIcon(alert.severity)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", alertSeverityBadge[alert.severity] ?? alertSeverityBadgeDefault)}>
            {alert.severity}
          </span>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", stateBadgeClass(alert.state))}>
            {stateLabel(alert.state)}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(alert.firedAt)}</span>
        </div>

        <h3 className="mt-1 text-sm font-medium text-[#2C2420] dark:text-foreground">
          {alert.ruleName}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{alert.message}</p>

        {/* Bot link */}
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          <span>{alert.botEmoji}</span>
          <Link
            to={`/bots/${alert.botId}`}
            className="text-[#D4A373] hover:underline font-medium"
          >
            {alert.botName}
          </Link>
        </div>

        {/* Timestamps */}
        {alert.acknowledgedAt && (
          <div className="mt-1 text-[10px] text-muted-foreground/70">
            Acknowledged {timeAgo(alert.acknowledgedAt)}
          </div>
        )}
        {alert.resolvedAt && (
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">
            Resolved {timeAgo(alert.resolvedAt)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex flex-col gap-1">
        {alert.state === "firing" && (
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="rounded-md border border-[#D4A373]/40 bg-[#D4A373]/10 px-2.5 py-1 text-[11px] font-medium text-[#D4A373] hover:bg-[#D4A373]/20 transition-colors"
          >
            Acknowledge
          </button>
        )}
        {(alert.state === "firing" || alert.state === "acknowledged") && (
          <button
            onClick={() => onResolve(alert.id)}
            className="rounded-md border border-green-400/40 bg-green-400/10 px-2.5 py-1 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-400/20 transition-colors"
          >
            Resolve
          </button>
        )}
      </div>
    </div>
  );
}

export function Alerts() {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const queryState = activeTab === "all" ? undefined : activeTab;
  const { data: alerts, isLoading } = useFleetAlerts(queryState);
  const acknowledgeMutation = useAcknowledgeAlert();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Alerts" }]);
  }, [setBreadcrumbs]);

  const handleAcknowledge = (alertId: string) => {
    acknowledgeMutation.mutate(alertId);
  };

  const handleResolve = async (alertId: string) => {
    await fleetAlertsApi.resolve(alertId);
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.fleet.alerts(selectedCompanyId) });
    }
  };

  // Compute counts per tab
  const allAlerts = alerts ?? [];
  const firingCount = allAlerts.filter((a) => a.state === "firing").length;
  const ackedCount = allAlerts.filter((a) => a.state === "acknowledged").length;
  const resolvedCount = allAlerts.filter((a) => a.state === "resolved").length;

  function tabCount(key: TabFilter): number | undefined {
    switch (key) {
      case "all":
        return allAlerts.length || undefined;
      case "firing":
        return firingCount || undefined;
      case "acknowledged":
        return ackedCount || undefined;
      case "resolved":
        return resolvedCount || undefined;
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#2C2420] dark:text-foreground">
            Fleet Alerts
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor and respond to fleet-wide alerts and notifications
          </p>
        </div>
        {firingCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              {firingCount} active alert{firingCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TAB_ITEMS.map((tab) => {
          const count = tabCount(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "relative px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "text-[#D4A373]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                {tab.label}
                {count != null && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                    activeTab === tab.key
                      ? "bg-[#D4A373]/20 text-[#D4A373]"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {count}
                  </span>
                )}
              </span>
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4A373] rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading alerts...
        </div>
      ) : allAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <div className="text-3xl mb-2">{activeTab === "all" ? "\u2705" : "\u{1F50D}"}</div>
          <p className="text-sm font-medium text-[#2C2420] dark:text-foreground">
            {activeTab === "all" ? "All clear!" : `No ${activeTab} alerts`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === "all"
              ? "Your fleet is running smoothly with no active alerts."
              : `There are no alerts with "${activeTab}" status right now.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {allAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}

      {/* Alert rules summary */}
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-[#2C2420] dark:text-foreground mb-2">
          Active Alert Rules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <RuleCard
            name="Bot Offline > 5 min"
            severity="warning"
            description="Triggers when a bot has been unreachable for over 5 minutes"
          />
          <RuleCard
            name="Health Score Critical"
            severity="critical"
            description="Triggers when bot health score drops below 40 for 2+ minutes"
          />
          <RuleCard
            name="Hourly Cost Spike"
            severity="warning"
            description="Triggers when hourly token cost exceeds $5"
          />
          <RuleCard
            name="Channel Disconnected"
            severity="info"
            description="Triggers when a messaging channel disconnects for over 1 minute"
          />
          <RuleCard
            name="Cron Failure Rate High"
            severity="warning"
            description="Triggers when cron job failure rate exceeds 30%"
          />
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  name,
  severity,
  description,
}: {
  name: string;
  severity: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase", alertSeverityBadge[severity] ?? alertSeverityBadgeDefault)}>
          {severity}
        </span>
        <span className="text-xs font-medium text-[#2C2420] dark:text-foreground">{name}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
