/**
 * CustomerJourneyWidget — Cross-Bot Customer Journey Intelligence
 *
 * Displays customer journey timelines, conversion funnels, dropoff hotspots,
 * and path analytics. Shows how customers move across bots and channels.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fleetMonitorApi } from "../../api/fleet-monitor";
import { FLEET_COLORS } from "./design-tokens";

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

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatsBar({ analytics }: { analytics: JourneyAnalytics }) {
  return (
    <div style={{
      display: "flex",
      gap: "1.5rem",
      padding: "1rem",
      borderBottom: `1px solid ${FLEET_COLORS.border}`,
      flexWrap: "wrap",
    }}>
      <StatCard label="Active Journeys" value={analytics.activeJourneys} />
      <StatCard label="Converted (MTD)" value={analytics.convertedMTD} color={FLEET_COLORS.online} />
      <StatCard label="At Risk" value={analytics.atRiskCount} color={FLEET_COLORS.error} />
      <StatCard label="Total Journeys" value={analytics.totalJourneys} />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: color ?? FLEET_COLORS.foreground }}>
        {value}
      </div>
      <div style={{ fontSize: "0.75rem", color: FLEET_COLORS.muted }}>{label}</div>
    </div>
  );
}

function JourneyTimeline({ journey }: { journey: CustomerJourney }) {
  const sentimentEmoji = { positive: "😊", neutral: "😐", negative: "😟" };
  const stageColors: Record<string, string> = {
    awareness: FLEET_COLORS.idle,
    consideration: FLEET_COLORS.working,
    decision: FLEET_COLORS.accent,
    purchase: FLEET_COLORS.online,
    retention: FLEET_COLORS.online,
    churned: FLEET_COLORS.error,
  };

  return (
    <div style={{
      border: `1px solid ${FLEET_COLORS.border}`,
      borderRadius: "8px",
      padding: "1rem",
      marginBottom: "0.75rem",
      background: FLEET_COLORS.background,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span style={{ fontWeight: "bold", fontSize: "0.85rem" }}>
          {journey.customerId.slice(0, 16)}...
        </span>
        <span style={{
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "0.7rem",
          fontWeight: "bold",
          background: stageColors[journey.stage] ?? FLEET_COLORS.muted,
          color: "#fff",
        }}>
          {journey.stage}
        </span>
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", gap: "0.25rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
        {journey.touchpoints.map((tp, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minWidth: "80px",
            fontSize: "0.7rem",
          }}>
            <div style={{ fontWeight: "bold" }}>{tp.botName}</div>
            <div style={{ color: FLEET_COLORS.muted }}>{tp.channel}</div>
            <div style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: tp.resolved ? FLEET_COLORS.online : FLEET_COLORS.idle,
              margin: "4px 0",
            }} />
            <div>{sentimentEmoji[tp.sentiment]}</div>
            <div style={{ color: FLEET_COLORS.muted }}>{tp.intent}</div>
            {tp.cqi !== undefined && (
              <div style={{ color: FLEET_COLORS.accent, fontWeight: "bold" }}>CQI:{tp.cqi}</div>
            )}
          </div>
        ))}
      </div>

      {/* Health bar */}
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.7rem", color: FLEET_COLORS.muted }}>
        <span>Health: {Math.round(journey.health.avgResponseSatisfaction)}/100</span>
        <span>Handoff: {journey.health.handoffSmoothness}%</span>
        <span style={{
          color: journey.health.dropoffRisk > 0.5 ? FLEET_COLORS.error : FLEET_COLORS.muted,
        }}>
          Dropoff Risk: {Math.round(journey.health.dropoffRisk * 100)}%
        </span>
      </div>
    </div>
  );
}

