/**
 * Fleet Incidents page.
 *
 * Lists fleet incidents (open + resolved) with severity/status filtering,
 * MTTR/MTTI metrics, and acknowledge / escalate / resolve lifecycle actions.
 * Incidents are auto-opened from critical/warning alerts (see fleet-bootstrap
 * `alert.fired` → incident feed) and can also be filed manually via the API.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import {
  useIncidents,
  useIncidentMetrics,
  useAcknowledgeIncident,
  useEscalateIncident,
  useResolveIncident,
  timeAgo,
  useFleetStatus,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { authApi } from "@/api/auth";
import { cn } from "@/lib/utils";
import type { Incident } from "@/api/fleet-monitor";
import { AlertTriangle, ArrowUpCircle, CheckCircle2, ShieldCheck } from "lucide-react";

type TabFilter = "all" | "open" | "acknowledged" | "escalated" | "resolved";

const TAB_ITEMS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "escalated", label: "Escalated" },
  { key: "resolved", label: "Resolved" },
];

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "major":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300";
    case "minor":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "acknowledged":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    case "escalated":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300";
    case "resolved":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

function IncidentRow({
  incident,
  botLabel,
  onAcknowledge,
  onEscalate,
  onResolve,
  busy,
}: {
  incident: Incident;
  botLabel: (botId: string) => { emoji: string; name: string };
  onAcknowledge: (id: string) => void;
  onEscalate: (id: string) => void;
  onResolve: (id: string, summary: string) => void;
  busy: boolean;
}) {
  const [resolving, setResolving] = useState(false);
  const [summary, setSummary] = useState("");
  const isResolved = incident.status === "resolved";

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <AlertTriangle
            className={cn(
              "h-4 w-4",
              incident.severity === "critical"
                ? "text-red-500"
                : incident.severity === "major"
                  ? "text-orange-500"
                  : incident.severity === "minor"
                    ? "text-amber-500"
                    : "text-blue-500",
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                severityBadgeClass(incident.severity),
              )}
            >
              {incident.severity}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                statusBadgeClass(incident.status),
              )}
            >
              {incident.status}
            </span>
            {incident.escalationLevel > 0 && (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                L{incident.escalationLevel}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo(incident.createdAt)}</span>
          </div>

          <h3 className="mt-1 text-sm font-medium text-foreground">{incident.title}</h3>
          {incident.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{incident.description}</p>
          )}

          {/* Affected bots */}
          {incident.affectedBots.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">Affected:</span>
              {incident.affectedBots.map((botId) => {
                const { emoji, name } = botLabel(botId);
                return (
                  <Link
                    key={botId}
                    to={`/bots/${botId}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <span>{emoji}</span>
                    {name}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-1 text-[10px] text-muted-foreground/70">Source: {incident.source}</div>

          {/* Lifecycle timestamps */}
          {incident.acknowledgedAt && (
            <div className="mt-1 text-[10px] text-muted-foreground/70">
              Acknowledged {timeAgo(incident.acknowledgedAt)}
              {incident.acknowledgedBy ? ` by ${incident.acknowledgedBy.name}` : ""}
            </div>
          )}
          {incident.resolution && (
            <div className="mt-1 rounded-md border border-green-400/30 bg-green-400/5 p-2 text-[11px] text-foreground">
              <span className="font-medium text-green-700 dark:text-green-400">Resolution:</span>{" "}
              {incident.resolution.summary}
              {incident.resolvedAt && (
                <span className="text-muted-foreground/70"> · {timeAgo(incident.resolvedAt)}</span>
              )}
            </div>
          )}

          {/* Inline resolve form */}
          {resolving && !isResolved && (
            <div className="mt-2 space-y-2">
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Resolution summary (what fixed it)…"
                rows={2}
                aria-label="Resolution summary"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!summary.trim() || busy}
                  onClick={() => onResolve(incident.id, summary.trim())}
                  className="rounded-md border border-green-400/40 bg-green-400/10 px-2.5 py-1 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Resolve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResolving(false);
                    setSummary("");
                  }}
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isResolved && !resolving && (
          <div className="flex-shrink-0 flex flex-col gap-1">
            {!incident.acknowledgedBy && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAcknowledge(incident.id)}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="h-3 w-3" /> Acknowledge
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onEscalate(incident.id)}
              className="inline-flex items-center gap-1 rounded-md border border-purple-400/40 bg-purple-400/10 px-2.5 py-1 text-[11px] font-medium text-purple-700 dark:text-purple-400 hover:bg-purple-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUpCircle className="h-3 w-3" /> Escalate
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setResolving(true)}
              className="inline-flex items-center gap-1 rounded-md border border-green-400/40 bg-green-400/10 px-2.5 py-1 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-3 w-3" /> Resolve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Incidents() {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const statusFilter = activeTab === "all" ? undefined : activeTab;
  const { data, isLoading, isError } = useIncidents(statusFilter);
  const { data: metricsData } = useIncidentMetrics();
  const { data: fleet } = useFleetStatus();

  const ackMutation = useAcknowledgeIncident();
  const escalateMutation = useEscalateIncident();
  const resolveMutation = useResolveIncident();
  const busy = ackMutation.isPending || escalateMutation.isPending || resolveMutation.isPending;

  // Resolve the acting operator for acknowledge attribution (null in local mode).
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
    staleTime: 60_000,
  });
  const actor = useMemo(
    () => ({
      userId: session?.user?.id ?? "local-operator",
      name: session?.user?.name ?? session?.user?.email ?? "Operator",
    }),
    [session],
  );

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Incidents" }]);
  }, [setBreadcrumbs]);

  // Build a botId → emoji/name lookup from live fleet status.
  const botLabel = useMemo(() => {
    const map = new Map<string, { emoji: string; name: string }>();
    for (const bot of fleet?.bots ?? []) {
      map.set(bot.botId, { emoji: bot.emoji ?? "\u{1F916}", name: bot.name ?? bot.botId });
    }
    return (botId: string) => map.get(botId) ?? { emoji: "\u{1F916}", name: botId };
  }, [fleet]);

  const incidents = data?.incidents ?? [];
  const metrics = metricsData?.metrics;
  const mutationError =
    ackMutation.error ?? escalateMutation.error ?? resolveMutation.error;

  const handleAcknowledge = (id: string) => ackMutation.mutate({ id, by: actor });
  const handleEscalate = (id: string) => escalateMutation.mutate(id);
  const handleResolve = (id: string, summary: string) =>
    resolveMutation.mutate({ id, resolution: { summary } });

  const openCount = metrics?.open ?? incidents.filter((i) => i.status !== "resolved").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fleet Incidents</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track and resolve operational incidents — auto-opened from critical alerts
          </p>
        </div>
        {openCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              {openCount} open incident{openCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Open" value={String(metrics?.open ?? 0)} />
        <MetricCard label="Resolved" value={String(metrics?.resolved ?? 0)} />
        <MetricCard
          label="Avg MTTI"
          value={metrics ? `${metrics.avgMttiMinutes}m` : "—"}
          hint="time to acknowledge"
        />
        <MetricCard
          label="Avg MTTR"
          value={metrics ? `${metrics.avgMttrMinutes}m` : "—"}
          hint="time to resolve"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TAB_ITEMS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={cn(
              "relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              activeTab === tab.key
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Mutation error banner */}
      {mutationError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {mutationError instanceof Error ? mutationError.message : "Action failed"}
        </div>
      )}

      {/* Incident list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading incidents...
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Failed to load incidents. The fleet monitor may be offline.
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <div className="text-3xl mb-2">{activeTab === "all" ? "✅" : "\u{1F50D}"}</div>
          <p className="text-sm font-medium text-foreground">
            {activeTab === "all" ? "No incidents" : `No ${activeTab} incidents`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === "all"
              ? "Your fleet has no incidents. Critical alerts will open incidents automatically."
              : `There are no incidents with "${activeTab}" status right now.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              botLabel={botLabel}
              onAcknowledge={handleAcknowledge}
              onEscalate={handleEscalate}
              onResolve={handleResolve}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
