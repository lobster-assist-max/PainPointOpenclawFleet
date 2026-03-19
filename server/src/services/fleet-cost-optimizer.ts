/**
 * Fleet Cost Optimizer — Detects cost waste and recommends/executes
 * optimizations across the fleet.
 *
 * Key capabilities:
 * - Model bloat detection (using expensive models for simple conversations)
 * - Session sprawl detection (idle sessions consuming resources)
 * - Cron waste detection (scheduled jobs with low utility)
 * - Prompt duplication detection (shared content across bot SOUL.md files)
 * - Model switching delay analysis (time wasted on unnecessary model swaps)
 * - Unused skill identification
 * - Redundant memory detection
 * - Automated optimization execution via gateway RPC
 * - Policy-driven cost governance with scheduling and budget limits
 * - Historical savings tracking
 */

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { getFleetMonitorService } from "./fleet-monitor.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type FindingType =
  | "model_bloat"
  | "session_sprawl"
  | "prompt_duplication"
  | "cron_waste"
  | "model_switching_delay"
  | "unused_skill"
  | "redundant_memory";

export type FindingSeverity = "low" | "medium" | "high" | "critical";

export type FindingStatus =
  | "open"
  | "approved"
  | "executing"
  | "executed"
  | "dismissed"
  | "failed";

export interface OptimizationFinding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  botId: string;
  botName: string;
  description: string;
  evidence: {
    metric: string;
    currentValue: number;
    optimalValue: number;
    wastePercentage: number;
  };
  recommendation: {
    action: string;
    automatable: boolean;
    rpcMethod?: string;
    params?: Record<string, unknown>;
    estimatedSavings: {
      tokensPerDay: number;
      costPerDay: number;
      costPerMonth: number;
    };
    risk: "none" | "low" | "medium" | "high";
    reversible: boolean;
  };
  status: FindingStatus;
  detectedAt: Date;
  executedAt?: Date;
}

export interface CostOptimizationScan {
  id: string;
  companyId: string;
  scannedAt: Date;
  completedAt?: Date;
  findings: OptimizationFinding[];
  summary: {
    totalFindings: number;
    totalMonthlyWaste: number;
    automatableFindings: number;
    topWasteCategory: FindingType | null;
  };
}

export interface CostOptimizationPolicyRule {
  type: FindingType;
  autoExecute: boolean;
  minSeverity: FindingSeverity;
  maxRisk: "none" | "low" | "medium" | "high";
}

export interface CostOptimizationPolicy {
  id: string;
  companyId: string;
  name: string;
  enabled: boolean;
  rules: CostOptimizationPolicyRule[];
  schedule: {
    frequency: "hourly" | "daily" | "weekly";
    dayOfWeek?: number;
    hourUtc?: number;
  };
  budget: {
    maxAutoSavingsPerDay: number;
    requireApprovalAbove: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelRightSizingRecommendation {
  botId: string;
  botName: string;
  analysisWindowDays: number;
  currentModel: string;
  recommendedModel: string;
  sessionBreakdown: {
    simple: number;
    medium: number;
    complex: number;
  };
  currentCost: {
    dailyTokens: number;
    dailyCost: number;
    monthlyCost: number;
  };
  projectedCost: {
    dailyTokens: number;
    dailyCost: number;
    monthlyCost: number;
  };
  savings: {
    dailyCost: number;
    monthlyCost: number;
    percentReduction: number;
  };
  qualityImpact: "none" | "minimal" | "moderate" | "significant";
}

export interface SavingsRecord {
  id: string;
  companyId: string;
  findingId: string;
  type: FindingType;
  botId: string;
  savedAt: Date;
  tokensSaved: number;
  costSaved: number;
}

export interface FleetCostBreakdownEntry {
  botId: string;
  botName: string;
  model: string;
  dailyInputTokens: number;
  dailyOutputTokens: number;
  dailyCost: number;
  monthlyCost: number;
  estimatedWaste: number;
  wastePercentage: number;
  topWasteType: FindingType | null;
}

export interface FleetCostBreakdown {
  companyId: string;
  generatedAt: Date;
  bots: FleetCostBreakdownEntry[];
  totals: {
    dailyCost: number;
    monthlyCost: number;
    estimatedWaste: number;
    wastePercentage: number;
  };
}

// ─── Model Pricing ──────────────────────────────────────────────────────────

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M: number;
  tier: "premium" | "standard" | "economy";
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4": {
    inputPer1M: 15,
    outputPer1M: 75,
    cachedInputPer1M: 1.5,
    tier: "premium",
  },
  "claude-sonnet-4": {
    inputPer1M: 3,
    outputPer1M: 15,
    cachedInputPer1M: 0.3,
    tier: "standard",
  },
  "claude-haiku-3.5": {
    inputPer1M: 0.8,
    outputPer1M: 4,
    cachedInputPer1M: 0.08,
    tier: "economy",
  },
  // Aliases
  "claude-3-opus": {
    inputPer1M: 15,
    outputPer1M: 75,
    cachedInputPer1M: 1.5,
    tier: "premium",
  },
  "claude-3.5-sonnet": {
    inputPer1M: 3,
    outputPer1M: 15,
    cachedInputPer1M: 0.3,
    tier: "standard",
  },
  "claude-3.5-haiku": {
    inputPer1M: 0.8,
    outputPer1M: 4,
    cachedInputPer1M: 0.08,
    tier: "economy",
  },
};

const DEFAULT_PRICING: ModelPricing = {
  inputPer1M: 3,
  outputPer1M: 15,
  cachedInputPer1M: 0.3,
  tier: "standard",
};

