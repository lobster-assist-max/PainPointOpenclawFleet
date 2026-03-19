/**
 * Bot Trust Graduation System
 *
 * Manages progressive autonomy levels for bots:
 * - L0 MANUAL → L1 SUPERVISED → L2 TRUSTED → L3 AUTONOMOUS → L4 ELITE
 * - Each level unlocks more self-healing, meta-learning, and deployment capabilities
 * - Promotion requires sustained performance streaks
 * - Automatic demotion on performance degradation or incidents
 * - Trust level influences Deployment Orchestrator wave position
 *
 * @see Planning #20
 */

import { EventEmitter } from "node:events";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TrustLevel = 0 | 1 | 2 | 3 | 4;
export type TrustLevelName = "manual" | "supervised" | "trusted" | "autonomous" | "elite";

export const TRUST_LEVEL_NAMES: Record<TrustLevel, TrustLevelName> = {
  0: "manual",
  1: "supervised",
  2: "trusted",
  3: "autonomous",
  4: "elite",
};

export interface GraduationRequirement {
  name: string;
  description: string;
  current: number;
  target: number;
  met: boolean;
  trend: "improving" | "stable" | "declining";
}

export interface TrustPermissions {
  selfHealing: {
    restart: boolean;
    configAdjust: boolean;
    sessionReset: boolean;
    skillToggle: boolean;
  };
  metaLearning: {
    nonCriticalParams: boolean;
    allParams: boolean;
    autoApply: boolean;
  };
  promptLab: {
    abTest: boolean;
    maxTrafficSplit: number;
    autoAdopt: boolean;
  };
  deployment: {
    wavePosition: "last" | "middle" | "first" | "canary";
  };
  integration: {
    inboundOnly: boolean;
    outbound: boolean;
  };
  delegation: {
    canDelegate: boolean;
    canBeDelegate: boolean;
  };
  runbook: {
    canTrigger: boolean;
    autoExecute: boolean;
  };
}

export interface PromotionRecord {
  from: TrustLevel;
  to: TrustLevel;
  at: Date;
  reason: string;
  approvedBy?: string;
}

export interface BotTrustProfile {
  botId: string;
  currentLevel: TrustLevel;
  levelName: TrustLevelName;
  promotedAt: Date;
  promotionHistory: PromotionRecord[];

  graduation: {
    nextLevel: TrustLevel | null;
    requirements: GraduationRequirement[];
    estimatedPromotionDate?: Date;
    blockers: string[];
  };

  permissions: TrustPermissions;

  demotion: {
    atRisk: boolean;
    riskFactors: Array<{ factor: string; severity: number; since: Date }>;
    cooldownUntil?: Date;
  };

  streaks: {
    consecutiveDaysAboveCqi: number;
    incidentFreeDays: number;
    completionRateAbove: { threshold: number; days: number };
    mttrBelowTarget: { targetMinutes: number; streak: number };
  };
}

// ─── Permission Templates ───────────────────────────────────────────────────

const LEVEL_PERMISSIONS: Record<TrustLevel, TrustPermissions> = {
  0: {
    selfHealing: { restart: false, configAdjust: false, sessionReset: false, skillToggle: false },
    metaLearning: { nonCriticalParams: false, allParams: false, autoApply: false },
    promptLab: { abTest: false, maxTrafficSplit: 0, autoAdopt: false },
    deployment: { wavePosition: "last" },
    integration: { inboundOnly: true, outbound: false },
    delegation: { canDelegate: false, canBeDelegate: false },
    runbook: { canTrigger: false, autoExecute: false },
  },
  1: {
    selfHealing: { restart: true, configAdjust: false, sessionReset: true, skillToggle: false },
    metaLearning: { nonCriticalParams: true, allParams: false, autoApply: false },
    promptLab: { abTest: true, maxTrafficSplit: 30, autoAdopt: false },
    deployment: { wavePosition: "last" },
    integration: { inboundOnly: true, outbound: false },
    delegation: { canDelegate: false, canBeDelegate: true },
    runbook: { canTrigger: true, autoExecute: false },
  },
  2: {
    selfHealing: { restart: true, configAdjust: true, sessionReset: true, skillToggle: true },
    metaLearning: { nonCriticalParams: true, allParams: true, autoApply: false },
    promptLab: { abTest: true, maxTrafficSplit: 50, autoAdopt: false },
    deployment: { wavePosition: "middle" },
    integration: { inboundOnly: false, outbound: false },
    delegation: { canDelegate: true, canBeDelegate: true },
    runbook: { canTrigger: true, autoExecute: false },
  },
  3: {
    selfHealing: { restart: true, configAdjust: true, sessionReset: true, skillToggle: true },
    metaLearning: { nonCriticalParams: true, allParams: true, autoApply: true },
    promptLab: { abTest: true, maxTrafficSplit: 70, autoAdopt: true },
    deployment: { wavePosition: "first" },
    integration: { inboundOnly: false, outbound: true },
    delegation: { canDelegate: true, canBeDelegate: true },
    runbook: { canTrigger: true, autoExecute: true },
  },
  4: {
    selfHealing: { restart: true, configAdjust: true, sessionReset: true, skillToggle: true },
    metaLearning: { nonCriticalParams: true, allParams: true, autoApply: true },
    promptLab: { abTest: true, maxTrafficSplit: 100, autoAdopt: true },
    deployment: { wavePosition: "canary" },
    integration: { inboundOnly: false, outbound: true },
    delegation: { canDelegate: true, canBeDelegate: true },
    runbook: { canTrigger: true, autoExecute: true },
  },
};

