/**
 * FleetMonitorService — Manages multiple OpenClaw bot connections for fleet monitoring.
 *
 * Responsibilities:
 * - Manages a pool of FleetGatewayClient connections (one per bot)
 * - Enforces connection budget (max concurrent WS connections)
 * - Tracks data freshness per bot
 * - Forwards gateway events to Paperclip's LiveEvent system
 * - Provides RPC proxy methods for querying individual bots
 */

import { EventEmitter } from "node:events";
import {
  FleetGatewayClient,
  type AgentTurnTrace,
  type BotConnectionState,
  type FleetGatewayClientConfig,
  type FleetGatewayEvent,
  type GatewayCapabilities,
} from "./fleet-gateway-client.js";
import { publishLiveEvent } from "./live-events.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BotConnectionInfo {
  botId: string;
  agentId: string;
  companyId: string;
  gatewayUrl: string;
  state: BotConnectionState;
  capabilities: GatewayCapabilities;
  lastEventAt: number | null;
  connectedSince: number | null;
  dataFreshness: DataFreshness;
}

export interface DataFreshness {
  lastUpdated: number | null;
  source: "realtime" | "poll" | "cached";
  staleAfterMs: number;
}

export interface ConnectBotParams {
  botId: string;
  agentId: string;
  companyId: string;
  gatewayUrl: string;
  authToken?: string | null;
  devicePrivateKeyPem?: string | null;
  scopes?: string[];
}

export interface BotHealthSnapshot {
  ok: boolean;
  status: string;
  channels?: Record<string, unknown>[];
  sessions?: Record<string, unknown>[];
  agents?: Record<string, unknown>[];
}

export interface BotSessionEntry {
  sessionKey: string;
  title?: string;
  createdAt?: string;
  lastActivityAt?: string;
  messageCount?: number;
}

export interface BotUsageReport {
  sessions?: Array<{
    sessionKey: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  }>;
  total?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  };
}

interface ManagedBot {
  client: FleetGatewayClient;
  params: ConnectBotParams;
  connectedSince: number | null;
  freshness: DataFreshness;
  listeners: Array<() => void>;
}

// ─── Configuration ─────────────────────────────────────────────────────────

const CONNECTION_BUDGET = {
  maxConcurrentWs: 20,
  eventBatchIntervalMs: 2_000,
};

const STALE_THRESHOLD_MS = 60_000; // 1 minute

// ─── FleetMonitorService ───────────────────────────────────────────────────

export class FleetMonitorService extends EventEmitter {
  private bots = new Map<string, ManagedBot>();
  private disposed = false;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  // ─── Bot connection management ─────────────────────────────────────────

