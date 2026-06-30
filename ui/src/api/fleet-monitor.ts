/**
 * Fleet Monitor API client.
 *
 * Wraps REST calls to /api/fleet-monitor/* and /api/fleet-alerts/*
 * endpoints exposed by the Fleet backend services.
 */

import { api } from "./client";

// ---------------------------------------------------------------------------
// Types — mirroring server/src/services/fleet-*.ts
// ---------------------------------------------------------------------------

export type BotConnectionState =
  | "dormant"
  | "connecting"
  | "authenticating"
  | "monitoring"
  | "disconnected"
  | "backoff"
  | "error";

export interface BotHealthBreakdown {
  connectivity: number;
  responsiveness: number;
  efficiency: number;
  channels: number;
  cron: number;
}

export interface BotHealthScore {
  overall: number;
  breakdown: BotHealthBreakdown;
  trend: "improving" | "stable" | "degrading";
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface DataFreshness {
  lastUpdated: string; // ISO date
  source: "realtime" | "poll" | "cached";
  staleAfterMs: number;
}

export interface BotStatus {
  botId: string;
  agentId: string;
  name: string;
  emoji: string;
  connectionState: BotConnectionState;
  healthScore: BotHealthScore | null;
  freshness: DataFreshness;
  gatewayUrl: string;
  gatewayVersion: string | null;
  channels: ChannelStatus[];
  activeSessions: number;
  uptime: number | null; // ms
  /** Square avatar URL (uploaded or from identity) */
  avatar: string | null;
  /** Assigned fleet role ID (e.g. "ceo", "head-engineering") */
  roleId: string | null;
  /** Short bio / role description (1-2 sentences) */
  description: string | null;
  /** Context window usage: current tokens used */
  contextTokens: number | null;
  /** Context window usage: max tokens available */
  contextMaxTokens: number | null;
  /** Monthly cumulative token cost in USD */
  monthCostUsd: number | null;
  /** Monthly cost budget in USD (null = unlimited) */
  monthBudgetUsd: number | null;
  /** List of skill names available on this bot */
  skills: string[];
}

export interface FleetStatus {
  bots: BotStatus[];
  totalConnected: number;
  totalBots: number;
}

export interface ChannelStatus {
  name: string;
  type: string; // "line" | "telegram" | "discord" | "whatsapp" | "web"
  connected: boolean;
  lastMessageAt: string | null;
  messageCount24h: number;
}

export interface BotSession {
  sessionKey: string;
  title: string | null;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
}

export interface BotUsageReport {
  sessions: Array<{
    sessionKey: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  }>;
  total: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };
}

export interface BotAgentIdentity {
  name: string;
  emoji: string;
  avatar: string | null;
  description: string | null;
}

export interface BotCronJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

// Config Drift

export interface ConfigDriftEntry {
  configPath: string;
  severity: "critical" | "warning" | "info";
  values: Record<string, string[]>;
  recommendation: string;
}

export interface ConfigDriftReport {
  generatedAt: string;
  botsCompared: number;
  drifts: ConfigDriftEntry[];
  consistentCount: number;
}

// Channel Cost

export interface ChannelCostEntry {
  channel: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

// Heatmap

export interface HeatmapCell {
  date: string;
  avgHealthScore: number | null;
  events?: number;
}

// Agent Turn Trace

export interface TracePhase {
  type: "llm_think" | "llm_output" | "tool_call" | "tool_result" | "error";
  name?: string;
  startMs: number;
  durationMs: number;
  metadata?: {
    inputTokens?: number;
    outputTokens?: number;
    toolName?: string;
    errorMessage?: string;
  };
}

export interface AgentTurnTrace {
  traceId: string;
  botId: string;
  sessionKey?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: "running" | "completed" | "failed" | "cancelled";
  phases: TracePhase[];
  totalTokens: { input: number; output: number; cached: number };
}

// Bot Discovery (unified API)

export interface DiscoverBotResult {
  url: string;
  name: string;
  emoji: string;
  status: "online" | "offline" | "unknown";
  machine: string;
  source: "local-scan" | "mdns" | "tailscale" | "manual";
  port: number;
  host: string;
  gatewayVersion: string | null;
  skills: string[];
  identityRole: string | null;
}

// Gateway Discovery

export interface DiscoveredGateway {
  id: string;
  host: string;
  port: number;
  version: string | null;
  hostname: string | null;
  tls: boolean;
  url: string;
  discoveredAt: string;
  lastSeenAt: string;
}

// Bot Tags

export interface BotTag {
  id: string;
  botId: string;
  tag: string;
  label: string;
  color: string | null;
  category: "environment" | "channel" | "team" | "model" | "custom";
  autoAssigned: boolean;
  createdAt: string;
}

// Cost Budget

export interface CostBudget {
  id: string;
  scope: "fleet" | "bot" | "channel";
  scopeId: string;
  monthlyLimitUsd: number;
  alertThresholds: number[];
  action: "alert_only" | "alert_and_throttle";
  createdAt: string;
}

export interface BudgetStatus {
  budget: CostBudget;
  currentMonthSpend: number;
  percentUsed: number;
  projectedMonthEnd: number;
  daysRemaining: number;
  daysElapsed: number;
  dailyBurnRate: number;
  onTrack: boolean;
  breachedThresholds: number[];
}

// Intelligence Recommendations

export interface Recommendation {
  id: string;
  type: "cost_optimization" | "health_improvement" | "config_suggestion" | "capacity_warning";
  severity: "info" | "actionable" | "urgent";
  title: string;
  description: string;
  affectedBots: string[];
  suggestedAction: string;
  estimatedImpact: string;
  dataPoints: Array<{
    source: string;
    observation: string;
  }>;
  dismissed: boolean;
  createdAt: string;
}

export interface ConnectBotRequest {
  gatewayUrl: string;
  token: string;
  companyId: string;
}

export interface ConnectBotResponse {
  botId: string;
  identity: BotAgentIdentity;
  channels: ChannelStatus[];
  healthScore: BotHealthScore | null;
}

export interface TestConnectionResponse {
  ok: boolean;
  status: string;
  version: string | null;
  identity: BotAgentIdentity | null;
  channels?: ChannelStatus[];
  error: string | null;
}

// Alerts

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertState = "firing" | "acknowledged" | "resolved";

export interface FleetAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  state: AlertState;
  botId: string;
  botName: string;
  botEmoji: string;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
}

// Audit

