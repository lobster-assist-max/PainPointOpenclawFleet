/**
 * Fleet Voice Intelligence Engine — Voice call monitoring & analytics for OpenClaw bots.
 *
 * Provides real-time voice intelligence for Pain Point's voice survey product by
 * extracting metrics from OpenClaw Gateway sessions. Since we operate at the
 * session/text layer (no raw audio access), metrics are inferred from:
 *   - ASR transcript confidence scores reported by the gateway
 *   - Turn timing and silence detection from event timestamps
 *   - Text-based sentiment analysis on transcribed utterances
 *   - Survey flow progression tracked via structured bot responses
 *
 * Key capabilities:
 *   1. Voice call metrics collection per bot session
 *   2. ASR quality tracking across the fleet
 *   3. Text-based sentiment trajectory analysis
 *   4. Question-by-question survey completion tracking
 *   5. MOS (Mean Opinion Score) estimation from proxy signals
 *   6. Anomaly detection (silence, hangups, ASR degradation)
 *   7. Real-time active call monitoring
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { logger } from "../middleware/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CallDirection = "outbound" | "inbound";

export type CallStatus =
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "busy"
  | "cancelled";

export type TerminatedBy = "bot" | "callee" | "caller" | "system" | "timeout" | "unknown";

export type SentimentLabel = "positive" | "neutral" | "negative" | "mixed";

export interface SentimentPoint {
  timestampSec: number;
  sentiment: number; // -1.0 (very negative) to 1.0 (very positive)
  trigger?: string;
}

export interface SilenceSegment {
  startSec: number;
  durationSec: number;
}

export interface SurveyQuestionMetric {
  questionIndex: number;
  question: string;
  answer?: string;
  durationSec: number;
  asrConfidence: number;
  /** Internal tracking field — elapsed seconds at question start. Cleaned up before persisting. */
  _startSec?: number;
}

export interface VoiceCallMetrics {
  callId: string;
  botId: string;
  sessionKey: string;
  call: {
    direction: CallDirection;
    startedAt: Date;
    endedAt?: Date;
    durationSeconds: number;
    status: CallStatus;
    terminatedBy: TerminatedBy;
    channel: string;
  };
  quality: {
    mosScore: number;
    asrConfidence: number;
    latencyMs: number;
  };
  sentiment: {
    overall: SentimentLabel;
    trajectory: SentimentPoint[];
  };
  interaction: {
    talkRatio: number; // 0-1, fraction of call duration with speech
    interruptionCount: number;
    silenceSegments: SilenceSegment[];
  };
  survey?: {
    totalQuestions: number;
    completedQuestions: number;
    completionRate: number;
    questionMetrics: SurveyQuestionMetric[];
  };
}

export interface ActiveCall {
  callId: string;
  botId: string;
  sessionKey: string;
  direction: CallDirection;
  startedAt: Date;
  channel: string;
  currentDurationSec: number;
  lastActivityAt: number;
}

export interface ASRQualityReport {
  botId: string;
  sampleCount: number;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  belowThresholdCount: number;
  recentTrend: "improving" | "stable" | "degrading";
}

export type VoiceAnomalyType =
  | "excessive_silence"
  | "abnormal_hangup"
  | "asr_degradation"
  | "unusual_call_duration"
  | "high_interruption_rate"
  | "survey_abandonment";

export type VoiceAnomalySeverity = "info" | "warning" | "critical";

export interface VoiceAnomaly {
  id: string;
  type: VoiceAnomalyType;
  severity: VoiceAnomalySeverity;
  callId: string;
  botId: string;
  description: string;
  detectedAt: Date;
  metadata: Record<string, unknown>;
}

export interface FleetVoiceSummary {
  totalCalls: number;
  activeCalls: number;
  avgMosScore: number;
  avgAsrConfidence: number;
  avgCallDurationSec: number;
  completionRate: number;
  anomalyCount: number;
  sentimentDistribution: Record<SentimentLabel, number>;
  topAnomalies: VoiceAnomaly[];
}

