/**
 * ConversationAnalyticsWidget — Fleet conversation quality analysis.
 *
 * Displays: satisfaction trend, topic heatmap, knowledge gaps,
 * resolution funnel, cost-per-resolution, and cross-bot inconsistencies.
 *
 * Uses Pain Point brand colors + Pixel Art styling.
 */

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Lightbulb,
  Filter,
  BarChart3,
  Target,
  Zap,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { MetricCard } from "@/components/MetricCard";
import { fleetCardStyles, fleetInfoStyles, severityColors, brandColors } from "./design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicCluster {
  label: string;
  category: string;
  conversationCount: number;
  avgSatisfaction: number;
  avgResolutionRate: number;
  avgCostPerResolution: number;
  trend: "growing" | "stable" | "declining";
  topBots: Array<{ botId: string; botName: string; count: number; avgSatisfaction: number }>;
}

interface KnowledgeGap {
  id: string;
  topic: string;
  frequency: number;
  affectedBots: string[];
  sampleQuestions: string[];
  priority: "critical" | "high" | "medium" | "low";
  estimatedImpact: {
    conversationsAffected: number;
    satisfactionLift: number;
    costSavings: number;
  };
}

interface SatisfactionPoint {
  timestamp: string;
  avgSatisfaction: number;
  conversationCount: number;
}

interface ResolutionFunnel {
  total: number;
  resolved: number;
  partiallyResolved: number;
  escalated: number;
  abandoned: number;
  avgTurnsToResolve: number;
  avgCostPerResolution: number;
}

interface Inconsistency {
  topic: string;
  conversations: Array<{
    botId: string;
    botName: string;
    response: string;
    satisfaction: number;
  }>;
  inconsistencyType: "different_answer" | "different_tone" | "different_outcome";
  recommendedStandardResponse?: string;
}

interface ConversationAnalyticsData {
  satisfactionTrend: SatisfactionPoint[];
  topicClusters: TopicCluster[];
  knowledgeGaps: KnowledgeGap[];
  resolutionFunnel: ResolutionFunnel;
  inconsistencies: Inconsistency[];
  totalConversations: number;
  avgSatisfaction: number;
}

// ---------------------------------------------------------------------------
// Mock data for initial render (replaced by API data when available)
// ---------------------------------------------------------------------------

