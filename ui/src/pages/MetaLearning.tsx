/**
 * Fleet Meta-Learning (Optimization) page.
 *
 * Surfaces the adaptive meta-learning engine that observes every fleet engine's
 * tunable parameters (routing weights, healing thresholds, delegation policy,
 * …), runs a UCB1 bandit over outcome metrics, and proposes parameter changes
 * with evidence + expected improvement. The engine is a global in-memory
 * singleton started by fleet-bootstrap; operators can apply or reject each
 * suggestion (applying activates a safety guard that auto-reverts on
 * degradation), inspect parameter sensitivity, review the learning history, and
 * toggle the auto-apply master switch.
 */

import { useEffect, useState } from "react";
import {
  useMetaObservables,
  useMetaSuggestions,
  useMetaSensitivity,
  useMetaHistory,
  useMetaConfig,
  useMetaStats,
  useApplyMetaSuggestion,
  useRejectMetaSuggestion,
  useUpdateMetaConfig,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type { MetaSuggestion, SensitivityAnalysis } from "@/api/fleet-monitor";
import {
  AlertTriangle,
  Beaker,
  Brain,
  CheckCircle2,
  Lightbulb,
  Sliders,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

type TabFilter = "suggestions" | "parameters" | "sensitivity" | "history";

const TAB_ITEMS: { key: TabFilter; label: string }[] = [
  { key: "suggestions", label: "Suggestions" },
  { key: "parameters", label: "Parameters" },
  { key: "sensitivity", label: "Sensitivity" },
  { key: "history", label: "History" },
];

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

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
}

function SuggestionCard({
  suggestion,
  onApply,
  onReject,
  busy,
}: {
  suggestion: MetaSuggestion;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  busy: boolean;
}) {
  const { expectedImprovement: ei } = suggestion;
  const isPending = suggestion.status === "pending";
  const improving = ei.expectedValue >= ei.currentValue;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <Lightbulb
            className={cn(
              "h-4 w-4",
              isPending ? "text-amber-500" : "text-muted-foreground",
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
              {suggestion.engine}
            </span>
            <span className="font-mono text-[11px] text-foreground">{suggestion.parameter}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                suggestion.status === "applied"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                  : suggestion.status === "pending"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    : suggestion.status === "reverted"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {suggestion.status}
            </span>
            {suggestion.autoApply && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                auto
              </span>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo(suggestion.createdAt)}</span>
          </div>

          {/* Value change */}
          <div className="mt-1.5 flex items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground line-through">
              {formatNum(suggestion.currentValue)}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="font-mono font-semibold text-foreground">
              {formatNum(suggestion.suggestedValue)}
            </span>
          </div>

          {/* Expected improvement */}
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            {improving ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            )}
            <span className="text-muted-foreground">{ei.metric}:</span>
            <span className="font-medium text-foreground">
              {formatNum(ei.currentValue)} → {formatNum(ei.expectedValue)}
            </span>
            <span className="text-muted-foreground/70">
              ({Math.round(ei.confidence * 100)}% confidence)
            </span>
          </div>

          {/* Evidence */}
          {suggestion.evidence && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{suggestion.evidence}</p>
          )}

          {suggestion.status === "reverted" && suggestion.revertReason && (
            <div className="mt-1.5 text-[10px] text-red-600 dark:text-red-400">
              Reverted: {suggestion.revertReason}
            </div>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex-shrink-0 flex flex-col gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply(suggestion.id)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-3 w-3" /> Apply
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReject(suggestion.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="h-3 w-3" /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SensitivityBar({ item }: { item: SensitivityAnalysis }) {
  const pct = Math.round(Math.max(0, Math.min(1, item.sensitivity)) * 100);
  const directionColor =
    item.direction === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : item.direction === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
          {item.engine}
        </span>
        <span className="font-mono text-[11px] text-foreground">{item.parameter}</span>
        <span className="text-[10px] text-muted-foreground">
          affects <span className="font-medium text-foreground">{item.primaryMetric}</span>
        </span>
        <span className={cn("text-[10px] font-medium", directionColor)}>{item.direction}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div
          className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${item.parameter} sensitivity: ${pct}%`}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground/70">{item.sampleCount} samples</div>
    </div>
  );
}

export function MetaLearning() {
  const [activeTab, setActiveTab] = useState<TabFilter>("suggestions");

  const { data: stats } = useMetaStats();
  const { data: configData } = useMetaConfig();
  const { data: suggestionsData, isLoading: suggestionsLoading, isError: suggestionsError } =
    useMetaSuggestions(activeTab === "suggestions" ? "pending" : undefined);
  const { data: observablesData, isLoading: obsLoading, isError: obsError } = useMetaObservables();
  const { data: sensitivityData, isLoading: sensLoading, isError: sensError } = useMetaSensitivity();
  const { data: historyData, isLoading: histLoading, isError: histError } = useMetaHistory(50);

  const applyMutation = useApplyMetaSuggestion();
  const rejectMutation = useRejectMetaSuggestion();
  const configMutation = useUpdateMetaConfig();
  const busy = applyMutation.isPending || rejectMutation.isPending;

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Optimization" }]);
  }, [setBreadcrumbs]);

  const config = configData?.config;
  const suggestions = suggestionsData?.suggestions ?? [];
  const observables = observablesData?.observables ?? [];
  const sensitivity = sensitivityData?.analysis ?? [];
  const history = historyData?.history ?? [];
  const mutationError = applyMutation.error ?? rejectMutation.error ?? configMutation.error;

  const handleApply = (id: string) => applyMutation.mutate(id);
  const handleReject = (id: string) => rejectMutation.mutate(id);
  const toggleAutoApply = () => {
    if (config) configMutation.mutate({ autoApply: !config.autoApply });
  };
  const toggleEnabled = () => {
    if (config) configMutation.mutate({ enabled: !config.enabled });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Meta-Learning Optimization
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Adaptive parameter tuning across every fleet engine — UCB1 bandit over outcome metrics
          </p>
        </div>
        {config && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleEnabled}
              aria-pressed={config.enabled}
              disabled={configMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                config.enabled
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  config.enabled ? "bg-emerald-500" : "bg-muted-foreground",
                )}
              />
              {config.enabled ? "Learning on" : "Learning off"}
            </button>
            <button
              type="button"
              onClick={toggleAutoApply}
              aria-pressed={config.autoApply}
              disabled={configMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                config.autoApply
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-400"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <Beaker className="h-3.5 w-3.5" />
              Auto-apply {config.autoApply ? "on" : "off"}
            </button>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Observables" value={String(stats?.totalObservables ?? 0)} hint="tunable parameters" />
        <MetricCard label="Suggestions" value={String(stats?.totalSuggestions ?? 0)} hint={`${stats?.appliedSuggestions ?? 0} applied`} />
        <MetricCard label="Observations" value={String(stats?.totalObservations ?? 0)} hint="recorded changes" />
        <MetricCard
          label="Avg Improvement"
          value={stats ? `${stats.avgImprovementScore > 0 ? "+" : ""}${stats.avgImprovementScore}` : "—"}
          hint={`${stats?.revertedSuggestions ?? 0} reverted`}
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
              activeTab === tab.key ? "text-primary" : "text-muted-foreground hover:text-foreground",
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

      {/* ─── Suggestions ─── */}
      {activeTab === "suggestions" && (
        suggestionsLoading ? (
          <Loading label="suggestions" />
        ) : suggestionsError ? (
          <LoadError label="suggestions" />
        ) : suggestions.length === 0 ? (
          <Empty
            icon="💡"
            title="No pending suggestions"
            hint="As the engine accumulates outcome data, it proposes parameter changes here with evidence and expected improvement."
          />
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onApply={handleApply}
                onReject={handleReject}
                busy={busy}
              />
            ))}
          </div>
        )
      )}

      {/* ─── Parameters ─── */}
      {activeTab === "parameters" && (
        obsLoading ? (
          <Loading label="parameters" />
        ) : obsError ? (
          <LoadError label="parameters" />
        ) : observables.length === 0 ? (
          <Empty icon="🎛️" title="No observable parameters" hint="The engine registers tunable parameters from each fleet engine on startup." />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm" aria-label="Observable parameters">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Engine</th>
                  <th className="px-3 py-2 font-medium">Parameter</th>
                  <th className="px-3 py-2 font-medium text-right">Value</th>
                  <th className="px-3 py-2 font-medium text-right">Range</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {observables.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                        {o.engine}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] text-foreground">{o.parameter}</div>
                      <div className="text-[10px] text-muted-foreground/70">{o.description}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                      {formatNum(o.currentValue)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[10px] text-muted-foreground">
                      {formatNum(o.valueRange.min)}–{formatNum(o.valueRange.max)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          o.changedBy === "meta-learning"
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {o.changedBy}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── Sensitivity ─── */}
      {activeTab === "sensitivity" && (
        sensLoading ? (
          <Loading label="sensitivity analysis" />
        ) : sensError ? (
          <LoadError label="sensitivity analysis" />
        ) : sensitivity.length === 0 ? (
          <Empty
            icon="📊"
            title="No sensitivity data yet"
            hint="Once enough observations accumulate, the engine ranks which parameters most affect fleet outcomes."
          />
        ) : (
          <div className="space-y-2">
            {sensitivity.map((item, i) => (
              <SensitivityBar key={`${item.engine}.${item.parameter}.${i}`} item={item} />
            ))}
          </div>
        )
      )}

      {/* ─── History ─── */}
      {activeTab === "history" && (
        histLoading ? (
          <Loading label="learning history" />
        ) : histError ? (
          <LoadError label="learning history" />
        ) : history.length === 0 ? (
          <Empty
            icon="🕓"
            title="No learning history yet"
            hint="Every parameter change and its measured before/after impact is recorded here."
          />
        ) : (
          <div className="space-y-2">
            {history.map((obs) => (
              <div key={obs.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-[11px] text-foreground">{obs.observableId}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatNum(obs.oldValue)} → {formatNum(obs.newValue)}
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(obs.timestamp)}</span>
                  <span
                    className={cn(
                      "ml-auto inline-flex items-center gap-1 text-[11px] font-semibold",
                      obs.impact.overallScore >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {obs.impact.overallScore >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {obs.impact.overallScore > 0 ? "+" : ""}
                    {obs.impact.overallScore}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>CQI {obs.impact.cqiChange > 0 ? "+" : ""}{formatNum(obs.impact.cqiChange)}</span>
                  <span>Cost {obs.impact.costChange > 0 ? "+" : ""}{formatNum(obs.impact.costChange)}</span>
                  <span>SLA {obs.impact.slaComplianceChange > 0 ? "+" : ""}{formatNum(obs.impact.slaComplianceChange)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
      Loading {label}...
    </div>
  );
}

function LoadError({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      Failed to load {label}. The fleet monitor may be offline.
    </div>
  );
}

function Empty({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 max-w-md">{hint}</p>
    </div>
  );
}
