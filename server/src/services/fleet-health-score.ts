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

// ─── Lightweight snapshot derivation (shared) ────────────────────────────────

export interface FleetHealthDerivationInput {
  /** Bot connection state (monitoring / connecting / authenticating / …). */
  connectionState: string;
  /** Gateway health RPC `ok` flag. */
  healthOk: boolean;
  /** Channels currently connected (from the health RPC). Optional. */
  connectedChannels?: number;
  /** Channels configured on the bot (from the health RPC). Optional. */
  totalChannels?: number;
}

/**
 * Derive a 0–100 fleet health score from a bot's connection state + gateway
 * health, folding in channel connectivity when it is known. This is the single
 * source of truth shared by the snapshot-capture loop (heatmap / time-machine /
 * report), the metrics provider (alerts / self-healing), and the inter-bot
 * graph metadata refresh — previously three drifting copies that all ignored
 * channel health.
 *
 *   monitoring + not ok       → 50   (WS up, gateway reports unhealthy)
 *   monitoring + ok           → 50 + 50·(connected/total channels)
 *   connecting/authenticating → 25   (transitional)
 *   anything else             → 0    (error / disconnected / backoff / dormant)
 *
 * Channel scaling matters: a WS-connected bot whose customer channels
 * (LINE / WhatsApp / …) are ALL down is not actually serving anyone, so it must
 * not read as a perfect 100. A monitoring+ok bot with every channel connected
 * still scores the full 100; one with half its channels down scores 75; all
 * down scores 50. Bots with no channels configured keep the full 100 (the
 * channel dimension does not apply to them).
 */
export function deriveFleetHealthScore(input: FleetHealthDerivationInput): number {
  const { connectionState, healthOk, connectedChannels, totalChannels } = input;
  if (connectionState === "monitoring") {
    if (!healthOk) return 50;
    if (typeof totalChannels === "number" && totalChannels > 0) {
      const connected = Math.max(0, Math.min(connectedChannels ?? 0, totalChannels));
      return Math.round(50 + 50 * (connected / totalChannels));
    }
    return 100;
  }
  if (connectionState === "connecting" || connectionState === "authenticating") {
    return 25;
  }
  return 0;
}

/** Letter grade for a 0–100 score (A ≥90, B ≥75, C ≥60, D ≥40, else F). */
export function fleetHealthGrade(score: number): HealthGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Wrap a 0–100 composite score into the full `BotHealthScore` shape the UI
 * renders (overall + 5-dimension breakdown + grade + trend). Any breakdown
 * dimension not supplied mirrors the composite — this is the honest fallback
 * for dimensions the monitor does not separately instrument (no per-bot
 * latency / token / cron-outcome stream), matching the "representative default,
 * never a fabricated live number" convention used across the fleet feeds.
 */
export function healthScoreFromOverall(
  overall: number,
  breakdown?: Partial<HealthScoreBreakdown>,
): BotHealthScore {
  const o = Math.max(0, Math.min(100, Math.round(overall)));
  return {
    overall: o,
    breakdown: {
      connectivity: breakdown?.connectivity ?? o,
      responsiveness: breakdown?.responsiveness ?? o,
      efficiency: breakdown?.efficiency ?? o,
      channels: breakdown?.channels ?? o,
      cron: breakdown?.cron ?? o,
    },
    grade: fleetHealthGrade(o),
    trend: "stable",
    computedAt: Date.now(),
  };
}

/**
 * Build a full `BotHealthScore` from the lightweight signals the live
 * `/bot/:botId/health` endpoint has available: the bot's connection state, the
 * gateway health `ok` flag, and its channel connectivity. `overall` uses the
 * shared fleet-standard `deriveFleetHealthScore` (channel-aware) so the Bot
 * Detail health card agrees with the dashboard KPI, heatmap, and metrics feed.
 * `connectivity` and `channels` are real; `responsiveness`/`efficiency`/`cron`
 * mirror the composite (not instrumented per-bot).
 */
export function deriveBotHealthScore(input: FleetHealthDerivationInput): BotHealthScore {
  const overall = deriveFleetHealthScore(input);
  const { connectionState, healthOk, connectedChannels, totalChannels } = input;
  const connectivity =
    connectionState === "monitoring"
      ? healthOk
        ? 100
        : 50
      : connectionState === "connecting" || connectionState === "authenticating"
        ? 25
        : 0;
  const channels =
    typeof totalChannels === "number" && totalChannels > 0
      ? Math.round(
          (Math.max(0, Math.min(connectedChannels ?? 0, totalChannels)) / totalChannels) * 100,
        )
      : 100;
  return healthScoreFromOverall(overall, { connectivity, channels });
}

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
