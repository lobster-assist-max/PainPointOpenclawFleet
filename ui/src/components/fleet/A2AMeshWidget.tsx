/**
 * A2AMeshWidget — Bot-to-bot collaboration mesh visualization.
 *
 * Displays: expertise matrix, collaboration stats, active routes,
 * recent collaboration traces, and mesh topology.
 *
 * Live data comes from the FleetA2AMeshEngine via /fleet-monitor/a2a/*.
 * The engine seeds nothing, so the matrix is empty until expertise is
 * detected — the "Detect Expertise" action auto-detects it from each
 * connected bot's SOUL.md / IDENTITY.md. When no live data exists the
 * widget falls back to demo MOCK data (Preview badge).
 */

import { useMemo, useState } from "react";
import {
  Network,
  ArrowRight,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { MetricCard } from "@/components/MetricCard";
import {
  useFleetStatus,
  useA2AExpertise,
  useA2ACollaborations,
  useA2AStats,
  useA2AAutoDetect,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import type {
  A2ACollaborationRecord,
  A2ACollaborationStats,
  A2AExpertiseProfile,
} from "@/api/fleet-monitor";
import { fleetCardStyles, fleetInfoStyles } from "./design-tokens";

// ---------------------------------------------------------------------------
// Types (widget display shapes)
// ---------------------------------------------------------------------------

interface BotExpertise {
  botId: string;
  botName: string;
  expertise: Array<{ domain: string; confidence: number; source: string; avgSatisfaction: number }>;
  availability: { status: "online" | "busy" | "offline"; currentLoad: number; maxConcurrent: number };
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

interface TopRoute {
  from: string;
  to: string;
  count: number;
  successRate: number;
}

interface A2AStats {
  totalCollaborations: number;
  successRate: number;
  avgResponseTime: number;
  topRoutes: TopRoute[];
}

// ---------------------------------------------------------------------------
// Mock Data (fallback when no live data exists)
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
  topRoutes: [
    { from: "🦞", to: "🦚", count: 48, successRate: 96 },
    { from: "🐿️", to: "🐗", count: 32, successRate: 91 },
    { from: "🦚", to: "🐿️", count: 28, successRate: 89 },
  ],
};

const MOCK_COLLABORATIONS: A2ACollaboration[] = [
  { id: "c1", originBotName: "🦞 小龍蝦", targetBotName: "🦚 孔雀", detectedTopic: "billing", mode: "best_match", status: "completed", responseTimeMs: 280, userSatisfaction: 88, initiatedAt: "2 min ago" },
  { id: "c2", originBotName: "🐿️ 飛鼠", targetBotName: "🐗 山豬", detectedTopic: "scheduling", mode: "least_loaded", status: "completed", responseTimeMs: 420, userSatisfaction: 92, initiatedAt: "8 min ago" },
  { id: "c3", originBotName: "🦚 孔雀", targetBotName: "🐿️ 飛鼠", detectedTopic: "api_support", mode: "best_match", status: "in_progress", responseTimeMs: 0, userSatisfaction: null, initiatedAt: "just now" },
  { id: "c4", originBotName: "🐗 山豬", targetBotName: "🦞 小龍蝦", detectedTopic: "tech_support", mode: "round_robin", status: "failed", responseTimeMs: 5000, userSatisfaction: null, initiatedAt: "15 min ago" },
];

// ---------------------------------------------------------------------------
// Mapping helpers: engine shapes → widget display shapes
// ---------------------------------------------------------------------------

function mapExpertise(
  profiles: A2AExpertiseProfile[],
  nameFor: (botId: string) => string,
): BotExpertise[] {
  return profiles.map((p) => ({
    botId: p.botId,
    botName: nameFor(p.botId),
    expertise: p.expertise.map((e) => ({
      domain: e.domain,
      confidence: e.confidence,
      source: e.source,
      // engine avgSatisfaction is a 0–1 score; widget renders it as a 0–100 value
      avgSatisfaction: Math.round(e.avgSatisfaction * 100),
    })),
    availability: {
      status: p.availability.status,
      currentLoad: p.availability.currentLoad,
      maxConcurrent: p.availability.maxConcurrent,
    },
  }));
}

function mapCollaborations(
  records: A2ACollaborationRecord[],
  nameFor: (botId: string) => string,
): A2ACollaboration[] {
  return [...records]
    .sort((a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime())
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      originBotName: nameFor(c.origin.botId),
      targetBotName: c.target.botId ? nameFor(c.target.botId) : "—",
      detectedTopic: c.origin.detectedTopic,
      mode: c.routing.strategy,
      status:
        c.status === "timed_out"
          ? "timeout"
          : c.status === "pending"
            ? "in_progress"
            : c.status,
      responseTimeMs: c.target.responseTime ?? 0,
      userSatisfaction: null,
      initiatedAt: timeAgo(c.initiatedAt),
    }));
}