/** Raw event payload from the gateway representing a voice-related update. */
export interface VoiceEventPayload {
  callId?: string;
  botId?: string;
  sessionKey?: string;
  direction?: string;
  channel?: string;
  status?: string;
  terminatedBy?: string;
  transcript?: string;
  asrConfidence?: number;
  latencyMs?: number;
  isSilence?: boolean;
  silenceDurationSec?: number;
  surveyQuestion?: string;
  surveyQuestionIndex?: number;
  surveyAnswer?: string;
  timestampSec?: number;
  isInterruption?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Completed call ring buffer capacity per bot. */
const MAX_CALLS_PER_BOT = 500;

/** Global anomaly ring buffer capacity. */
const MAX_ANOMALIES = 1_000;

/** ASR confidence samples retained per bot for trend analysis. */
const ASR_SAMPLE_WINDOW = 100;

/** ASR confidence below this threshold is flagged. */
const ASR_DEGRADATION_THRESHOLD = 0.65;

/** Silence segment longer than this (seconds) triggers an anomaly. */
const EXCESSIVE_SILENCE_THRESHOLD_SEC = 15;

/** Calls shorter than this (seconds) with non-completed status are flagged. */
const ABNORMAL_SHORT_CALL_SEC = 5;

/** Calls longer than this (seconds) are flagged as unusual. */
const ABNORMAL_LONG_CALL_SEC = 1_800; // 30 minutes

/** Interruption count above this per call triggers an anomaly. */
const HIGH_INTERRUPTION_THRESHOLD = 10;

/** Sentiment analysis keyword lists (simple lexicon approach). */
const POSITIVE_KEYWORDS = [
  "thank", "thanks", "great", "good", "excellent", "perfect", "wonderful",
  "appreciate", "helpful", "yes", "agree", "absolutely", "fantastic", "love",
  "happy", "pleased", "satisfied", "correct", "right", "sure",
];

const NEGATIVE_KEYWORDS = [
  "no", "not", "never", "bad", "terrible", "awful", "horrible", "wrong",
  "frustrated", "angry", "upset", "disappointed", "confused", "problem",
  "issue", "complaint", "hate", "worst", "ridiculous", "unacceptable",
];

/** Prune resolved anomalies older than 24 hours. */
const ANOMALY_PRUNE_INTERVAL_MS = 3_600_000; // 1 hour

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute a simple text-based sentiment score from a transcript fragment.
 * Returns a value between -1.0 (very negative) and 1.0 (very positive).
 */
function computeTextSentiment(text: string): number {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, "");
    if (POSITIVE_KEYWORDS.includes(cleaned)) positiveCount++;
    if (NEGATIVE_KEYWORDS.includes(cleaned)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) return 0; // neutral

  return clamp((positiveCount - negativeCount) / total, -1, 1);
}

/**
 * Derive a sentiment label from a numeric sentiment score.
 */
function sentimentScoreToLabel(score: number): SentimentLabel {
  if (score > 0.2) return "positive";
  if (score < -0.2) return "negative";
  if (Math.abs(score) <= 0.2) return "neutral";
  return "mixed";
}

/**
 * Estimate MOS (Mean Opinion Score) from proxy metrics.
 *
 * Real MOS is subjective (1-5 scale). We approximate using:
 * - ASR confidence (proxy for audio clarity)
 * - Latency (proxy for responsiveness)
 * - Silence ratio (proxy for connection quality)
 *
 * Returns a value in [1.0, 5.0].
 */
function estimateMOS(
  asrConfidence: number,
  latencyMs: number,
  silenceRatio: number,
): number {
  // ASR confidence contributes 50% — maps [0,1] to [1,5]
  const asrComponent = 1 + asrConfidence * 4;

  // Latency contributes 30% — lower is better; 0ms=5, 500ms+=1
  const latencyScore = clamp(1 + 4 * (1 - latencyMs / 500), 1, 5);

  // Silence ratio contributes 20% — lower is better (less dead air)
  const silenceScore = clamp(1 + 4 * (1 - silenceRatio), 1, 5);

  const mos = asrComponent * 0.5 + latencyScore * 0.3 + silenceScore * 0.2;
  return Math.round(clamp(mos, 1, 5) * 100) / 100;
}

/**
 * Compute the overall sentiment label from a trajectory of sentiment points.
 */