function CommonPaths({ paths }: { paths: JourneyAnalytics["commonPaths"] }) {
  if (paths.length === 0) return null;

  return (
    <div style={{ padding: "1rem" }}>
      <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: FLEET_COLORS.foreground }}>
        Common Journey Paths
      </h4>
      {paths.slice(0, 5).map((path, i) => (
        <div key={i} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.5rem",
          borderBottom: `1px solid ${FLEET_COLORS.border}`,
          fontSize: "0.75rem",
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: "bold" }}>{i + 1}.</span>{" "}
            {path.path.join(" → ")}
          </div>
          <div style={{ display: "flex", gap: "1rem", color: FLEET_COLORS.muted }}>
            <span>{path.frequency}x</span>
            <span style={{
              color: path.avgConversionRate > 0.3 ? FLEET_COLORS.online : FLEET_COLORS.muted,
              fontWeight: path.avgConversionRate > 0.3 ? "bold" : "normal",
            }}>
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
    <div style={{ padding: "1rem" }}>
      <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: FLEET_COLORS.foreground }}>
        Dropoff Hotspots
      </h4>
      {dropoffs.slice(0, 5).map((dp, i) => (
        <div key={i} style={{
          padding: "0.5rem",
          borderLeft: `3px solid ${FLEET_COLORS.error}`,
          marginBottom: "0.5rem",
          paddingLeft: "0.75rem",
          fontSize: "0.75rem",
        }}>
          <div>
            <strong>{Math.round(dp.dropoffRate * 100)}%</strong> drop off after{" "}
            <strong>{dp.afterBot}</strong> ({dp.afterChannel})
          </div>
          <div style={{ color: FLEET_COLORS.muted }}>Stage: {dp.stage}</div>
        </div>
      ))}
    </div>
  );
}

function ConversionFunnel({ funnel }: { funnel: JourneyFunnel }) {
  const maxCount = Math.max(...funnel.stages.map((s) => s.count), 1);

  return (
    <div style={{ padding: "1rem" }}>
      <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: FLEET_COLORS.foreground }}>
        Conversion Funnel ({Math.round(funnel.overallConversionRate * 100)}% overall)
      </h4>
      {funnel.stages.map((stage, i) => (
        <div key={i} style={{ marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
            <span style={{ textTransform: "capitalize" }}>{stage.name}</span>
            <span>
              {stage.count} ({stage.percentage}%)
              {stage.dropoffFromPrevious > 0 && (
                <span style={{ color: FLEET_COLORS.error, marginLeft: "0.5rem" }}>
                  -{stage.dropoffFromPrevious}%
                </span>
              )}
            </span>
          </div>
          <div style={{
            height: "6px",
            background: FLEET_COLORS.border,
            borderRadius: "3px",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${(stage.count / maxCount) * 100}%`,
              background: FLEET_COLORS.accent,
              borderRadius: "3px",
              transition: "width 0.5s ease",
            }} />
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

  const { data: analyticsData } = useQuery({
    queryKey: ["fleet", "journeys", "analytics"],
    queryFn: () => fleetMonitorApi.journeyAnalytics(),
    refetchInterval: 60_000,
  });

  const { data: journeysData } = useQuery({
    queryKey: ["fleet", "journeys", "list"],
    queryFn: () => fleetMonitorApi.journeys({ limit: 10, atRiskOnly: false }),
    refetchInterval: 60_000,
  });

  const { data: funnelData } = useQuery({
    queryKey: ["fleet", "journeys", "funnel"],
    queryFn: () => fleetMonitorApi.journeyFunnel(),
    refetchInterval: 60_000,
  });

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
    <div style={{
      border: `1px solid ${FLEET_COLORS.border}`,
      borderRadius: "12px",
      background: FLEET_COLORS.background,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "0.75rem 1rem",
        borderBottom: `1px solid ${FLEET_COLORS.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <h3 style={{ margin: 0, fontSize: "1rem", color: FLEET_COLORS.foreground }}>
          Customer Journey Intelligence
        </h3>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                fontSize: "0.7rem",
                cursor: "pointer",
                background: activeTab === tab.key ? FLEET_COLORS.accent : "transparent",
                color: activeTab === tab.key ? "#fff" : FLEET_COLORS.muted,
                fontWeight: activeTab === tab.key ? "bold" : "normal",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      {analytics && <StatsBar analytics={analytics} />}

      {/* Content */}
      <div style={{ maxHeight: "500px", overflowY: "auto" }}>
        {activeTab === "overview" && analytics && (
          <>
            <CommonPaths paths={analytics.commonPaths} />
            <DropoffHotspots dropoffs={analytics.dropoffPoints} />
          </>
        )}

        {activeTab === "journeys" && journeys && (
          <div style={{ padding: "1rem" }}>
            {journeys.length === 0 ? (
              <div style={{ textAlign: "center", color: FLEET_COLORS.muted, padding: "2rem" }}>
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

        {!analytics && (
          <div style={{ textAlign: "center", color: FLEET_COLORS.muted, padding: "2rem" }}>
            Loading journey data...
          </div>
        )}
      </div>
    </div>
  );
}
