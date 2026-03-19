/**
 * Fleet Conversation Quality Index (CQI) — Outcome-oriented bot quality measurement.
 *
 * Goes beyond Health Score ("is it working?") to measure ("is it working WELL?"):
 * - Effectiveness: task completion rate, conversation efficiency
 * - Reliability: tool success rate, low error rate
 * - Experience: response speed, low repeated queries
 * - Engagement: user retention, low abandonment
 *
 * Signals are inferred from existing session/turn data — no extra instrumentation needed.
 */

import { EventEmitter } from "events";
import { logger } from "../middleware/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QualitySignals {
  taskCompletion: {
    completedSessions: number;
    abandonedSessions: number;
    rate: number;
  };
  conversationEfficiency: {
    avgTurnsToResolve: number;
    medianTurnsToResolve: number;
    p95TurnsToResolve: number;
  };
  reEngagement: {
    returningUsers7d: number;
    newUsers7d: number;
    retentionRate: number;
  };
  escalationRate: {
    escalatedSessions: number;
    totalSessions: number;
    rate: number;
  };
  responseRelevance: {
    repeatedQueries: number;
    totalQueries: number;
    rate: number;
  };
  toolSuccessRate: {
    totalToolCalls: number;
    successfulToolCalls: number;
    rate: number;
  };
  responseTime: {
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
  };
}

export interface QualityDimensions {
  effectiveness: number;  // 0-100 — task completion + efficiency
  reliability: number;    // 0-100 — tool success + low errors
  experience: number;     // 0-100 — response speed + low repetition
  engagement: number;     // 0-100 — retention + low abandonment
}

export type QualityGrade = "S" | "A" | "B" | "C" | "D" | "F";

export interface QualityIndex {
  overall: number;
  grade: QualityGrade;
  dimensions: QualityDimensions;
  trend: "improving" | "stable" | "declining";
  comparedToFleetAvg: number;
  signals: QualitySignals;
  computedAt: Date;
}

export interface BotQuality {
  botId: string;
  current: QualityIndex;
  history7d: Array<{ date: string; overall: number; grade: QualityGrade }>;
}

// ─── Dimension weights ───────────────────────────────────────────────────────

const DIMENSION_WEIGHTS: Record<keyof QualityDimensions, number> = {
  effectiveness: 0.35,
  reliability: 0.25,
  experience: 0.20,
  engagement: 0.20,
};

// ─── Grade thresholds ────────────────────────────────────────────────────────

