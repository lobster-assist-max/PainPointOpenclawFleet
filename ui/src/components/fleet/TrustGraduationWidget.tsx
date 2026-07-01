/**
 * Trust Graduation Widget
 *
 * Displays bot trust levels, graduation progress, and fleet-wide
 * trust distribution. Supports manual promotion/demotion.
 *
 * Pain Point brand: gold-brown primary, off-white background, dark-brown foreground.
 * Dark mode: uses Tailwind dark: variants for all brand colors.
 * @see Planning #20
 */

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Shield,
  ShieldCheck,
  Crown,
  Star,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { fleetMonitorApi } from "@/api/fleet-monitor";
import { queryKeys } from "@/lib/queryKeys";
import { useFleetStatus, useTrustPromote, useTrustDemote } from "@/hooks/useFleetMonitor";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GraduationRequirement {
  name: string;
  description: string;
  current: number;
  target: number;
  met: boolean;
  trend: "improving" | "stable" | "declining";
}

interface BotTrustProfile {
  botId: string;
  currentLevel: number;
  levelName: string;
  promotedAt: string;
  graduation: {
    nextLevel: number | null;
    requirements: GraduationRequirement[];
    blockers: string[];
  };
  demotion: {
    atRisk: boolean;
    riskFactors: Array<{ factor: string; severity: number }>;
  };
  streaks: {
    consecutiveDaysAboveCqi: number;
    incidentFreeDays: number;
  };
}