function computeOverallSentiment(trajectory: SentimentPoint[]): SentimentLabel {
  if (trajectory.length === 0) return "neutral";

  const avg = trajectory.reduce((sum, p) => sum + p.sentiment, 0) / trajectory.length;
  const hasPositive = trajectory.some((p) => p.sentiment > 0.2);
  const hasNegative = trajectory.some((p) => p.sentiment < -0.2);

  if (hasPositive && hasNegative && Math.abs(avg) < 0.15) return "mixed";
  return sentimentScoreToLabel(avg);
}

// ─── Internal Tracking ───────────────────────────────────────────────────────

interface MutableCallState {
  metrics: VoiceCallMetrics;
  asrSamples: number[];
  lastTranscriptAt: number;
  totalSpeechSec: number;
}

// ─── VoiceIntelligenceEngine ─────────────────────────────────────────────────

/**
 * Monitors voice calls across the OpenClaw bot fleet and provides
 * real-time analytics, quality scoring, and anomaly detection.
 *
 * @example
 * ```ts
 * const engine = new VoiceIntelligenceEngine();
 * engine.on("anomaly", (anomaly) => console.log("Anomaly detected:", anomaly));
 * engine.on("callCompleted", (metrics) => console.log("Call done:", metrics.callId));
 * engine.startPruning();
 * ```
 */
export class VoiceIntelligenceEngine extends EventEmitter {
  /** Completed calls indexed by callId, partitioned by botId. */
  private completedCalls = new Map<string, VoiceCallMetrics[]>();

  /** Currently active (in-progress) calls indexed by callId. */
  private activeCalls = new Map<string, MutableCallState>();

  /** ASR confidence samples per bot for trend analysis. */
  private asrSamples = new Map<string, number[]>();

  /** Detected anomalies (ring buffer). */
  private anomalies: VoiceAnomaly[] = [];

  /** Prune timer handle. */
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  // ─── Call Lifecycle ──────────────────────────────────────────────────────

  /**
   * Register a new voice call. Call this when the gateway reports a call
   * has been initiated (either outbound dialed or inbound answered).
   */
  startCall(params: {
    callId: string;
    botId: string;
    sessionKey: string;
    direction: CallDirection;
    channel: string;
  }): VoiceCallMetrics {
    const { callId, botId, sessionKey, direction, channel } = params;

    const metrics: VoiceCallMetrics = {
      callId,
      botId,
      sessionKey,
      call: {
        direction,
        startedAt: new Date(),
        durationSeconds: 0,
        status: "in_progress",
        terminatedBy: "unknown",
        channel,
      },
      quality: {
        mosScore: 0,
        asrConfidence: 0,
        latencyMs: 0,
      },
      sentiment: {
        overall: "neutral",
        trajectory: [],
      },
      interaction: {
        talkRatio: 0,
        interruptionCount: 0,
        silenceSegments: [],
      },
    };

    const state: MutableCallState = {
      metrics,
      asrSamples: [],
      lastTranscriptAt: Date.now(),
      totalSpeechSec: 0,
    };

    this.activeCalls.set(callId, state);

    logger.info({ callId, botId, direction, channel }, "[VoiceIntelligence] Call started");
    this.emit("callStarted", metrics);

    return metrics;
  }

