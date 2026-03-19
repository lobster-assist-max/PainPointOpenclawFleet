/**
 * Fleet A2A (Agent-to-Agent) Mesh API Routes
 *
 * Endpoints for managing bot expertise profiles, routing rules,
 * conversation routing, collaboration history, and feedback.
 */

import { Router } from "express";
import { getFleetA2AMeshEngine } from "../services/fleet-a2a-mesh.js";

export function fleetA2ARoutes(): Router {
  const router = Router();

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
    try {
      const engine = getFleetA2AMeshEngine();
      const route = engine.updateRoute(req.params.routeId, req.body);
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
      const filters: { since?: string; botId?: string; status?: any } = {};

      if (req.query.since) filters.since = req.query.since as string;
      if (req.query.botId) filters.botId = req.query.botId as string;
      if (req.query.status) filters.status = req.query.status as string;

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

    try {
      const engine = getFleetA2AMeshEngine();
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
