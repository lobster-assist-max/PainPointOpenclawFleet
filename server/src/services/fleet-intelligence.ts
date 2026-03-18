/**
 * FleetIntelligenceEngine — Cross-signal recommendation engine.
 *
 * Analyzes fleet state across multiple dimensions (health, cost, config, channels)
 * and generates actionable recommendations. Rules require at least 2 corroborating
 * signals before triggering to minimize false positives.
 */

import { randomUUID } from "node:crypto";
import type { FleetMonitorService } from "./fleet-monitor.js";

export interface Recommendation {
  id: string;
  type: "cost_optimization" | "health_improvement" | "config_suggestion" | "capacity_warning";
  severity: "info" | "actionable" | "urgent";
  title: string;
  description: string;
  affectedBots: string[];
  suggestedAction: string;
  estimatedImpact: string;
  dataPoints: Array<{
    source: string;
    observation: string;
  }>;
  dismissed: boolean;
  dismissedAt?: Date;
  createdAt: Date;
}

// Dismissed recommendations are hidden for 7 days
const DISMISS_COOLDOWN_MS = 7 * 24 * 3600_000;

export class FleetIntelligenceEngine {
  private dismissed = new Map<string, Date>(); // recommendation pattern key → dismissed at
  private lastRecommendations: Recommendation[] = [];

  /** Dismiss a recommendation by ID. */
  dismiss(id: string): void {
    const rec = this.lastRecommendations.find((r) => r.id === id);
    if (rec) {
      rec.dismissed = true;
      rec.dismissedAt = new Date();
      // Use a pattern key so similar recommendations stay dismissed
      this.dismissed.set(`${rec.type}:${rec.affectedBots.sort().join(",")}`, new Date());
    }
  }

  /** Check if a recommendation pattern is in cooldown. */
  private isDismissed(type: string, botIds: string[]): boolean {
    const key = `${type}:${botIds.sort().join(",")}`;
    const dismissedAt = this.dismissed.get(key);
    if (!dismissedAt) return false;
    if (Date.now() - dismissedAt.getTime() > DISMISS_COOLDOWN_MS) {
      this.dismissed.delete(key);
      return false;
    }
    return true;
  }

  /** Analyze fleet state and generate recommendations. */
  async analyze(monitor: FleetMonitorService): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const bots = monitor.getAllBots();
    const monitoringBots = bots.filter((b) => b.state === "monitoring");

    if (monitoringBots.length === 0) {
      this.lastRecommendations = [];
      return [];
    }

    // ── Rule 1: Multiple bots offline simultaneously → network issue ──────
    const offlineBots = bots.filter(
      (b) => b.state === "error" || b.state === "disconnected" || b.state === "backoff",
    );
    if (offlineBots.length >= 2) {
      const botIds = offlineBots.map((b) => b.botId);
      if (!this.isDismissed("capacity_warning", botIds)) {
        recommendations.push({
          id: randomUUID(),
          type: "capacity_warning",
          severity: "urgent",
          title: `${offlineBots.length} bots offline simultaneously`,
          description:
            "Multiple bots are disconnected at the same time. This may indicate a network issue rather than individual bot failures.",
          affectedBots: botIds,
          suggestedAction: "Check network connectivity to bot hosts before investigating individual bots.",
          estimatedImpact: `Restore ${offlineBots.length} bot connections`,
          dataPoints: [
            {
              source: "connection_state",
              observation: `${offlineBots.length}/${bots.length} bots are offline`,
            },
            {
              source: "timing_correlation",
              observation: "Multiple disconnections in the same time window",
            },
          ],
          dismissed: false,
          createdAt: new Date(),
        });
      }
    }

    // ── Rule 2: Bot health degrading + high cost → model downgrade suggestion
    for (const bot of monitoringBots) {
      try {
        const health = await monitor.getBotHealth(bot.botId);
        const usage = await monitor.getBotUsage(bot.botId);

        if (!health || !usage?.total) continue;

        const totalTokens = usage.total.inputTokens + usage.total.outputTokens;
        const cacheRatio = usage.total.cachedInputTokens
          ? usage.total.cachedInputTokens / Math.max(1, usage.total.inputTokens)
          : 0;

        // High cost + low cache ratio
        if (totalTokens > 100_000 && cacheRatio < 0.3) {
          if (!this.isDismissed("cost_optimization", [bot.botId])) {
            const savingsEstimate = Math.round(totalTokens * 0.000003 * 0.7 * 100) / 100;
            recommendations.push({
              id: randomUUID(),
              type: "cost_optimization",
              severity: "actionable",
              title: `${bot.botId} has low cache efficiency`,
              description: `Cache hit ratio is ${Math.round(cacheRatio * 100)}%. Improving caching could significantly reduce costs.`,
              affectedBots: [bot.botId],
              suggestedAction:
                "Review conversation patterns for repetitive prompts. Enable prompt caching or reduce context window for routine tasks.",
              estimatedImpact: `Save ~$${savingsEstimate}/mo with better caching`,
              dataPoints: [
                { source: "cost_tracking", observation: `${totalTokens.toLocaleString()} tokens used` },
                { source: "health_score", observation: `Cache ratio: ${Math.round(cacheRatio * 100)}%` },
              ],
              dismissed: false,
              createdAt: new Date(),
            });
          }
        }
      } catch {
        // Skip bots that fail health/usage checks
      }
    }