const MOCK_DATA: ConversationAnalyticsData = {
  totalConversations: 2847,
  avgSatisfaction: 78,
  satisfactionTrend: [
    { timestamp: "Mon", avgSatisfaction: 76, conversationCount: 412 },
    { timestamp: "Tue", avgSatisfaction: 82, conversationCount: 387 },
    { timestamp: "Wed", avgSatisfaction: 79, conversationCount: 445 },
    { timestamp: "Thu", avgSatisfaction: 85, conversationCount: 398 },
    { timestamp: "Fri", avgSatisfaction: 74, conversationCount: 421 },
    { timestamp: "Sat", avgSatisfaction: 80, conversationCount: 389 },
    { timestamp: "Sun", avgSatisfaction: 73, conversationCount: 395 },
  ],
  topicClusters: [
    { label: "Billing", category: "support", conversationCount: 312, avgSatisfaction: 72, avgResolutionRate: 0.68, avgCostPerResolution: 0.18, trend: "growing", topBots: [{ botId: "1", botName: "🦞 小龍蝦", count: 142, avgSatisfaction: 84 }, { botId: "3", botName: "🦚 孔雀", count: 98, avgSatisfaction: 65 }] },
    { label: "Tech Support", category: "support", conversationCount: 487, avgSatisfaction: 81, avgResolutionRate: 0.78, avgCostPerResolution: 0.22, trend: "stable", topBots: [{ botId: "2", botName: "🐿️ 飛鼠", count: 201, avgSatisfaction: 88 }, { botId: "3", botName: "🦚 孔雀", count: 156, avgSatisfaction: 76 }] },
    { label: "Product Info", category: "sales", conversationCount: 623, avgSatisfaction: 85, avgResolutionRate: 0.82, avgCostPerResolution: 0.12, trend: "growing", topBots: [{ botId: "5", botName: "🐒 猴子", count: 220, avgSatisfaction: 89 }, { botId: "1", botName: "🦞 小龍蝦", count: 180, avgSatisfaction: 83 }] },
    { label: "Complaints", category: "support", conversationCount: 198, avgSatisfaction: 58, avgResolutionRate: 0.52, avgCostPerResolution: 0.32, trend: "declining", topBots: [{ botId: "3", botName: "🦚 孔雀", count: 87, avgSatisfaction: 55 }, { botId: "4", botName: "🐗 山豬", count: 62, avgSatisfaction: 61 }] },
    { label: "Scheduling", category: "operations", conversationCount: 156, avgSatisfaction: 88, avgResolutionRate: 0.91, avgCostPerResolution: 0.09, trend: "stable", topBots: [{ botId: "4", botName: "🐗 山豬", count: 89, avgSatisfaction: 91 }, { botId: "2", botName: "🐿️ 飛鼠", count: 45, avgSatisfaction: 84 }] },
  ],
  knowledgeGaps: [
    { id: "g1", topic: "退款政策細節", frequency: 47, affectedBots: ["🦞", "🐿️", "🦚"], sampleQuestions: ["2024年之後購買的可以退嗎？", "退款要幾天？"], priority: "critical", estimatedImpact: { conversationsAffected: 312, satisfactionLift: 15, costSavings: 28 } },
    { id: "g2", topic: "API rate limit 說明", frequency: 31, affectedBots: ["🐿️", "🐗"], sampleQuestions: ["API 一分鐘可以打幾次？", "被 rate limit 怎麼辦？"], priority: "high", estimatedImpact: { conversationsAffected: 187, satisfactionLift: 10, costSavings: 15 } },
    { id: "g3", topic: "多語言支援", frequency: 23, affectedBots: ["🦚", "🐒"], sampleQuestions: ["有支援日文嗎？", "可以用英文對話嗎？"], priority: "high", estimatedImpact: { conversationsAffected: 134, satisfactionLift: 8, costSavings: 10 } },
    { id: "g4", topic: "Enterprise 方案差異", frequency: 18, affectedBots: ["🦞"], sampleQuestions: ["Enterprise 跟 Pro 差在哪？"], priority: "medium", estimatedImpact: { conversationsAffected: 89, satisfactionLift: 5, costSavings: 6 } },
    { id: "g5", topic: "整合第三方 CRM", frequency: 12, affectedBots: ["🐗", "🐒"], sampleQuestions: ["可以跟 Salesforce 整合嗎？"], priority: "medium", estimatedImpact: { conversationsAffected: 56, satisfactionLift: 4, costSavings: 4 } },
  ],
  resolutionFunnel: {
    total: 2847,
    resolved: 1995,
    partiallyResolved: 412,
    escalated: 298,
    abandoned: 142,
    avgTurnsToResolve: 4.2,
    avgCostPerResolution: 0.15,
  },
  inconsistencies: [
    {
      topic: "退款流程",
      conversations: [
        { botId: "1", botName: "🦞 小龍蝦", response: "退款需要 3-5 個工作天", satisfaction: 82 },
        { botId: "2", botName: "🐿️ 飛鼠", response: "退款約 7 天處理", satisfaction: 68 },
      ],
      inconsistencyType: "different_answer",
      recommendedStandardResponse: "退款處理時間為 3-5 個工作天",
    },
  ],
};

// ---------------------------------------------------------------------------
// Satisfaction Sparkline (SVG mini-chart)
// ---------------------------------------------------------------------------

