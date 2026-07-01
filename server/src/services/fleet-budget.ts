/**
 * FleetBudgetService — Cost budget management with threshold alerts.
 *
 * Supports fleet-level, bot-level, and channel-level budgets with
 * linear projection for end-of-month forecasting.
 */

import { randomUUID } from "node:crypto";
import type { FleetMonitorService } from "./fleet-monitor.js";
import { estimateTokenCostUsd } from "./fleet-pricing.js";
import { inferChannelFromSessionKey } from "./fleet-channels.js";

export interface CostBudget {
  id: string;
  /**
   * Owning company (tenant). A "fleet"-scope budget sums only this company's
   * bots; the list/status endpoints filter by it so one tenant never sees
   * another tenant's budgets or spend. Optional for backward compat with any
   * legacy in-memory budget created before multi-tenant scoping (Build #192);
   * such a budget falls back to the whole fleet.
   */
  companyId?: string;
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

// Token→USD estimation shared with reports, canary cost guardrails, and capacity
// forecasts (single source of truth — see fleet-pricing.ts).
const estimateCost = estimateTokenCostUsd;

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

  /**
   * Get all budgets, optionally scoped to a single company (tenant). Passing a
   * companyId returns only that tenant's budgets; legacy budgets with no
   * companyId are excluded from a scoped query so they can't leak across
   * tenants. Omitting companyId returns every budget (unscoped/admin callers).
   */
  getAllBudgets(companyId?: string): CostBudget[] {
    const all = Array.from(this.budgets.values());
    if (!companyId) return all;
    return all.filter((b) => b.companyId === companyId);
  }

  /** Get a specific budget. */
  getBudget(id: string): CostBudget | null {
    return this.budgets.get(id) ?? null;
  }

  /**
   * Calculate budget status for all budgets, optionally scoped to one company
   * (tenant). A scoped query only returns that tenant's budgets — see
   * {@link getAllBudgets}.
   */
  async getAllBudgetStatuses(
    monitor: FleetMonitorService,
    companyId?: string,
  ): Promise<BudgetStatus[]> {
    const statuses: BudgetStatus[] = [];
    for (const budget of this.getAllBudgets(companyId)) {
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

    // Scope fleet/channel sums to the budget's owning company so a tenant's
    // budget never aggregates another tenant's spend. Legacy budgets without a
    // companyId fall back to the whole fleet (old behaviour).
    const scopedBots = () =>
      (budget.companyId
        ? monitor.getBotsByCompany(budget.companyId)
        : monitor.getAllBots()
      ).filter((b) => b.state === "monitoring");

    if (budget.scope === "fleet") {
      // Sum this company's bot usage
      for (const bot of scopedBots()) {
        totalSpend += await this.getBotSpendThisMonth(bot.botId, monitor, startOfMonth);
      }
    } else if (budget.scope === "bot") {
      totalSpend = await this.getBotSpendThisMonth(budget.scopeId, monitor, startOfMonth);
    } else if (budget.scope === "channel") {
      // Channel-level: sum this company's sessions on the given channel
      for (const bot of scopedBots()) {
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
    } catch (err) {
      console.warn(`[fleet] getBotSpendThisMonth failed for ${botId}:`, err instanceof Error ? err.message : err);
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
        // Use the shared inference so a budget scoped to a pseudo-channel
        // (direct/group/cron) matches its sessions instead of always reading $0.
        if (inferChannelFromSessionKey(session.sessionKey) === channel) {
          channelSpend += estimateCost(
            session.inputTokens,
            session.outputTokens,
            session.cachedInputTokens ?? 0,
          );
        }
      }
      return channelSpend;
    } catch (err) {
      console.warn(`[fleet] getChannelSpendThisMonth failed for ${botId}/${channel}:`, err instanceof Error ? err.message : err);
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
