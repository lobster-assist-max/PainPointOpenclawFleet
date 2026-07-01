/**
 * CustomerJourneyWidget — Cross-Bot Customer Journey Intelligence
 *
 * Displays customer journey timelines, conversion funnels, dropoff hotspots,
 * and path analytics. Shows how customers move across bots and channels.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fleetMonitorApi } from "../../api/fleet-monitor";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface JourneyTouchpoint {
  timestamp: string;
  botId: string;
  botName: string;
  channel: string;
  summary: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  turnCount: number;
  durationMinutes: number;
  cost: number;
  cqi?: number;
  resolved: boolean;
}

interface CustomerJourney {
  customerId: string;
  touchpoints: JourneyTouchpoint[];
  stage: string;
  health: {
    totalTouchpoints: number;
    uniqueBots: number;
    uniqueChannels: number;
    totalDurationDays: number;
    avgResponseSatisfaction: number;
    handoffSmoothness: number;
    dropoffRisk: number;
  };
  firstSeen: string;
  lastSeen: string;
}

interface JourneyAnalytics {
  totalJourneys: number;
  activeJourneys: number;
  convertedMTD: number;
  atRiskCount: number;
  commonPaths: Array<{
    path: string[];
    frequency: number;
    avgConversionRate: number;
    avgDurationDays: number;
  }>;
  dropoffPoints: Array<{
    stage: string;
    afterBot: string;
    afterChannel: string;
    dropoffRate: number;
  }>;
  stageDistribution: Record<string, number>;
}

interface JourneyFunnel {
  stages: Array<{
    name: string;
    count: number;
    percentage: number;
    dropoffFromPrevious: number;
  }>;
  overallConversionRate: number;
}

// ─── Stage color mapping ────────────────────────────────────────────────────

const STAGE_CLASSES: Record<string, string> = {
  awareness: "bg-yellow-500",
  consideration: "bg-blue-500",
  decision: "bg-primary",
  purchase: "bg-emerald-500",
  retention: "bg-emerald-500",
  churned: "bg-red-500",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatsBar({ analytics }: { analytics: JourneyAnalytics }) {
  return (
    <div className="flex gap-6 p-4 border-b border-border flex-wrap">
      <StatCard label="Active Journeys" value={analytics.activeJourneys} />
      <StatCard label="Converted (MTD)" value={analytics.convertedMTD} className="text-emerald-500" />
      <StatCard label="At Risk" value={analytics.atRiskCount} className="text-red-500" />
      <StatCard label="Total Journeys" value={analytics.totalJourneys} />
    </div>
  );
}

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="text-center">
      <div className={cn("text-2xl font-bold text-foreground", className)}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function JourneyTimeline({ journey }: { journey: CustomerJourney }) {
  const sentimentEmoji = { positive: "😊", neutral: "😐", negative: "😟" };

  return (
    <div className="border border-border rounded-lg p-4 mb-3 bg-background">
      <div className="flex justify-between mb-2">
        <span className="font-bold text-sm">
          {journey.customerId.slice(0, 16)}...
        </span>
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[0.7rem] font-bold text-white",
          STAGE_CLASSES[journey.stage] ?? "bg-muted-foreground",
        )}>
          {journey.stage}
        </span>
      </div>

      {/* Timeline */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {journey.touchpoints.map((tp, i) => (
          <div key={i} className="flex flex-col items-center min-w-[80px] text-[0.7rem]">
            <div className="font-bold">{tp.botName}</div>
            <div className="text-muted-foreground">{tp.channel}</div>
            <div className={cn(
              "w-2 h-2 rounded-full my-1",
              tp.resolved ? "bg-emerald-500" : "bg-yellow-500",
            )} />
            <div>{sentimentEmoji[tp.sentiment]}</div>
            <div className="text-muted-foreground">{tp.intent}</div>
            {tp.cqi !== undefined && (
              <div className="text-primary font-bold">CQI:{tp.cqi}</div>
            )}
          </div>
        ))}
      </div>

      {/* Health bar */}
      <div className="flex gap-4 text-[0.7rem] text-muted-foreground">
        <span>Health: {Math.round(journey.health.avgResponseSatisfaction)}/100</span>
        <span>Handoff: {journey.health.handoffSmoothness}%</span>
        <span className={cn(
          journey.health.dropoffRisk > 0.5 ? "text-red-500" : "text-muted-foreground",
        )}>
          Dropoff Risk: {Math.round(journey.health.dropoffRisk * 100)}%
        </span>
      </div>
    </div>
  );
}

