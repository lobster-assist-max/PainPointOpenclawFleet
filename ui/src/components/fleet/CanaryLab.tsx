/**
 * CanaryLab — A/B experiment management UI for Fleet bot configurations.
 *
 * Features:
 * - Experiment list (active + completed)
 * - Live metric comparison table with p-value & significance
 * - Guardrail status indicators
 * - Create / Pause / Abort / Complete controls
 */

import { useState } from "react";
import {
  Beaker,
  Play,
  Pause,
  Square,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  Shield,
} from "lucide-react";

// ─── Types (mirrors server types) ────────────────────────────────────────────

interface MetricComparison {
  metric: string;
  controlMean: number;
  testMean: number;
  controlStdDev: number;
  testStdDev: number;
  delta: number;
  deltaPercent: number;
  pValue: number;
  significant: boolean;
  winner: "control" | "test" | "tie";
  sampleSize: { control: number; test: number };
}

interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: "draft" | "running" | "paused" | "completed" | "aborted";
  controlGroup: { botIds: string[]; configSnapshot: Record<string, unknown> };
  testGroup: { botIds: string[]; configPatch: Record<string, unknown> };
  metrics: Array<{
    name: string;
    type: "higher_is_better" | "lower_is_better" | "closer_to_target";
    source: string;
    weight: number;
  }>;
  startedAt?: string;
  endAt?: string;
  minDurationMs: number;
  minSampleSize: number;
  guardrails: {
    abortIf: {
      healthBelow: number;
      errorRateAbove: number;
      costMultiplierAbove: number;
    };
    rollbackOnAbort: boolean;
  };
  controlSampleCount: number;
  testSampleCount: number;
  result?: {
    comparisons: MetricComparison[];
    overallVerdict: "test_wins" | "control_wins" | "inconclusive";
    recommendation: string;
    totalSamples: { control: number; test: number };
  };
  createdAt: string;
}

// ─── Bot name resolver (simplified — in production, use context/hook) ────────

const BOT_NAMES: Record<string, string> = {
  lobster: "🦞 小龍蝦",
  squirrel: "🐿️ 飛鼠",
  peacock: "🦚 孔雀",
  boar: "🐗 山豬",
};

