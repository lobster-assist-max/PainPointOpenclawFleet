/**
 * CapacityPlanning — Predictive cost/capacity forecasting widget.
 *
 * Features:
 * - Cost forecast chart (actual + predicted + confidence interval + budget line)
 * - Saturation warning card (breach date + days remaining)
 * - Scenario simulator (what-if analysis)
 * - Session volume forecast
 */

import { useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Activity,
  Layers,
  Download,
  Settings,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ForecastPoint {
  date: string;
  predicted: number;
  confidenceLow: number;
  confidenceHigh: number;
}

interface SaturationProjection {
  threshold: number;
  projectedBreachDate: string | null;
  daysRemaining: number | null;
  confidence: number;
  recommendation: string;
}

interface Scenario {
  name: string;
  description: string;
  adjustments: Record<string, number>;
  projectedBreachDate: string | null;
  projectedTotal: number;
}

interface CapacityForecastData {
  metric: string;
  currentValue: number;
  currentDate: string;
  forecast: ForecastPoint[];
  saturation?: SaturationProjection;
  scenarios: Scenario[];
  dataPointCount: number;
  // Historical data for the chart
  historical: Array<{ date: string; value: number }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `$${value.toFixed(0)}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysFromNow(isoDate: string): number {
  const d = new Date(isoDate);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / 86400_000);
}

// ─── Mini chart (SVG) ────────────────────────────────────────────────────────

function ForecastChart({
  historical,
  forecast,
  budgetLine,
}: {
  historical: Array<{ date: string; value: number }>;
  forecast: ForecastPoint[];
  budgetLine?: number;
}) {
  const allValues = [
    ...historical.map((h) => h.value),
    ...forecast.map((f) => f.confidenceHigh),
  ];
  if (budgetLine) allValues.push(budgetLine);
  const maxVal = Math.max(...allValues) * 1.1;
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const totalPoints = historical.length + forecast.length;
  const w = 480;
  const h = 160;
  const padLeft = 45;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 25;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const xStep = chartW / Math.max(1, totalPoints - 1);

  function yPos(val: number): number {
    return padTop + chartH - ((val - minVal) / range) * chartH;
  }

  // Historical line
  const histPoints = historical.map(
    (pt, i) => `${padLeft + i * xStep},${yPos(pt.value)}`,
  );

  // Forecast line
  const fcStartIdx = historical.length;
  const fcPoints = forecast.map(
    (pt, i) => `${padLeft + (fcStartIdx + i) * xStep},${yPos(pt.predicted)}`,
  );

  // Confidence interval polygon
  const ciTop = forecast.map(
    (pt, i) =>
      `${padLeft + (fcStartIdx + i) * xStep},${yPos(pt.confidenceHigh)}`,
  );
  const ciBottom = forecast
    .map(
      (pt, i) =>
        `${padLeft + (fcStartIdx + i) * xStep},${yPos(pt.confidenceLow)}`,
    )
    .reverse();
  const ciPolygon = [...ciTop, ...ciBottom].join(" ");

  // Connection point
  const connectionX = padLeft + (historical.length - 1) * xStep;
  const connectionY = yPos(historical[historical.length - 1]?.value ?? 0);

  // Budget line Y
  const budgetY = budgetLine ? yPos(budgetLine) : null;

  // X-axis labels (every ~4th label)
  const allDates = [
    ...historical.map((h) => h.date),
    ...forecast.map((f) => f.date),
  ];
  const labelStep = Math.max(1, Math.floor(totalPoints / 6));

  return (
    <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1.0].map((pct) => {
        const y = padTop + chartH * (1 - pct);
        const val = minVal + range * pct;
        return (
          <g key={pct}>
            <line
              x1={padLeft}
              y1={y}
              x2={w - padRight}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="4"
            />
            <text
              x={padLeft - 5}
              y={y + 4}
              textAnchor="end"
              className="fill-gray-600"
              fontSize="10"
            >
              {formatCurrency(val)}
            </text>
          </g>
        );
      })}

      {/* Budget line */}
      {budgetY !== null && (
        <>
          <line
            x1={padLeft}
            y1={budgetY}
            x2={w - padRight}
            y2={budgetY}
            stroke="oklch(0.577 0.245 27.325)"
            strokeWidth="1"
            strokeDasharray="6 3"
          />
          <text
            x={w - padRight}
            y={budgetY - 4}
            textAnchor="end"
            className="fill-red-400"
            fontSize="10"
          >
            Budget
          </text>
        </>
      )}

      {/* Confidence interval */}
      {forecast.length > 0 && (
        <polygon points={ciPolygon} fill="oklch(0.758 0.095 68)" opacity="0.1" />
      )}

      {/* Historical line */}
      {histPoints.length > 1 && (
        <polyline
          points={histPoints.join(" ")}
          fill="none"
          stroke="oklch(0.758 0.095 68)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Forecast line (dashed) */}
      {fcPoints.length > 0 && (
        <polyline
          points={[`${connectionX},${connectionY}`, ...fcPoints].join(" ")}
          fill="none"
          stroke="oklch(0.758 0.095 68)"
          strokeWidth="2"
          strokeDasharray="6 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
      )}

      {/* "Now" marker */}
      <circle
        cx={connectionX}
        cy={connectionY}
        r="4"
        fill="oklch(0.758 0.095 68)"
      />
      <text
        x={connectionX}
        y={connectionY - 8}
        textAnchor="middle"
        className="fill-gray-300"
        fontSize="9"
      >
        Now
      </text>

      {/* X-axis date labels */}
      {allDates.map(
        (date, i) =>
          i % labelStep === 0 && (
            <text
              key={i}
              x={padLeft + i * xStep}
              y={h - 5}
              textAnchor="middle"
              className="fill-gray-600"
              fontSize="9"
            >
              {formatDate(date)}
            </text>
          ),
      )}
    </svg>
  );
}

// ─── Saturation Warning ──────────────────────────────────────────────────────

function SaturationWarning({
  saturation,
}: {
  saturation: SaturationProjection;
}) {
  if (!saturation.projectedBreachDate) {
    return (
      <div className="rounded-lg bg-green-500/10 p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <div className="text-sm text-green-400 font-medium">
            Within Budget
          </div>
          <div className="text-xs text-gray-400">
            No breach projected within forecast horizon.
          </div>
        </div>
      </div>
    );
  }

  const daysLeft = saturation.daysRemaining ?? 0;
  const isUrgent = daysLeft <= 3;
  const isWarning = daysLeft <= 7;
  const color = isUrgent
    ? "red"
    : isWarning
      ? "yellow"
      : "oklch(0.758_0.095_68)";
  const bgColor = isUrgent
    ? "bg-red-500/10"
    : isWarning
      ? "bg-yellow-500/10"
      : "bg-[oklch(0.758_0.095_68)]/10";
  const textColor = isUrgent
    ? "text-red-400"
    : isWarning
      ? "text-yellow-400"
      : "text-[oklch(0.758_0.095_68)]";

  return (
    <div className={`rounded-lg ${bgColor} p-3`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center shrink-0`}
        >
          <AlertTriangle className={`w-5 h-5 ${textColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${textColor}`}>
              Budget Breach: {formatDate(saturation.projectedBreachDate)}
            </span>
            <span className="text-xs text-gray-500">
              ({daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining)
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Confidence: {Math.round(saturation.confidence * 100)}%
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {saturation.recommendation}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Scenario Simulator ──────────────────────────────────────────────────────

function ScenarioTable({ scenarios }: { scenarios: Scenario[] }) {
  if (scenarios.length === 0) return null;

  const colors = ["text-blue-400", "text-green-400", "text-yellow-400", "text-red-400"];

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400 font-medium">
        Scenario Simulator
      </div>
      <div className="rounded-lg border border-white/10 overflow-hidden">
        {scenarios.map((s, i) => (
          <div
            key={s.name}
            className="flex items-center gap-3 px-3 py-2 border-b border-white/5 last:border-0"
          >
            <span className={`text-sm ${colors[i % colors.length]}`}>
              {["●", "●", "●", "●"][i % 4]}
            </span>
            <span className="flex-1 text-sm text-gray-200">{s.name}</span>
            <span className="text-xs text-gray-400">
              {s.projectedBreachDate
                ? `Breach ${formatDate(s.projectedBreachDate)}`
                : "No breach"}
            </span>
            <span className="text-sm text-gray-300 tabular-nums w-16 text-right">
              {formatCurrency(s.projectedTotal)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface CapacityPlanningProps {
  costForecast?: CapacityForecastData;
  sessionForecast?: CapacityForecastData;
  budgetThreshold?: number;
  onConfigureScenarios?: () => void;
  onSetBudget?: () => void;
  onExport?: () => void;
}

export function CapacityPlanning({
  costForecast,
  sessionForecast,
  budgetThreshold = 500,
  onConfigureScenarios,
  onSetBudget,
  onExport,
}: CapacityPlanningProps) {
  const [activeTab, setActiveTab] = useState<"cost" | "sessions">("cost");
  const activeForecast = activeTab === "cost" ? costForecast : sessionForecast;

  if (!costForecast && !sessionForecast) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-gray-500">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Capacity data not yet available.</p>
        <p className="text-xs mt-1">
          Forecasts will appear after 3+ days of historical data.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[oklch(0.758_0.095_68)]" />
          <h2 className="text-lg font-semibold text-gray-100">
            Capacity Planning
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("cost")}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs transition-colors ${
              activeTab === "cost"
                ? "bg-[oklch(0.758_0.095_68)]/20 text-[oklch(0.758_0.095_68)]"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <DollarSign className="w-3 h-3" /> Cost
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs transition-colors ${
              activeTab === "sessions"
                ? "bg-[oklch(0.758_0.095_68)]/20 text-[oklch(0.758_0.095_68)]"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <Activity className="w-3 h-3" /> Sessions
          </button>
        </div>
      </div>

      {/* Current status strip */}
      {activeForecast && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Current:</span>
            <span className="text-gray-100 font-medium tabular-nums">
              {activeTab === "cost"
                ? formatCurrency(activeForecast.currentValue)
                : `${activeForecast.currentValue} sessions/day`}
            </span>
          </div>
          {activeForecast.forecast.length > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Trend:</span>
                <span className="text-gray-300 text-xs">
                  {activeForecast.forecast[activeForecast.forecast.length - 1]
                    .predicted > activeForecast.currentValue
                    ? "+"
                    : ""}
                  {(
                    ((activeForecast.forecast[
                      activeForecast.forecast.length - 1
                    ].predicted -
                      activeForecast.currentValue) /
                      Math.max(1, activeForecast.currentValue)) *
                    100
                  ).toFixed(1)}
                  %/week
                </span>
              </div>
            </>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-gray-400">Data:</span>
            <span className="text-gray-500 text-xs">
              {activeForecast.dataPointCount} days
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      {activeForecast && (
        <div className="rounded-lg bg-black/20 p-2">
          <ForecastChart
            historical={activeForecast.historical}
            forecast={activeForecast.forecast}
            budgetLine={
              activeTab === "cost" ? budgetThreshold : undefined
            }
          />
        </div>
      )}

      {/* Saturation warning */}
      {activeForecast?.saturation && (
        <SaturationWarning saturation={activeForecast.saturation} />
      )}

      {/* Scenario simulator */}
      {activeForecast?.scenarios && activeForecast.scenarios.length > 0 && (
        <ScenarioTable scenarios={activeForecast.scenarios} />
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfigureScenarios}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" /> Configure Scenarios
        </button>
        <button
          onClick={onSetBudget}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" /> Set Budget
        </button>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20 transition-colors ml-auto"
        >
          <Download className="w-3.5 h-3.5" /> Export Forecast
        </button>
      </div>
    </div>
  );
}

export default CapacityPlanning;