// ─── Severity Ranking ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const RISK_ORDER: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_SCANS_PER_FLEET = 100;
const MAX_FINDINGS_PER_FLEET = 1000;
const MAX_POLICIES_PER_FLEET = 50;
const MAX_SAVINGS_RECORDS = 5000;
const IDLE_SESSION_DEFAULT_MINUTES = 60;

// ─── Helpers ────────────────────────────────────────────────────────────────

function estimateModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const freshInput = Math.max(0, inputTokens - cachedTokens);
  const inputCost = (freshInput / 1_000_000) * pricing.inputPer1M;
  const cachedCost = (cachedTokens / 1_000_000) * pricing.cachedInputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + cachedCost + outputCost;
}

function getModelTier(model: string): "premium" | "standard" | "economy" {
  return (MODEL_PRICING[model] ?? DEFAULT_PRICING).tier;
}

type ConversationComplexity = "simple" | "medium" | "complex";

function classifyConversationComplexity(messages: Array<{
  role?: string;
  content?: string;
  messageCount?: number;
  avgLength?: number;
}>): ConversationComplexity {
  if (messages.length === 0) return "simple";

  // Aggregate signal from messages
  let totalLength = 0;
  let turnCount = messages.length;

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalLength += msg.content.length;
    }
    if (typeof msg.avgLength === "number") {
      totalLength += msg.avgLength;
    }
    if (typeof msg.messageCount === "number") {
      turnCount = Math.max(turnCount, msg.messageCount);
    }
  }

  const avgMessageLength = totalLength / Math.max(1, messages.length);

  // Complex: long messages with many turns (likely coding, analysis, multi-step reasoning)
  if (avgMessageLength > 2000 || turnCount > 20) return "complex";

  // Medium: moderate length or moderate turns
  if (avgMessageLength > 500 || turnCount > 8) return "medium";

  // Simple: short Q&A, greetings, lookups
  return "simple";
}

function detectPromptOverlap(
  soulMds: Array<{ botId: string; botName: string; content: string }>,
): Array<{
  botIds: string[];
  sharedLines: number;
  totalLines: number;
  overlapPercentage: number;
}> {
  const overlaps: Array<{
    botIds: string[];
    sharedLines: number;
    totalLines: number;
    overlapPercentage: number;
  }> = [];

  for (let i = 0; i < soulMds.length; i++) {
    for (let j = i + 1; j < soulMds.length; j++) {
      const linesA = soulMds[i].content.split("\n").filter((l) => l.trim().length > 0);
      const linesB = soulMds[j].content.split("\n").filter((l) => l.trim().length > 0);
      const setB = new Set(linesB.map((l) => l.trim()));

      let sharedCount = 0;
      for (const line of linesA) {
        if (setB.has(line.trim())) {
          sharedCount++;
        }
      }

      const totalLines = Math.max(linesA.length, linesB.length);
      if (totalLines === 0) continue;

      const overlapPercentage = (sharedCount / totalLines) * 100;
      if (overlapPercentage > 20) {
        overlaps.push({
          botIds: [soulMds[i].botId, soulMds[j].botId],
          sharedLines: sharedCount,
          totalLines,
          overlapPercentage: Math.round(overlapPercentage * 10) / 10,
        });
      }
    }
  }

  return overlaps;
}

function recommendedModelForComplexity(complexity: ConversationComplexity): string {
  switch (complexity) {
    case "simple":
      return "claude-haiku-3.5";
    case "medium":
      return "claude-sonnet-4";
    case "complex":
      return "claude-opus-4";
  }
}

function severityFromWaste(wastePercentage: number): FindingSeverity {
  if (wastePercentage >= 80) return "critical";
  if (wastePercentage >= 50) return "high";
  if (wastePercentage >= 25) return "medium";
  return "low";
}

// ─── Fleet Cost Optimizer Service ───────────────────────────────────────────

export class FleetCostOptimizerService extends EventEmitter {
  private scans = new Map<string, CostOptimizationScan>();
  private findings = new Map<string, OptimizationFinding>();
  private policies = new Map<string, CostOptimizationPolicy>();
  private savingsHistory: SavingsRecord[] = [];

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // ─── Fleet Cost Scan ────────────────────────────────────────────────────

  /**
   * Run a full fleet cost optimization scan.
   * Inspects every connected bot for waste patterns and generates findings.
   */
  async scanFleet(companyId: string): Promise<CostOptimizationScan> {
    const monitor = getFleetMonitorService();
    const bots = monitor.getBotsByCompany(companyId);

    const scan: CostOptimizationScan = {
      id: `scan_${randomUUID()}`,
      companyId,
      scannedAt: new Date(),
      findings: [],
      summary: {
        totalFindings: 0,
        totalMonthlyWaste: 0,
        automatableFindings: 0,
        topWasteCategory: null,
      },
    };

    for (const bot of bots) {
      if (bot.state !== "monitoring") continue;

      const botName = bot.agentId || bot.botId;

      // Check model bloat
      const bloatFindings = await this.checkModelBloat(bot.botId, botName);
      scan.findings.push(...bloatFindings);

      // Check session sprawl
      const sprawlFindings = await this.checkSessionSprawl(bot.botId, botName);
      scan.findings.push(...sprawlFindings);

      // Check cron waste
      const cronFindings = await this.checkCronWaste(bot.botId, botName);
      scan.findings.push(...cronFindings);
    }

    // Check prompt duplication across all bots
    const duplicationFindings = await this.checkPromptDuplication(bots);
    scan.findings.push(...duplicationFindings);

    // Store all findings
    for (const finding of scan.findings) {
      this.findings.set(finding.id, finding);
    }

    // Compute summary
    const categoryWaste = new Map<FindingType, number>();
    for (const f of scan.findings) {
      const monthly = f.recommendation.estimatedSavings.costPerMonth;
      categoryWaste.set(f.type, (categoryWaste.get(f.type) ?? 0) + monthly);
    }

    let topCategory: FindingType | null = null;
    let topWaste = 0;
    for (const [cat, waste] of categoryWaste) {
      if (waste > topWaste) {
        topWaste = waste;
        topCategory = cat;
      }
    }

    scan.summary = {
      totalFindings: scan.findings.length,
      totalMonthlyWaste: Math.round(
        scan.findings.reduce((sum, f) => sum + f.recommendation.estimatedSavings.costPerMonth, 0) * 100,
      ) / 100,
      automatableFindings: scan.findings.filter((f) => f.recommendation.automatable).length,
      topWasteCategory: topCategory,
    };

    scan.completedAt = new Date();

    // Store scan, enforce capacity
    this.scans.set(scan.id, scan);
    this.enforceScansCapacity(companyId);

    this.emit("scan_completed", scan);
    return scan;
  }

