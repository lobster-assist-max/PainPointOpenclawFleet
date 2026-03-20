/**
 * Trust Graduation Widget
 *
 * Displays bot trust levels, graduation progress, and fleet-wide
 * trust distribution. Supports manual promotion/demotion.
 *
 * Pain Point brand: gold-brown #D4A373, off-white #FAF9F6, dark-brown #2C2420
 * @see Planning #20
 */

import { useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Crown,
  Star,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";

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
  0: { name: "MANUAL", label: "L0", color: "text-[#948F8C]", bgColor: "bg-[#948F8C]/10", icon: Shield },
  1: { name: "SUPERVISED", label: "L1", color: "text-[#30A1A8]", bgColor: "bg-[#30A1A8]/10", icon: Shield },
  2: { name: "TRUSTED", label: "L2", color: "text-[#27BD74]", bgColor: "bg-[#27BD74]/10", icon: ShieldCheck },
  3: { name: "AUTONOMOUS", label: "L3", color: "text-[#D4A373]", bgColor: "bg-[#D4A373]/10", icon: Star },
  4: { name: "ELITE", label: "L4", color: "text-[#D4A373]", bgColor: "bg-[#D4A373]/20", icon: Crown },
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
  const profiles = MOCK_PROFILES;
  const distribution = MOCK_DISTRIBUTION;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#FAF9F6]/95 backdrop-blur-xl rounded-2xl border border-[#D4A373]/20 shadow-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-[#D4A373]" />
            <h3 className="text-lg font-semibold text-[#2C2420]">Bot Trust Graduation</h3>
            <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide">Preview</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-[#2C2420]/60">
            <span>Avg Trust: <strong className="text-[#D4A373]">{distribution.avgLevel.toFixed(1)}</strong></span>
            <span className="text-[#2C2420]/20">|</span>
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
              const name = BOT_NAMES[profile.botId] ?? profile.botId;
              const progressPercent = profile.graduation.nextLevel !== null && profile.graduation.requirements.length > 0
                ? (profile.graduation.requirements.reduce((sum, r) => sum + Math.min(r.current / r.target, 1), 0) /
                    profile.graduation.requirements.length) * 100
                : 100;

              return (
                <button
                  key={profile.botId}
                  onClick={() => setSelectedBot(selectedBot === profile.botId ? null : profile.botId)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-300 text-left ${
                    selectedBot === profile.botId
                      ? "bg-[#D4A373]/10 border border-[#D4A373]/30"
                      : "bg-[#FAF9F6]/50 hover:bg-[#FAF9F6]/80 border border-transparent"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${config.color}`} />
                  <span className="w-20 font-medium text-[#2C2420]">{name}</span>
                  <div className="flex-1">
                    <div className="h-2 bg-[#E0E0E0]/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          profile.currentLevel >= 3 ? "bg-[#D4A373]" : "bg-[#27BD74]"
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-bold ${config.color} ${config.bgColor} px-2 py-0.5 rounded-full`}>
                    {config.label} {config.name}
                  </span>
                  <span className="text-xs text-[#2C2420]/40 w-20 text-right">
                    {profile.streaks.consecutiveDaysAboveCqi}d streak
                  </span>
                  {profile.demotion.atRisk && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  {selectedBot === profile.botId ? (
                    <ChevronUp className="w-4 h-4 text-[#2C2420]/30" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#2C2420]/30" />
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
            <div className="mt-4 p-4 rounded-xl bg-[#FAF9F6]/70 border border-[#E0E0E0]/50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-[#2C2420]">
                  {BOT_NAMES[profile.botId]} — {config.label} {config.name}
                </h4>
                <div className="flex gap-2">
                  <button className="text-xs px-3 py-1.5 rounded-full bg-[#27BD74]/10 text-[#27BD74] hover:bg-[#27BD74]/20 transition-colors flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Promote
                  </button>
                  <button className="text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Demote
                  </button>
                </div>
              </div>

              {profile.graduation.nextLevel !== null && (
                <div>
                  <p className="text-xs text-[#2C2420]/50 mb-2">
                    Progress to L{profile.graduation.nextLevel} ({LEVEL_CONFIG[profile.graduation.nextLevel]?.name}):
                  </p>
                  {profile.graduation.requirements.map((req) => (
                    <div key={req.name} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-[#2C2420]/70 w-28">{req.name}</span>
                      <div className="flex-1 h-1.5 bg-[#E0E0E0]/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${req.met ? "bg-[#27BD74]" : "bg-[#D4A373]"}`}
                          style={{ width: `${Math.min((req.current / req.target) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#2C2420]/50 w-16 text-right">
                        {req.current}/{req.target}
                      </span>
                      {req.trend === "improving" && <TrendingUp className="w-3 h-3 text-[#27BD74]" />}
                      {req.trend === "declining" && <TrendingDown className="w-3 h-3 text-red-500" />}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-[#2C2420]/50">
                <span>CQI Streak: {profile.streaks.consecutiveDaysAboveCqi} days</span>
                <span>Incident-Free: {profile.streaks.incidentFreeDays} days</span>
                <span>Promoted: {profile.promotedAt}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