function CommonPaths({ paths }: { paths: JourneyAnalytics["commonPaths"] }) {
  if (paths.length === 0) return null;

  return (
    <div className="p-4">
      <h4 className="mb-2 text-sm font-medium text-foreground">
        Common Journey Paths
      </h4>
      {paths.slice(0, 5).map((path, i) => (
        <div key={i} className="flex justify-between items-center p-2 border-b border-border text-xs">
          <div className="flex-1">
            <span className="font-bold">{i + 1}.</span>{" "}
            {path.path.join(" → ")}
          </div>
          <div className="flex gap-4 text-muted-foreground">
            <span>{path.frequency}x</span>
            <span className={cn(
              path.avgConversionRate > 0.3 ? "text-emerald-500 dark:text-emerald-400 font-bold" : "text-muted-foreground",
            )}>
              {Math.round(path.avgConversionRate * 100)}% conv
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DropoffHotspots({ dropoffs }: { dropoffs: JourneyAnalytics["dropoffPoints"] }) {
  if (dropoffs.length === 0) return null;

  return (
    <div className="p-4">
      <h4 className="mb-2 text-sm font-medium text-foreground">
        Dropoff Hotspots
      </h4>
      {dropoffs.slice(0, 5).map((dp, i) => (
        <div key={i} className="p-2 border-l-[3px] border-red-500 mb-2 pl-3 text-xs">
          <div>
            <strong>{Math.round(dp.dropoffRate * 100)}%</strong> drop off after{" "}
            <strong>{dp.afterBot}</strong> ({dp.afterChannel})
          </div>
          <div className="text-muted-foreground">Stage: {dp.stage}</div>
        </div>
      ))}
    </div>
  );
}

function ConversionFunnel({ funnel }: { funnel: JourneyFunnel }) {
  const maxCount = Math.max(...funnel.stages.map((s) => s.count), 1);

  return (
    <div className="p-4">
      <h4 className="mb-2 text-sm font-medium text-foreground">
        Conversion Funnel ({Math.round(funnel.overallConversionRate * 100)}% overall)
      </h4>
      {funnel.stages.map((stage, i) => (
        <div key={i} className="mb-2">
          <div className="flex justify-between text-xs">
            <span className="capitalize">{stage.name}</span>
            <span>
              {stage.count} ({stage.percentage}%)
              {stage.dropoffFromPrevious > 0 && (
                <span className="text-red-500 ml-2">
                  -{stage.dropoffFromPrevious}%
                </span>
              )}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(stage.count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type TabView = "overview" | "journeys" | "funnel" | "paths";

export function CustomerJourneyWidget() {
  const [activeTab, setActiveTab] = useState<TabView>("overview");
  const { selectedCompanyId } = useCompany();

  const { data: analyticsData, isLoading: analyticsLoading, isError: analyticsError } = useQuery({
    queryKey: ["fleet", "journeys", "analytics", selectedCompanyId],
    queryFn: () => fleetMonitorApi.journeyAnalytics(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const { data: journeysData, isLoading: journeysLoading, isError: journeysError } = useQuery({
    queryKey: ["fleet", "journeys", "list", selectedCompanyId],
    queryFn: () =>
      fleetMonitorApi.journeys({
        companyId: selectedCompanyId ?? undefined,
        limit: 10,
        atRiskOnly: false,
      }),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const { data: funnelData, isLoading: funnelLoading, isError: funnelError } = useQuery({
    queryKey: ["fleet", "journeys", "funnel", selectedCompanyId],
    queryFn: () => fleetMonitorApi.journeyFunnel(selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const isLoading = analyticsLoading || journeysLoading || funnelLoading;
  const isError = analyticsError || journeysError || funnelError;

  const analytics = analyticsData as JourneyAnalytics | undefined;
  const journeys = (journeysData as { journeys: CustomerJourney[] } | undefined)?.journeys;
  const funnel = funnelData as JourneyFunnel | undefined;

  const tabs: Array<{ key: TabView; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "journeys", label: "Journeys" },
    { key: "funnel", label: "Funnel" },
    { key: "paths", label: "Paths" },
  ];

  return (
    <div className="border border-border rounded-xl bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <h3 className="text-base font-medium text-foreground">
          Customer Journey Intelligence
        </h3>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[0.7rem] transition-colors",
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      {analytics && <StatsBar analytics={analytics} />}

      {/* Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {activeTab === "overview" && analytics && (
          <>
            <CommonPaths paths={analytics.commonPaths} />
            <DropoffHotspots dropoffs={analytics.dropoffPoints} />
          </>
        )}

        {activeTab === "journeys" && journeys && (
          <div className="p-4">
            {journeys.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No journeys tracked yet. Connect bots to start tracking.
              </div>
            ) : (
              journeys.map((j) => <JourneyTimeline key={j.customerId} journey={j} />)
            )}
          </div>
        )}

        {activeTab === "funnel" && funnel && <ConversionFunnel funnel={funnel} />}

        {activeTab === "paths" && analytics && (
          <CommonPaths paths={analytics.commonPaths} />
        )}

        {isError && (
          <div className="text-center text-red-500 dark:text-red-400 py-8 text-sm">
            ⚠ Failed to load journey data. Fleet monitor may be offline.
          </div>
        )}

        {isLoading && !analytics && !isError && (
          <div className="text-center text-muted-foreground py-8">
            Loading journey data...
          </div>
        )}
      </div>
    </div>
  );
}
