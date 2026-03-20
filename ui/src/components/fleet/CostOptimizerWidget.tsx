/**
 * CostOptimizerWidget — Fleet cost optimization autopilot dashboard.
 *
 * Displays: monthly cost vs waste, savings over time, top findings,
 * cost-vs-quality scatter, and per-bot breakdown.
 */

import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  TrendingDown,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { MetricCard } from "@/components/MetricCard";
import { fleetCardStyles, brandColors, severityColors } from "./design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OptimizationFinding {
  id: string;
  type: string;
  severity: "high" | "medium" | "low";
  botId: string;
  botName: string;
  description: string;
  evidence: { metric: string; currentValue: number; optimalValue: number; wastePercentage: number };
  recommendation: {
    action: string;
    automatable: boolean;
    estimatedSavings: { costPerMonth: number };
    risk: "none" | "low" | "medium";
  };
  status: "detected" | "approved" | "executing" | "completed" | "rejected" | "deferred";
}

interface CostBreakdown {
  botId: string;
  botName: string;
  dailyCost: number;
  wasteEstimate: number;
  costPerResolution: number;
}

interface SavingsEntry {
  week: string;
  savings: number;
  type: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_FINDINGS: OptimizationFinding[] = [
  {
    id: "f1", type: "model_bloat", severity: "high", botId: "4", botName: "🐗 山豬",
    description: "92% of conversations are FAQ-level, but using Opus",
    evidence: { metric: "conversation_complexity", currentValue: 0.92, optimalValue: 0.3, wastePercentage: 62 },
    recommendation: { action: "Switch FAQ conversations to Haiku", automatable: true, estimatedSavings: { costPerMonth: 67 }, risk: "low" },
    status: "detected",
  },
  {
    id: "f2", type: "session_sprawl", severity: "medium", botId: "1", botName: "🦞 小龍蝦",
    description: "47 idle sessions (>24h no activity) consuming cached tokens",
    evidence: { metric: "idle_sessions", currentValue: 47, optimalValue: 5, wastePercentage: 89 },
    recommendation: { action: "Auto-cleanup idle sessions", automatable: true, estimatedSavings: { costPerMonth: 34 }, risk: "none" },
    status: "detected",
  },
  {
    id: "f3", type: "cron_waste", severity: "medium", botId: "2", botName: "🐿️ 飛鼠",
    description: "Health check every 5min, but 0 conversations between 10pm-8am",
    evidence: { metric: "off_peak_cron_runs", currentValue: 120, optimalValue: 20, wastePercentage: 83 },
    recommendation: { action: "Dynamic schedule: 5min peak / 30min off-peak", automatable: true, estimatedSavings: { costPerMonth: 22 }, risk: "none" },
    status: "detected",
  },
  {
    id: "f4", type: "prompt_duplication", severity: "low", botId: "all", botName: "All Bots",
    description: "80% overlap in SOUL.md across 5 bots",
    evidence: { metric: "prompt_overlap_pct", currentValue: 80, optimalValue: 20, wastePercentage: 60 },
    recommendation: { action: "Extract shared base prompt", automatable: false, estimatedSavings: { costPerMonth: 15 }, risk: "medium" },
    status: "deferred",
  },
];

const MOCK_BREAKDOWN: CostBreakdown[] = [
  { botId: "1", botName: "🦞 小龍蝦", dailyCost: 9.80, wasteEstimate: 1.13, costPerResolution: 0.12 },
  { botId: "2", botName: "🐿️ 飛鼠", dailyCost: 11.20, wasteEstimate: 2.40, costPerResolution: 0.18 },
  { botId: "3", botName: "🦚 孔雀", dailyCost: 7.50, wasteEstimate: 0.90, costPerResolution: 0.24 },
  { botId: "4", botName: "🐗 山豬", dailyCost: 4.30, wasteEstimate: 2.67, costPerResolution: 0.09 },
  { botId: "5", botName: "🐒 猴子", dailyCost: 3.10, wasteEstimate: 0.40, costPerResolution: 0.15 },
];

const MOCK_SAVINGS: SavingsEntry[] = [
  { week: "W1", savings: 12, type: "model_downsize" },
  { week: "W2", savings: 18, type: "session_cleanup" },
  { week: "W3", savings: 25, type: "model_downsize" },
  { week: "W4", savings: 32, type: "cron_scheduling" },
  { week: "W5", savings: 38, type: "model_downsize" },
  { week: "W6", savings: 45, type: "session_cleanup" },
  { week: "W7", savings: 52, type: "model_downsize" },
  { week: "W8", savings: 56, type: "cron_scheduling" },
];

// ---------------------------------------------------------------------------
// Savings Sparkline
// ---------------------------------------------------------------------------

function SavingsChart({ data }: { data: SavingsEntry[] }) {
  if (data.length < 2) return null;
  const maxVal = Math.max(...data.map((d) => d.savings), 1);
  const w = 400;
  const h = 100;
  const barW = (w - 40) / data.length - 4;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
      {data.map((d, i) => {
        const x = 20 + i * ((w - 40) / data.length);
        const barH = (d.savings / maxVal) * (h - 30);
        return (
          <g key={i}>
            <rect
              x={x}
              y={h - 20 - barH}
              width={barW}
              height={barH}
              rx={4}
              fill={brandColors.primary}
              opacity={0.7 + (i / data.length) * 0.3}
            />
            <text x={x + barW / 2} y={h - 6} textAnchor="middle" className="text-[8px] fill-[#948F8C]">
              {d.week}
            </text>
            <text x={x + barW / 2} y={h - 24 - barH} textAnchor="middle" className="text-[8px] fill-[#2C2420]">
              ${d.savings}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Finding Card
// ---------------------------------------------------------------------------

function FindingCard({ finding, onExecute, onDefer }: {
  finding: OptimizationFinding;
  onExecute: (id: string) => void;
  onDefer: (id: string) => void;
}) {
  const typeLabels: Record<string, string> = {
    model_bloat: "Model Bloat",
    session_sprawl: "Session Sprawl",
    cron_waste: "Cron Waste",
    prompt_duplication: "Prompt Duplication",
    model_switching_delay: "Model Switching",
    unused_skill: "Unused Skill",
  };

  const sevStyle =
    finding.severity === "high" ? severityColors.critical :
    finding.severity === "medium" ? severityColors.warning : severityColors.info;

  const statusBadge: Record<string, { bg: string; text: string; label: string }> = {
    detected: { bg: "bg-[#D4A373]/10", text: "text-[#9A7B5B]", label: "Pending" },
    approved: { bg: "bg-[#E0F2F1]", text: "text-[#264653]", label: "Approved" },
    executing: { bg: "bg-[#D4A373]/20", text: "text-[#9A7B5B]", label: "Executing..." },
    completed: { bg: "bg-[#2A9D8F]/10", text: "text-[#2A9D8F]", label: "Done" },
    rejected: { bg: "bg-red-50", text: "text-red-600", label: "Rejected" },
    deferred: { bg: "bg-[#E8E4DF]", text: "text-[#948F8C]", label: "Deferred" },
  };

  const s = statusBadge[finding.status] ?? statusBadge.detected;

  return (
    <div className={cn("rounded-xl border-l-4 p-3", sevStyle.bg, sevStyle.border)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-[#948F8C]">{typeLabels[finding.type] ?? finding.type}</span>
            <span className="text-sm font-medium text-[#2C2420]">— {finding.botName}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", s.bg, s.text)}>
              {s.label}
            </span>
          </div>
          <p className="text-xs text-[#948F8C] mt-1">{finding.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[#948F8C]">
            <span>Saves <strong className="text-[#2A9D8F]">${finding.recommendation.estimatedSavings.costPerMonth}/mo</strong></span>
            <span>Risk: {finding.recommendation.risk}</span>
            {finding.recommendation.automatable && <span className="text-[#2A9D8F]">⚡ Automatable</span>}
          </div>
        </div>
        {finding.status === "detected" && (
          <div className="flex gap-1 ml-2 shrink-0">
            <button
              onClick={() => onExecute(finding.id)}
              className="text-xs px-2 py-1 rounded-lg bg-[#2A9D8F] text-white hover:bg-[#264653] transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => onDefer(finding.id)}
              className="text-xs px-2 py-1 rounded-lg bg-[#E8E4DF] text-[#948F8C] hover:bg-[#DCD1C7] transition-colors"
            >
              Defer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost Breakdown Table
// ---------------------------------------------------------------------------

function CostTable({ data }: { data: CostBreakdown[] }) {
  const totalCost = data.reduce((s, b) => s + b.dailyCost, 0);
  const totalWaste = data.reduce((s, b) => s + b.wasteEstimate, 0);

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[#948F8C]">
          <th className="text-left py-1 font-normal">Bot</th>
          <th className="text-right py-1 font-normal">Daily Cost</th>
          <th className="text-right py-1 font-normal">Waste</th>
          <th className="text-right py-1 font-normal">$/Resolution</th>
        </tr>
      </thead>
      <tbody>
        {data.map((b) => (
          <tr key={b.botId} className="hover:bg-[#F5F0EB]/50">
            <td className="py-1.5 font-medium text-[#2C2420]">{b.botName}</td>
            <td className="py-1.5 text-right text-[#2C2420]">${b.dailyCost.toFixed(2)}</td>
            <td className="py-1.5 text-right text-red-500">${b.wasteEstimate.toFixed(2)}</td>
            <td className="py-1.5 text-right text-[#2A9D8F]">${b.costPerResolution.toFixed(2)}</td>
          </tr>
        ))}
        <tr className="border-t border-[#E0E0E0]">
          <td className="py-1.5 font-medium text-[#2C2420]">Total</td>
          <td className="py-1.5 text-right font-medium text-[#2C2420]">${totalCost.toFixed(2)}</td>
          <td className="py-1.5 text-right font-medium text-red-500">${totalWaste.toFixed(2)}</td>
          <td className="py-1.5 text-right text-[#948F8C]">—</td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export function CostOptimizerWidget() {
  const company = useCompany();
  const [findings, setFindings] = useState<OptimizationFinding[]>(MOCK_FINDINGS);
  const [breakdown, setBreakdown] = useState<CostBreakdown[]>(MOCK_BREAKDOWN);
  const [savings, setSavings] = useState<SavingsEntry[]>(MOCK_SAVINGS);

  const totalMonthlyCost = useMemo(() => breakdown.reduce((s, b) => s + b.dailyCost, 0) * 30, [breakdown]);
  const totalWaste = useMemo(() => findings.filter((f) => f.status === "detected").reduce((s, f) => s + f.recommendation.estimatedSavings.costPerMonth, 0), [findings]);
  const totalSaved = useMemo(() => savings.reduce((s, e) => s + e.savings, 0), [savings]);

  const handleExecute = (id: string) => {
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, status: "completed" as const } : f)));
  };
  const handleDefer = (id: string) => {
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, status: "deferred" as const } : f)));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-[#D4A373]" />
        <h2 className="text-lg font-semibold text-[#2C2420]">Cost Optimization Autopilot</h2>
        <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard icon={DollarSign} value={`$${totalMonthlyCost.toFixed(0)}`} label="Monthly Cost" />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={AlertTriangle}
            value={`$${totalWaste.toFixed(0)}`}
            label="Waste Detected"
            description={<span className="text-red-500">{Math.round((totalWaste / (totalMonthlyCost || 1)) * 100)}% of total</span>}
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={TrendingDown}
            value={`$${totalSaved}`}
            label="Saved This Month"
            description={<span className="text-[#2A9D8F]">↓ {Math.round((totalSaved / (totalMonthlyCost || 1)) * 100)}%</span>}
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={Zap}
            value={findings.filter((f) => f.status === "detected").length}
            label="Pending Actions"
          />
        </div>
      </div>

      {/* Savings Chart */}
      <div className={cn(fleetCardStyles.elevated, "p-4")}>
        <h3 className="text-sm font-medium text-[#2C2420] mb-3">Savings Over Time</h3>
        <SavingsChart data={savings} />
      </div>

      {/* Two-column: Findings + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cn(fleetCardStyles.default, "p-4")}>
          <h3 className="text-sm font-medium text-[#2C2420] mb-3">Top Findings</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} onExecute={handleExecute} onDefer={handleDefer} />
            ))}
          </div>
        </div>

        <div className={cn(fleetCardStyles.default, "p-4")}>
          <h3 className="text-sm font-medium text-[#2C2420] mb-3">Fleet Cost Breakdown</h3>
          <CostTable data={breakdown} />
        </div>
      </div>
    </div>
  );
}