// ─── Graduation Requirements per Level ──────────────────────────────────────

interface LevelReqs {
  minCqi: number;
  consecutiveDays: number;
  maxP1Incidents: number;
  maxP2Incidents: number;
  minCompletionRate: number;
  requiresHumanApproval: boolean;
}

const GRADUATION_REQUIREMENTS: Record<TrustLevel, LevelReqs | null> = {
  0: null, // L0 is the starting level
  1: {
    minCqi: 70,
    consecutiveDays: 7,
    maxP1Incidents: 0,
    maxP2Incidents: 999,
    minCompletionRate: 0,
    requiresHumanApproval: false,
  },
  2: {
    minCqi: 80,
    consecutiveDays: 30,
    maxP1Incidents: 0,
    maxP2Incidents: 2,
    minCompletionRate: 50,
    requiresHumanApproval: false,
  },
  3: {
    minCqi: 85,
    consecutiveDays: 60,
    maxP1Incidents: 0,
    maxP2Incidents: 0,
    minCompletionRate: 65,
    requiresHumanApproval: false,
  },
  4: {
    minCqi: 90,
    consecutiveDays: 90,
    maxP1Incidents: 0,
    maxP2Incidents: 0,
    minCompletionRate: 80,
    requiresHumanApproval: true,
  },
};

// ─── Service ────────────────────────────────────────────────────────────────

export class TrustGraduationEngine extends EventEmitter {
  private profiles: Map<string, BotTrustProfile> = new Map();

  /** Get or create a trust profile for a bot. */
  getProfile(botId: string): BotTrustProfile {
    let profile = this.profiles.get(botId);
    if (!profile) {
      profile = this.createDefaultProfile(botId);
      this.profiles.set(botId, profile);
    }
    return profile;
  }

  /** Get all profiles for a fleet. */
  getAllProfiles(): BotTrustProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Evaluate whether a bot is eligible for promotion.
   * Returns detailed assessment with unmet requirements.
   */
  evaluate(botId: string): {
    currentLevel: TrustLevel;
    eligible: boolean;
    nextLevel: TrustLevel | null;
    unmetRequirements: string[];
    recommendation: "promote" | "maintain" | "demote";
    reason: string;
  } {
    const profile = this.getProfile(botId);
    const nextLevel = (profile.currentLevel + 1) as TrustLevel;

    if (nextLevel > 4) {
      return {
        currentLevel: profile.currentLevel,
        eligible: false,
        nextLevel: null,
        unmetRequirements: [],
        recommendation: "maintain",
        reason: "Already at maximum trust level (L4 ELITE)",
      };
    }

    const reqs = GRADUATION_REQUIREMENTS[nextLevel];
    if (!reqs) {
      return {
        currentLevel: profile.currentLevel,
        eligible: false,
        nextLevel,
        unmetRequirements: [],
        recommendation: "maintain",
        reason: "No graduation requirements defined",
      };
    }

    const unmet: string[] = [];
    const streaks = profile.streaks;

    if (streaks.consecutiveDaysAboveCqi < reqs.consecutiveDays) {
      unmet.push(
        `CQI ≥ ${reqs.minCqi} for ${reqs.consecutiveDays} days (currently ${streaks.consecutiveDaysAboveCqi} days)`,
      );
    }

    if (streaks.completionRateAbove.days < reqs.consecutiveDays && reqs.minCompletionRate > 0) {
      unmet.push(
        `Completion rate ≥ ${reqs.minCompletionRate}% (current streak: ${streaks.completionRateAbove.days} days)`,
      );
    }

    if (reqs.requiresHumanApproval) {
      unmet.push("Requires human approval for L4 promotion");
    }

    // Check demotion risk
    if (profile.demotion.atRisk) {
      return {
        currentLevel: profile.currentLevel,
        eligible: false,
        nextLevel,
        unmetRequirements: unmet,
        recommendation: "demote",
        reason: `Bot is at risk of demotion: ${profile.demotion.riskFactors.map((r) => r.factor).join(", ")}`,
      };
    }

    return {
      currentLevel: profile.currentLevel,
      eligible: unmet.length === 0,
      nextLevel,
      unmetRequirements: unmet,
      recommendation: unmet.length === 0 ? "promote" : "maintain",
      reason: unmet.length === 0
        ? `Bot meets all requirements for L${nextLevel} (${TRUST_LEVEL_NAMES[nextLevel]})`
        : `${unmet.length} requirement(s) not yet met`,
    };
  }

