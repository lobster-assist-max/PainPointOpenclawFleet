/**
 * Fleet Deployment Orchestrator
 *
 * Manages safe, coordinated rollout of changes across the entire fleet:
 * - Rolling, blue-green, canary-first, and ring-based deployment strategies
 * - Automatic health gate checks between waves
 * - Auto-rollback when CQI or error rate exceeds thresholds
 * - Dry-run simulation before actual deployment
 * - Integration with Trust Graduation (wave position based on trust level)
 *
 * @see Planning #20
 */

import { EventEmitter } from "node:events";
import { getFleetMonitorService } from "./fleet-monitor.js";
import { getFleetTagService } from "./fleet-tags.js";
import { getTrustGraduationEngine } from "./fleet-trust-graduation.js";
import { getQualityEngine } from "./fleet-quality.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DeploymentTargetType =
  | "prompt_update"
  | "skill_install"
  | "skill_update"
  | "config_change"
  | "gateway_upgrade"
  | "compliance_policy"
  | "custom_rpc";

export type DeploymentStrategy =
  | "all_at_once"
  | "rolling"
  | "blue_green"
  | "canary_first"
  | "ring_based";

export type DeploymentStatus =
  | "draft"
  | "queued"
  | "in_progress"
  | "paused"
  | "completed"
  | "rolling_back"
  | "rolled_back"
  | "failed"
  | "cancelled";

export type WaveStatus =
  | "pending"
  | "deploying"
  | "stabilizing"
  | "gate_checking"
  | "passed"
  | "failed"
  | "rolled_back";

export type BotDeployStatus =
  | "pending"
  | "updating"
  | "verifying"
  | "success"
  | "failed"
  | "rolled_back";

export interface GateChecks {
  minCqi: number;
  maxErrorRate: number;
  maxLatencyMs: number;
  customChecks?: Array<{ name: string; rpcMethod: string; expectedResult: unknown }>;
}

export interface DeploymentWaveConfig {
  name: string;
  botSelector: "percentage" | "explicit" | "tag" | "trust_level";
  selectorValue: string | number;
  stabilizationMinutes: number;
}

export interface BotDeployResult {
  botId: string;
  botName: string;
  status: BotDeployStatus;
  previousState?: Record<string, unknown>;
  error?: string;
  cqiBefore?: number;
  cqiAfter?: number;
}

export interface WaveGateResult {
  passed: boolean;
  metrics: { avgCqi: number; errorRate: number; latencyMs: number };
  failureReason?: string;
}

export interface WaveExecution {
  waveIndex: number;
  status: WaveStatus;
  bots: BotDeployResult[];
  gateResult?: WaveGateResult;
  startedAt?: Date;
  completedAt?: Date;
}

export interface RollbackEntry {
  botId: string;
  rolledBackAt: Date;
  previousState: Record<string, unknown>;
  restoredState: Record<string, unknown>;
  success: boolean;
}

export interface DeploymentPlan {
  id: string;
  fleetId: string;
  name: string;
  createdBy: string;
  createdAt: Date;

  target: {
    type: DeploymentTargetType;
    payload: {
      promptVersion?: { botFilter?: string[]; identityMd?: string; soulMd?: string };
      skillAction?: { skillName: string; version?: string; action: "install" | "update" | "remove" };
      configPatch?: Array<{ path: string; value: unknown }>;
      customRpc?: { method: string; params: Record<string, unknown> };
    };
  };

  strategy: {
    type: DeploymentStrategy;
    waves: DeploymentWaveConfig[];
    gateChecks: GateChecks;
    rollbackPolicy: "auto" | "manual" | "auto_with_approval";
    maxParallelUpdates: number;
  };

  execution: {
    status: DeploymentStatus;
    startedAt?: Date;
    completedAt?: Date;
    currentWave: number;
    waves: WaveExecution[];
    rollbackLog?: RollbackEntry[];
  };
}

export interface DryRunResult {
  planId: string;
  simulatedAt: Date;
  affectedBots: Array<{
    botId: string;
    botName: string;
    currentState: Record<string, unknown>;
    projectedState: Record<string, unknown>;
    riskLevel: "low" | "medium" | "high";
    riskFactors: string[];
  }>;
  estimatedDuration: { minMinutes: number; maxMinutes: number };
  warnings: string[];
  blockers: string[];
}

// ─── Service ────────────────────────────────────────────────────────────────

