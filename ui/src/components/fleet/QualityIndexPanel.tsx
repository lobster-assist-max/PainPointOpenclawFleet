/**
 * QualityIndexPanel — self-fetching container for the QualityIndex widget.
 *
 * Wires the presentational <QualityIndex /> (which takes a `data` prop) to the
 * live `/fleet-monitor/quality` backend. The server computes the Conversation
 * Quality Index (CQI) per bot every 5 minutes from live session data, but
 * returns botId only — we enrich each row with the real name + emoji from
 * fleet status so the leaderboard is readable.
 *
 * Degrades gracefully: when the fleet monitor is offline / no bots have been
 * scored yet, it falls back to a small MOCK fleet with a [Preview] badge so the
 * Intelligence page still demonstrates the feature.
 */

import { useMemo } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { QualityIndex } from "./QualityIndex";
import { useFleetQuality, useFleetStatus } from "@/hooks/useFleetMonitor";
import type { BotQualityEntry } from "@/api/fleet-monitor";

// The widget's FleetQualityData shape (its interfaces are component-local).
type Grade = "S" | "A" | "B" | "C" | "D" | "F";
type Trend = "improving" | "stable" | "declining";
interface Dimensions {
  effectiveness: number;
  reliability: number;
  experience: number;
  engagement: number;
}
interface BotRow {
  botId: string;
  botName: string;
  botEmoji: string;
  overall: number;
  grade: Grade;
  trend: Trend;
  comparedToFleetAvg: number;
  dimensions: Dimensions;
}
interface FleetQualityData {
  fleetAvg: number;
  fleetGrade: Grade;
  dimensions: Dimensions;
  bots: BotRow[];
  trend7d: number[];
}

// ── Preview fallback data ───────────────────────────────────────────────────

const MOCK_DATA: FleetQualityData = {
  fleetAvg: 82,
  fleetGrade: "B",
  dimensions: {
    effectiveness: 88,
    reliability: 91,
    experience: 74,
    engagement: 71,
  },
  trend7d: [78, 79, 80, 81, 80, 82, 82],
  bots: [
    {
      botId: "lobster-01",
      botName: "小龍蝦",
      botEmoji: "🦞",
      overall: 91,
      grade: "A",
      trend: "improving",
      comparedToFleetAvg: 11,
      dimensions: { effectiveness: 95, reliability: 94, experience: 85, engagement: 88 },
    },
    {
      botId: "squirrel-01",
      botName: "飛鼠",
      botEmoji: "🐿️",
      overall: 84,
      grade: "B",
      trend: "stable",
      comparedToFleetAvg: 2,
      dimensions: { effectiveness: 88, reliability: 92, experience: 76, engagement: 78 },
    },
    {
      botId: "boar-01",
      botName: "山豬",
      botEmoji: "🐗",
      overall: 71,
      grade: "C",
      trend: "declining",
      comparedToFleetAvg: -13,
      dimensions: { effectiveness: 79, reliability: 86, experience: 61, engagement: 56 },
    },
  ],
};

// ── Component ───────────────────────────────────────────────────────────────

export function QualityIndexPanel() {
  const { data, isLoading, isError } = useFleetQuality();
  const { data: fleet } = useFleetStatus();

  // botId → { name, emoji } from live fleet status, for leaderboard enrichment.
  const identityMap = useMemo(() => {
    const map = new Map<string, { name: string; emoji: string }>();
    for (const bot of fleet?.bots ?? []) {
      map.set(bot.botId, { name: bot.name, emoji: bot.emoji });
    }
    return map;
  }, [fleet]);

  const liveData = useMemo<FleetQualityData | null>(() => {
    const q = data?.quality;
    if (!q || q.bots.length === 0) return null;
    return {
      fleetAvg: Math.round(q.fleetAvg),
      fleetGrade: q.fleetGrade,
      dimensions: {
        effectiveness: Math.round(q.dimensions.effectiveness),
        reliability: Math.round(q.dimensions.reliability),
        experience: Math.round(q.dimensions.experience),
        engagement: Math.round(q.dimensions.engagement),
      },
      trend7d: q.trend7d,
      bots: q.bots.map((b: BotQualityEntry) => {
        const id = identityMap.get(b.botId);
        return {
          botId: b.botId,
          botName: id?.name ?? b.botId,
          botEmoji: id?.emoji ?? "🤖",
          overall: b.overall,
          grade: b.grade,
          trend: b.trend,
          comparedToFleetAvg: Math.round(b.comparedToFleetAvg),
          dimensions: b.dimensions,
        };
      }),
    };
  }, [data, identityMap]);

  const isLive = liveData !== null;
  const display = isLive ? liveData : MOCK_DATA;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading conversation quality…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live / Preview status row */}
      <div className="flex items-center justify-between">
        <span
          className={
            isLive
              ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
          }
        >
          <span
            className={
              isLive
                ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                : "h-1.5 w-1.5 rounded-full bg-amber-500"
            }
          />
          {isLive ? "Live" : "Preview"}
        </span>
        {!isLive && (
          <span className="text-xs text-muted-foreground">
            Showing demo data — CQI populates after bots process conversations
          </span>
        )}
      </div>

      {/* Error banner (live query failed but we still render the demo widget) */}
      {isError && !isLive && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load quality data. The fleet monitor may be offline.
        </div>
      )}

      <QualityIndex data={display} />
    </div>
  );
}