function SatisfactionChart({ data }: { data: SatisfactionPoint[] }) {
  if (data.length < 2) return null;
  const maxVal = Math.max(...data.map((d) => d.avgSatisfaction), 100);
  const minVal = Math.min(...data.map((d) => d.avgSatisfaction), 0);
  const w = 400;
  const h = 120;
  const padding = 24;

  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (w - padding * 2);
      const y = padding + ((maxVal - d.avgSatisfaction) / (maxVal - minVal || 1)) * (h - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `${padding},${h - padding} ${points} ${w - padding},${h - padding}`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
        {/* Area fill */}
        <polygon points={areaPoints} fill={`${brandColors.primary}15`} />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={brandColors.primary}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Data points */}
        {data.map((d, i) => {
          const x = padding + (i / (data.length - 1)) * (w - padding * 2);
          const y = padding + ((maxVal - d.avgSatisfaction) / (maxVal - minVal || 1)) * (h - padding * 2);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill={brandColors.background} stroke={brandColors.primary} strokeWidth="2" />
              <text x={x} y={h - 4} textAnchor="middle" className="text-[9px] fill-[#948F8C]">
                {d.timestamp}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topic Heatmap Row
// ---------------------------------------------------------------------------

function TopicRow({ topic }: { topic: TopicCluster }) {
  const satColor =
    topic.avgSatisfaction >= 80
      ? "bg-[#2A9D8F]"
      : topic.avgSatisfaction >= 60
        ? "bg-[#D4A373]"
        : "bg-red-400";

  const trendIcon =
    topic.trend === "growing" ? (
      <TrendingUp className="h-3 w-3 text-[#2A9D8F]" />
    ) : topic.trend === "declining" ? (
      <TrendingDown className="h-3 w-3 text-red-400" />
    ) : (
      <Minus className="h-3 w-3 text-[#948F8C]" />
    );

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#F5F0EB]/50 transition-colors">
      <div className="w-28 truncate text-sm font-medium text-[#2C2420]">{topic.label}</div>
      <div className="flex-1">
        <div className="flex items-center gap-1">
          <div className={cn("h-2 rounded-full", satColor)} style={{ width: `${topic.avgSatisfaction}%` }} />
          <span className="text-xs text-[#948F8C] ml-1">{topic.avgSatisfaction}</span>
        </div>
      </div>
      <div className="text-xs text-[#948F8C] w-16 text-right">{topic.conversationCount} convos</div>
      <div className="w-6 flex justify-center">{trendIcon}</div>
      <div className="flex -space-x-1">
        {topic.topBots.slice(0, 3).map((b) => (
          <span key={b.botId} className="text-sm" title={b.botName}>
            {b.botName.split(" ")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Knowledge Gap Card
// ---------------------------------------------------------------------------

function GapCard({ gap, onGenerateTraining }: { gap: KnowledgeGap; onGenerateTraining: (id: string) => void }) {
  const priorityStyles: Record<string, string> = {
    critical: "border-red-500 bg-red-50",
    high: "border-[#D4A373] bg-[#D4A373]/10",
    medium: "border-[#2A9D8F] bg-[#E0F2F1]",
    low: "border-[#E0E0E0] bg-[#FAF9F6]",
  };

  const priorityLabel: Record<string, { text: string; color: string }> = {
    critical: { text: "Critical", color: "text-red-600" },
    high: { text: "High", color: "text-[#9A7B5B]" },
    medium: { text: "Medium", color: "text-[#264653]" },
    low: { text: "Low", color: "text-[#948F8C]" },
  };

  const p = priorityLabel[gap.priority] ?? priorityLabel.medium;

  return (
    <div className={cn("rounded-xl border-l-4 p-3", priorityStyles[gap.priority])}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#2C2420]">{gap.topic}</span>
            <span className={cn("text-xs font-medium", p.color)}>{p.text}</span>
          </div>
          <div className="text-xs text-[#948F8C] mt-1">
            {gap.frequency} times — affects {gap.affectedBots.join(" ")}
          </div>
          {gap.sampleQuestions.length > 0 && (
            <div className="mt-1.5 text-xs text-[#948F8C] italic truncate">
              "{gap.sampleQuestions[0]}"
            </div>
          )}
        </div>
        <button
          onClick={() => onGenerateTraining(gap.id)}
          className="shrink-0 ml-2 text-xs px-2 py-1 rounded-lg bg-[#D4A373]/10 text-[#9A7B5B] hover:bg-[#D4A373]/20 transition-colors"
          title="Auto-generate training data"
        >
          <Zap className="h-3 w-3 inline mr-1" />
          Train
        </button>
      </div>
      {gap.estimatedImpact && (
        <div className="flex gap-3 mt-2 text-[10px] text-[#948F8C]">
          <span>↑ CSAT +{gap.estimatedImpact.satisfactionLift}%</span>
          <span>💰 Save ${gap.estimatedImpact.costSavings}/mo</span>
          <span>📊 {gap.estimatedImpact.conversationsAffected} convos</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolution Funnel Bar
// ---------------------------------------------------------------------------

function FunnelBar({ data }: { data: ResolutionFunnel }) {
  const { total, resolved, partiallyResolved, escalated, abandoned } = data;
  if (total === 0) return null;

  const segments = [
    { label: "Resolved", value: resolved, color: "bg-[#2A9D8F]" },
    { label: "Partial", value: partiallyResolved, color: "bg-[#D4A373]" },
    { label: "Escalated", value: escalated, color: "bg-[#B08968]" },
    { label: "Abandoned", value: abandoned, color: "bg-red-400" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden">
        {segments.map((s) => (
          <div
            key={s.label}
            className={cn("transition-all duration-500", s.color)}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-[#948F8C]">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", s.color)} />
            <span>
              {s.label}: {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inconsistency Alert
// ---------------------------------------------------------------------------

function InconsistencyAlert({ item }: { item: Inconsistency }) {
  return (
    <div className={cn("rounded-xl border p-3", severityColors.warning.bg, severityColors.warning.border)}>
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-[#D4A373] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#2C2420]">「{item.topic}」</div>
          <div className="mt-1 space-y-1">
            {item.conversations.map((c) => (
              <div key={c.botId} className="text-xs text-[#948F8C]">
                {c.botName}: "{c.response}" <span className="text-[#B8ADA2]">(CSAT: {c.satisfaction})</span>
              </div>
            ))}
          </div>
          {item.recommendedStandardResponse && (
            <div className="mt-2 text-xs text-[#264653] bg-[#E0F2F1] rounded px-2 py-1">
              <Lightbulb className="h-3 w-3 inline mr-1" />
              Recommended: "{item.recommendedStandardResponse}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export function ConversationAnalyticsWidget() {
  const company = useCompany();
  const [data, setData] = useState<ConversationAnalyticsData>(MOCK_DATA);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");

  // In production, this would fetch from /api/fleet-monitor/conversations/*
  useEffect(() => {
    if (!company?.selectedCompanyId) return;
    // Future: fetch real data from API
    // For now, use mock data
    setData(MOCK_DATA);
  }, [company?.selectedCompanyId, period]);

  const handleGenerateTraining = (gapId: string) => {
    // Future: POST /api/fleet-monitor/conversations/training-data/:gapId
    void gapId;
  };

  const satisfactionTrend = useMemo(() => {
    if (data.satisfactionTrend.length < 2) return "stable";
    const last = data.satisfactionTrend[data.satisfactionTrend.length - 1]?.avgSatisfaction ?? 0;
    const prev = data.satisfactionTrend[data.satisfactionTrend.length - 2]?.avgSatisfaction ?? 0;
    return last > prev + 2 ? "improving" : last < prev - 2 ? "declining" : "stable";
  }, [data.satisfactionTrend]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#D4A373]" />
          <h2 className="text-lg font-semibold text-[#2C2420]">Conversation Analytics</h2>
          <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "7d" | "30d" | "90d")}
            className="text-xs border rounded-lg px-2 py-1 bg-[#FAF9F6] text-[#2C2420] border-[#E0E0E0]"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button className="p-1.5 rounded-lg hover:bg-[#F5F0EB] transition-colors" title="Refresh">
            <RefreshCw className={cn("h-4 w-4 text-[#948F8C]", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={MessageSquare}
            value={data.totalConversations.toLocaleString()}
            label="Total Conversations"
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={Target}
            value={`${data.avgSatisfaction}/100`}
            label="Avg Satisfaction"
            description={
              satisfactionTrend === "improving" ? (
                <span className="text-[#2A9D8F]">↑ Improving</span>
              ) : satisfactionTrend === "declining" ? (
                <span className="text-red-500">↓ Declining</span>
              ) : undefined
            }
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={BarChart3}
            value={`${Math.round(data.resolutionFunnel.resolved / (data.resolutionFunnel.total || 1) * 100)}%`}
            label="Resolution Rate"
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={BookOpen}
            value={data.knowledgeGaps.length}
            label="Knowledge Gaps"
            description={
              data.knowledgeGaps.filter((g) => g.priority === "critical").length > 0 ? (
                <span className="text-red-500">
                  {data.knowledgeGaps.filter((g) => g.priority === "critical").length} critical
                </span>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Satisfaction Trend Chart */}
      <div className={cn(fleetCardStyles.elevated, "p-4")}>
        <h3 className="text-sm font-medium text-[#2C2420] mb-3">Satisfaction Trend</h3>
        <SatisfactionChart data={data.satisfactionTrend} />
      </div>

      {/* Two-column layout: Topics + Knowledge Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Topic Heatmap */}
        <div className={cn(fleetCardStyles.default, "p-4")}>
          <h3 className="text-sm font-medium text-[#2C2420] mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#D4A373]" />
            Topic Heatmap
          </h3>
          <div className="space-y-0.5">
            {data.topicClusters.map((topic) => (
              <TopicRow key={topic.label} topic={topic} />
            ))}
          </div>
        </div>

        {/* Knowledge Gaps */}
        <div className={cn(fleetCardStyles.default, "p-4")}>
          <h3 className="text-sm font-medium text-[#2C2420] mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            Knowledge Gaps
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.knowledgeGaps.map((gap) => (
              <GapCard key={gap.id} gap={gap} onGenerateTraining={handleGenerateTraining} />
            ))}
          </div>
        </div>
      </div>

      {/* Resolution Funnel */}
      <div className={cn(fleetCardStyles.default, "p-4")}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-[#2C2420]">Resolution Funnel</h3>
          <div className="flex gap-4 text-xs text-[#948F8C]">
            <span>Avg turns: {data.resolutionFunnel.avgTurnsToResolve}</span>
            <span>Avg cost: ${data.resolutionFunnel.avgCostPerResolution.toFixed(2)}/conv</span>
          </div>
        </div>
        <FunnelBar data={data.resolutionFunnel} />
      </div>

      {/* Inconsistencies */}
      {data.inconsistencies.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[#2C2420] flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-[#D4A373]" />
            Cross-Bot Inconsistencies ({data.inconsistencies.length})
          </h3>
          {data.inconsistencies.map((item, i) => (
            <InconsistencyAlert key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
