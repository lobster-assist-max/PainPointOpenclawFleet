/**
 * Fleet Canary Lab — Structured A/B testing for bot configurations.
 *
 * Enables data-driven decisions by running controlled experiments:
 * - Define hypothesis, control group, test group, and success metrics
 * - Automatically collect data from health scores, costs, and sessions
 * - Run Welch's t-test for statistical significance
 * - Guardrails auto-abort experiments if safety thresholds are breached
 */

import { EventEmitter } from "events";
import { logger } from "../middleware/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExperimentMetric {
  name: string;
  type: "higher_is_better" | "lower_is_better" | "closer_to_target";
  source:
    | "health_score"
    | "cost_per_session"
    | "avg_turn_time"
    | "quality_index"
    | "task_completion_rate"
    | "escalation_rate"
    | "cache_hit_ratio"
    | "tokens_per_turn"
    | "custom";
  target?: number;
  weight: number;
}

export interface ExperimentGuardrails {
  abortIf: {
    healthBelow: number;
    errorRateAbove: number;
    costMultiplierAbove: number;
  };
  rollbackOnAbort: boolean;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: "draft" | "running" | "paused" | "completed" | "aborted";

  controlGroup: {
    botIds: string[];
    configSnapshot: Record<string, unknown>;
  };
  testGroup: {
    botIds: string[];
    configPatch: Record<string, unknown>;
    originalConfig?: Record<string, unknown>;
  };

  metrics: ExperimentMetric[];

  startedAt?: Date;
  endAt?: Date;
  minDurationMs: number;
  minSampleSize: number;

  guardrails: ExperimentGuardrails;

  // Collected data points
  controlSamples: MetricSample[];
  testSamples: MetricSample[];

  result?: ExperimentResult;
  createdAt: Date;
  updatedAt: Date;
}

interface MetricSample {
  botId: string;
  timestamp: Date;
  values: Record<string, number>;
}

export interface MetricComparison {
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

export interface ExperimentResult {
  completedAt: Date;
  comparisons: MetricComparison[];
  overallVerdict: "test_wins" | "control_wins" | "inconclusive";
  recommendation: string;
  totalSamples: { control: number; test: number };
}

// ─── Statistics helpers (zero dependencies) ──────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/**
 * Approximate the two-tailed p-value for Student's t-distribution
 * using the regularized incomplete beta function.
 */
function tDistPValue(t: number, df: number): number {
  // Use the relationship: p = I(df/(df+t²), df/2, 1/2)
  const x = df / (df + t * t);
  return regularizedBeta(x, df / 2, 0.5);
}

/** Regularized incomplete beta function via continued fraction (Lentz's method) */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  // Lentz's continued fraction
  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= c * d;

