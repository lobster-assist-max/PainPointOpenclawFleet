/**
 * Fleet Anomaly Correlation page.
 *
 * Surfaces cross-bot anomaly correlations: when multiple alerts fire in a
 * short window across bots that share infrastructure (host / network / model /
 * channel), the correlation engine groups them, infers a probable root cause,
 * and suggests remediation. Correlations are fed live by the fleet-bootstrap
 * `alert.fired` → engine.ingestAlert pipeline; operators can mark each as
 * resolved or as a false positive (the latter is recorded for future learning).
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import {
  useCorrelations,
  useCorrelationStats,
  useResolveCorrelation,
  useMarkCorrelationFalsePositive,
  timeAgo,
  useFleetStatus,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type { AnomalyCorrelation, RootCauseCategory } from "@/api/fleet-monitor";
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Network,
  ShieldOff,
  Zap,
} from "lucide-react";

type TabFilter = "all" | "investigating" | "confirmed" | "resolved" | "false_positive";

const TAB_ITEMS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "investigating", label: "Investigating" },
  { key: "confirmed", label: "Confirmed" },
  { key: "resolved", label: "Resolved" },
  { key: "false_positive", label: "False Positive" },
];

const ROOT_CAUSE_LABEL: Record<RootCauseCategory, string> = {
  infrastructure: "Infrastructure",
  provider: "LLM Provider",
  channel: "Channel",
  config: "Configuration",
  traffic: "Traffic Spike",
  unknown: "Unknown",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "investigating":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    case "confirmed":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "resolved":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
    case "false_positive":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "immediate":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "soon":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
  }
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.75) return "text-red-600 dark:text-red-400";
  if (confidence >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
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

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-[10px] text-muted-foreground">{label}</span>
      <div
        className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct}%`}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function CorrelationCard({
  correlation,
  botLabel,
  onResolve,
  onFalsePositive,
  busy,
}: {
  correlation: AnomalyCorrelation;
  botLabel: (botId: string) => { emoji: string; name: string };
  onResolve: (id: string) => void;
  onFalsePositive: (id: string) => void;
  busy: boolean;
}) {
  const { rootCause, correlation: scores, topology, relatedAlerts, suggestedActions } = correlation;
  const isClosed = correlation.status === "resolved" || correlation.status === "false_positive";

  const sharedTags = [
    topology.sharedHost && "host",
    topology.sharedNetwork && "network",
    topology.sharedModel && "model",
    topology.sharedChannel && "channel",
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <GitMerge
            className={cn(
              "h-4 w-4",
              correlation.status === "confirmed"
                ? "text-red-500"
                : correlation.status === "investigating"
                  ? "text-amber-500"
                  : "text-muted-foreground",
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
              {ROOT_CAUSE_LABEL[rootCause.category]}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                statusBadgeClass(correlation.status),
              )}
            >
              {correlation.status.replace("_", " ")}
            </span>
            <span className={cn("text-[11px] font-semibold", confidenceColor(scores.overallConfidence))}>
              {Math.round(scores.overallConfidence * 100)}% confidence
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(correlation.detectedAt)}</span>
          </div>

          <p className="mt-1 text-sm font-medium text-foreground">{rootCause.description}</p>

          {/* Shared infrastructure */}
          {sharedTags.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-xs">
              <Network className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Shared:</span>
              {sharedTags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Affected bots */}
          {rootCause.affectedBots.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">Affected:</span>
              {rootCause.affectedBots.map((botId) => {
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

          {/* Related alerts */}
          {relatedAlerts.length > 0 && (
            <div className="mt-2 rounded-md border border-border bg-muted/30 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {relatedAlerts.length} correlated alert{relatedAlerts.length !== 1 ? "s" : ""}
              </div>
              <div className="space-y-0.5">
                {relatedAlerts.map((a) => (
                  <div key={a.alertId} className="flex items-center gap-2 text-[11px]">
                    <AlertTriangle
                      className={cn(
                        "h-3 w-3 flex-shrink-0",
                        a.severity === "critical" ? "text-red-500" : "text-amber-500",
                      )}
                    />
                    <span className="text-foreground">{botLabel(a.botId).name}</span>
                    <span className="text-muted-foreground">
                      {a.metric} = {a.value} (threshold {a.threshold})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence */}
          {rootCause.evidence.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
              {rootCause.evidence.map((e, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-muted-foreground/50">·</span>
                  {e}
                </li>
              ))}
            </ul>
          )}

          {/* Correlation scores */}
          <div className="mt-2 space-y-1">
            <ScoreBar label="Temporal" value={scores.temporalScore} />
            <ScoreBar label="Infrastructure" value={scores.infrastructureScore} />
            <ScoreBar label="Metric pattern" value={scores.metricCorrelation} />
          </div>

          {/* Suggested actions */}
          {suggestedActions.length > 0 && (
            <div className="mt-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Suggested actions
              </div>
              <div className="space-y-1">
                {suggestedActions.map((action, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-border bg-background p-2"
                  >
                    <Zap className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-medium text-foreground">{action.action}</span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-semibold uppercase",
                            priorityBadgeClass(action.priority),
                          )}
                        >
                          {action.priority}
                        </span>
                        {action.automated && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            auto
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80">{action.expectedImpact}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {correlation.status === "resolved" && correlation.resolvedAt && (
            <div className="mt-2 text-[10px] text-muted-foreground/70">
              Resolved {timeAgo(correlation.resolvedAt)}
              {correlation.resolvedBy ? ` by ${correlation.resolvedBy}` : ""}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isClosed && (
          <div className="flex-shrink-0 flex flex-col gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(correlation.id)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-3 w-3" /> Resolve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onFalsePositive(correlation.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldOff className="h-3 w-3" /> False positive
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Anomaly() {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const statusFilter = activeTab === "all" ? undefined : activeTab;
  const { data, isLoading, isError } = useCorrelations(statusFilter);
  const { data: stats } = useCorrelationStats();
  const { data: fleet } = useFleetStatus();

  const resolveMutation = useResolveCorrelation();
  const fpMutation = useMarkCorrelationFalsePositive();
  const busy = resolveMutation.isPending || fpMutation.isPending;

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Anomalies" }]);
  }, [setBreadcrumbs]);

  // Build a botId → emoji/name lookup from live fleet status.
  const botLabel = useMemo(() => {
    const map = new Map<string, { emoji: string; name: string }>();
    for (const bot of fleet?.bots ?? []) {
      map.set(bot.botId, { emoji: bot.emoji ?? "\u{1F916}", name: bot.name ?? bot.botId });
    }
    return (botId: string) => map.get(botId) ?? { emoji: "\u{1F916}", name: botId };
  }, [fleet]);

  const correlations = data?.correlations ?? [];
  const mutationError = resolveMutation.error ?? fpMutation.error;
  const activeCount = stats?.active ?? correlations.filter((c) => c.status === "investigating").length;

  const handleResolve = (id: string) => resolveMutation.mutate({ id });
  const handleFalsePositive = (id: string) => fpMutation.mutate(id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Anomaly Correlation</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cross-bot alert correlation &amp; root-cause analysis — auto-detected from clustered alerts
          </p>
        </div>
        {activeCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {activeCount} active correlation{activeCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Active" value={String(stats?.active ?? 0)} />
        <MetricCard label="Resolved" value={String(stats?.resolved ?? 0)} />
        <MetricCard label="False Positives" value={String(stats?.falsePositives ?? 0)} />
        <MetricCard
          label="Avg Confidence"
          value={stats ? `${Math.round(stats.avgConfidence * 100)}%` : "—"}
          hint="across all correlations"
        />
      </div>

      {/* Top root causes */}
      {stats && stats.topRootCauses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Top root causes:</span>
          {stats.topRootCauses.map((rc) => (
            <span
              key={rc.category}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
            >
              {ROOT_CAUSE_LABEL[rc.category as RootCauseCategory] ?? rc.category}
              <span className="font-semibold text-muted-foreground">{rc.count}</span>
            </span>
          ))}
        </div>
      )}

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

      {/* Correlation list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading correlations...
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Failed to load correlations. The fleet monitor may be offline.
        </div>
      ) : correlations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <div className="text-3xl mb-2">{activeTab === "all" ? "✅" : "\u{1F50D}"}</div>
          <p className="text-sm font-medium text-foreground">
            {activeTab === "all" ? "No anomaly correlations" : `No ${activeTab.replace("_", " ")} correlations`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === "all"
              ? "When multiple alerts cluster across related bots, they'll be correlated here with a probable root cause."
              : `There are no correlations with this status right now.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {correlations.map((correlation) => (
            <CorrelationCard
              key={correlation.id}
              correlation={correlation}
              botLabel={botLabel}
              onResolve={handleResolve}
              onFalsePositive={handleFalsePositive}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
