/**
 * FleetGatewayClient — Long-lived WebSocket client for monitoring OpenClaw bots.
 *
 * Unlike the adapter's GatewayWsClient (one-shot agent execution), this client:
 * - Maintains a long-lived connection for passive event monitoring
 * - Auto-reconnects with exponential backoff + jitter
 * - Implements circuit breaker to avoid flooding dead gateways
 * - Detects gateway capabilities from hello-ok features
 * - Uses operator.read scope (minimal privileges)
 */

import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";

// ─── Types ─────────────────────────────────────────────────────────────────

export type BotConnectionState =
  | "dormant"
  | "connecting"
  | "authenticating"
  | "monitoring"
  | "disconnected"
  | "backoff"
  | "error";

export type FleetGatewayEvent =
  | { type: "health"; payload: Record<string, unknown> }
  | { type: "presence"; payload: Record<string, unknown> }
  | { type: "chat"; payload: Record<string, unknown> }
  | { type: "tick"; payload: Record<string, unknown> }
  | { type: "agent"; payload: Record<string, unknown> }
  | { type: "heartbeat"; payload: Record<string, unknown> }
  | { type: "shutdown"; payload: Record<string, unknown> }
  | { type: "unknown"; event: string; payload: Record<string, unknown> };

export interface FleetGatewayClientConfig {
  /** WebSocket URL, e.g. ws://192.168.50.73:18789 */
  url: string;
  /** Gateway auth token */
  authToken?: string | null;
  /** Persisted device private key PEM (from prior pairing) */
  devicePrivateKeyPem?: string | null;
  /** Connection timeout in ms */
  connectTimeoutMs?: number;
  /** Scopes to request (default: ["operator.read"]) */
  scopes?: string[];
}

export interface ReconnectConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterFactor: number;
  maxAttempts: number;
  resetAfterMs: number;
}

export interface GatewayCapabilities {
  methods: Set<string>;
  events: Set<string>;
  serverVersion?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

interface GatewayDeviceIdentity {
  deviceId: string;
  publicKeyRawBase64Url: string;
  privateKeyPem: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = 3;
const DEFAULT_SCOPES = ["operator.read"];
const CLIENT_ID = "fleet-monitor";
const CLIENT_MODE = "backend";
const CLIENT_VERSION = "fleet-dashboard";
const ROLE = "operator";

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

const DEFAULT_RECONNECT: ReconnectConfig = {
  initialDelayMs: 1_000,
  maxDelayMs: 60_000,
  multiplier: 2,
  jitterFactor: 0.3,
  maxAttempts: Infinity,
  resetAfterMs: 300_000,
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 120_000;

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// ─── Crypto helpers (from execute.ts patterns) ─────────────────────────────

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" }) as Buffer;
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function resolveDeviceIdentity(privateKeyPem?: string | null): GatewayDeviceIdentity {
  if (privateKeyPem) {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKey = crypto.createPublicKey(privateKey);
    const publicKeyPemStr = publicKey.export({ type: "spki", format: "pem" }).toString();
    const raw = derivePublicKeyRaw(publicKeyPemStr);
    return {
      deviceId: crypto.createHash("sha256").update(raw).digest("hex"),
      publicKeyRawBase64Url: base64UrlEncode(raw),
      privateKeyPem,
    };
  }

  const generated = crypto.generateKeyPairSync("ed25519");
  const publicKeyPemStr = generated.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPemStr = generated.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const raw = derivePublicKeyRaw(publicKeyPemStr);
  return {
    deviceId: crypto.createHash("sha256").update(raw).digest("hex"),
    publicKeyRawBase64Url: base64UrlEncode(raw),
    privateKeyPem: privateKeyPemStr,
  };
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, "utf8"), key);
  return base64UrlEncode(sig);
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
}): string {
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
    params.nonce,
    process.platform,
    "server",
  ].join("|");
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function rawDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return String(data ?? "");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function computeBackoffDelay(attempt: number, config: ReconnectConfig): number {
  const base = Math.min(config.initialDelayMs * config.multiplier ** attempt, config.maxDelayMs);
  const jitter = base * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(base + jitter));
}

// ─── Agent Turn Trace ──────────────────────────────────────────────────────

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

/**
 * Ring buffer that keeps the most recent N completed agent turn traces in memory.
 * Active (in-progress) turns are tracked separately.
 */