/** Build top from→to routes (emoji pairs) from collaboration history. */
function computeTopRoutes(
  records: A2ACollaborationRecord[],
  emojiFor: (botId: string) => string,
): TopRoute[] {
  const pairs = new Map<string, { from: string; to: string; count: number; success: number }>();
  for (const c of records) {
    if (!c.target.botId) continue;
    const key = `${c.origin.botId}→${c.target.botId}`;
    const entry = pairs.get(key) ?? {
      from: emojiFor(c.origin.botId),
      to: emojiFor(c.target.botId),
      count: 0,
      success: 0,
    };
    entry.count++;
    if (c.outcome === "success") entry.success++;
    pairs.set(key, entry);
  }
  return Array.from(pairs.values())
    .map((p) => ({
      from: p.from,
      to: p.to,
      count: p.count,
      successRate: p.count > 0 ? Math.round((p.success / p.count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

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
    if (c >= 0.9) return "bg-teal-600 dark:bg-teal-700 text-white";
    if (c >= 0.7) return "bg-teal-600/60 dark:bg-teal-700/60 text-white";
    if (c >= 0.5) return "bg-primary/40 dark:bg-amber-700/40 text-foreground";
    if (c > 0) return "bg-muted text-muted-foreground";
    return "bg-transparent";
  };

  if (allDomains.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No expertise detected yet. Run “Detect Expertise” to profile your bots from their SOUL.md / IDENTITY.md.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" aria-label="Bot expertise confidence scores">
        <thead>
          <tr>
            <th className="text-left py-1 px-2 text-muted-foreground font-normal">Bot</th>
            {allDomains.map((d) => (
              <th key={d} className="text-center py-1 px-1 text-muted-foreground font-normal capitalize">
                {d.replace(/_/g, " ")}
              </th>
            ))}
            <th className="text-center py-1 px-2 text-muted-foreground font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {expertise.map((bot) => (
            <tr key={bot.botId} className="hover:bg-muted/50">
              <td className="py-1.5 px-2 font-medium text-foreground">{bot.botName}</td>
              {allDomains.map((d) => {
                const c = getConfidence(bot, d);
                return (
                  <td key={d} className="py-1.5 px-1 text-center">
                    {c > 0 ? (
                      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", confidenceColor(c))}>
                        {Math.round(c * 100)}%
                      </span>
                    ) : (
                      <span className="text-border dark:text-stone-600">—</span>
                    )}
                  </td>
                );
              })}
              <td className="py-1.5 px-2 text-center">
                <span
                  className={cn(
                    "inline-block w-2 h-2 rounded-full",
                    bot.availability.status === "online" ? "bg-teal-600" : bot.availability.status === "busy" ? "bg-primary" : "bg-red-400",
                  )}
                  aria-label={bot.availability.status}
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
    collab.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> :
    collab.status === "in_progress" ? <Clock className="h-3.5 w-3.5 text-primary animate-pulse" /> :
    <XCircle className="h-3.5 w-3.5 text-red-400" />;

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors text-sm">
      {statusIcon}
      <span className="font-medium text-foreground">{collab.originBotName}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium text-foreground">{collab.targetBotName}</span>
      <span className={fleetInfoStyles.badge}>{collab.detectedTopic}</span>
      <span className="text-xs text-muted-foreground capitalize">{collab.mode.replace(/_/g, " ")}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {collab.responseTimeMs > 0 ? `${collab.responseTimeMs}ms` : "..."}
      </span>
      {collab.userSatisfaction != null && (
        <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">{collab.userSatisfaction}</span>
      )}
      <span className="text-[10px] text-muted-foreground/70">{collab.initiatedAt}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export function A2AMeshWidget() {
  const { selectedCompanyId } = useCompany();
  const { data: fleet } = useFleetStatus();

  // Fixed 30-day stats window (computed once on mount).
  const [period] = useState(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  });

  const expertiseQuery = useA2AExpertise(selectedCompanyId);
  const collaborationsQuery = useA2ACollaborations(selectedCompanyId);
  const statsQuery = useA2AStats(selectedCompanyId, period.start, period.end);
  const autoDetect = useA2AAutoDetect();

  // Resolve real bot names/emojis from the live fleet status.
  const { nameFor, emojiFor } = useMemo(() => {
    const map: Record<string, { name: string; emoji: string }> = {};
    for (const b of fleet?.bots ?? []) map[b.botId] = { name: b.name, emoji: b.emoji ?? "" };
    return {
      nameFor: (botId: string) => {
        const b = map[botId];
        return b ? `${b.emoji} ${b.name}`.trim() : botId;
      },
      emojiFor: (botId: string) => map[botId]?.emoji || "🤖",
    };
  }, [fleet]);

  const liveProfiles = expertiseQuery.data ?? [];
  const liveRecords = collaborationsQuery.data ?? [];
  const isLive = liveProfiles.length > 0;

  const expertise = useMemo(
    () => (isLive ? mapExpertise(liveProfiles, nameFor) : MOCK_EXPERTISE),
    [isLive, liveProfiles, nameFor],
  );

  const collaborations = useMemo(
    () => (isLive ? mapCollaborations(liveRecords, nameFor) : MOCK_COLLABORATIONS),
    [isLive, liveRecords, nameFor],
  );

  const stats: A2AStats = useMemo(() => {
    if (!isLive) return MOCK_STATS;
    const s: A2ACollaborationStats | undefined = statsQuery.data;
    return {
      totalCollaborations: s?.totalCollaborations ?? liveRecords.length,
      successRate: s ? Math.round(s.successRate * 1000) / 10 : 0,
      avgResponseTime: s?.avgResponseTime ?? 0,
      topRoutes: computeTopRoutes(liveRecords, emojiFor),
    };
  }, [isLive, statsQuery.data, liveRecords, emojiFor]);

  // Connected bots are the auto-detect targets.
  const connectedBots = fleet?.bots ?? [];
  const detecting = autoDetect.isPending;

  const handleDetect = () => {
    if (!selectedCompanyId || connectedBots.length === 0) return;
    // Fire auto-detect per connected bot; the last one's onSuccess invalidates
    // the matrix query so the heatmap refreshes once profiles exist.
    for (const b of connectedBots) {
      autoDetect.mutate({ companyId: selectedCompanyId, botId: b.botId });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Network className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">A2A Collaboration Mesh</h2>
        {isLive ? (
          <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">
            Live
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">
            Preview
          </span>
        )}
        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting || !selectedCompanyId || connectedBots.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          title={connectedBots.length === 0 ? "No connected bots to profile" : "Auto-detect expertise from each bot's SOUL.md / IDENTITY.md"}
        >
          {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {detecting ? "Detecting…" : "Detect Expertise"}
        </button>
      </div>

      {/* Auto-detect error */}
      {autoDetect.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Expertise detection failed
            {autoDetect.error instanceof Error ? `: ${autoDetect.error.message}` : ""}. Bots must be reachable via their gateway.
          </span>
        </div>
      )}

      {/* Offline / preview notice */}
      {!isLive && (
        <div className={cn(fleetInfoStyles.bg, "rounded-lg px-3 py-2 text-xs")}>
          Showing demo data. {connectedBots.length > 0
            ? "Run “Detect Expertise” to build a live mesh from your connected bots."
            : "Connect bots and detect expertise to see a live collaboration mesh."}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={fleetCardStyles.default + " p-3"}>
          <MetricCard icon={Zap} value={stats.totalCollaborations} label="Collaborations (30d)" />
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
            value={expertise.length}
            label="Profiled Bots"
            description={
              <span className="text-teal-600 dark:text-teal-400">
                {expertise.filter((b) => b.availability.status === "online").length} online
              </span>
            }
          />
        </div>
      </div>

      {/* Two-column: Expertise Matrix + Top Routes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={cn(fleetCardStyles.elevated, "p-4 lg:col-span-2")}>
          <h3 className="text-sm font-medium text-foreground mb-3">Expertise Matrix</h3>
          <ExpertiseMatrix expertise={expertise} />
        </div>

        <div className={cn(fleetCardStyles.default, "p-4")}>
          <h3 className="text-sm font-medium text-foreground mb-3">Top Routes (30d)</h3>
          {stats.topRoutes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No routed conversations yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.topRoutes.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{r.from}</span>
                  <ArrowRight className="h-3 w-3 text-primary" />
                  <span className="text-lg">{r.to}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{r.count}x</span>
                  <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">{r.successRate}% ok</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Collaborations */}
      <div className={cn(fleetCardStyles.default, "p-4")}>
        <h3 className="text-sm font-medium text-foreground mb-3">Recent Collaborations</h3>
        {collaborations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No collaborations recorded yet.</p>
        ) : (
          <div className="space-y-0.5">
            {collaborations.map((c) => (
              <CollabRow key={c.id} collab={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
