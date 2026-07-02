/**
 * CostOptimizerWidget — Fleet cost optimization autopilot dashboard.
 *
 * Displays: monthly cost vs waste, savings over time, top findings,
 * and per-bot breakdown. Wired to the live FleetCostOptimizerService
 * (/fleet-monitor/cost-optimizer/*): the breakdown is computed live from
 * connected bots, findings appear after a fleet scan, and Approve executes
 * the optimization via gateway RPC. Falls back to demo data (Preview badge)
 * when fleet-monitor is offline or no bots are connected.
 */

import { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingDown,
  Zap,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { MetricCard } from "@/components/MetricCard";
import { fleetCardStyles, brandColors, severityColors } from "./design-tokens";
import {
  useFleetStatus,
  useCostBreakdown,
  useCostFindings,
  useCostSavings,
  useCostScan,
  useCostExecute,
  useCostDismiss,
} from "@/hooks/useFleetMonitor";
import type { CostOptimizationFinding } from "@/api/fleet-monitor";

// ---------------------------------------------------------------------------
// Display types (aligned with the server CostOptimizationFinding shape)
// ---------------------------------------------------------------------------

type DisplayFinding = CostOptimizationFinding;

interface CostBreakdownRow {
  botId: string;
  botName: string;
  dailyCost: number;
  wasteEstimate: number; // daily
  monthlyCost: number;
}

interface SavingsEntry {
  label: string;
  savings: number;
}

// ---------------------------------------------------------------------------
// Mock Data (server-aligned shapes — used as Preview fallback)
// ---------------------------------------------------------------------------

const MOCK_FINDINGS: DisplayFinding[] = [
  {
    id: "f1", type: "model_bloat", severity: "high", botId: "4", botName: "🐗 山豬",
    description: "92% of conversations are FAQ-level, but using Opus. Switching to Haiku would save ~62%.",
    evidence: { metric: "model_cost_efficiency", currentValue: 108, optimalValue: 41, wastePercentage: 62 },
    recommendation: { action: "Switch FAQ conversations to claude-haiku-3.5", automatable: true, rpcMethod: "agent.config.update", estimatedSavings: { tokensPerDay: 0, costPerDay: 2.2, costPerMonth: 67 }, risk: "low", reversible: true },
    status: "open", detectedAt: new Date().toISOString(),
  },
  {
    id: "f2", type: "session_sprawl", severity: "medium", botId: "1", botName: "🦞 小龍蝦",
    description: "47 of 52 sessions idle for over 60 minutes consuming cached tokens.",
    evidence: { metric: "idle_session_ratio", currentValue: 47, optimalValue: 0, wastePercentage: 89 },
    recommendation: { action: "Close 47 idle sessions", automatable: true, rpcMethod: "sessions.cleanup", estimatedSavings: { tokensPerDay: 564000, costPerDay: 1.1, costPerMonth: 34 }, risk: "low", reversible: false },
    status: "open", detectedAt: new Date().toISOString(),
  },
  {
    id: "f3", type: "cron_waste", severity: "medium", botId: "2", botName: "🐿️ 飛鼠",
    description: "Health-check cron has an 83% failure rate over the last 20 runs, wasting tokens.",
    evidence: { metric: "cron_failure_rate", currentValue: 83, optimalValue: 0, wastePercentage: 83 },
    recommendation: { action: "Investigate and fix cron job, or disable", automatable: false, estimatedSavings: { tokensPerDay: 6000, costPerDay: 0.7, costPerMonth: 22 }, risk: "low", reversible: true },
    status: "open", detectedAt: new Date().toISOString(),
  },
  {
    id: "f4", type: "prompt_duplication", severity: "low", botId: "all", botName: "🦚 孔雀 & 🐒 猴子",
    description: "80% overlap in SOUL.md across 2 bots. Extract shared instructions into a template.",
    evidence: { metric: "prompt_overlap_percentage", currentValue: 80, optimalValue: 0, wastePercentage: 80 },
    recommendation: { action: "Extract shared lines into a common prompt template", automatable: false, estimatedSavings: { tokensPerDay: 20000, costPerDay: 0.5, costPerMonth: 15 }, risk: "medium", reversible: true },
    status: "open", detectedAt: new Date().toISOString(),
  },
];

const MOCK_BREAKDOWN: CostBreakdownRow[] = [
  { botId: "1", botName: "🦞 小龍蝦", dailyCost: 9.80, wasteEstimate: 1.13, monthlyCost: 294 },
  { botId: "2", botName: "🐿️ 飛鼠", dailyCost: 11.20, wasteEstimate: 2.40, monthlyCost: 336 },
  { botId: "3", botName: "🦚 孔雀", dailyCost: 7.50, wasteEstimate: 0.90, monthlyCost: 225 },
  { botId: "4", botName: "🐗 山豬", dailyCost: 4.30, wasteEstimate: 2.67, monthlyCost: 129 },
  { botId: "5", botName: "🐒 猴子", dailyCost: 3.10, wasteEstimate: 0.40, monthlyCost: 93 },
];

const MOCK_SAVINGS: SavingsEntry[] = [
  { label: "W1", savings: 12 },
  { label: "W2", savings: 18 },
  { label: "W3", savings: 25 },
  { label: "W4", savings: 32 },
  { label: "W5", savings: 38 },
  { label: "W6", savings: 45 },
  { label: "W7", savings: 52 },
  { label: "W8", savings: 56 },
];

// ---------------------------------------------------------------------------
// Savings Sparkline
// ---------------------------------------------------------------------------

function SavingsChart({ data }: { data: SavingsEntry[] }) {
  if (data.length < 2) {
    return (
      <p className="text-xs text-muted-foreground py-8 text-center">
        No savings recorded yet. Approve an automatable finding to start tracking savings.
      </p>
    );
  }
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
            <text x={x + barW / 2} y={h - 6} textAnchor="middle" className="text-[8px] fill-muted-foreground">
              {d.label}
            </text>
            <text x={x + barW / 2} y={h - 24 - barH} textAnchor="middle" className="text-[8px] fill-foreground">
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

const TYPE_LABELS: Record<string, string> = {
  model_bloat: "Model Bloat",
  session_sprawl: "Session Sprawl",
  cron_waste: "Cron Waste",
  prompt_duplication: "Prompt Duplication",
  model_switching_delay: "Model Switching",
  unused_skill: "Unused Skill",
  redundant_memory: "Redundant Memory",
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-primary/10", text: "text-primary", label: "Pending" },
  approved: { bg: "bg-teal-50 dark:bg-teal-950/30", text: "text-teal-800 dark:text-teal-300", label: "Approved" },
  executing: { bg: "bg-primary/20", text: "text-primary", label: "Executing..." },
  executed: { bg: "bg-teal-100 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-400", label: "Done" },
  failed: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-600 dark:text-red-400", label: "Failed" },
  dismissed: { bg: "bg-muted", text: "text-muted-foreground", label: "Deferred" },
};

function FindingCard({ finding, onExecute, onDefer, executing, disabled }: {
  finding: DisplayFinding;
  onExecute: (id: string) => void;
  onDefer: (id: string) => void;
  executing: boolean;
  disabled: boolean;
}) {
  const sevStyle =
    finding.severity === "critical" || finding.severity === "high" ? severityColors.critical :
    finding.severity === "medium" ? severityColors.warning : severityColors.info;

  const s = STATUS_BADGE[finding.status] ?? STATUS_BADGE.open;

  return (
    <div className={cn("rounded-xl border-l-4 p-3", sevStyle.bg, sevStyle.border)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">{TYPE_LABELS[finding.type] ?? finding.type}</span>
            <span className="text-sm font-medium text-foreground">— {finding.botName}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", s.bg, s.text)}>
              {executing ? "Executing..." : s.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{finding.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span>Saves <strong className="text-teal-700 dark:text-teal-400">${finding.recommendation.estimatedSavings.costPerMonth}/mo</strong></span>
            <span>Risk: {finding.recommendation.risk}</span>
            {finding.recommendation.automatable && <span className="text-teal-700 dark:text-teal-400">⚡ Automatable</span>}
          </div>
        </div>
        {finding.status === "open" && (
          <div className="flex gap-1 ml-2 shrink-0">
            <button
              type="button"
              onClick={() => onExecute(finding.id)}
              disabled={disabled || executing || !finding.recommendation.automatable}
              title={finding.recommendation.automatable ? undefined : "This finding must be applied manually"}
              className="text-xs px-2 py-1 rounded-lg bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-800 dark:hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              {executing && <Loader2 className="h-3 w-3 animate-spin" />}
              Approve
            </button>
            <button
              type="button"
              onClick={() => onDefer(finding.id)}
              disabled={executing}
              className="text-xs px-2 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
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

function CostTable({ data }: { data: CostBreakdownRow[] }) {
  const totalCost = data.reduce((s, b) => s + b.dailyCost, 0);
  const totalWaste = data.reduce((s, b) => s + b.wasteEstimate, 0);
  const totalMonthly = data.reduce((s, b) => s + b.monthlyCost, 0);

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground py-6 text-center">No connected bots to analyze.</p>;
  }

  return (
    <table className="w-full text-xs" aria-label="Bot cost breakdown">
      <thead>
        <tr className="text-muted-foreground">
          <th className="text-left py-1 font-normal">Bot</th>
          <th className="text-right py-1 font-normal">Daily Cost</th>
          <th className="text-right py-1 font-normal">Waste</th>
          <th className="text-right py-1 font-normal">Monthly</th>
        </tr>
      </thead>
      <tbody>
        {data.map((b) => (
          <tr key={b.botId} className="hover:bg-muted/30">
            <td className="py-1.5 font-medium text-foreground">{b.botName}</td>
            <td className="py-1.5 text-right text-foreground">${b.dailyCost.toFixed(2)}</td>
            <td className="py-1.5 text-right text-red-500">${b.wasteEstimate.toFixed(2)}</td>
            <td className="py-1.5 text-right text-teal-700 dark:text-teal-400">${b.monthlyCost.toFixed(0)}</td>
          </tr>
        ))}
        <tr className="border-t border-border">
          <td className="py-1.5 font-medium text-foreground">Total</td>
          <td className="py-1.5 text-right font-medium text-foreground">${totalCost.toFixed(2)}</td>
          <td className="py-1.5 text-right font-medium text-red-500">${totalWaste.toFixed(2)}</td>
          <td className="py-1.5 text-right font-medium text-teal-700 dark:text-teal-400">${totalMonthly.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export function CostOptimizerWidget() {
  const { selectedCompanyId } = useCompany();
  const { data: fleet } = useFleetStatus();

  const breakdownQuery = useCostBreakdown(selectedCompanyId);
  const findingsQuery = useCostFindings(selectedCompanyId);
  const savingsQuery = useCostSavings(selectedCompanyId);
  const scanMutation = useCostScan(selectedCompanyId);
  const executeMutation = useCostExecute(selectedCompanyId);
  const dismissMutation = useCostDismiss(selectedCompanyId);

  // Optimistic-hide set for instant feedback while the dismiss request is in
  // flight; the server persists status="dismissed" so it stays hidden across
  // refreshes (dismissed findings are also filtered out of the list below).
  const [deferredIds, setDeferredIds] = useState<Set<string>>(new Set());

  // botId → "emoji name" lookup from live fleet status (server breakdown only
  // returns agentId as botName, so we enrich where possible).
  const botMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of fleet?.bots ?? []) m.set(b.botId, `${b.emoji} ${b.name}`.trim());
    return m;
  }, [fleet]);

  const liveBreakdownEntries = breakdownQuery.data?.bots ?? [];
  const liveFindings = findingsQuery.data ?? [];
  const isLive = !!selectedCompanyId && (liveBreakdownEntries.length > 0 || liveFindings.length > 0);

  // ── Breakdown rows ──
  const breakdown: CostBreakdownRow[] = useMemo(() => {
    if (!isLive) return MOCK_BREAKDOWN;
    return liveBreakdownEntries.map((e) => ({
      botId: e.botId,
      botName: botMap.get(e.botId) ?? e.botName,
      dailyCost: e.dailyCost,
      wasteEstimate: Math.round((e.estimatedWaste / 30) * 100) / 100,
      monthlyCost: e.monthlyCost,
    }));
  }, [isLive, liveBreakdownEntries, botMap]);

  // ── Findings (live: hide server-dismissed + optimistically-deferred) ──
  const findings: DisplayFinding[] = useMemo(() => {
    if (!isLive) return MOCK_FINDINGS;
    return liveFindings
      .filter((f) => f.status !== "dismissed" && !deferredIds.has(f.id))
      .map((f) => ({ ...f, botName: botMap.get(f.botId) ?? f.botName }));
  }, [isLive, liveFindings, deferredIds, botMap]);

  // ── Savings series (group executed-optimization records by day) ──
  const savings: SavingsEntry[] = useMemo(() => {
    if (!isLive) return MOCK_SAVINGS;
    const records = savingsQuery.data?.records ?? [];
    const byDay = new Map<string, number>();
    for (const r of records) {
      const day = r.savedAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + r.costSaved);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([day, total]) => ({
        label: day.slice(5).replace("-", "/"), // MM/DD
        savings: Math.round(total * 100) / 100,
      }));
  }, [isLive, savingsQuery.data]);

  const openFindings = findings.filter((f) => f.status === "open");

  const totalMonthlyCost = useMemo(() => {
    if (isLive) return breakdownQuery.data?.totals.monthlyCost ?? 0;
    return breakdown.reduce((s, b) => s + b.dailyCost, 0) * 30;
  }, [isLive, breakdownQuery.data, breakdown]);

  const totalWaste = useMemo(
    () => openFindings.reduce((s, f) => s + f.recommendation.estimatedSavings.costPerMonth, 0),
    [openFindings],
  );

  const totalSaved = useMemo(() => {
    if (isLive) return savingsQuery.data?.totalCostSaved ?? 0;
    return savings.reduce((s, e) => s + e.savings, 0);
  }, [isLive, savingsQuery.data, savings]);

  const handleExecute = (id: string) => executeMutation.mutate(id);
  const handleDefer = (id: string) => {
    // Optimistically hide for instant feedback, then persist server-side. Only
    // real (live) findings can be dismissed; MOCK/Preview ids have no server row.
    setDeferredIds((prev) => new Set(prev).add(id));
    if (isLive && selectedCompanyId) dismissMutation.mutate(id);
  };

  const initialLoading =
    !!selectedCompanyId &&
    breakdownQuery.isLoading &&
    findingsQuery.isLoading &&
    !breakdownQuery.data &&
    !findingsQuery.data;

  const loadError =
    !!selectedCompanyId && !isLive && (breakdownQuery.isError || findingsQuery.isError);

  const executeError = executeMutation.isError
    ? (executeMutation.error instanceof Error ? executeMutation.error.message : "Failed to execute optimization")
    : executeMutation.data && !executeMutation.data.ok
      ? executeMutation.data.error ?? "Optimization failed"
      : dismissMutation.isError
        ? (dismissMutation.error instanceof Error ? dismissMutation.error.message : "Failed to dismiss finding")
        : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Cost Optimization Autopilot</h2>
        {isLive ? (
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Live</span>
        ) : (
          <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
        )}
        <button
          type="button"
          onClick={() => scanMutation.mutate()}
          disabled={!selectedCompanyId || scanMutation.isPending}
          className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Inspect every connected bot for waste patterns"
        >
          {scanMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Scan Fleet
        </button>
      </div>

      {/* Status banners */}
      {!isLive && !loadError && (
        <div className="rounded-lg border border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-950/30 px-3 py-2 text-xs text-teal-800 dark:text-teal-300">
          Showing demo data. Connect bots and run <strong>Scan Fleet</strong> to surface real cost findings.
        </div>
      )}
      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load cost data. Fleet monitor may be offline — showing demo data.
        </div>
      )}
      {scanMutation.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Scan failed: {scanMutation.error instanceof Error ? scanMutation.error.message : "gateways may be unreachable"}
        </div>
      )}
      {executeError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {executeError}
        </div>
      )}

      {initialLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2 text-sm">Loading cost data…</span>
        </div>
      ) : (
        <>
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
                value={`$${totalSaved.toFixed(0)}`}
                label="Saved This Month"
                description={<span className="text-teal-700 dark:text-teal-400">↓ {Math.round((totalSaved / (totalMonthlyCost || 1)) * 100)}%</span>}
              />
            </div>
            <div className={fleetCardStyles.default + " p-3"}>
              <MetricCard
                icon={Zap}
                value={openFindings.length}
                label="Pending Actions"
              />
            </div>
          </div>

          {/* Savings Chart */}
          <div className={cn(fleetCardStyles.elevated, "p-4")}>
            <h3 className="text-sm font-medium text-foreground mb-3">Savings Over Time</h3>
            <SavingsChart data={savings} />
          </div>

          {/* Two-column: Findings + Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={cn(fleetCardStyles.default, "p-4")}>
              <h3 className="text-sm font-medium text-foreground mb-3">Top Findings</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {findings.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    No findings yet. Run <strong>Scan Fleet</strong> to detect cost waste.
                  </p>
                ) : (
                  findings.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      onExecute={handleExecute}
                      onDefer={handleDefer}
                      executing={executeMutation.isPending && executeMutation.variables === f.id}
                      disabled={!isLive}
                    />
                  ))
                )}
              </div>
            </div>

            <div className={cn(fleetCardStyles.default, "p-4")}>
              <h3 className="text-sm font-medium text-foreground mb-3">Fleet Cost Breakdown</h3>
              <CostTable data={breakdown} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