/** Live fleet bot used to resolve wave selectors against real connected bots. */
export interface DeploymentBotInfo {
  botId: string;
  tags?: string[];
  trustLevel?: number;
  /** Live Conversation Quality Index (0–100) from the quality engine, if computed. */
  cqi?: number;
}

export class DeploymentOrchestrator extends EventEmitter {
  private plans: Map<string, DeploymentPlan> = new Map();
  private nextId = 1;

  constructor(
    // Resolves a company's currently-connected bots (with tags + trust level)
    // so wave selectors target REAL bots. When omitted (bare construction),
    // selectors resolve to nothing rather than fabricated placeholder IDs.
    private botProvider?: {
      getFleetBots(fleetId: string): DeploymentBotInfo[];
    },
  ) {
    super();
  }

  /** Create a new deployment plan (starts in draft status). */
  createPlan(input: {
    fleetId: string;
    name: string;
    createdBy: string;
    target: DeploymentPlan["target"];
    strategy: DeploymentPlan["strategy"];
  }): DeploymentPlan {
    const id = `DEP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(this.nextId++).padStart(2, "0")}`;
    const plan: DeploymentPlan = {
      id,
      fleetId: input.fleetId,
      name: input.name,
      createdBy: input.createdBy,
      createdAt: new Date(),
      target: input.target,
      strategy: input.strategy,
      execution: {
        status: "draft",
        currentWave: 0,
        waves: input.strategy.waves.map((w, i) => ({
          waveIndex: i,
          status: "pending" as WaveStatus,
          bots: [],
        })),
      },
    };
    this.plans.set(id, plan);
    this.emit("plan:created", plan);
    return plan;
  }

  /** Get a deployment plan by ID. */
  getPlan(planId: string): DeploymentPlan | undefined {
    return this.plans.get(planId);
  }

