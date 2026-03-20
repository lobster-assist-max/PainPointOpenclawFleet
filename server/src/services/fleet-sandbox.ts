/**
 * Fleet Sandbox Environment Engine
 *
 * Provides a staging environment for testing fleet configuration changes
 * before promoting them to production. Supports synthetic traffic generation,
 * shadow traffic copying, and session replay for realistic testing.
 *
 * Key capabilities:
 * - Sandbox provisioning (mirror production config with overrides)
 * - Synthetic traffic generation (simulated customer personas)
 * - Shadow traffic (copy % of production traffic, read-only)
 * - Session replay (replay historical sessions at configurable speed)
 * - Promotion gates (metric thresholds that must pass before promotion)
 * - Production comparison (sandbox vs production metrics side-by-side)
 * - Cost isolation (independent sandbox cost tracking with hard limits)
 */

import { EventEmitter } from "events";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SandboxStatus =
  | "provisioning"
  | "ready"
  | "running"
  | "paused"
  | "destroying"
  | "destroyed";

export type TrafficSourceType = "synthetic" | "shadow" | "replay" | "manual";

export interface SyntheticPersona {
  name: string;
  behavior: "friendly" | "confused" | "angry" | "technical" | "returning";
  language: "zh-TW" | "en" | "ja" | "ko";
  topics: string[];
}

export interface SyntheticTrafficConfig {
  messagesPerHour: number;
  topics: Array<{ topic: string; weight: number }>;
  channels: string[];
  personas: SyntheticPersona[];
}

export interface ShadowTrafficConfig {
  sampleRate: number; // 0-1 (0.1 = 10% of production traffic)
  delay: "realtime" | "batch_hourly" | "batch_daily";
}

export interface ReplayTrafficConfig {
  sessionIds: string[];
  speedMultiplier: number; // 2 = 2x speed
}

export interface TrafficSource {
  type: TrafficSourceType;
  syntheticConfig?: SyntheticTrafficConfig;
  shadowConfig?: ShadowTrafficConfig;
  replayConfig?: ReplayTrafficConfig;
}

export interface SandboxIsolation {
  network: "full" | "shared_read"; // full = complete isolation, shared_read = can read production data
  costTracking: boolean;
  maxCostLimit: number; // USD
}

export type PromotionGateStatus = "pending" | "passed" | "failed" | "skipped";

export interface PromotionGate {
  name: string;
  type: "metric_threshold" | "error_rate" | "sla_compliance" | "min_sessions" | "manual_approval";
  condition: Record<string, unknown>;
  status: PromotionGateStatus;
  currentValue?: number;
  targetValue?: number;
  evaluatedAt?: Date;
}

export interface SandboxMetrics {
  timestamp: Date;
  avgCqi: number;
  avgResponseTimeMs: number;
  errorRate: number;
  slaCompliance: number;
  totalCost: number;
  costPerSession: number;
  sessionCount: number;
  routingEfficiency: number;
  healingSuccessRate: number;
}

export interface SandboxComparison {
  period: { from: Date; to: Date };
  sandbox: SandboxMetrics;
  production: SandboxMetrics;
  delta: Record<string, number>;
  verdict: "better" | "similar" | "worse";
}

export interface FleetSandbox {
  id: string;
  name: string;
  fleetId: string;
  status: SandboxStatus;
  createdAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;

  config: {
    mirror: {
      bots: boolean;
      sla: boolean;
      routing: boolean;
      delegation: boolean;
      alerts: boolean;
      budgets: boolean;
    };
    overrides: Record<string, unknown>;
    trafficSource: TrafficSource;
    isolation: SandboxIsolation;
  };

  promotionGates: PromotionGate[];
  comparison?: SandboxComparison;

  // Runtime stats
  stats: {
    totalSessions: number;
    totalCost: number;
    uptimeMinutes: number;
    errorsCount: number;
  };
}

