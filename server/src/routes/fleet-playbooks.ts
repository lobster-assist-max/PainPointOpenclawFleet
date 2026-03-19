/**
 * Fleet Ops Playbook API Routes
 *
 * Endpoints for managing operational playbooks and their executions.
 *
 * @see Planning #20
 */

import { Router } from "express";
import { getPlaybookEngine } from "../services/fleet-playbook-engine.js";

export function fleetPlaybookRoutes(): Router {
  const router = Router();

  // ─── Playbook Library ──────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/playbooks
   * List all available playbooks.
   */
  router.get("/playbooks", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const tags = req.query.tags ? (req.query.tags as string).split(",") : undefined;
      const playbooks = engine.listPlaybooks(tags);
      res.json({ ok: true, playbooks });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/playbooks/stats
   * Get playbook execution statistics.
   */
  router.get("/playbooks/stats", (_req, res) => {
    try {
      const engine = getPlaybookEngine();
      const stats = engine.getStats();
      res.json({ ok: true, stats });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/playbooks/:id
   * Get a specific playbook.
   */
  router.get("/playbooks/:id", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const playbook = engine.getPlaybook(req.params.id);
      if (!playbook) {
        res.status(404).json({ ok: false, error: "Playbook not found" });
        return;
      }
      res.json({ ok: true, playbook });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/playbooks
   * Register a new playbook.
   */
  router.post("/playbooks", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const playbook = engine.register(req.body);
      res.status(201).json({ ok: true, playbook });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  // ─── Executions ────────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/playbooks/executions/list
   * List playbook executions.
   */
  router.get("/playbooks/executions/list", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const playbookId = req.query.playbookId as string | undefined;
      const status = req.query.status as string | undefined;
      const executions = engine.listExecutions({
        playbookId,
        status: status as any,
      });
      res.json({ ok: true, executions });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/playbooks/:id/execute
   * Execute a playbook.
   */
  router.post("/playbooks/:id/execute", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const execution = engine.execute(req.params.id, req.body);
      res.status(201).json({ ok: true, execution });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/playbooks/executions/:execId
   * Get a specific execution.
   */
  router.get("/playbooks/executions/:execId", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const execution = engine.getExecution(req.params.execId);
      if (!execution) {
        res.status(404).json({ ok: false, error: "Execution not found" });
        return;
      }
      res.json({ ok: true, execution });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/playbooks/executions/:execId/approve
   * Approve a pending approval step.
   */
  router.post("/playbooks/executions/:execId/approve", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const { stepId, approvedBy } = req.body;
      engine.approveStep(req.params.execId, stepId, approvedBy ?? "unknown");
      const execution = engine.getExecution(req.params.execId);
      res.json({ ok: true, execution });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/playbooks/executions/:execId/pause
   * Pause a running execution.
   */
  router.post("/playbooks/executions/:execId/pause", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      engine.pause(req.params.execId);
      const execution = engine.getExecution(req.params.execId);
      res.json({ ok: true, execution });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/playbooks/executions/:execId/resume
   * Resume a paused execution.
   */
  router.post("/playbooks/executions/:execId/resume", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      engine.resume(req.params.execId);
      const execution = engine.getExecution(req.params.execId);
      res.json({ ok: true, execution });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/playbooks/executions/:execId/abort
   * Abort a running execution.
   */
  router.post("/playbooks/executions/:execId/abort", (req, res) => {
    try {
      const engine = getPlaybookEngine();
      const reason = req.body.reason ?? "Manual abort";
      engine.abort(req.params.execId, reason);
      const execution = engine.getExecution(req.params.execId);
      res.json({ ok: true, execution });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  return router;
}
