/**
 * Fleet Webhook Receiver — Push-based event ingestion from OpenClaw bots.
 *
 * Instead of Fleet polling every bot every 15s, bots push events to Fleet
 * via HTTP webhooks. This dramatically reduces load at scale (50+ bots).
 *
 * Endpoints:
 *   POST /api/fleet-receiver/webhook/:botId  — receive events from a bot
 *   POST /api/fleet-receiver/register/:botId — register webhook callback on bot
 *   GET  /api/fleet-receiver/status          — webhook registration status
 */

import crypto from "node:crypto";
import { Router } from "express";
import { logger } from "../middleware/logger.js";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WebhookEvent {
  type: WebhookEventType;
  botId: string;
  timestamp: string;
  payload: Record<string, unknown>;
  signature?: string;
}

export type WebhookEventType =
  | "cron.completed"
  | "cron.failed"
  | "agent.turn.completed"
  | "agent.turn.failed"
  | "chat.message"
  | "health.changed"
  | "alert.self"
  | "channel.status"
  | "shutdown";

interface WebhookRegistration {
  botId: string;
  callbackUrl: string;
  events: WebhookEventType[];
  fleetToken: string;
  registeredAt: number;
  lastReceivedAt: number | null;
  totalReceived: number;
}

// ─── Token registry (in-memory; persisted bots re-register on connect) ────

const registrations = new Map<string, WebhookRegistration>();

// ─── HMAC verification ────────────────────────────────────────────────────

function verifySignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    /* timingSafeEqual throws on length mismatch — treat as invalid */
    return false;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────

export function fleetReceiverRoutes() {
  const router = Router();

  /**
   * POST /api/fleet-receiver/webhook/:botId
   *
   * Receives push events from a bot's OpenClaw Gateway.
   * Validates HMAC-SHA256 signature before processing.
   */
  router.post("/webhook/:botId", (req, res) => {
    const { botId } = req.params;
    const reg = registrations.get(botId);

    if (!reg) {
      res.status(404).json({ ok: false, error: "Bot not registered for webhooks" });
      return;
    }

    // Verify HMAC signature
    const signature = req.headers["x-fleet-signature"] as string | undefined;
    if (!signature) {
      res.status(401).json({ ok: false, error: "Missing x-fleet-signature header" });
      return;
    }

    const rawBody = JSON.stringify(req.body);
    if (!verifySignature(rawBody, signature, reg.fleetToken)) {
      logger.warn({ botId }, "[Fleet Receiver] Invalid webhook signature");
      res.status(401).json({ ok: false, error: "Invalid signature" });
      return;
    }

    const event = req.body as WebhookEvent;

    // Check event type is registered
    if (!reg.events.includes(event.type)) {
      res.status(400).json({ ok: false, error: `Event type '${event.type}' not registered` });
      return;
    }

    // Update stats
    reg.lastReceivedAt = Date.now();
    reg.totalReceived++;

    // Route to FleetMonitorService
    const monitor = getFleetMonitorService();

    try {
      switch (event.type) {
        case "cron.completed":
        case "cron.failed":
          monitor.emit("webhookEvent", { botId, type: "cron", payload: event.payload });
          break;

        case "agent.turn.completed":
        case "agent.turn.failed":
          monitor.emit("webhookEvent", { botId, type: "agent", payload: event.payload });
          break;

        case "chat.message":
          monitor.emit("webhookEvent", { botId, type: "chat", payload: event.payload });
          break;

        case "health.changed":
          monitor.emit("webhookEvent", { botId, type: "health", payload: event.payload });
          // Trigger immediate alert evaluation
          monitor.emit("botStateChange", { botId });
          break;

        case "alert.self":
          monitor.emit("webhookEvent", { botId, type: "selfAlert", payload: event.payload });
          break;

        case "channel.status":
          monitor.emit("webhookEvent", { botId, type: "channel", payload: event.payload });
          break;

        case "shutdown":
          monitor.emit("webhookEvent", { botId, type: "shutdown", payload: event.payload });
          break;
      }

      logger.debug({ botId, type: event.type }, "[Fleet Receiver] Processed webhook event");
      res.json({ ok: true, processedAt: new Date().toISOString() });
    } catch (err) {
      logger.error({ err, botId, type: event.type }, "[Fleet Receiver] Failed to process webhook");
      res.status(500).json({ ok: false, error: "Internal processing error" });
    }
  });

  /**
   * POST /api/fleet-receiver/register/:botId
   *
   * Register a bot for webhook delivery. Generates a fleet token
   * that the bot must include as HMAC secret in subsequent webhook calls.
   */
  router.post("/register/:botId", (req, res) => {
    const { botId } = req.params;
    const { callbackUrl, events } = req.body ?? {};

    if (!events || !Array.isArray(events) || events.length === 0) {
      res.status(400).json({ ok: false, error: "events array is required" });
      return;
    }

    // Generate fleet-specific token for this bot
    const fleetToken = crypto.randomBytes(32).toString("hex");

    const registration: WebhookRegistration = {
      botId,
      callbackUrl: callbackUrl ?? null,
      events,
      fleetToken,
      registeredAt: Date.now(),
      lastReceivedAt: null,
      totalReceived: 0,
    };

    registrations.set(botId, registration);

    logger.info(
      { botId, events, callbackUrl },
      "[Fleet Receiver] Registered bot for webhook delivery",
    );

    res.json({
      ok: true,
      fleetToken,
      webhookUrl: `/api/fleet-receiver/webhook/${botId}`,
      registeredEvents: events,
    });
  });

  /**
   * DELETE /api/fleet-receiver/register/:botId
   *
   * Unregister a bot from webhook delivery.
   */
  router.delete("/register/:botId", (req, res) => {
    const { botId } = req.params;
    const existed = registrations.delete(botId);
    res.json({ ok: true, removed: existed });
  });

  /**
   * GET /api/fleet-receiver/status
   *
   * Returns webhook registration status for all bots.
   */
  router.get("/status", (_req, res) => {
    const entries = Array.from(registrations.values()).map((r) => ({
      botId: r.botId,
      events: r.events,
      registeredAt: new Date(r.registeredAt).toISOString(),
      lastReceivedAt: r.lastReceivedAt
        ? new Date(r.lastReceivedAt).toISOString()
        : null,
      totalReceived: r.totalReceived,
    }));

    res.json({ ok: true, registrations: entries });
  });

  return router;
}
