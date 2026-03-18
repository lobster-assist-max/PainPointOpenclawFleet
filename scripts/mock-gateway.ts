#!/usr/bin/env npx tsx
/**
 * Mock OpenClaw Gateway Server — Development & Testing Tool
 *
 * Simulates an OpenClaw Gateway for Fleet Dashboard development.
 * Supports the WS handshake (challenge → connect → hello-ok),
 * periodic event broadcasting (tick, health, presence),
 * and core RPC methods (health, sessions.list, sessions.usage,
 * agent.identity, agents.files.get, channels.status, cron.list).
 *
 * Usage:
 *   npx tsx scripts/mock-gateway.ts --port 18789 --name "小龍蝦" --emoji "🦞"
 *   npx tsx scripts/mock-gateway.ts --port 18790 --name "飛鼠" --emoji "🐿️" --chaos
 *
 * Flags:
 *   --port      Port to listen on (default: 18789)
 *   --name      Bot display name (default: "MockBot")
 *   --emoji     Bot emoji (default: "🤖")
 *   --chaos     Enable chaos mode (random disconnects, delayed responses)
 *   --latency   Base latency in ms for RPC responses (default: 50)
 *   --channels  Comma-separated channel list (default: "line,telegram")
 */

import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

// ─── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const hasFlag = (name: string) => args.includes(`--${name}`);

const PORT = parseInt(getArg("port", "18789"), 10);
const BOT_NAME = getArg("name", "MockBot");
const BOT_EMOJI = getArg("emoji", "🤖");
const CHAOS_MODE = hasFlag("chaos");
const BASE_LATENCY_MS = parseInt(getArg("latency", "50"), 10);
const CHANNELS = getArg("channels", "line,telegram").split(",").map((c) => c.trim());

// ─── Fake Data Generators ────────────────────────────────────────────────────

const SERVER_VERSION = "2026.1.24-mock";
const PROTOCOL_VERSION = 3;
const TICK_INTERVAL_MS = 15_000;
const HEALTH_INTERVAL_MS = 60_000;

let sessionCounter = 0;

function makeSessions() {
  const sessions = [
    { sessionKey: "patrol-morning", title: "Morning patrol routine", createdAt: "2026-03-19T06:00:00Z", lastActivityAt: new Date().toISOString(), messageCount: 42 },
    { sessionKey: "customer-inquiry-12", title: "LINE customer inquiry #12", createdAt: "2026-03-19T09:15:00Z", lastActivityAt: new Date().toISOString(), messageCount: 18 },
    { sessionKey: "fleet-planning", title: "Fleet planning session", createdAt: "2026-03-19T01:00:00Z", lastActivityAt: new Date().toISOString(), messageCount: 156 },
    { sessionKey: "cron-daily-report", title: "Daily report generation", createdAt: "2026-03-19T00:00:00Z", lastActivityAt: "2026-03-19T00:05:32Z", messageCount: 8 },
  ];
  return sessions;
}

