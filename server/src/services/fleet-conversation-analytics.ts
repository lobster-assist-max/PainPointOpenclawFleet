/**
 * Fleet Conversation Analytics Engine
 *
 * Analyzes bot conversations across the fleet for satisfaction, topics,
 * knowledge gaps, and resolution quality. All data is fetched from OpenClaw
 * Gateway via RPC (sessions.list, chat.history) and processed with
 * lightweight NLP (keyword extraction, sentiment lexicon, rule-based
 * classification). Results are cached in-memory; Supabase persistence
 * is handled by the route layer.
 *
 * Key capabilities:
 *   1. Batch conversation analysis (sentiment, topics, resolution)
 *   2. Topic clustering across sessions and bots
 *   3. Knowledge gap detection (deflection / uncertainty patterns)
 *   4. Satisfaction trend time-series
 *   5. Resolution funnel (resolved / partial / escalated / abandoned)
 *   6. Cross-bot inconsistency detection (same topic, different answer)
 *   7. Auto-generated MEMORY.md training data for knowledge gaps
 */

import { EventEmitter } from "events";
import { randomUUID } from "node:crypto";
import { logger } from "../middleware/logger.js";
import { getFleetMonitorService } from "./fleet-monitor.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SentimentLabel = "positive" | "neutral" | "negative" | "mixed";

export type ResolutionOutcome = "resolved" | "partial" | "escalated" | "abandoned" | "unknown";

export type SatisfactionGranularity = "hour" | "day" | "week";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface TopicMatch {
  topic: string;
  confidence: number;
  keywords: string[];
}

export interface SentimentResult {
  label: SentimentLabel;
  score: number; // -1.0 to 1.0
  positiveCount: number;
  negativeCount: number;
}

export interface KnowledgeGap {
  id: string;
  query: string;
  detectedAt: Date;
  botId: string;
  sessionKey: string;
  deflectionPhrase: string;
  topic: string;
  frequency: number;
  severity: "low" | "medium" | "high";
}

export interface ResolutionScore {
  outcome: ResolutionOutcome;
  confidence: number;
  signals: string[];
}

export interface ConversationAnalysis {
  id: string;
  botId: string;
  companyId: string;
  sessionKey: string;
  analyzedAt: Date;
  messageCount: number;
  topics: TopicMatch[];
  sentiment: SentimentResult;
  resolution: ResolutionScore;
  knowledgeGaps: KnowledgeGap[];
  durationMinutes: number;
  userTurnCount: number;
  assistantTurnCount: number;
}

export interface TopicCluster {
  topic: string;
  count: number;
  avgSentiment: number;
  avgResolutionRate: number;
  topKeywords: string[];
  botDistribution: Record<string, number>;
}

export interface KnowledgeGapReport {
  companyId: string;
  generatedAt: Date;
  totalGaps: number;
  gaps: KnowledgeGap[];
  topUnresolvedTopics: Array<{ topic: string; count: number }>;
}

export interface SatisfactionDataPoint {
  timestamp: Date;
  avgSentiment: number;
  sampleCount: number;
  positiveRate: number;
  negativeRate: number;
}

export interface SatisfactionTrend {
  companyId: string;
  granularity: SatisfactionGranularity;
  periodStart: Date;
  periodEnd: Date;
  dataPoints: SatisfactionDataPoint[];
  overallAvg: number;
}

export interface ResolutionFunnel {
  companyId: string;
  generatedAt: Date;
  total: number;
  resolved: number;
  partial: number;
  escalated: number;
  abandoned: number;
  unknown: number;
  resolutionRate: number;
}

export interface InconsistencyRecord {
  id: string;
  topic: string;
  detectedAt: Date;
  variants: Array<{
    botId: string;
    sessionKey: string;
    answer: string;
    sentiment: SentimentLabel;
  }>;
  severity: "low" | "medium" | "high";
}

export interface TrainingDataEntry {
  gapId: string;
  generatedAt: Date;
  memoryMdBlock: string;
  topic: string;
  suggestedAnswer: string;
  confidence: number;
}

export interface AnalyzeBatchParams {
  botId: string;
  companyId: string;
  since?: string; // ISO date string
  limit?: number;
}

export interface PeriodParams {
  periodStart: string; // ISO date string
  periodEnd: string;   // ISO date string
}

// ─── Sentiment Lexicon ───────────────────────────────────────────────────────

const POSITIVE_WORDS = [
  "thank", "thanks", "great", "good", "excellent", "perfect", "wonderful",
  "appreciate", "helpful", "yes", "agree", "absolutely", "fantastic", "love",
  "happy", "pleased", "satisfied", "correct", "right", "awesome", "amazing",
  "brilliant", "superb", "delighted", "solved", "works", "working", "clear",
  "understand", "exactly", "nice", "fine", "cool", "impressive", "outstanding",
];