  /** Promote a bot to the next trust level. */
  promote(botId: string, approvedBy?: string): BotTrustProfile {
    const profile = this.getProfile(botId);
    const evaluation = this.evaluate(botId);

    if (!evaluation.eligible && evaluation.nextLevel !== null) {
      throw new Error(`Bot ${botId} is not eligible for promotion: ${evaluation.reason}`);
    }

    const previousLevel = profile.currentLevel;
    const nextLevel = evaluation.nextLevel;
    if (nextLevel === null) throw new Error("Already at max level");

    profile.currentLevel = nextLevel;
    profile.levelName = TRUST_LEVEL_NAMES[nextLevel];
    profile.promotedAt = new Date();
    profile.permissions = { ...LEVEL_PERMISSIONS[nextLevel] };
    profile.promotionHistory.push({
      from: previousLevel,
      to: nextLevel,
      at: new Date(),
      reason: `Promoted: ${evaluation.reason}`,
      approvedBy,
    });

    // Update graduation to show next level requirements
    this.updateGraduationProgress(profile);

    this.emit("bot:promoted", { botId, from: previousLevel, to: nextLevel, approvedBy });
    return profile;
  }

  /** Demote a bot one level. */
  demote(botId: string, reason: string): BotTrustProfile {
    const profile = this.getProfile(botId);

    if (profile.currentLevel === 0) {
      throw new Error("Bot is already at L0 (lowest level)");
    }

    const previousLevel = profile.currentLevel;
    const newLevel = (previousLevel - 1) as TrustLevel;

    profile.currentLevel = newLevel;
    profile.levelName = TRUST_LEVEL_NAMES[newLevel];
    profile.promotedAt = new Date();
    profile.permissions = { ...LEVEL_PERMISSIONS[newLevel] };
    profile.promotionHistory.push({
      from: previousLevel,
      to: newLevel,
      at: new Date(),
      reason: `Demoted: ${reason}`,
    });

    // Reset streaks on demotion
    profile.streaks.consecutiveDaysAboveCqi = 0;
    profile.demotion.atRisk = false;
    profile.demotion.riskFactors = [];
    profile.demotion.cooldownUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 day cooldown

    this.updateGraduationProgress(profile);

    this.emit("bot:demoted", { botId, from: previousLevel, to: newLevel, reason });
    return profile;
  }

  /**
   * Update bot metrics (called periodically by the fleet monitor).
   * Adjusts streaks, checks demotion risk, and updates graduation progress.
   */
  recordDailyMetrics(
    botId: string,
    metrics: {
      cqi: number;
      completionRate: number;
      p1Incidents: number;
      p2Incidents: number;
      mttrMinutes?: number;
    },
  ): void {
    const profile = this.getProfile(botId);
    const currentReqs = GRADUATION_REQUIREMENTS[profile.currentLevel];

    // Update streaks
    const cqiThreshold = currentReqs?.minCqi ?? 70;
    if (metrics.cqi >= cqiThreshold) {
      profile.streaks.consecutiveDaysAboveCqi++;
    } else {
      profile.streaks.consecutiveDaysAboveCqi = 0;
    }

    if (metrics.p1Incidents === 0 && metrics.p2Incidents === 0) {
      profile.streaks.incidentFreeDays++;
    } else {
      profile.streaks.incidentFreeDays = 0;
    }

    if (metrics.completionRate >= (profile.streaks.completionRateAbove.threshold || 0)) {
      profile.streaks.completionRateAbove.days++;
    } else {
      profile.streaks.completionRateAbove.days = 0;
    }

    // Check demotion risk
    const demotionCqiThreshold = cqiThreshold - 10;
    if (metrics.cqi < demotionCqiThreshold) {
      const existing = profile.demotion.riskFactors.find((r) => r.factor === "low_cqi");
      if (existing) {
        existing.severity++;
      } else {
        profile.demotion.riskFactors.push({
          factor: "low_cqi",
          severity: 1,
          since: new Date(),
        });
      }
    } else {
      profile.demotion.riskFactors = profile.demotion.riskFactors.filter((r) => r.factor !== "low_cqi");
    }

    if (metrics.p1Incidents > 0) {
      profile.demotion.riskFactors.push({
        factor: "p1_incident",
        severity: 10,
        since: new Date(),
      });
    }

    // Auto-demote after 3 consecutive days of risk
    const lowCqiRisk = profile.demotion.riskFactors.find((r) => r.factor === "low_cqi");
    const p1Risk = profile.demotion.riskFactors.find((r) => r.factor === "p1_incident");
    profile.demotion.atRisk = !!(lowCqiRisk && lowCqiRisk.severity >= 3) || !!p1Risk;

    if (profile.demotion.atRisk && profile.currentLevel > 0) {
      const cooldownPassed = !profile.demotion.cooldownUntil || new Date() > profile.demotion.cooldownUntil;
      if (cooldownPassed) {
        const reason = p1Risk ? "P1 incident detected" : "CQI below threshold for 3+ days";
        this.demote(botId, reason);
      }
    }

    this.updateGraduationProgress(profile);
    this.emit("bot:metrics_updated", { botId, metrics });
  }