function makeUsageReport(dateRange?: { from?: string; to?: string }) {
  const sessions = [
    { sessionKey: "patrol-morning", inputTokens: 45000, outputTokens: 12000, cachedInputTokens: 30000 },
    { sessionKey: "customer-inquiry-12", inputTokens: 8500, outputTokens: 3200, cachedInputTokens: 4000 },
    { sessionKey: "fleet-planning", inputTokens: 180000, outputTokens: 48000, cachedInputTokens: 120000 },
    { sessionKey: "cron-daily-report", inputTokens: 5000, outputTokens: 2000, cachedInputTokens: 3500 },
  ];
  const total = sessions.reduce(
    (acc, s) => ({
      inputTokens: acc.inputTokens + s.inputTokens,
      outputTokens: acc.outputTokens + s.outputTokens,
      cachedInputTokens: acc.cachedInputTokens + (s.cachedInputTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  );
  return { sessions, total, dateRange: dateRange ?? null };
}

function makeChannelStatus() {
  return CHANNELS.map((ch) => ({
    channel: ch,
    connected: CHAOS_MODE ? Math.random() > 0.3 : true,
    lastMessageAt: new Date(Date.now() - Math.floor(Math.random() * 600_000)).toISOString(),
    messageCount24h: Math.floor(Math.random() * 200) + 10,
  }));
}

function makeCronList() {
  return [
    { id: "cron-1", name: "morning-report", schedule: "0 8 * * *", enabled: true, lastRunAt: "2026-03-19T08:00:00Z", lastRunStatus: "success" },
    { id: "cron-2", name: "health-check", schedule: "*/30 * * * *", enabled: true, lastRunAt: new Date(Date.now() - 900_000).toISOString(), lastRunStatus: "success" },
    { id: "cron-3", name: "weekly-summary", schedule: "0 9 * * 1", enabled: true, lastRunAt: "2026-03-17T09:00:00Z", lastRunStatus: "success" },
  ];
}

function makeIdentity() {
  return {
    name: BOT_NAME,
    emoji: BOT_EMOJI,
    avatar: null,
    description: `Mock ${BOT_NAME} bot for Fleet Dashboard development`,
  };
}

function makeAgentFiles(filename: string): string | null {
  const files: Record<string, string> = {
    "IDENTITY.md": `# ${BOT_NAME} ${BOT_EMOJI}\n\n## Role\nFleet monitoring bot.\n\n## Personality\nDiligent, thorough, and always online.\n`,
    "MEMORY.md": `# Memory\n\n## Recent\n- Connected to Fleet Dashboard\n- Processed 42 customer inquiries today\n- Morning patrol completed successfully\n`,
    "STATE.md": `# Current State\n\n## Active Tasks\n- Monitoring LINE channel\n- Processing customer queue\n\n## Status\nOperational\n`,
  };
  return files[filename] ?? null;
}

function makeHealthSnapshot() {
  return {
    ok: true,
    status: CHAOS_MODE && Math.random() < 0.1 ? "degraded" : "live",
    channels: makeChannelStatus(),
    sessions: makeSessions().length,
    agents: 1,
    uptime: Math.floor(process.uptime()),
    version: SERVER_VERSION,
  };
}

// ─── RPC Methods ─────────────────────────────────────────────────────────────

const ALL_METHODS = [
  "health", "status", "system-presence",
  "sessions.list", "sessions.usage", "sessions.preview", "sessions.resolve",
  "sessions.patch", "sessions.compact", "sessions.reset", "sessions.delete",
  "agents.list", "agents.files.list", "agents.files.get", "agent.identity",
  "chat.send", "chat.abort", "chat.history", "chat.inject",
  "channels.status",
  "cron.list", "cron.add", "cron.run", "cron.runs",
  "tools.catalog", "skills.bins", "skills.status",
  "models.list",
  "config.get", "config.patch", "config.schema",
  "device.pair.list", "device.pair.approve", "device.token.rotate", "device.token.revoke",
  "logs.tail",
  "wake",
];

const ALL_EVENTS = ["health", "presence", "chat", "tick", "agent", "heartbeat", "shutdown", "exec.approval.requested"];

type RpcHandler = (params: Record<string, unknown>) => unknown;

const rpcHandlers: Record<string, RpcHandler> = {
  health: () => makeHealthSnapshot(),
  status: () => ({
    version: SERVER_VERSION,
    uptime: Math.floor(process.uptime()),
    heartbeat: { enabled: true, intervalMs: 30_000 },
    sessions: makeSessions(),
  }),
  "system-presence": () => ({
    devices: [{ deviceId: "fleet-dashboard", role: "operator", connectedAt: new Date().toISOString() }],
  }),
  "sessions.list": (params) => {
    const sessions = makeSessions();
    return { sessions, total: sessions.length };
  },
  "sessions.usage": (params) => makeUsageReport(params.dateRange as any),
  "sessions.preview": (params) => ({
    sessionKey: params.sessionKey ?? "patrol-morning",
    messages: [
      { role: "user", content: "Run morning patrol", timestamp: "2026-03-19T06:00:00Z" },
      { role: "assistant", content: "Starting morning patrol routine. Checking all channels...", timestamp: "2026-03-19T06:00:02Z" },
    ],
  }),
  "agent.identity": () => makeIdentity(),
  "agents.list": () => ({ agents: [{ id: "default", name: BOT_NAME, emoji: BOT_EMOJI }] }),
  "agents.files.list": () => ({
    files: ["IDENTITY.md", "MEMORY.md", "STATE.md"],
  }),
  "agents.files.get": (params) => {
    const content = makeAgentFiles(params.filename as string);
    if (!content) return { ok: false, error: { code: "NOT_FOUND", message: `File not found: ${params.filename}` } };
    return { filename: params.filename, content };
  },
  "channels.status": () => ({ channels: makeChannelStatus() }),
  "cron.list": () => ({ crons: makeCronList() }),
  "cron.runs": () => ({
    runs: [
      { cronId: "cron-1", runAt: "2026-03-19T08:00:00Z", status: "success", durationMs: 4200, tokensUsed: 5000 },
      { cronId: "cron-2", runAt: new Date(Date.now() - 900_000).toISOString(), status: "success", durationMs: 1200, tokensUsed: 1500 },
    ],
  }),
  "tools.catalog": () => ({
    tools: [
      { name: "web-search", description: "Search the web", enabled: true },
      { name: "file-read", description: "Read local files", enabled: true },
      { name: "calendar", description: "Manage calendar events", enabled: true },
    ],
  }),
  "skills.bins": () => ({
    skills: [
      { name: "customer-service", version: "1.2.0", enabled: true },
      { name: "lead-qualification", version: "2.0.1", enabled: true },
    ],
  }),
  "skills.status": () => ({
    skills: [
      { name: "customer-service", status: "active", lastUsed: new Date().toISOString() },
      { name: "lead-qualification", status: "active", lastUsed: new Date().toISOString() },
    ],
  }),
  "models.list": () => ({
    models: [
      { id: "claude-sonnet-4-6", provider: "anthropic", available: true },
      { id: "claude-haiku-4-5", provider: "anthropic", available: true },
    ],
  }),
  "config.get": () => ({
    agent: { name: BOT_NAME, emoji: BOT_EMOJI },
    channels: CHANNELS,
    gateway: { port: PORT, auth: "token" },
  }),
  "config.schema": () => ({
    type: "object",
    properties: {
      agent: { type: "object", properties: { name: { type: "string" }, emoji: { type: "string" } } },
    },
  }),
  "device.pair.list": () => ({
    devices: [{ deviceId: "fleet-dashboard", label: "Fleet Dashboard", pairedAt: new Date().toISOString() }],
  }),
  "chat.history": (params) => ({
    sessionKey: params.sessionKey ?? "patrol-morning",
    messages: [
      { role: "system", content: `You are ${BOT_NAME}, a fleet bot.`, timestamp: "2026-03-19T06:00:00Z" },
      { role: "user", content: "Run morning patrol", timestamp: "2026-03-19T06:00:01Z" },
      { role: "assistant", content: "Starting morning patrol. All systems nominal.", timestamp: "2026-03-19T06:00:03Z" },
    ],
  }),
};

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  // Health endpoints (no auth)
  if (req.url === "/health" || req.url === "/healthz" || req.url === "/ready" || req.url === "/readyz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "live" }));
    return;
  }

  if (req.url === "/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rpcHandlers["models.list"]({})));
    return;
  }

  // Catch-all: return a simple info page
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    name: `${BOT_EMOJI} ${BOT_NAME}`,
    type: "mock-openclaw-gateway",
    version: SERVER_VERSION,
    protocol: PROTOCOL_VERSION,
    port: PORT,
    chaos: CHAOS_MODE,
    channels: CHANNELS,
    ws: `ws://localhost:${PORT}`,
  }));
});

