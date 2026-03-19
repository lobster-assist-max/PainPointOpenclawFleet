/**
 * Fleet A2A (Agent-to-Agent) Mesh Service
 *
 * Manages bot-to-bot collaboration via expertise routing. When Bot A encounters
 * a topic outside its expertise, the mesh routes the conversation to a
 * better-suited Bot B — transparently, as a handoff, or as a consultation.
 *
 * Key capabilities:
 * - Expertise profiling (manual or auto-detected from SOUL.md / IDENTITY.md)
 * - Configurable routing rules with trigger conditions
 * - Three routing strategies: best_match, round_robin, least_loaded
 * - Three collaboration modes: transparent, handoff, consultation
 * - Feedback loop that adjusts expertise weights based on outcomes
 * - Bounded collaboration history (ring buffer, max 1000)
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { logger } from "../middleware/logger.js";
import { getFleetMonitorService, type FleetMonitorService } from "./fleet-monitor.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BotExpertiseProfile {
  botId: string;
  botName: string;
  expertise: Array<{
    domain: string;
    confidence: number;
    source: "manual" | "auto" | "feedback";
    sampleCount: number;
    avgSatisfaction: number;
  }>;
  availability: {
    status: "online" | "busy" | "offline";
    currentLoad: number;
    maxConcurrent: number;
    avgResponseTime: number;
  };
}

export interface A2ARoute {
  id: string;
  companyId: string;
  name: string;
  description: string;
  trigger: {
    type: "topic" | "keyword" | "confidence_below" | "manual";
    condition: string;
  };
  routing: {
    strategy: "best_match" | "round_robin" | "least_loaded";
    candidateFilter: string | null;
    fallback: "origin" | "none" | "queue";
    timeout: number;
  };
  mode: "transparent" | "handoff" | "consultation";
  enabled: boolean;
  priority: number;
}

export interface A2ACollaboration {
  id: string;
  companyId: string;
  origin: {
    botId: string;
    sessionKey: string;
    userMessage: string;
    detectedTopic: string;
    confidence: number;
  };
  target: {
    botId: string;
    response: string | null;
    responseTime: number | null;
    confidence: number | null;
  };
  routing: {
    routeId: string | null;
    strategy: string;
    candidatesEvaluated: Array<{
      botId: string;
      score: number;
      reason: string;
    }>;
  };
  outcome: "success" | "failure" | "timeout" | "fallback" | null;
  trace: string[];
  status: "pending" | "in_progress" | "completed" | "failed" | "timed_out";
  initiatedAt: string;
  completedAt: string | null;
}

// ─── Internal Types ────────────────────────────────────────────────────────

interface CandidateScore {
  botId: string;
  score: number;
  reason: string;
  expertiseMatch: number;
  availabilityScore: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_COLLABORATIONS = 1000;
const DEFAULT_ROUTE_TIMEOUT = 30_000;
const EXPERTISE_DECAY_FACTOR = 0.95;

// ─── Domain keywords for auto-detection ────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "customer-support": ["support", "help", "issue", "complaint", "ticket", "resolve", "assist"],
  sales: ["sales", "pricing", "quote", "deal", "purchase", "buy", "offer", "discount"],
  technical: ["technical", "api", "integration", "debug", "error", "code", "deploy", "server"],
  billing: ["billing", "invoice", "payment", "charge", "refund", "subscription", "plan"],
  onboarding: ["onboarding", "setup", "welcome", "getting started", "tutorial", "guide"],
  marketing: ["marketing", "campaign", "analytics", "seo", "content", "social", "brand"],
  hr: ["hr", "hiring", "employee", "benefits", "leave", "payroll", "performance"],
  legal: ["legal", "compliance", "terms", "policy", "contract", "privacy", "gdpr"],
  product: ["product", "feature", "roadmap", "feedback", "release", "update", "beta"],
  operations: ["operations", "logistics", "inventory", "shipping", "supply", "warehouse"],
};

// ─── Engine ────────────────────────────────────────────────────────────────

export class FleetA2AMeshEngine extends EventEmitter {
  private expertiseProfiles = new Map<string, BotExpertiseProfile>(); // companyId:botId → profile
  private routes = new Map<string, A2ARoute>(); // routeId → route
  private collaborations: A2ACollaboration[] = []; // bounded ring buffer
  private roundRobinIndex = new Map<string, number>(); // companyId → last index
  private monitor: FleetMonitorService;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.monitor = getFleetMonitorService();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  dispose(): void {
    this.expertiseProfiles.clear();
    this.routes.clear();
    this.collaborations = [];
    this.roundRobinIndex.clear();
    this.emit("disposed");
  }

  // ─── Expertise Management ───────────────────────────────────────────────

  /** Set or update a bot's expertise profile. */
  updateExpertise(
    companyId: string,
    botId: string,
    expertise: BotExpertiseProfile["expertise"],
  ): BotExpertiseProfile {
    const key = `${companyId}:${botId}`;
    const existing = this.expertiseProfiles.get(key);

    const profile: BotExpertiseProfile = {
      botId,
      botName: existing?.botName ?? botId,
      expertise,
      availability: existing?.availability ?? {
        status: "online",
        currentLoad: 0,
        maxConcurrent: 5,
        avgResponseTime: 2000,
      },
    };

    this.expertiseProfiles.set(key, profile);
    this.emit("expertise_updated", { companyId, botId, domains: expertise.map((e) => e.domain) });

    logger.info(`[a2a-mesh] Updated expertise for bot ${botId}: ${expertise.length} domains`);
    return profile;
  }

  /**
   * Auto-detect a bot's expertise by reading SOUL.md and IDENTITY.md via
   * the gateway file-read RPC, then inferring domains from keywords.
   */
  async autoDetectExpertise(
    companyId: string,
    botId: string,
  ): Promise<BotExpertiseProfile> {
    const key = `${companyId}:${botId}`;

    let combinedContent = "";

    // Read SOUL.md
    try {
      const soulContent = await this.monitor.getBotFile(botId, "SOUL.md");
      if (soulContent) combinedContent += soulContent + "\n";
    } catch (err) {
      logger.warn(`[a2a-mesh] Failed to read SOUL.md for bot ${botId}: ${err}`);
    }

    // Read IDENTITY.md
    try {
      const identityContent = await this.monitor.getBotFile(botId, "IDENTITY.md");
      if (identityContent) combinedContent += identityContent + "\n";
    } catch (err) {
      logger.warn(`[a2a-mesh] Failed to read IDENTITY.md for bot ${botId}: ${err}`);
    }

    // Infer domains from content
    const detectedExpertise = this.inferDomains(combinedContent);

    const botInfo = this.monitor.getBotInfo(botId);
    const profile: BotExpertiseProfile = {
      botId,
      botName: (botInfo as any)?.botName ?? botId,
      expertise: detectedExpertise,
      availability: this.expertiseProfiles.get(key)?.availability ?? {
        status: botInfo?.state === "monitoring" ? "online" : "offline",
        currentLoad: 0,
        maxConcurrent: 5,
        avgResponseTime: 2000,
      },
    };

    this.expertiseProfiles.set(key, profile);
    this.emit("expertise_auto_detected", {
      companyId,
      botId,
      domains: detectedExpertise.map((e) => e.domain),
    });

    logger.info(
      `[a2a-mesh] Auto-detected ${detectedExpertise.length} domains for bot ${botId}`,
    );
    return profile;
  }

  /** Get the full expertise matrix for a company's fleet. */
  getExpertiseMatrix(companyId: string): BotExpertiseProfile[] {
    const profiles: BotExpertiseProfile[] = [];
    for (const [key, profile] of this.expertiseProfiles) {
      if (key.startsWith(`${companyId}:`)) {
        profiles.push(profile);
      }
    }
    return profiles;
  }

  // ─── Route Management ───────────────────────────────────────────────────

  /** Create a new A2A routing rule. */
  createRoute(route: Omit<A2ARoute, "id">): A2ARoute {
    const full: A2ARoute = { ...route, id: randomUUID() };
    this.routes.set(full.id, full);
    this.emit("route_created", { routeId: full.id, name: full.name });

    logger.info(`[a2a-mesh] Created route "${full.name}" (${full.id})`);
    return full;
  }

  /** Update an existing route. */
  updateRoute(id: string, patch: Partial<Omit<A2ARoute, "id">>): A2ARoute {
    const existing = this.routes.get(id);
    if (!existing) throw new Error(`Route not found: ${id}`);

    const updated: A2ARoute = { ...existing, ...patch, id };
    this.routes.set(id, updated);
    this.emit("route_updated", { routeId: id });

    return updated;
  }

  /** Delete a route. */
  deleteRoute(id: string): boolean {
    const existed = this.routes.delete(id);
    if (existed) {
      this.emit("route_deleted", { routeId: id });
    }
    return existed;
  }

  /** List all routes for a company. */
  listRoutes(companyId: string): A2ARoute[] {
    return Array.from(this.routes.values())
      .filter((r) => r.companyId === companyId)
      .sort((a, b) => b.priority - a.priority);
  }

  // ─── Core Routing ───────────────────────────────────────────────────────

  /**
   * Route a conversation from one bot to another.
   *
   * 1. Find matching routes for the topic/context
   * 2. Evaluate candidate bots by expertise + availability
   * 3. Select the best target using the route's strategy
   * 4. Proxy the message to the target bot via chat.send RPC
   * 5. Record the collaboration
   */
  async routeConversation(
    companyId: string,
    originBotId: string,
    sessionKey: string,
    userMessage: string,
    context?: { topic?: string; confidence?: number },
  ): Promise<A2ACollaboration> {
    const startTime = Date.now();
    const collaborationId = randomUUID();
    const topic = context?.topic ?? this.detectTopic(userMessage);
    const confidence = context?.confidence ?? 0.5;

    const trace: string[] = [];
    trace.push(`[${new Date().toISOString()}] Routing initiated for topic "${topic}" (confidence: ${confidence})`);

    // Create initial collaboration record
    const collaboration: A2ACollaboration = {
      id: collaborationId,
      companyId,
      origin: {
        botId: originBotId,
        sessionKey,
        userMessage,
        detectedTopic: topic,
        confidence,
      },
      target: {
        botId: "",
        response: null,
        responseTime: null,
        confidence: null,
      },
      routing: {
        routeId: null,
        strategy: "best_match",
        candidatesEvaluated: [],
      },
      outcome: null,
      trace,
      status: "pending",
      initiatedAt: new Date().toISOString(),
      completedAt: null,
    };

    // Find matching route
    const matchedRoute = this.findMatchingRoute(companyId, topic, confidence);
    if (matchedRoute) {
      collaboration.routing.routeId = matchedRoute.id;
      collaboration.routing.strategy = matchedRoute.routing.strategy;
      trace.push(`Matched route "${matchedRoute.name}" (${matchedRoute.id})`);
    } else {
      trace.push("No explicit route matched, using default best_match strategy");
    }

    const strategy = matchedRoute?.routing.strategy ?? "best_match";
    const timeout = matchedRoute?.routing.timeout ?? DEFAULT_ROUTE_TIMEOUT;
    const fallback = matchedRoute?.routing.fallback ?? "origin";

    // Evaluate candidates
    const candidates = this.evaluateCandidates(companyId, topic, [originBotId]);
    collaboration.routing.candidatesEvaluated = candidates.map((c) => ({
      botId: c.botId,
      score: c.score,
      reason: c.reason,
    }));
    trace.push(`Evaluated ${candidates.length} candidate(s)`);

    if (candidates.length === 0) {
      trace.push(`No candidates found, applying fallback: ${fallback}`);
      collaboration.status = "failed";
      collaboration.outcome = "fallback";
      collaboration.completedAt = new Date().toISOString();
      this.pushCollaboration(collaboration);
      this.emit("routing_fallback", { collaborationId, reason: "no_candidates" });
      return collaboration;
    }

    // Select target
    const target = this.selectTarget(candidates, strategy, companyId);
    collaboration.target.botId = target.botId;
    collaboration.status = "in_progress";
    trace.push(`Selected target: ${target.botId} (score: ${target.score.toFixed(3)}, reason: ${target.reason})`);

    // Increment load for the target bot
    const targetKey = `${companyId}:${target.botId}`;
    const targetProfile = this.expertiseProfiles.get(targetKey);
    if (targetProfile) {
      targetProfile.availability.currentLoad++;
    }

    // Proxy message to target bot via RPC
    try {
      const rpcStart = Date.now();

      const rpcPromise = this.monitor.rpcForBot<Record<string, unknown>>(
        target.botId,
        "chat.send",
        {
          sessionKey: `a2a_${collaborationId}`,
          message: userMessage,
          metadata: {
            a2aCollaborationId: collaborationId,
            originBotId,
            originSessionKey: sessionKey,
            topic,
          },
        },
      );

      // Apply timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("A2A routing timeout")), timeout);
      });

      const result = await Promise.race([rpcPromise, timeoutPromise]);

      const responseTime = Date.now() - rpcStart;
      const responseText =
        typeof result.response === "string"
          ? result.response
          : typeof result.message === "string"
            ? result.message
            : JSON.stringify(result);

      collaboration.target.response = responseText;
      collaboration.target.responseTime = responseTime;
      collaboration.target.confidence = typeof result.confidence === "number" ? result.confidence : null;
      collaboration.status = "completed";
      collaboration.outcome = "success";
      collaboration.completedAt = new Date().toISOString();

      trace.push(`Target responded in ${responseTime}ms`);
      trace.push(`Collaboration completed successfully`);

      this.emit("collaboration_completed", {
        collaborationId,
        originBotId,
        targetBotId: target.botId,
        responseTime,
      });
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes("timeout");

      collaboration.status = isTimeout ? "timed_out" : "failed";
      collaboration.outcome = isTimeout ? "timeout" : "failure";
      collaboration.completedAt = new Date().toISOString();

      trace.push(`Error: ${message} (after ${elapsed}ms)`);

      // Apply fallback
      if (fallback === "origin") {
        trace.push(`Falling back to origin bot ${originBotId}`);
        collaboration.outcome = "fallback";
      }

      this.emit("collaboration_failed", {
        collaborationId,
        error: message,
        isTimeout,
      });

      logger.warn(`[a2a-mesh] Collaboration ${collaborationId} failed: ${message}`);
    } finally {
      // Decrement load
      if (targetProfile) {
        targetProfile.availability.currentLoad = Math.max(
          0,
          targetProfile.availability.currentLoad - 1,
        );
      }
    }

    this.pushCollaboration(collaboration);
    return collaboration;
  }

  // ─── Collaboration History ──────────────────────────────────────────────

  /** Query past collaborations with optional filters. */
  getCollaborationHistory(
    companyId: string,
    filters?: {
      since?: string;
      botId?: string;
      status?: A2ACollaboration["status"];
    },
  ): A2ACollaboration[] {
    let results = this.collaborations.filter((c) => c.companyId === companyId);

    if (filters?.since) {
      const sinceDate = new Date(filters.since).getTime();
      results = results.filter((c) => new Date(c.initiatedAt).getTime() >= sinceDate);
    }

    if (filters?.botId) {
      results = results.filter(
        (c) => c.origin.botId === filters.botId || c.target.botId === filters.botId,
      );
    }

    if (filters?.status) {
      results = results.filter((c) => c.status === filters.status);
    }

    return results;
  }

  /** Aggregate collaboration statistics for a time period. */
  getCollaborationStats(
    companyId: string,
    period: { start: string; end: string },
  ): {
    totalCollaborations: number;
    successRate: number;
    avgResponseTime: number;
    topRoutes: Array<{ routeId: string; count: number }>;
    topTargetBots: Array<{ botId: string; count: number; avgResponseTime: number }>;
    outcomeBreakdown: Record<string, number>;
    byDay: Array<{ date: string; count: number; successRate: number }>;
  } {
    const startMs = new Date(period.start).getTime();
    const endMs = new Date(period.end).getTime();

    const filtered = this.collaborations.filter((c) => {
      const ts = new Date(c.initiatedAt).getTime();
      return c.companyId === companyId && ts >= startMs && ts <= endMs;
    });

    const total = filtered.length;

    // Outcome breakdown
    const outcomeBreakdown: Record<string, number> = {};
    for (const c of filtered) {
      const key = c.outcome ?? "pending";
      outcomeBreakdown[key] = (outcomeBreakdown[key] ?? 0) + 1;
    }

    // Success rate
    const successCount = filtered.filter((c) => c.outcome === "success").length;
    const successRate = total > 0 ? successCount / total : 0;

    // Avg response time (only completed)
    const completed = filtered.filter(
      (c) => c.status === "completed" && c.target.responseTime !== null,
    );
    const avgResponseTime =
      completed.length > 0
        ? completed.reduce((sum, c) => sum + (c.target.responseTime ?? 0), 0) / completed.length
        : 0;

    // Top routes
    const routeCounts = new Map<string, number>();
    for (const c of filtered) {
      if (c.routing.routeId) {
        routeCounts.set(c.routing.routeId, (routeCounts.get(c.routing.routeId) ?? 0) + 1);
      }
    }
    const topRoutes = Array.from(routeCounts.entries())
      .map(([routeId, count]) => ({ routeId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top target bots
    const botStats = new Map<string, { count: number; totalResponseTime: number }>();
    for (const c of filtered) {
      if (!c.target.botId) continue;
      const existing = botStats.get(c.target.botId) ?? { count: 0, totalResponseTime: 0 };
      existing.count++;
      if (c.target.responseTime !== null) {
        existing.totalResponseTime += c.target.responseTime;
      }
      botStats.set(c.target.botId, existing);
    }
    const topTargetBots = Array.from(botStats.entries())
      .map(([botId, stats]) => ({
        botId,
        count: stats.count,
        avgResponseTime: stats.count > 0 ? stats.totalResponseTime / stats.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // By day
    const dayMap = new Map<string, { count: number; success: number }>();
    for (const c of filtered) {
      const day = c.initiatedAt.slice(0, 10);
      const existing = dayMap.get(day) ?? { count: 0, success: 0 };
      existing.count++;
      if (c.outcome === "success") existing.success++;
      dayMap.set(day, existing);
    }
    const byDay = Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        count: data.count,
        successRate: data.count > 0 ? data.success / data.count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalCollaborations: total,
      successRate: Math.round(successRate * 1000) / 1000,
      avgResponseTime: Math.round(avgResponseTime),
      topRoutes,
      topTargetBots,
      outcomeBreakdown,
      byDay,
    };
  }

  // ─── Feedback Loop ──────────────────────────────────────────────────────

  /**
   * Update expertise weights based on collaboration outcomes.
   * Positive outcomes boost the target bot's confidence for the topic;
   * negative outcomes decay it.
   */
  feedbackLoop(
    collaborationId: string,
    outcome: { success: boolean; satisfaction?: number; notes?: string },
  ): boolean {
    const collaboration = this.collaborations.find((c) => c.id === collaborationId);
    if (!collaboration) return false;

    const targetKey = `${collaboration.companyId}:${collaboration.target.botId}`;
    const profile = this.expertiseProfiles.get(targetKey);
    if (!profile) return false;

    const topic = collaboration.origin.detectedTopic;
    const expertiseEntry = profile.expertise.find((e) => e.domain === topic);

    if (expertiseEntry) {
      // Update based on outcome
      expertiseEntry.sampleCount++;

      if (outcome.success) {
        // Boost confidence, capped at 1.0
        expertiseEntry.confidence = Math.min(
          1.0,
          expertiseEntry.confidence + (1 - expertiseEntry.confidence) * 0.1,
        );
      } else {
        // Decay confidence
        expertiseEntry.confidence *= EXPERTISE_DECAY_FACTOR;
      }

      if (outcome.satisfaction !== undefined) {
        // Running average of satisfaction
        const prev = expertiseEntry.avgSatisfaction;
        const n = expertiseEntry.sampleCount;
        expertiseEntry.avgSatisfaction = prev + (outcome.satisfaction - prev) / n;
      }

      expertiseEntry.source = "feedback";
    } else {
      // Create new expertise entry from feedback
      profile.expertise.push({
        domain: topic,
        confidence: outcome.success ? 0.6 : 0.3,
        source: "feedback",
        sampleCount: 1,
        avgSatisfaction: outcome.satisfaction ?? (outcome.success ? 0.8 : 0.3),
      });
    }

    // Also update the origin bot — if it failed, reduce its confidence for this topic
    const originKey = `${collaboration.companyId}:${collaboration.origin.botId}`;
    const originProfile = this.expertiseProfiles.get(originKey);
    if (originProfile) {
      const originEntry = originProfile.expertise.find((e) => e.domain === topic);
      if (originEntry) {
        // The origin bot deferred — slight reduction in its confidence for this topic
        originEntry.confidence *= 0.98;
      }
    }

    this.emit("feedback_recorded", {
      collaborationId,
      targetBotId: collaboration.target.botId,
      topic,
      success: outcome.success,
    });

    logger.info(
      `[a2a-mesh] Feedback for collaboration ${collaborationId}: ${outcome.success ? "positive" : "negative"}`,
    );
    return true;
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  /** Score bots by expertise match + availability. */
  private evaluateCandidates(
    companyId: string,
    topic: string,
    excludeBots: string[],
  ): CandidateScore[] {
    const candidates: CandidateScore[] = [];
    const excludeSet = new Set(excludeBots);
    const topicLower = topic.toLowerCase();

    for (const [key, profile] of this.expertiseProfiles) {
      if (!key.startsWith(`${companyId}:`)) continue;
      if (excludeSet.has(profile.botId)) continue;
      if (profile.availability.status === "offline") continue;

      // Calculate expertise match score
      let expertiseMatch = 0;
      let matchReason = "no_match";

      for (const exp of profile.expertise) {
        const domainLower = exp.domain.toLowerCase();

        // Exact match
        if (domainLower === topicLower) {
          expertiseMatch = exp.confidence;
          matchReason = `exact_match:${exp.domain}`;
          break;
        }

        // Partial match (topic contains domain or domain contains topic)
        if (topicLower.includes(domainLower) || domainLower.includes(topicLower)) {
          const partialScore = exp.confidence * 0.8;
          if (partialScore > expertiseMatch) {
            expertiseMatch = partialScore;
            matchReason = `partial_match:${exp.domain}`;
          }
          continue;
        }

        // Keyword-based match via domain keywords
        const domainKeywords = DOMAIN_KEYWORDS[domainLower] ?? [];
        const topicWords = topicLower.split(/\s+/);
        const keywordOverlap = topicWords.filter((w) => domainKeywords.includes(w)).length;
        if (keywordOverlap > 0) {
          const keywordScore = exp.confidence * 0.5 * (keywordOverlap / topicWords.length);
          if (keywordScore > expertiseMatch) {
            expertiseMatch = keywordScore;
            matchReason = `keyword_match:${exp.domain}(${keywordOverlap} keywords)`;
          }
        }
      }

      if (expertiseMatch <= 0) continue;

      // Calculate availability score (0-1)
      const loadRatio =
        profile.availability.maxConcurrent > 0
          ? profile.availability.currentLoad / profile.availability.maxConcurrent
          : 1;
      const availabilityScore = Math.max(0, 1 - loadRatio);

      // Penalize busy bots
      const busyPenalty = profile.availability.status === "busy" ? 0.5 : 1.0;

      // Combined score (70% expertise, 30% availability)
      const score = (expertiseMatch * 0.7 + availabilityScore * 0.3) * busyPenalty;

      candidates.push({
        botId: profile.botId,
        score,
        reason: matchReason,
        expertiseMatch,
        availabilityScore,
      });
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  /** Select the target bot based on the routing strategy. */
  private selectTarget(
    candidates: CandidateScore[],
    strategy: string,
    companyId: string,
  ): CandidateScore {
    if (candidates.length === 0) {
      throw new Error("No candidates to select from");
    }

    switch (strategy) {
      case "round_robin": {
        const idx = this.roundRobinIndex.get(companyId) ?? 0;
        const selected = candidates[idx % candidates.length];
        this.roundRobinIndex.set(companyId, (idx + 1) % candidates.length);
        return selected;
      }

      case "least_loaded": {
        // Sort by availability score descending (least loaded first)
        const sorted = [...candidates].sort(
          (a, b) => b.availabilityScore - a.availabilityScore,
        );
        return sorted[0];
      }

      case "best_match":
      default:
        // Already sorted by score descending
        return candidates[0];
    }
  }

  /** Find a matching route for the given topic and confidence. */
  private findMatchingRoute(
    companyId: string,
    topic: string,
    confidence: number,
  ): A2ARoute | null {
    const companyRoutes = Array.from(this.routes.values())
      .filter((r) => r.companyId === companyId && r.enabled)
      .sort((a, b) => b.priority - a.priority);

    const topicLower = topic.toLowerCase();

    for (const route of companyRoutes) {
      const { type, condition } = route.trigger;
      const conditionLower = condition.toLowerCase();

      switch (type) {
        case "topic":
          if (topicLower.includes(conditionLower) || conditionLower.includes(topicLower)) {
            return route;
          }
          break;

        case "keyword": {
          const keywords = conditionLower.split(",").map((k) => k.trim());
          if (keywords.some((kw) => topicLower.includes(kw))) {
            return route;
          }
          break;
        }

        case "confidence_below": {
          const threshold = parseFloat(condition);
          if (!isNaN(threshold) && confidence < threshold) {
            return route;
          }
          break;
        }

        case "manual":
          // Manual routes are only triggered explicitly (not auto-matched)
          break;
      }
    }

    return null;
  }

  /** Simple topic detection from user message. */
  private detectTopic(message: string): string {
    const messageLower = message.toLowerCase();

    let bestDomain = "general";
    let bestScore = 0;

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (messageLower.includes(kw)) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domain;
      }
    }

    return bestDomain;
  }

  /** Infer expertise domains from SOUL.md / IDENTITY.md content. */
  private inferDomains(
    content: string,
  ): BotExpertiseProfile["expertise"] {
    if (!content.trim()) return [];

    const contentLower = content.toLowerCase();
    const detected: BotExpertiseProfile["expertise"] = [];

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      let matches = 0;
      for (const kw of keywords) {
        if (contentLower.includes(kw)) matches++;
      }

      if (matches >= 2) {
        // At least 2 keyword matches to consider it a domain
        const confidence = Math.min(1.0, matches / keywords.length + 0.3);
        detected.push({
          domain,
          confidence: Math.round(confidence * 100) / 100,
          source: "auto",
          sampleCount: 0,
          avgSatisfaction: 0,
        });
      }
    }

    return detected.sort((a, b) => b.confidence - a.confidence);
  }

  /** Append a collaboration to the ring buffer. */
  private pushCollaboration(collaboration: A2ACollaboration): void {
    this.collaborations.push(collaboration);

    // Enforce ring buffer bound
    if (this.collaborations.length > MAX_COLLABORATIONS) {
      this.collaborations = this.collaborations.slice(-MAX_COLLABORATIONS);
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: FleetA2AMeshEngine | null = null;

export function getFleetA2AMeshEngine(): FleetA2AMeshEngine {
  if (!_instance) {
    _instance = new FleetA2AMeshEngine();
  }
  return _instance;
}

export function disposeFleetA2AMeshEngine(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}