  /** Connect to a bot's OpenClaw Gateway. */
  async connectBot(params: ConnectBotParams): Promise<void> {
    if (this.disposed) throw new Error("FleetMonitorService has been disposed");

    // Disconnect existing connection if any
    if (this.bots.has(params.botId)) {
      this.disconnectBot(params.botId);
    }

    // Check connection budget
    const activeCount = this.getActiveConnectionCount();
    if (activeCount >= CONNECTION_BUDGET.maxConcurrentWs) {
      throw new Error(
        `Connection budget exceeded (${activeCount}/${CONNECTION_BUDGET.maxConcurrentWs}). ` +
        `Disconnect a bot before connecting a new one.`,
      );
    }

    const clientConfig: FleetGatewayClientConfig = {
      url: params.gatewayUrl,
      authToken: params.authToken,
      devicePrivateKeyPem: params.devicePrivateKeyPem,
      scopes: params.scopes ?? ["operator.read"],
    };

    const client = new FleetGatewayClient(clientConfig, undefined, params.botId);

    const managed: ManagedBot = {
      client,
      params,
      connectedSince: null,
      freshness: {
        lastUpdated: null,
        source: "cached",
        staleAfterMs: STALE_THRESHOLD_MS,
      },
      listeners: [],
    };

    // Wire up event listeners
    const onStateChange = (change: { from: BotConnectionState; to: BotConnectionState }) => {
      this.handleBotStateChange(params.botId, change.from, change.to);
    };

    const onGatewayEvent = (event: FleetGatewayEvent) => {
      this.handleBotGatewayEvent(params.botId, event);
    };

    const onConnected = () => {
      managed.connectedSince = Date.now();
      managed.freshness.source = "realtime";
      managed.freshness.lastUpdated = Date.now();
    };

    const onConnectionError = (err: Error) => {
      this.emit("botError", { botId: params.botId, error: err.message });
    };

    const onDeviceToken = (token: string) => {
      this.emit("deviceTokenReceived", { botId: params.botId, deviceToken: token });
    };

    const onCircuitBreakerOpen = () => {
      this.emit("botCircuitBreaker", { botId: params.botId, state: "open" });
    };

    const onCircuitBreakerHalfOpen = () => {
      this.emit("botCircuitBreaker", { botId: params.botId, state: "half-open" });
    };

    client.on("stateChange", onStateChange);
    client.on("gatewayEvent", onGatewayEvent);
    client.on("connected", onConnected);
    client.on("connectionError", onConnectionError);
    client.on("deviceToken", onDeviceToken);
    client.on("circuitBreakerOpen", onCircuitBreakerOpen);
    client.on("circuitBreakerHalfOpen", onCircuitBreakerHalfOpen);

    managed.listeners = [
      () => client.off("stateChange", onStateChange),
      () => client.off("gatewayEvent", onGatewayEvent),
      () => client.off("connected", onConnected),
      () => client.off("connectionError", onConnectionError),
      () => client.off("deviceToken", onDeviceToken),
      () => client.off("circuitBreakerOpen", onCircuitBreakerOpen),
      () => client.off("circuitBreakerHalfOpen", onCircuitBreakerHalfOpen),
    ];

    this.bots.set(params.botId, managed);

    // Start connecting
    await client.connect();
  }

  /** Disconnect a bot and stop monitoring. */
  disconnectBot(botId: string): void {
    const managed = this.bots.get(botId);
    if (!managed) return;

    // Clean up listeners
    for (const unsub of managed.listeners) unsub();
    managed.listeners = [];

    managed.client.dispose();
    this.bots.delete(botId);

    // Notify
    publishLiveEvent({
      companyId: managed.params.companyId,
      type: "agent.status",
      payload: {
        agentId: managed.params.agentId,
        status: "disconnected",
        source: "fleet-monitor",
      },
    });
  }

  /** Get connection info for a specific bot. */
  getBotInfo(botId: string): BotConnectionInfo | null {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    return {
      botId,
      agentId: managed.params.agentId,
      companyId: managed.params.companyId,
      gatewayUrl: managed.params.gatewayUrl,
      state: managed.client.getState(),
      capabilities: managed.client.getCapabilities(),
      lastEventAt: managed.client.getLastEventAt(),
      connectedSince: managed.connectedSince,
      dataFreshness: { ...managed.freshness },
    };
  }

  /** Get connection info for all bots. */
  getAllBots(): BotConnectionInfo[] {
    return Array.from(this.bots.keys()).map((botId) => this.getBotInfo(botId)!);
  }

  /** Get bots filtered by company. */
  getBotsByCompany(companyId: string): BotConnectionInfo[] {
    return this.getAllBots().filter((b) => b.companyId === companyId);
  }

  /** Number of bots with active WS connections. */
  getActiveConnectionCount(): number {
    let count = 0;
    for (const [, managed] of this.bots) {
      const state = managed.client.getState();
      if (state === "monitoring" || state === "connecting" || state === "authenticating") {
        count++;
      }
    }
    return count;
  }

  // ─── RPC proxy methods (query individual bots) ─────────────────────────