  /** Get fleet-wide trust distribution. */
  getFleetTrustDistribution(fleetId?: string): {
    levels: Record<TrustLevel, number>;
    avgLevel: number;
    promotionsPending: number;
    demotionsAtRisk: number;
  } {
    const profiles = this.getAllProfiles();
    const levels: Record<TrustLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let totalLevel = 0;
    let promotionsPending = 0;
    let demotionsAtRisk = 0;

    for (const p of profiles) {
      levels[p.currentLevel]++;
      totalLevel += p.currentLevel;
      const eval_ = this.evaluate(p.botId);
      if (eval_.eligible) promotionsPending++;
      if (p.demotion.atRisk) demotionsAtRisk++;
    }

    return {
      levels,
      avgLevel: profiles.length > 0 ? totalLevel / profiles.length : 0,
      promotionsPending,
      demotionsAtRisk,
    };
  }

  /** Get permissions for a trust level. */
  getPermissions(level: TrustLevel): TrustPermissions {
    return { ...LEVEL_PERMISSIONS[level] };
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private createDefaultProfile(botId: string): BotTrustProfile {
    return {
      botId,
      currentLevel: 0,
      levelName: "manual",
      promotedAt: new Date(),
      promotionHistory: [],
      graduation: {
        nextLevel: 1,
        requirements: [],
        blockers: [],
      },
      permissions: { ...LEVEL_PERMISSIONS[0] },
      demotion: {
        atRisk: false,
        riskFactors: [],
      },
      streaks: {
        consecutiveDaysAboveCqi: 0,
        incidentFreeDays: 0,
        completionRateAbove: { threshold: 50, days: 0 },
        mttrBelowTarget: { targetMinutes: 15, streak: 0 },
      },
    };
  }

  private updateGraduationProgress(profile: BotTrustProfile): void {
    const nextLevel = (profile.currentLevel + 1) as TrustLevel;
    if (nextLevel > 4) {
      profile.graduation = { nextLevel: null, requirements: [], blockers: [] };
      return;
    }

    const reqs = GRADUATION_REQUIREMENTS[nextLevel]!;
    profile.graduation = {
      nextLevel,
      requirements: [
        {
          name: "CQI Streak",
          description: `CQI ≥ ${reqs.minCqi} for ${reqs.consecutiveDays} consecutive days`,
          current: profile.streaks.consecutiveDaysAboveCqi,
          target: reqs.consecutiveDays,
          met: profile.streaks.consecutiveDaysAboveCqi >= reqs.consecutiveDays,
          trend: "stable",
        },
        {
          name: "Incident-Free",
          description: `No P1 incidents, ≤ ${reqs.maxP2Incidents} P2 incidents`,
          current: profile.streaks.incidentFreeDays,
          target: reqs.consecutiveDays,
          met: profile.streaks.incidentFreeDays >= reqs.consecutiveDays,
          trend: "stable",
        },
        ...(reqs.minCompletionRate > 0
          ? [
              {
                name: "Completion Rate",
                description: `Completion rate ≥ ${reqs.minCompletionRate}%`,
                current: profile.streaks.completionRateAbove.days,
                target: reqs.consecutiveDays,
                met: profile.streaks.completionRateAbove.days >= reqs.consecutiveDays,
                trend: "stable" as const,
              },
            ]
          : []),
      ],
      blockers: profile.demotion.atRisk ? ["Bot is at demotion risk"] : [],
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _engine: TrustGraduationEngine | null = null;

export function getTrustGraduationEngine(): TrustGraduationEngine {
  if (!_engine) {
    _engine = new TrustGraduationEngine();
  }
  return _engine;
}
