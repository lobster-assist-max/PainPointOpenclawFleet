/**
 * A2AMeshWidget — Bot-to-bot collaboration mesh visualization.
 *
 * Displays: expertise matrix, collaboration stats, active routes,
 * recent collaboration traces, and mesh topology.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Network,
  ArrowRight,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { MetricCard } from "@/components/MetricCard";
import { fleetCardStyles, fleetInfoStyles, brandColors, severityColors } from "./design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BotExpertise {
  botId: string;
  botName: string;
  expertise: Array<{ domain: string; confidence: number; source: string; avgSatisfaction: number }>;
  availability: { status: "online" | "busy" | "offline"; currentLoad: number; maxConcurrent: number };
}

interface A2ARoute {
  id: string;
  name: string;
  description: string;
  trigger: { type: string; condition: Record<string, unknown> };
  routing: { strategy: string };
  mode: "transparent" | "handoff" | "consultation";
  enabled: boolean;
  priority: number;
}

interface A2ACollaboration {
  id: string;
  originBotName: string;
  targetBotName: string;
  detectedTopic: string;
  mode: string;
  status: "completed" | "in_progress" | "failed" | "timeout";
  responseTimeMs: number;
  userSatisfaction: number | null;
  initiatedAt: string;
}

interface A2AStats {
  totalCollaborations: number;
  successRate: number;
  avgResponseTime: number;
  satisfactionLift: number;
  escalationReduction: number;
  topRoutes: Array<{ from: string; to: string; count: number; avgSatisfaction: number }>;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_EXPERTISE: BotExpertise[] = [
  { botId: "1", botName: "🦞 小龍蝦", expertise: [{ domain: "tech_support", confidence: 0.92, source: "auto_detected", avgSatisfaction: 88 }, { domain: "sales", confidence: 0.75, source: "manual", avgSatisfaction: 78 }], availability: { status: "online", currentLoad: 12, maxConcurrent: 20 } },
  { botId: "2", botName: "🐿️ 飛鼠", expertise: [{ domain: "dev_tools", confidence: 0.95, source: "auto_detected", avgSatisfaction: 91 }, { domain: "api_support", confidence: 0.88, source: "auto_detected", avgSatisfaction: 85 }], availability: { status: "online", currentLoad: 8, maxConcurrent: 15 } },
  { botId: "3", botName: "🦚 孔雀", expertise: [{ domain: "billing", confidence: 0.94, source: "auto_detected", avgSatisfaction: 84 }, { domain: "complaints", confidence: 0.82, source: "auto_detected", avgSatisfaction: 72 }], availability: { status: "online", currentLoad: 3, maxConcurrent: 10 } },
  { botId: "4", botName: "🐗 山豬", expertise: [{ domain: "scheduling", confidence: 0.91, source: "manual", avgSatisfaction: 91 }, { domain: "onboarding", confidence: 0.87, source: "auto_detected", avgSatisfaction: 86 }], availability: { status: "online", currentLoad: 15, maxConcurrent: 25 } },
  { botId: "5", botName: "🐒 猴子", expertise: [{ domain: "general", confidence: 0.80, source: "manual", avgSatisfaction: 80 }, { domain: "multilingual", confidence: 0.93, source: "auto_detected", avgSatisfaction: 88 }], availability: { status: "offline", currentLoad: 0, maxConcurrent: 10 } },
];

const MOCK_STATS: A2AStats = {
  totalCollaborations: 156,
  successRate: 97.4,
  avgResponseTime: 340,
  satisfactionLift: 27,
  escalationReduction: 42,
  topRoutes: [
    { from: "🦞", to: "🦚", count: 48, avgSatisfaction: 86 },
    { from: "🐿️", to: "🐗", count: 32, avgSatisfaction: 89 },
    { from: "🦚", to: "🐿️", count: 28, avgSatisfaction: 82 },
  ],
};

const MOCK_COLLABORATIONS: A2ACollaboration[] = [
  { id: "c1", originBotName: "🦞 小龍蝦", targetBotName: "🦚 孔雀", detectedTopic: "billing", mode: "transparent", status: "completed", responseTimeMs: 280, userSatisfaction: 88, initiatedAt: "2 min ago" },
  { id: "c2", originBotName: "🐿️ 飛鼠", targetBotName: "🐗 山豬", detectedTopic: "scheduling", mode: "consultation", status: "completed", responseTimeMs: 420, userSatisfaction: 92, initiatedAt: "8 min ago" },
  { id: "c3", originBotName: "🦚 孔雀", targetBotName: "🐿️ 飛鼠", detectedTopic: "api_support", mode: "transparent", status: "in_progress", responseTimeMs: 0, userSatisfaction: null, initiatedAt: "just now" },
  { id: "c4", originBotName: "🐗 山豬", targetBotName: "🦞 小龍蝦", detectedTopic: "tech_support", mode: "handoff", status: "failed", responseTimeMs: 5000, userSatisfaction: null, initiatedAt: "15 min ago" },
];

// ---------------------------------------------------------------------------
// Expertise Matrix Heatmap
// ---------------------------------------------------------------------------

function ExpertiseMatrix({ expertise }: { expertise: BotExpertise[] }) {
  const allDomains = useMemo(() => {
    const domains = new Set<string>();
    expertise.forEach((b) => b.expertise.forEach((e) => domains.add(e.domain)));
    return Array.from(domains).sort();
  }, [expertise]);

  const getConfidence = (bot: BotExpertise, domain: string): number => {
    return bot.expertise.find((e) => e.domain === domain)?.confidence ?? 0;
  };

  const confidenceColor = (c: number): string => {
    if (c >= 0.9) return "bg-[#2A9D8F] text-white";
    if (c >= 0.7) return "bg-[#2A9D8F]/60 text-white";
    if (c >= 0.5) return "bg-[#D4A373]/40 text-[#2C2420]";
    if (c > 0) return "bg-[#E8E4DF] text-[#948F8C]";
    return "bg-transparent";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-1 px-2 text-[#948F8C] font-normal">Bot</th>
            {allDomains.map((d) => (
              <th key={d} className="text-center py-1 px-1 text-[#948F8C] font-normal capitalize">
                {d.replace(/_/g, " ")}
              </th>
            ))}
            <th className="text-center py-1 px-2 text-[#948F8C] font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {expertise.map((bot) => (
            <tr key={bot.botId} className="hover:bg-[#F5F0EB]/50">
              <td className="py-1.5 px-2 font-medium text-[#2C2420]">{bot.botName}</td>
              {allDomains.map((d) => {
                const c = getConfidence(bot, d);
                return (
                  <td key={d} className="py-1.5 px-1 text-center">
                    {c > 0 ? (
                      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", confidenceColor(c))}>
                        {Math.round(c * 100)}%
                      </span>
                    ) : (
                      <span className="text-[#E0E0E0]">—</span>
                    )}
                  </td>
                );
              })}
              <td className="py-1.5 px-2 text-center">
                <span
                  className={cn(
                    "inline-block w-2 h-2 rounded-full",
                    bot.availability.status === "online" ? "bg-[#2A9D8F]" : bot.availability.status === "busy" ? "bg-[#D4A373]" : "bg-red-400",
                  )}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collaboration Trace Row
// ---------------------------------------------------------------------------

function CollabRow({ collab }: { collab: A2ACollaboration }) {
  const statusIcon =
    collab.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 text-[#2A9D8F]" /> :
    collab.status === "in_progress" ? <Clock className="h-3.5 w-3.5 text-[#D4A373] animate-pulse" /> :
    <XCircle className="h-3.5 w-3.5 text-red-400" />;

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-[#F5F0EB]/50 transition-colors text-sm">
      {statusIcon}
      <span className="font-medium text-[#2C2420]">{collab.originBotName}</span>
      <ArrowRight className="h-3 w-3 text-[#948F8C]" />
      <span className="font-medium text-[#2C2420]">{collab.targetBotName}</span>
      <span className={fleetInfoStyles.badge}>{collab.detectedTopic}</span>
      <span className="text-xs text-[#948F8C] capitalize">{collab.mode}</span>
      <span className="ml-auto text-xs text-[#948F8C]">
        {collab.responseTimeMs > 0 ? `${collab.responseTimeMs}ms` : "..."}
      </span>
      {collab.userSatisfaction != null && (
        <span className="text-xs text-[#2A9D8F] font-medium">{collab.userSatisfaction}</span>
      )}
      <span className="text-[10px] text-[#B8ADA2]">{collab.initiatedAt}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export function A2AMeshWidget() {
  const company = useCompany();
  const [expertise, setExpertise] = useState<BotExpertise[]>(MOCK_EXPERTISE);
  const [stats, setStats] = useState<A2AStats>(MOCK_STATS);
  const [collaborations, setCollaborations] = useState<A2ACollaboration[]>(MOCK_COLLABORATIONS);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Network className="h-5 w-5 text-[#D4A373]" />
        <h2 className="text-lg font-semibold text-[#2C2420]">A2A Collaboration Mesh</h2>
        <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard icon={Zap} value={stats.totalCollaborations} label="Collaborations (24h)" />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard icon={CheckCircle2} value={`${stats.successRate}%`} label="Success Rate" />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard icon={Clock} value={`${stats.avgResponseTime}ms`} label="Avg Response" />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={Network}
            value={`+${stats.satisfactionLift}%`}
            label="CSAT Lift"
            description={<span className="text-[#2A9D8F]">vs non-routed</span>}
          />
        </div>
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard
            icon={Network}
            value={`-${stats.escalationReduction}%`}
            label="Escalations"
            description={<span className="text-[#2A9D8F]">reduced</span>}
          />
        </div>
      </div>

      {/* Two-column: Expertise Matrix + Top Routes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={cn(fleetCardStyles.elevated, "p-4 lg:col-span-2")}>
          <h3 className="text-sm font-medium text-[#2C2420] mb-3">Expertise Matrix</h3>
          <ExpertiseMatrix expertise={expertise} />
        </div>

        <div className={cn(fleetCardStyles.default, "p-4")}>
          <h3 className="text-sm font-medium text-[#2C2420] mb-3">Top Routes (24h)</h3>
          <div className="space-y-2">
            {stats.topRoutes.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-lg">{r.from}</span>
                <ArrowRight className="h-3 w-3 text-[#D4A373]" />
                <span className="text-lg">{r.to}</span>
                <span className="ml-auto text-xs text-[#948F8C]">{r.count}x</span>
                <span className="text-xs text-[#2A9D8F] font-medium">CSAT {r.avgSatisfaction}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Collaborations */}
      <div className={cn(fleetCardStyles.default, "p-4")}>
        <h3 className="text-sm font-medium text-[#2C2420] mb-3">Recent Collaborations</h3>
        <div className="space-y-0.5">
          {collaborations.map((c) => (
            <CollabRow key={c.id} collab={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