  /**
   * Ingest a voice event for an active call. Events include transcript
   * fragments, ASR confidence updates, silence detections, survey progress,
   * and interruption markers.
   */
  ingestEvent(payload: VoiceEventPayload): void {
    const { callId } = payload;
    if (!callId) return;

    const state = this.activeCalls.get(callId);
    if (!state) {
      logger.debug({ callId }, "[VoiceIntelligence] Event for unknown call, ignoring");
      return;
    }

    const { metrics } = state;
    const now = Date.now();
    const callElapsedSec = (now - metrics.call.startedAt.getTime()) / 1_000;

    // ── ASR confidence update ──
    if (typeof payload.asrConfidence === "number") {
      const confidence = clamp(payload.asrConfidence, 0, 1);
      state.asrSamples.push(confidence);
      this.recordASRSample(metrics.botId, confidence);
    }

    // ── Latency update ──
    if (typeof payload.latencyMs === "number") {
      // Exponential moving average
      const alpha = 0.3;
      metrics.quality.latencyMs =
        metrics.quality.latencyMs === 0
          ? payload.latencyMs
          : metrics.quality.latencyMs * (1 - alpha) + payload.latencyMs * alpha;
    }

    // ── Transcript / sentiment ──
    if (typeof payload.transcript === "string" && payload.transcript.trim().length > 0) {
      const text = payload.transcript.trim();
      const sentimentScore = computeTextSentiment(text);
      const timestampSec = typeof payload.timestampSec === "number"
        ? payload.timestampSec
        : Math.round(callElapsedSec);

      metrics.sentiment.trajectory.push({
        timestampSec,
        sentiment: sentimentScore,
        trigger: text.length > 80 ? text.slice(0, 80) + "..." : text,
      });

      state.lastTranscriptAt = now;

      // Estimate speech duration from time between transcripts (rough proxy)
      const gapSec = Math.min(callElapsedSec, 10); // cap at 10s per segment
      state.totalSpeechSec += gapSec;
    }

    // ── Silence detection ──
    if (payload.isSilence && typeof payload.silenceDurationSec === "number") {
      const startSec = typeof payload.timestampSec === "number"
        ? payload.timestampSec
        : Math.max(0, callElapsedSec - payload.silenceDurationSec);

      metrics.interaction.silenceSegments.push({
        startSec,
        durationSec: payload.silenceDurationSec,
      });

      // Check for excessive silence anomaly
      if (payload.silenceDurationSec >= EXCESSIVE_SILENCE_THRESHOLD_SEC) {
        this.raiseAnomaly({
          type: "excessive_silence",
          severity: "warning",
          callId,
          botId: metrics.botId,
          description: `Silence of ${payload.silenceDurationSec.toFixed(1)}s detected during call (threshold: ${EXCESSIVE_SILENCE_THRESHOLD_SEC}s)`,
          metadata: {
            silenceDurationSec: payload.silenceDurationSec,
            callElapsedSec,
          },
        });
      }
    }

    // ── Interruption ──
    if (payload.isInterruption) {
      metrics.interaction.interruptionCount++;

      if (metrics.interaction.interruptionCount === HIGH_INTERRUPTION_THRESHOLD) {
        this.raiseAnomaly({
          type: "high_interruption_rate",
          severity: "info",
          callId,
          botId: metrics.botId,
          description: `High interruption count (${metrics.interaction.interruptionCount}) during call`,
          metadata: {
            interruptionCount: metrics.interaction.interruptionCount,
            callElapsedSec,
          },
        });
      }
    }

    // ── Survey progress ──
    if (
      typeof payload.surveyQuestionIndex === "number" &&
      typeof payload.surveyQuestion === "string"
    ) {
      if (!metrics.survey) {
        metrics.survey = {
          totalQuestions: 0,
          completedQuestions: 0,
          completionRate: 0,
          questionMetrics: [],
        };
      }

      const existingQ = metrics.survey.questionMetrics.find(
        (q) => q.questionIndex === payload.surveyQuestionIndex,
      );

      if (existingQ) {
        // Update existing question with answer
        if (payload.surveyAnswer) {
          existingQ.answer = payload.surveyAnswer;
          existingQ.asrConfidence = typeof payload.asrConfidence === "number"
            ? payload.asrConfidence
            : existingQ.asrConfidence;
        }
      } else {
        // New question presented
        const prevQ = metrics.survey.questionMetrics[metrics.survey.questionMetrics.length - 1];
        if (prevQ && prevQ.durationSec === 0) {
          prevQ.durationSec = Math.max(0, callElapsedSec - (prevQ._startSec || 0));
        }

        const qMetric: SurveyQuestionMetric = {
          questionIndex: payload.surveyQuestionIndex,
          question: payload.surveyQuestion,
          answer: payload.surveyAnswer,
          durationSec: 0,
          asrConfidence: typeof payload.asrConfidence === "number" ? payload.asrConfidence : 0,
          _startSec: callElapsedSec,
        };

        metrics.survey.questionMetrics.push(qMetric);
        metrics.survey.totalQuestions = Math.max(
          metrics.survey.totalQuestions,
          payload.surveyQuestionIndex + 1,
        );
      }

      // Recompute survey completion
      metrics.survey.completedQuestions = metrics.survey.questionMetrics.filter(
        (q) => q.answer !== undefined && q.answer !== "",
      ).length;
      metrics.survey.completionRate =
        metrics.survey.totalQuestions > 0
          ? metrics.survey.completedQuestions / metrics.survey.totalQuestions
          : 0;
    }
  }