export interface CreateSandboxRequest {
  name: string;
  fleetId: string;
  mirror?: Partial<FleetSandbox["config"]["mirror"]>;
  overrides?: Record<string, unknown>;
  trafficSource: TrafficSource;
  isolation?: Partial<SandboxIsolation>;
  promotionGates?: Array<Omit<PromotionGate, "status" | "currentValue" | "evaluatedAt">>;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class FleetSandboxEngine extends EventEmitter {
  private sandboxes: Map<string, FleetSandbox> = new Map();
  private trafficTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private gateEvalTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private productionMetrics: {
      getCurrentMetrics(): SandboxMetrics;
    },
  ) {
    super();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  createSandbox(request: CreateSandboxRequest): FleetSandbox {
    const id = `sbx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const sandbox: FleetSandbox = {
      id,
      name: request.name,
      fleetId: request.fleetId,
      status: "provisioning",
      createdAt: new Date(),
      config: {
        mirror: {
          bots: true,
          sla: true,
          routing: true,
          delegation: true,
          alerts: true,
          budgets: true,
          ...request.mirror,
        },
        overrides: request.overrides ?? {},
        trafficSource: request.trafficSource,
        isolation: {
          network: "full",
          costTracking: true,
          maxCostLimit: 10,
          ...request.isolation,
        },
      },
      promotionGates: (request.promotionGates ?? this.defaultPromotionGates()).map((g) => ({
        ...g,
        status: "pending" as PromotionGateStatus,
      })),
      stats: {
        totalSessions: 0,
        totalCost: 0,
        uptimeMinutes: 0,
        errorsCount: 0,
      },
    };

    // Provisioning is instant in our model (we're reading from config, not spinning up VMs)
    sandbox.status = "ready";

    this.sandboxes.set(id, sandbox);
    this.emit("sandbox_created", { sandboxId: id, name: request.name });

    // Start idle auto-pause timer (30 min)
    this.resetIdleTimer(id);

    return sandbox;
  }

  private defaultPromotionGates(): Array<Omit<PromotionGate, "status" | "currentValue" | "evaluatedAt">> {
    return [
      {
        name: "CQI >= 75",
        type: "metric_threshold",
        condition: { metric: "avgCqi", operator: "gte", value: 75 },
      },
      {
        name: "Error rate < 5%",
        type: "error_rate",
        condition: { metric: "errorRate", operator: "lt", value: 5 },
      },
      {
        name: "p95 response < 10s",
        type: "metric_threshold",
        condition: { metric: "avgResponseTimeMs", operator: "lt", value: 10000 },
      },
      {
        name: "Min 100 sessions",
        type: "min_sessions",
        condition: { metric: "sessionCount", operator: "gte", value: 100 },
      },
    ];
  }

  startSandbox(sandboxId: string): boolean {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox || !["ready", "paused"].includes(sandbox.status)) return false;

    sandbox.status = "running";
    sandbox.startedAt = new Date();

    // Start traffic generation
    this.startTraffic(sandboxId);

    // Start gate evaluation (every 5 min)
    const gateTimer = setInterval(() => this.evaluateGates(sandboxId), 5 * 60 * 1000);
    this.gateEvalTimers.set(sandboxId, gateTimer);

    this.emit("sandbox_started", { sandboxId });
    return true;
  }

  pauseSandbox(sandboxId: string): boolean {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox || sandbox.status !== "running") return false;

    sandbox.status = "paused";
    sandbox.stoppedAt = new Date();

    this.stopTraffic(sandboxId);
    const gateTimer = this.gateEvalTimers.get(sandboxId);
    if (gateTimer) {
      clearInterval(gateTimer);
      this.gateEvalTimers.delete(sandboxId);
    }

    this.emit("sandbox_paused", { sandboxId });
    return true;
  }

  destroySandbox(sandboxId: string): boolean {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return false;

    sandbox.status = "destroying";

    // Cleanup all timers
    this.stopTraffic(sandboxId);
    const gateTimer = this.gateEvalTimers.get(sandboxId);
    if (gateTimer) {
      clearInterval(gateTimer);
      this.gateEvalTimers.delete(sandboxId);
    }
    const idleTimer = this.idleTimers.get(sandboxId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(sandboxId);
    }

    sandbox.status = "destroyed";
    this.emit("sandbox_destroyed", { sandboxId, finalCost: sandbox.stats.totalCost });

    return true;
  }

  // ── Traffic Generation ───────────────────────────────────────────────────

  private startTraffic(sandboxId: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return;

    const { trafficSource } = sandbox.config;

    if (trafficSource.type === "synthetic" && trafficSource.syntheticConfig) {
      const intervalMs = Math.round(
        (60 * 60 * 1000) / trafficSource.syntheticConfig.messagesPerHour,
      );

      const timer = setInterval(() => {
        this.generateSyntheticMessage(sandboxId);
        this.resetIdleTimer(sandboxId);
      }, intervalMs);

      this.trafficTimers.set(sandboxId, timer);
    }

    if (trafficSource.type === "replay" && trafficSource.replayConfig) {
      this.startReplay(sandboxId, trafficSource.replayConfig);
    }
  }

  private stopTraffic(sandboxId: string): void {
    const timer = this.trafficTimers.get(sandboxId);
    if (timer) {
      clearInterval(timer);
      this.trafficTimers.delete(sandboxId);
    }
  }

  private generateSyntheticMessage(sandboxId: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox || sandbox.status !== "running") return;

    // Check cost limit
    if (sandbox.stats.totalCost >= sandbox.config.isolation.maxCostLimit) {
      this.pauseSandbox(sandboxId);
      this.emit("sandbox_cost_limit_reached", { sandboxId, cost: sandbox.stats.totalCost });
      return;
    }

    const config = sandbox.config.trafficSource.syntheticConfig!;

    // Pick random persona
    const persona = config.personas[Math.floor(Math.random() * config.personas.length)];

    // Pick topic based on weights
    const totalWeight = config.topics.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedTopic = config.topics[0]?.topic ?? "general";
    for (const t of config.topics) {
      random -= t.weight;
      if (random <= 0) {
        selectedTopic = t.topic;
        break;
      }
    }

    // Pick channel
    const channel = config.channels[Math.floor(Math.random() * config.channels.length)] ?? "test";

    sandbox.stats.totalSessions++;
    sandbox.stats.totalCost += 0.02 + Math.random() * 0.08; // Simulated cost per session

    this.emit("synthetic_message_generated", {
      sandboxId,
      persona: persona.name,
      topic: selectedTopic,
      channel,
    });
  }

  private startReplay(sandboxId: string, config: ReplayTrafficConfig): void {
    // In production, this would replay actual session JSONL files
    // For now, emit events at the configured speed
    const baseIntervalMs = 10000; // 10 seconds between replayed turns
    const intervalMs = Math.round(baseIntervalMs / config.speedMultiplier);

    let sessionIndex = 0;

    const timer = setInterval(() => {
      if (sessionIndex >= config.sessionIds.length) {
        this.stopTraffic(sandboxId);
        this.emit("replay_complete", { sandboxId });
        return;
      }

      const sandbox = this.sandboxes.get(sandboxId);
      if (sandbox) {
        sandbox.stats.totalSessions++;
      }

      this.emit("session_replayed", {
        sandboxId,
        sessionId: config.sessionIds[sessionIndex],
      });

      sessionIndex++;
    }, intervalMs);

    this.trafficTimers.set(sandboxId, timer);
  }

  // ── Idle Timer ───────────────────────────────────────────────────────────

  private resetIdleTimer(sandboxId: string): void {
    const existing = this.idleTimers.get(sandboxId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const sandbox = this.sandboxes.get(sandboxId);
      if (sandbox && sandbox.status === "running") {
        this.pauseSandbox(sandboxId);
        this.emit("sandbox_idle_paused", { sandboxId });
      }
    }, 30 * 60 * 1000); // 30 minutes

    this.idleTimers.set(sandboxId, timer);
  }

  // ── Gate Evaluation ──────────────────────────────────────────────────────

  private evaluateGates(sandboxId: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox || sandbox.status !== "running") return;

    // Simulate sandbox metrics (in production, read from actual sandbox fleet)
    const sandboxMetrics = this.simulateSandboxMetrics(sandbox);

    for (const gate of sandbox.promotionGates) {
      if (gate.status === "passed" || gate.status === "skipped") continue;
      if (gate.type === "manual_approval") continue; // Can't auto-evaluate

      const { metric, operator, value } = gate.condition as {
        metric: string;
        operator: string;
        value: number;
      };

      const currentValue = (sandboxMetrics as unknown as Record<string, unknown>)[metric] as number | undefined;
      if (currentValue === undefined) continue;

      gate.currentValue = currentValue;
      gate.targetValue = value;
      gate.evaluatedAt = new Date();

      let passed = false;
      switch (operator) {
        case "gte":
          passed = currentValue >= value;
          break;
        case "gt":
          passed = currentValue > value;
          break;
        case "lte":
          passed = currentValue <= value;
          break;
        case "lt":
          passed = currentValue < value;
          break;
        case "eq":
          passed = currentValue === value;
          break;
      }

      gate.status = passed ? "passed" : "pending";
    }

    // Update comparison
    const productionMetrics = this.productionMetrics.getCurrentMetrics();
    sandbox.comparison = this.compareMetrics(sandboxMetrics, productionMetrics);

    // Check if all gates passed → auto-promote if configured
    const allGatesPassed = sandbox.promotionGates.every(
      (g) => g.status === "passed" || g.status === "skipped",
    );
    if (allGatesPassed) {
      this.emit("all_gates_passed", { sandboxId });
    }

    this.emit("gates_evaluated", { sandboxId, allPassed: allGatesPassed });
  }

  private simulateSandboxMetrics(sandbox: FleetSandbox): SandboxMetrics {
    // In production, this would read actual metrics from the sandbox fleet
    return {
      timestamp: new Date(),
      avgCqi: 75 + Math.random() * 15,
      avgResponseTimeMs: 5000 + Math.random() * 5000,
      errorRate: Math.random() * 8,
      slaCompliance: 85 + Math.random() * 15,
      totalCost: sandbox.stats.totalCost,
      costPerSession:
        sandbox.stats.totalSessions > 0
          ? sandbox.stats.totalCost / sandbox.stats.totalSessions
          : 0,
      sessionCount: sandbox.stats.totalSessions,
      routingEfficiency: 3 + Math.random() * 5,
      healingSuccessRate: 0.85 + Math.random() * 0.15,
    };
  }

  private compareMetrics(
    sandbox: SandboxMetrics,
    production: SandboxMetrics,
  ): SandboxComparison {
    const delta: Record<string, number> = {
      avgCqi: sandbox.avgCqi - production.avgCqi,
      avgResponseTimeMs: sandbox.avgResponseTimeMs - production.avgResponseTimeMs,
      errorRate: sandbox.errorRate - production.errorRate,
      slaCompliance: sandbox.slaCompliance - production.slaCompliance,
      costPerSession: sandbox.costPerSession - production.costPerSession,
      routingEfficiency: sandbox.routingEfficiency - production.routingEfficiency,
    };

    // Verdict: count improvements vs degradations
    let improvements = 0;
    let degradations = 0;

    if (delta.avgCqi > 0) improvements++;
    else if (delta.avgCqi < -2) degradations++;

    if (delta.avgResponseTimeMs < 0) improvements++;
    else if (delta.avgResponseTimeMs > 500) degradations++;

    if (delta.errorRate < 0) improvements++;
    else if (delta.errorRate > 1) degradations++;

    if (delta.slaCompliance > 0) improvements++;
    else if (delta.slaCompliance < -2) degradations++;

    const verdict =
      improvements > degradations
        ? "better"
        : degradations > improvements
          ? "worse"
          : "similar";

    return {
      period: {
        from: sandbox.timestamp,
        to: new Date(),
      },
      sandbox,
      production,
      delta,
      verdict,
    };
  }

  // ── Promotion ────────────────────────────────────────────────────────────

  promoteSandbox(sandboxId: string): {
    success: boolean;
    reason?: string;
    overrides: Record<string, unknown>;
  } {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return { success: false, reason: "Sandbox not found", overrides: {} };

    // Check all non-manual gates
    const failedGates = sandbox.promotionGates.filter(
      (g) => g.status !== "passed" && g.status !== "skipped" && g.type !== "manual_approval",
    );
    if (failedGates.length > 0) {
      return {
        success: false,
        reason: `${failedGates.length} promotion gate(s) not passed: ${failedGates.map((g) => g.name).join(", ")}`,
        overrides: {},
      };
    }

    // Return the overrides to apply to production
    this.emit("sandbox_promoted", {
      sandboxId,
      overrides: sandbox.config.overrides,
      comparison: sandbox.comparison,
    });

    // Destroy sandbox after promotion
    this.destroySandbox(sandboxId);

    return { success: true, overrides: sandbox.config.overrides };
  }

  // ── Manual Gate Approval ─────────────────────────────────────────────────

  approveGate(sandboxId: string, gateName: string): boolean {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return false;

    const gate = sandbox.promotionGates.find((g) => g.name === gateName);
    if (!gate) return false;

    gate.status = "passed";
    gate.evaluatedAt = new Date();

    this.emit("gate_manually_approved", { sandboxId, gateName });
    return true;
  }

  // ── Query Methods ────────────────────────────────────────────────────────

  getSandbox(sandboxId: string): FleetSandbox | undefined {
    return this.sandboxes.get(sandboxId);
  }

  listSandboxes(includeDestroyed?: boolean): FleetSandbox[] {
    return Array.from(this.sandboxes.values())
      .filter((s) => includeDestroyed || s.status !== "destroyed")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getComparison(sandboxId: string): SandboxComparison | null {
    const sandbox = this.sandboxes.get(sandboxId);
    return sandbox?.comparison ?? null;
  }

  getGates(sandboxId: string): PromotionGate[] {
    const sandbox = this.sandboxes.get(sandboxId);
    return sandbox?.promotionGates ?? [];
  }
}
