/**
 * Fleet Adaptive Meta-Learning Engine
 *
 * Observes all fleet engines (Routing, Healing, SLA, Delegation, etc.) and their
 * outcomes, then learns which parameter values produce the best results.
 * Uses a multi-armed bandit (UCB1) approach to balance exploration vs exploitation.
 *
 * Key capabilities:
 * - Observable parameter registry (all tunable engine parameters)
 * - Observation collection (before/after metrics for parameter changes)
 * - UCB1 bandit model for parameter optimization
 * - Suggestion generation with evidence and expected improvement
 * - Safety guard (auto-rollback if metrics degrade after change)
 * - Integration with Sandbox for safe testing
 */

import { EventEmitter } from "events";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ObservableParameter {
  id: string;
  engine: string;
  parameter: string; // dot-path like "routing.weights.topicExpertise"
  description: string;
  currentValue: number;
  valueRange: { min: number; max: number; step: number };
  lastChanged: Date;
  changedBy: "human" | "meta-learning";
}

export interface FleetMetricsSnapshot {
  timestamp: Date;
  period: "7d" | "24h" | "1h";
  avgCqi: number;
  avgResponseTimeMs: number;
  slaCompliance: number; // 0-100
  totalCost: number;
  costPerSession: number;
  healingSuccessRate: number; // 0-1
  routingEfficiency: number; // CQI delta from routing
  delegationSuccessRate: number; // 0-1
  conversionRate: number; // from Revenue Attribution
  customerJourneyHealthAvg: number; // from Journey Mapping
  sessionCount: number;
}

export interface Observation {
  id: string;
  observableId: string;
  timestamp: Date;
  oldValue: number;
  newValue: number;
  beforeMetrics: FleetMetricsSnapshot;
  afterMetrics: FleetMetricsSnapshot;
  impact: {
    cqiChange: number;
    costChange: number;
    slaComplianceChange: number;
    overallScore: number; // -100 to +100
  };
}

export interface BanditArm {
  value: number;
  avgReward: number;
  trialCount: number;
  confidence: number; // UCB confidence bound
}

export interface ParameterModel {
  engine: string;
  parameter: string;
  arms: BanditArm[];
  bestArm: number; // value of best arm
  explorationRate: number; // epsilon for ε-greedy fallback
  totalTrials: number;
}

export type SuggestionStatus = "pending" | "approved" | "applied" | "rejected" | "expired" | "reverted";

export interface MetaSuggestion {
  id: string;
  engine: string;
  parameter: string;
  currentValue: number;
  suggestedValue: number;
  expectedImprovement: {
    metric: string;
    currentValue: number;
    expectedValue: number;
    confidence: number;
  };
  evidence: string;
  status: SuggestionStatus;
  autoApply: boolean;
  createdAt: Date;
  appliedAt?: Date;
  revertedAt?: Date;
  revertReason?: string;
}

export interface MetaLearningConfig {
  enabled: boolean;
  autoApply: boolean; // master switch for auto-apply
  explorationRate: number; // global exploration rate (0-1)
  observationPeriodMs: number; // how long to wait before measuring impact
  safetyGuardPeriodMs: number; // how long to monitor after applying
  safetyThreshold: number; // max acceptable metric degradation (%)
  maxSuggestionsPerDay: number;
}

export interface SensitivityAnalysis {
  parameter: string;
  engine: string;
  sensitivity: number; // 0-1 (how much this parameter affects outcomes)
  primaryMetric: string; // which metric is most affected
  direction: "positive" | "negative" | "mixed"; // higher value = better or worse
  sampleCount: number;
}

// ─── UCB1 Algorithm ──────────────────────────────────────────────────────────

