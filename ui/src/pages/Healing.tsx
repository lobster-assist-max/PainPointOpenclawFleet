/**
 * Fleet Self-Healing page.
 *
 * Surfaces the HealingPolicyEngine: automated remediation policies, the global
 * kill switch, recent remediation attempts, and the audit log. Policies
 * evaluate the shared bot-metrics cache every 30s and actuate remediation
 * (reconnect, notify_operator, …) with retry + escalation. The flagship
 * Auto-Reconnect policy genuinely reconnects offline bots via the gateway.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import {
  useHealingPolicies,
  useHealingStats,
  useHealingAttempts,
  useHealingAudit,
  useToggleHealingPause,
  useSetHealingPolicyEnabled,
  useCreateHealingPolicy,
  useDeleteHealingPolicy,
  timeAgo,
  useFleetStatus,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type {
  HealingPolicy,
  HealingAttempt,
  HealingAuditEntry,
  HealingMetric,
  HealingOperator,
  RemediationAction,
  HealingAttemptStatus,
  CreateHealingPolicy,
} from "@/api/fleet-monitor";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Pause,
  Play,
  Plus,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";

type TabKey = "policies" | "attempts" | "audit";

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: "policies", label: "Policies" },
  { key: "attempts", label: "Attempts" },
  { key: "audit", label: "Audit Log" },
];

const METRIC_OPTIONS: HealingMetric[] = [
  "health_score", "cost_1h", "cost_24h", "uptime", "error_rate",
  "channel_disconnected", "bot_offline_duration", "cron_failure_rate", "latency_avg",
];
const OPERATOR_OPTIONS: HealingOperator[] = ["lt", "gt", "eq", "gte", "lte"];
const ACTION_OPTIONS: RemediationAction[] = [
  "reconnect", "restart_channel", "downgrade_model", "restart_bot",
  "clear_session_cache", "throttle_requests", "notify_operator",
];

const OPERATOR_LABEL: Record<HealingOperator, string> = {
  lt: "<", gt: ">", eq: "=", gte: "≥", lte: "≤",
};

function statusBadgeClass(status: HealingAttemptStatus): string {
  switch (status) {
    case "succeeded":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "escalated":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300";
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
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

function fmtMs(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

function PolicyCard({
  policy,
  onToggle,
  onDelete,
  busy,
}: {
  policy: HealingPolicy;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const { trigger, scope } = policy;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-foreground">{policy.name}</h3>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                policy.enabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {policy.enabled ? "Enabled" : "Disabled"}
            </span>
            <span className="text-[10px] text-muted-foreground/70">priority {policy.priority}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{policy.description}</p>

          <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-foreground">
              {trigger.metric} {OPERATOR_LABEL[trigger.operator]} {trigger.threshold}
            </span>
            {trigger.sustainedForMs > 0 && (
              <span className="text-muted-foreground">for {fmtMs(trigger.sustainedForMs)}</span>
            )}
            <span className="text-muted-foreground">→</span>
            {policy.actions.map((a) => (
              <span
                key={a}
                className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary"
              >
                {a}
              </span>
            ))}
          </div>

          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground/70">
            <span>
              scope: {scope.type}
              {scope.type === "bot" && scope.botIds?.length ? ` (${scope.botIds.length})` : ""}
              {scope.type === "tagged" && scope.tags?.length ? ` (${scope.tags.join(", ")})` : ""}
            </span>
            <span>cooldown {fmtMs(policy.cooldownMs)}</span>
            <span>max {policy.maxAttemptsPerHour}/h</span>
            <span>escalate after {policy.escalation.afterAttempts} → {policy.escalation.escalateTo}</span>
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col gap-1">
          <button
            type="button"
            disabled={busy}
            aria-pressed={policy.enabled}
            onClick={() => onToggle(policy.id, !policy.enabled)}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {policy.enabled ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Delete ${policy.name}`}
            onClick={() => onDelete(policy.id)}
            className="inline-flex items-center gap-1 rounded-md border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatePolicyForm({
  onCreate,
  busy,
}: {
  onCreate: (policy: CreateHealingPolicy) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<HealingMetric>("health_score");
  const [operator, setOperator] = useState<HealingOperator>("lt");
  const [threshold, setThreshold] = useState("40");
  const [actions, setActions] = useState<RemediationAction[]>(["notify_operator"]);
  const [cooldownSec, setCooldownSec] = useState("120");

  const valid = name.trim().length > 0 && actions.length > 0 && Number.isFinite(Number(threshold));

  const toggleAction = (a: RemediationAction) =>
    setActions((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const submit = () => {
    if (!valid) return;
    onCreate({
      name: name.trim(),
      description: description.trim(),
      enabled: true,
      trigger: { metric, operator, threshold: Number(threshold), sustainedForMs: 0 },
      actions,
      escalation: { afterAttempts: 3, afterMs: 600_000, escalateTo: "operator" },
      cooldownMs: Math.max(0, Number(cooldownSec) || 0) * 1000,
      maxAttemptsPerHour: 5,
      scope: { type: "fleet" },
      priority: 10,
    });
    setName("");
    setDescription("");
    setActions(["notify_operator"]);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-primary" /> New Policy
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="hp-name" className="text-[11px] font-medium text-muted-foreground">Name</label>
          <input
            id="hp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Health Critical Reconnect"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="hp-desc" className="text-[11px] font-medium text-muted-foreground">Description</label>
          <input
            id="hp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this policy does"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label htmlFor="hp-metric" className="text-[11px] font-medium text-muted-foreground">Metric</label>
          <select
            id="hp-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as HealingMetric)}
            className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hp-op" className="text-[11px] font-medium text-muted-foreground">Operator</label>
          <select
            id="hp-op"
            value={operator}
            onChange={(e) => setOperator(e.target.value as HealingOperator)}
            className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {OPERATOR_OPTIONS.map((o) => (
              <option key={o} value={o}>{OPERATOR_LABEL[o]} ({o})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hp-threshold" className="text-[11px] font-medium text-muted-foreground">Threshold</label>
          <input
            id="hp-threshold"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-24 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="hp-cooldown" className="text-[11px] font-medium text-muted-foreground">Cooldown (s)</label>
          <input
            id="hp-cooldown"
            value={cooldownSec}
            onChange={(e) => setCooldownSec(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-24 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div>
        <span className="text-[11px] font-medium text-muted-foreground">Remediation actions</span>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {ACTION_OPTIONS.map((a) => (
            <button
              type="button"
              key={a}
              aria-pressed={actions.includes(a)}
              onClick={() => toggleAction(a)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                actions.includes(a)
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!valid || busy}
        onClick={submit}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" /> Create Policy
      </button>
    </div>
  );
}

function AttemptRow({
  attempt,
  botLabel,
}: {
  attempt: HealingAttempt;
  botLabel: (botId: string) => { emoji: string; name: string };
}) {
  const { emoji, name } = botLabel(attempt.botId);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
            statusBadgeClass(attempt.status),
          )}
        >
          {attempt.status}
        </span>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {attempt.action}
        </span>
        <Link
          to={`/bots/${attempt.botId}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
        >
          <span>{emoji}</span>
          {name}
        </Link>
        {attempt.escalated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
            <Zap className="h-2.5 w-2.5" /> escalated
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/70">
          {timeAgo(new Date(attempt.startedAt).toISOString())}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {attempt.policyName} · trigger {attempt.triggerValue} vs threshold {attempt.threshold}
        {attempt.durationMs != null && ` · ${fmtMs(attempt.durationMs)}`}
      </div>
      {attempt.error && (
        <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">{attempt.error}</div>
      )}
    </div>
  );
}

function AuditRow({
  entry,
  botLabel,
}: {
  entry: HealingAuditEntry;
  botLabel: (botId: string) => { emoji: string; name: string };
}) {
  const { emoji, name } = botLabel(entry.botId);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs flex-wrap">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
          statusBadgeClass(entry.status),
        )}
      >
        {entry.status}
      </span>
      <span className="font-medium text-foreground">{entry.action}</span>
      <span className="text-muted-foreground">on</span>
      <span className="inline-flex items-center gap-1 text-primary font-medium">
        <span>{emoji}</span>
        {name}
      </span>
      <span className="text-muted-foreground/70">
        ({entry.triggerMetric} = {entry.triggerValue})
      </span>
      <span className="ml-auto text-[10px] text-muted-foreground/70">
        {timeAgo(new Date(entry.timestamp).toISOString())}
      </span>
    </div>
  );
}

export function Healing() {
  const [activeTab, setActiveTab] = useState<TabKey>("policies");

  const { data: policiesData, isLoading: policiesLoading, isError: policiesError } = useHealingPolicies();
  const { data: statsData } = useHealingStats();
  const { data: attemptsData, isLoading: attemptsLoading } = useHealingAttempts();
  const { data: auditData, isLoading: auditLoading } = useHealingAudit();
  const { data: fleet } = useFleetStatus();

  const pauseMutation = useToggleHealingPause();
  const toggleMutation = useSetHealingPolicyEnabled();
  const createMutation = useCreateHealingPolicy();
  const deleteMutation = useDeleteHealingPolicy();
  const busy =
    pauseMutation.isPending ||
    toggleMutation.isPending ||
    createMutation.isPending ||
    deleteMutation.isPending;

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Self-Healing" }]);
  }, [setBreadcrumbs]);

  const botLabel = useMemo(() => {
    const map = new Map<string, { emoji: string; name: string }>();
    for (const bot of fleet?.bots ?? []) {
      map.set(bot.botId, { emoji: bot.emoji ?? "\u{1F916}", name: bot.name ?? bot.botId });
    }
    return (botId: string) => map.get(botId) ?? { emoji: "\u{1F916}", name: botId };
  }, [fleet]);

  const stats = statsData?.stats;
  const paused = stats?.paused ?? false;
  const policies = policiesData?.policies ?? [];
  const attempts = attemptsData?.attempts ?? [];
  const audit = auditData?.entries ?? [];
  const mutationError =
    pauseMutation.error ?? toggleMutation.error ?? createMutation.error ?? deleteMutation.error;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" /> Self-Healing
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated remediation policies — evaluated every 30s with retry + escalation
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => pauseMutation.mutate(!paused)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            paused
              ? "border-green-400/40 bg-green-400/10 text-green-700 dark:text-green-400 hover:bg-green-400/20"
              : "border-red-400/40 bg-red-400/10 text-red-600 dark:text-red-400 hover:bg-red-400/20",
          )}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? "Resume Healing" : "Pause All (Kill Switch)"}
        </button>
      </div>

      {/* Kill-switch banner */}
      {paused && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Pause className="h-3.5 w-3.5 flex-shrink-0" />
          Healing is paused. Policies are still evaluated, but no remediation actions run.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Active Policies" value={String(stats?.activePolicies ?? 0)} />
        <MetricCard label="Attempts" value={String(stats?.totalAttempts ?? 0)} />
        <MetricCard label="Succeeded" value={String(stats?.succeeded ?? 0)} hint="auto-fixed" />
        <MetricCard label="Escalated" value={String(stats?.escalated ?? 0)} hint="needed an operator" />
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

      {/* Policies tab */}
      {activeTab === "policies" && (
        <div className="space-y-3">
          <CreatePolicyForm onCreate={(p) => createMutation.mutate(p)} busy={busy} />
          {policiesLoading ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              Loading policies...
            </div>
          ) : policiesError ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Failed to load healing policies. The fleet monitor may be offline.
            </div>
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">No healing policies</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create one above to start auto-remediation.</p>
            </div>
          ) : (
            policies.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                onToggle={(id, enabled) => toggleMutation.mutate({ id, enabled })}
                onDelete={(id) => deleteMutation.mutate(id)}
                busy={busy}
              />
            ))
          )}
        </div>
      )}

      {/* Attempts tab */}
      {activeTab === "attempts" && (
        <div className="space-y-2">
          {attemptsLoading ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              Loading attempts...
            </div>
          ) : attempts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">No remediation attempts yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Attempts appear here when a policy trigger fires against a bot.
              </p>
            </div>
          ) : (
            attempts.map((a) => <AttemptRow key={a.id} attempt={a} botLabel={botLabel} />)
          )}
        </div>
      )}

      {/* Audit tab */}
      {activeTab === "audit" && (
        <div className="space-y-1.5">
          {auditLoading ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              Loading audit log...
            </div>
          ) : audit.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <XCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">Audit log is empty</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every remediation action is recorded here for compliance.
              </p>
            </div>
          ) : (
            audit.map((e) => <AuditRow key={e.id} entry={e} botLabel={botLabel} />)
          )}
        </div>
      )}
    </div>
  );
}