const NEGATIVE_WORDS = [
  "no", "not", "never", "bad", "terrible", "awful", "horrible", "wrong",
  "frustrated", "angry", "upset", "disappointed", "confused", "problem",
  "issue", "complaint", "hate", "worst", "ridiculous", "unacceptable",
  "broken", "fail", "failed", "useless", "annoying", "slow", "error",
  "bug", "stuck", "unhelpful", "unclear", "misunderstood", "waste",
  "unfortunately", "sorry", "cannot", "unable", "impossible",
];

// ─── Topic Keywords ──────────────────────────────────────────────────────────

const TOPIC_DEFINITIONS: Record<string, string[]> = {
  billing: [
    "bill", "billing", "invoice", "payment", "charge", "price", "pricing",
    "cost", "fee", "subscription", "plan", "upgrade", "downgrade", "refund",
    "credit", "discount", "coupon", "promo",
  ],
  technical: [
    "error", "bug", "crash", "broken", "fix", "update", "install", "setup",
    "configure", "api", "integration", "code", "debug", "log", "deploy",
    "server", "database", "timeout", "connection", "ssl", "certificate",
  ],
  account: [
    "account", "login", "password", "reset", "email", "profile", "settings",
    "permission", "access", "role", "invite", "register", "signup", "verify",
    "authentication", "mfa", "sso", "token",
  ],
  shipping: [
    "ship", "shipping", "delivery", "track", "tracking", "order", "package",
    "arrived", "delayed", "lost", "return", "exchange", "address", "courier",
    "express", "standard", "freight",
  ],
  product: [
    "product", "feature", "functionality", "capability", "version", "release",
    "roadmap", "specification", "compatibility", "support", "documentation",
    "tutorial", "guide", "manual", "warranty",
  ],
  onboarding: [
    "start", "started", "getting", "begin", "beginning", "new", "first",
    "setup", "walkthrough", "tutorial", "onboard", "onboarding", "intro",
    "introduction", "welcome", "trial",
  ],
  complaint: [
    "complaint", "complain", "dissatisfied", "unacceptable", "escalate",
    "manager", "supervisor", "refund", "compensation", "sue", "legal",
    "terrible", "horrible", "worst", "scam", "fraud",
  ],
  general: [
    "hello", "hi", "hey", "help", "question", "info", "information",
    "ask", "know", "tell", "explain", "what", "how", "when", "where",
    "why", "who", "which",
  ],
};

// ─── Deflection Patterns ─────────────────────────────────────────────────────

const DEFLECTION_PHRASES = [
  "i'm not sure",
  "i don't have information",
  "i don't know",
  "i cannot help with that",
  "i'm unable to",
  "outside my scope",
  "beyond my capabilities",
  "i don't have access",
  "please contact support",
  "please reach out to",
  "i would recommend contacting",
  "let me transfer you",
  "i apologize, but i can't",
  "that's not something i can",
  "i'm not equipped to",
  "i don't have the ability",
  "unfortunately, i cannot",
  "i'm afraid i can't",
  "this is beyond what i can",
  "you may need to contact",
  "i suggest reaching out to",
  "that falls outside",
  "i need to escalate",
];

// ─── Resolution Signals ──────────────────────────────────────────────────────

const RESOLVED_SIGNALS = [
  "glad i could help",
  "is there anything else",
  "happy to help",
  "resolved",
  "that should fix",
  "problem solved",
  "you're all set",
  "should be working now",
  "has been updated",
  "successfully",
  "completed",
  "done",
];

const USER_SATISFIED_SIGNALS = [
  "thank you",
  "thanks",
  "that worked",
  "perfect",
  "great",
  "awesome",
  "solved",
  "exactly what i needed",
  "that's it",
  "you're the best",
  "much appreciated",
];

const ESCALATION_SIGNALS = [
  "speak to a human",
  "talk to someone",
  "real person",
  "supervisor",
  "manager",
  "escalate",
  "transfer",
  "not helpful",
  "this isn't working",
  "i need a human",
  "connect me to",
  "let me talk to",
];

const ABANDONMENT_SIGNALS = [
  "forget it",
  "never mind",
  "nevermind",
  "i'll figure it out",
  "goodbye",
  "bye",
  "i give up",
  "this is useless",
  "waste of time",
  "i'm done",
  "leaving",
];

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum analyses cached per company. */
const MAX_ANALYSES_PER_COMPANY = 5_000;

/** Maximum knowledge gaps cached per company. */
const MAX_GAPS_PER_COMPANY = 1_000;

/** Default batch limit when fetching sessions. */
const DEFAULT_BATCH_LIMIT = 50;

/** Minimum messages in a session to be worth analyzing. */
const MIN_MESSAGES_FOR_ANALYSIS = 2;

// ─── NLP Helpers ─────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * Extract topics from a set of messages using keyword matching.
 * Returns topics sorted by confidence (highest first).
 */
