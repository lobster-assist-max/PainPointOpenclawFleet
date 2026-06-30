/**
 * Fleet Voice Intelligence page.
 *
 * Surfaces voice-call analytics across the fleet: a fleet-wide summary (call
 * volume, MOS/ASR quality, sentiment distribution, survey completion), the
 * currently active calls, detected voice anomalies (abnormal hangups, ASR
 * degradation, excessive silence, survey abandonment), and survey funnel
 * analytics. Backed by the VoiceIntelligenceEngine (fleet-voice-intelligence.ts)
 * exposed at /fleet-monitor/voice/*.
 *
 * Call data is populated once a gateway forwards voice events to the engine's
 * ingest API; until then the page renders a Preview fallback so the feature is
 * still demonstrable. Live data flips the header badge to "Live".
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import {
  useVoiceSummary,
  useVoiceActiveCalls,
  useVoiceAnomalies,
  useVoiceSurvey,
  timeAgo,
  useFleetStatus,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import type {
  FleetVoiceSummary,
  VoiceActiveCall,
  VoiceAnomaly,
  VoiceAnomalyType,
  VoiceSurveyAnalytics,
  VoiceSentimentLabel,
} from "@/api/fleet-monitor";
import {
  AlertTriangle,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Mic,
  Radio,
  ClipboardList,
} from "lucide-react";

// ─── Mock fallback (Preview mode) ───────────────────────────────────────────

const MOCK_SUMMARY: FleetVoiceSummary = {
  totalCalls: 1284,
  activeCalls: 3,
  avgMosScore: 4.18,
  avgAsrConfidence: 0.912,
  avgCallDurationSec: 196,
  completionRate: 0.74,
  anomalyCount: 5,
  sentimentDistribution: { positive: 712, neutral: 401, negative: 138, mixed: 33 },
  topAnomalies: [],
};

const MOCK_ACTIVE: VoiceActiveCall[] = [
  {
    callId: "call-mock-1",
    botId: "lobster-01",
    sessionKey: "sess-1",
    direction: "outbound",
    startedAt: new Date(Date.now() - 84_000).toISOString(),
    channel: "phone",
    currentDurationSec: 84,
    lastActivityAt: Date.now() - 4_000,
  },
  {
    callId: "call-mock-2",
    botId: "squirrel-01",
    sessionKey: "sess-2",
    direction: "inbound",
    startedAt: new Date(Date.now() - 31_000).toISOString(),
    channel: "phone",
    currentDurationSec: 31,
    lastActivityAt: Date.now() - 1_500,
  },
];

const MOCK_ANOMALIES: VoiceAnomaly[] = [
  {
    id: "va-1",
    type: "abnormal_hangup",
    severity: "warning",
    callId: "call-mock-9",
    botId: "lobster-01",
    description: "Call terminated after only 4s with status \"failed\" (terminated by: callee)",
    detectedAt: new Date(Date.now() - 600_000).toISOString(),
    metadata: {},
  },
  {
    id: "va-2",
    type: "survey_abandonment",
    severity: "info",
    callId: "call-mock-7",
    botId: "squirrel-01",
    description: "Survey abandoned at question 2 of 5 (40% complete)",
    detectedAt: new Date(Date.now() - 1_800_000).toISOString(),
    metadata: {},
  },
  {
    id: "va-3",
    type: "asr_degradation",
    severity: "critical",
    callId: "call-mock-3",
    botId: "boar-01",
    description: "ASR confidence dropped to 0.61 (below 0.70 threshold) across 12 samples",
    detectedAt: new Date(Date.now() - 3_600_000).toISOString(),
    metadata: {},
  },
];

const MOCK_SURVEY: VoiceSurveyAnalytics = {
  totalSurveys: 642,
  completedSurveys: 475,
  avgCompletionRate: 0.74,
  avgQuestionsAnswered: 3.7,
  questionDropoff: { "0": 642, "1": 588, "2": 531, "3": 498, "4": 475 },
};

// ─── Display helpers ────────────────────────────────────────────────────────

const ANOMALY_TYPE_LABEL: Record<VoiceAnomalyType, string> = {
  excessive_silence: "Excessive silence",
  abnormal_hangup: "Abnormal hangup",
  asr_degradation: "ASR degradation",
  unusual_call_duration: "Unusual duration",
  high_interruption_rate: "High interruptions",
  survey_abandonment: "Survey abandonment",
};

const SENTIMENT_LABEL: Record<VoiceSentimentLabel, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  mixed: "Mixed",
};

const SENTIMENT_BAR: Record<VoiceSentimentLabel, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-muted-foreground/50",
  negative: "bg-red-500",
  mixed: "bg-amber-500",
};

const ANOMALY_TABS: { key: VoiceAnomalyType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "abnormal_hangup", label: "Hangups" },
  { key: "asr_degradation", label: "ASR" },
  { key: "excessive_silence", label: "Silence" },
  { key: "survey_abandonment", label: "Survey" },
];

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "warning":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
  }
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

export function Voice() {
  const [activeTab, setActiveTab] = useState<VoiceAnomalyType | "all">("all");
  const typeFilter = activeTab === "all" ? undefined : activeTab;

  const { data: summaryData, isLoading, isError } = useVoiceSummary();
  const { data: activeData } = useVoiceActiveCalls();
  const { data: anomaliesData } = useVoiceAnomalies(typeFilter);
  const { data: surveyData } = useVoiceSurvey();
  const { data: fleet } = useFleetStatus();

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Voice" }]);
  }, [setBreadcrumbs]);

  // botId → emoji/name lookup from live fleet status.
  const botLabel = useMemo(() => {
    const map = new Map<string, { emoji: string; name: string }>();
    for (const bot of fleet?.bots ?? []) {
      map.set(bot.botId, { emoji: bot.emoji ?? "\u{1F916}", name: bot.name ?? bot.botId });
    }
    return (botId: string) => map.get(botId) ?? { emoji: "\u{1F916}", name: botId };
  }, [fleet]);

  // Live vs Preview: live only when the engine has actually seen call activity.
  const liveSummary = summaryData?.summary;
  const isLive =
    !!liveSummary &&
    (liveSummary.totalCalls > 0 ||
      liveSummary.activeCalls > 0 ||
      liveSummary.anomalyCount > 0);

  const summary = isLive ? liveSummary! : MOCK_SUMMARY;
  const activeCalls = isLive ? activeData?.calls ?? [] : MOCK_ACTIVE;
  const anomaliesAll = isLive ? anomaliesData?.anomalies ?? [] : MOCK_ANOMALIES;
  const anomalies =
    !isLive && typeFilter ? anomaliesAll.filter((a) => a.type === typeFilter) : anomaliesAll;
  const survey = isLive ? surveyData?.survey ?? MOCK_SURVEY : MOCK_SURVEY;

  const sentimentTotal =
    Object.values(summary.sentimentDistribution).reduce((a, b) => a + b, 0) || 1;

  const dropoffEntries = Object.entries(survey.questionDropoff).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  const dropoffMax = dropoffEntries.length > 0 ? Number(dropoffEntries[0][1]) || 1 : 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Voice Intelligence</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Call quality, sentiment, ASR health, survey completion &amp; voice anomalies
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            isLive
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isLive ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          {isLive ? "Live" : "Preview"}
        </span>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          Failed to load voice analytics. The fleet monitor may be offline.
        </div>
      )}

      {!isLive && !isError && (
        <div className="flex items-center gap-2 rounded-md border border-teal-500/30 bg-teal-50 dark:bg-teal-950/30 px-3 py-2 text-xs text-teal-700 dark:text-teal-300">
          <Radio className="h-3.5 w-3.5 flex-shrink-0" />
          Preview data shown. Live metrics appear once a gateway forwards voice call events.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading voice analytics...
        </div>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Total Calls" value={summary.totalCalls.toLocaleString()} />
            <MetricCard label="Active" value={String(summary.activeCalls)} hint="in progress" />
            <MetricCard label="Avg MOS" value={summary.avgMosScore.toFixed(2)} hint="of 5.0" />
            <MetricCard
              label="ASR Confidence"
              value={`${Math.round(summary.avgAsrConfidence * 100)}%`}
            />
            <MetricCard label="Avg Duration" value={fmtDuration(summary.avgCallDurationSec)} />
            <MetricCard
              label="Survey Completion"
              value={`${Math.round(summary.completionRate * 100)}%`}
            />
          </div>

          {/* Sentiment distribution */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Sentiment distribution
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {(Object.keys(summary.sentimentDistribution) as VoiceSentimentLabel[]).map((k) => {
                const pct = (summary.sentimentDistribution[k] / sentimentTotal) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={k}
                    className={SENTIMENT_BAR[k]}
                    style={{ width: `${pct}%` }}
                    title={`${SENTIMENT_LABEL[k]}: ${summary.sentimentDistribution[k]}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {(Object.keys(summary.sentimentDistribution) as VoiceSentimentLabel[]).map((k) => (
                <div key={k} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-full", SENTIMENT_BAR[k])} aria-hidden="true" />
                  {SENTIMENT_LABEL[k]}
                  <span className="font-semibold text-foreground">
                    {summary.sentimentDistribution[k]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Active calls */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <PhoneCall className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Active Calls</h2>
                <span className="text-xs text-muted-foreground">({activeCalls.length})</span>
              </div>
              {activeCalls.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  No calls in progress.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeCalls.map((call) => {
                    const { emoji, name } = botLabel(call.botId);
                    const Icon = call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
                    return (
                      <div
                        key={call.callId}
                        className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
                      >
                        <Icon className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        <Link
                          to={`/bots/${call.botId}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs"
                        >
                          <span>{emoji}</span>
                          {name}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">{call.channel}</span>
                        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                          {fmtDuration(call.currentDurationSec)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Survey funnel */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Survey Funnel</h2>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {survey.completedSurveys}/{survey.totalSurveys} completed ·{" "}
                  {survey.avgQuestionsAnswered} avg answered
                </span>
              </div>
              {dropoffEntries.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  No survey data yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {dropoffEntries.map(([idx, count]) => {
                    const pct = (Number(count) / dropoffMax) * 100;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-12 text-[10px] text-muted-foreground">Q{Number(idx) + 1}</span>
                        <div
                          className="flex-1 h-2 rounded-full bg-muted overflow-hidden"
                          role="progressbar"
                          aria-valuenow={Math.round(pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Question ${Number(idx) + 1} reached by ${count} calls`}
                        >
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Anomalies */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mic className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Voice Anomalies</h2>
              <span className="text-xs text-muted-foreground">({anomalies.length})</span>
            </div>

            {/* Type tabs */}
            <div className="flex items-center gap-1 border-b border-border overflow-x-auto mb-3">
              {ANOMALY_TABS.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={activeTab === tab.key}
                  className={cn(
                    "relative px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                    activeTab === tab.key
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
                  )}
                </button>
              ))}
            </div>

            {anomalies.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No anomalies detected{activeTab !== "all" ? " for this type" : ""}.
              </div>
            ) : (
              <div className="space-y-2">
                {anomalies.map((a) => {
                  const { emoji, name } = botLabel(a.botId);
                  return (
                    <div
                      key={a.id}
                      className="flex items-start gap-2 rounded-md border border-border bg-background p-2"
                    >
                      <AlertTriangle
                        className={cn(
                          "h-3.5 w-3.5 flex-shrink-0 mt-0.5",
                          a.severity === "critical"
                            ? "text-red-500"
                            : a.severity === "warning"
                              ? "text-amber-500"
                              : "text-blue-500",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                              severityBadgeClass(a.severity),
                            )}
                          >
                            {ANOMALY_TYPE_LABEL[a.type]}
                          </span>
                          <Link
                            to={`/bots/${a.botId}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs"
                          >
                            <span>{emoji}</span>
                            {name}
                          </Link>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(a.detectedAt)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-foreground">{a.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