  /** Get bot health snapshot. */
  async getBotHealth(botId: string): Promise<BotHealthSnapshot | null> {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    const client = managed.client;
    if (!client.hasCapability("health")) {
      // Fallback: try HTTP /health
      return this.httpHealthCheck(managed.params.gatewayUrl);
    }

    try {
      const result = await client.rpc<Record<string, unknown>>("health");
      managed.freshness.lastUpdated = Date.now();
      managed.freshness.source = "realtime";
      return {
        ok: result.ok === true,
        status: typeof result.status === "string" ? result.status : "unknown",
        channels: Array.isArray(result.channels) ? result.channels : undefined,
        sessions: Array.isArray(result.sessions) ? result.sessions : undefined,
        agents: Array.isArray(result.agents) ? result.agents : undefined,
      };
    } catch {
      return null;
    }
  }

  /** List bot sessions. */
  async getBotSessions(botId: string): Promise<BotSessionEntry[]> {
    const managed = this.bots.get(botId);
    if (!managed) return [];

    const client = managed.client;
    if (!client.hasCapability("sessions.list")) return [];

    try {
      const result = await client.rpc<Record<string, unknown>>("sessions.list");
      managed.freshness.lastUpdated = Date.now();
      const sessions = Array.isArray(result.sessions) ? result.sessions : [];
      return sessions
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          sessionKey: String(s.sessionKey ?? s.key ?? ""),
          title: typeof s.title === "string" ? s.title : undefined,
          createdAt: typeof s.createdAt === "string" ? s.createdAt : undefined,
          lastActivityAt: typeof s.lastActivityAt === "string" ? s.lastActivityAt : undefined,
          messageCount: typeof s.messageCount === "number" ? s.messageCount : undefined,
        }));
    } catch {
      return [];
    }
  }

  /** Get bot token usage report. */
  async getBotUsage(botId: string, dateRange?: { from: string; to: string }): Promise<BotUsageReport | null> {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    const client = managed.client;
    if (!client.hasCapability("sessions.usage")) return null;

    try {
      const params: Record<string, unknown> = {};
      if (dateRange) params.dateRange = dateRange;
      const result = await client.rpc<BotUsageReport>("sessions.usage", params);
      managed.freshness.lastUpdated = Date.now();
      return result;
    } catch {
      return null;
    }
  }

  /** Read a file from the bot's workspace (e.g., IDENTITY.md, MEMORY.md). */
  async getBotFile(botId: string, filename: string): Promise<string | null> {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    const client = managed.client;
    if (!client.hasCapability("agents.files.get")) return null;

    try {
      const result = await client.rpc<Record<string, unknown>>("agents.files.get", { path: filename });
      return typeof result.content === "string" ? result.content : null;
    } catch {
      return null;
    }
  }

  /** Get bot's agent identity. */
  async getBotIdentity(botId: string): Promise<Record<string, unknown> | null> {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    const client = managed.client;
    if (!client.hasCapability("agent.identity")) return null;

    try {
      return await client.rpc<Record<string, unknown>>("agent.identity");
    } catch {
      return null;
    }
  }

  /** Get bot's channel statuses. */
  async getBotChannels(botId: string): Promise<Record<string, unknown>[] | null> {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    const client = managed.client;
    if (!client.hasCapability("channels.status")) return null;

    try {
      const result = await client.rpc<Record<string, unknown>>("channels.status");
      return Array.isArray(result.channels) ? result.channels : [];
    } catch {
      return null;
    }
  }

  /** Get bot's cron jobs. */
  async getBotCronJobs(botId: string): Promise<Record<string, unknown>[] | null> {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    const client = managed.client;
    if (!client.hasCapability("cron.list")) return null;

    try {
      const result = await client.rpc<Record<string, unknown>>("cron.list");
      return Array.isArray(result.jobs) ? result.jobs : [];
    } catch {
      return null;
    }
  }

  // ─── Generic RPC proxy ─────────────────────────────────────────────────

  /** Send an arbitrary RPC request to a specific bot. */
  async rpcForBot<T = unknown>(botId: string, method: string, params?: unknown): Promise<T> {
    const managed = this.bots.get(botId);
    if (!managed) throw new Error(`Bot not found: ${botId}`);
    return managed.client.rpc<T>(method, params);
  }

  // ─── Agent Turn Traces ─────────────────────────────────────────────────

  /** Get completed traces for a bot. */
  getBotTraces(botId: string, limit = 50): AgentTurnTrace[] {
    const managed = this.bots.get(botId);
    if (!managed) return [];
    return managed.client.traceBuffer.getTraces(limit);
  }

  /** Get a specific trace by runId. */
  getBotTrace(botId: string, runId: string): AgentTurnTrace | null {
    const managed = this.bots.get(botId);
    if (!managed) return null;
    return managed.client.traceBuffer.getTrace(runId);
  }

  /** Get the active (in-progress) trace for a bot. */
  getBotActiveTrace(botId: string): AgentTurnTrace | null {
    const managed = this.bots.get(botId);
    if (!managed) return null;
    return managed.client.traceBuffer.getActiveTrace();
  }

  // ─── Disposal ──────────────────────────────────────────────────────────

  /** Shut down all connections and clean up. */
  dispose(): void {
    this.disposed = true;
    for (const botId of Array.from(this.bots.keys())) {
      this.disconnectBot(botId);
    }
    this.removeAllListeners();
  }

  // ─── Internal event handling ───────────────────────────────────────────

  private handleBotStateChange(botId: string, from: BotConnectionState, to: BotConnectionState): void {
    const managed = this.bots.get(botId);
    if (!managed) return;

    // Map state to a status string for the UI
    const statusMap: Record<BotConnectionState, string> = {
      dormant: "offline",
      connecting: "connecting",
      authenticating: "connecting",
      monitoring: "online",
      disconnected: "reconnecting",
      backoff: "reconnecting",
      error: "error",
    };

    publishLiveEvent({
      companyId: managed.params.companyId,
      type: "agent.status",
      payload: {
        agentId: managed.params.agentId,
        status: statusMap[to],
        connectionState: to,
        previousState: from,
        source: "fleet-monitor",
      },
    });

    this.emit("botStateChange", { botId, from, to });
  }

  private handleBotGatewayEvent(botId: string, event: FleetGatewayEvent): void {
    const managed = this.bots.get(botId);
    if (!managed) return;

    managed.freshness.lastUpdated = Date.now();
    managed.freshness.source = "realtime";

    // Forward to Paperclip LiveEvent system
    publishLiveEvent({
      companyId: managed.params.companyId,
      type: "activity.logged",
      payload: {
        agentId: managed.params.agentId,
        gatewayEvent: event.type,
        data: event.payload,
        source: "fleet-monitor",
      },
    });

    // Emit for internal consumers
    this.emit("botEvent", { botId, event });
  }

  // ─── HTTP fallback ─────────────────────────────────────────────────────

  private async httpHealthCheck(gatewayUrl: string): Promise<BotHealthSnapshot | null> {
    // Convert ws:// to http:// for health check
    const httpUrl = gatewayUrl
      .replace(/^ws:\/\//, "http://")
      .replace(/^wss:\/\//, "https://");
    const healthUrl = `${httpUrl.replace(/\/$/, "")}/health`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return { ok: false, status: "unreachable" };

      const data = await response.json() as Record<string, unknown>;
      return {
        ok: data.ok === true,
        status: typeof data.status === "string" ? data.status : "unknown",
      };
    } catch {
      return { ok: false, status: "unreachable" };
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: FleetMonitorService | null = null;

export function getFleetMonitorService(): FleetMonitorService {
  if (!_instance) {
    _instance = new FleetMonitorService();
  }
  return _instance;
}

export function disposeFleetMonitorService(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}