function extractTopics(messages: ConversationMessage[]): TopicMatch[] {
  const allText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  const words = tokenize(allText);
  const wordSet = new Set(words);
  const results: TopicMatch[] = [];

  for (const [topic, keywords] of Object.entries(TOPIC_DEFINITIONS)) {
    const matched = keywords.filter((kw) => wordSet.has(kw));
    if (matched.length === 0) continue;

    // Count total occurrences (not just unique matches)
    let hitCount = 0;
    for (const word of words) {
      if (keywords.includes(word)) hitCount++;
    }

    const confidence = Math.min(1, (matched.length / keywords.length) * 3 + hitCount * 0.02);

    results.push({
      topic,
      confidence: Math.round(confidence * 100) / 100,
      keywords: matched,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Analyze sentiment of messages using a keyword lexicon.
 * Returns a score between -1.0 (very negative) and 1.0 (very positive).
 */
function analyzeSentiment(messages: ConversationMessage[]): SentimentResult {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  const words = tokenize(userText);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.includes(word)) positiveCount++;
    if (NEGATIVE_WORDS.includes(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  let score: number;
  let label: SentimentLabel;

  if (total === 0) {
    score = 0;
    label = "neutral";
  } else {
    score = Math.max(-1, Math.min(1, (positiveCount - negativeCount) / total));

    if (positiveCount > 0 && negativeCount > 0 && Math.abs(score) < 0.2) {
      label = "mixed";
    } else if (score > 0.2) {
      label = "positive";
    } else if (score < -0.2) {
      label = "negative";
    } else {
      label = "neutral";
    }
  }

  return {
    label,
    score: Math.round(score * 100) / 100,
    positiveCount,
    negativeCount,
  };
}

/**
 * Detect knowledge gaps by scanning assistant messages for deflection phrases.
 * Returns gap entries for each detected deflection.
 */
function detectKnowledgeGaps(
  messages: ConversationMessage[],
  botId: string,
  sessionKey: string,
): KnowledgeGap[] {
  const gaps: KnowledgeGap[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    const lower = msg.content.toLowerCase();
    let matchedPhrase: string | null = null;

    for (const phrase of DEFLECTION_PHRASES) {
      if (lower.includes(phrase)) {
        matchedPhrase = phrase;
        break;
      }
    }

    if (!matchedPhrase) continue;

    // Find the preceding user question
    let userQuery = "";
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "user") {
        userQuery = messages[j].content;
        break;
      }
    }

    if (!userQuery) continue;

    // Determine topic from the user query
    const topicMatches = extractTopics([{ role: "user", content: userQuery }]);
    const topic = topicMatches.length > 0 ? topicMatches[0].topic : "general";

    // Determine severity based on deflection phrase strength
    let severity: KnowledgeGap["severity"] = "low";
    if (
      matchedPhrase.includes("cannot") ||
      matchedPhrase.includes("unable") ||
      matchedPhrase.includes("can't") ||
      matchedPhrase.includes("escalate")
    ) {
      severity = "high";
    } else if (
      matchedPhrase.includes("not sure") ||
      matchedPhrase.includes("don't know") ||
      matchedPhrase.includes("don't have")
    ) {
      severity = "medium";
    }

    gaps.push({
      id: randomUUID(),
      query: userQuery.length > 200 ? userQuery.slice(0, 200) + "..." : userQuery,
      detectedAt: new Date(),
      botId,
      sessionKey,
      deflectionPhrase: matchedPhrase,
      topic,
      frequency: 1,
      severity,
    });
  }

  return gaps;
}

/**
 * Score the resolution quality of a conversation using rule-based signals.
 * Examines the last several messages for resolution, escalation, or abandonment patterns.
 */
function scoreResolution(messages: ConversationMessage[]): ResolutionScore {
  if (messages.length < MIN_MESSAGES_FOR_ANALYSIS) {
    return { outcome: "unknown", confidence: 0, signals: ["too_few_messages"] };
  }

  const lastMessages = messages.slice(-6);
  const assistantText = lastMessages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content.toLowerCase())
    .join(" ");
  const userText = lastMessages
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase())
    .join(" ");

  const signals: string[] = [];
  let resolvedScore = 0;
  let escalatedScore = 0;
  let abandonedScore = 0;

  // Check assistant resolution signals
  for (const signal of RESOLVED_SIGNALS) {
    if (assistantText.includes(signal)) {
      resolvedScore += 1;
      signals.push(`bot_signal:${signal}`);
    }
  }

  // Check user satisfaction signals
  for (const signal of USER_SATISFIED_SIGNALS) {
    if (userText.includes(signal)) {
      resolvedScore += 1.5;
      signals.push(`user_satisfied:${signal}`);
    }
  }

  // Check escalation signals
  for (const signal of ESCALATION_SIGNALS) {
    if (userText.includes(signal) || assistantText.includes(signal)) {
      escalatedScore += 1;
      signals.push(`escalation:${signal}`);
    }
  }

  // Check abandonment signals
  for (const signal of ABANDONMENT_SIGNALS) {
    if (userText.includes(signal)) {
      abandonedScore += 1;
      signals.push(`abandonment:${signal}`);
    }
  }

  // Determine outcome based on highest score
  const maxScore = Math.max(resolvedScore, escalatedScore, abandonedScore);

  if (maxScore === 0) {
    // No strong signals — check if conversation ended naturally
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant" && resolvedScore === 0) {
      return { outcome: "partial", confidence: 0.3, signals: ["no_clear_signals", "bot_last_message"] };
    }
    return { outcome: "unknown", confidence: 0.2, signals: ["no_clear_signals"] };
  }

  if (resolvedScore >= escalatedScore && resolvedScore >= abandonedScore) {
    const confidence = Math.min(1, resolvedScore / 3);
    return { outcome: "resolved", confidence: Math.round(confidence * 100) / 100, signals };
  }

  if (escalatedScore >= abandonedScore) {
    const confidence = Math.min(1, escalatedScore / 2);
    return { outcome: "escalated", confidence: Math.round(confidence * 100) / 100, signals };
  }

  const confidence = Math.min(1, abandonedScore / 2);
  return { outcome: "abandoned", confidence: Math.round(confidence * 100) / 100, signals };
}