    // Odd step
    numerator =
      -(((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return (front * f) / a;
}

/** Lanczos approximation for ln(Gamma(z)) */
function lnGamma(z: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return (
      Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
    );
  }

  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Welch's t-test — does NOT assume equal variance between groups.
 */
function welchTTest(
  a: number[],
  b: number[],
): { t: number; df: number; pValue: number } {
  const meanA = mean(a);
  const meanB = mean(b);
  const varA = variance(a);
  const varB = variance(b);
  const nA = a.length;
  const nB = b.length;

  if (nA < 2 || nB < 2) {
    return { t: 0, df: 0, pValue: 1 };
  }

  const seA = varA / nA;
  const seB = varB / nB;
  const seDiff = Math.sqrt(seA + seB);

  if (seDiff === 0) {
    return { t: 0, df: nA + nB - 2, pValue: 1 };
  }

  const t = (meanA - meanB) / seDiff;

  // Welch-Satterthwaite degrees of freedom
  const df =
    Math.pow(seA + seB, 2) /
    (Math.pow(seA, 2) / (nA - 1) + Math.pow(seB, 2) / (nB - 1));

  const pValue = tDistPValue(Math.abs(t), df);

  return { t, df, pValue };
}

// ─── Canary Lab Engine ───────────────────────────────────────────────────────

let instance: CanaryLabEngine | null = null;

export class CanaryLabEngine extends EventEmitter {
  private experiments = new Map<string, Experiment>();
  private collectInterval: ReturnType<typeof setInterval> | null = null;
  private guardrailInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  /** Start periodic data collection (every 60s) and guardrail checks (every 30s) */
  start(): void {
    this.collectInterval = setInterval(() => this.collectAllSamples(), 60_000);
    this.guardrailInterval = setInterval(() => this.checkAllGuardrails(), 30_000);
    logger.info("[CanaryLab] Started — collection every 60s, guardrails every 30s");
  }

  stop(): void {
    if (this.collectInterval) clearInterval(this.collectInterval);
    if (this.guardrailInterval) clearInterval(this.guardrailInterval);
    this.collectInterval = null;
    this.guardrailInterval = null;
    logger.info("[CanaryLab] Stopped");
  }

  // ─── Experiment CRUD ─────────────────────────────────────────────────────

  createExperiment(
    params: Omit<
      Experiment,
      "id" | "status" | "controlSamples" | "testSamples" | "result" | "createdAt" | "updatedAt"
    >,
  ): Experiment {
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const experiment: Experiment = {
      ...params,
      id,
      status: "draft",
      controlSamples: [],
      testSamples: [],
      createdAt: now,
      updatedAt: now,
    };

    // Validate weights sum to ~1
    const weightSum = experiment.metrics.reduce((s, m) => s + m.weight, 0);
    if (Math.abs(weightSum - 1) > 0.01) {
      throw new Error(`Metric weights must sum to 1.0, got ${weightSum}`);
    }

    this.experiments.set(id, experiment);
    this.emit("experimentCreated", { experimentId: id });
    logger.info({ experimentId: id, name: experiment.name }, "[CanaryLab] Experiment created");
    return experiment;
  }

  startExperiment(experimentId: string): Experiment {
    const exp = this.getExperiment(experimentId);
    if (exp.status !== "draft" && exp.status !== "paused") {
      throw new Error(`Cannot start experiment in status "${exp.status}"`);
    }

    exp.status = "running";
    exp.startedAt = exp.startedAt ?? new Date();
    if (exp.endAt && exp.endAt <= new Date()) {
      throw new Error("End date is in the past");
    }
    exp.updatedAt = new Date();

    this.emit("experimentStarted", { experimentId });
    logger.info({ experimentId }, "[CanaryLab] Experiment started");
    return exp;
  }

  pauseExperiment(experimentId: string): Experiment {
    const exp = this.getExperiment(experimentId);
    if (exp.status !== "running") {
      throw new Error(`Cannot pause experiment in status "${exp.status}"`);
    }
    exp.status = "paused";
    exp.updatedAt = new Date();
    this.emit("experimentPaused", { experimentId });
    return exp;
  }

  abortExperiment(experimentId: string, reason: string): Experiment {
    const exp = this.getExperiment(experimentId);
    if (exp.status !== "running" && exp.status !== "paused") {
      throw new Error(`Cannot abort experiment in status "${exp.status}"`);
    }

    exp.status = "aborted";
    exp.updatedAt = new Date();

    // Compute partial results even on abort
    exp.result = this.analyzeResults(exp);
    exp.result.recommendation = `Aborted: ${reason}. Partial data (${exp.controlSamples.length} control, ${exp.testSamples.length} test samples).`;

    this.emit("experimentAborted", { experimentId, reason });
    logger.warn({ experimentId, reason }, "[CanaryLab] Experiment aborted");
    return exp;
  }

  completeExperiment(experimentId: string): Experiment {
    const exp = this.getExperiment(experimentId);
    if (exp.status !== "running") {
      throw new Error(`Cannot complete experiment in status "${exp.status}"`);
    }

    exp.status = "completed";
    exp.updatedAt = new Date();
    exp.result = this.analyzeResults(exp);

    this.emit("experimentCompleted", { experimentId, result: exp.result });
    logger.info(
      { experimentId, verdict: exp.result.overallVerdict },
      "[CanaryLab] Experiment completed",
    );
    return exp;
  }

  getExperiment(experimentId: string): Experiment {
    const exp = this.experiments.get(experimentId);
    if (!exp) throw new Error(`Experiment not found: ${experimentId}`);
    return exp;
  }

  listExperiments(filter?: { status?: Experiment["status"] }): Experiment[] {
    const all = Array.from(this.experiments.values());
    if (filter?.status) return all.filter((e) => e.status === filter.status);
    return all;
  }

  // ─── Data Collection ─────────────────────────────────────────────────────

  /**
   * Called externally (from fleet-bootstrap) to feed metric samples.
   * The monitor service pushes bot metrics here periodically.
   */
  ingestSample(botId: string, values: Record<string, number>): void {
    const sample: MetricSample = {
      botId,
      timestamp: new Date(),
      values,
    };

    for (const exp of this.experiments.values()) {
      if (exp.status !== "running") continue;

      if (exp.controlGroup.botIds.includes(botId)) {
        exp.controlSamples.push(sample);
      } else if (exp.testGroup.botIds.includes(botId)) {
        exp.testSamples.push(sample);
      }
    }
  }

  private collectAllSamples(): void {
    // This method triggers data collection from the monitor service.
    // In production, fleet-bootstrap wires this to FleetMonitorService.
    this.emit("collectSamples");
  }

  // ─── Guardrail Evaluation ────────────────────────────────────────────────

  private checkAllGuardrails(): void {
    for (const exp of this.experiments.values()) {
      if (exp.status !== "running") continue;

      // Check auto-completion (end date reached)
      if (exp.endAt && new Date() >= exp.endAt) {
        const hasMinSamples =
          exp.controlSamples.length >= exp.minSampleSize &&
          exp.testSamples.length >= exp.minSampleSize;

        if (hasMinSamples) {
          this.completeExperiment(exp.id);
        } else {
          logger.warn(
            { experimentId: exp.id },
            "[CanaryLab] End date reached but insufficient samples — extending",
          );
        }
        continue;
      }

      // Check guardrails on test group bots
      const recentTestSamples = exp.testSamples.filter(
        (s) => Date.now() - s.timestamp.getTime() < 300_000, // last 5 min
      );

      if (recentTestSamples.length === 0) continue;

      const { guardrails } = exp;

      // Health check
      const healthValues = recentTestSamples
        .map((s) => s.values.health_score)
        .filter((v) => v !== undefined);

      if (healthValues.length > 0) {
        const avgHealth = mean(healthValues);
        if (avgHealth < guardrails.abortIf.healthBelow) {
          this.abortExperiment(
            exp.id,
            `Test group health ${avgHealth.toFixed(1)} below threshold ${guardrails.abortIf.healthBelow}`,
          );
          continue;
        }
      }

      // Error rate check
      const errorRates = recentTestSamples
        .map((s) => s.values.error_rate)
        .filter((v) => v !== undefined);

      if (errorRates.length > 0) {
        const avgErrorRate = mean(errorRates);
        if (avgErrorRate > guardrails.abortIf.errorRateAbove) {
          this.abortExperiment(
            exp.id,
            `Test group error rate ${(avgErrorRate * 100).toFixed(1)}% above threshold ${guardrails.abortIf.errorRateAbove * 100}%`,
          );
          continue;
        }
      }

      // Cost multiplier check
      const controlCosts = exp.controlSamples
        .filter((s) => Date.now() - s.timestamp.getTime() < 3600_000)
        .map((s) => s.values.cost_per_session)
        .filter((v) => v !== undefined);

      const testCosts = recentTestSamples
        .map((s) => s.values.cost_per_session)
        .filter((v) => v !== undefined);

      if (controlCosts.length > 0 && testCosts.length > 0) {
        const controlAvg = mean(controlCosts);
        const testAvg = mean(testCosts);
        if (controlAvg > 0) {
          const multiplier = testAvg / controlAvg;
          if (multiplier > guardrails.abortIf.costMultiplierAbove) {
            this.abortExperiment(
              exp.id,
              `Test group cost ${multiplier.toFixed(1)}x control, above threshold ${guardrails.abortIf.costMultiplierAbove}x`,
            );
          }
        }
      }
    }
  }

  // ─── Result Analysis ─────────────────────────────────────────────────────

  private analyzeResults(exp: Experiment): ExperimentResult {
    const comparisons: MetricComparison[] = [];

    for (const metric of exp.metrics) {
      const controlValues = exp.controlSamples
        .map((s) => s.values[metric.source])
        .filter((v) => v !== undefined);

      const testValues = exp.testSamples
        .map((s) => s.values[metric.source])
        .filter((v) => v !== undefined);

      const controlMean = mean(controlValues);
      const testMean = mean(testValues);
      const delta = testMean - controlMean;
      const deltaPercent = controlMean !== 0 ? (delta / controlMean) * 100 : 0;

      const { pValue } = welchTTest(controlValues, testValues);
      const significant = pValue < 0.05;

      let winner: "control" | "test" | "tie";
      if (!significant) {
        winner = "tie";
      } else if (metric.type === "higher_is_better") {
        winner = testMean > controlMean ? "test" : "control";
      } else if (metric.type === "lower_is_better") {
        winner = testMean < controlMean ? "test" : "control";
      } else {
        // closer_to_target
        const target = metric.target ?? 0;
        winner =
          Math.abs(testMean - target) < Math.abs(controlMean - target)
            ? "test"
            : "control";
      }

      comparisons.push({
        metric: metric.name,
        controlMean,
        testMean,
        controlStdDev: stdDev(controlValues),
        testStdDev: stdDev(testValues),
        delta,
        deltaPercent,
        pValue,
        significant,
        winner,
        sampleSize: { control: controlValues.length, test: testValues.length },
      });
    }

    // Overall verdict: weighted vote
    let testScore = 0;
    let controlScore = 0;
    for (let i = 0; i < comparisons.length; i++) {
      const weight = exp.metrics[i].weight;
      if (comparisons[i].winner === "test") testScore += weight;
      else if (comparisons[i].winner === "control") controlScore += weight;
    }

    let overallVerdict: ExperimentResult["overallVerdict"];
    if (testScore > controlScore + 0.1) {
      overallVerdict = "test_wins";
    } else if (controlScore > testScore + 0.1) {
      overallVerdict = "control_wins";
    } else {
      overallVerdict = "inconclusive";
    }

    const recommendation = this.generateRecommendation(
      exp,
      comparisons,
      overallVerdict,
    );

    return {
      completedAt: new Date(),
      comparisons,
      overallVerdict,
      recommendation,
      totalSamples: {
        control: exp.controlSamples.length,
        test: exp.testSamples.length,
      },
    };
  }

  private generateRecommendation(
    exp: Experiment,
    comparisons: MetricComparison[],
    verdict: ExperimentResult["overallVerdict"],
  ): string {
    const significantMetrics = comparisons.filter((c) => c.significant);
    const testWins = significantMetrics.filter((c) => c.winner === "test");
    const controlWins = significantMetrics.filter(
      (c) => c.winner === "control",
    );

    if (verdict === "test_wins") {
      const benefits = testWins
        .map(
          (c) =>
            `${c.metric} ${c.deltaPercent > 0 ? "+" : ""}${c.deltaPercent.toFixed(1)}%`,
        )
        .join(", ");
      const tradeoffs = controlWins
        .map(
          (c) =>
            `${c.metric} ${c.deltaPercent > 0 ? "+" : ""}${c.deltaPercent.toFixed(1)}%`,
        )
        .join(", ");

      let rec = `Test configuration wins. Benefits: ${benefits}.`;
      if (tradeoffs) rec += ` Tradeoffs: ${tradeoffs}.`;
      rec += ` Recommend applying test config to all bots.`;
      return rec;
    }

    if (verdict === "control_wins") {
      return `Current configuration is better. Test group showed degradation in: ${controlWins.map((c) => c.metric).join(", ")}. Recommend keeping current config.`;
    }

    return `Results are inconclusive. ${significantMetrics.length}/${comparisons.length} metrics showed significant differences. Consider extending the experiment duration or increasing sample size.`;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export function getCanaryLabEngine(): CanaryLabEngine {
  if (!instance) {
    instance = new CanaryLabEngine();
  }
  return instance;
}

export function disposeCanaryLabEngine(): void {
  if (instance) {
    instance.stop();
    instance.removeAllListeners();
    instance = null;
  }
}
