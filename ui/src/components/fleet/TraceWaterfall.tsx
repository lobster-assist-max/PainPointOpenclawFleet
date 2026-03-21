/**
 * TraceWaterfall — Agent Turn Trace visualization (inspired by Chrome DevTools Network tab).
 *
 * Shows a list of recent traces with a SVG waterfall diagram for the selected trace.
 * Each phase is rendered as a colored bar: LLM=gold, Tool=green, Error=red.
 */

import { useState, useMemo } from "react";
import {
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import type { AgentTurnTrace, TracePhase } from "@/api/fleet-monitor";

// ── Phase colors (Pain Point warm palette) ─────────────────────────────────

const PHASE_COLORS: Record<TracePhase["type"], string> = {
  llm_think: "oklch(0.758 0.095 68)",   // brand gold
  llm_output: "oklch(0.648 0.120 180)",  // teal
  tool_call: "oklch(0.720 0.175 155)",   // green
  tool_result: "oklch(0.663 0.088 62)",  // tan
  error: "oklch(0.550 0.200 25)",        // warm red
};

const PHASE_LABELS: Record<TracePhase["type"], string> = {
  llm_think: "LLM Think",
  llm_output: "LLM Output",
  tool_call: "Tool Call",
  tool_result: "Tool Result",
  error: "Error",
};

const STATUS_ICONS = {
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: AlertTriangle,
  running: Loader2,
};

// ── Trace Summary Row ──────────────────────────────────────────────────────

function TraceSummaryRow({
  trace,
  isSelected,
  onClick,
}: {
  trace: AgentTurnTrace;
  isSelected: boolean;
  onClick: () => void;
}) {
  const StatusIcon = STATUS_ICONS[trace.status];
  const duration = trace.durationMs != null ? `${(trace.durationMs / 1000).toFixed(1)}s` : "...";
  const tokens = trace.totalTokens.input + trace.totalTokens.output;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 text-sm border-b hover:bg-accent/50 transition-colors text-left",
        isSelected && "bg-accent",
      )}
    >
      <StatusIcon
        className={cn(
          "h-4 w-4 shrink-0",
          trace.status === "completed" && "text-green-600 dark:text-green-400",
          trace.status === "failed" && "text-red-600 dark:text-red-400",
          trace.status === "cancelled" && "text-amber-600 dark:text-amber-400",
          trace.status === "running" && "text-primary animate-spin",
        )}
      />
      <span className="truncate flex-1 font-mono text-xs">
        {trace.traceId.slice(0, 8)}
      </span>
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {duration}
      </span>
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Zap className="h-3 w-3" />
        {tokens > 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens}
      </span>
      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
    </button>
  );
}

// ── Waterfall Timeline (SVG) ───────────────────────────────────────────────

