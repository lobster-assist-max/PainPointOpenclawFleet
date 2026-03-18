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
    const limit = parseInt(req.query.limit as string, 10) || 50;

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
    const ok = service.updateRule(req.params.ruleId, req.body ?? {});
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
    const rule = service.addRule(req.body);
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
