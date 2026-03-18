/**
 * Bot Health Score — Composite health metric for Fleet monitoring.
 *
 * Computes a 0-100 health score from five weighted signals:
 *   connectivity (30%) — WS uptime ratio minus reconnect penalty
 *   responsiveness (25%) — Average RPC latency
 *   efficiency (20%) — Token cache hit ratio
 *   channels (15%) — Connected vs configured channels
 *   cron (10%) — Cron job success rate
 *
 * Also computes a letter grade (A-F) and trend (improving/stable/degrading).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealthScoreBreakdown {
  connectivity: number;
  responsiveness: number;
  efficiency: number;
  channels: number;
  cron: number;
}

export type HealthGrade = "A" | "B" | "C" | "D" | "F";
export type HealthTrend = "improving" | "stable" | "degrading";

export interface BotHealthScore {
  /** Weighted overall score 0-100 */
  overall: number;
  /** Per-dimension scores (each 0-100) */
  breakdown: HealthScoreBreakdown;
  /** Letter grade */
  grade: HealthGrade;
  /** Trend compared to previous window */
  trend: HealthTrend;
  /** When this score was computed */
  computedAt: number;
}

/** Raw signals fed into the scoring algorithm. */
export interface HealthSignals {
  /** Total time the bot has been tracked (ms) */
  totalTrackedMs: number;
  /** Time in "monitoring" state (ms) */
  uptimeMs: number;
  /** Number of reconnect attempts since tracking started */
  reconnectCount: number;

  /** Recent RPC round-trip times (ms). Last 20 measurements. */
  latencySamples: number[];

  /** Token usage — total input tokens across recent sessions */
  totalInputTokens: number;
  /** Token usage — cached input tokens across recent sessions */
  cachedInputTokens: number;

  /** Number of channels currently connected */
  connectedChannels: number;
  /** Number of channels configured on this bot */
  totalChannels: number;

  /** Cron runs completed successfully in last 24h */
  cronSuccessRuns: number;
  /** Total cron runs attempted in last 24h */
  cronTotalRuns: number;

  /** Previous window's overall score (for trend computation) */
  previousScore: number | null;
}

// ─── Weights ─────────────────────────────────────────────────────────────────

const WEIGHTS: Record<keyof HealthScoreBreakdown, number> = {
  connectivity: 0.30,
  responsiveness: 0.25,
  efficiency: 0.20,
  channels: 0.15,
  cron: 0.10,
};

// ─── Scoring Functions ───────────────────────────────────────────────────────

function scoreConnectivity(signals: HealthSignals): number {
  if (signals.totalTrackedMs <= 0) return 0;
  const uptimeRatio = Math.min(signals.uptimeMs / signals.totalTrackedMs, 1);
  const base = uptimeRatio * 100;
  // Each reconnect costs 5 points, capped at 50
  const penalty = Math.min(signals.reconnectCount * 5, 50);
  return Math.max(Math.round(base - penalty), 0);
}

function scoreResponsiveness(signals: HealthSignals): number {
  const samples = signals.latencySamples;
  if (samples.length === 0) return 50; // no data → neutral

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

  if (avg < 500) return 100;
  if (avg < 1000) return 90;
  if (avg < 2000) return 80;
  if (avg < 3000) return 70;
  if (avg < 5000) return 60;
  if (avg < 8000) return 40;
  if (avg < 10000) return 30;
  return 10;
}

function scoreEfficiency(signals: HealthSignals): number {
  if (signals.totalInputTokens <= 0) return 50; // no data → neutral

  const cachedRatio = signals.cachedInputTokens / signals.totalInputTokens;
  // Linear mapping: 0% cached = 0, 100% cached = 100
  // Bonus: exceptionally high cache ratio
  let score = Math.round(cachedRatio * 100);

  // Context weight bonus: high cache ratio (>60%) gets a +10 bonus capped at 100
  if (cachedRatio > 0.6) {
    score = Math.min(score + 10, 100);
  }

  return score;
}

function scoreChannels(signals: HealthSignals): number {
  // If no channels configured, the bot doesn't use channels → full score
  if (signals.totalChannels <= 0) return 100;
  return Math.round((signals.connectedChannels / signals.totalChannels) * 100);
}

function scoreCron(signals: HealthSignals): number {
  // No cron configured → full score (not penalized)
  if (signals.cronTotalRuns <= 0) return 100;
  return Math.round((signals.cronSuccessRuns / signals.cronTotalRuns) * 100);
}

// ─── Grade + Trend ───────────────────────────────────────────────────────────