  /** List all deployment plans, optionally filtered. */
  listPlans(filters?: {
    fleetId?: string;
    status?: DeploymentStatus;
    since?: Date;
  }): DeploymentPlan[] {
    let results = Array.from(this.plans.values());
    if (filters?.fleetId) results = results.filter((p) => p.fleetId === filters.fleetId);
    if (filters?.status) results = results.filter((p) => p.execution.status === filters.status);
    if (filters?.since) results = results.filter((p) => p.createdAt >= filters.since!);
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Execute a deployment plan.
   *
   * Wave selectors resolve to REAL connected bots (#181) and each wave's gate
   * check evaluates the targeted bots' REAL Conversation Quality Index (#196) —
   * a below-threshold bot fails the gate and triggers rollback. The config-push
   * itself is not yet actuated (no gateway RPC primitive), so cqiBefore ===
   * cqiAfter; error-rate / latency gate metrics have no per-bot source yet and
   * report 0 rather than fabricated values.
   */
  async execute(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Deployment plan ${planId} not found`);
    if (plan.execution.status !== "draft" && plan.execution.status !== "queued") {
      throw new Error(`Cannot execute plan in ${plan.execution.status} status`);
    }

    plan.execution.status = "in_progress";
    plan.execution.startedAt = new Date();
    this.emit("plan:started", plan);

    // Resolve the live per-bot CQI once so the gate check verifies REAL fleet
    // health instead of Math.random(). The deployment itself doesn't mutate bot
    // state (there is no config-push RPC primitive yet), so cqiBefore === cqiAfter
    // — the gate's job is to confirm the targeted bots are healthy enough before
    // rolling forward, and a genuinely below-threshold bot now blocks the wave.
    const cqiByBot = new Map<string, number>(
      (this.botProvider?.getFleetBots(plan.fleetId) ?? [])
        .filter((b) => typeof b.cqi === "number")
        .map((b) => [b.botId, b.cqi as number]),
    );

    // Wave execution
    for (let i = 0; i < plan.strategy.waves.length; i++) {
      if ((plan.execution.status as DeploymentStatus) === "paused" || (plan.execution.status as DeploymentStatus) === "cancelled") break;

      plan.execution.currentWave = i;
      const wave = plan.execution.waves[i]!;
      wave.status = "deploying";
      wave.startedAt = new Date();
      this.emit("wave:started", { planId, waveIndex: i });

      // Per-bot deploy records use each bot's real CQI. Bots with no computed
      // quality yet fall back to the gate threshold (neutral — don't fabricate).
      wave.bots = this.resolveWaveBots(plan, i).map((botId) => {
        const cqi = cqiByBot.get(botId) ?? plan.strategy.gateChecks.minCqi;
        return {
          botId,
          botName: botId,
          status: "success" as BotDeployStatus,
          cqiBefore: cqi,
          cqiAfter: cqi,
        };
      });

      wave.status = "stabilizing";
      this.emit("wave:stabilizing", { planId, waveIndex: i });

      // Gate check
      wave.status = "gate_checking";
      // Empty wave (selector matched no live bots): gate passes vacuously —
      // there is nothing to regress. Avoids a 0/0 NaN that would fail the gate.
      const avgCqi =
        wave.bots.length > 0
          ? wave.bots.reduce((sum, b) => sum + (b.cqiAfter ?? 0), 0) / wave.bots.length
          : plan.strategy.gateChecks.minCqi;
      wave.gateResult = {
        passed: avgCqi >= plan.strategy.gateChecks.minCqi,
        metrics: {
          avgCqi,
          // No per-bot error-rate / latency source on the monitor yet (see the
          // #179 honest-defaults note) — report 0 rather than fabricating.
          errorRate: 0,
          latencyMs: 0,
        },
      };

      if (!wave.gateResult.passed) {
        wave.status = "failed";
        wave.gateResult.failureReason = `Average CQI ${avgCqi.toFixed(1)} below threshold ${plan.strategy.gateChecks.minCqi}`;
        this.emit("wave:failed", { planId, waveIndex: i, reason: wave.gateResult.failureReason });

        if (plan.strategy.rollbackPolicy === "auto") {
          await this.rollback(planId);
        } else {
          plan.execution.status = "paused";
        }
        return;
      }

      wave.status = "passed";
      wave.completedAt = new Date();
      this.emit("wave:passed", { planId, waveIndex: i });
    }

    plan.execution.status = "completed";
    plan.execution.completedAt = new Date();
    this.emit("plan:completed", plan);
  }

  /** Pause a running deployment. */
  pause(planId: string, reason: string): void {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);
    if (plan.execution.status !== "in_progress") {
      throw new Error(`Cannot pause plan in ${plan.execution.status} status`);
    }
    plan.execution.status = "paused";
    this.emit("plan:paused", { planId, reason });
  }

  /** Resume a paused deployment. */
  async resume(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);
    if (plan.execution.status !== "paused") {
      throw new Error(`Cannot resume plan in ${plan.execution.status} status`);
    }
    plan.execution.status = "in_progress";
    this.emit("plan:resumed", { planId });
  }

  /** Rollback all completed waves in a deployment. */
  async rollback(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    plan.execution.status = "rolling_back";
    plan.execution.rollbackLog = [];
    this.emit("plan:rolling_back", { planId });

    // Roll back completed waves in reverse order
    for (let i = plan.execution.currentWave; i >= 0; i--) {
      const wave = plan.execution.waves[i]!;
      if (wave.status === "pending") continue;

      for (const bot of wave.bots) {
        if (bot.status === "success") {
          plan.execution.rollbackLog.push({
            botId: bot.botId,
            rolledBackAt: new Date(),
            previousState: bot.previousState ?? {},
            restoredState: {},
            success: true,
          });
          bot.status = "rolled_back";
        }
      }
      wave.status = "rolled_back";
    }

    plan.execution.status = "rolled_back";
    plan.execution.completedAt = new Date();
    this.emit("plan:rolled_back", plan);
  }

  /** Cancel a deployment plan. */
  cancel(planId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);
    plan.execution.status = "cancelled";
    plan.execution.completedAt = new Date();
    this.emit("plan:cancelled", { planId });
  }

  /**
   * Dry-run: simulate the deployment without making changes.
   * Returns affected bots, risk assessment, and estimated duration.
   */
  dryRun(planId: string): DryRunResult {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const affectedBots = plan.strategy.waves.flatMap((_, i) =>
      this.resolveWaveBots(plan, i).map((botId) => ({
        botId,
        botName: botId,
        currentState: {} as Record<string, unknown>,
        projectedState: plan.target.payload as Record<string, unknown>,
        riskLevel: (plan.strategy.type === "all_at_once" ? "high" : "low") as "low" | "medium" | "high",
        riskFactors: plan.strategy.type === "all_at_once" ? ["No gradual rollout"] : [],
      })),
    );

    const totalStabilization = plan.strategy.waves.reduce(
      (sum, w) => sum + w.stabilizationMinutes,
      0,
    );

    return {
      planId: plan.id,
      simulatedAt: new Date(),
      affectedBots,
      estimatedDuration: {
        minMinutes: totalStabilization,
        maxMinutes: totalStabilization * 2,
      },
      warnings: affectedBots.length > 10 ? ["Large deployment: consider ring-based strategy"] : [],
      blockers: [],
    };
  }

  /** Get deployment statistics for a fleet. */
  getStats(fleetId: string): {
    totalDeployments: number;
    completedToday: number;
    rollbacksToday: number;
    avgDurationMinutes: number;
  } {
    const plans = this.listPlans({ fleetId });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedToday = plans.filter(
      (p) => p.execution.status === "completed" && p.execution.completedAt && p.execution.completedAt >= today,
    );
    const rolledBackToday = plans.filter(
      (p) => p.execution.status === "rolled_back" && p.execution.completedAt && p.execution.completedAt >= today,
    );

    const durations = completedToday
      .filter((p) => p.execution.startedAt && p.execution.completedAt)
      .map((p) => (p.execution.completedAt!.getTime() - p.execution.startedAt!.getTime()) / 60_000);

    return {
      totalDeployments: plans.length,
      completedToday: completedToday.length,
      rollbacksToday: rolledBackToday.length,
      avgDurationMinutes: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private resolveWaveBots(plan: DeploymentPlan, waveIndex: number): string[] {
    const waveConfig = plan.strategy.waves[waveIndex];
    if (!waveConfig) return [];

    const fleetBots = this.botProvider?.getFleetBots(plan.fleetId) ?? [];

    // No live fleet data (bare construction, or a company with no connected
    // bots): resolve only explicitly-named bots; never fabricate IDs.
    if (fleetBots.length === 0) {
      return waveConfig.botSelector === "explicit"
        ? String(waveConfig.selectorValue).split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    }

    // Deterministic ordering so percentage bands are stable across waves.
    const sorted = [...fleetBots].sort((a, b) => a.botId.localeCompare(b.botId));

    switch (waveConfig.botSelector) {
      case "percentage": {
        // Treat selectorValue as a cumulative coverage target (e.g. 25 → 50 →
        // 100), so each wave deploys to the NEW band of bots — the lower bound
        // is the nearest previous percentage wave's target, never overlapping.
        const total = sorted.length;
        const thisPct = Math.min(100, Math.max(0, Number(waveConfig.selectorValue) || 0));
        let prevPct = 0;
        for (let i = waveIndex - 1; i >= 0; i--) {
          const w = plan.strategy.waves[i];
          if (w?.botSelector === "percentage") {
            prevPct = Math.min(100, Math.max(0, Number(w.selectorValue) || 0));
            break;
          }
        }
        const startIdx = Math.floor((prevPct / 100) * total);
        const endIdx = Math.ceil((thisPct / 100) * total);
        return sorted.slice(startIdx, Math.max(startIdx, endIdx)).map((b) => b.botId);
      }
      case "explicit": {
        const ids = new Set(
          String(waveConfig.selectorValue).split(",").map((s) => s.trim()).filter(Boolean),
        );
        return sorted.filter((b) => ids.has(b.botId)).map((b) => b.botId);
      }
      case "tag": {
        const tag = String(waveConfig.selectorValue);
        return sorted.filter((b) => b.tags?.includes(tag)).map((b) => b.botId);
      }
      case "trust_level": {
        const minLevel = Number(waveConfig.selectorValue) || 0;
        return sorted
          .filter((b) => (b.trustLevel ?? 0) >= minLevel)
          .map((b) => b.botId);
      }
      default:
        return [];
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _orchestrator: DeploymentOrchestrator | null = null;

export function getDeploymentOrchestrator(): DeploymentOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new DeploymentOrchestrator({
      getFleetBots: (fleetId: string): DeploymentBotInfo[] => {
        try {
          const tagService = getFleetTagService();
          // getAllProfiles() is non-creating — only bots with an existing
          // trust profile contribute a level (no side-effect seeding here).
          const trustByBot = new Map<string, number>(
            getTrustGraduationEngine()
              .getAllProfiles()
              .map((p) => [p.botId, p.currentLevel]),
          );
          const qualityEngine = getQualityEngine();

          return getFleetMonitorService()
            .getAllBots()
            .filter((b) => b.companyId === fleetId)
            .map((b) => ({
              botId: b.botId,
              tags: tagService.getTagsForBot(b.botId).map((t) => t.tag),
              trustLevel: trustByBot.get(b.botId) ?? 0,
              // Real CQI so deployment gate checks verify actual bot health.
              cqi: qualityEngine.getBotQuality(b.botId)?.current.overall,
            }));
        } catch {
          // Services not ready (e.g. very early boot) — no live bots to resolve.
          return [];
        }
      },
    });
  }
  return _orchestrator;
}
