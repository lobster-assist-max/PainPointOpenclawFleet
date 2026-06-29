/**
 * Fleet Alert API Routes
 *
 * Endpoints for querying and managing fleet alerts.
 */

import { Router } from "express";
import { getFleetAlertService } from "../services/fleet-alerts.js";

export function fleetAlertRoutes() {
  const router = Router();

  /**
   * GET /api/fleet-alerts
   * List active alerts (optionally include resolved).
   * Query: ?include_resolved=true&limit=50
   */
  router.get("/", (req, res) => {
    const service = getFleetAlertService();
    const includeResolved = req.query.include_resolved === "true";
    // Floor at 1 — a negative limit reaches slice(0, limit) and drops alerts from the end.
    const parsedLimit = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

    const alerts = includeResolved
      ? service.getAllAlerts(limit)
      : service.getActiveAlerts();

    res.json({ ok: true, alerts, counts: service.getAlertCounts() });
  });

  /**
   * GET /api/fleet-alerts/bot/:botId
   * Get alerts for a specific bot.
   */
  router.get("/bot/:botId", (req, res) => {
    const service = getFleetAlertService();
    const alerts = service.getAlertsForBot(req.params.botId);
    res.json({ ok: true, alerts });
  });

  /**
   * GET /api/fleet-alerts/counts
   * Get alert counts by severity (for sidebar badge).
   */
  router.get("/counts", (_req, res) => {
    const service = getFleetAlertService();
    res.json({ ok: true, ...service.getAlertCounts() });
  });

  /**
   * POST /api/fleet-alerts/:alertId/acknowledge
   * Acknowledge an alert.
   * Body: { acknowledgedBy: string }
   */
  router.post("/:alertId/acknowledge", (req, res) => {
    const service = getFleetAlertService();
    const { acknowledgedBy } = req.body ?? {};
    const ok = service.acknowledgeAlert(req.params.alertId, acknowledgedBy ?? "unknown");
    if (!ok) {
      res.status(404).json({ ok: false, error: "Alert not found or already resolved" });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/fleet-alerts/:alertId/resolve
   * Manually resolve an alert.
   */
  router.post("/:alertId/resolve", (req, res) => {
    const service = getFleetAlertService();
    const ok = service.resolveAlert(req.params.alertId);
    if (!ok) {
      res.status(404).json({ ok: false, error: "Alert not found or already resolved" });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * GET /api/fleet-alerts/rules
   * List all alert rules.
   */
  router.get("/rules", (_req, res) => {
    const service = getFleetAlertService();
    res.json({ ok: true, rules: service.getRules() });
  });

  /**
   * PUT /api/fleet-alerts/rules/:ruleId
   * Update an alert rule.
   */
  router.put("/rules/:ruleId", (req, res) => {
    const service = getFleetAlertService();
    const body = req.body ?? {};

    if (body.name !== undefined && typeof body.name !== "string") {
      res.status(400).json({ ok: false, error: "Invalid field: name (must be a string)" });
      return;
    }
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      res.status(400).json({ ok: false, error: "Invalid field: enabled (must be a boolean)" });
      return;
    }
    if (body.cooldownMs !== undefined && (typeof body.cooldownMs !== "number" || body.cooldownMs < 0)) {
      res.status(400).json({ ok: false, error: "Invalid field: cooldownMs (must be a non-negative number)" });
      return;
    }

    const ok = service.updateRule(req.params.ruleId, body);
    if (!ok) {
      res.status(404).json({ ok: false, error: "Rule not found" });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/fleet-alerts/rules
   * Add a new custom alert rule.
   */
  router.post("/rules", (req, res) => {
    const service = getFleetAlertService();
    const body = req.body ?? {};

    if (!body.name || typeof body.name !== "string") {
      res.status(400).json({ ok: false, error: "Missing or invalid field: name (must be a string)" });
      return;
    }
    if (typeof body.enabled !== "boolean") {
      res.status(400).json({ ok: false, error: "Missing or invalid field: enabled (must be a boolean)" });
      return;
    }
    if (!body.condition || typeof body.condition !== "object" || Array.isArray(body.condition)) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: condition (must be an object)" });
      return;
    }
    if (!body.scope || typeof body.scope !== "object" || Array.isArray(body.scope)) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: scope (must be an object)" });
      return;
    }
    const VALID_SCOPE_TYPES = ["fleet", "bot"];
    if (!VALID_SCOPE_TYPES.includes(body.scope.type)) {
      res.status(400).json({ ok: false, error: `Invalid scope.type (must be one of: ${VALID_SCOPE_TYPES.join(", ")})` });
      return;
    }
    if (!Array.isArray(body.actions)) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: actions (must be an array)" });
      return;
    }
    if (typeof body.cooldownMs !== "number" || body.cooldownMs < 0) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: cooldownMs (must be a non-negative number)" });
      return;
    }

    const rule = service.addRule(body);
    res.status(201).json({ ok: true, rule });
  });

  /**
   * DELETE /api/fleet-alerts/rules/:ruleId
   * Remove an alert rule.
   */
  router.delete("/rules/:ruleId", (req, res) => {
    const service = getFleetAlertService();
    const ok = service.removeRule(req.params.ruleId);
    if (!ok) {
      res.status(404).json({ ok: false, error: "Rule not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