export class TraceRingBuffer {
  private capacity: number;
  private traces = new Map<string, AgentTurnTrace>();
  private order: string[] = [];
  private activeTurns = new Map<string, AgentTurnTrace>();
  private botId: string;

  constructor(botId: string, capacity = 200) {
    this.botId = botId;
    this.capacity = capacity;
  }

  startTurn(runId: string, timestampMs: number, sessionKey?: string): void {
    const trace: AgentTurnTrace = {
      traceId: runId,
      botId: this.botId,
      sessionKey,
      startedAt: timestampMs,
      status: "running",
      phases: [],
      totalTokens: { input: 0, output: 0, cached: 0 },
    };
    this.activeTurns.set(runId, trace);
  }

  addPhase(runId: string, phase: TracePhase): void {
    const trace = this.activeTurns.get(runId);
    if (!trace) return;

    // Update duration of previous phase if it has zero duration
    const prevPhase = trace.phases[trace.phases.length - 1];
    if (prevPhase && prevPhase.durationMs === 0) {
      prevPhase.durationMs = Math.max(0, phase.startMs - prevPhase.startMs);
    }

    trace.phases.push(phase);

    // Accumulate tokens
    if (phase.metadata?.inputTokens) trace.totalTokens.input += phase.metadata.inputTokens;
    if (phase.metadata?.outputTokens) trace.totalTokens.output += phase.metadata.outputTokens;
  }

  completeTurn(runId: string, status: "completed" | "failed" | "cancelled", timestampMs: number): void {
    const trace = this.activeTurns.get(runId);
    if (!trace) return;

    trace.status = status;
    trace.completedAt = timestampMs;
    trace.durationMs = timestampMs - trace.startedAt;

    // Close last phase duration
    const lastPhase = trace.phases[trace.phases.length - 1];
    if (lastPhase && lastPhase.durationMs === 0) {
      lastPhase.durationMs = Math.max(0, timestampMs - trace.startedAt - lastPhase.startMs);
    }

    this.activeTurns.delete(runId);

    // Add to completed ring buffer
    if (this.order.length >= this.capacity) {
      const evicted = this.order.shift()!;
      this.traces.delete(evicted);
    }
    this.traces.set(runId, trace);
    this.order.push(runId);
  }

  /** Get most recent completed traces (newest first). */
  getTraces(limit = 50): AgentTurnTrace[] {
    const ids = this.order.slice(-limit).reverse();
    return ids.map((id) => this.traces.get(id)!).filter(Boolean);
  }

  /** Get a specific completed trace by runId. */
  getTrace(runId: string): AgentTurnTrace | null {
    return this.traces.get(runId) ?? this.activeTurns.get(runId) ?? null;
  }

  /** Get the currently active (in-progress) trace, if any. */
  getActiveTrace(): AgentTurnTrace | null {
    // Return the most recently started active turn
    let latest: AgentTurnTrace | null = null;
    for (const trace of this.activeTurns.values()) {
      if (!latest || trace.startedAt > latest.startedAt) latest = trace;
    }
    return latest;
  }

  /** Get all active turns. */
  getActiveTraces(): AgentTurnTrace[] {
    return Array.from(this.activeTurns.values());
  }
}

// ─── FleetGatewayClient ───────────────────────────────────────────────────