interface TrustDistribution {
  levels: Record<number, number>;
  avgLevel: number;
  promotionsPending: number;
  demotionsAtRisk: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<
  number,
  { name: string; label: string; color: string; bgColor: string; icon: typeof Shield }
> = {
  0: { name: "MANUAL", label: "L0", color: "text-muted-foreground", bgColor: "bg-muted", icon: Shield },
  1: { name: "SUPERVISED", label: "L1", color: "text-teal-600 dark:text-teal-400", bgColor: "bg-teal-500/10 dark:bg-teal-500/20", icon: Shield },
  2: { name: "TRUSTED", label: "L2", color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20", icon: ShieldCheck },
  3: { name: "AUTONOMOUS", label: "L3", color: "text-primary", bgColor: "bg-primary/10", icon: Star },
  4: { name: "ELITE", label: "L4", color: "text-primary", bgColor: "bg-primary/20", icon: Crown },
};

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_PROFILES: BotTrustProfile[] = [
  {
    botId: "lobster-01",
    currentLevel: 4,
    levelName: "elite",
    promotedAt: "2025-11-19",
    graduation: { nextLevel: null, requirements: [], blockers: [] },
    demotion: { atRisk: false, riskFactors: [] },
    streaks: { consecutiveDaysAboveCqi: 120, incidentFreeDays: 120 },
  },
  {
    botId: "squirrel-01",
    currentLevel: 3,
    levelName: "autonomous",
    promotedAt: "2025-12-14",
    graduation: {
      nextLevel: 4,
      requirements: [
        { name: "CQI Streak", description: "CQI ≥ 90 for 90 days", current: 65, target: 90, met: false, trend: "improving" },
        { name: "Incident-Free", description: "No P2+ incidents for 90 days", current: 65, target: 90, met: false, trend: "stable" },
      ],
      blockers: [],
    },
    demotion: { atRisk: false, riskFactors: [] },
    streaks: { consecutiveDaysAboveCqi: 65, incidentFreeDays: 65 },
  },
  {
    botId: "peacock-01",
    currentLevel: 3,
    levelName: "autonomous",
    promotedAt: "2025-12-17",
    graduation: {
      nextLevel: 4,
      requirements: [
        { name: "CQI Streak", description: "CQI ≥ 90 for 90 days", current: 62, target: 90, met: false, trend: "improving" },
      ],
      blockers: [],
    },
    demotion: { atRisk: false, riskFactors: [] },
    streaks: { consecutiveDaysAboveCqi: 62, incidentFreeDays: 92 },
  },
  {
    botId: "boar-01",
    currentLevel: 2,
    levelName: "trusted",
    promotedAt: "2026-01-20",
    graduation: {
      nextLevel: 3,
      requirements: [
        { name: "CQI Streak", description: "CQI ≥ 85 for 60 days", current: 42, target: 60, met: false, trend: "improving" },
      ],
      blockers: [],
    },
    demotion: { atRisk: false, riskFactors: [] },
    streaks: { consecutiveDaysAboveCqi: 42, incidentFreeDays: 58 },
  },
  {
    botId: "monkey-01",
    currentLevel: 1,
    levelName: "supervised",
    promotedAt: "2026-02-26",
    graduation: {
      nextLevel: 2,
      requirements: [
        { name: "CQI Streak", description: "CQI ≥ 80 for 30 days", current: 21, target: 30, met: false, trend: "improving" },
        { name: "Completion Rate", description: "≥ 50%", current: 18, target: 30, met: false, trend: "stable" },
      ],
      blockers: [],
    },
    demotion: { atRisk: false, riskFactors: [] },
    streaks: { consecutiveDaysAboveCqi: 21, incidentFreeDays: 21 },
  },
  {
    botId: "horse-01",
    currentLevel: 0,
    levelName: "manual",
    promotedAt: "2026-03-16",
    graduation: {
      nextLevel: 1,
      requirements: [
        { name: "CQI Streak", description: "CQI ≥ 70 for 7 days", current: 3, target: 7, met: false, trend: "improving" },
      ],
      blockers: [],
    },
    demotion: { atRisk: false, riskFactors: [] },
    streaks: { consecutiveDaysAboveCqi: 3, incidentFreeDays: 3 },
  },
];

const MOCK_DISTRIBUTION: TrustDistribution = {
  levels: { 0: 1, 1: 1, 2: 1, 3: 2, 4: 1 },
  avgLevel: 2.3,
  promotionsPending: 1,
  demotionsAtRisk: 0,
};

const BOT_NAMES: Record<string, string> = {
  "lobster-01": "🦞 小龍蝦",
  "squirrel-01": "🐿️ 飛鼠",
  "peacock-01": "🦚 孔雀",
  "boar-01": "🐗 山豬",
  "monkey-01": "🐒 猴子",
  "horse-01": "🐎 馬兒",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function TrustGraduationWidget() {
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const { data: fleet } = useFleetStatus();
  const promoteMutation = useTrustPromote();
  const demoteMutation = useTrustDemote();

  const bots = useMemo(() => fleet?.bots ?? [], [fleet]);

  // Fetch (lazily seeding) a trust profile per connected bot. The server creates
  // a default L0 profile on first read, so this is what populates the fleet.
  const profileQueries = useQueries({
    queries: bots.map((b) => ({
      queryKey: queryKeys.fleet.trustProfile(b.botId),
      queryFn: () => fleetMonitorApi.trustProfile(b.botId),
      enabled: !!b.botId,
      staleTime: 30_000,
      // Poll so the leaderboard reflects the server-side daily-metrics feed
      // (streak advances, promotion eligibility, demotions) without a manual
      // refresh — the fleet-bootstrap trust feed updates profiles over time.
      refetchInterval: 60_000,
    })),
  });

  const isLoading = bots.length > 0 && profileQueries.some((q) => q.isLoading);
  const liveProfiles = profileQueries
    .map((q) => q.data?.profile)
    .filter((p): p is BotTrustProfile => Boolean(p));

  // Real names/emojis from the fleet status; fall back to the demo name table.
  const nameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of bots) map[b.botId] = `${b.emoji ?? ""} ${b.name}`.trim();
    return map;
  }, [bots]);

  const usingMock = liveProfiles.length === 0;
  const profiles = usingMock ? MOCK_PROFILES : liveProfiles;
  const nameFor = (botId: string) => nameMap[botId] ?? BOT_NAMES[botId] ?? botId;

  const distribution: TrustDistribution = useMemo(() => {
    if (usingMock) return MOCK_DISTRIBUTION;
    const levels: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let total = 0;
    let atRisk = 0;
    let pending = 0;
    for (const p of liveProfiles) {
      levels[p.currentLevel] = (levels[p.currentLevel] ?? 0) + 1;
      total += p.currentLevel;
      if (p.demotion.atRisk) atRisk++;
      const reqs = p.graduation.requirements;
      if (
        p.graduation.nextLevel !== null &&
        p.graduation.blockers.length === 0 &&
        reqs.length > 0 &&
        reqs.every((r) => r.met)
      ) {
        pending++;
      }
    }
    return {
      levels,
      avgLevel: liveProfiles.length ? total / liveProfiles.length : 0,
      promotionsPending: pending,
      demotionsAtRisk: atRisk,
    };
  }, [usingMock, liveProfiles]);

