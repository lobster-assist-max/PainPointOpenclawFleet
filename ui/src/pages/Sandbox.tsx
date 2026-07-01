/**
 * Fleet Sandbox page.
 *
 * Surfaces the sandbox environment engine (server/src/services/fleet-sandbox.ts,
 * mounted at /fleet-monitor/sandbox). Operators provision a staging copy of the
 * fleet config, drive it with synthetic / shadow / replay / manual traffic, watch
 * promotion gates evaluate against modeled metrics (deterministically anchored to
 * the real production baseline — there is no separate sandbox fleet to measure),
 * compare sandbox vs production, and promote the validated config overrides to
 * production once all gates pass.
 *
 * Sandboxes are created scoped to the selected fleet (fleetId = selectedCompanyId)
 * and the list is filtered to that fleet client-side. The engine runs traffic +
 * gate evaluation on timers, so the list polls every 10s while any sandbox runs.
 */

import { useEffect, useMemo, useState } from "react";
import {
  useSandboxes,
  useCreateSandbox,
  useStartSandbox,
  usePauseSandbox,
  useDestroySandbox,
  usePromoteSandbox,
  useApproveSandboxGate,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";
import type {
  FleetSandbox,
  SandboxStatus,
  SandboxTrafficSourceType,
  SandboxGateStatus,
  SandboxPromotionGate,
  CreateSandboxRequest,
} from "@/api/fleet-monitor";
import {
  FlaskConical,
  AlertTriangle,
  Play,
  Pause,
  Trash2,
  Rocket,
  Plus,
  CheckCircle2,
  Check,
  ArrowUpCircle,
  ArrowDownCircle,
  Minus,
} from "lucide-react";

const TRAFFIC_TYPES: { value: SandboxTrafficSourceType; label: string; hint: string }[] = [
  { value: "synthetic", label: "Synthetic", hint: "Generated persona traffic" },
  { value: "shadow", label: "Shadow", hint: "Copy % of production (read-only)" },
  { value: "replay", label: "Replay", hint: "Replay historical sessions" },
  { value: "manual", label: "Manual", hint: "No automated traffic" },
];

function statusBadgeClass(status: SandboxStatus): string {
  switch (status) {
    case "running":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    case "ready":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
    case "paused":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    case "provisioning":
    case "destroying":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case "destroyed":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const GATE_DOT: Record<SandboxGateStatus, string> = {
  passed: "bg-green-500",
  failed: "bg-red-500",
  skipped: "bg-muted-foreground/30",
  pending: "bg-amber-400 animate-pulse",
};

function verdictBadge(verdict: "better" | "similar" | "worse") {
  switch (verdict) {
    case "better":
      return {
        cls: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
        icon: <ArrowUpCircle className="h-3 w-3" />,
      };
    case "worse":
      return {
        cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
        icon: <ArrowDownCircle className="h-3 w-3" />,
      };
    default:
      return {
        cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        icon: <Minus className="h-3 w-3" />,
      };
  }
}

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

function GateRow({
  gate,
  busy,
  onApprove,
}: {
  gate: SandboxPromotionGate;
  busy: boolean;
  onApprove: (gateName: string) => void;
}) {
  const canApprove = gate.status === "pending";
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-[11px]">
      <span className="flex items-center gap-1.5 text-foreground">
        <span
          className={cn("h-2 w-2 rounded-full", GATE_DOT[gate.status])}
          aria-label={gate.status}
        />
        {gate.name}
        {gate.currentValue !== undefined && (
          <span className="text-muted-foreground">
            ({gate.currentValue.toFixed(1)}
            {gate.targetValue !== undefined ? ` / ${gate.targetValue}` : ""})
          </span>
        )}
      </span>
      {canApprove && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(gate.name)}
          className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="h-2.5 w-2.5" /> Approve
        </button>
      )}
    </div>
  );
}

