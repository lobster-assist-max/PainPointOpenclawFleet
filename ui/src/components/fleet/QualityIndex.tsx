/**
 * QualityIndex — Conversation Quality Index (CQI) dashboard widget.
 *
 * Displays per-bot and fleet-wide quality scores across 4 dimensions:
 * Effectiveness, Reliability, Experience, Engagement.
 * Includes trend indicators and fleet-average comparison.
 */

import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  Target,
  Shield,
  Zap,
  Heart,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type QualityGrade = "S" | "A" | "B" | "C" | "D" | "F";
type Trend = "improving" | "stable" | "declining";

interface QualityDimensions {
  effectiveness: number;
  reliability: number;
  experience: number;
  engagement: number;
}

interface BotQualityData {
  botId: string;
  botName: string;
  botEmoji: string;
  overall: number;
  grade: QualityGrade;
  trend: Trend;
  comparedToFleetAvg: number;
  dimensions: QualityDimensions;
  insight?: string;
}

interface FleetQualityData {
  fleetAvg: number;
  fleetGrade: QualityGrade;
  dimensions: QualityDimensions;
  bots: BotQualityData[];
  trend7d: number[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<QualityGrade, string> = {
  S: "text-purple-400",
  A: "text-green-400",
  B: "text-blue-400",
  C: "text-yellow-400",
  D: "text-orange-400",
  F: "text-red-400",
};

const GRADE_BG: Record<QualityGrade, string> = {
  S: "bg-purple-500/20",
  A: "bg-green-500/20",
  B: "bg-blue-500/20",
  C: "bg-yellow-500/20",
  D: "bg-orange-500/20",
  F: "bg-red-500/20",
};

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "improving")
    return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (trend === "declining")
    return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-gray-500" />;
}