  if (isLoading && liveProfiles.length === 0) {
    return (
      <div className="bg-background/95 dark:bg-stone-900/95 backdrop-blur-xl rounded-2xl border border-primary/20 shadow-lg p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading trust profiles…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-background/95 dark:bg-stone-900/95 backdrop-blur-xl rounded-2xl border border-primary/20 shadow-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Bot Trust Graduation</h3>
            {usingMock ? (
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
            ) : (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Live</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Avg Trust: <strong className="text-primary">{distribution.avgLevel.toFixed(1)}</strong></span>
            <span className="text-border">|</span>
            {Object.entries(distribution.levels).map(([level, count]) => {
              const config = LEVEL_CONFIG[Number(level)]!;
              return (
                <span key={level} className={`${config.color}`}>
                  {config.label}: {count}
                </span>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="space-y-2">
          {profiles
            .sort((a, b) => b.currentLevel - a.currentLevel || b.streaks.consecutiveDaysAboveCqi - a.streaks.consecutiveDaysAboveCqi)
            .map((profile) => {
              const config = LEVEL_CONFIG[profile.currentLevel]!;
              const Icon = config.icon;
              const name = nameFor(profile.botId);
              const progressPercent = profile.graduation.nextLevel !== null && profile.graduation.requirements.length > 0
                ? (profile.graduation.requirements.reduce((sum, r) => sum + Math.min(r.current / r.target, 1), 0) /
                    profile.graduation.requirements.length) * 100
                : 100;

              return (
                <button
                  type="button"
                  key={profile.botId}
                  onClick={() => setSelectedBot(selectedBot === profile.botId ? null : profile.botId)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-300 text-left ${
                    selectedBot === profile.botId
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-background/50 dark:bg-stone-800/50 hover:bg-background/80 dark:hover:bg-stone-800/80 border border-transparent"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${config.color}`} />
                  <span className="w-20 font-medium text-foreground">{name}</span>
                  <div className="flex-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          profile.currentLevel >= 3 ? "bg-primary" : "bg-emerald-500"
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-bold ${config.color} ${config.bgColor} px-2 py-0.5 rounded-full`}>
                    {config.label} {config.name}
                  </span>
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {profile.streaks.consecutiveDaysAboveCqi}d streak
                  </span>
                  {profile.demotion.atRisk && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  {selectedBot === profile.botId ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground/50" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
                  )}
                </button>
              );
            })}
        </div>

        {/* Detail panel */}
        {selectedBot && (() => {
          const profile = profiles.find((p) => p.botId === selectedBot);
          if (!profile) return null;
          const config = LEVEL_CONFIG[profile.currentLevel]!;

          return (
            <div className="mt-4 p-4 rounded-xl bg-background/70 dark:bg-stone-800/70 border border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">
                  {nameFor(profile.botId)} — {config.label} {config.name}
                </h4>
                <div className="flex items-center gap-2">
                  {!usingMock && (promoteMutation.isError || demoteMutation.isError) && (
                    <span className="text-xs text-red-600 dark:text-red-400">Action failed</span>
                  )}
                  <button
                    type="button"
                    disabled={usingMock || profile.currentLevel >= 4 || promoteMutation.isPending}
                    onClick={() => promoteMutation.mutate({ botId: profile.botId, approvedBy: "fleet-operator" })}
                    title={usingMock ? "Connect a bot to manage trust" : profile.currentLevel >= 4 ? "Already at max level" : "Promote to next level"}
                    className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/30 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                    {promoteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />} Promote
                  </button>
                  <button
                    type="button"
                    disabled={usingMock || profile.currentLevel <= 0 || demoteMutation.isPending}
                    onClick={() => demoteMutation.mutate({ botId: profile.botId, reason: "Manual demotion via dashboard" })}
                    title={usingMock ? "Connect a bot to manage trust" : profile.currentLevel <= 0 ? "Already at min level" : "Demote one level"}
                    className="text-xs px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                    {demoteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingDown className="w-3 h-3" />} Demote
                  </button>
                </div>
              </div>

              {profile.graduation.nextLevel !== null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Progress to L{profile.graduation.nextLevel} ({LEVEL_CONFIG[profile.graduation.nextLevel]?.name}):
                  </p>
                  {profile.graduation.requirements.map((req) => (
                    <div key={req.name} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-foreground/70 w-28">{req.name}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${req.met ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${Math.min((req.current / req.target) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {req.current}/{req.target}
                      </span>
                      {req.trend === "improving" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                      {req.trend === "declining" && <TrendingDown className="w-3 h-3 text-red-500" />}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>CQI Streak: {profile.streaks.consecutiveDaysAboveCqi} days</span>
                <span>Incident-Free: {profile.streaks.incidentFreeDays} days</span>
                <span>Promoted: {new Date(profile.promotedAt).toLocaleDateString()}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
