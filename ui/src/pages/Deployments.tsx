/**
 * Fleet Deployments page.
 *
 * Surfaces the deployment orchestrator (server/src/services/fleet-deployment-orchestrator.ts,
 * mounted at /fleet-monitor/deployments). Operators create wave-based rollout plans
 * (prompt/skill/config/gateway changes), dry-run them for a risk + blast-radius preview,
 * then execute / pause / resume / roll back / cancel — with per-wave gate-check progress.
 *
 * Plans are scoped to the selected fleet (fleetId = selectedCompanyId). The orchestrator's
 * execute() runs all waves synchronously and returns the terminal plan, so a single
 * mutation drives a deployment to completion (or rollback) and the list refreshes.
 */

import { useEffect, useMemo, useState } from "react";
import {
  useDeployments,
  useDeploymentStats,
  useCreateDeployment,
  useExecuteDeployment,
  usePauseDeployment,
  useResumeDeployment,
  useRollbackDeployment,
  useCancelDeployment,
  useDryRunDeployment,
  timeAgo,
  useFleetStatus,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { authApi } from "@/api/auth";
import { cn } from "@/lib/utils";
import type {
  DeploymentPlan,
  DeploymentStatus,
  DeploymentStrategyType,
  DeploymentTargetType,
  DeploymentWaveConfig,
  DeploymentDryRunResult,
} from "@/api/fleet-monitor";
import {
  Rocket,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  FlaskConical,
  Plus,
  CheckCircle2,
} from "lucide-react";

type TabFilter = "all" | DeploymentStatus;

const TAB_ITEMS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "rolled_back", label: "Rolled Back" },
  { key: "failed", label: "Failed" },
];

const TARGET_TYPES: { value: DeploymentTargetType; label: string }[] = [
  { value: "prompt_update", label: "Prompt update" },
  { value: "skill_install", label: "Skill install" },
  { value: "skill_update", label: "Skill update" },
  { value: "config_change", label: "Config change" },
  { value: "gateway_upgrade", label: "Gateway upgrade" },
];

const STRATEGY_TYPES: { value: DeploymentStrategyType; label: string; hint: string }[] = [
  { value: "all_at_once", label: "All at once", hint: "1 wave · 100% (highest risk)" },
  { value: "rolling", label: "Rolling", hint: "3 waves · 25 → 50 → 100%" },
  { value: "canary_first", label: "Canary first", hint: "3 waves · 10 → 50 → 100%" },
  { value: "ring_based", label: "Ring based", hint: "4 waves · 10 → 30 → 60 → 100%" },
  { value: "blue_green", label: "Blue / green", hint: "1 wave · 100% (parallel cutover)" },
];

/** Build a sensible default wave set for a strategy (botSelector=percentage). */
function wavesForStrategy(
  strategy: DeploymentStrategyType,
  stabilizationMinutes: number,
): DeploymentWaveConfig[] {
  const pcts: Record<DeploymentStrategyType, number[]> = {
    all_at_once: [100],
    blue_green: [100],
    rolling: [25, 50, 100],
    canary_first: [10, 50, 100],
    ring_based: [10, 30, 60, 100],
  };
  return pcts[strategy].map((pct, i) => ({
    name: `Wave ${i + 1} (${pct}%)`,
    botSelector: "percentage" as const,
    selectorValue: pct,
    stabilizationMinutes,
  }));
}