function WaterfallTimeline({ trace }: { trace: AgentTurnTrace }) {
  const totalMs = trace.durationMs ?? 1;
  const svgWidth = 600;
  const barHeight = 24;
  const barGap = 4;
  const svgHeight = trace.phases.length * (barHeight + barGap) + 40;
  const labelWidth = 120;
  const timelineWidth = svgWidth - labelWidth - 20;

  // Time scale ticks
  const ticks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => ({
      ms: (totalMs / count) * i,
      x: labelWidth + (timelineWidth / count) * i,
    }));
  }, [totalMs, labelWidth, timelineWidth]);

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="text-sm">
        {/* Time axis ticks */}
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={tick.x}
              y1={20}
              x2={tick.x}
              y2={svgHeight}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray="4 4"
            />
            <text
              x={tick.x}
              y={14}
              textAnchor="middle"
              fill="currentColor"
              opacity={0.5}
              fontSize={10}
            >
              {tick.ms >= 1000 ? `${(tick.ms / 1000).toFixed(1)}s` : `${Math.round(tick.ms)}ms`}
            </text>
          </g>
        ))}

        {/* Phase bars */}
        {trace.phases.map((phase, i) => {
          const y = 28 + i * (barHeight + barGap);
          const x = labelWidth + (phase.startMs / totalMs) * timelineWidth;
          const width = Math.max(2, (phase.durationMs / totalMs) * timelineWidth);

          return (
            <g key={i}>
              {/* Label */}
              <text
                x={labelWidth - 8}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fill="currentColor"
                opacity={0.7}
                fontSize={11}
              >
                {phase.name ?? PHASE_LABELS[phase.type]}
              </text>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={width}
                height={barHeight}
                rx={4}
                fill={PHASE_COLORS[phase.type]}
                opacity={0.85}
              />
              {/* Duration label on bar (if wide enough) */}
              {width > 40 && (
                <text
                  x={x + width / 2}
                  y={y + barHeight / 2 + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={10}
                  fontWeight="bold"
                >
                  {phase.durationMs >= 1000
                    ? `${(phase.durationMs / 1000).toFixed(1)}s`
                    : `${Math.round(phase.durationMs)}ms`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Trace Detail Panel ─────────────────────────────────────────────────────

function TraceDetail({ trace }: { trace: AgentTurnTrace }) {
  const duration = trace.durationMs != null ? `${(trace.durationMs / 1000).toFixed(1)}s` : "running...";
  const cachedPct = trace.totalTokens.input > 0
    ? Math.round((trace.totalTokens.cached / trace.totalTokens.input) * 100)
    : 0;

  // Find slowest phase
  const slowest = trace.phases.reduce<TracePhase | null>(
    (acc, p) => (!acc || p.durationMs > acc.durationMs ? p : acc),
    null,
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Duration:</span>{" "}
          <span className="font-medium">{duration}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Tokens:</span>{" "}
          <span className="font-medium">
            {(trace.totalTokens.input / 1000).toFixed(1)}K in / {(trace.totalTokens.output / 1000).toFixed(1)}K out
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Cache:</span>{" "}
          <span className="font-medium">{cachedPct}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">Phases:</span>{" "}
          <span className="font-medium">{trace.phases.length}</span>
        </div>
        {slowest && (
          <div>
            <span className="text-muted-foreground">Slowest:</span>{" "}
            <span className="font-medium">
              {slowest.name ?? PHASE_LABELS[slowest.type]} ({(slowest.durationMs / 1000).toFixed(1)}s)
            </span>
          </div>
        )}
      </div>

      {/* Waterfall */}
      <WaterfallTimeline trace={trace} />

      {/* Phase table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-3 py-1.5 font-medium">Phase</th>
              <th className="text-left px-3 py-1.5 font-medium">Name</th>
              <th className="text-right px-3 py-1.5 font-medium">Start</th>
              <th className="text-right px-3 py-1.5 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {trace.phases.map((phase, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-3 py-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5"
                    style={{ backgroundColor: PHASE_COLORS[phase.type] }}
                  />
                  {PHASE_LABELS[phase.type]}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground font-mono">
                  {phase.name ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {(phase.startMs / 1000).toFixed(2)}s
                </td>
                <td className="px-3 py-1.5 text-right font-medium">
                  {phase.durationMs >= 1000
                    ? `${(phase.durationMs / 1000).toFixed(1)}s`
                    : `${Math.round(phase.durationMs)}ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface TraceWaterfallProps {
  botId: string;
  className?: string;
}

export function TraceWaterfall({ botId, className }: TraceWaterfallProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const { data: tracesData, isLoading } = useQuery({
    queryKey: ["fleet", "bot-traces", botId],
    queryFn: () => fleetMonitorApi.botTraces(botId),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const traces = tracesData?.traces ?? [];
  const selectedTrace = traces.find((t: AgentTurnTrace) => t.traceId === selectedTraceId);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12 text-muted-foreground", className)}>
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading traces...
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className={cn("text-center py-12 text-sm text-muted-foreground", className)}>
        No agent turn traces yet. Traces are captured when the bot executes agent turns.
      </div>
    );
  }

  return (
    <div className={cn("border rounded-xl overflow-hidden", className)}>
      <div className="flex">
        {/* Trace list */}
        <div className="w-80 border-r max-h-96 overflow-y-auto">
          <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
            Recent Traces ({traces.length})
          </div>
          {traces.map((trace: AgentTurnTrace) => (
            <TraceSummaryRow
              key={trace.traceId}
              trace={trace}
              isSelected={trace.traceId === selectedTraceId}
              onClick={() => setSelectedTraceId(trace.traceId)}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className="flex-1 p-4 min-h-80">
          {selectedTrace ? (
            <TraceDetail trace={selectedTrace} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a trace to view its waterfall diagram
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
