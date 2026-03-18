/**
 * FleetBudgetService — Cost budget management with threshold alerts.
 *
 * Supports fleet-level, bot-level, and channel-level budgets with
 * linear projection for end-of-month forecasting.
 */

import { randomUUID } from "node:crypto";
import type { FleetMonitorService } from "./fleet-monitor.js";

export interface CostBudget {
  id: string;
  scope: "fleet" | "bot" | "channel";
  scopeId: string;
  monthlyLimitUsd: number;
  alertThresholds: number[]; // e.g., [0.5, 0.8, 0.95]
  action: "alert_only" | "alert_and_throttle";
  createdAt: Date;
}

export interface BudgetStatus {
  budget: CostBudget;
  currentMonthSpend: number;
  percentUsed: number;
  projectedMonthEnd: number;
  daysRemaining: number;
  daysElapsed: number;
  dailyBurnRate: number;
  onTrack: boolean;
  breachedThresholds: number[];
}

// Claude pricing defaults (Sonnet 4)
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;
const CACHED_COST_PER_M = 0.3;

function estimateCost(input: number, output: number, cached: number): number {
  const inputCost = ((input - cached) / 1_000_000) * INPUT_COST_PER_M;
  const cachedCost = (cached / 1_000_000) * CACHED_COST_PER_M;
  const outputCost = (output / 1_000_000) * OUTPUT_COST_PER_M;
  return inputCost + cachedCost + outputCost;
}

export class FleetBudgetService {
  private budgets = new Map<string, CostBudget>();

  /** Create a new budget. */
  createBudget(params: Omit<CostBudget, "id" | "createdAt">): CostBudget {
    const budget: CostBudget = {
      id: randomUUID(),
      ...params,
      createdAt: new Date(),
    };
    this.budgets.set(budget.id, budget);
    return budget;
  }

  /** Delete a budget. */
  deleteBudget(id: string): void {
    this.budgets.delete(id);
  }

  /** Get all budgets. */
  getAllBudgets(): CostBudget[] {
    return Array.from(this.budgets.values());
  }

  /** Get a specific budget. */
  getBudget(id: string): CostBudget | null {
    return this.budgets.get(id) ?? null;
  }

  /** Calculate budget status for all budgets. */
  async getAllBudgetStatuses(monitor: FleetMonitorService): Promise<BudgetStatus[]> {
    const statuses: BudgetStatus[] = [];
    for (const budget of this.budgets.values()) {
      const status = await this.calculateBudgetStatus(budget, monitor);
      statuses.push(status);
    }
    return statuses;
  }

  /** Calculate status for a single budget. */
  async calculateBudgetStatus(
    budget: CostBudget,
    monitor: FleetMonitorService,
  ): Promise<BudgetStatus> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    const daysElapsed = Math.max(1, now.getDate());
    const daysRemaining = daysInMonth - daysElapsed;

    let totalSpend = 0;

    if (budget.scope === "fleet") {
      // Sum all bot usage
      const bots = monitor.getAllBots().filter((b) => b.state === "monitoring");
      for (const bot of bots) {
        totalSpend += await this.getBotSpendThisMonth(bot.botId, monitor, startOfMonth);
      }
    } else if (budget.scope === "bot") {
      totalSpend = await this.getBotSpendThisMonth(budget.scopeId, monitor, startOfMonth);
    } else if (budget.scope === "channel") {
      // Channel-level: need to filter sessions by channel
      const bots = monitor.getAllBots().filter((b) => b.state === "monitoring");
      for (const bot of bots) {
        totalSpend += await this.getChannelSpendThisMonth(
          bot.botId,
          budget.scopeId,
          monitor,
          startOfMonth,
        );
      }
    }

    const percentUsed = budget.monthlyLimitUsd > 0
      ? totalSpend / budget.monthlyLimitUsd
      : 0;

    const dailyBurnRate = totalSpend / daysElapsed;
    const projectedMonthEnd = dailyBurnRate * daysInMonth;
    const onTrack = projectedMonthEnd <= budget.monthlyLimitUsd;

    const breachedThresholds = budget.alertThresholds.filter((t) => percentUsed >= t);

    return {
      budget,
      currentMonthSpend: Math.round(totalSpend * 100) / 100,
      percentUsed: Math.round(percentUsed * 1000) / 1000,
      projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
      daysRemaining,
      daysElapsed,
      dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
      onTrack,
      breachedThresholds,
    };
  }

  private async getBotSpendThisMonth(
    botId: string,
    monitor: FleetMonitorService,
    startOfMonth: Date,
  ): Promise<number> {
    try {
      const usage = await monitor.getBotUsage(botId, {
        from: startOfMonth.toISOString().split("T")[0],
        to: new Date().toISOString().split("T")[0],
      });
      if (!usage?.total) return 0;
      return estimateCost(
        usage.total.inputTokens,
        usage.total.outputTokens,
        usage.total.cachedInputTokens ?? 0,
      );
    } catch {
      return 0;
    }
  }

  private async getChannelSpendThisMonth(
    botId: string,
    channel: string,
    monitor: FleetMonitorService,
    startOfMonth: Date,
  ): Promise<number> {
    try {
      const usage = await monitor.getBotUsage(botId, {
        from: startOfMonth.toISOString().split("T")[0],
        to: new Date().toISOString().split("T")[0],
      });
      if (!usage?.sessions) return 0;

      let channelSpend = 0;
      for (const session of usage.sessions) {
        const key = session.sessionKey ?? "";
        const sessionChannel = key.includes(`:channel:${channel}`) ? channel : null;
        if (sessionChannel === channel) {
          channelSpend += estimateCost(
            session.inputTokens,
            session.outputTokens,
            session.cachedInputTokens ?? 0,
          );
        }
      }
      return channelSpend;
    } catch {
      return 0;
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: FleetBudgetService | null = null;

export function getFleetBudgetService(): FleetBudgetService {
  if (!_instance) {
    _instance = new FleetBudgetService();
  }
  return _instance;
}
