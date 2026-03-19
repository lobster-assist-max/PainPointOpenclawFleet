/**
 * Fleet Integration Hub — Event Mesh pattern for external system integration.
 *
 * Connects the fleet to external systems (Slack, HubSpot, LINE OA, ECPay,
 * Google Sheets, generic webhooks) through a unified event bus with rule-based
 * routing, HMAC-verified webhook ingestion, health monitoring, and notification
 * dispatching.
 *
 * Key capabilities:
 * - Integration registry with full CRUD lifecycle
 * - Inbound webhook handler with HMAC-SHA256 signature verification
 * - In-memory publish-subscribe event mesh (EventEmitter)
 * - Condition-based event routing engine (event type + condition -> action)
 * - Per-integration health monitoring (events, errors, latency, uptime)
 * - Notification dispatcher for Slack and LINE OA channels
 */

import { EventEmitter } from "node:events";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { logger as rootLogger } from "../middleware/logger.js";

const log = rootLogger.child({ service: "fleet-integration-hub" });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FleetIntegration {
  id: string;
  name: string;
  type: "inbound" | "outbound" | "bidirectional";
  provider: string;
  status: "active" | "paused" | "error";
  auth: {
    method: string;
    credentialRef: string;
    healthy: boolean;
  };
  config: {
    inbound?: {
      webhookUrl: string;
      webhookSecret: string;
      eventMappings: Array<{
        externalEvent: string;
        fleetAction: string;
      }>;
    };
    outbound?: {
      eventFilters: Array<{
        fleetEvent: string;
        condition?: string;
        template?: string;
      }>;
    };
  };
  health: {
    lastEventAt?: Date;
    eventsToday: number;
    errorsToday: number;
    avgLatencyMs: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface FleetEvent {
  id: string;
  timestamp: Date;
  source: string;
  type: string;
  payload: Record<string, unknown>;
  metadata: {
    fleetId: string;
    correlationId?: string;
  };
}

export interface EventRule {
  id: string;
  name: string;
  trigger: {
    source: string;
    eventType: string;
    condition?: string;
  };
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  enabled: boolean;
  executionCount: number;
  lastExecutedAt?: Date;
  createdAt: Date;
}

export type IntegrationProvider =
  | "slack"
  | "hubspot"
  | "line_oa"
  | "ecpay"
  | "google_sheets"
  | "webhook";

export interface WebhookIngestResult {
  accepted: boolean;
  eventId?: string;
  error?: string;
}

export interface IntegrationHealthReport {
  integrationId: string;
  name: string;
  provider: string;
  status: "active" | "paused" | "error";
  eventsToday: number;
  errorsToday: number;
  avgLatencyMs: number;
  uptimePercent: number;
  lastEventAt?: Date;
}

interface HealthWindow {
  /** Timestamp of first tracked event */
  trackedSince: Date;
  /** Total number of successful events */
  successCount: number;
  /** Total number of errors */
  errorCount: number;
  /** Running latency total for averaging */
  latencyTotalMs: number;
  /** Latency sample count */
  latencySamples: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HEALTH_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily reset
const MAX_EVENT_LOG_SIZE = 1000;

// ─── Engine ──────────────────────────────────────────────────────────────────

export class IntegrationHubEngine {
  private integrations = new Map<string, FleetIntegration>();
  private rules = new Map<string, EventRule>();
  private healthWindows = new Map<string, HealthWindow>();
  private eventLog: FleetEvent[] = [];
  private eventBus = new EventEmitter();
  private healthResetTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.eventBus.setMaxListeners(100);
    this.startHealthResetCycle();
    log.info("IntegrationHubEngine initialized");
  }

  // ─── Integration Registry (CRUD) ────────────────────────────────────────

  /** Register a new external integration. */
  createIntegration(
    params: Omit<FleetIntegration, "id" | "health" | "createdAt" | "updatedAt">,
  ): FleetIntegration {
    const id = randomUUID();
    const now = new Date();
    const integration: FleetIntegration = {
      ...params,
      id,
      health: { eventsToday: 0, errorsToday: 0, avgLatencyMs: 0 },
      createdAt: now,
      updatedAt: now,
    };
    this.integrations.set(id, integration);
    this.healthWindows.set(id, {
      trackedSince: now,
      successCount: 0,
      errorCount: 0,
      latencyTotalMs: 0,
      latencySamples: 0,
    });
    log.info({ integrationId: id, provider: params.provider }, "Integration created");
    this.publish({
      id: randomUUID(),
      timestamp: now,
      source: "integration-hub",
      type: "integration.created",
      payload: { integrationId: id, provider: params.provider },
      metadata: { fleetId: "system" },
    });
    return integration;
  }

  /** Retrieve an integration by ID. */
  getIntegration(id: string): FleetIntegration | undefined {
    return this.integrations.get(id);
  }

  /** List all registered integrations, optionally filtered by provider. */
  listIntegrations(provider?: string): FleetIntegration[] {
    const all = Array.from(this.integrations.values());
    if (provider) return all.filter((i) => i.provider === provider);
    return all;
  }

  /** Update an existing integration. Returns the updated record or undefined if not found. */
  updateIntegration(
    id: string,
    patch: Partial<
      Pick<FleetIntegration, "name" | "type" | "status" | "auth" | "config">
    >,
  ): FleetIntegration | undefined {
    const existing = this.integrations.get(id);
    if (!existing) return undefined;

    const updated: FleetIntegration = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.integrations.set(id, updated);
    log.info({ integrationId: id }, "Integration updated");
    return updated;
  }

  /** Delete an integration and its health data. */
  deleteIntegration(id: string): boolean {
    const existed = this.integrations.delete(id);
    this.healthWindows.delete(id);
    if (existed) {
      log.info({ integrationId: id }, "Integration deleted");
    }
    return existed;
  }

  // ─── Webhook Ingest Handler ──────────────────────────────────────────────

  /**
   * Receive an external webhook payload, verify its HMAC-SHA256 signature,
   * map the external event to a fleet event, and publish it onto the event mesh.
   */
  async ingestWebhook(
    integrationId: string,
    rawBody: string | Buffer,
    signature: string,
    externalEventType: string,
  ): Promise<WebhookIngestResult> {
    const start = Date.now();
    const integration = this.integrations.get(integrationId);

    if (!integration) {
      log.warn({ integrationId }, "Webhook received for unknown integration");
      return { accepted: false, error: "Unknown integration" };
    }

    if (integration.status !== "active") {
      log.warn({ integrationId }, "Webhook received for inactive integration");
      return { accepted: false, error: "Integration is not active" };
    }

    const inboundConfig = integration.config.inbound;
    if (!inboundConfig) {
      log.warn({ integrationId }, "Webhook received but no inbound config");
      return { accepted: false, error: "No inbound configuration" };
    }

    // ── HMAC-SHA256 verification ──
    if (!this.verifyHmacSignature(rawBody, signature, inboundConfig.webhookSecret)) {
      log.warn({ integrationId }, "Webhook HMAC verification failed");
      this.recordError(integrationId);
      return { accepted: false, error: "Invalid signature" };
    }

    // ── Map external event to fleet action ──
    const mapping = inboundConfig.eventMappings.find(
      (m) => m.externalEvent === externalEventType,
    );
    if (!mapping) {
      log.debug(
        { integrationId, externalEventType },
        "No event mapping found; ignoring webhook",
      );
      return { accepted: false, error: "No mapping for event type" };
    }

    // ── Parse payload ──
    let payload: Record<string, unknown>;
    try {
      const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
      payload = JSON.parse(bodyStr);
    } catch {
      log.warn({ integrationId }, "Failed to parse webhook body as JSON");
      this.recordError(integrationId);
      return { accepted: false, error: "Invalid JSON body" };
    }

    // ── Build and publish fleet event ──
    const event: FleetEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      source: `integration:${integration.provider}:${integrationId}`,
      type: mapping.fleetAction,
      payload,
      metadata: {
        fleetId: (payload.fleetId as string) || "unknown",
        correlationId: (payload.correlationId as string) || randomUUID(),
      },
    };

    this.publish(event);
    this.recordSuccess(integrationId, Date.now() - start);

    log.info(
      { integrationId, eventId: event.id, action: mapping.fleetAction },
      "Webhook ingested and published",
    );

    return { accepted: true, eventId: event.id };
  }

  /**
   * Verify an HMAC-SHA256 signature using timing-safe comparison.
   * Supports both raw hex and `sha256=<hex>` prefix formats.
   */
  verifyHmacSignature(
    body: string | Buffer,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const hmac = createHmac("sha256", secret);
      hmac.update(typeof body === "string" ? body : body);
      const expected = hmac.digest("hex");

      // Strip optional prefix (GitHub-style "sha256=..." or bare hex)
      const provided = signature.startsWith("sha256=")
        ? signature.slice(7)
        : signature;

      if (expected.length !== provided.length) return false;

      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(provided, "hex"),
      );
    } catch (err) {
      log.warn({ err }, "HMAC verification threw");
      return false;
    }
  }

  // ─── Event Mesh (Pub-Sub) ────────────────────────────────────────────────

  /** Publish an event onto the event mesh. All subscribers and routing rules are evaluated. */
  publish(event: FleetEvent): void {
    // Append to event log (bounded)
    this.eventLog.push(event);
    if (this.eventLog.length > MAX_EVENT_LOG_SIZE) {
      this.eventLog = this.eventLog.slice(-MAX_EVENT_LOG_SIZE);
    }

    // Emit on the bus: both specific type and wildcard
    this.eventBus.emit(event.type, event);
    this.eventBus.emit("*", event);

    // Evaluate routing rules
    this.evaluateRules(event);
  }

  /** Subscribe to a specific event type. Use "*" for all events. */
  subscribe(eventType: string, handler: (event: FleetEvent) => void): void {
    this.eventBus.on(eventType, handler);
  }

  /** Unsubscribe a handler from an event type. */
  unsubscribe(eventType: string, handler: (event: FleetEvent) => void): void {
    this.eventBus.off(eventType, handler);
  }

  /** Subscribe to a specific event type for one occurrence only. */
  once(eventType: string, handler: (event: FleetEvent) => void): void {
    this.eventBus.once(eventType, handler);
  }

  /** Return recent events, optionally filtered by type or source. */
  getRecentEvents(opts?: { type?: string; source?: string; limit?: number }): FleetEvent[] {
    let events = this.eventLog;
    if (opts?.type) events = events.filter((e) => e.type === opts.type);
    if (opts?.source) events = events.filter((e) => e.source === opts.source);
    const limit = opts?.limit ?? 50;
    return events.slice(-limit);
  }

  // ─── Event Routing Engine ────────────────────────────────────────────────

  /** Create a new routing rule. */
  createRule(
    params: Omit<EventRule, "id" | "executionCount" | "lastExecutedAt" | "createdAt">,
  ): EventRule {
    const rule: EventRule = {
      ...params,
      id: randomUUID(),
      executionCount: 0,
      createdAt: new Date(),
    };
    this.rules.set(rule.id, rule);
    log.info({ ruleId: rule.id, name: rule.name }, "Event rule created");
    return rule;
  }

  /** Get a rule by ID. */
  getRule(id: string): EventRule | undefined {
    return this.rules.get(id);
  }

  /** List all routing rules. */
  listRules(): EventRule[] {
    return Array.from(this.rules.values());
  }

  /** Update an existing routing rule. */
  updateRule(
    id: string,
    patch: Partial<Pick<EventRule, "name" | "trigger" | "actions" | "enabled">>,
  ): EventRule | undefined {
    const existing = this.rules.get(id);
    if (!existing) return undefined;
    const updated: EventRule = { ...existing, ...patch };
    this.rules.set(id, updated);
    log.info({ ruleId: id }, "Event rule updated");
    return updated;
  }

  /** Delete a routing rule. */
  deleteRule(id: string): boolean {
    const existed = this.rules.delete(id);
    if (existed) log.info({ ruleId: id }, "Event rule deleted");
    return existed;
  }

  /**
   * Evaluate all enabled rules against an incoming event. Matching rules
   * have their actions dispatched asynchronously.
   */
  private evaluateRules(event: FleetEvent): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Match source (empty or "*" = wildcard)
      if (rule.trigger.source && rule.trigger.source !== "*") {
        if (!event.source.includes(rule.trigger.source)) continue;
      }

      // Match event type (empty or "*" = wildcard)
      if (rule.trigger.eventType && rule.trigger.eventType !== "*") {
        if (event.type !== rule.trigger.eventType) continue;
      }

      // Evaluate optional condition expression against the payload
      if (rule.trigger.condition) {
        if (!this.evaluateCondition(rule.trigger.condition, event)) continue;
      }

      // All checks passed — dispatch actions
      rule.executionCount++;
      rule.lastExecutedAt = new Date();
      log.debug(
        { ruleId: rule.id, eventId: event.id },
        "Rule matched, dispatching actions",
      );

      for (const action of rule.actions) {
        this.dispatchAction(action, event).catch((err) => {
          log.error({ ruleId: rule.id, action: action.type, err }, "Action dispatch failed");
        });
      }
    }
  }

  /**
   * Evaluate a simple dot-path condition string against an event.
   * Supports formats:
   *   "payload.status == completed"
   *   "payload.amount > 100"
   *   "payload.priority != low"
   */
  private evaluateCondition(condition: string, event: FleetEvent): boolean {
    try {
      // Parse condition: "path operator value"
      const match = condition.match(
        /^([\w.]+)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)$/,
      );
      if (!match) return false;

      const [, path, operator, rawValue] = match;
      const actual = this.resolveDotPath(event, path!);
      const expected = rawValue!.trim();

      switch (operator) {
        case "==":
          return String(actual) === expected;
        case "!=":
          return String(actual) !== expected;
        case ">":
          return Number(actual) > Number(expected);
        case "<":
          return Number(actual) < Number(expected);
        case ">=":
          return Number(actual) >= Number(expected);
        case "<=":
          return Number(actual) <= Number(expected);
        case "contains":
          return String(actual).includes(expected);
        default:
          return false;
      }
    } catch {
      log.debug({ condition }, "Condition evaluation failed");
      return false;
    }
  }

  /** Resolve a dot-path like "payload.order.status" against an object. */
  private resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Dispatch a single rule action. Actions are typed strings that map to
   * concrete operations on the fleet or external systems.
   */
  private async dispatchAction(
    action: { type: string; config: Record<string, unknown> },
    event: FleetEvent,
  ): Promise<void> {
    switch (action.type) {
      case "update_journey": {
        log.info(
          { customerId: action.config.customerId, stage: action.config.stage },
          "Action: update journey",
        );
        this.publish({
          id: randomUUID(),
          timestamp: new Date(),
          source: "routing-engine",
          type: "journey.update_requested",
          payload: { ...action.config, triggerEvent: event.id },
          metadata: event.metadata,
        });
        break;
      }

      case "create_incident": {
        log.info(
          { severity: action.config.severity, title: action.config.title },
          "Action: create incident",
        );
        this.publish({
          id: randomUUID(),
          timestamp: new Date(),
          source: "routing-engine",
          type: "incident.created",
          payload: { ...action.config, triggerEvent: event.id },
          metadata: event.metadata,
        });
        break;
      }

      case "send_notification": {
        const channel = (action.config.channel as string) || "slack";
        const message =
          (action.config.message as string) ||
          `Event ${event.type} from ${event.source}`;
        await this.sendNotification(channel, message, action.config);
        break;
      }

      case "trigger_bot": {
        log.info(
          { botId: action.config.botId, command: action.config.command },
          "Action: trigger bot",
        );
        this.publish({
          id: randomUUID(),
          timestamp: new Date(),
          source: "routing-engine",
          type: "bot.command_requested",
          payload: { ...action.config, triggerEvent: event.id },
          metadata: event.metadata,
        });
        break;
      }

      case "webhook": {
        const url = action.config.url as string;
        if (!url) {
          log.warn("Webhook action missing url");
          break;
        }
        await this.fireOutboundWebhook(url, event, action.config);
        break;
      }

      default:
        log.warn({ actionType: action.type }, "Unknown action type");
    }
  }

  /** Fire an outbound webhook to an external URL. */
  private async fireOutboundWebhook(
    url: string,
    event: FleetEvent,
    config: Record<string, unknown>,
  ): Promise<void> {
    try {
      const body = JSON.stringify({
        event: event.type,
        payload: event.payload,
        metadata: event.metadata,
        timestamp: event.timestamp.toISOString(),
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Sign outbound payload if a secret is provided
      const secret = config.secret as string | undefined;
      if (secret) {
        const hmac = createHmac("sha256", secret);
        hmac.update(body);
        headers["X-Fleet-Signature"] = `sha256=${hmac.digest("hex")}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        log.warn(
          { url, status: response.status },
          "Outbound webhook returned non-2xx",
        );
      } else {
        log.debug({ url }, "Outbound webhook delivered");
      }
    } catch (err) {
      log.error({ url, err }, "Outbound webhook failed");
    }
  }

  // ─── Integration Health Monitor ──────────────────────────────────────────

  /** Record a successful event for an integration. */
  private recordSuccess(integrationId: string, latencyMs: number): void {
    const integration = this.integrations.get(integrationId);
    const window = this.healthWindows.get(integrationId);
    if (!integration || !window) return;

    integration.health.eventsToday++;
    integration.health.lastEventAt = new Date();
    window.successCount++;
    window.latencyTotalMs += latencyMs;
    window.latencySamples++;
    integration.health.avgLatencyMs =
      window.latencySamples > 0
        ? Math.round(window.latencyTotalMs / window.latencySamples)
        : 0;
  }

  /** Record an error for an integration. */
  private recordError(integrationId: string): void {
    const integration = this.integrations.get(integrationId);
    const window = this.healthWindows.get(integrationId);
    if (!integration || !window) return;

    integration.health.errorsToday++;
    window.errorCount++;

    // Auto-degrade status if error rate is high
    const total = window.successCount + window.errorCount;
    if (total >= 10 && window.errorCount / total > 0.5) {
      integration.status = "error";
      integration.auth.healthy = false;
      log.warn(
        { integrationId, errorRate: window.errorCount / total },
        "Integration degraded to error status",
      );
    }
  }

  /** Get health report for a specific integration. */
  getIntegrationHealth(integrationId: string): IntegrationHealthReport | undefined {
    const integration = this.integrations.get(integrationId);
    const window = this.healthWindows.get(integrationId);
    if (!integration || !window) return undefined;

    const total = window.successCount + window.errorCount;
    const uptimePercent =
      total > 0
        ? Math.round((window.successCount / total) * 100 * 100) / 100
        : 100;

    return {
      integrationId,
      name: integration.name,
      provider: integration.provider,
      status: integration.status,
      eventsToday: integration.health.eventsToday,
      errorsToday: integration.health.errorsToday,
      avgLatencyMs: integration.health.avgLatencyMs,
      uptimePercent,
      lastEventAt: integration.health.lastEventAt,
    };
  }

  /** Get health reports for all integrations. */
  getAllHealthReports(): IntegrationHealthReport[] {
    return Array.from(this.integrations.keys())
      .map((id) => this.getIntegrationHealth(id))
      .filter((r): r is IntegrationHealthReport => r !== undefined);
  }

  /** Reset daily health counters. Called automatically every 24 hours. */
  private resetDailyCounters(): void {
    const now = new Date();
    for (const [id, integration] of this.integrations) {
      integration.health.eventsToday = 0;
      integration.health.errorsToday = 0;

      const window = this.healthWindows.get(id);
      if (window) {
        window.trackedSince = now;
        window.successCount = 0;
        window.errorCount = 0;
        window.latencyTotalMs = 0;
        window.latencySamples = 0;
      }
    }
    log.info("Daily health counters reset");
  }

  private startHealthResetCycle(): void {
    this.healthResetTimer = setInterval(
      () => this.resetDailyCounters(),
      HEALTH_RESET_INTERVAL_MS,
    );
    // Allow the process to exit without waiting for this timer
    if (this.healthResetTimer.unref) {
      this.healthResetTimer.unref();
    }
  }

  // ─── Notification Dispatcher ─────────────────────────────────────────────

  /**
   * Send a notification through a configured integration channel.
   * Currently supports Slack (via webhook) and LINE OA (via push API).
   */
  async sendNotification(
    channel: string,
    message: string,
    config: Record<string, unknown> = {},
  ): Promise<boolean> {
    log.info({ channel, messageLength: message.length }, "Dispatching notification");

    switch (channel) {
      case "slack":
        return this.sendSlackNotification(message, config);
      case "line":
      case "line_oa":
        return this.sendLineNotification(message, config);
      default:
        log.warn({ channel }, "Unsupported notification channel");
        return false;
    }
  }

  /**
   * Send a Slack notification via an incoming webhook or by finding a
   * configured Slack integration.
   */
  private async sendSlackNotification(
    message: string,
    config: Record<string, unknown>,
  ): Promise<boolean> {
    const webhookUrl =
      (config.webhookUrl as string) || this.findOutboundUrl("slack");

    if (!webhookUrl) {
      log.warn("No Slack webhook URL configured");
      return false;
    }

    try {
      const body = JSON.stringify({
        text: message,
        channel: config.channel || undefined,
        username: (config.username as string) || "Fleet Integration Hub",
        icon_emoji: (config.icon as string) || ":robot_face:",
      });

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        log.warn({ status: response.status }, "Slack notification failed");
        return false;
      }

      log.debug("Slack notification sent");
      return true;
    } catch (err) {
      log.error({ err }, "Slack notification error");
      return false;
    }
  }

  /**
   * Send a LINE OA push notification through the Messaging API.
   */
  private async sendLineNotification(
    message: string,
    config: Record<string, unknown>,
  ): Promise<boolean> {
    const accessToken =
      (config.accessToken as string) || this.findCredential("line_oa");
    const to = config.to as string | undefined;

    if (!accessToken) {
      log.warn("No LINE OA access token configured");
      return false;
    }

    if (!to) {
      log.warn("No LINE recipient (to) specified");
      return false;
    }

    try {
      const body = JSON.stringify({
        to,
        messages: [{ type: "text", text: message }],
      });

      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        log.warn({ status: response.status }, "LINE notification failed");
        return false;
      }

      log.debug("LINE notification sent");
      return true;
    } catch (err) {
      log.error({ err }, "LINE notification error");
      return false;
    }
  }

  /** Find an outbound webhook URL from a registered integration by provider. */
  private findOutboundUrl(provider: string): string | undefined {
    for (const integration of this.integrations.values()) {
      if (
        integration.provider === provider &&
        integration.status === "active" &&
        integration.config.inbound?.webhookUrl
      ) {
        return integration.config.inbound.webhookUrl;
      }
    }
    return undefined;
  }

  /** Find a credential reference from a registered integration by provider. */
  private findCredential(provider: string): string | undefined {
    for (const integration of this.integrations.values()) {
      if (
        integration.provider === provider &&
        integration.status === "active" &&
        integration.auth.healthy
      ) {
        return integration.auth.credentialRef;
      }
    }
    return undefined;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /** Graceful shutdown: clear timers and remove all listeners. */
  destroy(): void {
    if (this.healthResetTimer) {
      clearInterval(this.healthResetTimer);
      this.healthResetTimer = null;
    }
    this.eventBus.removeAllListeners();
    log.info("IntegrationHubEngine destroyed");
  }

  /** Get summary stats for the hub. */
  getStats(): {
    totalIntegrations: number;
    activeIntegrations: number;
    totalRules: number;
    enabledRules: number;
    eventLogSize: number;
    subscriberCount: number;
  } {
    const integrations = Array.from(this.integrations.values());
    const rules = Array.from(this.rules.values());

    return {
      totalIntegrations: integrations.length,
      activeIntegrations: integrations.filter((i) => i.status === "active").length,
      totalRules: rules.length,
      enabledRules: rules.filter((r) => r.enabled).length,
      eventLogSize: this.eventLog.length,
      subscriberCount: this.eventBus.listenerCount("*"),
    };
  }
}

export default new IntegrationHubEngine();