export class FleetGatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private state: BotConnectionState = "dormant";
  readonly traceBuffer: TraceRingBuffer;
  private capabilities: GatewayCapabilities = { methods: new Set(), events: new Set() };
  private device: GatewayDeviceIdentity;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private monitoringSince: number | null = null;
  private consecutiveFailures = 0;
  private circuitBreakerOpen = false;
  private circuitBreakerTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastEventAt: number | null = null;

  readonly config: Readonly<FleetGatewayClientConfig>;
  private reconnectConfig: ReconnectConfig;

  constructor(config: FleetGatewayClientConfig, reconnect?: Partial<ReconnectConfig>, botId?: string) {
    super();
    this.config = config;
    this.reconnectConfig = { ...DEFAULT_RECONNECT, ...reconnect };
    this.device = resolveDeviceIdentity(config.devicePrivateKeyPem);
    this.traceBuffer = new TraceRingBuffer(botId ?? "unknown");
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /** Current connection state */
  getState(): BotConnectionState {
    return this.state;
  }

  /** Detected gateway capabilities (populated after successful connect) */
  getCapabilities(): GatewayCapabilities {
    return this.capabilities;
  }

  /** Device private key PEM (for persisting after first pairing) */
  getDevicePrivateKeyPem(): string {
    return this.device.privateKeyPem;
  }

  /** Timestamp of last received event, or null if never connected */
  getLastEventAt(): number | null {
    return this.lastEventAt;
  }

  /** Start connecting to the gateway. Idempotent if already connected. */
  async connect(): Promise<void> {
    if (this.disposed) throw new Error("Client has been disposed");
    if (this.state === "monitoring" || this.state === "connecting" || this.state === "authenticating") {
      return;
    }
    this.reconnectAttempt = 0;
    await this.doConnect();
  }

  /** Gracefully disconnect and stop reconnecting. */
  disconnect(): void {
    this.clearReconnectTimer();
    this.clearCircuitBreakerTimer();
    this.closeWebSocket(1000, "fleet-disconnect");
    this.setState("dormant");
  }

  /** Permanently dispose this client. No reconnection possible after this. */
  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.removeAllListeners();
  }

  /** Send an RPC request to the gateway. Only works in "monitoring" state. */
  async rpc<T = unknown>(method: string, params?: unknown, timeoutMs = 15_000): Promise<T> {
    if (this.state !== "monitoring" || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Cannot send RPC (state=${this.state})`);
    }

    const id = randomUUID();
    const frame = JSON.stringify({ type: "req", id, method, params: params ?? {} });

    return new Promise<T>((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`RPC timeout: ${method}`));
          }, timeoutMs)
        : null;

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });

      this.ws!.send(frame);
    });
  }

  /** Check if the gateway supports a specific RPC method. */
  hasCapability(method: string): boolean {
    return this.capabilities.methods.has(method);
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────

  private async doConnect(): Promise<void> {
    if (this.disposed) return;
    if (this.circuitBreakerOpen) return;

    const url = this.config.url;
    const timeoutMs = this.config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

    this.setState("connecting");

    try {
      const ws = new WebSocket(url, { maxPayload: 25 * 1024 * 1024 });
      this.ws = ws;

      // Wait for open
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          const onOpen = () => { cleanup(); resolve(); };
          const onError = (err: Error) => { cleanup(); reject(err); };
          const onClose = (code: number, reason: Buffer) => {
            cleanup();
            reject(new Error(`Gateway closed before open (${code}): ${rawDataToString(reason)}`));
          };
          const cleanup = () => { ws.off("open", onOpen); ws.off("error", onError); ws.off("close", onClose); };
          ws.once("open", onOpen);
          ws.once("error", onError);
          ws.once("close", onClose);
        }),
        timeoutMs,
        "Gateway WebSocket open timeout",
      );

      this.setState("authenticating");

      // Wait for connect.challenge
      const nonce = await withTimeout(
        new Promise<string>((resolve, reject) => {
          const handler = (data: WebSocket.Data) => {
            const raw = rawDataToString(data);
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.type === "event" && parsed?.event === "connect.challenge") {
                const challengeNonce = nonEmpty(asRecord(parsed.payload)?.nonce);
                if (challengeNonce) {
                  ws.off("message", handler);
                  resolve(challengeNonce);
                }
              }
            } catch { /* ignore parse errors */ }
          };
          ws.on("message", handler);
          ws.once("close", () => {
            ws.off("message", handler);
            reject(new Error("Gateway closed before challenge"));
          });
        }),
        timeoutMs,
        "Gateway connect challenge timeout",
      );

      // Build connect params with device auth
      const scopes = this.config.scopes ?? [...DEFAULT_SCOPES];
      const signedAtMs = Date.now();
      const authPayloadStr = buildDeviceAuthPayloadV3({
        deviceId: this.device.deviceId,
        clientId: CLIENT_ID,
        clientMode: CLIENT_MODE,
        role: ROLE,
        scopes,
        signedAtMs,
        token: this.config.authToken,
        nonce,
      });
      const signature = signDevicePayload(this.device.privateKeyPem, authPayloadStr);

      const connectParams = {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: CLIENT_ID,
          version: CLIENT_VERSION,
          platform: process.platform,
          mode: CLIENT_MODE,
        },
        role: ROLE,
        scopes,
        auth: {
          ...(this.config.authToken ? { token: this.config.authToken } : {}),
        },
        device: {
          id: this.device.deviceId,
          publicKey: this.device.publicKeyRawBase64Url,
          signature,
          signedAt: signedAtMs,
        },
        signedNonce: signature,
      };

      // Send connect and wait for hello-ok
      const connectId = randomUUID();
      const helloPayload = await withTimeout(
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const handler = (data: WebSocket.Data) => {
            const raw = rawDataToString(data);
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.type === "res" && parsed?.id === connectId) {
                ws.off("message", handler);
                if (parsed.ok) {
                  resolve(asRecord(parsed.payload) ?? {});
                } else {
                  const errMsg = nonEmpty(asRecord(parsed.error)?.message) ?? "connect rejected";
                  reject(new Error(errMsg));
                }
              }
            } catch { /* ignore */ }
          };
          ws.on("message", handler);
          ws.send(JSON.stringify({ type: "req", id: connectId, method: "connect", params: connectParams }));
        }),
        timeoutMs,
        "Gateway connect hello timeout",
      );

      // Parse capabilities from hello-ok
      const features = asRecord(helloPayload.features);
      const methods = Array.isArray(features?.methods) ? features.methods.filter((m: unknown) => typeof m === "string") : [];
      const events = Array.isArray(features?.events) ? features.events.filter((e: unknown) => typeof e === "string") : [];
      const server = asRecord(helloPayload.server);

      this.capabilities = {
        methods: new Set(methods as string[]),
        events: new Set(events as string[]),
        serverVersion: nonEmpty(server?.version) ?? undefined,
      };

      // Persist device token if returned
      const auth = asRecord(helloPayload.auth);
      if (auth?.deviceToken && typeof auth.deviceToken === "string") {
        this.emit("deviceToken", auth.deviceToken);
      }

      // Install long-lived message handler
      ws.removeAllListeners("message");
      ws.on("message", (data) => this.handleMessage(rawDataToString(data)));
      ws.on("close", (code, reason) => this.handleClose(code, rawDataToString(reason)));
      ws.on("error", () => { /* errors are followed by close */ });

      // Success
      this.setState("monitoring");
      this.monitoringSince = Date.now();
      this.consecutiveFailures = 0;
      this.reconnectAttempt = 0;
      this.emit("connected", this.capabilities);

    } catch (err) {
      this.closeWebSocket(1001, "connect-failed");
      this.handleConnectionFailure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* non-JSON WebSocket frame — discard silently */
      return;
    }

    const record = asRecord(parsed);
    if (!record) return;

    // Response frame — resolve pending RPC
    if (record.type === "res" && typeof record.id === "string") {
      const pending = this.pending.get(record.id);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        this.pending.delete(record.id);
        if (record.ok) {
          pending.resolve(record.payload ?? null);
        } else {
          const errorRecord = asRecord(record.error);
          pending.reject(new Error(nonEmpty(errorRecord?.message) ?? "RPC failed"));
        }
      }
      return;
    }

    // Event frame — forward to listeners
    if (record.type === "event" && typeof record.event === "string") {
      this.lastEventAt = Date.now();
      const payload = asRecord(record.payload) ?? {};

      const eventType = record.event as string;
      let fleetEvent: FleetGatewayEvent;

      if (eventType === "health") fleetEvent = { type: "health", payload };
      else if (eventType === "presence") fleetEvent = { type: "presence", payload };
      else if (eventType === "chat") fleetEvent = { type: "chat", payload };
      else if (eventType === "tick") fleetEvent = { type: "tick", payload };
      else if (eventType === "agent") {
        fleetEvent = { type: "agent", payload };
        // ── Trace collection: capture agent lifecycle events ───────────
        this.collectTraceEvent(payload);
      }
      else if (eventType === "heartbeat") fleetEvent = { type: "heartbeat", payload };
      else if (eventType === "shutdown") fleetEvent = { type: "shutdown", payload };
      else fleetEvent = { type: "unknown", event: eventType, payload };

      this.emit("gatewayEvent", fleetEvent);

      // Shutdown event means the gateway is going down — prepare for reconnect
      if (eventType === "shutdown") {
        this.emit("gatewayShutdown");
      }
    }
  }

  private collectTraceEvent(payload: Record<string, unknown>): void {
    const runId = typeof payload.runId === "string" ? payload.runId : undefined;
    if (!runId) return;

    const ts = typeof payload.ts === "number" ? payload.ts : Date.now();
    const phase = typeof payload.phase === "string" ? payload.phase : undefined;
    const stream = typeof payload.stream === "string" ? payload.stream : undefined;
    const data = typeof payload.data === "object" && payload.data !== null
      ? payload.data as Record<string, unknown>
      : {};

    if (phase === "start") {
      const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
      this.traceBuffer.startTurn(runId, ts, sessionKey);
    } else if (stream === "assistant") {
      const active = this.traceBuffer.getTrace(runId);
      const startMs = active ? ts - active.startedAt : 0;
      this.traceBuffer.addPhase(runId, {
        type: "llm_output",
        startMs,
        durationMs: 0,
        metadata: {
          outputTokens: typeof data.usage === "object" && data.usage !== null
            ? (data.usage as Record<string, unknown>).output as number ?? 0
            : 0,
        },
      });
    } else if (stream === "tool_use") {
      const active = this.traceBuffer.getTrace(runId);
      const startMs = active ? ts - active.startedAt : 0;
      this.traceBuffer.addPhase(runId, {
        type: "tool_call",
        name: typeof data.toolName === "string" ? data.toolName : undefined,
        startMs,
        durationMs: typeof data.durationMs === "number" ? data.durationMs : 0,
      });
    } else if (phase === "error" || phase === "failed") {
      const active = this.traceBuffer.getTrace(runId);
      const startMs = active ? ts - active.startedAt : 0;
      this.traceBuffer.addPhase(runId, {
        type: "error",
        startMs,
        durationMs: 0,
        metadata: {
          errorMessage: typeof data.message === "string" ? data.message : "Unknown error",
        },
      });
      if (phase === "failed") {
        this.traceBuffer.completeTurn(runId, "failed", ts);
      }
    } else if (phase === "completed") {
      this.traceBuffer.completeTurn(runId, "completed", ts);
    } else if (phase === "cancelled") {
      this.traceBuffer.completeTurn(runId, "cancelled", ts);
    }
  }

  private handleClose(code: number, reason: string): void {
    this.failAllPending(new Error(`Gateway closed (${code}): ${reason}`));
    this.ws = null;

    if (this.disposed) {
      this.setState("dormant");
      return;
    }

    // If we were monitoring for a while, this is a normal disconnect, not a failure
    if (this.monitoringSince && Date.now() - this.monitoringSince > this.reconnectConfig.resetAfterMs) {
      this.reconnectAttempt = 0;
      this.consecutiveFailures = 0;
    }

    this.setState("disconnected");
    this.scheduleReconnect();
  }

  private handleConnectionFailure(err: Error): void {
    this.consecutiveFailures++;
    this.emit("connectionError", err);

    if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.openCircuitBreaker();
      return;
    }

    this.scheduleReconnect();
  }

  // ─── Reconnection ─────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      this.setState("error");
      this.emit("maxRetriesReached");
      return;
    }

    const delay = computeBackoffDelay(this.reconnectAttempt, this.reconnectConfig);
    this.reconnectAttempt++;
    this.setState("backoff");
    this.emit("reconnecting", { attempt: this.reconnectAttempt, delayMs: delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.doConnect();
    }, delay);
  }

  // ─── Circuit Breaker ──────────────────────────────────────────────────

  private openCircuitBreaker(): void {
    this.circuitBreakerOpen = true;
    this.setState("error");
    this.emit("circuitBreakerOpen", { failures: this.consecutiveFailures });

    this.circuitBreakerTimer = setTimeout(() => {
      this.circuitBreakerTimer = null;
      this.circuitBreakerOpen = false;
      this.consecutiveFailures = 0;
      this.reconnectAttempt = 0;
      this.emit("circuitBreakerHalfOpen");
      void this.doConnect();
    }, CIRCUIT_BREAKER_COOLDOWN_MS);
  }

  // ─── State management ─────────────────────────────────────────────────

  private setState(newState: BotConnectionState): void {
    const oldState = this.state;
    if (oldState === newState) return;
    this.state = newState;
    this.emit("stateChange", { from: oldState, to: newState });
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  private closeWebSocket(code: number, reason: string): void {
    if (!this.ws) return;
    try {
      this.ws.removeAllListeners();
      this.ws.close(code, reason);
    } catch { /* ignore close errors */ }
    this.ws = null;
    this.failAllPending(new Error(`WebSocket closed: ${reason}`));
  }

  private failAllPending(err: Error): void {
    for (const [, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearCircuitBreakerTimer(): void {
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
  }
}
