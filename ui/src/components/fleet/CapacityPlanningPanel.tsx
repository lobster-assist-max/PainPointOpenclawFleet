/**
 * CapacityPlanningPanel — self-fetching container for the CapacityPlanning widget.
 *
 * Wires the presentational <CapacityPlanning /> (which takes costForecast +
 * sessionForecast props) to the live `/fleet-monitor/capacity/forecasts`
 * backend. The Capacity Planner runs Holt-Winters forecasting on daily
 * cost/session-count data points fed by fleet-bootstrap's refreshData handler;
 * a forecast needs ≥3 data points, so a young fleet gets null forecasts.
 *
 * Degrades gracefully: when neither forecast is available yet, the panel falls
 * back to a demo forecast pair with a [Preview] badge so the page still
 * demonstrates the feature.
 */

import { AlertTriangle, Loader2 } from "lucide-react";
import { CapacityPlanning } from "./CapacityPlanning";
import { useCapacityForecasts } from "@/hooks/useFleetMonitor";
import type { CapacityForecast } from "@/api/fleet-monitor";

const BUDGET_THRESHOLD = 500;

// ── Preview fallback data ───────────────────────────────────────────────────

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const MOCK_COST: CapacityForecast = {
  metric: "cost_usd",
  currentValue: 312,
  currentDate: isoDaysFromNow(0),
  dataPointCount: 21,
  forecast: Array.from({ length: 14 }, (_, i) => {
    const predicted = 312 + i * 14;
    return {
      date: isoDaysFromNow(i + 1),
      predicted,
      confidenceLow: predicted * 0.9,
      confidenceHigh: predicted * 1.1,
    };
  }),
  saturation: {
    threshold: BUDGET_THRESHOLD,
    projectedBreachDate: isoDaysFromNow(14),
    daysRemaining: 14,
    confidence: 0.78,
    recommendation: "Spend trends toward the $500 budget in ~2 weeks — review model mix.",
  },
  scenarios: [
    {
      name: "2× traffic",
      description: "Demand doubles",
      adjustments: { cost_multiplier: 2 },
      projectedBreachDate: isoDaysFromNow(6),
      projectedTotal: 980,
    },
  ],
  historical: Array.from({ length: 21 }, (_, i) => ({
    date: isoDaysFromNow(i - 20),
    value: 180 + i * 6,
  })),
};

const MOCK_SESSIONS: CapacityForecast = {
  metric: "session_count",
  currentValue: 240,
  currentDate: isoDaysFromNow(0),
  dataPointCount: 21,
  forecast: Array.from({ length: 14 }, (_, i) => {
    const predicted = 240 + i * 8;
    return {
      date: isoDaysFromNow(i + 1),
      predicted,
      confidenceLow: predicted * 0.92,
      confidenceHigh: predicted * 1.08,
    };
  }),
  scenarios: [],
  historical: Array.from({ length: 21 }, (_, i) => ({
    date: isoDaysFromNow(i - 20),
    value: 150 + i * 4,
  })),
};

// ── Component ───────────────────────────────────────────────────────────────

export function CapacityPlanningPanel() {
  const { data, isLoading, isError } = useCapacityForecasts({
    budgetThreshold: BUDGET_THRESHOLD,
  });

  const liveCost = data?.cost ?? null;
  const liveSessions = data?.sessions ?? null;
  const isLive = liveCost !== null || liveSessions !== null;

  const costForecast = isLive ? liveCost ?? undefined : MOCK_COST;
  const sessionForecast = isLive ? liveSessions ?? undefined : MOCK_SESSIONS;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading capacity forecasts…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live / Preview status row */}
      <div className="flex items-center justify-between">
        <span
          className={
            isLive
              ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
          }
        >
          <span
            className={
              isLive
                ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                : "h-1.5 w-1.5 rounded-full bg-amber-500"
            }
          />
          {isLive ? "Live" : "Preview"}
        </span>
        {!isLive && (
          <span className="text-xs text-muted-foreground">
            Showing demo forecast — needs 3+ days of fleet data to go live
          </span>
        )}
      </div>

      {isError && !isLive && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load capacity forecasts. The fleet monitor may be offline.
        </div>
      )}

      <CapacityPlanning
        costForecast={costForecast}
        sessionForecast={sessionForecast}
        budgetThreshold={BUDGET_THRESHOLD}
      />
    </div>
  );
}