export interface AuditEntry {
  id: string;
  companyId?: string;
  userId: string;
  userRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  result: "success" | "denied" | "error";
  ipAddress: string | null;
  rateLimited?: boolean;
  createdAt: string;
}

// ── Trust Graduation ──────────────────────────────────────────────────────

export interface TrustGraduationRequirement {
  name: string;
  description: string;
  current: number;
  target: number;
  met: boolean;
  trend: "improving" | "stable" | "declining";
}

export interface TrustProfile {
  botId: string;
  currentLevel: number;
  levelName: string;
  promotedAt: string;
  graduation: {
    nextLevel: number | null;
    requirements: TrustGraduationRequirement[];
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

export interface TrustDistribution {
  levels: Record<number, number>;
  avgLevel: number;
  promotionsPending: number;
  demotionsAtRisk: number;
}

// ── Ops Playbooks (mirrors server/src/services/fleet-playbook-engine.ts) ──

export interface PlaybookStepInfo {
  id: string;
  order: number;
  name: string;
  description: string;
  type: "check" | "action" | "decision" | "notification" | "wait" | "approval";
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  version: number;
  tags: string[];
  steps: PlaybookStepInfo[];
  metadata: {
    createdBy: string;
    createdAt: string;
    lastUsed?: string;
    timesExecuted: number;
    avgDurationMinutes: number;
    successRate: number;
  };
}

export interface PlaybookStepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

export interface PlaybookExecution {
  id: string;
  playbookId: string;
  playbookName: string;
  playbookVersion: number;
  triggeredBy: "auto" | "manual";
  targetBotId?: string;
  linkedIncidentId?: string;
  status: "running" | "paused" | "waiting_approval" | "completed" | "failed" | "aborted";
  startedAt: string;
  completedAt?: string;
  stepResults: PlaybookStepResult[];
  currentStepIndex: number;
}

export interface PlaybookStats {
  totalPlaybooks: number;
  executionsToday: number;
  activeExecutions: number;
  successRate: number;
}

// ── A2A Collaboration Mesh ──────────────────────────────────────────────────
// Shapes mirror the server FleetA2AMeshEngine (Date fields arrive as ISO strings).

export interface A2AExpertiseProfile {
  botId: string;
  botName: string;
  expertise: Array<{
    domain: string;
    confidence: number;
    source: "manual" | "auto" | "feedback";
    sampleCount: number;
    avgSatisfaction: number;
  }>;
  availability: {
    status: "online" | "busy" | "offline";
    currentLoad: number;
    maxConcurrent: number;
    avgResponseTime: number;
  };
}

export interface A2ACollaborationRecord {
  id: string;
  companyId: string;
  origin: {
    botId: string;
    sessionKey: string;
    userMessage: string;
    detectedTopic: string;
    confidence: number;
  };
  target: {
    botId: string;
    response: string | null;
    responseTime: number | null;
    confidence: number | null;
  };
  routing: {
    routeId: string | null;
    strategy: string;
    candidatesEvaluated: Array<{ botId: string; score: number; reason: string }>;
  };
  outcome: "success" | "failure" | "timeout" | "fallback" | null;
  trace: string[];
  status: "pending" | "in_progress" | "completed" | "failed" | "timed_out";
  initiatedAt: string;
  completedAt: string | null;
}

export interface A2ACollaborationStats {
  totalCollaborations: number;
  successRate: number;
  avgResponseTime: number;
  topRoutes: Array<{ routeId: string; count: number }>;
  topTargetBots: Array<{ botId: string; count: number; avgResponseTime: number }>;
  outcomeBreakdown: Record<string, number>;
  byDay: Array<{ date: string; count: number; successRate: number }>;
}

// ── Conversation Analytics ──────────────────────────────────────────────────
// Shapes mirror the server ConversationAnalyticsEngine (Date fields arrive as
// ISO strings). avgSentiment is -1..1; widgets rescale to 0-100 satisfaction.

export interface ConvTopicCluster {
  topic: string;
  count: number;
  avgSentiment: number;
  avgResolutionRate: number;
  topKeywords: string[];
  botDistribution: Record<string, number>;
}

export interface ConvKnowledgeGap {
  id: string;
  query: string;
  detectedAt: string;
  botId: string;
  sessionKey: string;
  deflectionPhrase: string;
  topic: string;
  frequency: number;
  severity: "low" | "medium" | "high";
}

export interface ConvKnowledgeGapReport {
  companyId: string;
  generatedAt: string;
  totalGaps: number;
  gaps: ConvKnowledgeGap[];
  topUnresolvedTopics: Array<{ topic: string; count: number }>;
}

export interface ConvSatisfactionPoint {
  timestamp: string;
  avgSentiment: number;
  sampleCount: number;
  positiveRate: number;
  negativeRate: number;
}

export interface ConvSatisfactionTrend {
  companyId: string;
  granularity: "hour" | "day" | "week";
  periodStart: string;
  periodEnd: string;
  dataPoints: ConvSatisfactionPoint[];
  overallAvg: number;
}

export interface ConvResolutionFunnel {
  companyId: string;
  generatedAt: string;
  total: number;
  resolved: number;
  partial: number;
  escalated: number;
  abandoned: number;
  unknown: number;
  resolutionRate: number;
}

export interface ConvInconsistencyRecord {
  id: string;
  topic: string;
  detectedAt: string;
  variants: Array<{
    botId: string;
    sessionKey: string;
    answer: string;
    sentiment: "positive" | "neutral" | "negative";
  }>;
  severity: "low" | "medium" | "high";
}

// ── Secrets Vault ────────────────────────────────────────────────────────────
// Shapes mirror the server FleetSecretsVaultService (Date fields arrive as ISO
// strings). Values are never returned — only hashes, metadata, and sync status.

export type VaultSecretCategory =
  | "api_key"
  | "oauth_token"
  | "password"
  | "certificate"
  | "webhook_secret"
  | "custom";

export type VaultBotSecretStatus =
  | "pending"
  | "pushed"
  | "verified"
  | "out_of_sync"
  | "error";

export interface VaultBotAssignment {
  botId: string;
  botName: string;
  configPath: string;
  lastPushed?: string;
  lastVerified?: string;
  status: VaultBotSecretStatus;
}

export interface VaultRotationHistoryEntry {
  rotatedAt: string;
  reason: string;
  actor: string;
  previousValueHash: string;
}

export interface VaultSecretRecord {
  id: string;
  companyId: string;
  name: string;
  category: VaultSecretCategory;
  description?: string;
  valueHash: string;
  assignedBots: VaultBotAssignment[];
  rotation: {
    policy: "manual" | "auto";
    intervalDays?: number;
    lastRotated: string;
    nextRotation?: string;
    history: VaultRotationHistoryEntry[];
  };
  expiresAt?: string;
  expirationWarningDays: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface VaultHealthAlert {
  secretId: string;
  secretName: string;
  type: "expiring_soon" | "expired" | "never_rotated" | "out_of_sync" | "overexposed";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export interface VaultHealthReport {
  companyId: string;
  generatedAt: string;
  summary: {
    totalSecrets: number;
    expiringSoon: number;
    expired: number;
    neverRotated: number;
    outOfSync: number;
    overexposed: number;
  };
  alerts: VaultHealthAlert[];
}

// ── Cost Optimizer ───────────────────────────────────────────────────────────
// Shapes mirror the server FleetCostOptimizerService. The breakdown is computed
// live from connected bots (populated immediately); findings/savings are empty
// until a scan runs / optimizations execute.

export type CostFindingType =
  | "model_bloat"
  | "session_sprawl"
  | "prompt_duplication"
  | "cron_waste"
  | "model_switching_delay"
  | "unused_skill"
  | "redundant_memory";

export type CostFindingSeverity = "low" | "medium" | "high" | "critical";

export type CostFindingStatus =
  | "open"
  | "approved"
  | "executing"
  | "executed"
  | "dismissed"
  | "failed";

export interface CostOptimizationFinding {
  id: string;
  type: CostFindingType;
  severity: CostFindingSeverity;
  botId: string;
  botName: string;
  description: string;
  evidence: {
    metric: string;
    currentValue: number;
    optimalValue: number;
    wastePercentage: number;
  };
  recommendation: {
    action: string;
    automatable: boolean;
    rpcMethod?: string;
    params?: Record<string, unknown>;
    estimatedSavings: {
      tokensPerDay: number;
      costPerDay: number;
      costPerMonth: number;
    };
    risk: "none" | "low" | "medium" | "high";
    reversible: boolean;
  };
  status: CostFindingStatus;
  detectedAt: string;
  executedAt?: string;
}

export interface FleetCostBreakdownEntry {
  botId: string;
  botName: string;
  model: string;
  dailyInputTokens: number;
  dailyOutputTokens: number;
  dailyCost: number;
  monthlyCost: number;
  estimatedWaste: number;
  wastePercentage: number;
  topWasteType: CostFindingType | null;
}

export interface FleetCostBreakdown {
  companyId: string;
  generatedAt: string;
  bots: FleetCostBreakdownEntry[];
  totals: {
    dailyCost: number;
    monthlyCost: number;
    estimatedWaste: number;
    wastePercentage: number;
  };
}

export interface CostSavingsRecord {
  id: string;
  companyId: string;
  findingId: string;
  type: CostFindingType;
  botId: string;
  savedAt: string;
  tokensSaved: number;
  costSaved: number;
}

export interface CostSavingsHistory {
  records: CostSavingsRecord[];
  totalTokensSaved: number;
  totalCostSaved: number;
  byType: Record<string, { count: number; tokensSaved: number; costSaved: number }>;
}

/** Full response of the health-heatmap endpoint (cells are HeatmapCell). */
export interface FleetHeatmapResponse {
  ok: boolean;
  companyId: string;
  days: number;
  botId: string | null;
  granularity: "daily" | "hourly";
  cells: HeatmapCell[];
}

// ── Plugin Inventory (mirrors server fleet-plugin-inventory service) ────────

export type PluginKind = "channel" | "memory" | "context-engine" | "tool" | "other";

export interface PluginInfo {
  id: string;
  kind: PluginKind;
  enabled: boolean;
  slot?: string;
  providedTools?: string[];
  providedChannels?: string[];
}

export interface BotPluginInventory {
  botId: string;
  botName: string;
  botEmoji: string;
  plugins: PluginInfo[];
  fetchedAt?: string;
}

export interface PluginDrift {
  pluginId: string;
  kind: string;
  present: string[];
  missing: string[];
  severity: "critical" | "warning" | "info";
  recommendation: string;
}

export interface PluginSlotConflict {
  slotName: string;
  /** pluginId → botIds. Server serializes its internal Map to this plain object. */
  values: Record<string, string[]>;
  recommendation: string;
}

export interface PluginDriftReport {
  drifts: PluginDrift[];
  slotConflicts: PluginSlotConflict[];
  totalPlugins: number;
  consistentPlugins: number;
  generatedAt?: string;
}

export interface PluginInventoryResponse {
  ok: boolean;
  inventories: BotPluginInventory[];
  driftReport: PluginDriftReport;
}

// ---------------------------------------------------------------------------
// Inter-Bot Communication Graph
// ---------------------------------------------------------------------------

export interface InterBotGraphNode {
  botId: string;
  name: string;
  emoji: string;
  healthScore: number;
  role: "leader" | "worker" | "specialist" | "autonomous";
  inDegree: number;
  outDegree: number;
  betweenness: number;
}

export interface InterBotGraphEdge {
  from: string;
  to: string;
  type: "message" | "spawn" | "delegation";
  weight: number;
  lastSeen: string;
  avgLatencyMs: number;
}

export interface InterBotGraphResponse {
  ok: boolean;
  graph: {
    nodes: InterBotGraphNode[];
    edges: InterBotGraphEdge[];
    policies: Array<{ botId: string; enabled: boolean; allowList: string[] }>;
    computedAt: string;
  };
}

export interface InterBotBlastResponse {
  ok: boolean;
  blastRadius: {
    offlineBot: string;
    affected: Record<string, "critical" | "high" | "medium" | "low">;
    totalImpacted: number;
  };
}

export type QualityGrade = "S" | "A" | "B" | "C" | "D" | "F";
export type QualityTrend = "improving" | "stable" | "declining";

export interface QualityDimensions {
  effectiveness: number;
  reliability: number;
  experience: number;
  engagement: number;
}

export interface BotQualityEntry {
  botId: string;
  overall: number;
  grade: QualityGrade;
  trend: QualityTrend;
  comparedToFleetAvg: number;
  dimensions: QualityDimensions;
}

export interface FleetQualityResponse {
  ok: boolean;
  quality: {
    fleetAvg: number;
    fleetGrade: QualityGrade;
    dimensions: QualityDimensions;
    bots: BotQualityEntry[];
    trend7d: number[];
  };
}

// ---------------------------------------------------------------------------
// Canary Lab (A/B experiments)
// ---------------------------------------------------------------------------

export interface CanaryMetricComparison {
  metric: string;
  controlMean: number;
  testMean: number;
  controlStdDev: number;
  testStdDev: number;
  delta: number;
  deltaPercent: number;
  pValue: number;
  significant: boolean;
  winner: "control" | "test" | "tie";
  sampleSize: { control: number; test: number };
}

export interface CanaryExperiment {
  id: string;
  name: string;
  hypothesis: string;
  status: "draft" | "running" | "paused" | "completed" | "aborted";
  controlGroup: { botIds: string[]; configSnapshot: Record<string, unknown> };
  testGroup: { botIds: string[]; configPatch: Record<string, unknown> };
  metrics: Array<{
    name: string;
    type: "higher_is_better" | "lower_is_better" | "closer_to_target";
    source: string;
    weight: number;
  }>;
  startedAt?: string;
  endAt?: string;
  minDurationMs: number;
  minSampleSize: number;
  guardrails: {
    abortIf: { healthBelow: number; errorRateAbove: number; costMultiplierAbove: number };
    rollbackOnAbort: boolean;
  };
  controlSampleCount: number;
  testSampleCount: number;
  result?: {
    comparisons: CanaryMetricComparison[];
    overallVerdict: "test_wins" | "control_wins" | "inconclusive";
    recommendation: string;
    totalSamples: { control: number; test: number };
  };
  createdAt: string;
}

export interface CanaryExperimentsResponse {
  ok: boolean;
  experiments: CanaryExperiment[];
}

// ---------------------------------------------------------------------------
// Capacity Planner (Holt-Winters forecasts)
// ---------------------------------------------------------------------------

export interface CapacityForecastPoint {
  date: string;
  predicted: number;
  confidenceLow: number;
  confidenceHigh: number;
}

export interface CapacitySaturation {
  threshold: number;
  projectedBreachDate: string | null;
  daysRemaining: number | null;
  confidence: number;
  recommendation: string;
}

export interface CapacityScenario {
  name: string;
  description: string;
  adjustments: Record<string, number>;
  projectedBreachDate: string | null;
  projectedTotal: number;
}

export interface CapacityForecast {
  metric: string;
  currentValue: number;
  currentDate: string;
  forecast: CapacityForecastPoint[];
  saturation?: CapacitySaturation;
  scenarios: CapacityScenario[];
  dataPointCount: number;
  historical: Array<{ date: string; value: number }>;
}

export interface CapacityForecastsResponse {
  ok: boolean;
  cost: CapacityForecast | null;
  sessions: CapacityForecast | null;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const fleetMonitorApi = {
  /** Get status of all connected bots in a fleet */
  status: (companyId: string) =>
    api.get<FleetStatus>(`/fleet-monitor/status?companyId=${encodeURIComponent(companyId)}`),

  /** Test connection to a Gateway without persisting */
  testConnection: (gatewayUrl: string, token: string) =>
    api.post<TestConnectionResponse>("/fleet-monitor/test-connection", { gatewayUrl, token }),

  /** Connect a new bot to the fleet */
  connect: (data: ConnectBotRequest) =>
    api.post<ConnectBotResponse>("/fleet-monitor/connect", data),

  /** Disconnect a bot */
  disconnect: (botId: string) =>
    api.delete<void>(`/fleet-monitor/disconnect/${encodeURIComponent(botId)}`),

  /** Get a specific bot's health */
  botHealth: (botId: string) =>
    api.get<{ health: BotHealthScore; freshness: DataFreshness }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/health`,
    ),

  /** Get a bot's sessions */
  botSessions: (botId: string) =>
    api.get<BotSession[]>(`/fleet-monitor/bot/${encodeURIComponent(botId)}/sessions`),

  /** Get a bot's token usage */
  botUsage: (botId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return api.get<BotUsageReport>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/usage${qs ? `?${qs}` : ""}`,
    );
  },

  /** Get a bot's identity */
  botIdentity: (botId: string) =>
    api.get<BotAgentIdentity>(`/fleet-monitor/bot/${encodeURIComponent(botId)}/identity`),

  /** Get a bot's channel statuses */
  botChannels: (botId: string) =>
    api.get<ChannelStatus[]>(`/fleet-monitor/bot/${encodeURIComponent(botId)}/channels`),

  /** Get a bot's cron jobs */
  botCron: (botId: string) =>
    api.get<BotCronJob[]>(`/fleet-monitor/bot/${encodeURIComponent(botId)}/cron`),

  /** Read a bot's file (IDENTITY.md, MEMORY.md, etc.) */
  botFile: (botId: string, filename: string) =>
    api.get<{ content: string }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/files/${encodeURIComponent(filename)}`,
    ),

  /** Get chat history for a session */
  chatHistory: (botId: string, sessionKey: string, limit = 50) =>
    api.get<{ ok: boolean; history: unknown }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/chat-history?sessionKey=${encodeURIComponent(sessionKey)}&limit=${limit}`,
    ),

  /** Get config drift report across fleet bots */
  configDrift: (companyId: string) =>
    api.get<ConfigDriftReport>(
      `/fleet-monitor/config-drift?companyId=${encodeURIComponent(companyId)}`,
    ),

  /** Get the health heatmap (averaged fleet_snapshots) for a company/bot */
  heatmap: (
    companyId: string,
    opts: { days?: number; granularity?: "daily" | "hourly"; botId?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.days) params.set("days", String(opts.days));
    if (opts.granularity) params.set("granularity", opts.granularity);
    if (opts.botId) params.set("botId", opts.botId);
    const qs = params.toString();
    return api.get<FleetHeatmapResponse>(
      `/fleet-monitor/fleet/${encodeURIComponent(companyId)}/heatmap${qs ? `?${qs}` : ""}`,
    );
  },

  /** Get cost breakdown by channel */
  costByChannel: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ companyId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return api.get<{ ok: boolean; channels: ChannelCostEntry[] }>(
      `/fleet-monitor/cost-by-channel?${params.toString()}`,
    );
  },

  // ── Agent Turn Traces ─────────────────────────────────────────────────

  /** Get recent completed traces for a bot */
  botTraces: (botId: string, limit = 50) =>
    api.get<{ ok: boolean; traces: AgentTurnTrace[] }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/traces?limit=${limit}`,
    ),

  /** Get a specific trace by runId */
  botTrace: (botId: string, runId: string) =>
    api.get<{ ok: boolean; trace: AgentTurnTrace }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/traces/${encodeURIComponent(runId)}`,
    ),

