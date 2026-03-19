/**
 * Fleet Capacity Planning — Predictive forecasting with Holt-Winters
 * triple exponential smoothing.
 *
 * Capabilities:
 * - Time-series forecasting (cost, sessions, tokens) with 95% confidence intervals
 * - Budget saturation prediction ("when will we breach $X?")
 * - Scenario simulation ("what if we add 2 bots? what if sessions double?")
 * - Holt-Winters captures level + trend + seasonality (daily/weekly cycles)
 */

import { EventEmitter } from "events";
import { logger } from "../middleware/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ForecastMetric =
  | "token_usage"
  | "session_count"
  | "cost_usd"
  | "active_bots";

export interface ForecastPoint {
  date: string; // ISO date or datetime
  predicted: number;
  confidenceLow: number;
  confidenceHigh: number;
}

export interface SaturationProjection {
  threshold: number;
  projectedBreachDate: string | null; // null if never breaches
  daysRemaining: number | null;
  confidence: number;
  recommendation: string;
}

export interface Scenario {
  name: string;
  description: string;
  adjustments: Record<string, number>; // e.g., { "cost_multiplier": 2.0 }
  projectedBreachDate: string | null;
  projectedTotal: number;
}

export interface CapacityForecast {
  metric: ForecastMetric;
  currentValue: number;
  currentDate: string;
  forecast: ForecastPoint[];
  saturation?: SaturationProjection;
  scenarios: Scenario[];
  modelParams: HoltWintersParams;
  dataPointCount: number;
}

export interface HoltWintersParams {
  alpha: number; // level smoothing (0-1)
  beta: number; // trend smoothing (0-1)
  gamma: number; // seasonal smoothing (0-1)
  seasonLength: number; // 24 for hourly data (daily cycle), 7 for daily data (weekly cycle)
}

// ─── Holt-Winters Triple Exponential Smoothing ───────────────────────────────

const DEFAULT_PARAMS: HoltWintersParams = {
  alpha: 0.3,
  beta: 0.1,
  gamma: 0.2,
  seasonLength: 7, // Weekly seasonality for daily data
};

interface HoltWintersState {
  level: number;
  trend: number;
  seasonal: number[];
  residuals: number[];
}

/**
 * Fit Holt-Winters model to historical data and return the internal state.
 * Requires at least 2 full seasonal cycles of data.
 */
