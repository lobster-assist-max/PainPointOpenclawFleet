/**
 * BudgetWidget — Cost budget progress bars with projected month-end forecasting.
 *
 * Shows fleet and per-bot budget utilization with visual indicators
 * for on-track/over-budget status.
 */

import { DollarSign, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import type { BudgetStatus } from "@/api/fleet-monitor";

function BudgetBar({ status }: { status: BudgetStatus }) {
  const pct = Math.min(status.percentUsed * 100, 100);
  const projectedPct = Math.min(
    (status.projectedMonthEnd / status.budget.monthlyLimitUsd) * 100,
    150,
  );
  const isOverBudget = status.projectedMonthEnd > status.budget.monthlyLimitUsd;
  const isWarning = status.percentUsed >= 0.8;
  const isCritical = status.percentUsed >= 0.95;

  const barColor = isCritical
    ? "bg-red-500"
    : isWarning
      ? "bg-amber-500"
      : "bg-primary";

  const scopeLabel =
    status.budget.scope === "fleet"
      ? "Fleet"
      : status.budget.scope === "bot"
        ? status.budget.scopeId
        : status.budget.scopeId.toUpperCase();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium truncate">{scopeLabel}</span>
        <span className="text-muted-foreground text-xs">
          ${status.currentMonthSpend.toFixed(2)} / ${status.budget.monthlyLimitUsd.toFixed(0)}
          <span className="ml-1">({Math.round(pct)}%)</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
        {/* Projected marker */}
        {projectedPct > pct && projectedPct <= 150 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-foreground/30"
            style={{ left: `${Math.min(projectedPct, 100)}%` }}
          />
        )}
      </div>

      {/* Forecast line */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <DollarSign className="h-3 w-3" />
        <span>
          Daily: ${status.dailyBurnRate.toFixed(2)}
        </span>
        <span className="mx-1">·</span>
        <span className="flex items-center gap-1">
          Projected:
          <span className={cn("font-medium", isOverBudget ? "text-red-500" : "text-green-600 dark:text-green-400")}>
            ${status.projectedMonthEnd.toFixed(0)}
          </span>
          {isOverBudget ? (
            <TrendingUp className="h-3 w-3 text-red-500" />
          ) : (
            <TrendingDown className="h-3 w-3 text-green-600 dark:text-green-400" />
          )}
        </span>
        <span className="mx-1">·</span>
        <span>{status.daysRemaining}d remaining</span>
      </div>
    </div>
  );
}

interface BudgetWidgetProps {
  companyId: string;
  className?: string;
}

export function BudgetWidget({ companyId, className }: BudgetWidgetProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["fleet", "budgets-status", companyId],
    queryFn: () => fleetMonitorApi.budgetStatuses(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const statuses: BudgetStatus[] = (data as any)?.statuses ?? [];

  if (isLoading || statuses.length === 0) {
    return null; // Don't render if no budgets configured
  }

  const hasWarning = statuses.some((s) => s.breachedThresholds.length > 0);
  const overBudgetBots = statuses.filter(
    (s) => s.projectedMonthEnd > s.budget.monthlyLimitUsd,
  );

  return (
    <div className={cn("rounded-xl border p-4 space-y-4", className)}>
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Cost Budgets</h3>
        {hasWarning && (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-auto" />
        )}
      </div>

      <div className="space-y-4">
        {statuses.map((status) => (
          <BudgetBar key={status.budget.id} status={status} />
        ))}
      </div>

      {overBudgetBots.length > 0 && (
        <div className="rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          {overBudgetBots.length} budget{overBudgetBots.length !== 1 ? "s" : ""} projected to exceed limit this month.
        </div>
      )}
    </div>
  );
}
