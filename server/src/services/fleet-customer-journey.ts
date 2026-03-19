/**
 * Fleet Customer Journey Engine
 *
 * Tracks individual customers across ALL bot interactions, channels, and sessions.
 * Uses OpenClaw session key format (agent:main:peer:<phoneNumber>) to identify
 * customers across bots and build complete journey timelines.
 *
 * Key capabilities:
 * - Cross-bot identity resolution (phone / email / userId deduplication)
 * - Touchpoint timeline construction from session data
 * - Journey stage classification (awareness → purchase → retention)
 * - Journey health scoring (handoff smoothness, dropoff risk)
 * - Path analysis (common paths, conversion rates, optimal path)
 * - Dropoff detection (where customers abandon their journey)
 */

import { EventEmitter } from "events";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CustomerIdentifier {
  type: "phone" | "email" | "userId" | "lineId" | "telegramId" | "discordId";
  value: string;
  firstSeen: Date;
  source: string; // botId:channel
}

export interface JourneyTouchpoint {
  timestamp: Date;
  botId: string;
  botName: string;
  channel: string;
  sessionKey: string;
  sessionId: string;
  summary: string;
  intent: "inquiry" | "pricing" | "technical" | "support" | "purchase" | "complaint" | "general";
  sentiment: "positive" | "neutral" | "negative";
  turnCount: number;
  durationMinutes: number;
  cost: number;
  cqi?: number;
  resolved: boolean;
}

export type JourneyStage =
  | "awareness"
  | "consideration"
  | "decision"
  | "purchase"
  | "retention"
  | "churned";

export interface JourneyHealth {
  totalTouchpoints: number;
  uniqueBots: number;
  uniqueChannels: number;
  totalDurationDays: number;
  avgResponseSatisfaction: number;
  handoffSmoothness: number;
  bottleneckTouchpoint?: string;
  dropoffRisk: number;
}

export interface JourneyConversion {
  converted: boolean;
  convertedAt?: Date;
  value?: number;
  attributedBots: Array<{
    botId: string;
    botName: string;
    contribution: number; // 0-1
  }>;
}

export interface CustomerJourney {
  customerId: string;
  identifiers: CustomerIdentifier[];
  touchpoints: JourneyTouchpoint[];
  stage: JourneyStage;
  health: JourneyHealth;
  conversion?: JourneyConversion;
  firstSeen: Date;
  lastSeen: Date;
  tags: string[];
}

export interface JourneyPath {
  path: string[]; // ["🦞 LINE inquiry", "🐿️ Email pricing", "🦞 LINE purchase"]
  frequency: number;
  avgConversionRate: number;
  avgDurationDays: number;
  avgTouchpoints: number;
}

export interface DropoffPoint {
  stage: string;
  afterBot: string;
  afterChannel: string;
  dropoffRate: number;
  commonReason?: string;
}

export interface JourneyAnalytics {
  totalJourneys: number;
  activeJourneys: number;
  convertedMTD: number;
  atRiskCount: number;
  commonPaths: JourneyPath[];
  dropoffPoints: DropoffPoint[];
  optimalPath: {
    path: string[];
    expectedConversionRate: number;
    expectedDurationDays: number;
    recommendation: string;
  };
  stageDistribution: Record<JourneyStage, number>;
}

export interface JourneyFunnel {
  stages: Array<{
    name: JourneyStage;
    count: number;
    percentage: number;
    dropoffFromPrevious: number;
  }>;
  overallConversionRate: number;
}