// ─── WebSocket Server ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

let connectionSeq = 0;

wss.on("connection", (ws: WebSocket) => {
  const connId = `mock-conn-${++connectionSeq}`;
  let authenticated = false;
  let nonce: string;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let eventSeq = 0;

  console.log(`[${connId}] New WS connection`);

  // Step 1: Send connect.challenge
  nonce = crypto.randomBytes(32).toString("base64url");
  sendEvent(ws, "connect.challenge", { nonce, serverVersion: SERVER_VERSION });

  ws.on("message", (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString("utf-8"));
    } catch {
      console.error(`[${connId}] Invalid JSON`);
      return;
    }

    // Handle connect request (Step 2 of handshake)
    if (msg.type === "req" && msg.method === "connect") {
      console.log(`[${connId}] Auth request from device=${msg.params?.device?.id ?? "unknown"}`);

      // Accept any token in mock mode
      authenticated = true;

      // Step 3: Send hello-ok response
      const helloPayload = {
        protocol: PROTOCOL_VERSION,
        serverConnectionId: connId,
        features: {
          methods: ALL_METHODS,
          events: ALL_EVENTS,
        },
        maxPayload: 25 * 1024 * 1024,
        tickIntervalMs: TICK_INTERVAL_MS,
        presence: { devices: [{ deviceId: msg.params?.device?.id ?? "fleet-dashboard", role: "operator" }] },
        health: makeHealthSnapshot(),
        auth: { deviceToken: crypto.randomBytes(16).toString("hex") },
      };
      sendResponse(ws, msg.id, true, helloPayload);

      // Start periodic events
      tickTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        sendEvent(ws, "tick", {
          serverTime: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
          seq: ++eventSeq,
        });
      }, TICK_INTERVAL_MS);

      healthTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        sendEvent(ws, "health", makeHealthSnapshot());
      }, HEALTH_INTERVAL_MS);

      // Simulate occasional presence events
      if (CHAOS_MODE) {
        const chaosTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            clearInterval(chaosTimer);
            return;
          }
          // Random disconnect in chaos mode (5% chance per minute)
          if (Math.random() < 0.05) {
            console.log(`[${connId}] 💥 Chaos: simulating disconnect`);
            ws.close(1001, "Chaos disconnect");
            clearInterval(chaosTimer);
          }
        }, 60_000);
      }

      return;
    }

    // Handle RPC requests
    if (msg.type === "req" && authenticated) {
      const handler = rpcHandlers[msg.method];
      if (handler) {
        const delay = CHAOS_MODE
          ? BASE_LATENCY_MS + Math.floor(Math.random() * 500)
          : BASE_LATENCY_MS;

        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          try {
            const result = handler(msg.params ?? {});
            sendResponse(ws, msg.id, true, result);
          } catch (err) {
            sendResponse(ws, msg.id, false, undefined, {
              code: "INTERNAL_ERROR",
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }, delay);
      } else {
        sendResponse(ws, msg.id, false, undefined, {
          code: "METHOD_NOT_FOUND",
          message: `Unknown method: ${msg.method}`,
        });
      }
      return;
    }

    if (msg.type === "req" && !authenticated) {
      sendResponse(ws, msg.id, false, undefined, {
        code: "UNAUTHORIZED",
        message: "Not authenticated. Send connect request first.",
      });
    }
  });

  ws.on("close", (code: number, reason: Buffer) => {
    console.log(`[${connId}] Disconnected (code=${code}, reason=${reason.toString()})`);
    if (tickTimer) clearInterval(tickTimer);
    if (healthTimer) clearInterval(healthTimer);
  });

  ws.on("error", (err: Error) => {
    console.error(`[${connId}] Error:`, err.message);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendEvent(ws: WebSocket, event: string, payload: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "event", event, payload }));
}

function sendResponse(ws: WebSocket, id: string, ok: boolean, payload?: unknown, error?: { code: string; message: string }) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const frame: any = { type: "res", id, ok };
  if (ok) frame.payload = payload;
  else frame.error = error;
  ws.send(JSON.stringify(frame));
}

// ─── Start ───────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n${BOT_EMOJI}  Mock OpenClaw Gateway: ${BOT_NAME}`);
  console.log(`   HTTP:  http://localhost:${PORT}`);
  console.log(`   WS:    ws://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Channels: ${CHANNELS.join(", ")}`);
  console.log(`   Chaos mode: ${CHAOS_MODE ? "ON 💥" : "OFF"}`);
  console.log(`   Base latency: ${BASE_LATENCY_MS}ms`);
  console.log();
});
