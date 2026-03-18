/**
 * InterBotGraph — Tracks and visualizes communication between bots.
 *
 * Data sources:
 * - Agent events: sessions_send / sessions_spawn tool calls
 * - Config: tools.agentToAgent allow lists (static policy)
 *
 * Provides:
 * - Live communication graph (edges weighted by frequency)
 * - Blast radius calculation (BFS-based impact analysis)
 * - Betweenness centrality for identifying critical bots
 */

import { EventEmitter } from "node:events";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GraphNode {
  botId: string;
  name: string;
  emoji: string;
  healthScore: number;
  /** Computed role based on in/out degree */
  role: "leader" | "worker" | "specialist" | "autonomous";
  /** How many bots send messages TO this bot */
  inDegree: number;
  /** How many bots this bot sends messages TO */
  outDegree: number;
  /** Betweenness centrality (0–1, higher = more critical) */
  betweenness: number;
}

export interface InterBotEdge {
  from: string;
  to: string;
  type: "message" | "spawn" | "delegation";
  /** Communication count in the last 24 hours */
  weight: number;
  lastSeen: Date;
  avgLatencyMs: number;
}

export interface InterBotPolicy {
  botId: string;
  enabled: boolean;
  allowList: string[];
}

export type ImpactLevel = "critical" | "high" | "medium" | "low";

export interface BlastRadius {
  offlineBot: string;
  affected: Map<string, ImpactLevel>;
  totalImpacted: number;
}

export interface SerializedGraph {
  nodes: Array<Omit<GraphNode, "betweenness"> & { betweenness: number }>;
  edges: Array<InterBotEdge & { lastSeen: string }>;
  policies: InterBotPolicy[];
  computedAt: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const EDGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_EDGES_PER_PAIR = 1; // Deduplicate: one edge per (from, to, type)

// ─── InterBotGraph ─────────────────────────────────────────────────────────

export class InterBotGraph extends EventEmitter {
  private edges: InterBotEdge[] = [];
  private policies = new Map<string, InterBotPolicy>();
  private botMetadata = new Map<string, { name: string; emoji: string; healthScore: number }>();

  constructor() {
    super();
  }

  // ─── Data ingestion ───────────────────────────────────────────────────