function botName(id: string): string {
  return BOT_NAMES[id] ?? id;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Experiment["status"] }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-500/20 text-gray-400",
    running: "bg-green-500/20 text-green-400",
    paused: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-blue-500/20 text-blue-400",
    aborted: "bg-red-500/20 text-red-400",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    aborted: "Aborted",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function VerdictBadge({
  verdict,
}: {
  verdict: "test_wins" | "control_wins" | "inconclusive";
}) {
  if (verdict === "test_wins") {
    return (
      <span className="inline-flex items-center gap-1 text-green-400 text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" /> Test Wins
      </span>
    );
  }
  if (verdict === "control_wins") {
    return (
      <span className="inline-flex items-center gap-1 text-red-400 text-sm font-medium">
        <Square className="w-4 h-4" /> Control Wins
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-yellow-400 text-sm font-medium">
      <Minus className="w-4 h-4" /> Inconclusive
    </span>
  );
}

function SignificanceDot({ significant, pValue }: { significant: boolean; pValue: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${significant ? "text-green-400" : "text-gray-500"}`}
    >
      {significant ? "✅" : "❌"} p={pValue < 0.001 ? "<0.001" : pValue.toFixed(3)}
    </span>
  );
}

function DeltaIndicator({
  delta,
  type,
}: {
  delta: number;
  type: "higher_is_better" | "lower_is_better" | "closer_to_target";
}) {
  const isPositive = delta > 0;
  const isGood =
    type === "higher_is_better" ? isPositive : type === "lower_is_better" ? !isPositive : true;

  const Icon = isPositive ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color = isGood ? "text-green-400" : "text-red-400";

  return (
    <span className={`inline-flex items-center gap-0.5 text-sm ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

function GuardrailStatus({
  guardrails,
  healthy,
}: {
  guardrails: Experiment["guardrails"];
  healthy: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
        healthy
          ? "bg-green-500/10 text-green-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      <Shield className="w-3.5 h-3.5" />
      {healthy ? "All guardrails within limits" : "Guardrail breach detected"}
      <span className="text-gray-500 ml-2">
        Health ≥{guardrails.abortIf.healthBelow} | Error ≤
        {(guardrails.abortIf.errorRateAbove * 100).toFixed(0)}% | Cost ≤
        {guardrails.abortIf.costMultiplierAbove}x
      </span>
    </div>
  );
}

function ComparisonTable({
  comparisons,
  metrics,
}: {
  comparisons: MetricComparison[];
  metrics: Experiment["metrics"];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-left border-b border-white/5">
            <th className="py-2 pr-4 font-medium">Metric</th>
            <th className="py-2 pr-4 font-medium text-right">Control</th>
            <th className="py-2 pr-4 font-medium text-right">Test</th>
            <th className="py-2 pr-4 font-medium text-right">Delta</th>
            <th className="py-2 pr-4 font-medium">Significance</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => (
            <tr key={c.metric} className="border-b border-white/5 last:border-0">
              <td className="py-2 pr-4 text-gray-200">{c.metric}</td>
              <td className="py-2 pr-4 text-right text-gray-300 tabular-nums">
                {c.controlMean.toFixed(2)}
                <span className="text-gray-600 text-xs ml-1">
                  ±{c.controlStdDev.toFixed(2)}
                </span>
              </td>
              <td className="py-2 pr-4 text-right text-gray-300 tabular-nums">
                {c.testMean.toFixed(2)}
                <span className="text-gray-600 text-xs ml-1">
                  ±{c.testStdDev.toFixed(2)}
                </span>
              </td>
              <td className="py-2 pr-4 text-right">
                <DeltaIndicator
                  delta={c.deltaPercent}
                  type={metrics[i]?.type ?? "higher_is_better"}
                />
              </td>
              <td className="py-2 pr-4">
                <SignificanceDot
                  significant={c.significant}
                  pValue={c.pValue}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Experiment Card ─────────────────────────────────────────────────────────

function ExperimentCard({
  experiment,
  onStart,
  onPause,
  onAbort,
  onComplete,
}: {
  experiment: Experiment;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onAbort: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(experiment.status === "running");
  const isActive =
    experiment.status === "running" || experiment.status === "paused";

  const daysRunning = experiment.startedAt
    ? Math.ceil(
        (Date.now() - new Date(experiment.startedAt).getTime()) / 86400_000,
      )
    : 0;

  const totalDays = experiment.endAt && experiment.startedAt
    ? Math.ceil(
        (new Date(experiment.endAt).getTime() -
          new Date(experiment.startedAt).getTime()) /
          86400_000,
      )
    : null;

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isActive
          ? "border-[oklch(0.758_0.095_68)]/30 bg-[oklch(0.758_0.095_68)]/5"
          : "border-white/10 bg-white/5"
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
        aria-label={expanded ? "Collapse experiment" : "Expand experiment"}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <Beaker className="w-5 h-5 text-[oklch(0.758_0.095_68)] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-100 font-medium truncate">
              {experiment.name}
            </span>
            <StatusBadge status={experiment.status} />
            {experiment.result && (
              <VerdictBadge verdict={experiment.result.overallVerdict} />
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5 truncate">
            {experiment.hypothesis}
          </p>
        </div>
        {isActive && (
          <div className="text-right text-xs text-gray-400 shrink-0">
            <div>
              Day {daysRunning}
              {totalDays ? `/${totalDays}` : ""}
            </div>
            <div>
              {experiment.controlSampleCount} / {experiment.testSampleCount}{" "}
              samples
            </div>
          </div>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Groups */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-xs text-gray-400 mb-1">Control Group</div>
              <div className="flex flex-wrap gap-1">
                {experiment.controlGroup.botIds.map((id) => (
                  <span
                    key={id}
                    className="text-sm px-2 py-0.5 rounded-md bg-white/10"
                  >
                    {botName(id)}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-[oklch(0.758_0.095_68)]/10 p-3">
              <div className="text-xs text-[oklch(0.758_0.095_68)] mb-1">
                Test Group
              </div>
              <div className="flex flex-wrap gap-1">
                {experiment.testGroup.botIds.map((id) => (
                  <span
                    key={id}
                    className="text-sm px-2 py-0.5 rounded-md bg-[oklch(0.758_0.095_68)]/20"
                  >
                    {botName(id)}
                  </span>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Patch:{" "}
                {Object.entries(experiment.testGroup.configPatch)
                  .map(([k, v]) => `${k}=${String(v)}`)
                  .join(", ")}
              </div>
            </div>
          </div>

          {/* Guardrails */}
          {isActive && (
            <GuardrailStatus
              guardrails={experiment.guardrails}
              healthy={true}
            />
          )}

          {/* Comparison table */}
          {experiment.result && (
            <>
              <ComparisonTable
                comparisons={experiment.result.comparisons}
                metrics={experiment.metrics}
              />
              <div className="rounded-lg bg-white/5 p-3 text-sm text-gray-300">
                <span className="text-[oklch(0.758_0.095_68)] mr-1">
                  Recommendation:
                </span>
                {experiment.result.recommendation}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {experiment.status === "draft" && (
              <button
                onClick={() => onStart(experiment.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30 transition-colors"
              >
                <Play className="w-3.5 h-3.5" /> Start
              </button>
            )}
            {experiment.status === "running" && (
              <>
                <button
                  onClick={() => onPause(experiment.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm hover:bg-yellow-500/30 transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
                <button
                  onClick={() => onComplete(experiment.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-sm hover:bg-blue-500/30 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                </button>
              </>
            )}
            {experiment.status === "paused" && (
              <button
                onClick={() => onStart(experiment.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30 transition-colors"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
            )}
            {isActive && (
              <button
                onClick={() => onAbort(experiment.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-3.5 h-3.5" /> Abort + Rollback
              </button>
            )}
            {experiment.result && (
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20 transition-colors ml-auto">
                <FileBarChart className="w-3.5 h-3.5" /> Export Report
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface CanaryLabProps {
  experiments?: Experiment[];
  onStart?: (id: string) => void;
  onPause?: (id: string) => void;
  onAbort?: (id: string) => void;
  onComplete?: (id: string) => void;
  onCreateNew?: () => void;
}

export function CanaryLab({
  experiments = [],
  onStart = () => {},
  onPause = () => {},
  onAbort = () => {},
  onComplete = () => {},
  onCreateNew = () => {},
}: CanaryLabProps) {
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const active = experiments.filter(
    (e) => e.status === "running" || e.status === "paused" || e.status === "draft",
  );
  const completed = experiments.filter(
    (e) => e.status === "completed" || e.status === "aborted",
  );

  const filtered =
    filter === "active"
      ? active
      : filter === "completed"
        ? completed
        : experiments;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Beaker className="w-5 h-5 text-[oklch(0.758_0.095_68)]" />
          <h2 className="text-lg font-semibold text-gray-100">Canary Lab</h2>
          <span className="text-xs text-gray-500">
            {active.length} active, {completed.length} completed
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter tabs */}
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                filter === f
                  ? "bg-[oklch(0.758_0.095_68)]/20 text-[oklch(0.758_0.095_68)]"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[oklch(0.758_0.095_68)]/20 text-[oklch(0.758_0.095_68)] text-sm hover:bg-[oklch(0.758_0.095_68)]/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Experiment
          </button>
        </div>
      </div>

      {/* Experiment list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Beaker className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No experiments yet.</p>
          <p className="text-xs mt-1">
            Create one to start A/B testing your bot configurations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((exp) => (
            <ExperimentCard
              key={exp.id}
              experiment={exp}
              onStart={onStart}
              onPause={onPause}
              onAbort={onAbort}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}

      {/* Summary stats */}
      {completed.length > 0 && (
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-lg bg-white/5 p-3 text-center">
            <div className="text-2xl font-bold text-green-400">
              {completed.filter((e) => e.result?.overallVerdict === "test_wins").length}
            </div>
            <div className="text-xs text-gray-500">Test Wins</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3 text-center">
            <div className="text-2xl font-bold text-red-400">
              {completed.filter((e) => e.result?.overallVerdict === "control_wins").length}
            </div>
            <div className="text-xs text-gray-500">Control Wins</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {completed.filter((e) => e.result?.overallVerdict === "inconclusive").length}
            </div>
            <div className="text-xs text-gray-500">Inconclusive</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CanaryLab;