function scoreToGrade(score: number): QualityGrade {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ─── Statistics helpers ──────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Quality Engine ──────────────────────────────────────────────────────────

let instance: QualityEngine | null = null;

export class QualityEngine extends EventEmitter {
  private botQualities = new Map<string, BotQuality>();
  private computeInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  /** Start periodic quality computation (every 5 minutes) */
  start(): void {
    this.computeInterval = setInterval(() => this.computeAll(), 300_000);
    logger.info("[QualityEngine] Started — computing CQI every 5 minutes");
  }

  stop(): void {
    if (this.computeInterval) clearInterval(this.computeInterval);
    this.computeInterval = null;
    logger.info("[QualityEngine] Stopped");
  }

  // ─── Compute CQI from raw session data ───────────────────────────────────

  /**
   * Feed raw session data for a bot. Call this from fleet-bootstrap
   * when session data is refreshed from the gateway.
   */
  computeForBot(botId: string, rawData: RawSessionData): QualityIndex {
    const signals = this.extractSignals(rawData);
    const dimensions = this.computeDimensions(signals);
    const overall = this.computeOverall(dimensions);
    const grade = scoreToGrade(overall);

    const existing = this.botQualities.get(botId);
    const previousOverall = existing?.current.overall;

    let trend: QualityIndex["trend"] = "stable";
    if (existing?.history7d && existing.history7d.length >= 3) {
      const recent = existing.history7d.slice(-3).map((h) => h.overall);
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (overall > avgRecent + 2) trend = "improving";
      else if (overall < avgRecent - 2) trend = "declining";
    }

    // Fleet average comparison
    const allOveralls = Array.from(this.botQualities.values()).map(
      (q) => q.current.overall,
    );
    const fleetAvg =
      allOveralls.length > 0
        ? allOveralls.reduce((a, b) => a + b, 0) / allOveralls.length
        : overall;
    const comparedToFleetAvg =
      fleetAvg > 0 ? ((overall - fleetAvg) / fleetAvg) * 100 : 0;

    const qi: QualityIndex = {
      overall,
      grade,
      dimensions,
      trend,
      comparedToFleetAvg,
      signals,
      computedAt: new Date(),
    };

    // Update history
    const today = new Date().toISOString().slice(0, 10);
    const history = existing?.history7d ?? [];
    const lastEntry = history[history.length - 1];

    if (lastEntry?.date === today) {
      lastEntry.overall = overall;
      lastEntry.grade = grade;
    } else {
      history.push({ date: today, overall, grade });
    }

    // Keep only 7 days
    while (history.length > 7) history.shift();

    this.botQualities.set(botId, {
      botId,
      current: qi,
      history7d: history,
    });

    // Emit events
    if (previousOverall !== undefined && Math.abs(overall - previousOverall) >= 5) {
      this.emit("qualityChanged", {
        botId,
        previous: previousOverall,
        current: overall,
        grade,
        trend,
      });
    }

    return qi;
  }

  getBotQuality(botId: string): BotQuality | undefined {
    return this.botQualities.get(botId);
  }

  getFleetQuality(): {
    fleetAvg: number;
    fleetGrade: QualityGrade;
    bots: BotQuality[];
    dimensions: QualityDimensions;
  } {
    const bots = Array.from(this.botQualities.values());
    if (bots.length === 0) {
      return {
        fleetAvg: 0,
        fleetGrade: "F",
        bots: [],
        dimensions: { effectiveness: 0, reliability: 0, experience: 0, engagement: 0 },
      };
    }

    const fleetAvg =
      bots.reduce((s, b) => s + b.current.overall, 0) / bots.length;

    const dimensions: QualityDimensions = {
      effectiveness:
        bots.reduce((s, b) => s + b.current.dimensions.effectiveness, 0) / bots.length,
      reliability:
        bots.reduce((s, b) => s + b.current.dimensions.reliability, 0) / bots.length,
      experience:
        bots.reduce((s, b) => s + b.current.dimensions.experience, 0) / bots.length,
      engagement:
        bots.reduce((s, b) => s + b.current.dimensions.engagement, 0) / bots.length,
    };

    return {
      fleetAvg,
      fleetGrade: scoreToGrade(fleetAvg),
      bots,
      dimensions,
    };
  }

  // ─── Signal Extraction ───────────────────────────────────────────────────

  private extractSignals(data: RawSessionData): QualitySignals {
    // Task completion: sessions that ended normally vs abandoned
    const abandonThresholdMs = 5 * 60 * 1000; // 5 min no response = abandoned
    let completed = 0;
    let abandoned = 0;
    for (const session of data.sessions) {
      if (session.endedNormally) {
        completed++;
      } else if (
        session.lastUserMessageAt &&
        Date.now() - session.lastUserMessageAt.getTime() > abandonThresholdMs &&
        !session.active
      ) {
        abandoned++;
      } else {
        completed++; // Active or recently ended
      }
    }
    const totalSessions = completed + abandoned;

    // Conversation efficiency
    const turnsPerSession = data.sessions
      .filter((s) => s.turnCount > 0)
      .map((s) => s.turnCount);

    // Re-engagement
    const uniqueUsersThisWeek = new Set(data.sessions.map((s) => s.userId)).size;
    const returningUsers = data.sessions.filter((s) => s.isReturningUser).length;

    // Escalation
    const escalated = data.sessions.filter((s) => s.escalated).length;

    // Repeated queries (proxy: same user sends nearly identical messages within a session)
    let repeatedQueries = 0;
    let totalQueries = 0;
    for (const session of data.sessions) {
      totalQueries += session.userMessageCount;
      repeatedQueries += session.repeatedQueryCount ?? 0;
    }

    // Tool success
    const totalTools = data.toolCalls.total;
    const successTools = data.toolCalls.successful;

    // Response time
    const responseTimes = data.sessions
      .flatMap((s) => s.responseTimes)
      .filter((t) => t > 0);

    return {
      taskCompletion: {
        completedSessions: completed,
        abandonedSessions: abandoned,
        rate: totalSessions > 0 ? completed / totalSessions : 1,
      },
      conversationEfficiency: {
        avgTurnsToResolve:
          turnsPerSession.length > 0
            ? turnsPerSession.reduce((a, b) => a + b, 0) / turnsPerSession.length
            : 0,
        medianTurnsToResolve: median(turnsPerSession),
        p95TurnsToResolve: percentile(turnsPerSession, 95),
      },
      reEngagement: {
        returningUsers7d: returningUsers,
        newUsers7d: uniqueUsersThisWeek - returningUsers,
        retentionRate:
          uniqueUsersThisWeek > 0 ? returningUsers / uniqueUsersThisWeek : 0,
      },
      escalationRate: {
        escalatedSessions: escalated,
        totalSessions,
        rate: totalSessions > 0 ? escalated / totalSessions : 0,
      },
      responseRelevance: {
        repeatedQueries,
        totalQueries,
        rate: totalQueries > 0 ? repeatedQueries / totalQueries : 0,
      },
      toolSuccessRate: {
        totalToolCalls: totalTools,
        successfulToolCalls: successTools,
        rate: totalTools > 0 ? successTools / totalTools : 1,
      },
      responseTime: {
        avgMs:
          responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : 0,
        p50Ms: median(responseTimes),
        p95Ms: percentile(responseTimes, 95),
      },
    };
  }

  // ─── Dimension Computation ───────────────────────────────────────────────

  private computeDimensions(signals: QualitySignals): QualityDimensions {
    // Effectiveness (35%): task completion + conversation efficiency
    const completionScore = signals.taskCompletion.rate * 100;
    const efficiencyScore = clamp(
      100 - (signals.conversationEfficiency.avgTurnsToResolve - 3) * 10,
      0,
      100,
    ); // 3 turns = 100, 13+ turns = 0
    const effectiveness = completionScore * 0.6 + efficiencyScore * 0.4;

    // Reliability (25%): tool success + low escalation
    const toolScore = signals.toolSuccessRate.rate * 100;
    const noEscalationScore = (1 - signals.escalationRate.rate) * 100;
    const reliability = toolScore * 0.7 + noEscalationScore * 0.3;

    // Experience (20%): response speed + low repetition
    const speedScore = clamp(
      100 - (signals.responseTime.p95Ms - 3000) / 100,
      0,
      100,
    ); // p95 3s = 100, 13s = 0
    const relevanceScore = (1 - signals.responseRelevance.rate) * 100;
    const experience = speedScore * 0.6 + relevanceScore * 0.4;

    // Engagement (20%): retention + low abandonment
    const retentionScore = signals.reEngagement.retentionRate * 100;
    const noAbandonScore =
      (1 -
        (signals.taskCompletion.abandonedSessions /
          Math.max(
            1,
            signals.taskCompletion.completedSessions +
              signals.taskCompletion.abandonedSessions,
          ))) *
      100;
    const engagement = retentionScore * 0.5 + noAbandonScore * 0.5;

    return {
      effectiveness: Math.round(clamp(effectiveness, 0, 100)),
      reliability: Math.round(clamp(reliability, 0, 100)),
      experience: Math.round(clamp(experience, 0, 100)),
      engagement: Math.round(clamp(engagement, 0, 100)),
    };
  }

  private computeOverall(dimensions: QualityDimensions): number {
    const overall =
      dimensions.effectiveness * DIMENSION_WEIGHTS.effectiveness +
      dimensions.reliability * DIMENSION_WEIGHTS.reliability +
      dimensions.experience * DIMENSION_WEIGHTS.experience +
      dimensions.engagement * DIMENSION_WEIGHTS.engagement;

    return Math.round(clamp(overall, 0, 100));
  }

  // ─── Periodic computation ────────────────────────────────────────────────

  private computeAll(): void {
    // Triggered by interval — fleet-bootstrap should wire this to
    // fetch fresh session data from each connected bot
    this.emit("computeAll");
  }
}

// ─── Raw data interface (fed by fleet-bootstrap from gateway data) ───────────

export interface RawSessionData {
  sessions: Array<{
    id: string;
    userId: string;
    active: boolean;
    endedNormally: boolean;
    escalated: boolean;
    isReturningUser: boolean;
    turnCount: number;
    userMessageCount: number;
    repeatedQueryCount?: number;
    lastUserMessageAt?: Date;
    responseTimes: number[];
  }>;
  toolCalls: {
    total: number;
    successful: number;
  };
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export function getQualityEngine(): QualityEngine {
  if (!instance) {
    instance = new QualityEngine();
  }
  return instance;
}

export function disposeQualityEngine(): void {
  if (instance) {
    instance.stop();
    instance.removeAllListeners();
    instance = null;
  }
}