  /**
   * End an active call. Finalizes all metrics, runs anomaly checks, and
   * moves the call to the completed buffer.
   */
  endCall(callId: string, status: CallStatus, terminatedBy: TerminatedBy): VoiceCallMetrics | null {
    const state = this.activeCalls.get(callId);
    if (!state) {
      logger.warn({ callId }, "[VoiceIntelligence] endCall for unknown call");
      return null;
    }

    const { metrics } = state;
    const now = new Date();

    // ── Finalize call metadata ──
    metrics.call.endedAt = now;
    metrics.call.status = status;
    metrics.call.terminatedBy = terminatedBy;
    metrics.call.durationSeconds = Math.round(
      (now.getTime() - metrics.call.startedAt.getTime()) / 1_000,
    );

    // ── Finalize ASR confidence ──
    if (state.asrSamples.length > 0) {
      metrics.quality.asrConfidence =
        state.asrSamples.reduce((a, b) => a + b, 0) / state.asrSamples.length;
    }

    // ── Finalize talk ratio ──
    const totalDuration = metrics.call.durationSeconds;
    const totalSilenceSec = metrics.interaction.silenceSegments.reduce(
      (sum, s) => sum + s.durationSec, 0,
    );
    metrics.interaction.talkRatio = totalDuration > 0
      ? clamp(1 - totalSilenceSec / totalDuration, 0, 1)
      : 0;

    // ── Finalize sentiment ──
    metrics.sentiment.overall = computeOverallSentiment(metrics.sentiment.trajectory);

    // ── Compute MOS ──
    const silenceRatio = totalDuration > 0 ? totalSilenceSec / totalDuration : 0;
    metrics.quality.mosScore = estimateMOS(
      metrics.quality.asrConfidence,
      metrics.quality.latencyMs,
      silenceRatio,
    );

    // ── Finalize survey question durations ──
    if (metrics.survey) {
      const lastQ = metrics.survey.questionMetrics[metrics.survey.questionMetrics.length - 1];
      if (lastQ && lastQ.durationSec === 0) {
        const startSec = lastQ._startSec ?? 0;
        lastQ.durationSec = Math.max(0, totalDuration - startSec);
      }

      // Clean up internal tracking properties
      for (const q of metrics.survey.questionMetrics) {
        delete q._startSec;
      }
    }

    // ── Anomaly detection on completion ──
    this.detectCompletionAnomalies(metrics);

    // ── Move to completed buffer ──
    this.activeCalls.delete(callId);

    if (!this.completedCalls.has(metrics.botId)) {
      this.completedCalls.set(metrics.botId, []);
    }
    const botCalls = this.completedCalls.get(metrics.botId)!;
    botCalls.push(metrics);

    // Evict oldest if over capacity
    while (botCalls.length > MAX_CALLS_PER_BOT) {
      botCalls.shift();
    }

    logger.info(
      {
        callId,
        botId: metrics.botId,
        duration: metrics.call.durationSeconds,
        status,
        mos: metrics.quality.mosScore,
      },
      "[VoiceIntelligence] Call completed",
    );

    this.emit("callCompleted", metrics);
    return metrics;
  }

  // ─── ASR Quality Tracking ────────────────────────────────────────────────