function SandboxCard({
  sandbox,
  busy,
  onStart,
  onPause,
  onDestroy,
  onPromote,
  onApproveGate,
}: {
  sandbox: FleetSandbox;
  busy: boolean;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onDestroy: (id: string) => void;
  onPromote: (id: string) => void;
  onApproveGate: (id: string, gateName: string) => void;
}) {
  const { status, stats, promotionGates, comparison, config } = sandbox;
  const canStart = status === "ready" || status === "paused";
  const canPause = status === "running";
  const canDestroy = status !== "destroyed" && status !== "destroying";
  const gatesPassed = promotionGates.filter(
    (g) => g.status === "passed" || g.status === "skipped",
  ).length;
  const allGatesPassed = promotionGates.length > 0 && gatesPassed === promotionGates.length;
  const canPromote = canDestroy && allGatesPassed;
  const verdict = comparison ? verdictBadge(comparison.verdict) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                statusBadgeClass(status),
              )}
            >
              {status}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{sandbox.id}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(sandbox.createdAt)}</span>
            {verdict && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  verdict.cls,
                )}
              >
                {verdict.icon}
                {comparison!.verdict}
              </span>
            )}
          </div>

          <h3 className="mt-1 text-sm font-medium text-foreground">{sandbox.name}</h3>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">
              {config.trafficSource.type} traffic
            </span>
            <span>{stats.totalSessions} sessions</span>
            <span>· ${stats.totalCost.toFixed(2)} / ${config.isolation.maxCostLimit} limit</span>
            <span>· {gatesPassed}/{promotionGates.length} gates</span>
          </div>

          {/* Comparison deltas */}
          {comparison && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
              {(
                [
                  ["CQI", comparison.delta.avgCqi, false],
                  ["Latency", comparison.delta.avgResponseTimeMs, true],
                  ["Errors", comparison.delta.errorRate, true],
                  ["SLA", comparison.delta.slaCompliance, false],
                ] as [string, number, boolean][]
              ).map(([label, delta, lowerBetter]) => {
                const good = lowerBetter ? delta < 0 : delta > 0;
                return (
                  <div
                    key={label}
                    className="rounded bg-muted/40 px-1.5 py-1 text-center"
                  >
                    <div className="text-muted-foreground">{label}</div>
                    <div
                      className={cn(
                        "font-medium",
                        Math.abs(delta) < 0.01
                          ? "text-muted-foreground"
                          : good
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {delta > 0 ? "+" : ""}
                      {Math.abs(delta) > 100 ? delta.toFixed(0) : delta.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Gates */}
          {promotionGates.length > 0 && (
            <div className="mt-2 space-y-1">
              {promotionGates.map((gate) => (
                <GateRow
                  key={gate.name}
                  gate={gate}
                  busy={busy}
                  onApprove={(gateName) => onApproveGate(sandbox.id, gateName)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-col gap-1">
          {canStart && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStart(sandbox.id)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-3 w-3" /> {status === "paused" ? "Resume" : "Start"}
            </button>
          )}
          {canPause && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPause(sandbox.id)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Pause className="h-3 w-3" /> Pause
            </button>
          )}
          {canPromote && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPromote(sandbox.id)}
              className="inline-flex items-center gap-1 rounded-md border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Rocket className="h-3 w-3" /> Promote
            </button>
          )}
          {canDestroy && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDestroy(sandbox.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3 w-3" /> Destroy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Build the engine's required traffic-source config from the chosen type. */
function buildTrafficSource(
  type: SandboxTrafficSourceType,
  messagesPerHour: number,
): CreateSandboxRequest["trafficSource"] {
  if (type === "synthetic") {
    return {
      type,
      syntheticConfig: {
        messagesPerHour: Math.max(1, messagesPerHour),
        topics: [
          { topic: "general_inquiry", weight: 3 },
          { topic: "technical_support", weight: 2 },
          { topic: "billing", weight: 1 },
        ],
        channels: ["test"],
        personas: [
          { name: "Friendly Customer", behavior: "friendly", language: "zh-TW", topics: ["general_inquiry"] },
          { name: "Technical User", behavior: "technical", language: "en", topics: ["technical_support"] },
        ],
      },
    };
  }
  if (type === "shadow") {
    return { type, shadowConfig: { sampleRate: 0.1, delay: "realtime" } };
  }
  if (type === "replay") {
    return { type, replayConfig: { sessionIds: [], speedMultiplier: 2 } };
  }
  return { type };
}

export function Sandbox() {
  const { selectedCompanyId } = useCompany();
  const [showDestroyed, setShowDestroyed] = useState(false);

  const { data, isLoading, isError } = useSandboxes(showDestroyed);

  const createMutation = useCreateSandbox();
  const startMutation = useStartSandbox();
  const pauseMutation = usePauseSandbox();
  const destroyMutation = useDestroySandbox();
  const promoteMutation = usePromoteSandbox();
  const approveGateMutation = useApproveSandboxGate();

  const busy =
    createMutation.isPending ||
    startMutation.isPending ||
    pauseMutation.isPending ||
    destroyMutation.isPending ||
    promoteMutation.isPending ||
    approveGateMutation.isPending;

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Sandbox" }]);
  }, [setBreadcrumbs]);

  // Create-form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [trafficType, setTrafficType] = useState<SandboxTrafficSourceType>("synthetic");
  const [messagesPerHour, setMessagesPerHour] = useState(120);
  const [maxCostLimit, setMaxCostLimit] = useState(10);

  // Filter to the selected fleet (engine stores all sandboxes globally).
  const sandboxes = useMemo(
    () =>
      (data?.sandboxes ?? []).filter(
        (s) => !selectedCompanyId || s.fleetId === selectedCompanyId,
      ),
    [data, selectedCompanyId],
  );

  const activeCount = sandboxes.filter((s) => s.status === "running").length;
  const totalCost = sandboxes.reduce((sum, s) => sum + s.stats.totalCost, 0);
  const totalSessions = sandboxes.reduce((sum, s) => sum + s.stats.totalSessions, 0);

  const mutationError =
    createMutation.error ??
    startMutation.error ??
    pauseMutation.error ??
    destroyMutation.error ??
    promoteMutation.error ??
    approveGateMutation.error;

  const resetForm = () => {
    setName("");
    setTrafficType("synthetic");
    setMessagesPerHour(120);
    setMaxCostLimit(10);
  };

  const handleCreate = () => {
    if (!name.trim() || !selectedCompanyId) return;
    createMutation.mutate(
      {
        name: name.trim(),
        fleetId: selectedCompanyId,
        trafficSource: buildTrafficSource(trafficType, messagesPerHour),
        isolation: { maxCostLimit: Math.max(0.1, maxCostLimit) },
      },
      {
        onSuccess: () => {
          resetForm();
          setShowForm(false);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fleet Sandbox</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stage config changes against synthetic traffic, pass promotion gates, then promote to production
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedCompanyId}
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" /> New Sandbox
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Sandboxes" value={String(sandboxes.length)} />
        <StatCard label="Running" value={String(activeCount)} />
        <StatCard label="Total Sessions" value={String(totalSessions)} />
        <StatCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} hint="across sandboxes" />
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">New sandbox environment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sbx-name" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Name
              </label>
              <input
                id="sbx-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Test cheaper model on support"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sbx-traffic" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Traffic source
              </label>
              <select
                id="sbx-traffic"
                value={trafficType}
                onChange={(e) => setTrafficType(e.target.value as SandboxTrafficSourceType)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                {TRAFFIC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                {TRAFFIC_TYPES.find((t) => t.value === trafficType)?.hint}
              </div>
            </div>
            {trafficType === "synthetic" && (
              <div>
                <label htmlFor="sbx-mph" className="block text-[11px] font-medium text-muted-foreground mb-1">
                  Messages / hour
                </label>
                <input
                  id="sbx-mph"
                  type="number"
                  min={1}
                  value={messagesPerHour}
                  onChange={(e) => setMessagesPerHour(Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            )}
            <div>
              <label htmlFor="sbx-cost" className="block text-[11px] font-medium text-muted-foreground mb-1">
                Max cost limit (USD)
              </label>
              <input
                id="sbx-cost"
                type="number"
                min={0.1}
                step={0.1}
                value={maxCostLimit}
                onChange={(e) => setMaxCostLimit(Math.max(0.1, Number(e.target.value)))}
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
              <CheckCircle2 className="h-3.5 w-3.5" /> Create sandbox
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

      {/* Show-destroyed toggle */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowDestroyed((v) => !v)}
          aria-pressed={showDestroyed}
          className={cn(
            "text-[11px] font-medium transition-colors",
            showDestroyed ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {showDestroyed ? "Hide destroyed" : "Show destroyed"}
        </button>
      </div>

      {/* Mutation error banner */}
      {mutationError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {mutationError instanceof Error ? mutationError.message : "Action failed"}
        </div>
      )}

      {/* Sandbox list */}
      {!selectedCompanyId ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Select a fleet to view sandboxes.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading sandboxes...
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Failed to load sandboxes. The fleet monitor may be offline.
        </div>
      ) : sandboxes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">No sandboxes yet</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            Create a sandbox to test prompt, model, or config changes against synthetic traffic before
            promoting them to production. Promotion gates (CQI, error rate, latency) must pass first.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sandboxes.map((sandbox) => (
            <SandboxCard
              key={sandbox.id}
              sandbox={sandbox}
              busy={busy}
              onStart={startMutation.mutate}
              onPause={pauseMutation.mutate}
              onDestroy={destroyMutation.mutate}
              onPromote={promoteMutation.mutate}
              onApproveGate={(id, gateName) => approveGateMutation.mutate({ id, gateName })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
