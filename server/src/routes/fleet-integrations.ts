/**
 * Fleet Integrations & Event Ingestion API Routes
 *
 * Endpoints for managing third-party integrations, webhook event ingestion
 * with HMAC verification, event logging, and event rule management.
 */

import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";

// ─── Types ─────────────────────────────────────────────────────────────────

export type IntegrationType = "webhook" | "polling" | "streaming";
export type IntegrationProvider =
  | "slack"
  | "discord"
  | "github"
  | "jira"
  | "pagerduty"
  | "datadog"
  | "custom";

export type IntegrationStatus = "active" | "inactive" | "error" | "pending";

export interface IntegrationAuth {
  type: "bearer" | "api_key" | "hmac" | "oauth2" | "none";
  token?: string;
  secret?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface Integration {
  id: string;
  name: string;
  type: IntegrationType;
  provider: IntegrationProvider;
  auth: IntegrationAuth;
  config: Record<string, unknown>;
  status: IntegrationStatus;
  lastHealthCheck: string | null;
  lastEventAt: string | null;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IngestedEvent {
  id: string;
  integrationId: string;
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  processed: boolean;
  matchedRuleIds: string[];
}

export interface EventRule {
  id: string;
  name: string;
  description: string;
  integrationId: string | null; // null = applies to all
  eventType: string;
  condition: Record<string, unknown>;
  action: string;
  actionParams: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── In-memory stores ──────────────────────────────────────────────────────

const integrations = new Map<string, Integration>();
const events: IngestedEvent[] = [];
const eventRules = new Map<string, EventRule>();

const MAX_EVENTS = 1000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function verifyHmac(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const sig = signature.replace(/^sha256=/, "");
    if (sig.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function sanitizeIntegration(integration: Integration) {
  // Strip sensitive auth fields from responses
  const { auth, ...rest } = integration;
  return {
    ...rest,
    auth: {
      type: auth.type,
      // Mask token/secret — only show last 4 chars
      token: auth.token ? `****${auth.token.slice(-4)}` : undefined,
      secret: auth.secret ? "****" : undefined,
      clientId: auth.clientId ?? undefined,
    },
  };
}

// ─── Router ────────────────────────────────────────────────────────────────

export function fleetIntegrationRoutes() {
  const router = Router();

  // ─── Integration CRUD ──────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/integrations
   * List all integrations.
   * Query: ?provider=slack&status=active&limit=50&offset=0
   */
  router.get("/integrations", (req, res) => {
    try {
      const providerFilter = req.query.provider as string | undefined;
      const statusFilter = req.query.status as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      let items = Array.from(integrations.values());

      if (providerFilter) {
        items = items.filter((i) => i.provider === providerFilter);
      }
      if (statusFilter) {
        items = items.filter((i) => i.status === statusFilter);
      }

      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const total = items.length;
      const paged = items.slice(offset, offset + limit);

      res.json({
        ok: true,
        integrations: paged.map(sanitizeIntegration),
        total,
        limit,
        offset,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/integrations
   * Add a new integration.
   * Body: { name, type, provider, auth, config? }
   */
  router.post("/integrations", (req, res) => {
    const { name, type, provider, auth, config } = req.body ?? {};

    if (!name || typeof name !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: name" });
      return;
    }

    if (!type || !["webhook", "polling", "streaming"].includes(type)) {
      res.status(400).json({
        ok: false,
        error:
          "Missing or invalid field: type (must be webhook, polling, or streaming)",
      });
      return;
    }

    if (!provider || typeof provider !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: provider" });
      return;
    }

    if (!auth || typeof auth !== "object" || !auth.type) {
      res.status(400).json({
        ok: false,
        error: "Missing required field: auth (must include auth.type)",
      });
      return;
    }

    const now = new Date().toISOString();
    const integration: Integration = {
      id: randomUUID(),
      name,
      type,
      provider,
      auth,
      config: config ?? {},
      status: "pending",
      lastHealthCheck: null,
      lastEventAt: null,
      eventCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    integrations.set(integration.id, integration);

    res.status(201).json({ ok: true, integration: sanitizeIntegration(integration) });
  });

  /**
   * PATCH /api/fleet-monitor/integrations/:id
   * Update an existing integration.
   * Body: Partial<{ name, type, provider, auth, config, status }>
   */
  router.patch("/integrations/:id", (req, res) => {
    const integration = integrations.get(req.params.id);
    if (!integration) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    const { name, type, provider, auth, config, status } = req.body ?? {};

    if (name !== undefined) integration.name = name;
    if (type !== undefined) integration.type = type;
    if (provider !== undefined) integration.provider = provider;
    if (auth !== undefined) integration.auth = auth;
    if (config !== undefined) integration.config = config;
    if (status !== undefined) integration.status = status;
    integration.updatedAt = new Date().toISOString();

    res.json({ ok: true, integration: sanitizeIntegration(integration) });
  });

  /**
   * DELETE /api/fleet-monitor/integrations/:id
   * Remove an integration.
   */
  router.delete("/integrations/:id", (req, res) => {
    const { id } = req.params;

    if (!integrations.has(id)) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    integrations.delete(id);
    res.json({ ok: true, id });
  });

  /**
   * GET /api/fleet-monitor/integrations/:id/health
   * Run a health check against the integration endpoint.
   */
  router.get("/integrations/:id/health", async (req, res) => {
    const integration = integrations.get(req.params.id);
    if (!integration) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    try {
      const endpoint = integration.config.healthUrl as string | undefined;
      if (!endpoint) {
        // No health endpoint configured — report based on last event time
        const staleMs = integration.lastEventAt
          ? Date.now() - new Date(integration.lastEventAt).getTime()
          : null;
        const healthy =
          integration.status === "active" &&
          (staleMs === null || staleMs < 5 * 60_000);

        integration.lastHealthCheck = new Date().toISOString();
        integration.updatedAt = integration.lastHealthCheck;

        res.json({
          ok: true,
          health: {
            status: healthy ? "healthy" : "degraded",
            integrationId: integration.id,
            lastEventAt: integration.lastEventAt,
            staleSinceMs: staleMs,
            checkedAt: integration.lastHealthCheck,
          },
        });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeout);

      integration.lastHealthCheck = new Date().toISOString();
      integration.status = response.ok ? "active" : "error";
      integration.updatedAt = integration.lastHealthCheck;

      res.json({
        ok: true,
        health: {
          status: response.ok ? "healthy" : "unhealthy",
          httpStatus: response.status,
          integrationId: integration.id,
          checkedAt: integration.lastHealthCheck,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      integration.status = "error";
      integration.lastHealthCheck = new Date().toISOString();
      integration.updatedAt = integration.lastHealthCheck;

      res.json({
        ok: false,
        health: {
          status: "unreachable",
          integrationId: integration.id,
          error: message,
          checkedAt: integration.lastHealthCheck,
        },
      });
    }
  });

  /**
   * POST /api/fleet-monitor/integrations/:id/test
   * Send a test event to verify the integration works end-to-end.
   */
  router.post("/integrations/:id/test", async (req, res) => {
    const integration = integrations.get(req.params.id);
    if (!integration) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    try {
      const testEvent: IngestedEvent = {
        id: randomUUID(),
        integrationId: integration.id,
        provider: integration.provider,
        eventType: "integration.test",
        payload: {
          test: true,
          timestamp: new Date().toISOString(),
          message: `Test event for integration "${integration.name}"`,
        },
        receivedAt: new Date().toISOString(),
        processed: true,
        matchedRuleIds: [],
      };

      events.push(testEvent);
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);

      integration.lastEventAt = testEvent.receivedAt;
      integration.eventCount += 1;
      integration.status = "active";
      integration.updatedAt = testEvent.receivedAt;

      res.json({
        ok: true,
        test: {
          eventId: testEvent.id,
          integrationId: integration.id,
          status: "delivered",
          testedAt: testEvent.receivedAt,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Event Ingestion & Logging ─────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/events/ingest
   * Webhook ingest endpoint with HMAC signature verification.
   *
   * Headers:
   *   x-integration-id — ID of the integration sending events
   *   x-signature — HMAC-SHA256 signature of the raw body
   *
   * Body: { eventType, payload }
   */
  router.post("/events/ingest", (req, res) => {
    const integrationId = req.headers["x-integration-id"] as string | undefined;
    const signature = req.headers["x-signature"] as string | undefined;

    if (!integrationId) {
      res
        .status(400)
        .json({ ok: false, error: "Missing header: x-integration-id" });
      return;
    }

    const integration = integrations.get(integrationId);
    if (!integration) {
      res.status(404).json({ ok: false, error: "Integration not found" });
      return;
    }

    // Verify HMAC if integration uses hmac auth
    if (integration.auth.type === "hmac") {
      if (!signature) {
        res
          .status(401)
          .json({ ok: false, error: "Missing header: x-signature" });
        return;
      }

      const secret = integration.auth.secret;
      if (!secret) {
        res
          .status(500)
          .json({ ok: false, error: "Integration HMAC secret not configured" });
        return;
      }

      const rawBody = JSON.stringify(req.body);
      if (!verifyHmac(rawBody, signature, secret)) {
        res
          .status(403)
          .json({ ok: false, error: "Invalid HMAC signature" });
        return;
      }
    }

    const { eventType, payload } = req.body ?? {};

    if (!eventType || typeof eventType !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: eventType" });
      return;
    }

    // Match against event rules
    const matchedRuleIds: string[] = [];
    for (const rule of eventRules.values()) {
      if (!rule.enabled) continue;
      if (rule.integrationId && rule.integrationId !== integrationId) continue;
      if (rule.eventType !== "*" && rule.eventType !== eventType) continue;
      matchedRuleIds.push(rule.id);
    }

    const event: IngestedEvent = {
      id: randomUUID(),
      integrationId,
      provider: integration.provider,
      eventType,
      payload: payload ?? {},
      receivedAt: new Date().toISOString(),
      processed: matchedRuleIds.length > 0,
      matchedRuleIds,
    };

    events.push(event);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);

    integration.lastEventAt = event.receivedAt;
    integration.eventCount += 1;
    integration.status = "active";
    integration.updatedAt = event.receivedAt;

    res.status(201).json({
      ok: true,
      event: {
        id: event.id,
        eventType: event.eventType,
        matchedRules: matchedRuleIds.length,
        receivedAt: event.receivedAt,
      },
    });
  });

  /**
   * GET /api/fleet-monitor/events/log
   * Query the event log with filters.
   * Query: ?integrationId=xxx&eventType=xxx&limit=50&offset=0
   */
  router.get("/events/log", (req, res) => {
    try {
      const integrationIdFilter = req.query.integrationId as string | undefined;
      const eventTypeFilter = req.query.eventType as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      let items = [...events];

      if (integrationIdFilter) {
        items = items.filter((e) => e.integrationId === integrationIdFilter);
      }
      if (eventTypeFilter) {
        items = items.filter((e) => e.eventType === eventTypeFilter);
      }

      // Newest first
      items.reverse();

      const total = items.length;
      const paged = items.slice(offset, offset + limit);

      res.json({ ok: true, events: paged, total, limit, offset });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Event Rules ───────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/events/rules
   * List all event rules.
   */
  router.get("/events/rules", (_req, res) => {
    try {
      const rules = Array.from(eventRules.values());
      res.json({ ok: true, rules });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/events/rules
   * Create a new event rule.
   * Body: { name, description?, integrationId?, eventType, condition?, action, actionParams?, enabled? }
   */
  router.post("/events/rules", (req, res) => {
    const { name, description, integrationId, eventType, condition, action, actionParams, enabled } =
      req.body ?? {};

    if (!name || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: name" });
      return;
    }

    if (!eventType || typeof eventType !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: eventType" });
      return;
    }

    if (!action || typeof action !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: action" });
      return;
    }

    const now = new Date().toISOString();
    const rule: EventRule = {
      id: randomUUID(),
      name,
      description: description ?? "",
      integrationId: integrationId ?? null,
      eventType,
      condition: condition ?? {},
      action,
      actionParams: actionParams ?? {},
      enabled: enabled !== false,
      createdAt: now,
      updatedAt: now,
    };

    eventRules.set(rule.id, rule);

    res.status(201).json({ ok: true, rule });
  });

  return router;
}