  /** Get the currently active trace */
  botActiveTrace: (botId: string) =>
    api.get<{ ok: boolean; trace: AgentTurnTrace | null }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/traces/active`,
    ),

  // ── Gateway Discovery ─────────────────────────────────────────────────

  /** List discovered gateways via mDNS */
  discovery: () =>
    api.get<{ ok: boolean; gateways: DiscoveredGateway[] }>(
      "/fleet-monitor/discovery",
    ),

  /** Trigger a fresh mDNS scan */
  discoveryRefresh: () =>
    api.post<{ ok: boolean; gateways: DiscoveredGateway[] }>(
      "/fleet-monitor/discovery/refresh",
      {},
    ),

  // ── Bot Tags ──────────────────────────────────────────────────────────

  /** Get all tags */
  tags: () => api.get<{ ok: boolean; tags: BotTag[] }>("/fleet-monitor/tags"),

  /** Add a tag to a bot */
  addTag: (botId: string, tag: string, label: string, color?: string, category?: string) =>
    api.post<{ ok: boolean }>(`/fleet-monitor/bot/${encodeURIComponent(botId)}/tags`, {
      tag,
      label,
      color,
      category,
    }),

  /** Remove a tag from a bot */
  removeTag: (botId: string, tag: string) =>
    api.delete<{ ok: boolean }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/tags/${encodeURIComponent(tag)}`,
    ),

  /** Auto-detect tags */
  autoDetectTags: () =>
    api.post<{ ok: boolean; detected: number }>("/fleet-monitor/tags/auto-detect", {}),

  // ── Cost Budgets ──────────────────────────────────────────────────────

  /** Get all budgets */
  budgets: () =>
    api.get<{ ok: boolean; budgets: CostBudget[] }>("/fleet-monitor/budgets"),

  /** Create a budget */
  createBudget: (data: Omit<CostBudget, "id" | "createdAt">) =>
    api.post<{ ok: boolean; budget: CostBudget }>("/fleet-monitor/budgets", data),

  /** Delete a budget */
  deleteBudget: (id: string) =>
    api.delete<{ ok: boolean }>(`/fleet-monitor/budgets/${encodeURIComponent(id)}`),

  /** Get budget statuses */
  budgetStatuses: () =>
    api.get<{ ok: boolean; statuses: BudgetStatus[] }>("/fleet-monitor/budgets/status"),

  // ─── Trust Graduation ──────────────────────────────────────────────────

  /** Get (lazily creating) a bot's trust profile */
  trustProfile: (botId: string) =>
    api.get<{ ok: boolean; profile: TrustProfile }>(
      `/fleet-monitor/trust/${encodeURIComponent(botId)}`,
    ),

  /** Get fleet-wide trust level distribution */
  trustDistribution: () =>
    api.get<{ ok: boolean; distribution: TrustDistribution }>(
      "/fleet-monitor/trust/distribution",
    ),

  /** Promote a bot to the next trust level */
  trustPromote: (botId: string, approvedBy?: string) =>
    api.post<{ ok: boolean; profile: TrustProfile }>(
      `/fleet-monitor/trust/${encodeURIComponent(botId)}/promote`,
      approvedBy ? { approvedBy } : {},
    ),

  /** Demote a bot one trust level */
  trustDemote: (botId: string, reason?: string) =>
    api.post<{ ok: boolean; profile: TrustProfile }>(
      `/fleet-monitor/trust/${encodeURIComponent(botId)}/demote`,
      reason ? { reason } : {},
    ),

  // ── Fleet Intelligence ────────────────────────────────────────────────

  /** Get recommendations */
  recommendations: () =>
    api.get<{ ok: boolean; recommendations: Recommendation[] }>(
      "/fleet-monitor/recommendations",
    ),

  /** Dismiss a recommendation */
  dismissRecommendation: (id: string) =>
    api.post<{ ok: boolean }>(
      `/fleet-monitor/recommendations/${encodeURIComponent(id)}/dismiss`,
      {},
    ),

  // ─── Ops Playbooks ─────────────────────────────────────────────────────

  /** List all available playbooks (built-ins are seeded server-side) */
  playbooks: () =>
    api.get<{ ok: boolean; playbooks: Playbook[] }>("/fleet-monitor/playbooks"),

  /** Get playbook execution statistics */
  playbookStats: () =>
    api.get<{ ok: boolean; stats: PlaybookStats }>("/fleet-monitor/playbooks/stats"),

  /** List playbook executions, optionally filtered by status */
  playbookExecutions: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return api.get<{ ok: boolean; executions: PlaybookExecution[] }>(
      `/fleet-monitor/playbooks/executions/list${qs}`,
    );
  },

  /** Execute a playbook */
  playbookExecute: (
    id: string,
    opts?: { triggeredBy?: "auto" | "manual"; targetBotId?: string },
  ) =>
    api.post<{ ok: boolean; execution: PlaybookExecution }>(
      `/fleet-monitor/playbooks/${encodeURIComponent(id)}/execute`,
      { triggeredBy: opts?.triggeredBy ?? "manual", targetBotId: opts?.targetBotId },
    ),

  /** Pause a running execution */
  playbookPause: (execId: string) =>
    api.post<{ ok: boolean; execution: PlaybookExecution }>(
      `/fleet-monitor/playbooks/executions/${encodeURIComponent(execId)}/pause`,
      {},
    ),

  /** Resume a paused execution */
  playbookResume: (execId: string) =>
    api.post<{ ok: boolean; execution: PlaybookExecution }>(
      `/fleet-monitor/playbooks/executions/${encodeURIComponent(execId)}/resume`,
      {},
    ),

  /** Abort a running execution */
  playbookAbort: (execId: string, reason?: string) =>
    api.post<{ ok: boolean; execution: PlaybookExecution }>(
      `/fleet-monitor/playbooks/executions/${encodeURIComponent(execId)}/abort`,
      reason ? { reason } : {},
    ),

  // ─── A2A Collaboration Mesh ────────────────────────────────────────────

  /** Get the expertise matrix for a company's fleet (empty until detected) */
  a2aExpertise: (companyId: string) =>
    api.get<{ ok: boolean; matrix: A2AExpertiseProfile[] }>(
      `/fleet-monitor/a2a/expertise/${encodeURIComponent(companyId)}`,
    ),

  /** Auto-detect a bot's expertise from its SOUL.md / IDENTITY.md (needs gateway) */
  a2aAutoDetect: (companyId: string, botId: string) =>
    api.post<{ ok: boolean; profile: A2AExpertiseProfile }>(
      `/fleet-monitor/a2a/expertise/${encodeURIComponent(companyId)}/${encodeURIComponent(botId)}/auto-detect`,
      {},
    ),

  /** Collaboration history for a company, optionally filtered */
  a2aCollaborations: (companyId: string, params?: { since?: string; botId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.since) qs.set("since", params.since);
    if (params?.botId) qs.set("botId", params.botId);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ ok: boolean; collaborations: A2ACollaborationRecord[] }>(
      `/fleet-monitor/a2a/collaborations/${encodeURIComponent(companyId)}${suffix}`,
    );
  },

  /** Aggregated collaboration stats for a time window */
  a2aStats: (companyId: string, periodStart: string, periodEnd: string) => {
    const qs = new URLSearchParams({ periodStart, periodEnd });
    return api.get<{ ok: boolean; stats: A2ACollaborationStats }>(
      `/fleet-monitor/a2a/stats/${encodeURIComponent(companyId)}?${qs.toString()}`,
    );
  },

  // ─── Conversation Analytics ────────────────────────────────────────────

  /** Topic clusters for a company (empty until conversations are analyzed) */
  conversationTopics: (companyId: string, period?: { periodStart: string; periodEnd: string }) => {
    const qs = new URLSearchParams();
    if (period) {
      qs.set("periodStart", period.periodStart);
      qs.set("periodEnd", period.periodEnd);
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ ok: boolean; data: ConvTopicCluster[] }>(
      `/fleet-monitor/topics/${encodeURIComponent(companyId)}${suffix}`,
    );
  },

  /** Knowledge gap report for a company */
  conversationGaps: (companyId: string) =>
    api.get<{ ok: boolean; data: ConvKnowledgeGapReport }>(
      `/fleet-monitor/gaps/${encodeURIComponent(companyId)}`,
    ),

  /** Satisfaction trend over a window */
  conversationSatisfaction: (
    companyId: string,
    periodStart: string,
    periodEnd: string,
    granularity: "hour" | "day" | "week" = "day",
  ) => {
    const qs = new URLSearchParams({ periodStart, periodEnd, granularity });
    return api.get<{ ok: boolean; data: ConvSatisfactionTrend }>(
      `/fleet-monitor/satisfaction/${encodeURIComponent(companyId)}?${qs.toString()}`,
    );
  },

  /** Resolution funnel for a company */
  conversationFunnel: (companyId: string) =>
    api.get<{ ok: boolean; data: ConvResolutionFunnel }>(
      `/fleet-monitor/funnel/${encodeURIComponent(companyId)}`,
    ),

  /** Cross-bot inconsistencies for a company */
  conversationInconsistencies: (companyId: string) =>
    api.get<{ ok: boolean; data: ConvInconsistencyRecord[] }>(
      `/fleet-monitor/inconsistencies/${encodeURIComponent(companyId)}`,
    ),

  /** Run a batch analysis of a bot's conversations (fetches sessions via gateway) */
  conversationAnalyze: (botId: string, companyId: string, opts?: { since?: string; limit?: number }) =>
    api.post<{ ok: boolean; data: { botId: string; companyId: string; sessionsAnalyzed: number } }>(
      `/fleet-monitor/analyze/${encodeURIComponent(botId)}`,
      { companyId, ...(opts?.since ? { since: opts.since } : {}), ...(opts?.limit ? { limit: opts.limit } : {}) },
    ),

  // ─── Secrets Vault ─────────────────────────────────────────────────────
  /** List a company's secrets (never returns values, only metadata + status) */
  secretsList: (companyId: string, opts?: { category?: VaultSecretCategory; tag?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.category) qs.set("category", opts.category);
    if (opts?.tag) qs.set("tag", opts.tag);
    const q = qs.toString();
    return api.get<{ ok: boolean; secrets: VaultSecretRecord[] }>(
      `/fleet-secrets/secrets/${encodeURIComponent(companyId)}${q ? `?${q}` : ""}`,
    );
  },

  /** Health report (expiring / out-of-sync / never-rotated alerts) for a company */
  secretsHealth: (companyId: string) =>
    api.get<{ ok: boolean; report: VaultHealthReport }>(
      `/fleet-secrets/health/${encodeURIComponent(companyId)}`,
    ),

  /** Push a secret to all its assigned bots via gateway RPC */
  secretPushAll: (secretId: string) =>
    api.post<{ ok: boolean; results: Array<{ botId: string; ok: boolean; error?: string }> }>(
      `/fleet-secrets/secrets/${encodeURIComponent(secretId)}/push-all`,
      {},
    ),

  /** Verify a secret's sync status across all assigned bots */
  secretVerifyAll: (secretId: string) =>
    api.post<{ ok: boolean; results: Array<{ botId: string; inSync: boolean; error?: string }> }>(
      `/fleet-secrets/secrets/${encodeURIComponent(secretId)}/verify-all`,
      {},
    ),

  // ─── Cost Optimizer ────────────────────────────────────────────────────

  /** Per-bot cost breakdown with waste estimates (computed live from bots) */
  costOptimizerBreakdown: (companyId: string) =>
    api.get<{ ok: boolean } & FleetCostBreakdown>(
      `/fleet-monitor/cost-optimizer/breakdown/${encodeURIComponent(companyId)}`,
    ),

  /** Optimization findings for a company (empty until a scan runs) */
  costOptimizerFindings: (
    companyId: string,
    filters?: { status?: CostFindingStatus; severity?: CostFindingSeverity; botId?: string },
  ) => {
    const qs = new URLSearchParams();
    if (filters?.status) qs.set("status", filters.status);
    if (filters?.severity) qs.set("severity", filters.severity);
    if (filters?.botId) qs.set("botId", filters.botId);
    const q = qs.toString();
    return api.get<{ ok: boolean; findings: CostOptimizationFinding[]; total: number }>(
      `/fleet-monitor/cost-optimizer/findings/${encodeURIComponent(companyId)}${q ? `?${q}` : ""}`,
    );
  },

  /** Historical savings from executed optimizations */
  costOptimizerSavings: (
    companyId: string,
    period?: { periodStart: string; periodEnd: string },
  ) => {
    const qs = new URLSearchParams();
    if (period) {
      qs.set("periodStart", period.periodStart);
      qs.set("periodEnd", period.periodEnd);
    }
    const q = qs.toString();
    return api.get<{ ok: boolean } & CostSavingsHistory>(
      `/fleet-monitor/cost-optimizer/savings/${encodeURIComponent(companyId)}${q ? `?${q}` : ""}`,
    );
  },

  /** Trigger a full fleet cost optimization scan (inspects every connected bot) */
  costOptimizerScan: (companyId: string) =>
    api.post<{ ok: boolean; scan: { id: string; findings: CostOptimizationFinding[]; summary: unknown } }>(
      `/fleet-monitor/cost-optimizer/scan/${encodeURIComponent(companyId)}`,
      {},
    ),

  /** Execute an approved/open optimization finding via gateway RPC */
  costOptimizerExecute: (findingId: string) =>
    api.post<{ ok: boolean; finding: CostOptimizationFinding; error?: string }>(
      `/fleet-monitor/cost-optimizer/execute/${encodeURIComponent(findingId)}`,
      {},
    ),

  // ─── Plugin Inventory ──────────────────────────────────────────────────

  /**
   * Plugin inventory + drift report across all connected bots.
   * Reads each bot's enabled plugins via gateway RPC (10-min cached server-side).
   */
  pluginInventory: () =>
    api.get<PluginInventoryResponse>(`/fleet-monitor/plugin-inventory`),

  // ─── Inter-Bot Communication Graph ─────────────────────────────────────

  /** Live inter-bot communication graph (nodes + edges, computed server-side). */
  interBotGraph: () =>
    api.get<InterBotGraphResponse>(`/fleet-monitor/inter-bot-graph`),

  /** Blast radius if a specific bot goes offline (BFS impact analysis). */
  interBotBlast: (botId: string) =>
    api.get<InterBotBlastResponse>(
      `/fleet-monitor/inter-bot-graph/blast/${encodeURIComponent(botId)}`,
    ),

  // ─── Conversation Quality Index (CQI) ──────────────────────────────────

  /** Fleet-wide quality scores across the 4 CQI dimensions, computed server-side. */
  quality: () => api.get<FleetQualityResponse>(`/fleet-monitor/quality`),

  // ─── Canary Lab (A/B experiments) ──────────────────────────────────────
  canaryExperiments: () =>
    api.get<CanaryExperimentsResponse>(`/fleet-monitor/canary/experiments`),
  canaryStart: (id: string) =>
    api.post<{ ok: boolean; experiment: CanaryExperiment }>(
      `/fleet-monitor/canary/experiments/${encodeURIComponent(id)}/start`,
      {},
    ),
  canaryPause: (id: string) =>
    api.post<{ ok: boolean; experiment: CanaryExperiment }>(
      `/fleet-monitor/canary/experiments/${encodeURIComponent(id)}/pause`,
      {},
    ),
  canaryAbort: (id: string, reason?: string) =>
    api.post<{ ok: boolean; experiment: CanaryExperiment }>(
      `/fleet-monitor/canary/experiments/${encodeURIComponent(id)}/abort`,
      { reason },
    ),
  canaryComplete: (id: string) =>
    api.post<{ ok: boolean; experiment: CanaryExperiment }>(
      `/fleet-monitor/canary/experiments/${encodeURIComponent(id)}/complete`,
      {},
    ),

  // ─── Capacity Planner (forecasts) ──────────────────────────────────────
  capacityForecasts: (opts?: { horizonDays?: number; budgetThreshold?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.horizonDays) qs.set("horizonDays", String(opts.horizonDays));
    if (opts?.budgetThreshold) qs.set("budgetThreshold", String(opts.budgetThreshold));
    const q = qs.toString();
    return api.get<CapacityForecastsResponse>(
      `/fleet-monitor/capacity/forecasts${q ? `?${q}` : ""}`,
    );
  },

  // ─── Customer Journey ──────────────────────────────────────────────────
  journeys: (params?: {
    stage?: string;
    botId?: string;
    channel?: string;
    atRiskOnly?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.stage) qs.set("stage", params.stage);
    if (params?.botId) qs.set("botId", params.botId);
    if (params?.channel) qs.set("channel", params.channel);
    if (params?.atRiskOnly) qs.set("atRiskOnly", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    return api.get<unknown>(`/fleet-monitor/journeys?${qs.toString()}`);
  },
  journeyDetail: (customerId: string) =>
    api.get<unknown>(`/fleet-monitor/journeys/${encodeURIComponent(customerId)}`),
  journeyAnalytics: () =>
    api.get<unknown>("/fleet-monitor/journeys/analytics"),
  journeyFunnel: () =>
    api.get<unknown>("/fleet-monitor/journeys/funnel"),
  journeyPredict: (customerId: string) =>
    api.get<unknown>(`/fleet-monitor/journeys/${encodeURIComponent(customerId)}/predict`),

  // ─── Meta-Learning ─────────────────────────────────────────────────────
  metaObservables: () =>
    api.get<unknown>("/fleet-monitor/meta/observables"),
  metaSuggestions: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return api.get<unknown>(`/fleet-monitor/meta/suggestions${qs}`);
  },
  metaApplySuggestion: (id: string) =>
    api.post<unknown>(`/fleet-monitor/meta/suggestions/${encodeURIComponent(id)}/apply`, {}),
  metaRejectSuggestion: (id: string) =>
    api.post<unknown>(`/fleet-monitor/meta/suggestions/${encodeURIComponent(id)}/reject`, {}),
  metaSensitivity: () =>
    api.get<unknown>("/fleet-monitor/meta/sensitivity"),
  metaStats: () =>
    api.get<unknown>("/fleet-monitor/meta/stats"),

  // ─── Sandbox ───────────────────────────────────────────────────────────
  sandboxList: () =>
    api.get<unknown>("/fleet-monitor/sandbox"),
  sandboxDetail: (id: string) =>
    api.get<unknown>(`/fleet-monitor/sandbox/${encodeURIComponent(id)}`),
  sandboxCreate: (data: unknown) =>
    api.post<unknown>("/fleet-monitor/sandbox", data),
  sandboxStart: (id: string) =>
    api.post<unknown>(`/fleet-monitor/sandbox/${encodeURIComponent(id)}/start`, {}),
  sandboxPause: (id: string) =>
    api.post<unknown>(`/fleet-monitor/sandbox/${encodeURIComponent(id)}/pause`, {}),
  sandboxDestroy: (id: string) =>
    api.post<unknown>(`/fleet-monitor/sandbox/${encodeURIComponent(id)}/destroy`, {}),
  sandboxComparison: (id: string) =>
    api.get<unknown>(`/fleet-monitor/sandbox/${encodeURIComponent(id)}/comparison`),
  sandboxPromote: (id: string) =>
    api.post<unknown>(`/fleet-monitor/sandbox/${encodeURIComponent(id)}/promote`, {}),
  sandboxGates: (id: string) =>
    api.get<unknown>(`/fleet-monitor/sandbox/${encodeURIComponent(id)}/gates`),

  // ─── Anomaly Correlation ───────────────────────────────────────────────
  correlations: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return api.get<unknown>(`/fleet-monitor/correlations${qs}`);
  },
  correlationDetail: (id: string) =>
    api.get<unknown>(`/fleet-monitor/correlations/${encodeURIComponent(id)}`),
  correlationResolve: (id: string) =>
    api.post<unknown>(`/fleet-monitor/correlations/${encodeURIComponent(id)}/resolve`, {}),
  correlationFalsePositive: (id: string) =>
    api.post<unknown>(`/fleet-monitor/correlations/${encodeURIComponent(id)}/false-positive`, {}),
  topology: () =>
    api.get<unknown>("/fleet-monitor/topology"),
  correlationStats: () =>
    api.get<unknown>("/fleet-monitor/correlations/stats"),

  // ─── Memory Mesh ───────────────────────────────────────────────────────
  memorySearch: (query: string, options?: Record<string, unknown>) =>
    api.post<unknown>("/fleet-monitor/memory/search", { query, ...options }),
  memoryGraph: () =>
    api.get<unknown>("/fleet-monitor/memory/graph"),
  memoryConflicts: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return api.get<unknown>(`/fleet-monitor/memory/conflicts${qs}`);
  },
  memoryResolveConflict: (id: string) =>
    api.post<unknown>(`/fleet-monitor/memory/conflicts/${encodeURIComponent(id)}/resolve`, {}),
  memoryHealth: () =>
    api.get<unknown>("/fleet-monitor/memory/health"),
  memoryGaps: () =>
    api.get<unknown>("/fleet-monitor/memory/gaps"),
  memoryStats: () =>
    api.get<unknown>("/fleet-monitor/memory/stats"),

  // ── Bot Discovery (unified local + mDNS + Tailscale) ────────────────

  /** Scan all sources for OpenClaw bots */
  discoverBots: () =>
    api.get<{
      ok: boolean;
      bots: DiscoverBotResult[];
      scannedPorts: number[];
      scanSources: string[];
      hostname: string;
      timestamp: string;
    }>("/fleet/discover"),

  /** Probe a single gateway URL */
  probeGateway: (url: string) =>
    api.post<{ ok: boolean; bot?: DiscoverBotResult; error?: string }>(
      "/fleet/discover/probe",
      { url },
    ),

  /** Upload a square avatar image for a bot */
  uploadAvatar: (botId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<{ ok: boolean; botId: string; avatar: string }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/avatar`,
      form,
    );
  },

  /** Remove avatar from a bot */
  removeAvatar: (botId: string) =>
    api.delete<{ ok: boolean; botId: string; avatar: null }>(
      `/fleet-monitor/bot/${encodeURIComponent(botId)}/avatar`,
    ),

  // ── Audit Log ──────────────────────────────────────────────────────────

  /** Query audit log entries */
  audit: (params: {
    companyId: string;
    action?: string;
    userId?: string;
    targetType?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams({ companyId: params.companyId });
    if (params.action) qs.set("action", params.action);
    if (params.userId) qs.set("userId", params.userId);
    if (params.targetType) qs.set("targetType", params.targetType);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    return api.get<{ ok: boolean; entries: AuditEntry[]; total: number }>(
      `/fleet-monitor/audit?${qs.toString()}`,
    );
  },

  /** Export audit log as CSV (returns blob URL) */
  auditExportUrl: (companyId: string) =>
    `/api/fleet-monitor/audit/export?companyId=${encodeURIComponent(companyId)}&format=csv`,
};

// ── Incidents ────────────────────────────────────────────────────────────

export type IncidentSeverity = "critical" | "major" | "minor" | "info";
export type IncidentStatus = "open" | "acknowledged" | "escalated" | "resolved";

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  affectedBots: string[];
  source: string;
  acknowledgedBy: { userId: string; name: string } | null;
  acknowledgedAt: string | null;
  escalationLevel: number;
  resolution: { summary: string; rootCause: string; actions: string[] } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentMetrics {
  total: number;
  open: number;
  resolved: number;
  avgMttrMinutes: number;
  avgMttiMinutes: number;
}

export const fleetIncidentsApi = {
  /** List incidents with optional status/severity filters */
  list: (params?: { status?: string; severity?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ ok: boolean; incidents: Incident[]; total: number }>(
      `/fleet-monitor/incidents${suffix}`,
    );
  },

  /** Fleet incident metrics (MTTR/MTTI, open/resolved counts) */
  metrics: () =>
    api.get<{ ok: boolean; metrics: IncidentMetrics }>("/fleet-monitor/incidents/metrics"),

  /** Create a new incident */
  create: (data: {
    title: string;
    description?: string;
    severity: string;
    affectedBots?: string[];
    source?: string;
  }) => api.post<{ ok: boolean; incident: Incident }>("/fleet-monitor/incidents", data),

  /** Acknowledge an incident */
  acknowledge: (id: string, by: { userId: string; name: string }) =>
    api.post<{ ok: boolean; incident: Incident }>(
      `/fleet-monitor/incidents/${encodeURIComponent(id)}/acknowledge`,
      by,
    ),

  /** Escalate an incident to the next level */
  escalate: (id: string) =>
    api.post<{ ok: boolean; incident: Incident }>(
      `/fleet-monitor/incidents/${encodeURIComponent(id)}/escalate`,
      {},
    ),

  /** Resolve an incident */
  resolve: (id: string, resolution: { summary: string; rootCause?: string; actions?: string[] }) =>
    api.post<{ ok: boolean; incident: Incident }>(
      `/fleet-monitor/incidents/${encodeURIComponent(id)}/resolve`,
      resolution,
    ),
};

export const fleetAlertsApi = {
  /** List active and recent alerts */
  list: (companyId: string, state?: AlertState) => {
    const params = new URLSearchParams({ companyId });
    if (state) params.set("state", state);
    return api.get<FleetAlert[]>(`/fleet-alerts?${params.toString()}`);
  },

  /** Acknowledge an alert */
  acknowledge: (alertId: string) =>
    api.post<void>(`/fleet-alerts/${encodeURIComponent(alertId)}/acknowledge`, {}),

  /** Resolve an alert */
  resolve: (alertId: string) =>
    api.post<void>(`/fleet-alerts/${encodeURIComponent(alertId)}/resolve`, {}),
};