function gradeFromScore(score: number): HealthGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function trendFromScores(current: number, previous: number | null): HealthTrend {
  if (previous === null) return "stable";
  const delta = current - previous;
  // ±5 is considered stable (noise threshold)
  if (delta > 5) return "improving";
  if (delta < -5) return "degrading";
  return "stable";
}

// ─── Main Computation ────────────────────────────────────────────────────────

export function computeHealthScore(signals: HealthSignals): BotHealthScore {
  const breakdown: HealthScoreBreakdown = {
    connectivity: scoreConnectivity(signals),
    responsiveness: scoreResponsiveness(signals),
    efficiency: scoreEfficiency(signals),
    channels: scoreChannels(signals),
    cron: scoreCron(signals),
  };

  const overall = Math.round(
    breakdown.connectivity * WEIGHTS.connectivity +
    breakdown.responsiveness * WEIGHTS.responsiveness +
    breakdown.efficiency * WEIGHTS.efficiency +
    breakdown.channels * WEIGHTS.channels +
    breakdown.cron * WEIGHTS.cron,
  );

  return {
    overall,
    breakdown,
    grade: gradeFromScore(overall),
    trend: trendFromScores(overall, signals.previousScore),
    computedAt: Date.now(),
  };
}

// ─── Health Score Tracker (per-bot accumulator) ──────────────────────────────

const MAX_LATENCY_SAMPLES = 20;
const SCORE_HISTORY_SIZE = 2; // keep current + previous window

/**
 * Tracks raw signals for a single bot and computes health scores on demand.
 * Attach one instance per managed bot in FleetMonitorService.
 */
export class BotHealthTracker {
  private startedAt: number;
  private uptimeMs = 0;
  private lastMonitoringStart: number | null = null;
  private reconnectCount = 0;
  private latencySamples: number[] = [];
  private totalInputTokens = 0;
  private cachedInputTokens = 0;
  private connectedChannels = 0;
  private totalChannels = 0;
  private cronSuccessRuns = 0;
  private cronTotalRuns = 0;
  private previousScore: number | null = null;
  private _lastScore: BotHealthScore | null = null;

  constructor() {
    this.startedAt = Date.now();
  }

  /** Call when WS enters "monitoring" state */
  onConnected(): void {
    this.lastMonitoringStart = Date.now();
  }

  /** Call when WS leaves "monitoring" state */
  onDisconnected(): void {
    if (this.lastMonitoringStart !== null) {
      this.uptimeMs += Date.now() - this.lastMonitoringStart;
      this.lastMonitoringStart = null;
    }
  }

  /** Call on each reconnect attempt */
  onReconnect(): void {
    this.reconnectCount++;
  }

  /** Record an RPC round-trip latency sample */
  recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.shift();
    }
  }

  /** Update token usage from sessions.usage response */
  updateTokenUsage(input: number, cached: number): void {
    this.totalInputTokens = input;
    this.cachedInputTokens = cached;
  }

  /** Update channel health from channels.status response */
  updateChannels(connected: number, total: number): void {
    this.connectedChannels = connected;
    this.totalChannels = total;
  }

  /** Update cron stats from cron.runs response */
  updateCronStats(success: number, total: number): void {
    this.cronSuccessRuns = success;
    this.cronTotalRuns = total;
  }

  /** Compute current health score */
  compute(): BotHealthScore {
    // Freeze uptime calculation including current monitoring window
    let currentUptime = this.uptimeMs;
    if (this.lastMonitoringStart !== null) {
      currentUptime += Date.now() - this.lastMonitoringStart;
    }

    const signals: HealthSignals = {
      totalTrackedMs: Date.now() - this.startedAt,
      uptimeMs: currentUptime,
      reconnectCount: this.reconnectCount,
      latencySamples: [...this.latencySamples],
      totalInputTokens: this.totalInputTokens,
      cachedInputTokens: this.cachedInputTokens,
      connectedChannels: this.connectedChannels,
      totalChannels: this.totalChannels,
      cronSuccessRuns: this.cronSuccessRuns,
      cronTotalRuns: this.cronTotalRuns,
      previousScore: this.previousScore,
    };

    const score = computeHealthScore(signals);

    // Rotate: current becomes previous for next computation
    if (this._lastScore) {
      this.previousScore = this._lastScore.overall;
    }
    this._lastScore = score;

    return score;
  }

  /** Get last computed score without recomputing */
  get lastScore(): BotHealthScore | null {
    return this._lastScore;
  }

  /** Reset tracker (e.g. when bot is reconnected after long outage) */
  reset(): void {
    this.startedAt = Date.now();
    this.uptimeMs = 0;
    this.lastMonitoringStart = null;
    this.reconnectCount = 0;
    this.latencySamples = [];
    this.previousScore = this._lastScore?.overall ?? null;
  }
}