export interface JourneySearchParams {
  customerId?: string;
  stage?: JourneyStage;
  botId?: string;
  channel?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minTouchpoints?: number;
  atRiskOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface JourneyPrediction {
  customerId: string;
  currentStage: JourneyStage;
  predictedNextAction: string;
  dropoffRisk: number;
  suggestedIntervention?: string;
  bestNextBot?: string;
  bestNextChannel?: string;
  confidence: number;
}

// ─── Session Key Parser ──────────────────────────────────────────────────────

interface ParsedSessionKey {
  agentId: string;
  type: "peer" | "channel" | "guild";
  identifier: string;
}

function parseSessionKey(sessionKey: string): ParsedSessionKey | null {
  // Format: agent:<agentId>:peer:<identifier>
  //         agent:<agentId>:channel:<platform>
  //         agent:<agentId>:guild:<groupId>
  const parts = sessionKey.split(":");
  if (parts.length < 4 || parts[0] !== "agent") return null;

  const agentId = parts[1];
  const type = parts[2] as "peer" | "channel" | "guild";
  const identifier = parts.slice(3).join(":"); // phone numbers may have + or :

  if (!["peer", "channel", "guild"].includes(type)) return null;

  return { agentId, type, identifier };
}

function extractCustomerIdentifier(
  parsedKey: ParsedSessionKey,
  channel: string,
): CustomerIdentifier | null {
  if (parsedKey.type !== "peer") return null;

  const value = parsedKey.identifier;

  // Detect identifier type from format
  if (value.startsWith("+") || /^\d{10,15}$/.test(value)) {
    return { type: "phone", value, firstSeen: new Date(), source: channel };
  }
  if (value.includes("@")) {
    return { type: "email", value, firstSeen: new Date(), source: channel };
  }
  if (value.startsWith("U") && value.length === 33) {
    return { type: "lineId", value, firstSeen: new Date(), source: channel };
  }
  if (/^\d+$/.test(value)) {
    return { type: "telegramId", value, firstSeen: new Date(), source: channel };
  }

  return { type: "userId", value, firstSeen: new Date(), source: channel };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class CustomerJourneyEngine extends EventEmitter {
  private journeys: Map<string, CustomerJourney> = new Map();
  private identifierIndex: Map<string, string> = new Map(); // identifier → customerId
  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private fleetMonitor: { getBots(): Array<{ id: string; name: string; gatewayUrl: string }> },
    options?: { pollIntervalMs?: number },
  ) {
    super();
    this.pollIntervalMs = options?.pollIntervalMs ?? 60_000; // 1 min default
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    this.pollTimer = setInterval(() => this.syncAllBotSessions(), this.pollIntervalMs);
    this.syncAllBotSessions(); // initial sync
    this.emit("started");
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.emit("stopped");
  }

  // ── Session Sync ─────────────────────────────────────────────────────────

  private async syncAllBotSessions(): Promise<void> {
    const bots = this.fleetMonitor.getBots();
    for (const bot of bots) {
      try {
        await this.syncBotSessions(bot.id, bot.name);
      } catch (err) {
        this.emit("error", { botId: bot.id, error: err });
      }
    }
    this.emit("sync_complete", { journeyCount: this.journeys.size });
  }

  private async syncBotSessions(botId: string, botName: string): Promise<void> {
    // In production, this would call the OpenClaw gateway API to get session list
    // For now, this is the integration point
    // const sessions = await this.fleetMonitor.getBotSessions(botId);
    // For each session, parse the session key and build/update the journey
  }

  // ── Identity Resolution ──────────────────────────────────────────────────

  resolveCustomerId(identifiers: CustomerIdentifier[]): string {
    // Check if any identifier already maps to an existing customer
    for (const id of identifiers) {
      const key = `${id.type}:${id.value}`;
      const existing = this.identifierIndex.get(key);
      if (existing) return existing;
    }

    // Create new customer ID
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Register all identifiers
    for (const id of identifiers) {
      const key = `${id.type}:${id.value}`;
      this.identifierIndex.set(key, customerId);
    }

    return customerId;
  }

  mergeCustomers(customerId1: string, customerId2: string): CustomerJourney | null {
    const j1 = this.journeys.get(customerId1);
    const j2 = this.journeys.get(customerId2);
    if (!j1 || !j2) return null;

    // Merge identifiers
    const mergedIdentifiers = [...j1.identifiers];
    for (const id of j2.identifiers) {
      if (!mergedIdentifiers.some((i) => i.type === id.type && i.value === id.value)) {
        mergedIdentifiers.push(id);
      }
    }

    // Merge touchpoints (sorted by timestamp)
    const mergedTouchpoints = [...j1.touchpoints, ...j2.touchpoints].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Recalculate journey
    const merged: CustomerJourney = {
      customerId: customerId1,
      identifiers: mergedIdentifiers,
      touchpoints: mergedTouchpoints,
      stage: this.classifyStage(mergedTouchpoints),
      health: this.calculateHealth(mergedTouchpoints),
      firstSeen: new Date(
        Math.min(j1.firstSeen.getTime(), j2.firstSeen.getTime()),
      ),
      lastSeen: new Date(
        Math.max(j1.lastSeen.getTime(), j2.lastSeen.getTime()),
      ),
      tags: [...new Set([...j1.tags, ...j2.tags])],
    };

    // Update indexes
    this.journeys.set(customerId1, merged);
    this.journeys.delete(customerId2);
    for (const id of j2.identifiers) {
      this.identifierIndex.set(`${id.type}:${id.value}`, customerId1);
    }

    this.emit("journey_merged", { from: customerId2, into: customerId1 });
    return merged;
  }

  // ── Touchpoint Ingestion ─────────────────────────────────────────────────

  addTouchpoint(
    sessionKey: string,
    botId: string,
    botName: string,
    channel: string,
    touchpointData: Partial<JourneyTouchpoint>,
  ): CustomerJourney | null {
    const parsed = parseSessionKey(sessionKey);
    if (!parsed || parsed.type !== "peer") return null; // Only track peer sessions

    const identifier = extractCustomerIdentifier(parsed, `${botId}:${channel}`);
    if (!identifier) return null;

    const customerId = this.resolveCustomerId([identifier]);

    const touchpoint: JourneyTouchpoint = {
      timestamp: touchpointData.timestamp ?? new Date(),
      botId,
      botName,
      channel,
      sessionKey,
      sessionId: touchpointData.sessionId ?? sessionKey,
      summary: touchpointData.summary ?? "",
      intent: touchpointData.intent ?? "general",
      sentiment: touchpointData.sentiment ?? "neutral",
      turnCount: touchpointData.turnCount ?? 0,
      durationMinutes: touchpointData.durationMinutes ?? 0,
      cost: touchpointData.cost ?? 0,
      cqi: touchpointData.cqi,
      resolved: touchpointData.resolved ?? false,
    };

    let journey = this.journeys.get(customerId);
    if (!journey) {
      journey = {
        customerId,
        identifiers: [identifier],
        touchpoints: [],
        stage: "awareness",
        health: this.calculateHealth([]),
        firstSeen: touchpoint.timestamp,
        lastSeen: touchpoint.timestamp,
        tags: [],
      };
    }

    // Add touchpoint and recalculate
    journey.touchpoints.push(touchpoint);
    journey.touchpoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    journey.stage = this.classifyStage(journey.touchpoints);
    journey.health = this.calculateHealth(journey.touchpoints);
    journey.lastSeen = touchpoint.timestamp;

    // Add identifier if new
    if (!journey.identifiers.some((i) => i.type === identifier.type && i.value === identifier.value)) {
      journey.identifiers.push(identifier);
    }

    this.journeys.set(customerId, journey);
    this.emit("touchpoint_added", { customerId, touchpoint });

    return journey;
  }

  // ── Stage Classification ─────────────────────────────────────────────────

  private classifyStage(touchpoints: JourneyTouchpoint[]): JourneyStage {
    if (touchpoints.length === 0) return "awareness";

    const intents = touchpoints.map((t) => t.intent);
    const lastTouchpoint = touchpoints[touchpoints.length - 1];
    const daysSinceLastContact =
      (Date.now() - lastTouchpoint.timestamp.getTime()) / (1000 * 60 * 60 * 24);

    // Churned: no contact in 30+ days after consideration stage
    if (daysSinceLastContact > 30 && touchpoints.length > 1) return "churned";

    // Purchase: explicit purchase intent detected
    if (intents.includes("purchase")) return "purchase";

    // Decision: technical questions after pricing = evaluating options
    if (intents.includes("pricing") && intents.includes("technical")) return "decision";

    // Consideration: pricing or detailed inquiry
    if (intents.includes("pricing")) return "consideration";

    // Retention: returning customer (purchase in history + new touchpoints)
    if (touchpoints.some((t) => t.intent === "purchase") && touchpoints.length > 3) {
      return "retention";
    }

    // Awareness: initial contact
    if (touchpoints.length <= 2) return "awareness";

    return "consideration";
  }

  // ── Health Calculation ───────────────────────────────────────────────────

  private calculateHealth(touchpoints: JourneyTouchpoint[]): JourneyHealth {
    if (touchpoints.length === 0) {
      return {
        totalTouchpoints: 0,
        uniqueBots: 0,
        uniqueChannels: 0,
        totalDurationDays: 0,
        avgResponseSatisfaction: 0,
        handoffSmoothness: 100,
        dropoffRisk: 0,
      };
    }

    const uniqueBots = new Set(touchpoints.map((t) => t.botId)).size;
    const uniqueChannels = new Set(touchpoints.map((t) => t.channel)).size;
    const firstTime = touchpoints[0].timestamp.getTime();
    const lastTime = touchpoints[touchpoints.length - 1].timestamp.getTime();
    const totalDurationDays = Math.max(1, (lastTime - firstTime) / (1000 * 60 * 60 * 24));

    // Average CQI as satisfaction proxy
    const cqiScores = touchpoints.filter((t) => t.cqi !== undefined).map((t) => t.cqi!);
    const avgSatisfaction =
      cqiScores.length > 0 ? cqiScores.reduce((a, b) => a + b, 0) / cqiScores.length : 75;

    // Handoff smoothness: penalize bot switches without resolution
    let handoffPenalty = 0;
    for (let i = 1; i < touchpoints.length; i++) {
      if (touchpoints[i].botId !== touchpoints[i - 1].botId && !touchpoints[i - 1].resolved) {
        handoffPenalty += 15; // Each unresolved handoff = -15 smoothness
      }
    }
    const handoffSmoothness = Math.max(0, 100 - handoffPenalty);

    // Find bottleneck (longest touchpoint)
    const bottleneck = touchpoints.reduce((max, t) =>
      t.durationMinutes > (max?.durationMinutes ?? 0) ? t : max,
    );

    // Dropoff risk based on recency and satisfaction
    const daysSinceLastContact =
      (Date.now() - lastTime) / (1000 * 60 * 60 * 24);
    const recencyRisk = Math.min(1, daysSinceLastContact / 14); // Max risk at 14 days
    const satisfactionRisk = avgSatisfaction < 60 ? 0.4 : avgSatisfaction < 75 ? 0.2 : 0;
    const unresolved = touchpoints.filter((t) => !t.resolved).length / touchpoints.length;
    const dropoffRisk = Math.min(1, recencyRisk * 0.4 + satisfactionRisk * 0.3 + unresolved * 0.3);

    return {
      totalTouchpoints: touchpoints.length,
      uniqueBots,
      uniqueChannels,
      totalDurationDays: Math.round(totalDurationDays * 10) / 10,
      avgResponseSatisfaction: Math.round(avgSatisfaction),
      handoffSmoothness: Math.round(handoffSmoothness),
      bottleneckTouchpoint: bottleneck
        ? `${bottleneck.botName} ${bottleneck.channel}`
        : undefined,
      dropoffRisk: Math.round(dropoffRisk * 100) / 100,
    };
  }

  // ── Query Methods ────────────────────────────────────────────────────────

  getJourney(customerId: string): CustomerJourney | undefined {
    return this.journeys.get(customerId);
  }

  listJourneys(params?: JourneySearchParams): CustomerJourney[] {
    let results = Array.from(this.journeys.values());

    if (params?.customerId) {
      results = results.filter((j) => j.customerId === params.customerId);
    }
    if (params?.stage) {
      results = results.filter((j) => j.stage === params.stage);
    }
    if (params?.botId) {
      results = results.filter((j) =>
        j.touchpoints.some((t) => t.botId === params.botId),
      );
    }
    if (params?.channel) {
      results = results.filter((j) =>
        j.touchpoints.some((t) => t.channel === params.channel),
      );
    }
    if (params?.dateFrom) {
      results = results.filter((j) => j.lastSeen >= params.dateFrom!);
    }
    if (params?.dateTo) {
      results = results.filter((j) => j.firstSeen <= params.dateTo!);
    }
    if (params?.minTouchpoints) {
      results = results.filter(
        (j) => j.touchpoints.length >= params.minTouchpoints!,
      );
    }
    if (params?.atRiskOnly) {
      results = results.filter((j) => j.health.dropoffRisk > 0.5);
    }

    // Sort by lastSeen descending
    results.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());

    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  getAnalytics(): JourneyAnalytics {
    const allJourneys = Array.from(this.journeys.values());
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const activeJourneys = allJourneys.filter(
      (j) => j.stage !== "churned" && j.health.dropoffRisk < 0.8,
    );
    const convertedMTD = allJourneys.filter(
      (j) => j.conversion?.converted && j.conversion.convertedAt && j.conversion.convertedAt >= monthStart,
    ).length;
    const atRisk = allJourneys.filter((j) => j.health.dropoffRisk > 0.5);

    // Common paths
    const pathCounts = new Map<string, { count: number; converted: number; durations: number[]; touchpoints: number[] }>();
    for (const journey of allJourneys) {
      const pathKey = journey.touchpoints
        .map((t) => `${t.botName} ${t.channel} ${t.intent}`)
        .join(" → ");
      const existing = pathCounts.get(pathKey) ?? { count: 0, converted: 0, durations: [], touchpoints: [] };
      existing.count++;
      if (journey.conversion?.converted) existing.converted++;
      existing.durations.push(journey.health.totalDurationDays);
      existing.touchpoints.push(journey.health.totalTouchpoints);
      pathCounts.set(pathKey, existing);
    }

    const commonPaths: JourneyPath[] = Array.from(pathCounts.entries())
      .map(([path, data]) => ({
        path: path.split(" → "),
        frequency: data.count,
        avgConversionRate: data.count > 0 ? data.converted / data.count : 0,
        avgDurationDays:
          data.durations.reduce((a, b) => a + b, 0) / data.durations.length,
        avgTouchpoints:
          data.touchpoints.reduce((a, b) => a + b, 0) / data.touchpoints.length,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Dropoff points
    const dropoffPoints = this.detectDropoffPoints(allJourneys);

    // Optimal path (highest conversion rate with enough samples)
    const qualifiedPaths = commonPaths.filter((p) => p.frequency >= 3);
    const optimalPath = qualifiedPaths.sort(
      (a, b) => b.avgConversionRate - a.avgConversionRate,
    )[0];

    // Stage distribution
    const stageDistribution: Record<JourneyStage, number> = {
      awareness: 0,
      consideration: 0,
      decision: 0,
      purchase: 0,
      retention: 0,
      churned: 0,
    };
    for (const j of allJourneys) {
      stageDistribution[j.stage]++;
    }

    return {
      totalJourneys: allJourneys.length,
      activeJourneys: activeJourneys.length,
      convertedMTD,
      atRiskCount: atRisk.length,
      commonPaths,
      dropoffPoints,
      optimalPath: optimalPath
        ? {
            path: optimalPath.path,
            expectedConversionRate: optimalPath.avgConversionRate,
            expectedDurationDays: optimalPath.avgDurationDays,
            recommendation: `This path has a ${Math.round(optimalPath.avgConversionRate * 100)}% conversion rate. Consider routing similar customers through this sequence.`,
          }
        : {
            path: [],
            expectedConversionRate: 0,
            expectedDurationDays: 0,
            recommendation: "Not enough data to determine optimal path yet.",
          },
      stageDistribution,
    };
  }

  private detectDropoffPoints(journeys: CustomerJourney[]): DropoffPoint[] {
    const dropoffs = new Map<string, { total: number; dropped: number }>();

    for (const journey of journeys) {
      if (journey.stage === "churned" && journey.touchpoints.length > 0) {
        const lastTP = journey.touchpoints[journey.touchpoints.length - 1];
        const key = `${lastTP.botName}:${lastTP.channel}:${journey.stage}`;
        const existing = dropoffs.get(key) ?? { total: 0, dropped: 0 };
        existing.dropped++;
        existing.total++;
        dropoffs.set(key, existing);
      }
    }

    // Count total journeys that passed through each point
    for (const journey of journeys) {
      for (const tp of journey.touchpoints) {
        const key = `${tp.botName}:${tp.channel}:${journey.stage}`;
        const existing = dropoffs.get(key);
        if (existing) {
          existing.total++;
        }
      }
    }

    return Array.from(dropoffs.entries())
      .map(([key, data]) => {
        const [bot, channel, stage] = key.split(":");
        return {
          stage,
          afterBot: bot,
          afterChannel: channel,
          dropoffRate: data.total > 0 ? data.dropped / data.total : 0,
        };
      })
      .sort((a, b) => b.dropoffRate - a.dropoffRate)
      .slice(0, 10);
  }

  getFunnel(): JourneyFunnel {
    const allJourneys = Array.from(this.journeys.values());
    const stages: JourneyStage[] = [
      "awareness",
      "consideration",
      "decision",
      "purchase",
      "retention",
    ];

    // Count journeys that reached each stage (cumulative)
    const stageCounts: Array<{ name: JourneyStage; count: number }> = [];
    const stageOrder = { awareness: 0, consideration: 1, decision: 2, purchase: 3, retention: 4, churned: -1 };

    for (const stage of stages) {
      const count = allJourneys.filter((j) => {
        const jStageOrder = stageOrder[j.stage];
        const targetOrder = stageOrder[stage];
        return jStageOrder >= targetOrder;
      }).length;
      stageCounts.push({ name: stage, count });
    }

    const total = Math.max(1, allJourneys.length);

    return {
      stages: stageCounts.map((s, i) => ({
        name: s.name,
        count: s.count,
        percentage: Math.round((s.count / total) * 100),
        dropoffFromPrevious:
          i === 0
            ? 0
            : Math.round(((stageCounts[i - 1].count - s.count) / Math.max(1, stageCounts[i - 1].count)) * 100),
      })),
      overallConversionRate:
        Math.round(
          ((stageCounts.find((s) => s.name === "purchase")?.count ?? 0) / total) * 100,
        ) / 100,
    };
  }

  // ── Prediction ───────────────────────────────────────────────────────────

  predictNextAction(customerId: string): JourneyPrediction | null {
    const journey = this.journeys.get(customerId);
    if (!journey) return null;

    const lastTP = journey.touchpoints[journey.touchpoints.length - 1];
    const analytics = this.getAnalytics();

    // Find matching common paths
    const currentPathPrefix = journey.touchpoints
      .map((t) => `${t.botName} ${t.channel} ${t.intent}`)
      .join(" → ");

    const matchingPaths = analytics.commonPaths.filter((p) =>
      p.path.join(" → ").startsWith(currentPathPrefix),
    );

    let predictedNextAction = "Unknown";
    let bestNextBot = lastTP?.botId;
    let bestNextChannel = lastTP?.channel;
    let confidence = 0.3;

    if (matchingPaths.length > 0 && matchingPaths[0].path.length > journey.touchpoints.length) {
      const nextStep = matchingPaths[0].path[journey.touchpoints.length];
      predictedNextAction = nextStep;
      confidence = Math.min(0.9, matchingPaths[0].frequency / 10);
    }

    // Suggest intervention for at-risk customers
    let suggestedIntervention: string | undefined;
    if (journey.health.dropoffRisk > 0.5) {
      suggestedIntervention = `Customer at ${Math.round(journey.health.dropoffRisk * 100)}% dropoff risk. Consider proactive outreach via ${lastTP?.channel ?? "preferred channel"}.`;
    }

    return {
      customerId,
      currentStage: journey.stage,
      predictedNextAction,
      dropoffRisk: journey.health.dropoffRisk,
      suggestedIntervention,
      bestNextBot,
      bestNextChannel,
      confidence,
    };
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats(): {
    totalJourneys: number;
    totalTouchpoints: number;
    avgTouchpointsPerJourney: number;
    stageDistribution: Record<JourneyStage, number>;
  } {
    const journeys = Array.from(this.journeys.values());
    const totalTouchpoints = journeys.reduce(
      (sum, j) => sum + j.touchpoints.length,
      0,
    );

    const stageDistribution: Record<JourneyStage, number> = {
      awareness: 0,
      consideration: 0,
      decision: 0,
      purchase: 0,
      retention: 0,
      churned: 0,
    };
    for (const j of journeys) {
      stageDistribution[j.stage]++;
    }

    return {
      totalJourneys: journeys.length,
      totalTouchpoints,
      avgTouchpointsPerJourney:
        journeys.length > 0
          ? Math.round((totalTouchpoints / journeys.length) * 10) / 10
          : 0,
      stageDistribution,
    };
  }
}