function fitHoltWinters(
  data: number[],
  params: HoltWintersParams,
): HoltWintersState {
  const { alpha, beta, gamma, seasonLength } = params;
  const n = data.length;

  // Initialize level: average of first season
  const firstSeason = data.slice(0, Math.min(seasonLength, n));
  let level = firstSeason.reduce((a, b) => a + b, 0) / firstSeason.length;

  // Initialize trend: average difference between first two seasons
  let trend = 0;
  if (n >= 2 * seasonLength) {
    const secondSeason = data.slice(seasonLength, 2 * seasonLength);
    const secondAvg =
      secondSeason.reduce((a, b) => a + b, 0) / secondSeason.length;
    const firstAvg =
      firstSeason.reduce((a, b) => a + b, 0) / firstSeason.length;
    trend = (secondAvg - firstAvg) / seasonLength;
  }

  // Initialize seasonal indices
  const seasonal = new Array(seasonLength).fill(0);
  if (n >= seasonLength) {
    for (let i = 0; i < seasonLength; i++) {
      seasonal[i] = data[i] - level;
    }
  }

  // Fit the model
  const residuals: number[] = [];

  for (let t = 0; t < n; t++) {
    const seasonIdx = t % seasonLength;
    const observation = data[t];

    // Predicted value for this timestep
    const predicted = level + trend + seasonal[seasonIdx];
    residuals.push(observation - predicted);

    // Update equations
    const prevLevel = level;
    level =
      alpha * (observation - seasonal[seasonIdx]) +
      (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[seasonIdx] =
      gamma * (observation - level) + (1 - gamma) * seasonal[seasonIdx];
  }

  return { level, trend, seasonal, residuals };
}

/**
 * Forecast future values using fitted Holt-Winters state.
 */
function forecastHoltWinters(
  state: HoltWintersState,
  params: HoltWintersParams,
  horizonSteps: number,
  startSeasonIdx: number,
): { predicted: number[]; confidence: Array<{ low: number; high: number }> } {
  const { seasonal, level, trend, residuals } = state;

  // Compute residual standard deviation for confidence intervals
  const residualMean =
    residuals.length > 0
      ? residuals.reduce((a, b) => a + b, 0) / residuals.length
      : 0;
  const residualStd =
    residuals.length > 1
      ? Math.sqrt(
          residuals.reduce((s, r) => s + (r - residualMean) ** 2, 0) /
            (residuals.length - 1),
        )
      : 0;

  const predicted: number[] = [];
  const confidence: Array<{ low: number; high: number }> = [];

  for (let h = 1; h <= horizonSteps; h++) {
    const seasonIdx =
      (startSeasonIdx + h) % params.seasonLength;
    const yHat = level + h * trend + seasonal[seasonIdx];

    // Confidence interval widens with horizon (sqrt of h)
    const z95 = 1.96;
    const margin = z95 * residualStd * Math.sqrt(h);

    predicted.push(Math.max(0, yHat));
    confidence.push({
      low: Math.max(0, yHat - margin),
      high: yHat + margin,
    });
  }

  return { predicted, confidence };
}

// ─── Capacity Planner ────────────────────────────────────────────────────────

let instance: CapacityPlanner | null = null;

export class CapacityPlanner extends EventEmitter {
  private historicalData = new Map<string, Map<ForecastMetric, number[]>>();
  // Key: "fleet" or botId, Value: metric → time series data (daily values)

  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  /** Start periodic forecast refresh (every hour) */
  start(): void {
    this.refreshInterval = setInterval(
      () => this.emit("refreshData"),
      3600_000,
    );
    logger.info("[CapacityPlanner] Started — refreshing forecasts every hour");
  }

  stop(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = null;
    logger.info("[CapacityPlanner] Stopped");
  }

  // ─── Data ingestion ──────────────────────────────────────────────────────

  /**
   * Push a daily data point for a given entity (fleet or individual bot).
   */
  pushDataPoint(
    entityId: string,
    metric: ForecastMetric,
    value: number,
  ): void {
    if (!this.historicalData.has(entityId)) {
      this.historicalData.set(entityId, new Map());
    }
    const entityMetrics = this.historicalData.get(entityId)!;
    if (!entityMetrics.has(metric)) {
      entityMetrics.set(metric, []);
    }
    entityMetrics.get(metric)!.push(value);

    // Keep max 90 days of daily data
    const series = entityMetrics.get(metric)!;
    if (series.length > 90) {
      series.splice(0, series.length - 90);
    }
  }

  /**
   * Bulk load historical data (e.g., from fleet_daily_summary table).
   */
  loadHistory(
    entityId: string,
    metric: ForecastMetric,
    values: number[],
  ): void {
    if (!this.historicalData.has(entityId)) {
      this.historicalData.set(entityId, new Map());
    }
    this.historicalData.get(entityId)!.set(metric, [...values]);
  }

  // ─── Forecasting ────────────────────────────────────────────────────────

  /**
   * Generate a capacity forecast for an entity and metric.
   */
  forecast(
    entityId: string,
    metric: ForecastMetric,
    options: {
      horizonDays?: number;
      budgetThreshold?: number;
      scenarios?: Array<{ name: string; description: string; multiplier: number }>;
      params?: Partial<HoltWintersParams>;
    } = {},
  ): CapacityForecast | null {
    const { horizonDays = 14, budgetThreshold, scenarios: scenarioInputs, params: customParams } = options;

    const entityMetrics = this.historicalData.get(entityId);
    if (!entityMetrics) return null;

    const series = entityMetrics.get(metric);
    if (!series || series.length < 3) return null;

    const params: HoltWintersParams = {
      ...DEFAULT_PARAMS,
      ...customParams,
    };

    // Need at least 2 full seasonal cycles for proper seasonality
    // If not enough data, use simple linear fallback
    const useHoltWinters = series.length >= params.seasonLength * 2;

    let forecastPoints: ForecastPoint[];
    const today = new Date();
    const currentValue = series[series.length - 1];

    if (useHoltWinters) {
      const state = fitHoltWinters(series, params);
      const startSeasonIdx = (series.length - 1) % params.seasonLength;
      const { predicted, confidence } = forecastHoltWinters(
        state,
        params,
        horizonDays,
        startSeasonIdx,
      );

      forecastPoints = predicted.map((val, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() + i + 1);
        return {
          date: date.toISOString().slice(0, 10),
          predicted: Math.round(val * 100) / 100,
          confidenceLow: Math.round(confidence[i].low * 100) / 100,
          confidenceHigh: Math.round(confidence[i].high * 100) / 100,
        };
      });
    } else {
      // Linear extrapolation fallback
      forecastPoints = this.linearForecast(series, horizonDays, today);
    }

    // Saturation projection
    let saturation: SaturationProjection | undefined;
    if (budgetThreshold !== undefined) {
      saturation = this.projectSaturation(
        metric,
        series,
        forecastPoints,
        budgetThreshold,
        today,
      );
    }

    // Scenarios
    const builtScenarios: Scenario[] = [];
    if (scenarioInputs) {
      for (const si of scenarioInputs) {
        const adjustedSeries = series.map((v) => v * si.multiplier);
        const adjustedForecast = useHoltWinters
          ? (() => {
              const state = fitHoltWinters(adjustedSeries, params);
              const startIdx =
                (adjustedSeries.length - 1) % params.seasonLength;
              const { predicted } = forecastHoltWinters(
                state,
                params,
                horizonDays,
                startIdx,
              );
              return predicted;
            })()
          : this.linearForecast(adjustedSeries, horizonDays, today).map(
              (p) => p.predicted,
            );

        const projectedTotal =
          adjustedSeries.reduce((a, b) => a + b, 0) +
          adjustedForecast.reduce((a, b) => a + b, 0);

        let breachDate: string | null = null;
        if (budgetThreshold) {
          let cumulative = adjustedSeries.reduce((a, b) => a + b, 0);
          for (let i = 0; i < adjustedForecast.length; i++) {
            const val = typeof adjustedForecast[i] === "number"
              ? adjustedForecast[i]
              : (adjustedForecast[i] as ForecastPoint).predicted;
            cumulative += val;
            if (cumulative >= budgetThreshold) {
              const date = new Date(today);
              date.setDate(date.getDate() + i + 1);
              breachDate = date.toISOString().slice(0, 10);
              break;
            }
          }
        }

        builtScenarios.push({
          name: si.name,
          description: si.description,
          adjustments: { multiplier: si.multiplier },
          projectedBreachDate: breachDate,
          projectedTotal: Math.round(projectedTotal * 100) / 100,
        });
      }
    }

    return {
      metric,
      currentValue,
      currentDate: today.toISOString().slice(0, 10),
      forecast: forecastPoints,
      saturation,
      scenarios: builtScenarios,
      modelParams: params,
      dataPointCount: series.length,
    };
  }

  // ─── Helper: Linear forecast fallback ────────────────────────────────────

  private linearForecast(
    series: number[],
    horizonDays: number,
    today: Date,
  ): ForecastPoint[] {
    const n = series.length;
    // Simple linear regression
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += series[i];
      sumXY += i * series[i];
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Residual std dev for CI
    const residuals = series.map((v, i) => v - (intercept + slope * i));
    const residualStd =
      residuals.length > 2
        ? Math.sqrt(
            residuals.reduce((s, r) => s + r * r, 0) / (residuals.length - 2),
          )
        : 0;

    const points: ForecastPoint[] = [];
    for (let d = 1; d <= horizonDays; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      const predicted = intercept + slope * (n + d - 1);
      const margin = 1.96 * residualStd * Math.sqrt(1 + 1 / n + (d * d) / sumX2);
      points.push({
        date: date.toISOString().slice(0, 10),
        predicted: Math.max(0, Math.round(predicted * 100) / 100),
        confidenceLow: Math.max(0, Math.round((predicted - margin) * 100) / 100),
        confidenceHigh: Math.round((predicted + margin) * 100) / 100,
      });
    }
    return points;
  }

  // ─── Helper: Saturation projection ───────────────────────────────────────

  private projectSaturation(
    metric: ForecastMetric,
    series: number[],
    forecastPoints: ForecastPoint[],
    threshold: number,
    today: Date,
  ): SaturationProjection {
    // For cost_usd: cumulative (month-to-date + forecast)
    // For others: point value exceeding threshold
    const isCumulative = metric === "cost_usd" || metric === "token_usage";

    if (isCumulative) {
      let cumulative = series.reduce((a, b) => a + b, 0);

      if (cumulative >= threshold) {
        return {
          threshold,
          projectedBreachDate: today.toISOString().slice(0, 10),
          daysRemaining: 0,
          confidence: 1.0,
          recommendation: `Already exceeded threshold ($${threshold}). Consider reducing model tier or bot count.`,
        };
      }

      for (let i = 0; i < forecastPoints.length; i++) {
        cumulative += forecastPoints[i].predicted;
        if (cumulative >= threshold) {
          const breachDate = forecastPoints[i].date;
          const daysRemaining = i + 1;

          // Confidence based on how far out the prediction is
          const confidence = Math.max(
            0.5,
            1 - (daysRemaining / forecastPoints.length) * 0.3,
          );

          const recommendation = this.generateSaturationRecommendation(
            metric,
            daysRemaining,
            threshold,
            cumulative,
          );

          return {
            threshold,
            projectedBreachDate: breachDate,
            daysRemaining,
            confidence: Math.round(confidence * 100) / 100,
            recommendation,
          };
        }
      }
    } else {
      // Point value threshold
      for (let i = 0; i < forecastPoints.length; i++) {
        if (forecastPoints[i].predicted >= threshold) {
          return {
            threshold,
            projectedBreachDate: forecastPoints[i].date,
            daysRemaining: i + 1,
            confidence: Math.max(0.5, 1 - (i / forecastPoints.length) * 0.3),
            recommendation: `${metric} projected to reach ${threshold} in ${i + 1} days. Consider scaling capacity.`,
          };
        }
      }
    }

    return {
      threshold,
      projectedBreachDate: null,
      daysRemaining: null,
      confidence: 0.9,
      recommendation: `No breach projected within forecast horizon. Current trajectory is within budget.`,
    };
  }

  private generateSaturationRecommendation(
    metric: ForecastMetric,
    daysRemaining: number,
    threshold: number,
    projectedTotal: number,
  ): string {
    if (metric === "cost_usd") {
      if (daysRemaining <= 3) {
        return `Budget breach in ${daysRemaining} day(s). Urgent: Consider downgrading high-cost bots to Sonnet or pausing non-critical cron jobs.`;
      }
      if (daysRemaining <= 7) {
        return `Budget breach projected in ${daysRemaining} days. Recommended: Review top-cost bots and optimize cache hit ratios.`;
      }
      return `Budget breach projected in ${daysRemaining} days ($${Math.round(projectedTotal)} vs $${threshold} budget). Monitor trends and consider proactive optimization.`;
    }

    return `${metric} projected to exceed ${threshold} in ${daysRemaining} days.`;
  }

  // ─── Query helpers ───────────────────────────────────────────────────────

  getHistoricalData(
    entityId: string,
    metric: ForecastMetric,
  ): number[] | null {
    return this.historicalData.get(entityId)?.get(metric) ?? null;
  }

  getAvailableEntities(): string[] {
    return Array.from(this.historicalData.keys());
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export function getCapacityPlanner(): CapacityPlanner {
  if (!instance) {
    instance = new CapacityPlanner();
  }
  return instance;
}

export function disposeCapacityPlanner(): void {
  if (instance) {
    instance.stop();
    instance.removeAllListeners();
    instance = null;
  }
}
