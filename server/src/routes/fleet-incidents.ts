/**
 * Fleet Incident Management API Routes
 *
 * Endpoints for creating, tracking, and resolving fleet incidents
 * through the IncidentLifecycleManager service.
 */

import { Router } from "express";
import { IncidentLifecycleManager } from "../services/fleet-incidents.js";

let _manager: IncidentLifecycleManager | null = null;

function getManager(): IncidentLifecycleManager {
  if (!_manager) {
    _manager = new IncidentLifecycleManager();
  }
  return _manager;
}

export function fleetIncidentRoutes(): Router {
  const router = Router();

  // ─── Metrics (must be before /:id to avoid matching "metrics" as id) ──

  /**
   * GET /api/fleet-monitor/incidents/metrics
   * Get MTTR/MTTI statistics for incidents.
   */
  router.get("/incidents/metrics", (_req, res) => {
    try {
      const manager = getManager();
      const metrics = manager.getMetrics();
      res.json({ ok: true, metrics });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Incident CRUD ────────────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/incidents
   * Create a new incident.
   * Body: { title, description, severity, affectedBots, source }
   */
  router.post("/incidents", (req, res) => {
    const { title, description, severity, affectedBots, source } = req.body ?? {};

    if (!title || !severity) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: title, severity",
      });
      return;
    }

    try {
      const manager = getManager();
      const incident = manager.createIncident({
        title,
        description: description ?? "",
        severity,
        affectedBots: affectedBots ?? [],
        source: source ?? "manual",
      });
      res.status(201).json({ ok: true, incident });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/incidents
   * List incidents with optional filters.
   * Query: ?status=open&severity=critical&limit=50&offset=0
   */
  router.get("/incidents", (req, res) => {
    try {
      const manager = getManager();
      const filters = {
        status: (req.query.status as string) || undefined,
        severity: (req.query.severity as string) || undefined,
        limit: Math.min(Number(req.query.limit) || 50, 200),
        offset: Number(req.query.offset) || 0,
      };
      const result = manager.listIncidents(filters);
      res.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/incidents/:id
   * Get incident detail with full timeline.
   */
  router.get("/incidents/:id", (req, res) => {
    try {
      const manager = getManager();
      const incident = manager.getIncident(req.params.id);

      if (!incident) {
        res.status(404).json({ ok: false, error: "Incident not found" });
        return;
      }

      res.json({ ok: true, incident });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * PATCH /api/fleet-monitor/incidents/:id
   * Update an incident (partial update).
   * Body: partial incident fields (title, description, severity, affectedBots, etc.)
   */
  router.patch("/incidents/:id", (req, res) => {
    try {
      const manager = getManager();
      const incident = manager.updateIncident(req.params.id, req.body ?? {});

      if (!incident) {
        res.status(404).json({ ok: false, error: "Incident not found" });
        return;
      }

      res.json({ ok: true, incident });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Incident Lifecycle Actions ───────────────────────────────────────

  /**
   * POST /api/fleet-monitor/incidents/:id/acknowledge
   * Acknowledge an incident.
   * Body: { userId, name }
   */
  router.post("/incidents/:id/acknowledge", (req, res) => {
    const { userId, name } = req.body ?? {};

    if (!userId || !name) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: userId, name",
      });
      return;
    }

    try {
      const manager = getManager();
      const incident = manager.acknowledgeIncident(req.params.id, { userId, name });

      if (!incident) {
        res.status(404).json({ ok: false, error: "Incident not found or already acknowledged" });
        return;
      }

      res.json({ ok: true, incident });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/incidents/:id/escalate
   * Escalate an incident to the next level.
   */
  router.post("/incidents/:id/escalate", (req, res) => {
    try {
      const manager = getManager();
      const incident = manager.escalateIncident(req.params.id);

      if (!incident) {
        res.status(404).json({ ok: false, error: "Incident not found or cannot be escalated" });
        return;
      }

      res.json({ ok: true, incident });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/incidents/:id/resolve
   * Resolve an incident.
   * Body: { summary, rootCause, actions }
   */
  router.post("/incidents/:id/resolve", (req, res) => {
    const { summary, rootCause, actions } = req.body ?? {};

    if (!summary) {
      res.status(400).json({
        ok: false,
        error: "Missing required field: summary",
      });
      return;
    }

    try {
      const manager = getManager();
      const incident = manager.resolveIncident(req.params.id, {
        summary,
        rootCause: rootCause ?? "",
        actions: actions ?? [],
      });

      if (!incident) {
        res.status(404).json({ ok: false, error: "Incident not found or already resolved" });
        return;
      }

      res.json({ ok: true, incident });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/incidents/:id/postmortem
   * Generate an AI-assisted postmortem for a resolved incident.
   */
  router.post("/incidents/:id/postmortem", async (req, res) => {
    try {
      const manager = getManager();
      const postmortem = await manager.generatePostmortem(req.params.id);

      if (!postmortem) {
        res.status(404).json({ ok: false, error: "Incident not found or not yet resolved" });
        return;
      }

      res.json({ ok: true, postmortem });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── On-Call Schedule ─────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/oncall
   * Get the current on-call schedule and rotation.
   */
  router.get("/oncall", (_req, res) => {
    try {
      const manager = getManager();
      const schedule = manager.getOnCallSchedule();
      res.json({ ok: true, schedule });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * PUT /api/fleet-monitor/oncall
   * Update the on-call rotation schedule.
   * Body: on-call schedule configuration
   */
  router.put("/oncall", (req, res) => {
    try {
      const manager = getManager();
      const schedule = manager.updateOnCallSchedule(req.body ?? {});
      res.json({ ok: true, schedule });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
