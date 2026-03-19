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

  /** Get cost breakdown by channel */
  costByChannel: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ companyId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return api.get<{ ok: boolean; channels: ChannelCostEntry[] }>(
      `/fleet-monitor/cost-by-channel?${params.toString()}`,
    );
  },

  /** Get fleet heatmap data */
  heatmap: (companyId: string, days = 28, botId?: string) => {
    const params = new URLSearchParams({ days: String(days) });
    if (botId) params.set("botId", botId);
    return api.get<{ ok: boolean; cells: HeatmapCell[] }>(
      `/fleet-monitor/fleet/${encodeURIComponent(companyId)}/heatmap?${params.toString()}`,
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