  /**
   * Record an inter-bot communication event (from agent event stream).
   */
  addEdge(edge: Omit<InterBotEdge, "weight" | "avgLatencyMs">): void {
    // Find existing edge for this pair + type
    const existing = this.edges.find(
      (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type,
    );

    if (existing) {
      existing.weight++;
      existing.lastSeen = edge.lastSeen;
    } else {
      this.edges.push({
        ...edge,
        weight: 1,
        avgLatencyMs: 0,
      });
    }

    this.emit("edgeAdded", edge);
  }

  /**
   * Update static policy from config.get("tools.agentToAgent").
   */
  updatePolicy(botId: string, policy: InterBotPolicy): void {
    this.policies.set(botId, policy);
  }

  /**
   * Update bot metadata (name, emoji, health) for graph nodes.
   */
  updateBotMetadata(
    botId: string,
    meta: { name: string; emoji: string; healthScore: number },
  ): void {
    this.botMetadata.set(botId, meta);
  }

  // ─── Graph queries ────────────────────────────────────────────────────

  /**
   * Build the complete graph with computed node properties.
   */
  getGraph(): SerializedGraph {
    this.pruneExpiredEdges();

    const nodeIds = new Set<string>();
    for (const edge of this.edges) {
      nodeIds.add(edge.from);
      nodeIds.add(edge.to);
    }
    // Include bots with policies but no active edges
    for (const policy of this.policies.values()) {
      nodeIds.add(policy.botId);
      for (const allowed of policy.allowList) {
        nodeIds.add(allowed);
      }
    }

    // Compute degrees
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    for (const edge of this.edges) {
      outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    // Compute betweenness centrality (simplified Brandes algorithm)
    const betweenness = this.computeBetweenness(nodeIds, this.edges);

    // Build nodes
    const nodes: GraphNode[] = Array.from(nodeIds).map((botId) => {
      const meta = this.botMetadata.get(botId);
      const inD = inDegree.get(botId) ?? 0;
      const outD = outDegree.get(botId) ?? 0;

      // Determine role heuristically
      let role: GraphNode["role"] = "autonomous";
      if (outD > inD * 2) role = "leader";
      else if (inD > outD * 2) role = "specialist";
      else if (inD > 0 || outD > 0) role = "worker";

      return {
        botId,
        name: meta?.name ?? botId,
        emoji: meta?.emoji ?? "🤖",
        healthScore: meta?.healthScore ?? 0,
        role,
        inDegree: inD,
        outDegree: outD,
        betweenness: betweenness.get(botId) ?? 0,
      };
    });

    return {
      nodes,
      edges: this.edges.map((e) => ({
        ...e,
        lastSeen: e.lastSeen.toISOString(),
      })),
      policies: Array.from(this.policies.values()),
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate blast radius when a specific bot goes offline.
   * Uses BFS to find all transitively dependent bots.
   */
  calculateBlastRadius(offlineBotId: string): BlastRadius {
    this.pruneExpiredEdges();

    const affected = new Map<string, ImpactLevel>();
    const queue: Array<{ botId: string; depth: number }> = [];

    // Find all bots that directly depend on the offline bot
    // "Depend" = they receive messages/spawns FROM the offline bot (outgoing edges)
    // OR they send TO the offline bot and expect a response (bidirectional dependency)
    const directDependents = this.edges
      .filter((e) => e.from === offlineBotId && e.type !== "message")
      .map((e) => e.to);

    // Also consider bots that frequently message the offline bot (soft dependency)
    const softDependents = this.edges
      .filter((e) => e.to === offlineBotId && e.weight >= 3)
      .map((e) => e.from);

    for (const dep of [...new Set([...directDependents, ...softDependents])]) {
      if (dep !== offlineBotId && !affected.has(dep)) {
        affected.set(dep, "critical");
        queue.push({ botId: dep, depth: 1 });
      }
    }

    // BFS for transitive impact
    while (queue.length > 0) {
      const { botId, depth } = queue.shift()!;
      if (depth >= 3) continue; // Stop at depth 3

      const downstream = this.edges
        .filter((e) => e.from === botId)
        .map((e) => e.to);

      for (const dep of downstream) {
        if (dep !== offlineBotId && !affected.has(dep)) {
          const impact: ImpactLevel =
            depth === 1 ? "high" : depth === 2 ? "medium" : "low";
          affected.set(dep, impact);
          queue.push({ botId: dep, depth: depth + 1 });
        }
      }
    }

    return {
      offlineBot: offlineBotId,
      affected,
      totalImpacted: affected.size,
    };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────

  private pruneExpiredEdges(): void {
    const cutoff = Date.now() - EDGE_TTL_MS;
    this.edges = this.edges.filter((e) => e.lastSeen.getTime() > cutoff);
  }

  /**
   * Simplified betweenness centrality.
   * For each pair (s, t), find shortest path. If a node v is on that path,
   * increment v's centrality. Normalize to 0–1.
   */
  private computeBetweenness(
    nodeIds: Set<string>,
    edges: InterBotEdge[],
  ): Map<string, number> {
    const centrality = new Map<string, number>();
    for (const id of nodeIds) centrality.set(id, 0);

    const nodes = Array.from(nodeIds);
    const adjacency = new Map<string, string[]>();
    for (const id of nodes) adjacency.set(id, []);
    for (const edge of edges) {
      adjacency.get(edge.from)?.push(edge.to);
    }

    // BFS from each source
    for (const source of nodes) {
      const dist = new Map<string, number>();
      const paths = new Map<string, number>();
      const pred = new Map<string, string[]>();
      const stack: string[] = [];

      dist.set(source, 0);
      paths.set(source, 1);
      const queue = [source];

      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);
        const dv = dist.get(v)!;

        for (const w of adjacency.get(v) ?? []) {
          if (!dist.has(w)) {
            dist.set(w, dv + 1);
            queue.push(w);
          }
          if (dist.get(w) === dv + 1) {
            paths.set(w, (paths.get(w) ?? 0) + (paths.get(v) ?? 1));
            if (!pred.has(w)) pred.set(w, []);
            pred.get(w)!.push(v);
          }
        }
      }

      // Accumulate
      const delta = new Map<string, number>();
      for (const id of nodes) delta.set(id, 0);

      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred.get(w) ?? []) {
          const d =
            ((paths.get(v) ?? 1) / (paths.get(w) ?? 1)) *
            (1 + (delta.get(w) ?? 0));
          delta.set(v, (delta.get(v) ?? 0) + d);
        }
        if (w !== source) {
          centrality.set(w, (centrality.get(w) ?? 0) + (delta.get(w) ?? 0));
        }
      }
    }

    // Normalize
    const n = nodes.length;
    const maxPossible = n > 2 ? (n - 1) * (n - 2) : 1;
    for (const [id, val] of centrality) {
      centrality.set(id, val / maxPossible);
    }

    return centrality;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: InterBotGraph | null = null;

export function getInterBotGraph(): InterBotGraph {
  if (!instance) instance = new InterBotGraph();
  return instance;
}

export function disposeInterBotGraph(): void {
  instance?.removeAllListeners();
  instance = null;
}
