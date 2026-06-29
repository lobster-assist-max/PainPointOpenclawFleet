/**
 * InterBotGraphPanel — self-fetching container for the InterBotGraph widget.
 *
 * Wires the presentational <InterBotGraph /> (which takes a `data` prop) to the
 * live `/fleet-monitor/inter-bot-graph` backend. Edges are fed server-side from
 * agent events (sessions_send / sessions_spawn); node metadata (name / emoji /
 * health) is refreshed every 5 min by the fleet bootstrap loop. Clicking a node
 * fetches its blast radius (`/inter-bot-graph/blast/:botId`) and highlights the
 * transitively-impacted bots.
 *
 * Degrades gracefully: when the fleet monitor is offline / no bots have talked
 * to each other yet, it falls back to a small MOCK graph with a [Preview] badge
 * so the Intelligence page still demonstrates the feature.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { InterBotGraph } from "./InterBotGraph";
import { useInterBotGraph, useInterBotBlast } from "@/hooks/useFleetMonitor";
import type {
  InterBotGraphNode,
  InterBotGraphEdge,
} from "@/api/fleet-monitor";

// ── Preview fallback data ───────────────────────────────────────────────────

const MOCK_NODES: InterBotGraphNode[] = [
  { botId: "lobster-01", name: "小龍蝦", emoji: "🦞", healthScore: 92, role: "leader", inDegree: 1, outDegree: 3, betweenness: 0.8 },
  { botId: "squirrel-01", name: "飛鼠", emoji: "🐿️", healthScore: 78, role: "worker", inDegree: 2, outDegree: 1, betweenness: 0.3 },
  { botId: "boar-01", name: "山豬", emoji: "🐗", healthScore: 64, role: "specialist", inDegree: 2, outDegree: 0, betweenness: 0.1 },
  { botId: "crane-01", name: "白鶴", emoji: "🕊️", healthScore: 88, role: "worker", inDegree: 1, outDegree: 1, betweenness: 0.2 },
];

const MOCK_EDGES: InterBotGraphEdge[] = [
  { from: "lobster-01", to: "squirrel-01", type: "delegation", weight: 12, lastSeen: new Date(0).toISOString(), avgLatencyMs: 240 },
  { from: "lobster-01", to: "boar-01", type: "message", weight: 7, lastSeen: new Date(0).toISOString(), avgLatencyMs: 180 },
  { from: "lobster-01", to: "crane-01", type: "spawn", weight: 4, lastSeen: new Date(0).toISOString(), avgLatencyMs: 320 },
  { from: "squirrel-01", to: "boar-01", type: "message", weight: 3, lastSeen: new Date(0).toISOString(), avgLatencyMs: 210 },
  { from: "crane-01", to: "squirrel-01", type: "message", weight: 2, lastSeen: new Date(0).toISOString(), avgLatencyMs: 260 },
];

const MOCK_DATA = {
  nodes: MOCK_NODES,
  edges: MOCK_EDGES,
  computedAt: new Date(0).toISOString(),
};

// ── Component ───────────────────────────────────────────────────────────────

export function InterBotGraphPanel() {
  const { data, isLoading, isError } = useInterBotGraph();
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  const liveGraph = data?.graph ?? null;
  // "Live" only once at least one real node exists — an empty graph means no
  // inter-bot communication has been observed yet.
  const isLive = (liveGraph?.nodes.length ?? 0) > 0;

  const graphData = useMemo(
    () => (isLive ? liveGraph : MOCK_DATA),
    [isLive, liveGraph],
  );

  // Blast radius only makes sense against live data — disabled in preview mode.
  const blastBotId = isLive ? selectedBotId : null;
  const { data: blast } = useInterBotBlast(blastBotId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading inter-bot graph…
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
            Showing demo data — graph populates as bots delegate to each other
          </span>
        )}
        {isLive && selectedBotId && (
          <button
            type="button"
            onClick={() => setSelectedBotId(null)}
            className="text-xs text-primary hover:underline"
          >
            Clear blast selection
          </button>
        )}
      </div>

      {/* Error banner (live query failed but we still render the demo graph) */}
      {isError && !isLive && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load inter-bot graph. The fleet monitor may be offline.
        </div>
      )}

      <InterBotGraph
        data={graphData}
        blastRadius={blast?.blastRadius ?? null}
        onNodeClick={(botId) =>
          setSelectedBotId((prev) => (prev === botId ? null : botId))
        }
      />

      {isLive && (
        <p className="text-xs text-muted-foreground">
          Click a bot to see its blast radius — the bots that would be impacted
          if it went offline.
        </p>
      )}
    </div>
  );
}