function ProgressBar({
  value,
  max = 100,
  color = "bg-[oklch(0.758_0.095_68)]",
  height = "h-2",
}: {
  value: number;
  max?: number;
  color?: string;
  height?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`w-full ${height} rounded-full bg-white/10 overflow-hidden`}>
      <div
        className={`${height} rounded-full ${color} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = 24;
  const w = 80;
  const step = w / (values.length - 1);

  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke="oklch(0.758 0.095 68)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Dimension card ──────────────────────────────────────────────────────────

const DIMENSION_META: Record<
  keyof QualityDimensions,
  { label: string; icon: typeof Target; description: string }
> = {
  effectiveness: {
    label: "Effectiveness",
    icon: Target,
    description: "Task completion & conversation efficiency",
  },
  reliability: {
    label: "Reliability",
    icon: Shield,
    description: "Tool success rate & low escalation",
  },
  experience: {
    label: "Experience",
    icon: Zap,
    description: "Response speed & low repeated queries",
  },
  engagement: {
    label: "Engagement",
    icon: Heart,
    description: "User retention & low abandonment",
  },
};

function DimensionCard({
  dimension,
  value,
  detail,
}: {
  dimension: keyof QualityDimensions;
  value: number;
  detail?: string;
}) {
  const meta = DIMENSION_META[dimension];
  const Icon = meta.icon;
  const barColor =
    value >= 80
      ? "bg-green-400"
      : value >= 60
        ? "bg-[oklch(0.758_0.095_68)]"
        : value >= 40
          ? "bg-yellow-400"
          : "bg-red-400";

  return (
    <div className="rounded-lg bg-white/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-200 font-medium">{meta.label}</span>
        <span className="ml-auto text-sm font-bold tabular-nums text-gray-100">
          {value}
        </span>
      </div>
      <ProgressBar value={value} color={barColor} height="h-1.5" />
      <p className="text-xs text-gray-500">
        {detail ?? meta.description}
      </p>
    </div>
  );
}

// ─── Bot row ─────────────────────────────────────────────────────────────────

function BotQualityRow({ bot }: { bot: BotQualityData }) {
  const barColor =
    bot.grade === "S" || bot.grade === "A"
      ? "bg-green-400"
      : bot.grade === "B"
        ? "bg-blue-400"
        : bot.grade === "C"
          ? "bg-yellow-400"
          : "bg-red-400";

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-24 text-sm text-gray-200 truncate">
        {bot.botEmoji} {bot.botName}
      </span>
      <div className="flex-1">
        <ProgressBar value={bot.overall} color={barColor} height="h-2" />
      </div>
      <span
        className={`w-8 text-sm font-bold text-right ${GRADE_COLORS[bot.grade]}`}
      >
        {bot.overall}
      </span>
      <span
        className={`w-6 text-center text-xs font-bold px-1.5 py-0.5 rounded ${GRADE_BG[bot.grade]} ${GRADE_COLORS[bot.grade]}`}
      >
        {bot.grade}
      </span>
      <TrendIcon trend={bot.trend} />
      <span className="w-12 text-xs text-right tabular-nums text-gray-500">
        {bot.comparedToFleetAvg > 0 ? "+" : ""}
        {bot.comparedToFleetAvg.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface QualityIndexProps {
  data?: FleetQualityData;
  onViewReport?: () => void;
  onCompareBots?: () => void;
  onSetTargets?: () => void;
}

export function QualityIndex({
  data,
  onViewReport,
  onCompareBots,
  onSetTargets,
}: QualityIndexProps) {
  if (!data) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-gray-500">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Quality data not yet available.</p>
        <p className="text-xs mt-1">CQI will appear after bots process conversations.</p>
      </div>
    );
  }

  const overallTrend: Trend =
    data.trend7d.length >= 3
      ? data.trend7d[data.trend7d.length - 1] >
        data.trend7d[data.trend7d.length - 3] + 2
        ? "improving"
        : data.trend7d[data.trend7d.length - 1] <
            data.trend7d[data.trend7d.length - 3] - 2
          ? "declining"
          : "stable"
      : "stable";

  // Find the weakest dimension for insight
  const dims = Object.entries(data.dimensions) as Array<
    [keyof QualityDimensions, number]
  >;
  const weakest = dims.reduce((a, b) => (a[1] < b[1] ? a : b));
  const weakDimMeta = DIMENSION_META[weakest[0]];

  // Find the bot dragging CQI down the most
  const lowestBot = data.bots.reduce((a, b) =>
    a.overall < b.overall ? a : b,
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
      {/* Header + fleet score */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[oklch(0.758_0.095_68)]" />
          <h2 className="text-lg font-semibold text-gray-100">
            Conversation Quality Index
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <MiniSparkline values={data.trend7d} />
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-bold text-gray-100 tabular-nums">
                {data.fleetAvg}
              </span>
              <span
                className={`text-lg font-bold ${GRADE_COLORS[data.fleetGrade]}`}
              >
                /{data.fleetGrade}
              </span>
              <TrendIcon trend={overallTrend} />
            </div>
            <span className="text-xs text-gray-500">Fleet Average</span>
          </div>
        </div>
      </div>

      {/* Fleet overall bar */}
      <ProgressBar value={data.fleetAvg} height="h-2.5" />

      {/* Per-bot breakdown */}
      <div className="space-y-1">
        <div className="text-xs text-gray-400 font-medium mb-1">
          Per-Bot Breakdown
        </div>
        {data.bots
          .sort((a, b) => b.overall - a.overall)
          .map((bot) => (
            <BotQualityRow key={bot.botId} bot={bot} />
          ))}
      </div>

      {/* Dimension analysis */}
      <div className="grid grid-cols-2 gap-2">
        {dims.map(([dim, val]) => (
          <DimensionCard key={dim} dimension={dim} value={val} />
        ))}
      </div>

      {/* Insight */}
      <div className="rounded-lg bg-[oklch(0.758_0.095_68)]/10 p-3 flex gap-2">
        <Lightbulb className="w-4 h-4 text-[oklch(0.758_0.095_68)] shrink-0 mt-0.5" />
        <p className="text-sm text-gray-300">
          <span className="text-[oklch(0.758_0.095_68)] font-medium">
            Insight:
          </span>{" "}
          {weakDimMeta.label} score ({weakest[1]}) is the fleet's weakest
          dimension. {lowestBot.botEmoji} {lowestBot.botName} (CQI{" "}
          {lowestBot.overall}) is dragging the average down.
          {lowestBot.insight && ` ${lowestBot.insight}`}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onViewReport}
          className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20 transition-colors"
        >
          View Full Report
        </button>
        <button
          onClick={onCompareBots}
          className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20 transition-colors"
        >
          Compare Bots
        </button>
        <button
          onClick={onSetTargets}
          className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-sm hover:bg-white/20 transition-colors"
        >
          Set Quality Targets
        </button>
      </div>
    </div>
  );
}

export default QualityIndex;
