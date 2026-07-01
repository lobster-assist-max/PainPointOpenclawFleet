/**
 * Fleet A2A (Agent-to-Agent) Mesh API Routes
 *
 * Endpoints for managing bot expertise profiles, routing rules,
 * conversation routing, collaboration history, and feedback.
 */

import { Router, type Request, type Response } from "express";
import { getFleetA2AMeshEngine, type A2ACollaboration } from "../services/fleet-a2a-mesh.js";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

const VALID_COLLABORATION_STATUSES: ReadonlyArray<A2ACollaboration["status"]> = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "timed_out",
];

export function fleetA2ARoutes(): Router {
  const router = Router();

  /**
   * Tenant-ownership guard for the per-bot expertise routes, where :companyId is
   * a PATH param. auto-detect READS the bot's SOUL.md/IDENTITY.md over the gateway
   * and the write stores an expertise profile — both keyed by (:companyId, :botId)
   * with no check that the bot actually belongs to that company. Without this a
   * caller could pass their own :companyId + ANOTHER tenant's :botId and read that
   * bot's private identity (cross-tenant read IDOR, same class as #204/#205/#208).
   * Resolve the bot's owning tenant from the live monitor and reject on mismatch.
   * Writes a 404 (never 403 — avoids leaking that another tenant's bot exists) and
   * returns false. A disconnected bot (no live tenant to compare against, and
   * nothing reachable over RPC) proceeds unchanged.
   */
  function requireBotInCompany(
    res: Response,
    companyId: string,
    botId: string,
  ): boolean {
    const info = getFleetMonitorService().getBotInfo(botId);
    if (info && info.companyId && info.companyId !== companyId) {
      res.status(404).json({ ok: false, error: "Bot not found" });
      return false;
    }
    return true;
  }

  /**
   * Tenant-ownership guard for the by-id route/collaboration mutations, where the
   * resource carries its own companyId and the caller supplies ownership via
   * ?companyId=. PATCH/DELETE /a2a/routes/:routeId modify a route and
   * POST /a2a/feedback/:collaborationId corrupts a collaboration's running
   * satisfaction average — all keyed only by the resource id, so without this a
   * caller could edit/delete/poison ANOTHER tenant's resource by id (cross-tenant
   * IDOR, same class as #207/#209/#210). Writes a 404 (never 403) and returns
   * false on mismatch. A caller with no ?companyId= (legacy/admin) proceeds.
   */
  function requireResourceCompany(
    req: Request,
    res: Response,
    resourceCompanyId: string | undefined,
  ): boolean {
    const companyId = req.query.companyId;
    if (typeof companyId !== "string" || companyId.length === 0) return true;
    if (resourceCompanyId && resourceCompanyId !== companyId) {
      res.status(404).json({ ok: false, error: "Not found" });
      return false;
    }
    return true;
  }

  // ─── Expertise ──────────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/a2a/expertise/:companyId
   * Get the expertise matrix for all bots in a company's fleet.
   */
  router.get("/a2a/expertise/:companyId", (_req, res) => {
    try {
      const engine = getFleetA2AMeshEngine();
      const matrix = engine.getExpertiseMatrix(_req.params.companyId);
      res.json({ ok: true, matrix });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/a2a/expertise/:companyId/:botId
   * Update a bot's expertise profile.
   * Body: { expertise: Array<{domain, confidence, source, sampleCount, avgSatisfaction}> }
   */
  router.post("/a2a/expertise/:companyId/:botId", (req, res) => {
    const { companyId, botId } = req.params;
    const { expertise } = req.body ?? {};

    if (!Array.isArray(expertise)) {
      res.status(400).json({ ok: false, error: "Missing required field: expertise (array)" });
      return;
    }

    // Validate each entry — updateExpertise maps over `e.domain`, so a null/
    // primitive element would throw a TypeError (500) instead of a clean 400.
    for (let i = 0; i < expertise.length; i++) {
      const e = expertise[i];
      if (!e || typeof e !== "object" || typeof e.domain !== "string" || e.domain.length === 0) {
        res.status(400).json({
          ok: false,
          error: `expertise[${i}] must be an object with a non-empty string 'domain'`,
        });
        return;
      }
      if (
        e.confidence !== undefined &&
        (typeof e.confidence !== "number" || !Number.isFinite(e.confidence) || e.confidence < 0 || e.confidence > 1)
      ) {
        res.status(400).json({
          ok: false,
          error: `expertise[${i}].confidence must be a number between 0 and 1`,
        });
        return;
      }
    }

    if (!requireBotInCompany(res, companyId, botId)) return;

    try {
      const engine = getFleetA2AMeshEngine();
      const profile = engine.updateExpertise(companyId, botId, expertise);
      res.json({ ok: true, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/a2a/expertise/:companyId/:botId/auto-detect
   * Auto-detect a bot's expertise from its SOUL.md and IDENTITY.md files.
   */
  router.post("/a2a/expertise/:companyId/:botId/auto-detect", async (req, res) => {
    const { companyId, botId } = req.params;

    if (!requireBotInCompany(res, companyId, botId)) return;

    try {
      const engine = getFleetA2AMeshEngine();
      const profile = await engine.autoDetectExpertise(companyId, botId);
      res.json({ ok: true, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ ok: false, error: message });
    }
  });

  // ─── Routes ─────────────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/a2a/routes/:companyId
   * List all A2A routing rules for a company.
   */
  router.get("/a2a/routes/:companyId", (req, res) => {
    try {
      const engine = getFleetA2AMeshEngine();
      const routes = engine.listRoutes(req.params.companyId);
      res.json({ ok: true, routes });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/a2a/routes
   * Create a new A2A routing rule.
   * Body: { companyId, name, description, trigger, routing, mode, enabled, priority }
   */
  router.post("/a2a/routes", (req, res) => {
    const { companyId, name, description, trigger, routing, mode, enabled, priority } =
      req.body ?? {};

    if (!companyId || !name || !trigger || !routing) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: companyId, name, trigger, routing",
      });
      return;
    }

    if (typeof companyId !== "string" || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "Fields 'companyId' and 'name' must be strings" });
      return;
    }
    if (typeof trigger !== "object" || Array.isArray(trigger) || typeof routing !== "object" || Array.isArray(routing)) {
      res.status(400).json({ ok: false, error: "Fields 'trigger' and 'routing' must be objects" });
      return;
    }
    if (mode !== undefined && !["transparent", "supervised", "autonomous"].includes(mode)) {
      res.status(400).json({ ok: false, error: "Field 'mode' must be transparent, supervised, or autonomous" });
      return;
    }
    if (enabled !== undefined && typeof enabled !== "boolean") {
      res.status(400).json({ ok: false, error: "Field 'enabled' must be a boolean" });
      return;
    }
    if (priority !== undefined && (typeof priority !== "number" || !Number.isFinite(priority))) {
      res.status(400).json({ ok: false, error: "Field 'priority' must be a finite number" });
      return;
    }

    try {
      const engine = getFleetA2AMeshEngine();
      const route = engine.createRoute({
        companyId,
        name,
        description: description ?? "",
        trigger,
        routing,
        mode: mode ?? "transparent",
        enabled: enabled ?? true,
        priority: priority ?? 0,
      });
      res.status(201).json({ ok: true, route });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * PATCH /api/fleet-monitor/a2a/routes/:routeId
   * Update an existing A2A routing rule.
   * Body: partial route fields
   */
  router.patch("/a2a/routes/:routeId", (req, res) => {
    const patch = req.body ?? {};

    if (patch.name !== undefined && typeof patch.name !== "string") {
      res.status(400).json({ ok: false, error: "Field 'name' must be a string" });
      return;
    }
    if (patch.mode !== undefined && !["transparent", "supervised", "autonomous"].includes(patch.mode)) {
      res.status(400).json({ ok: false, error: "Field 'mode' must be transparent, supervised, or autonomous" });
      return;
    }
    if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") {
      res.status(400).json({ ok: false, error: "Field 'enabled' must be a boolean" });
      return;
    }
    if (patch.priority !== undefined && (typeof patch.priority !== "number" || !Number.isFinite(patch.priority))) {
      res.status(400).json({ ok: false, error: "Field 'priority' must be a finite number" });
      return;
    }

    try {
      const engine = getFleetA2AMeshEngine();
      if (!requireResourceCompany(req, res, engine.getRoute(req.params.routeId)?.companyId)) return;
      const route = engine.updateRoute(req.params.routeId, patch);
      res.json({ ok: true, route });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not found")) {
        res.status(404).json({ ok: false, error: message });
      } else {
        res.status(500).json({ ok: false, error: message });
      }
    }
  });

  /**
   * DELETE /api/fleet-monitor/a2a/routes/:routeId
   * Delete an A2A routing rule.
   */
  router.delete("/a2a/routes/:routeId", (req, res) => {
    try {
      const engine = getFleetA2AMeshEngine();
      if (!requireResourceCompany(req, res, engine.getRoute(req.params.routeId)?.companyId)) return;
      const deleted = engine.deleteRoute(req.params.routeId);
      if (!deleted) {
        res.status(404).json({ ok: false, error: "Route not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Conversation Routing ───────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/a2a/route-conversation
   * Route a conversation from one bot to a better-suited bot.
   * Body: { companyId, originBotId, sessionKey, userMessage, context?: { topic, confidence } }
   */
  router.post("/a2a/route-conversation", async (req, res) => {
    const { companyId, originBotId, sessionKey, userMessage, context } = req.body ?? {};

    if (!companyId || !originBotId || !sessionKey || !userMessage) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: companyId, originBotId, sessionKey, userMessage",
      });
      return;
    }

    // routeConversation passes userMessage to detectTopic() → message.toLowerCase().
    // A non-string (number/object) would throw, surfacing as a misleading 502 —
    // validate types here so bad input returns a clean 400.
    if (
      typeof companyId !== "string" ||
      typeof originBotId !== "string" ||
      typeof sessionKey !== "string" ||
      typeof userMessage !== "string"
    ) {
      res.status(400).json({
        ok: false,
        error: "Fields companyId, originBotId, sessionKey, userMessage must be strings",
      });
      return;
    }
    if (context !== undefined) {
      if (typeof context !== "object" || Array.isArray(context)) {
        res.status(400).json({ ok: false, error: "Field 'context' must be an object" });
        return;
      }
      if (context.topic !== undefined && typeof context.topic !== "string") {
        res.status(400).json({ ok: false, error: "Field 'context.topic' must be a string" });
        return;
      }
      if (
        context.confidence !== undefined &&
        (typeof context.confidence !== "number" || !Number.isFinite(context.confidence))
      ) {
        res.status(400).json({ ok: false, error: "Field 'context.confidence' must be a number" });
        return;
      }
    }

    try {
      const engine = getFleetA2AMeshEngine();
      const collaboration = await engine.routeConversation(
        companyId,
        originBotId,
        sessionKey,
        userMessage,
        context,
      );
      res.json({ ok: true, collaboration });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ ok: false, error: message });
    }
  });

  // ─── Collaboration History & Stats ──────────────────────────────────────

  /**
   * GET /api/fleet-monitor/a2a/collaborations/:companyId
   * Get collaboration history for a company.
   * Query: ?since=ISO&botId=xxx&status=completed
   */
  router.get("/a2a/collaborations/:companyId", (req, res) => {
    try {
      const engine = getFleetA2AMeshEngine();
      const filters: { since?: string; botId?: string; status?: A2ACollaboration["status"] } = {};

      if (req.query.since) {
        // An invalid `since` becomes an Invalid Date (NaN) in the engine, where
        // `initiatedAt >= NaN` is always false — silently returning zero rows.
        const since = req.query.since as string;
        if (Number.isNaN(new Date(since).getTime())) {
          res.status(400).json({ ok: false, error: "since must be a valid date" });
          return;
        }
        filters.since = since;
      }
      if (req.query.botId) filters.botId = req.query.botId as string;
      if (req.query.status) {
        // An unknown status never matches `c.status === status`, so the engine
        // silently returns an empty list with HTTP 200 instead of signalling bad input.
        const status = req.query.status as A2ACollaboration["status"];
        if (!VALID_COLLABORATION_STATUSES.includes(status)) {
          res.status(400).json({
            ok: false,
            error: `Invalid status. Must be one of: ${VALID_COLLABORATION_STATUSES.join(", ")}`,
          });
          return;
        }
        filters.status = status;
      }

      const collaborations = engine.getCollaborationHistory(
        req.params.companyId,
        Object.keys(filters).length > 0 ? filters : undefined,
      );
      res.json({ ok: true, collaborations });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/a2a/stats/:companyId
   * Get aggregated collaboration statistics.
   * Query: ?periodStart=ISO&periodEnd=ISO
   */
  router.get("/a2a/stats/:companyId", (req, res) => {
    const periodStart = req.query.periodStart as string | undefined;
    const periodEnd = req.query.periodEnd as string | undefined;

    if (!periodStart || !periodEnd) {
      res.status(400).json({
        ok: false,
        error: "Missing required query parameters: periodStart, periodEnd",
      });
      return;
    }

    // Malformed dates flow in as NaN, where `ts >= NaN && ts <= NaN` is always
    // false — the endpoint would return all-zero "stats" with HTTP 200.
    if (
      Number.isNaN(new Date(periodStart).getTime()) ||
      Number.isNaN(new Date(periodEnd).getTime())
    ) {
      res.status(400).json({ ok: false, error: "periodStart and periodEnd must be valid dates" });
      return;
    }

    try {
      const engine = getFleetA2AMeshEngine();
      const stats = engine.getCollaborationStats(req.params.companyId, {
        start: periodStart,
        end: periodEnd,
      });
      res.json({ ok: true, stats });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Feedback ───────────────────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/a2a/feedback/:collaborationId
   * Submit feedback for a collaboration to adjust expertise weights.
   * Body: { success: boolean, satisfaction?: number, notes?: string }
   */
  router.post("/a2a/feedback/:collaborationId", (req, res) => {
    const { success, satisfaction, notes } = req.body ?? {};

    if (typeof success !== "boolean") {
      res.status(400).json({ ok: false, error: "Missing required field: success (boolean)" });
      return;
    }

    // satisfaction feeds a running average `prev + (satisfaction - prev) / n` in the
    // engine — a non-number (or NaN/out-of-range) value would permanently corrupt the
    // bot's avgSatisfaction with NaN. Reject anything that isn't a finite 0–1 score.
    if (
      satisfaction !== undefined &&
      (typeof satisfaction !== "number" ||
        !Number.isFinite(satisfaction) ||
        satisfaction < 0 ||
        satisfaction > 1)
    ) {
      res.status(400).json({
        ok: false,
        error: "satisfaction must be a number between 0 and 1",
      });
      return;
    }

    if (notes !== undefined && typeof notes !== "string") {
      res.status(400).json({ ok: false, error: "notes must be a string" });
      return;
    }

    try {
      const engine = getFleetA2AMeshEngine();
      if (
        !requireResourceCompany(req, res, engine.getCollaboration(req.params.collaborationId)?.companyId)
      )
        return;
      const updated = engine.feedbackLoop(req.params.collaborationId, {
        success,
        satisfaction,
        notes,
      });

      if (!updated) {
        res.status(404).json({ ok: false, error: "Collaboration not found" });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