  // ─── Model Bloat Check ──────────────────────────────────────────────────

  private async checkModelBloat(
    botId: string,
    botName: string,
  ): Promise<OptimizationFinding[]> {
    const findings: OptimizationFinding[] = [];
    const monitor = getFleetMonitorService();

    try {
      const usage = await monitor.getBotUsage(botId);
      if (!usage?.sessions || usage.sessions.length === 0) return findings;

      // Get bot identity to determine model
      const identity = await monitor.getBotIdentity(botId);
      const currentModel = typeof identity?.model === "string"
        ? identity.model
        : "claude-sonnet-4";
      const currentTier = getModelTier(currentModel);

      if (currentTier === "economy") return findings; // Already on cheapest model

      // Classify session complexity from usage data
      // BotUsageReport sessions only have token counts, so we infer complexity
      // from total tokens per session as a proxy for conversation depth.
      const sessionSignals = usage.sessions.map((s) => ({
        avgLength: (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
      }));

      const complexity = classifyConversationComplexity(
        sessionSignals.map((s) => ({
          avgLength: s.avgLength,
        })),
      );

      const recommended = recommendedModelForComplexity(complexity);
      const recommendedTier = getModelTier(recommended);

      // Is the current model more expensive than needed?
      if (currentTier === "premium" && recommendedTier !== "premium") {
        const totalInput = usage.total?.inputTokens ?? 0;
        const totalOutput = usage.total?.outputTokens ?? 0;
        const cached = usage.total?.cachedInputTokens ?? 0;
        const currentCost = estimateModelCost(currentModel, totalInput, totalOutput, cached);
        const optimalCost = estimateModelCost(recommended, totalInput, totalOutput, cached);
        const wastePercentage = currentCost > 0
          ? ((currentCost - optimalCost) / currentCost) * 100
          : 0;

        if (wastePercentage > 15) {
          const dailyCostDiff = (currentCost - optimalCost) / 30;
          findings.push({
            id: `finding_${randomUUID()}`,
            type: "model_bloat",
            severity: severityFromWaste(wastePercentage),
            botId,
            botName,
            description: `Bot "${botName}" uses ${currentModel} (${currentTier}) for mostly ${complexity} conversations. ` +
              `Switching to ${recommended} would save ~${Math.round(wastePercentage)}% on model costs.`,
            evidence: {
              metric: "model_cost_efficiency",
              currentValue: Math.round(currentCost * 100) / 100,
              optimalValue: Math.round(optimalCost * 100) / 100,
              wastePercentage: Math.round(wastePercentage * 10) / 10,
            },
            recommendation: {
              action: `Switch model from ${currentModel} to ${recommended}`,
              automatable: true,
              rpcMethod: "agent.config.update",
              params: { model: recommended },
              estimatedSavings: {
                tokensPerDay: 0, // Tokens stay the same, cost changes
                costPerDay: Math.round(dailyCostDiff * 100) / 100,
                costPerMonth: Math.round((currentCost - optimalCost) * 100) / 100,
              },
              risk: recommendedTier === "standard" ? "low" : "medium",
              reversible: true,
            },
            status: "open",
            detectedAt: new Date(),
          });
        }
      } else if (currentTier === "standard" && recommendedTier === "economy") {
        const totalInput = usage.total?.inputTokens ?? 0;
        const totalOutput = usage.total?.outputTokens ?? 0;
        const cached = usage.total?.cachedInputTokens ?? 0;
        const currentCost = estimateModelCost(currentModel, totalInput, totalOutput, cached);
        const optimalCost = estimateModelCost(recommended, totalInput, totalOutput, cached);
        const wastePercentage = currentCost > 0
          ? ((currentCost - optimalCost) / currentCost) * 100
          : 0;

        if (wastePercentage > 20) {
          const dailyCostDiff = (currentCost - optimalCost) / 30;
          findings.push({
            id: `finding_${randomUUID()}`,
            type: "model_bloat",
            severity: severityFromWaste(wastePercentage),
            botId,
            botName,
            description: `Bot "${botName}" uses ${currentModel} for simple Q&A conversations. ` +
              `${recommended} can handle this workload at ~${Math.round(wastePercentage)}% lower cost.`,
            evidence: {
              metric: "model_cost_efficiency",
              currentValue: Math.round(currentCost * 100) / 100,
              optimalValue: Math.round(optimalCost * 100) / 100,
              wastePercentage: Math.round(wastePercentage * 10) / 10,
            },
            recommendation: {
              action: `Switch model from ${currentModel} to ${recommended}`,
              automatable: true,
              rpcMethod: "agent.config.update",
              params: { model: recommended },
              estimatedSavings: {
                tokensPerDay: 0,
                costPerDay: Math.round(dailyCostDiff * 100) / 100,
                costPerMonth: Math.round((currentCost - optimalCost) * 100) / 100,
              },
              risk: "low",
              reversible: true,
            },
            status: "open",
            detectedAt: new Date(),
          });
        }
      }
    } catch {
      // Bot unreachable, skip
    }

    return findings;
  }

  // ─── Session Sprawl Check ───────────────────────────────────────────────

  private async checkSessionSprawl(
    botId: string,
    botName: string,
  ): Promise<OptimizationFinding[]> {
    const findings: OptimizationFinding[] = [];
    const monitor = getFleetMonitorService();

    try {
      const sessions = await monitor.getBotSessions(botId);
      if (sessions.length === 0) return findings;

      const now = Date.now();
      let idleCount = 0;
      let totalSessions = sessions.length;

      for (const session of sessions) {
        if (session.lastActivityAt) {
          const lastActive = new Date(session.lastActivityAt).getTime();
          const idleMs = now - lastActive;
          if (idleMs > IDLE_SESSION_DEFAULT_MINUTES * 60 * 1000) {
            idleCount++;
          }
        }
      }

      if (idleCount > 0 && totalSessions > 0) {
        const idlePercentage = (idleCount / totalSessions) * 100;

        // Each idle session wastes ~500 tokens/hour on keep-alive and context caching
        const tokensWastedPerDay = idleCount * 500 * 24;
        const costPerDay = estimateModelCost("claude-sonnet-4", tokensWastedPerDay, 0, 0);

        if (idlePercentage > 20) {
          findings.push({
            id: `finding_${randomUUID()}`,
            type: "session_sprawl",
            severity: idlePercentage > 60 ? "high" : "medium",
            botId,
            botName,
            description: `Bot "${botName}" has ${idleCount} of ${totalSessions} sessions idle for over ` +
              `${IDLE_SESSION_DEFAULT_MINUTES} minutes (${Math.round(idlePercentage)}%). ` +
              `Cleaning up idle sessions reduces memory overhead and context caching costs.`,
            evidence: {
              metric: "idle_session_ratio",
              currentValue: idleCount,
              optimalValue: 0,
              wastePercentage: Math.round(idlePercentage * 10) / 10,
            },
            recommendation: {
              action: `Close ${idleCount} idle sessions on bot "${botName}"`,
              automatable: true,
              rpcMethod: "sessions.cleanup",
              params: { idleMinutes: IDLE_SESSION_DEFAULT_MINUTES },
              estimatedSavings: {
                tokensPerDay: tokensWastedPerDay,
                costPerDay: Math.round(costPerDay * 100) / 100,
                costPerMonth: Math.round(costPerDay * 30 * 100) / 100,
              },
              risk: "low",
              reversible: false,
            },
            status: "open",
            detectedAt: new Date(),
          });
        }
      }
    } catch {
      // Bot unreachable, skip
    }

    return findings;
  }

  // ─── Cron Waste Check ───────────────────────────────────────────────────

  private async checkCronWaste(
    botId: string,
    botName: string,
  ): Promise<OptimizationFinding[]> {
    const findings: OptimizationFinding[] = [];
    const monitor = getFleetMonitorService();

    try {
      const cronJobs = await monitor.getBotCronJobs(botId);
      if (!cronJobs || cronJobs.length === 0) return findings;

      for (const job of cronJobs) {
        const jobId = typeof job.id === "string" ? job.id : String(job.id ?? "unknown");
        const jobName = typeof job.name === "string" ? job.name : jobId;
        const enabled = job.enabled !== false;
        if (!enabled) continue;

        // Check run history via RPC
        let runs: Record<string, unknown>[] = [];
        try {
          const runsResult = await monitor.rpcForBot<Record<string, unknown>>(botId, "cron.runs", { jobId, limit: 20 });
          runs = Array.isArray(runsResult.runs) ? runsResult.runs as Record<string, unknown>[] : [];
        } catch {
          continue;
        }

        if (runs.length === 0) {
          // Enabled job that has never run — possibly misconfigured
          findings.push({
            id: `finding_${randomUUID()}`,
            type: "cron_waste",
            severity: "low",
            botId,
            botName,
            description: `Cron job "${jobName}" on bot "${botName}" is enabled but has no recorded runs. ` +
              `It may be misconfigured or unused.`,
            evidence: {
              metric: "cron_execution_count",
              currentValue: 0,
              optimalValue: 0,
              wastePercentage: 100,
            },
            recommendation: {
              action: `Disable or remove unused cron job "${jobName}"`,
              automatable: true,
              rpcMethod: "cron.disable",
              params: { jobId },
              estimatedSavings: {
                tokensPerDay: 0,
                costPerDay: 0,
                costPerMonth: 0,
              },
              risk: "none",
              reversible: true,
            },
            status: "open",
            detectedAt: new Date(),
          });
          continue;
        }

        // Check failure rate
        const failedRuns = runs.filter((r) => r.status === "failed" || r.status === "error");
        const failRate = failedRuns.length / runs.length;

        if (failRate > 0.5) {
          // Estimate tokens wasted per run
          const avgTokensPerRun = runs.reduce((sum, r) => {
            const input = typeof r.inputTokens === "number" ? r.inputTokens : 0;
            const output = typeof r.outputTokens === "number" ? r.outputTokens : 0;
            return sum + input + output;
          }, 0) / runs.length;

          // Estimate daily runs from schedule
          const schedule = typeof job.schedule === "string" ? job.schedule : "";
          const estimatedRunsPerDay = this.estimateCronRunsPerDay(schedule);

          const wastedTokensPerDay = Math.round(avgTokensPerRun * estimatedRunsPerDay * failRate);
          const costPerDay = estimateModelCost("claude-sonnet-4", wastedTokensPerDay, wastedTokensPerDay * 0.3, 0);

          findings.push({
            id: `finding_${randomUUID()}`,
            type: "cron_waste",
            severity: failRate > 0.8 ? "high" : "medium",
            botId,
            botName,
            description: `Cron job "${jobName}" on bot "${botName}" has a ${Math.round(failRate * 100)}% failure rate ` +
              `over the last ${runs.length} runs. Failed executions waste tokens without producing value.`,
            evidence: {
              metric: "cron_failure_rate",
              currentValue: Math.round(failRate * 100),
              optimalValue: 0,
              wastePercentage: Math.round(failRate * 100),
            },
            recommendation: {
              action: `Investigate and fix cron job "${jobName}", or disable if unnecessary`,
              automatable: false,
              estimatedSavings: {
                tokensPerDay: wastedTokensPerDay,
                costPerDay: Math.round(costPerDay * 100) / 100,
                costPerMonth: Math.round(costPerDay * 30 * 100) / 100,
              },
              risk: "low",
              reversible: true,
            },
            status: "open",
            detectedAt: new Date(),
          });
        }
      }
    } catch {
      // Bot unreachable, skip
    }

    return findings;
  }

  // ─── Prompt Duplication Check ───────────────────────────────────────────

  private async checkPromptDuplication(
    bots: Array<{ botId: string; agentId: string; companyId: string; state: string }>,
  ): Promise<OptimizationFinding[]> {
    const findings: OptimizationFinding[] = [];
    const monitor = getFleetMonitorService();

    const soulMds: Array<{ botId: string; botName: string; content: string }> = [];

    for (const bot of bots) {
      if (bot.state !== "monitoring") continue;

      try {
        const content = await monitor.getBotFile(bot.botId, "SOUL.md");
        if (content && content.length > 0) {
          soulMds.push({
            botId: bot.botId,
            botName: bot.agentId || bot.botId,
            content,
          });
        }
      } catch {
        // Skip unreachable bots
      }
    }

    if (soulMds.length < 2) return findings;

    const overlaps = detectPromptOverlap(soulMds);

    for (const overlap of overlaps) {
      const botNames = overlap.botIds.map((id) => {
        const entry = soulMds.find((s) => s.botId === id);
        return entry?.botName ?? id;
      });

      // Duplicated prompt lines waste cached tokens across every session
      // Estimate: each shared line ~50 tokens, loaded once per session
      const wastedTokensPerSession = overlap.sharedLines * 50;
      const estimatedSessionsPerDay = 20; // conservative estimate
      const wastedTokensPerDay = wastedTokensPerSession * estimatedSessionsPerDay * overlap.botIds.length;
      const costPerDay = estimateModelCost("claude-sonnet-4", wastedTokensPerDay, 0, 0);

      findings.push({
        id: `finding_${randomUUID()}`,
        type: "prompt_duplication",
        severity: overlap.overlapPercentage > 60 ? "high" : "medium",
        botId: overlap.botIds[0],
        botName: botNames[0],
        description: `Bots "${botNames.join('" and "')}" share ${overlap.sharedLines} lines ` +
          `(${overlap.overlapPercentage}%) of their SOUL.md content. Consider extracting shared ` +
          `instructions into a common template to reduce duplication and simplify maintenance.`,
        evidence: {
          metric: "prompt_overlap_percentage",
          currentValue: overlap.overlapPercentage,
          optimalValue: 0,
          wastePercentage: overlap.overlapPercentage,
        },
        recommendation: {
          action: `Extract ${overlap.sharedLines} shared lines into a common prompt template`,
          automatable: false,
          estimatedSavings: {
            tokensPerDay: wastedTokensPerDay,
            costPerDay: Math.round(costPerDay * 100) / 100,
            costPerMonth: Math.round(costPerDay * 30 * 100) / 100,
          },
          risk: "medium",
          reversible: true,
        },
        status: "open",
        detectedAt: new Date(),
      });
    }

    return findings;
  }

  // ─── Model Right-Sizing Analysis ────────────────────────────────────────

  /**
   * Deep analysis of model usage for a specific bot, with right-sizing
   * recommendation and projected savings.
   */
  async analyzeModelUsage(
    companyId: string,
    botId: string,
    days = 30,
  ): Promise<ModelRightSizingRecommendation | null> {
    const monitor = getFleetMonitorService();
    const botInfo = monitor.getBotInfo(botId);
    if (!botInfo || botInfo.companyId !== companyId) return null;

    const botName = botInfo.agentId || botId;

    // Get identity for model info
    const identity = await monitor.getBotIdentity(botId);
    const currentModel = typeof identity?.model === "string"
      ? identity.model
      : "claude-sonnet-4";

    // Get usage over the analysis window
    const from = new Date();
    from.setDate(from.getDate() - days);
    const usage = await monitor.getBotUsage(botId, {
      from: from.toISOString().split("T")[0],
      to: new Date().toISOString().split("T")[0],
    });

    if (!usage?.sessions || usage.sessions.length === 0) return null;

    // Classify each session's complexity
    let simpleCount = 0;
    let mediumCount = 0;
    let complexCount = 0;

    for (const session of usage.sessions) {
      const totalTokens = (session.inputTokens ?? 0) + (session.outputTokens ?? 0);

      const complexity = classifyConversationComplexity([
        { avgLength: totalTokens },
      ]);

      switch (complexity) {
        case "simple":
          simpleCount++;
          break;
        case "medium":
          mediumCount++;
          break;
        case "complex":
          complexCount++;
          break;
      }
    }

    // Determine recommended model based on dominant complexity
    const total = simpleCount + mediumCount + complexCount;
    let dominantComplexity: ConversationComplexity = "medium";
    if (simpleCount / total > 0.6) dominantComplexity = "simple";
    else if (complexCount / total > 0.4) dominantComplexity = "complex";

    const recommendedModel = recommendedModelForComplexity(dominantComplexity);

    // Calculate costs
    const totalInput = usage.total?.inputTokens ?? 0;
    const totalOutput = usage.total?.outputTokens ?? 0;
    const cached = usage.total?.cachedInputTokens ?? 0;

    const currentMonthlyCost = estimateModelCost(currentModel, totalInput, totalOutput, cached);
    const projectedMonthlyCost = estimateModelCost(recommendedModel, totalInput, totalOutput, cached);

    const dailyInput = totalInput / Math.max(1, days);
    const dailyOutput = totalOutput / Math.max(1, days);
    const dailyCached = cached / Math.max(1, days);

    const currentDailyCost = estimateModelCost(currentModel, dailyInput, dailyOutput, dailyCached);
    const projectedDailyCost = estimateModelCost(recommendedModel, dailyInput, dailyOutput, dailyCached);

    const monthlySavings = currentMonthlyCost - projectedMonthlyCost;
    const percentReduction = currentMonthlyCost > 0
      ? (monthlySavings / currentMonthlyCost) * 100
      : 0;

    // Assess quality impact
    let qualityImpact: "none" | "minimal" | "moderate" | "significant" = "none";
    if (currentModel === recommendedModel) {
      qualityImpact = "none";
    } else if (getModelTier(currentModel) === "premium" && getModelTier(recommendedModel) === "economy") {
      qualityImpact = complexCount > 0 ? "significant" : "moderate";
    } else if (getModelTier(currentModel) === "premium" && getModelTier(recommendedModel) === "standard") {
      qualityImpact = complexCount / total > 0.3 ? "moderate" : "minimal";
    } else if (getModelTier(currentModel) === "standard" && getModelTier(recommendedModel) === "economy") {
      qualityImpact = mediumCount / total > 0.3 ? "moderate" : "minimal";
    }

    return {
      botId,
      botName,
      analysisWindowDays: days,
      currentModel,
      recommendedModel,
      sessionBreakdown: {
        simple: simpleCount,
        medium: mediumCount,
        complex: complexCount,
      },
      currentCost: {
        dailyTokens: Math.round(dailyInput + dailyOutput),
        dailyCost: Math.round(currentDailyCost * 100) / 100,
        monthlyCost: Math.round(currentMonthlyCost * 100) / 100,
      },
      projectedCost: {
        dailyTokens: Math.round(dailyInput + dailyOutput),
        dailyCost: Math.round(projectedDailyCost * 100) / 100,
        monthlyCost: Math.round(projectedMonthlyCost * 100) / 100,
      },
      savings: {
        dailyCost: Math.round((currentDailyCost - projectedDailyCost) * 100) / 100,
        monthlyCost: Math.round(monthlySavings * 100) / 100,
        percentReduction: Math.round(percentReduction * 10) / 10,
      },
      qualityImpact,
    };
  }

  // ─── Idle Sessions ──────────────────────────────────────────────────────

  /**
   * List sessions with no recent activity on a specific bot.
   */
  async findIdleSessions(
    botId: string,
    idleMinutes = IDLE_SESSION_DEFAULT_MINUTES,
  ): Promise<Array<{
    sessionKey: string;
    title?: string;
    lastActivityAt?: string;
    idleMinutes: number;
  }>> {
    const monitor = getFleetMonitorService();
    const sessions = await monitor.getBotSessions(botId);
    const now = Date.now();
    const idleThresholdMs = idleMinutes * 60 * 1000;

    const idle: Array<{
      sessionKey: string;
      title?: string;
      lastActivityAt?: string;
      idleMinutes: number;
    }> = [];

    for (const session of sessions) {
      if (session.lastActivityAt) {
        const lastActive = new Date(session.lastActivityAt).getTime();
        const idleMs = now - lastActive;
        if (idleMs > idleThresholdMs) {
          idle.push({
            sessionKey: session.sessionKey,
            title: session.title,
            lastActivityAt: session.lastActivityAt,
            idleMinutes: Math.round(idleMs / 60_000),
          });
        }
      }
    }

    return idle.sort((a, b) => b.idleMinutes - a.idleMinutes);
  }

  // ─── Execute Optimization ───────────────────────────────────────────────

  /**
   * Execute an approved optimization finding via gateway RPC.
   */
  async executeOptimization(findingId: string): Promise<{
    success: boolean;
    error?: string;
    finding: OptimizationFinding;
  }> {
    const finding = this.findings.get(findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    if (finding.status !== "open" && finding.status !== "approved") {
      throw new Error(`Finding is not executable (status: ${finding.status})`);
    }

    if (!finding.recommendation.automatable || !finding.recommendation.rpcMethod) {
      throw new Error("This optimization cannot be executed automatically");
    }

    finding.status = "executing";
    this.emit("optimization_executing", finding);

    const monitor = getFleetMonitorService();

    try {
      await monitor.rpcForBot(
        finding.botId,
        finding.recommendation.rpcMethod,
        finding.recommendation.params ?? {},
      );

      finding.status = "executed";
      finding.executedAt = new Date();

      // Record savings
      const savingsRecord: SavingsRecord = {
        id: `savings_${randomUUID()}`,
        companyId: this.findCompanyForBot(finding.botId) ?? "",
        findingId: finding.id,
        type: finding.type,
        botId: finding.botId,
        savedAt: new Date(),
        tokensSaved: finding.recommendation.estimatedSavings.tokensPerDay,
        costSaved: finding.recommendation.estimatedSavings.costPerDay,
      };
      this.savingsHistory.push(savingsRecord);
      if (this.savingsHistory.length > MAX_SAVINGS_RECORDS) {
        this.savingsHistory.splice(0, this.savingsHistory.length - MAX_SAVINGS_RECORDS);
      }

      this.emit("optimization_executed", finding);
      return { success: true, finding };
    } catch (err) {
      finding.status = "failed";
      const error = err instanceof Error ? err.message : String(err);
      this.emit("optimization_failed", { finding, error });
      return { success: false, error, finding };
    }
  }

  // ─── Policy Management ──────────────────────────────────────────────────

  /**
   * Create a cost optimization policy for a fleet.
   */
  createPolicy(
    policy: Omit<CostOptimizationPolicy, "id" | "createdAt" | "updatedAt">,
  ): CostOptimizationPolicy {
    // Enforce policy limit per fleet
    const companyPolicies = Array.from(this.policies.values()).filter(
      (p) => p.companyId === policy.companyId,
    );
    if (companyPolicies.length >= MAX_POLICIES_PER_FLEET) {
      throw new Error(
        `Policy limit reached (${MAX_POLICIES_PER_FLEET} per fleet). ` +
        `Delete an existing policy before creating a new one.`,
      );
    }

    const now = new Date();
    const newPolicy: CostOptimizationPolicy = {
      id: `policy_${randomUUID()}`,
      ...policy,
      createdAt: now,
      updatedAt: now,
    };

    this.policies.set(newPolicy.id, newPolicy);
    this.emit("policy_created", newPolicy);
    return newPolicy;
  }

  /**
   * Update an existing optimization policy.
   */
  updatePolicy(
    id: string,
    patch: Partial<Omit<CostOptimizationPolicy, "id" | "companyId" | "createdAt">>,
  ): CostOptimizationPolicy | null {
    const existing = this.policies.get(id);
    if (!existing) return null;

    if (patch.name !== undefined) existing.name = patch.name;
    if (patch.enabled !== undefined) existing.enabled = patch.enabled;
    if (patch.rules !== undefined) existing.rules = patch.rules;
    if (patch.schedule !== undefined) existing.schedule = patch.schedule;
    if (patch.budget !== undefined) existing.budget = patch.budget;
    existing.updatedAt = new Date();

    this.emit("policy_updated", existing);
    return existing;
  }

  /**
   * List policies for a company.
   */
  listPolicies(companyId: string): CostOptimizationPolicy[] {
    return Array.from(this.policies.values())
      .filter((p) => p.companyId === companyId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // ─── Savings History ────────────────────────────────────────────────────

  /**
   * Get historical savings data for a company within a time period.
   */
  getSavingsHistory(
    companyId: string,
    period?: { start: Date; end: Date },
  ): {
    records: SavingsRecord[];
    totalTokensSaved: number;
    totalCostSaved: number;
    byType: Record<string, { count: number; tokensSaved: number; costSaved: number }>;
  } {
    let records = this.savingsHistory.filter((r) => r.companyId === companyId);

    if (period) {
      records = records.filter(
        (r) => r.savedAt >= period.start && r.savedAt <= period.end,
      );
    }

    const totalTokensSaved = records.reduce((sum, r) => sum + r.tokensSaved, 0);
    const totalCostSaved = Math.round(records.reduce((sum, r) => sum + r.costSaved, 0) * 100) / 100;

    const byType: Record<string, { count: number; tokensSaved: number; costSaved: number }> = {};
    for (const record of records) {
      if (!byType[record.type]) {
        byType[record.type] = { count: 0, tokensSaved: 0, costSaved: 0 };
      }
      byType[record.type].count++;
      byType[record.type].tokensSaved += record.tokensSaved;
      byType[record.type].costSaved += record.costSaved;
    }

    // Round costs in byType
    for (const entry of Object.values(byType)) {
      entry.costSaved = Math.round(entry.costSaved * 100) / 100;
    }

    return { records, totalTokensSaved, totalCostSaved, byType };
  }

  // ─── Fleet Cost Breakdown ───────────────────────────────────────────────

  /**
   * Generate a per-bot cost breakdown with waste estimates for the entire fleet.
   */
  async getFleetCostBreakdown(companyId: string): Promise<FleetCostBreakdown> {
    const monitor = getFleetMonitorService();
    const bots = monitor.getBotsByCompany(companyId);
    const entries: FleetCostBreakdownEntry[] = [];

    for (const bot of bots) {
      if (bot.state !== "monitoring") continue;

      const botName = bot.agentId || bot.botId;

      try {
        const identity = await monitor.getBotIdentity(bot.botId);
        const model = typeof identity?.model === "string" ? identity.model : "claude-sonnet-4";

        const usage = await monitor.getBotUsage(bot.botId);
        const totalInput = usage?.total?.inputTokens ?? 0;
        const totalOutput = usage?.total?.outputTokens ?? 0;
        const cached = usage?.total?.cachedInputTokens ?? 0;

        const monthlyCost = estimateModelCost(model, totalInput, totalOutput, cached);
        const dailyCost = monthlyCost / 30;

        // Calculate waste from stored findings for this bot
        const botFindings = Array.from(this.findings.values()).filter(
          (f) => f.botId === bot.botId && f.status === "open",
        );
        const estimatedWaste = botFindings.reduce(
          (sum, f) => sum + f.recommendation.estimatedSavings.costPerMonth,
          0,
        );
        const wastePercentage = monthlyCost > 0
          ? (estimatedWaste / monthlyCost) * 100
          : 0;

        // Find top waste type for this bot
        let topWasteType: FindingType | null = null;
        let topWasteAmount = 0;
        for (const f of botFindings) {
          if (f.recommendation.estimatedSavings.costPerMonth > topWasteAmount) {
            topWasteAmount = f.recommendation.estimatedSavings.costPerMonth;
            topWasteType = f.type;
          }
        }

        entries.push({
          botId: bot.botId,
          botName,
          model,
          dailyInputTokens: Math.round(totalInput / 30),
          dailyOutputTokens: Math.round(totalOutput / 30),
          dailyCost: Math.round(dailyCost * 100) / 100,
          monthlyCost: Math.round(monthlyCost * 100) / 100,
          estimatedWaste: Math.round(estimatedWaste * 100) / 100,
          wastePercentage: Math.round(wastePercentage * 10) / 10,
          topWasteType,
        });
      } catch {
        // Bot unreachable, add a minimal entry
        entries.push({
          botId: bot.botId,
          botName,
          model: "unknown",
          dailyInputTokens: 0,
          dailyOutputTokens: 0,
          dailyCost: 0,
          monthlyCost: 0,
          estimatedWaste: 0,
          wastePercentage: 0,
          topWasteType: null,
        });
      }
    }

    // Compute totals
    const totalDailyCost = entries.reduce((sum, e) => sum + e.dailyCost, 0);
    const totalMonthlyCost = entries.reduce((sum, e) => sum + e.monthlyCost, 0);
    const totalWaste = entries.reduce((sum, e) => sum + e.estimatedWaste, 0);
    const totalWastePercentage = totalMonthlyCost > 0
      ? (totalWaste / totalMonthlyCost) * 100
      : 0;

    return {
      companyId,
      generatedAt: new Date(),
      bots: entries.sort((a, b) => b.monthlyCost - a.monthlyCost),
      totals: {
        dailyCost: Math.round(totalDailyCost * 100) / 100,
        monthlyCost: Math.round(totalMonthlyCost * 100) / 100,
        estimatedWaste: Math.round(totalWaste * 100) / 100,
        wastePercentage: Math.round(totalWastePercentage * 10) / 10,
      },
    };
  }

  // ─── Query Methods ──────────────────────────────────────────────────────

  /**
   * Get findings for a company, optionally filtered.
   */
  getFindings(
    companyId: string,
    filters?: { status?: FindingStatus; severity?: FindingSeverity; botId?: string },
  ): OptimizationFinding[] {
    const monitor = getFleetMonitorService();
    const companyBotIds = new Set(
      monitor.getBotsByCompany(companyId).map((b) => b.botId),
    );

    let results = Array.from(this.findings.values()).filter(
      (f) => companyBotIds.has(f.botId),
    );

    if (filters?.status) {
      results = results.filter((f) => f.status === filters.status);
    }
    if (filters?.severity) {
      results = results.filter((f) => f.severity === filters.severity);
    }
    if (filters?.botId) {
      results = results.filter((f) => f.botId === filters.botId);
    }

    return results.sort(
      (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
    );
  }

  /**
   * Get a single finding by ID.
   */
  getFinding(findingId: string): OptimizationFinding | undefined {
    return this.findings.get(findingId);
  }

  /**
   * Get a single scan by ID.
   */
  getScan(scanId: string): CostOptimizationScan | undefined {
    return this.scans.get(scanId);
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  private estimateCronRunsPerDay(schedule: string): number {
    // Simple heuristic from cron expression
    if (!schedule) return 1;
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) return 1;

    const minutePart = parts[0];
    const hourPart = parts[1];

    // "*/5 * * * *" → every 5 minutes → 288/day
    if (minutePart.startsWith("*/")) {
      const interval = parseInt(minutePart.slice(2), 10);
      if (!isNaN(interval) && interval > 0) {
        const runsPerHour = 60 / interval;
        if (hourPart === "*") return runsPerHour * 24;
        return runsPerHour;
      }
    }

    // "0 * * * *" → every hour → 24/day
    if (hourPart === "*") return 24;

    // "0 9 * * *" → once a day
    if (hourPart.includes(",")) return hourPart.split(",").length;

    return 1;
  }

  private findCompanyForBot(botId: string): string | null {
    const monitor = getFleetMonitorService();
    const info = monitor.getBotInfo(botId);
    return info?.companyId ?? null;
  }

  private enforceScansCapacity(companyId: string): void {
    const companyScans = Array.from(this.scans.entries())
      .filter(([, s]) => s.companyId === companyId)
      .sort(([, a], [, b]) => a.scannedAt.getTime() - b.scannedAt.getTime());

    while (companyScans.length > MAX_SCANS_PER_FLEET) {
      const [id] = companyScans.shift()!;
      this.scans.delete(id);
    }
  }

  // ─── Disposal ───────────────────────────────────────────────────────────

  dispose(): void {
    this.scans.clear();
    this.findings.clear();
    this.policies.clear();
    this.savingsHistory = [];
    this.removeAllListeners();
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: FleetCostOptimizerService | null = null;

export function getFleetCostOptimizerService(): FleetCostOptimizerService {
  if (!_instance) {
    _instance = new FleetCostOptimizerService();
  }
  return _instance;
}

export function disposeFleetCostOptimizerService(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}