  /**
   * Record an ASR confidence sample for a bot. Used internally by
   * ingestEvent but can also be called directly for standalone updates.
   */
  recordASRSample(botId: string, confidence: number): void {
    if (!this.asrSamples.has(botId)) {
      this.asrSamples.set(botId, []);
    }
    const samples = this.asrSamples.get(botId)!;
    samples.push(clamp(confidence, 0, 1));

    // Keep within window
    while (samples.length > ASR_SAMPLE_WINDOW) {
      samples.shift();
    }

    // Check for ASR degradation anomaly (rolling average below threshold)
    if (samples.length >= 10) {
      const recentSlice = samples.slice(-10);
      const recentAvg = recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;

      if (recentAvg < ASR_DEGRADATION_THRESHOLD) {
        // Only raise if we haven't raised one in the last 10 samples
        const recentAnomaly = this.anomalies.find(
          (a) =>
            a.type === "asr_degradation" &&
            a.botId === botId &&
            Date.now() - a.detectedAt.getTime() < 60_000,
        );

        if (!recentAnomaly) {
          this.raiseAnomaly({
            type: "asr_degradation",
            severity: "warning",
            callId: "",
            botId,
            description: `ASR confidence degraded: rolling average ${(recentAvg * 100).toFixed(1)}% (threshold: ${ASR_DEGRADATION_THRESHOLD * 100}%)`,
            metadata: {
              rollingAvg: recentAvg,
              sampleCount: recentSlice.length,
              threshold: ASR_DEGRADATION_THRESHOLD,
            },
          });
        }
      }
    }
  }

  /**
   * Get an ASR quality report for a specific bot.
   */
  getASRReport(botId: string): ASRQualityReport | null {
    const samples = this.asrSamples.get(botId);
    if (!samples || samples.length === 0) return null;

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const belowThreshold = samples.filter((s) => s < ASR_DEGRADATION_THRESHOLD).length;

    // Compute trend from first half vs second half
    let trend: ASRQualityReport["recentTrend"] = "stable";
    if (samples.length >= 10) {
      const mid = Math.floor(samples.length / 2);
      const firstHalf = samples.slice(0, mid);
      const secondHalf = samples.slice(mid);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg > firstAvg + 0.03) trend = "improving";
      else if (secondAvg < firstAvg - 0.03) trend = "degrading";
    }