function ucb1Score(arm: BanditArm, totalTrials: number): number {
  if (arm.trialCount === 0) return Infinity; // Explore untried arms first
  const exploitation = arm.avgReward;
  const exploration = Math.sqrt((2 * Math.log(totalTrials)) / arm.trialCount);
  return exploitation + exploration;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class MetaLearningEngine extends EventEmitter {
  private observables: Map<string, ObservableParameter> = new Map();
  private observations: Observation[] = [];
  private models: Map<string, ParameterModel> = new Map();
  private suggestions: Map<string, MetaSuggestion> = new Map();
  private config: MetaLearningConfig;

  private safetyTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private evaluationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private metricsCollector: {
      getCurrentMetrics(period: "7d" | "24h" | "1h"): FleetMetricsSnapshot;
    },
    config?: Partial<MetaLearningConfig>,
  ) {
    super();
    this.config = {
      enabled: true,
      autoApply: false,
      explorationRate: 0.1,
      observationPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      safetyGuardPeriodMs: 60 * 60 * 1000, // 1 hour
      safetyThreshold: 5, // 5% max degradation
      maxSuggestionsPerDay: 3,
      ...config,
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (!this.config.enabled) return;

    // Periodically evaluate models and generate suggestions
    this.evaluationTimer = setInterval(
      () => this.evaluateAndSuggest(),
      60 * 60 * 1000, // Every hour
    );

    this.emit("started");
  }

  stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
    for (const timer of this.safetyTimers.values()) {
      clearTimeout(timer);
    }
    this.safetyTimers.clear();
    this.emit("stopped");
  }

  // ── Parameter Registration ───────────────────────────────────────────────

  registerObservable(param: Omit<ObservableParameter, "id" | "lastChanged" | "changedBy">): string {
    const id = `${param.engine}.${param.parameter}`;
    const observable: ObservableParameter = {
      ...param,
      id,
      lastChanged: new Date(),
      changedBy: "human",
    };
    this.observables.set(id, observable);

    // Initialize bandit model with arms covering the value range
    const arms: BanditArm[] = [];
    const { min, max, step } = param.valueRange;
    for (let v = min; v <= max; v += step) {
      arms.push({
        value: Math.round(v * 1000) / 1000,
        avgReward: 0,
        trialCount: v === param.currentValue ? 1 : 0, // Current value has 1 trial
        confidence: 0,
      });
    }

    this.models.set(id, {
      engine: param.engine,
      parameter: param.parameter,
      arms,
      bestArm: param.currentValue,
      explorationRate: this.config.explorationRate,
      totalTrials: 1,
    });

    return id;
  }

  getObservables(): ObservableParameter[] {
    return Array.from(this.observables.values());
  }

  // ── Observation Recording ────────────────────────────────────────────────

  recordObservation(
    observableId: string,
    oldValue: number,
    newValue: number,
    beforeMetrics: FleetMetricsSnapshot,
    afterMetrics: FleetMetricsSnapshot,
  ): Observation {
    const impact = this.calculateImpact(beforeMetrics, afterMetrics);

    const observation: Observation = {
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      observableId,
      timestamp: new Date(),
      oldValue,
      newValue,
      beforeMetrics,
      afterMetrics,
      impact,
    };

    this.observations.push(observation);

    // Update bandit model
    this.updateModel(observableId, newValue, impact.overallScore);

    this.emit("observation_recorded", observation);
    return observation;
  }

  private calculateImpact(
    before: FleetMetricsSnapshot,
    after: FleetMetricsSnapshot,
  ): Observation["impact"] {
    const cqiChange = after.avgCqi - before.avgCqi;
    const costChange = after.totalCost - before.totalCost;
    const slaChange = after.slaCompliance - before.slaCompliance;

    // Overall score: weighted combination, normalized to -100..+100
    const overallScore = Math.max(
      -100,
      Math.min(
        100,
        cqiChange * 2 + // CQI improvement is heavily weighted
          slaChange * 1.5 + // SLA compliance matters
          (costChange < 0 ? Math.abs(costChange) * 0.5 : costChange * -0.5), // Cost savings are good
      ),
    );

    return { cqiChange, costChange, slaComplianceChange: slaChange, overallScore };
  }

  // ── Model Update (UCB1) ──────────────────────────────────────────────────

  private updateModel(observableId: string, value: number, reward: number): void {
    const model = this.models.get(observableId);
    if (!model) return;

    // Find matching arm
    const arm = model.arms.find(
      (a) => Math.abs(a.value - value) < model.arms[0]?.value * 0.001 || a.value === value,
    );
    if (!arm) return;

    // Incremental mean update
    arm.trialCount++;
    arm.avgReward += (reward - arm.avgReward) / arm.trialCount;

    model.totalTrials++;

    // Update UCB confidence for all arms
    for (const a of model.arms) {
      a.confidence = ucb1Score(a, model.totalTrials);
    }

    // Update best arm
    const bestArm = model.arms.reduce((best, a) =>
      a.avgReward > best.avgReward && a.trialCount >= 3 ? a : best,
    );
    model.bestArm = bestArm.value;
  }

  // ── Suggestion Generation ────────────────────────────────────────────────

  private evaluateAndSuggest(): void {
    if (!this.config.enabled) return;

    const today = new Date().toISOString().slice(0, 10);
    const todaySuggestions = Array.from(this.suggestions.values()).filter(
      (s) => s.createdAt.toISOString().slice(0, 10) === today,
    );
    if (todaySuggestions.length >= this.config.maxSuggestionsPerDay) return;

    for (const [id, model] of this.models) {
      const observable = this.observables.get(id);
      if (!observable) continue;

      // Only suggest if we have enough data
      if (model.totalTrials < 5) continue;

      // Find the best arm that's different from current
      const bestArm = model.arms
        .filter((a) => a.trialCount >= 3 && a.value !== observable.currentValue)
        .sort((a, b) => b.avgReward - a.avgReward)[0];

      if (!bestArm) continue;

      // Check if improvement is significant
      const currentArm = model.arms.find((a) => a.value === observable.currentValue);
      if (!currentArm || bestArm.avgReward <= currentArm.avgReward * 1.05) continue;

      // Check if suggestion already exists
      const existingSuggestion = Array.from(this.suggestions.values()).find(
        (s) =>
          s.engine === observable.engine &&
          s.parameter === observable.parameter &&
          s.status === "pending",
      );
      if (existingSuggestion) continue;

      const suggestion: MetaSuggestion = {
        id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        engine: observable.engine,
        parameter: observable.parameter,
        currentValue: observable.currentValue,
        suggestedValue: bestArm.value,
        expectedImprovement: {
          metric: "overallScore",
          currentValue: currentArm.avgReward,
          expectedValue: bestArm.avgReward,
          confidence: Math.min(0.95, bestArm.trialCount / 20),
        },
        evidence: `Based on ${bestArm.trialCount} observations, value ${bestArm.value} produces avg reward ${bestArm.avgReward.toFixed(1)} vs current ${currentArm.avgReward.toFixed(1)} (${model.totalTrials} total observations).`,
        status: "pending",
        autoApply: this.config.autoApply,
        createdAt: new Date(),
      };

      this.suggestions.set(suggestion.id, suggestion);
      this.emit("suggestion_created", suggestion);

      if (suggestion.autoApply) {
        this.applySuggestion(suggestion.id);
      }
    }
  }

  // ── Suggestion Management ────────────────────────────────────────────────

  getSuggestions(status?: SuggestionStatus): MetaSuggestion[] {
    let results = Array.from(this.suggestions.values());
    if (status) {
      results = results.filter((s) => s.status === status);
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  applySuggestion(suggestionId: string): boolean {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion || suggestion.status !== "pending") return false;

    const observable = this.observables.get(`${suggestion.engine}.${suggestion.parameter}`);
    if (!observable) return false;

    // Record before-metrics
    const beforeMetrics = this.metricsCollector.getCurrentMetrics("1h");

    // Apply the change
    const oldValue = observable.currentValue;
    observable.currentValue = suggestion.suggestedValue;
    observable.lastChanged = new Date();
    observable.changedBy = "meta-learning";

    suggestion.status = "applied";
    suggestion.appliedAt = new Date();

    // Start safety guard
    this.startSafetyGuard(suggestionId, observable.id, oldValue, beforeMetrics);

    this.emit("suggestion_applied", suggestion);
    return true;
  }

  rejectSuggestion(suggestionId: string): boolean {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion || suggestion.status !== "pending") return false;

    suggestion.status = "rejected";
    this.emit("suggestion_rejected", suggestion);
    return true;
  }

  // ── Safety Guard ─────────────────────────────────────────────────────────

  private startSafetyGuard(
    suggestionId: string,
    observableId: string,
    previousValue: number,
    beforeMetrics: FleetMetricsSnapshot,
  ): void {
    const timer = setTimeout(() => {
      const afterMetrics = this.metricsCollector.getCurrentMetrics("1h");

      // Check if metrics degraded beyond threshold
      const cqiDegradation =
        beforeMetrics.avgCqi > 0
          ? ((beforeMetrics.avgCqi - afterMetrics.avgCqi) / beforeMetrics.avgCqi) * 100
          : 0;
      const slaDegradation =
        beforeMetrics.slaCompliance > 0
          ? ((beforeMetrics.slaCompliance - afterMetrics.slaCompliance) / beforeMetrics.slaCompliance) * 100
          : 0;

      if (
        cqiDegradation > this.config.safetyThreshold ||
        slaDegradation > this.config.safetyThreshold
      ) {
        // Revert!
        this.revertSuggestion(suggestionId, observableId, previousValue, "Safety guard triggered: metrics degraded beyond threshold");
      } else {
        // Record successful observation
        this.recordObservation(
          observableId,
          previousValue,
          this.observables.get(observableId)!.currentValue,
          beforeMetrics,
          afterMetrics,
        );
      }

      this.safetyTimers.delete(suggestionId);
    }, this.config.safetyGuardPeriodMs);

    this.safetyTimers.set(suggestionId, timer);
  }

  private revertSuggestion(
    suggestionId: string,
    observableId: string,
    previousValue: number,
    reason: string,
  ): void {
    const suggestion = this.suggestions.get(suggestionId);
    const observable = this.observables.get(observableId);

    if (observable) {
      observable.currentValue = previousValue;
      observable.lastChanged = new Date();
      observable.changedBy = "meta-learning";
    }

    if (suggestion) {
      suggestion.status = "reverted";
      suggestion.revertedAt = new Date();
      suggestion.revertReason = reason;
    }

    this.emit("suggestion_reverted", { suggestionId, reason });
  }

  // ── Sensitivity Analysis ─────────────────────────────────────────────────

  getSensitivityAnalysis(): SensitivityAnalysis[] {
    const analyses: SensitivityAnalysis[] = [];

    for (const [id, model] of this.models) {
      const observable = this.observables.get(id);
      if (!observable || model.totalTrials < 5) continue;

      // Calculate variance of rewards across arms
      const rewards = model.arms.filter((a) => a.trialCount > 0).map((a) => a.avgReward);
      if (rewards.length < 2) continue;

      const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
      const variance = rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / rewards.length;
      const sensitivity = Math.min(1, Math.sqrt(variance) / 50); // Normalize

      // Determine direction
      const sortedArms = [...model.arms].filter((a) => a.trialCount > 0).sort((a, b) => a.value - b.value);
      const lowValueReward = sortedArms[0]?.avgReward ?? 0;
      const highValueReward = sortedArms[sortedArms.length - 1]?.avgReward ?? 0;
      const direction =
        highValueReward > lowValueReward * 1.1
          ? "positive"
          : lowValueReward > highValueReward * 1.1
            ? "negative"
            : "mixed";

      analyses.push({
        parameter: observable.parameter,
        engine: observable.engine,
        sensitivity,
        primaryMetric: "overallScore",
        direction,
        sampleCount: model.totalTrials,
      });
    }

    return analyses.sort((a, b) => b.sensitivity - a.sensitivity);
  }

  // ── History ──────────────────────────────────────────────────────────────

  getHistory(options?: { engine?: string; limit?: number }): Observation[] {
    let results = [...this.observations];
    if (options?.engine) {
      results = results.filter((o) => {
        const observable = this.observables.get(o.observableId);
        return observable?.engine === options.engine;
      });
    }
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return results.slice(0, options?.limit ?? 50);
  }

  // ── Config ───────────────────────────────────────────────────────────────

  getConfig(): MetaLearningConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<MetaLearningConfig>): MetaLearningConfig {
    Object.assign(this.config, updates);
    this.emit("config_updated", this.config);
    return { ...this.config };
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats(): {
    totalObservables: number;
    totalObservations: number;
    totalSuggestions: number;
    appliedSuggestions: number;
    revertedSuggestions: number;
    avgImprovementScore: number;
  } {
    const suggestions = Array.from(this.suggestions.values());
    const applied = suggestions.filter((s) => s.status === "applied");
    const reverted = suggestions.filter((s) => s.status === "reverted");

    const appliedObservations = this.observations.filter((o) =>
      suggestions.some(
        (s) =>
          s.status === "applied" &&
          `${s.engine}.${s.parameter}` === o.observableId,
      ),
    );
    const avgImprovement =
      appliedObservations.length > 0
        ? appliedObservations.reduce((sum, o) => sum + o.impact.overallScore, 0) / appliedObservations.length
        : 0;

    return {
      totalObservables: this.observables.size,
      totalObservations: this.observations.length,
      totalSuggestions: suggestions.length,
      appliedSuggestions: applied.length,
      revertedSuggestions: reverted.length,
      avgImprovementScore: Math.round(avgImprovement * 10) / 10,
    };
  }
}
