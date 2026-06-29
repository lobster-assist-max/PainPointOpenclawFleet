/**
 * CanaryLabPanel — self-fetching container for the CanaryLab widget.
 *
 * Wires the presentational <CanaryLab /> (which takes an `experiments` prop +
 * action callbacks) to the live `/fleet-monitor/canary/*` backend. The Canary
 * Lab engine collects metric samples for every running experiment every 60s
 * (fed by fleet-bootstrap), and the Start/Pause/Abort/Complete buttons drive
 * the engine through the matching POST endpoints.
 *
 * Degrades gracefully: a fresh fleet has no experiments (they are created via
 * API, not seeded), so the panel falls back to a small MOCK experiment set
 * with a [Preview] badge and disabled actions so the page still demonstrates
 * the feature.
 */

import { AlertTriangle, Loader2 } from "lucide-react";
import { CanaryLab } from "./CanaryLab";
import {
  useCanaryExperiments,
  useCanaryStart,
  useCanaryPause,
  useCanaryAbort,
  useCanaryComplete,
} from "@/hooks/useFleetMonitor";
import type { CanaryExperiment } from "@/api/fleet-monitor";

// ── Preview fallback data ───────────────────────────────────────────────────

const MOCK_EXPERIMENTS: CanaryExperiment[] = [
  {
    id: "exp_demo_1",
    name: "Cheaper model for routine replies",
    hypothesis: "Switching the test group to a smaller model keeps quality while cutting cost.",
    status: "running",
    controlGroup: { botIds: ["lobster"], configSnapshot: {} },
    testGroup: { botIds: ["squirrel"], configPatch: { model: "haiku" } },
    metrics: [
      { name: "Quality Index", type: "higher_is_better", source: "quality_index", weight: 0.6 },
      { name: "Cost / session", type: "lower_is_better", source: "cost_per_session", weight: 0.4 },
    ],
    startedAt: new Date(Date.now() - 36 * 3600_000).toISOString(),
    minDurationMs: 72 * 3600_000,
    minSampleSize: 50,
    guardrails: {
      abortIf: { healthBelow: 70, errorRateAbove: 0.1, costMultiplierAbove: 2 },
      rollbackOnAbort: true,
    },
    controlSampleCount: 41,
    testSampleCount: 39,
    createdAt: new Date(Date.now() - 40 * 3600_000).toISOString(),
  },
  {
    id: "exp_demo_2",
    name: "Tighter system prompt",
    hypothesis: "A more concise system prompt reduces tokens-per-turn without hurting completion.",
    status: "completed",
    controlGroup: { botIds: ["boar"], configSnapshot: {} },
    testGroup: { botIds: ["peacock"], configPatch: {} },
    metrics: [
      { name: "Tokens / turn", type: "lower_is_better", source: "tokens_per_turn", weight: 0.5 },
      { name: "Completion rate", type: "higher_is_better", source: "task_completion_rate", weight: 0.5 },
    ],
    startedAt: new Date(Date.now() - 120 * 3600_000).toISOString(),
    endAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
    minDurationMs: 96 * 3600_000,
    minSampleSize: 80,
    guardrails: {
      abortIf: { healthBelow: 70, errorRateAbove: 0.1, costMultiplierAbove: 2 },
      rollbackOnAbort: true,
    },
    controlSampleCount: 92,
    testSampleCount: 95,
    result: {
      comparisons: [
        {
          metric: "Tokens / turn",
          controlMean: 412,
          testMean: 318,
          controlStdDev: 54,
          testStdDev: 47,
          delta: -94,
          deltaPercent: -22.8,
          pValue: 0.012,
          significant: true,
          winner: "test",
          sampleSize: { control: 92, test: 95 },
        },
      ],
      overallVerdict: "test_wins",
      recommendation: "Roll out the tighter prompt — 23% fewer tokens/turn at equal completion.",
      totalSamples: { control: 92, test: 95 },
    },
    createdAt: new Date(Date.now() - 130 * 3600_000).toISOString(),
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export function CanaryLabPanel() {
  const { data, isLoading, isError } = useCanaryExperiments();
  const startMut = useCanaryStart();
  const pauseMut = useCanaryPause();
  const abortMut = useCanaryAbort();
  const completeMut = useCanaryComplete();

  const liveExperiments = data?.experiments ?? [];
  const isLive = liveExperiments.length > 0;
  const display = isLive ? liveExperiments : MOCK_EXPERIMENTS;

  const mutError =
    startMut.error || pauseMut.error || abortMut.error || completeMut.error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading experiments…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live / Preview status row */}
      <div className="flex items-center justify-between">
        <span
          className={
            isLive
              ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
          }
        >
          <span
            className={
              isLive
                ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                : "h-1.5 w-1.5 rounded-full bg-amber-500"
            }
          />
          {isLive ? "Live" : "Preview"}
        </span>
        {!isLive && (
          <span className="text-xs text-muted-foreground">
            Showing demo experiments — create one via the API to go live
          </span>
        )}
      </div>

      {isError && !isLive && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load experiments. The fleet monitor may be offline.
        </div>
      )}

      {mutError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Action failed:{" "}
          {mutError instanceof Error ? mutError.message : "Unknown error"}
        </div>
      )}

      <CanaryLab
        experiments={display}
        onStart={isLive ? (id) => startMut.mutate(id) : undefined}
        onPause={isLive ? (id) => pauseMut.mutate(id) : undefined}
        onAbort={isLive ? (id) => abortMut.mutate({ id }) : undefined}
        onComplete={isLive ? (id) => completeMut.mutate(id) : undefined}
      />
    </div>
  );
}