    return {
      botId,
      sampleCount: samples.length,
      avgConfidence: Math.round(avg * 1000) / 1000,
      minConfidence: Math.min(...samples),
      maxConfidence: Math.max(...samples),
      belowThresholdCount: belowThreshold,
      recentTrend: trend,
    };
  }

  // ─── Anomaly Detection ───────────────────────────────────────────────────

  /**
   * Detect anomalies when a call completes. Checks for abnormal duration,
   * unusual hangup patterns, and survey abandonment.
   */
  private detectCompletionAnomalies(metrics: VoiceCallMetrics): void {
    const { callId, botId } = metrics;
    const duration = metrics.call.durationSeconds;

    // Abnormal short call (likely connection issue)
    if (
      duration < ABNORMAL_SHORT_CALL_SEC &&
      metrics.call.status !== "completed" &&
      metrics.call.status !== "busy" &&
      metrics.call.status !== "no_answer"
    ) {
      this.raiseAnomaly({
        type: "abnormal_hangup",
        severity: "warning",
        callId,
        botId,
        description: `Call terminated after only ${duration}s with status "${metrics.call.status}" (terminated by: ${metrics.call.terminatedBy})`,
        metadata: {
          durationSeconds: duration,
          status: metrics.call.status,
          terminatedBy: metrics.call.terminatedBy,
        },
      });
    }

    // Abnormally long call
    if (duration > ABNORMAL_LONG_CALL_SEC) {
      this.raiseAnomaly({
        type: "unusual_call_duration",
        severity: "info",
        callId,
        botId,
        description: `Call lasted ${Math.round(duration / 60)} minutes (threshold: ${ABNORMAL_LONG_CALL_SEC / 60} min)`,
        metadata: {
          durationSeconds: duration,
          thresholdSeconds: ABNORMAL_LONG_CALL_SEC,
        },
      });
    }

    // Survey abandonment (survey started but not completed)
    if (metrics.survey && metrics.survey.totalQuestions > 0) {
      if (
        metrics.survey.completionRate < 0.5 &&
        metrics.call.terminatedBy !== "bot" &&
        metrics.survey.completedQuestions >= 1
      ) {
        this.raiseAnomaly({
          type: "survey_abandonment",
          severity: "info",
          callId,
          botId,
          description: `Survey abandoned at question ${metrics.survey.completedQuestions}/${metrics.survey.totalQuestions} (${Math.round(metrics.survey.completionRate * 100)}% completion)`,
          metadata: {
            completedQuestions: metrics.survey.completedQuestions,
            totalQuestions: metrics.survey.totalQuestions,
            completionRate: metrics.survey.completionRate,
            lastQuestionIndex: metrics.survey.questionMetrics.length > 0
              ? metrics.survey.questionMetrics[metrics.survey.questionMetrics.length - 1].questionIndex
              : -1,
          },
        });
      }
    }
  }

  /**
   * Record a new anomaly. Maintains a capped ring buffer and emits an event.
   */
  private raiseAnomaly(params: Omit<VoiceAnomaly, "id" | "detectedAt">): void {
    const anomaly: VoiceAnomaly = {
      id: randomUUID(),
      ...params,
      detectedAt: new Date(),
    };

    this.anomalies.push(anomaly);
    while (this.anomalies.length > MAX_ANOMALIES) {
      this.anomalies.shift();
    }

    logger.warn(
      { anomalyId: anomaly.id, type: anomaly.type, botId: anomaly.botId, callId: anomaly.callId },
      `[VoiceIntelligence] Anomaly detected: ${anomaly.description}`,
    );

    this.emit("anomaly", anomaly);
  }

  // ─── Query API ───────────────────────────────────────────────────────────

  /**
   * Get metrics for a specific completed call.
   */
  getCallMetrics(callId: string): VoiceCallMetrics | null {
    // Check active calls first
    const active = this.activeCalls.get(callId);
    if (active) return active.metrics;

    // Search completed calls across all bots
    for (const calls of this.completedCalls.values()) {
      const found = calls.find((c) => c.callId === callId);
      if (found) return found;
    }

    return null;
  }

  /**
   * Get completed call metrics for a specific bot, most recent first.
   */
  getCallsForBot(botId: string, limit = 50): VoiceCallMetrics[] {
    const calls = this.completedCalls.get(botId) ?? [];
    return calls.slice(-limit).reverse();
  }

  /**
   * Get all currently active calls across the fleet.
   */
  getActiveCalls(): ActiveCall[] {
    const now = Date.now();
    const result: ActiveCall[] = [];

    for (const [, state] of this.activeCalls) {
      const { metrics } = state;
      result.push({
        callId: metrics.callId,
        botId: metrics.botId,
        sessionKey: metrics.sessionKey,
        direction: metrics.call.direction,
        startedAt: metrics.call.startedAt,
        channel: metrics.call.channel,
        currentDurationSec: Math.round((now - metrics.call.startedAt.getTime()) / 1_000),
        lastActivityAt: state.lastTranscriptAt,
      });
    }

    return result.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /**
   * Get the count of currently active calls, optionally filtered by bot.
   */
  getActiveCallCount(botId?: string): number {
    if (!botId) return this.activeCalls.size;

    let count = 0;
    for (const state of this.activeCalls.values()) {
      if (state.metrics.botId === botId) count++;
    }
    return count;
  }

  /**
   * Get recent anomalies, optionally filtered by bot or type.
   */
  getAnomalies(opts?: {
    botId?: string;
    type?: VoiceAnomalyType;
    limit?: number;
  }): VoiceAnomaly[] {
    let filtered = this.anomalies;

    if (opts?.botId) {
      filtered = filtered.filter((a) => a.botId === opts.botId);
    }
    if (opts?.type) {
      filtered = filtered.filter((a) => a.type === opts.type);
    }

    const limit = opts?.limit ?? 50;
    return filtered.slice(-limit).reverse();
  }

  /**
   * Get a fleet-wide voice summary across all bots and calls.
   */
  getFleetSummary(): FleetVoiceSummary {
    const allCompleted: VoiceCallMetrics[] = [];
    for (const calls of this.completedCalls.values()) {
      allCompleted.push(...calls);
    }

    const totalCalls = allCompleted.length;
    const activeCalls = this.activeCalls.size;

    // Averages
    let mosSum = 0;
    let asrSum = 0;
    let durationSum = 0;
    let completedSurveys = 0;
    let totalSurveys = 0;

    const sentimentDist: Record<SentimentLabel, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      mixed: 0,
    };

    for (const call of allCompleted) {
      mosSum += call.quality.mosScore;
      asrSum += call.quality.asrConfidence;
      durationSum += call.call.durationSeconds;
      sentimentDist[call.sentiment.overall]++;

      if (call.survey && call.survey.totalQuestions > 0) {
        totalSurveys++;
        if (call.survey.completionRate >= 1.0) {
          completedSurveys++;
        }
      }
    }

    return {
      totalCalls,
      activeCalls,
      avgMosScore: totalCalls > 0 ? Math.round((mosSum / totalCalls) * 100) / 100 : 0,
      avgAsrConfidence: totalCalls > 0 ? Math.round((asrSum / totalCalls) * 1000) / 1000 : 0,
      avgCallDurationSec: totalCalls > 0 ? Math.round(durationSum / totalCalls) : 0,
      completionRate: totalSurveys > 0 ? completedSurveys / totalSurveys : 0,
      anomalyCount: this.anomalies.length,
      sentimentDistribution: sentimentDist,
      topAnomalies: this.anomalies.slice(-5).reverse(),
    };
  }

  /**
   * Get survey completion analytics across the fleet or for a specific bot.
   */
  getSurveyAnalytics(botId?: string): {
    totalSurveys: number;
    completedSurveys: number;
    avgCompletionRate: number;
    avgQuestionsAnswered: number;
    questionDropoff: Map<number, number>;
  } {
    const calls: VoiceCallMetrics[] = [];

    if (botId) {
      calls.push(...(this.completedCalls.get(botId) ?? []));
    } else {
      for (const botCalls of this.completedCalls.values()) {
        calls.push(...botCalls);
      }
    }

    const surveyCalls = calls.filter((c) => c.survey && c.survey.totalQuestions > 0);
    const completedSurveys = surveyCalls.filter((c) => c.survey!.completionRate >= 1.0).length;

    let completionRateSum = 0;
    let questionsAnsweredSum = 0;
    const questionDropoff = new Map<number, number>();

    for (const call of surveyCalls) {
      const survey = call.survey!;
      completionRateSum += survey.completionRate;
      questionsAnsweredSum += survey.completedQuestions;

      // Track dropoff: for each question, count how many calls reached it
      for (const qm of survey.questionMetrics) {
        const current = questionDropoff.get(qm.questionIndex) ?? 0;
        questionDropoff.set(qm.questionIndex, current + 1);
      }
    }

    return {
      totalSurveys: surveyCalls.length,
      completedSurveys,
      avgCompletionRate: surveyCalls.length > 0
        ? Math.round((completionRateSum / surveyCalls.length) * 1000) / 1000
        : 0,
      avgQuestionsAnswered: surveyCalls.length > 0
        ? Math.round((questionsAnsweredSum / surveyCalls.length) * 10) / 10
        : 0,
      questionDropoff,
    };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start the periodic anomaly pruning timer. Removes anomalies older than
   * 24 hours every hour.
   */
  startPruning(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.pruneOldAnomalies(), ANOMALY_PRUNE_INTERVAL_MS);
    logger.info("[VoiceIntelligence] Started anomaly pruning (every 1h)");
  }

  /**
   * Stop the periodic anomaly pruning timer.
   */
  stopPruning(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    logger.info("[VoiceIntelligence] Stopped anomaly pruning");
  }

  /**
   * Remove anomalies older than the specified age.
   *
   * @param maxAgeMs Maximum anomaly age in milliseconds (default: 24 hours)
   * @returns Number of anomalies pruned
   */
  pruneOldAnomalies(maxAgeMs = 86_400_000): number {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.anomalies.length;
    this.anomalies = this.anomalies.filter((a) => a.detectedAt.getTime() >= cutoff);
    const pruned = before - this.anomalies.length;

    if (pruned > 0) {
      logger.debug({ pruned }, "[VoiceIntelligence] Pruned old anomalies");
    }

    return pruned;
  }

  /**
   * Clean up all resources. Call this when shutting down the service.
   */
  dispose(): void {
    this.stopPruning();
    this.activeCalls.clear();
    this.completedCalls.clear();
    this.asrSamples.clear();
    this.anomalies = [];
    this.removeAllListeners();
    logger.info("[VoiceIntelligence] Disposed");
  }
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default VoiceIntelligenceEngine;
