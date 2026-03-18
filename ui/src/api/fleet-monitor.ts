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