function statusBadgeClass(status: DeploymentStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    case "in_progress":
    case "rolling_back":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
    case "paused":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "rolled_back":
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

const WAVE_DOT: Record<string, string> = {
  passed: "bg-green-500",
  deploying: "bg-blue-500 animate-pulse",
  stabilizing: "bg-blue-400 animate-pulse",
  gate_checking: "bg-blue-400 animate-pulse",
  failed: "bg-red-500",
  rolled_back: "bg-amber-500",
  pending: "bg-muted-foreground/30",
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
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

function DeploymentCard({
  plan,
  busy,
  onExecute,
  onPause,
  onResume,
  onRollback,
  onCancel,
  onDryRun,
  dryRun,
}: {
  plan: DeploymentPlan;
  busy: boolean;
  onExecute: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRollback: (id: string) => void;
  onCancel: (id: string) => void;
  onDryRun: (id: string) => void;
  dryRun: DeploymentDryRunResult | null;
}) {
  const { status, waves, currentWave } = plan.execution;
  const passedWaves = waves.filter((w) => w.status === "passed").length;
  const canExecute = status === "draft" || status === "queued";
  const canPause = status === "in_progress";
  const canResume = status === "paused";
  const canRollback =
    status === "completed" || status === "paused" || status === "in_progress";
  const canCancel = status === "draft" || status === "queued" || status === "paused";

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <Rocket className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                statusBadgeClass(status),
              )}
            >
              {status.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{plan.id}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(plan.createdAt)}</span>
          </div>

          <h3 className="mt-1 text-sm font-medium text-foreground">{plan.name}</h3>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">{plan.target.type.replace(/_/g, " ")}</span>
            <span className="rounded bg-muted px-1.5 py-0.5">{plan.strategy.type.replace(/_/g, " ")}</span>
            <span>min CQI {plan.strategy.gateChecks.minCqi}</span>
            <span>· rollback {plan.strategy.rollbackPolicy.replace(/_/g, " ")}</span>
            <span>· by {plan.createdBy}</span>
          </div>

          {/* Wave progress */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {waves.map((w) => (
              <span
                key={w.waveIndex}
                title={`${plan.strategy.waves[w.waveIndex]?.name ?? `Wave ${w.waveIndex + 1}`}: ${w.status}`}
                className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-foreground"
              >
                <span className={cn("h-2 w-2 rounded-full", WAVE_DOT[w.status] ?? "bg-muted-foreground/30")} />
                {w.waveIndex + 1}
                {w.gateResult && (
                  <span className="text-muted-foreground">CQI {w.gateResult.metrics.avgCqi.toFixed(0)}</span>
                )}
              </span>
            ))}
            <span className="text-[10px] text-muted-foreground">
              {passedWaves}/{waves.length} waves
              {status === "in_progress" ? ` · on wave ${currentWave + 1}` : ""}
            </span>
          </div>

          {/* Failed wave reason */}
          {waves.some((w) => w.gateResult?.failureReason) && (
            <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
              {waves.find((w) => w.gateResult?.failureReason)?.gateResult?.failureReason}
            </div>
          )}

          {/* Rollback log */}
          {plan.execution.rollbackLog && plan.execution.rollbackLog.length > 0 && (
            <div className="mt-1.5 rounded-md border border-amber-400/30 bg-amber-400/5 p-2 text-[11px] text-foreground">
              <span className="font-medium text-amber-700 dark:text-amber-400">Rolled back</span>{" "}
              {plan.execution.rollbackLog.length} bot
              {plan.execution.rollbackLog.length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Dry-run result */}
          {dryRun && dryRun.planId === plan.id && (
            <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[11px] text-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-primary">
                <FlaskConical className="h-3 w-3" /> Dry-run preview
              </div>
              <div className="text-muted-foreground">
                {dryRun.affectedBots.length} bot{dryRun.affectedBots.length !== 1 ? "s" : ""} affected · est.{" "}
                {dryRun.estimatedDuration.minMinutes}–{dryRun.estimatedDuration.maxMinutes} min
              </div>
              {dryRun.warnings.map((w, i) => (
                <div key={i} className="text-amber-600 dark:text-amber-400">
                  ⚠ {w}
                </div>
              ))}
              {dryRun.blockers.map((b, i) => (
                <div key={i} className="text-red-600 dark:text-red-400">
                  ⛔ {b}
                </div>
              ))}
              {dryRun.warnings.length === 0 && dryRun.blockers.length === 0 && (
                <div className="text-green-600 dark:text-green-400">No warnings or blockers.</div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-col gap-1">
          {canExecute && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onExecute(plan.id)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-3 w-3" /> Execute
            </button>
          )}
          {canExecute && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDryRun(plan.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FlaskConical className="h-3 w-3" /> Dry Run
            </button>
          )}
          {canPause && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPause(plan.id)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Pause className="h-3 w-3" /> Pause
            </button>
          )}
          {canResume && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onResume(plan.id)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-3 w-3" /> Resume
            </button>
          )}
          {canRollback && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRollback(plan.id)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="h-3 w-3" /> Rollback
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancel(plan.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="h-3 w-3" /> Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Deployments() {
  const { selectedCompanyId } = useCompany();
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const statusFilter = activeTab === "all" ? undefined : activeTab;

  const { data, isLoading, isError } = useDeployments(statusFilter);
  const { data: statsData } = useDeploymentStats();
  const { data: fleet } = useFleetStatus();

  const createMutation = useCreateDeployment();
  const executeMutation = useExecuteDeployment();
  const pauseMutation = usePauseDeployment();
  const resumeMutation = useResumeDeployment();
  const rollbackMutation = useRollbackDeployment();
  const cancelMutation = useCancelDeployment();
  const dryRunMutation = useDryRunDeployment();

  const busy =
    executeMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    rollbackMutation.isPending ||
    cancelMutation.isPending ||
    createMutation.isPending;

  // Operator attribution for createdBy (null in local mode).
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
    staleTime: 60_000,
  });
  const operator = session?.user?.name ?? session?.user?.email ?? "Operator";

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Deployments" }]);
  }, [setBreadcrumbs]);

  // Create-form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetType, setTargetType] = useState<DeploymentTargetType>("prompt_update");
  const [strategyType, setStrategyType] = useState<DeploymentStrategyType>("canary_first");
  const [stabilizationMinutes, setStabilizationMinutes] = useState(5);
  const [minCqi, setMinCqi] = useState(70);
  const [rollbackPolicy, setRollbackPolicy] =
    useState<"auto" | "manual" | "auto_with_approval">("auto");

  const [dryRunResult, setDryRunResult] = useState<DeploymentDryRunResult | null>(null);

  const plans = data?.plans ?? [];
  const stats = statsData?.stats;

  const fleetName = useMemo(() => {
    const co = fleet?.bots ?? [];
    return co.length > 0 ? `${co.length} connected` : "no bots connected";
  }, [fleet]);

  const mutationError =
    createMutation.error ??
    executeMutation.error ??
    pauseMutation.error ??
    resumeMutation.error ??
    rollbackMutation.error ??
    cancelMutation.error ??
    dryRunMutation.error;

  const resetForm = () => {
    setName("");
    setTargetType("prompt_update");
    setStrategyType("canary_first");
    setStabilizationMinutes(5);
    setMinCqi(70);
    setRollbackPolicy("auto");
  };

  const handleCreate = () => {
    if (!name.trim() || !selectedCompanyId) return;
    createMutation.mutate(
      {
        fleetId: selectedCompanyId,
        name: name.trim(),
        createdBy: operator,
        target: { type: targetType, payload: {} },
        strategy: {
          type: strategyType,
          waves: wavesForStrategy(strategyType, stabilizationMinutes),
          gateChecks: { minCqi, maxErrorRate: 5, maxLatencyMs: 2000 },
          rollbackPolicy,
          maxParallelUpdates: 5,
        },
      },
      {
        onSuccess: () => {
          resetForm();
          setShowForm(false);
        },
      },
    );
  };

  const handleDryRun = (id: string) => {
    dryRunMutation.mutate(id, {
      onSuccess: (res) => setDryRunResult(res.result),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fleet Deployments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Wave-based rollouts with gate checks and automatic rollback — {fleetName}
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedCompanyId}
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" /> New Deployment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={String(stats?.totalDeployments ?? 0)} />
        <StatCard label="Completed Today" value={String(stats?.completedToday ?? 0)} />
        <StatCard label="Rollbacks Today" value={String(stats?.rollbacksToday ?? 0)} />
        <StatCard
          label="Avg Duration"
          value={stats ? `${stats.avgDurationMinutes.toFixed(1)}m` : "—"}
          hint="completed today"
        />
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">New deployment plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="dep-name" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Name
              </label>
              <input
                id="dep-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Roll out new support prompt"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="dep-target" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Target
              </label>
              <select
                id="dep-target"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as DeploymentTargetType)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dep-strategy" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Strategy
              </label>
              <select
                id="dep-strategy"
                value={strategyType}
                onChange={(e) => setStrategyType(e.target.value as DeploymentStrategyType)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                {STRATEGY_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                {STRATEGY_TYPES.find((s) => s.value === strategyType)?.hint}
              </div>
            </div>
            <div>
              <label htmlFor="dep-rollback" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Rollback policy
              </label>
              <select
                id="dep-rollback"
                value={rollbackPolicy}
                onChange={(e) =>
                  setRollbackPolicy(e.target.value as "auto" | "manual" | "auto_with_approval")
                }
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
                <option value="auto_with_approval">Auto with approval</option>
              </select>
            </div>
            <div>
              <label htmlFor="dep-stab" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Stabilization (min/wave)
              </label>
              <input
                id="dep-stab"
                type="number"
                min={0}
                value={stabilizationMinutes}
                onChange={(e) => setStabilizationMinutes(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="dep-cqi" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Min CQI gate (0–100)
              </label>
              <input
                id="dep-cqi"
                type="number"
                min={0}
                max={100}
                value={minCqi}
                onChange={(e) => setMinCqi(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!name.trim() || createMutation.isPending}
              onClick={handleCreate}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Create plan
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
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

      {/* Deployment list */}
      {!selectedCompanyId ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Select a fleet to view deployments.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading deployments...
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Failed to load deployments. The fleet monitor may be offline.
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <Rocket className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">
            {activeTab === "all" ? "No deployments yet" : `No ${activeTab.replace(/_/g, " ")} deployments`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === "all"
              ? "Create a deployment plan to roll out prompt, skill, or config changes across the fleet."
              : "There are no deployments matching this filter right now."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <DeploymentCard
              key={plan.id}
              plan={plan}
              busy={busy}
              onExecute={executeMutation.mutate}
              onPause={pauseMutation.mutate}
              onResume={resumeMutation.mutate}
              onRollback={rollbackMutation.mutate}
              onCancel={cancelMutation.mutate}
              onDryRun={handleDryRun}
              dryRun={dryRunResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}