// ─── ConversationAnalyticsEngine ─────────────────────────────────────────────

/**
 * Analyzes bot conversations for satisfaction, topics, knowledge gaps,
 * and resolution quality across the OpenClaw fleet.
 *
 * All conversation data is fetched via gateway RPC calls — the engine
 * does not connect to a database directly. In-memory caches store
 * analysis results; the route layer handles Supabase persistence.
 *
 * @example
 * ```ts
 * const engine = getConversationAnalyticsEngine();
 * const results = await engine.analyzeBatch("bot-123", "company-456");
 * engine.on("analysisComplete", (analysis) => console.log(analysis));
 * ```
 */
export class ConversationAnalyticsEngine extends EventEmitter {
  /** Cached analyses indexed by companyId. */
  private analysisCache = new Map<string, ConversationAnalysis[]>();

  /** Aggregated knowledge gaps indexed by companyId. */
  private gapCache = new Map<string, KnowledgeGap[]>();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // ─── Batch Analysis ──────────────────────────────────────────────────────

  /**
   * Fetch conversations for a bot via gateway RPC and run NLP analysis
   * on each session. Results are cached and returned.
   */
  async analyzeBatch(
    botId: string,
    companyId: string,
    since?: string,
    limit?: number,
  ): Promise<ConversationAnalysis[]> {
    const monitor = getFleetMonitorService();
    const batchLimit = limit ?? DEFAULT_BATCH_LIMIT;

    logger.info({ botId, companyId, since, limit: batchLimit }, "[ConversationAnalytics] Starting batch analysis");

    // Fetch sessions from the gateway
    let sessions: Array<{ sessionKey: string; createdAt?: string; lastActivityAt?: string }>;
    try {
      const rpcResult = await monitor.rpcForBot<Record<string, unknown>>(botId, "sessions.list", {
        limit: batchLimit,
        ...(since ? { since } : {}),
      });
      const rawSessions = Array.isArray(rpcResult.sessions) ? rpcResult.sessions : [];
      sessions = rawSessions
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          sessionKey: String(s.sessionKey ?? s.key ?? ""),
          createdAt: typeof s.createdAt === "string" ? s.createdAt : undefined,
          lastActivityAt: typeof s.lastActivityAt === "string" ? s.lastActivityAt : undefined,
        }))
        .filter((s) => s.sessionKey.length > 0);
    } catch (err) {
      logger.error({ botId, err }, "[ConversationAnalytics] Failed to fetch sessions");
      throw new Error(`Failed to fetch sessions for bot ${botId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const analyses: ConversationAnalysis[] = [];

    for (const session of sessions) {
      try {
        // Fetch chat history for each session
        const historyResult = await monitor.rpcForBot<Record<string, unknown>>(botId, "chat.history", {
          sessionKey: session.sessionKey,
          limit: 200,
        });

        const rawMessages = Array.isArray(historyResult.messages)
          ? historyResult.messages
          : Array.isArray(historyResult.history)
            ? historyResult.history
            : [];

        const messages: ConversationMessage[] = rawMessages
          .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
          .map((m) => ({
            role: (String(m.role ?? "user") as ConversationMessage["role"]),
            content: String(m.content ?? m.text ?? ""),
            timestamp: typeof m.timestamp === "string" ? m.timestamp : undefined,
          }))
          .filter((m) => m.content.length > 0);

        if (messages.length < MIN_MESSAGES_FOR_ANALYSIS) continue;

        // Run NLP analysis
        const topics = extractTopics(messages);
        const sentiment = analyzeSentiment(messages);
        const resolution = scoreResolution(messages);
        const knowledgeGaps = detectKnowledgeGaps(messages, botId, session.sessionKey);

        // Compute turn counts
        const userTurnCount = messages.filter((m) => m.role === "user").length;
        const assistantTurnCount = messages.filter((m) => m.role === "assistant").length;

        // Estimate duration from timestamps
        let durationMinutes = 0;
        const timestamps = messages
          .map((m) => m.timestamp)
          .filter((t): t is string => !!t)
          .map((t) => new Date(t).getTime())
          .filter((t) => !isNaN(t));

        if (timestamps.length >= 2) {
          durationMinutes = Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60_000);
        }

        const analysis: ConversationAnalysis = {
          id: randomUUID(),
          botId,
          companyId,
          sessionKey: session.sessionKey,
          analyzedAt: new Date(),
          messageCount: messages.length,
          topics,
          sentiment,
          resolution,
          knowledgeGaps,
          durationMinutes,
          userTurnCount,
          assistantTurnCount,
        };

        analyses.push(analysis);

        // Accumulate knowledge gaps
        if (knowledgeGaps.length > 0) {
          this.mergeGaps(companyId, knowledgeGaps);
        }

        this.emit("analysisComplete", analysis);
      } catch (err) {
        logger.warn(
          { botId, sessionKey: session.sessionKey, err },
          "[ConversationAnalytics] Failed to analyze session, skipping",
        );
      }
    }

    // Cache results
    this.cacheAnalyses(companyId, analyses);

    logger.info(
      { botId, companyId, sessionsAnalyzed: analyses.length, totalGaps: this.gapCache.get(companyId)?.length ?? 0 },
      "[ConversationAnalytics] Batch analysis complete",
    );

    this.emit("batchComplete", { botId, companyId, count: analyses.length });
    return analyses;
  }

  // ─── Topic Clusters ──────────────────────────────────────────────────────

  /**
   * Return aggregated topic clusters from cached analyses for a company
   * within the specified period.
   */
  getTopicClusters(companyId: string, period?: PeriodParams): TopicCluster[] {
    const analyses = this.getFilteredAnalyses(companyId, period);

    if (analyses.length === 0) return [];

    // Aggregate topics
    const topicMap = new Map<string, {
      count: number;
      sentimentSum: number;
      resolvedCount: number;
      totalWithResolution: number;
      allKeywords: Map<string, number>;
      botCounts: Map<string, number>;
    }>();

    for (const analysis of analyses) {
      for (const topic of analysis.topics) {
        const existing = topicMap.get(topic.topic) ?? {
          count: 0,
          sentimentSum: 0,
          resolvedCount: 0,
          totalWithResolution: 0,
          allKeywords: new Map(),
          botCounts: new Map(),
        };

        existing.count++;
        existing.sentimentSum += analysis.sentiment.score;

        if (analysis.resolution.outcome !== "unknown") {
          existing.totalWithResolution++;
          if (analysis.resolution.outcome === "resolved") {
            existing.resolvedCount++;
          }
        }

        for (const kw of topic.keywords) {
          existing.allKeywords.set(kw, (existing.allKeywords.get(kw) ?? 0) + 1);
        }

        existing.botCounts.set(analysis.botId, (existing.botCounts.get(analysis.botId) ?? 0) + 1);

        topicMap.set(topic.topic, existing);
      }
    }

    const clusters: TopicCluster[] = [];
    for (const [topic, data] of topicMap) {
      // Get top keywords by frequency
      const sortedKeywords = Array.from(data.allKeywords.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([kw]) => kw);

      const botDistribution: Record<string, number> = {};
      for (const [botId, count] of data.botCounts) {
        botDistribution[botId] = count;
      }

      clusters.push({
        topic,
        count: data.count,
        avgSentiment: data.count > 0
          ? Math.round((data.sentimentSum / data.count) * 100) / 100
          : 0,
        avgResolutionRate: data.totalWithResolution > 0
          ? Math.round((data.resolvedCount / data.totalWithResolution) * 100) / 100
          : 0,
        topKeywords: sortedKeywords,
        botDistribution,
      });
    }

    return clusters.sort((a, b) => b.count - a.count);
  }

  // ─── Knowledge Gap Report ────────────────────────────────────────────────

  /**
   * Generate a knowledge gap report for a company by aggregating all
   * detected gaps and deduplicating by topic and query similarity.
   */
  generateKnowledgeGapReport(companyId: string): KnowledgeGapReport {
    const gaps = this.gapCache.get(companyId) ?? [];

    // Aggregate by topic
    const topicCounts = new Map<string, number>();
    for (const gap of gaps) {
      topicCounts.set(gap.topic, (topicCounts.get(gap.topic) ?? 0) + gap.frequency);
    }

    const topUnresolvedTopics = Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Sort gaps by severity then frequency
    const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const sortedGaps = [...gaps].sort((a, b) => {
      const sevDiff = (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
      if (sevDiff !== 0) return sevDiff;
      return b.frequency - a.frequency;
    });

    return {
      companyId,
      generatedAt: new Date(),
      totalGaps: sortedGaps.length,
      gaps: sortedGaps,
      topUnresolvedTopics,
    };
  }

  // ─── Satisfaction Trend ──────────────────────────────────────────────────

  /**
   * Compute a time-series of satisfaction scores for a company,
   * bucketed by the specified granularity.
   */
  getSatisfactionTrend(
    companyId: string,
    granularity: SatisfactionGranularity,
    period: PeriodParams,
  ): SatisfactionTrend {
    const analyses = this.getFilteredAnalyses(companyId, period);

    const start = new Date(period.periodStart);
    const end = new Date(period.periodEnd);

    // Determine bucket size in milliseconds
    const bucketMs: Record<SatisfactionGranularity, number> = {
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
    };
    const bucket = bucketMs[granularity];

    // Create time buckets
    const dataPoints: SatisfactionDataPoint[] = [];
    let currentBucket = start.getTime();

    while (currentBucket < end.getTime()) {
      const bucketEnd = currentBucket + bucket;

      const inBucket = analyses.filter((a) => {
        const t = a.analyzedAt.getTime();
        return t >= currentBucket && t < bucketEnd;
      });

      if (inBucket.length > 0) {
        const sentiments = inBucket.map((a) => a.sentiment);
        const avgSentiment = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;
        const positiveRate = sentiments.filter((s) => s.label === "positive").length / sentiments.length;
        const negativeRate = sentiments.filter((s) => s.label === "negative").length / sentiments.length;

        dataPoints.push({
          timestamp: new Date(currentBucket),
          avgSentiment: Math.round(avgSentiment * 100) / 100,
          sampleCount: inBucket.length,
          positiveRate: Math.round(positiveRate * 100) / 100,
          negativeRate: Math.round(negativeRate * 100) / 100,
        });
      } else {
        dataPoints.push({
          timestamp: new Date(currentBucket),
          avgSentiment: 0,
          sampleCount: 0,
          positiveRate: 0,
          negativeRate: 0,
        });
      }

      currentBucket = bucketEnd;
    }

    const allSentiments = analyses.map((a) => a.sentiment.score);
    const overallAvg = allSentiments.length > 0
      ? Math.round((allSentiments.reduce((a, b) => a + b, 0) / allSentiments.length) * 100) / 100
      : 0;

    return {
      companyId,
      granularity,
      periodStart: start,
      periodEnd: end,
      dataPoints,
      overallAvg,
    };
  }

  // ─── Resolution Funnel ───────────────────────────────────────────────────

  /**
   * Compute a resolution funnel for a company showing the distribution
   * of conversation outcomes.
   */
  getResolutionFunnel(companyId: string): ResolutionFunnel {
    const analyses = this.analysisCache.get(companyId) ?? [];

    const counts: Record<ResolutionOutcome, number> = {
      resolved: 0,
      partial: 0,
      escalated: 0,
      abandoned: 0,
      unknown: 0,
    };

    for (const analysis of analyses) {
      counts[analysis.resolution.outcome]++;
    }

    const total = analyses.length;
    const resolutionRate = total > 0
      ? Math.round((counts.resolved / total) * 100) / 100
      : 0;

    return {
      companyId,
      generatedAt: new Date(),
      total,
      resolved: counts.resolved,
      partial: counts.partial,
      escalated: counts.escalated,
      abandoned: counts.abandoned,
      unknown: counts.unknown,
      resolutionRate,
    };
  }

  // ─── Inconsistency Detection ─────────────────────────────────────────────

  /**
   * Find topics where different bots gave different answers. Detects when
   * the same topic is handled by multiple bots with diverging sentiment
   * or resolution outcomes.
   */
  findInconsistencies(companyId: string): InconsistencyRecord[] {
    const analyses = this.analysisCache.get(companyId) ?? [];

    if (analyses.length < 2) return [];

    // Group analyses by primary topic
    const topicGroups = new Map<string, ConversationAnalysis[]>();
    for (const analysis of analyses) {
      if (analysis.topics.length === 0) continue;
      const primaryTopic = analysis.topics[0].topic;
      const group = topicGroups.get(primaryTopic) ?? [];
      group.push(analysis);
      topicGroups.set(primaryTopic, group);
    }

    const inconsistencies: InconsistencyRecord[] = [];

    for (const [topic, group] of topicGroups) {
      // Only check topics handled by multiple bots
      const botIds = new Set(group.map((a) => a.botId));
      if (botIds.size < 2) continue;

      // Group by bot and check for divergent outcomes
      const byBot = new Map<string, ConversationAnalysis[]>();
      for (const analysis of group) {
        const existing = byBot.get(analysis.botId) ?? [];
        existing.push(analysis);
        byBot.set(analysis.botId, existing);
      }

      // Compare sentiment distributions across bots
      const botSentiments = new Map<string, { avgScore: number; dominantLabel: SentimentLabel }>();
      for (const [botId, botAnalyses] of byBot) {
        const avgScore = botAnalyses.reduce((sum, a) => sum + a.sentiment.score, 0) / botAnalyses.length;
        const labelCounts: Record<SentimentLabel, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
        for (const a of botAnalyses) {
          labelCounts[a.sentiment.label]++;
        }
        const dominantLabel = (Object.entries(labelCounts) as Array<[SentimentLabel, number]>)
          .sort((a, b) => b[1] - a[1])[0][0];
        botSentiments.set(botId, { avgScore, dominantLabel });
      }

      // Detect significant divergence (sentiment score difference > 0.5)
      const sentimentValues = Array.from(botSentiments.values());
      const scores = sentimentValues.map((s) => s.avgScore);
      const maxDiff = Math.max(...scores) - Math.min(...scores);

      if (maxDiff < 0.4) continue;

      // Determine severity
      let severity: InconsistencyRecord["severity"] = "low";
      if (maxDiff >= 0.8) {
        severity = "high";
      } else if (maxDiff >= 0.6) {
        severity = "medium";
      }

      // Build variant entries — pick the most representative analysis per bot
      const variants: InconsistencyRecord["variants"] = [];
      for (const [botId, botAnalyses] of byBot) {
        // Pick the analysis closest to the bot's average sentiment
        const botAvg = botSentiments.get(botId)!.avgScore;
        const representative = botAnalyses.reduce((best, a) => {
          return Math.abs(a.sentiment.score - botAvg) < Math.abs(best.sentiment.score - botAvg)
            ? a
            : best;
        });

        variants.push({
          botId,
          sessionKey: representative.sessionKey,
          answer: `[${representative.messageCount} messages, resolution: ${representative.resolution.outcome}]`,
          sentiment: representative.sentiment.label,
        });
      }

      inconsistencies.push({
        id: randomUUID(),
        topic,
        detectedAt: new Date(),
        variants,
        severity,
      });
    }

    return inconsistencies.sort((a, b) => {
      const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
    });
  }

  // ─── Training Data Generation ────────────────────────────────────────────

  /**
   * Auto-generate a MEMORY.md entry for a specific knowledge gap.
   * The entry provides a suggested answer template based on the gap topic
   * and query patterns.
   */
  generateTrainingData(gapId: string): TrainingDataEntry | null {
    // Search all companies for the gap
    let foundGap: KnowledgeGap | null = null;
    for (const gaps of this.gapCache.values()) {
      const gap = gaps.find((g) => g.id === gapId);
      if (gap) {
        foundGap = gap;
        break;
      }
    }

    if (!foundGap) return null;

    // Generate a suggested answer based on topic and query
    const suggestedAnswer = this.buildSuggestedAnswer(foundGap);

    // Build the MEMORY.md block
    const memoryMdBlock = [
      `## Knowledge: ${foundGap.topic}`,
      "",
      `**Trigger:** When asked about "${foundGap.query}"`,
      "",
      `**Response:**`,
      suggestedAnswer,
      "",
      `**Source:** Auto-generated from conversation analysis (gap ID: ${foundGap.id})`,
      `**Created:** ${new Date().toISOString()}`,
      `**Severity:** ${foundGap.severity}`,
      `**Frequency:** Asked ${foundGap.frequency} time(s)`,
    ].join("\n");

    const entry: TrainingDataEntry = {
      gapId: foundGap.id,
      generatedAt: new Date(),
      memoryMdBlock,
      topic: foundGap.topic,
      suggestedAnswer,
      confidence: this.estimateTrainingConfidence(foundGap),
    };

    this.emit("trainingDataGenerated", entry);
    return entry;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Clear all cached data and remove listeners.
   */
  dispose(): void {
    this.analysisCache.clear();
    this.gapCache.clear();
    this.removeAllListeners();
    logger.info("[ConversationAnalytics] Disposed");
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────

  /**
   * Cache analysis results for a company, enforcing the per-company limit.
   */
  private cacheAnalyses(companyId: string, analyses: ConversationAnalysis[]): void {
    const existing = this.analysisCache.get(companyId) ?? [];
    const combined = [...existing, ...analyses];

    // Evict oldest if over capacity
    while (combined.length > MAX_ANALYSES_PER_COMPANY) {
      combined.shift();
    }

    this.analysisCache.set(companyId, combined);
  }

  /**
   * Merge new knowledge gaps into the company cache, deduplicating by
   * topic + query similarity and incrementing frequency counters.
   */
  private mergeGaps(companyId: string, newGaps: KnowledgeGap[]): void {
    const existing = this.gapCache.get(companyId) ?? [];

    for (const gap of newGaps) {
      // Try to find an existing similar gap (same topic, similar query)
      const similar = existing.find((g) =>
        g.topic === gap.topic &&
        this.querySimilarity(g.query, gap.query) > 0.6,
      );

      if (similar) {
        similar.frequency++;
        // Upgrade severity if needed
        if (similar.frequency >= 5 && similar.severity === "low") {
          similar.severity = "medium";
        }
        if (similar.frequency >= 10 && similar.severity === "medium") {
          similar.severity = "high";
        }
      } else {
        existing.push(gap);
      }
    }

    // Evict oldest if over capacity
    while (existing.length > MAX_GAPS_PER_COMPANY) {
      existing.shift();
    }

    this.gapCache.set(companyId, existing);
  }

  /**
   * Simple Jaccard similarity between two query strings.
   */
  private querySimilarity(a: string, b: string): number {
    const wordsA = new Set(tokenize(a));
    const wordsB = new Set(tokenize(b));

    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Filter cached analyses by time period.
   */
  private getFilteredAnalyses(companyId: string, period?: PeriodParams): ConversationAnalysis[] {
    const all = this.analysisCache.get(companyId) ?? [];

    if (!period) return all;

    const start = new Date(period.periodStart).getTime();
    const end = new Date(period.periodEnd).getTime();

    return all.filter((a) => {
      const t = a.analyzedAt.getTime();
      return t >= start && t <= end;
    });
  }

  /**
   * Build a suggested answer for a knowledge gap based on its topic.
   */
  private buildSuggestedAnswer(gap: KnowledgeGap): string {
    const topicResponses: Record<string, string> = {
      billing: [
        `For billing-related questions like "${gap.query}", you should:`,
        "1. Check the customer's current plan and billing status",
        "2. Provide specific pricing or invoice details if available",
        "3. If the query requires account changes, guide them through the process",
        "4. For refund requests, explain the refund policy and initiate if eligible",
      ].join("\n"),
      technical: [
        `For technical questions like "${gap.query}", you should:`,
        "1. Ask for specific error messages or steps to reproduce",
        "2. Check the knowledge base for known issues and solutions",
        "3. Provide step-by-step troubleshooting instructions",
        "4. If unresolved, collect diagnostic information and escalate to engineering",
      ].join("\n"),
      account: [
        `For account-related questions like "${gap.query}", you should:`,
        "1. Verify the customer's identity and account details",
        "2. Walk them through the relevant account settings",
        "3. For access issues, check permissions and reset if needed",
        "4. Confirm changes were applied successfully",
      ].join("\n"),
      shipping: [
        `For shipping questions like "${gap.query}", you should:`,
        "1. Look up the order and current tracking status",
        "2. Provide the tracking number and estimated delivery date",
        "3. For delays, explain the reason and offer alternatives",
        "4. For lost packages, initiate a claim or resend process",
      ].join("\n"),
      product: [
        `For product questions like "${gap.query}", you should:`,
        "1. Reference the latest product documentation and specifications",
        "2. Explain the feature or functionality in simple terms",
        "3. Provide relevant examples or use cases",
        "4. Link to detailed guides or tutorials if available",
      ].join("\n"),
      onboarding: [
        `For onboarding questions like "${gap.query}", you should:`,
        "1. Determine what stage of setup the customer is at",
        "2. Provide a clear, step-by-step walkthrough",
        "3. Highlight key features and initial configuration options",
        "4. Offer to schedule a guided onboarding session if needed",
      ].join("\n"),
      complaint: [
        `For complaints like "${gap.query}", you should:`,
        "1. Acknowledge the customer's frustration empathetically",
        "2. Gather specific details about the issue",
        "3. Offer a concrete resolution or compensation",
        "4. Follow up to ensure satisfaction after resolution",
      ].join("\n"),
      general: [
        `For questions like "${gap.query}", you should:`,
        "1. Identify the specific intent behind the question",
        "2. Provide a clear and helpful response",
        "3. Offer related information that may be useful",
        "4. Ask if there is anything else they need help with",
      ].join("\n"),
    };

    return topicResponses[gap.topic] ?? topicResponses.general;
  }

  /**
   * Estimate confidence for generated training data based on gap metadata.
   */
  private estimateTrainingConfidence(gap: KnowledgeGap): number {
    let confidence = 0.5;

    // Higher frequency = more reliable pattern
    if (gap.frequency >= 10) confidence += 0.2;
    else if (gap.frequency >= 5) confidence += 0.1;

    // Higher severity = clearer deflection
    if (gap.severity === "high") confidence += 0.15;
    else if (gap.severity === "medium") confidence += 0.1;

    // Known topic gives better training data
    if (gap.topic !== "general") confidence += 0.1;

    return Math.min(1, Math.round(confidence * 100) / 100);
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: ConversationAnalyticsEngine | null = null;

export function getConversationAnalyticsEngine(): ConversationAnalyticsEngine {
  if (!_instance) {
    _instance = new ConversationAnalyticsEngine();
  }
  return _instance;
}

export function disposeConversationAnalyticsEngine(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}