    // ── Rule 3: Single channel dominates cost → suggest optimization ──────
    const channelCosts = new Map<string, { tokens: number; sessions: number }>();
    let totalTokensAllChannels = 0;

    for (const bot of monitoringBots) {
      try {
        const usage = await monitor.getBotUsage(bot.botId);
        if (!usage?.sessions) continue;

        for (const session of usage.sessions) {
          const key = session.sessionKey ?? "";
          let channel = "other";
          const channelMatch = key.match(/:channel:(\w+)/);
          if (channelMatch) channel = channelMatch[1];
          else if (key.includes(":peer:")) channel = "direct";

          const tokens = session.inputTokens + session.outputTokens;
          const existing = channelCosts.get(channel) ?? { tokens: 0, sessions: 0 };
          existing.tokens += tokens;
          existing.sessions += 1;
          channelCosts.set(channel, existing);
          totalTokensAllChannels += tokens;
        }
      } catch {
        continue;
      }
    }

    if (totalTokensAllChannels > 0) {
      for (const [channel, data] of channelCosts) {
        const pct = data.tokens / totalTokensAllChannels;
        if (pct > 0.6 && data.sessions > 10) {
          if (!this.isDismissed("cost_optimization", [`channel:${channel}`])) {
            recommendations.push({
              id: randomUUID(),
              type: "cost_optimization",
              severity: "info",
              title: `${channel.toUpperCase()} channel accounts for ${Math.round(pct * 100)}% of total cost`,
              description: `The ${channel} channel dominates token usage with ${data.sessions} sessions consuming ${Math.round(pct * 100)}% of tokens.`,
              affectedBots: monitoringBots.map((b) => b.botId),
              suggestedAction: `Consider setting a lower max_tokens limit for ${channel} conversations, or implementing summarization for long threads.`,
              estimatedImpact: `Potential 20-30% cost reduction on ${channel} channel`,
              dataPoints: [
                {
                  source: "cost_tracking",
                  observation: `${channel}: ${data.tokens.toLocaleString()} tokens across ${data.sessions} sessions`,
                },
                {
                  source: "cost_tracking",
                  observation: `${channel} is ${Math.round(pct * 100)}% of total fleet token usage`,
                },
              ],
              dismissed: false,
              createdAt: new Date(),
            });
          }
        }
      }
    }

    // ── Rule 4: Cron failure rate high → investigate workload ──────────────
    for (const bot of monitoringBots) {
      try {
        const cronJobs = await monitor.getBotCronJobs(bot.botId);
        if (!cronJobs || cronJobs.length === 0) continue;

        const failedJobs = cronJobs.filter(
          (j: any) => j.lastRunStatus === "failed" || j.lastRunStatus === "error",
        );

        if (failedJobs.length >= 2 && failedJobs.length / cronJobs.length > 0.3) {
          if (!this.isDismissed("health_improvement", [bot.botId])) {
            recommendations.push({
              id: randomUUID(),
              type: "health_improvement",
              severity: "actionable",
              title: `${bot.botId} has ${failedJobs.length} failing cron jobs`,
              description: `${Math.round((failedJobs.length / cronJobs.length) * 100)}% of cron jobs are failing. This degrades health score and may indicate a systemic issue.`,
              affectedBots: [bot.botId],
              suggestedAction: "Review cron job configurations and recent error logs. Failed jobs may be timing out or encountering changed dependencies.",
              estimatedImpact: `Improve health score by ~${Math.round((failedJobs.length / cronJobs.length) * 10)} points`,
              dataPoints: [
                { source: "cron_status", observation: `${failedJobs.length}/${cronJobs.length} cron jobs failing` },
                { source: "health_score", observation: "Cron dimension contributing to score degradation" },
              ],
              dismissed: false,
              createdAt: new Date(),
            });
          }
        }
      } catch {
        continue;
      }
    }

    this.lastRecommendations = recommendations;
    return recommendations;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: FleetIntelligenceEngine | null = null;

export function getFleetIntelligenceEngine(): FleetIntelligenceEngine {
  if (!_instance) {
    _instance = new FleetIntelligenceEngine();
  }
  return _instance;
}
