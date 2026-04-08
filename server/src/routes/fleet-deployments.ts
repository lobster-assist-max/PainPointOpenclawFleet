/**
 * Fleet Deployment Orchestrator API Routes
 *
 * Endpoints for creating, executing, and managing fleet-wide deployments.
 *
 * @see Planning #20
 */

import { Router } from "express";
import { getDeploymentOrchestrator, type DeploymentStatus } from "../services/fleet-deployment-orchestrator.js";

export function fleetDeploymentRoutes(): Router {
  const router = Router();

  /**
   * GET /api/fleet-monitor/deployments
   * List all deployment plans, optionally filtered by status or fleet.
   */
  router.get("/deployments", (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      const fleetId = req.query.fleetId as string | undefined;
      const status = req.query.status as string | undefined;
      const plans = orchestrator.listPlans({
        fleetId,
        status: status as DeploymentStatus | undefined,
      });
      res.json({ ok: true, plans });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/deployments/stats
   * Get deployment statistics for a fleet.
   */
  router.get("/deployments/stats", (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      const fleetId = (req.query.fleetId as string) ?? "default";
      const stats = orchestrator.getStats(fleetId);
      res.json({ ok: true, stats });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/deployments/:id
   * Get a specific deployment plan.
   */
  router.get("/deployments/:id", (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      const plan = orchestrator.getPlan(req.params.id);
      if (!plan) {
        res.status(404).json({ ok: false, error: "Deployment plan not found" });
        return;
      }
      res.json({ ok: true, plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/deployments
   * Create a new deployment plan.
   */
  router.post("/deployments", (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      const plan = orchestrator.createPlan(req.body);
      res.status(201).json({ ok: true, plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/deployments/:id/execute
   * Execute a deployment plan.
   */
  router.post("/deployments/:id/execute", async (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      await orchestrator.execute(req.params.id);
      const plan = orchestrator.getPlan(req.params.id);
      res.json({ ok: true, plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/deployments/:id/pause
   * Pause a running deployment.
   */
  router.post("/deployments/:id/pause", (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      const reason = req.body.reason ?? "Manual pause";
      orchestrator.pause(req.params.id, reason);
      const plan = orchestrator.getPlan(req.params.id);
      res.json({ ok: true, plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/deployments/:id/resume
   * Resume a paused deployment.
   */
  router.post("/deployments/:id/resume", async (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      await orchestrator.resume(req.params.id);
      const plan = orchestrator.getPlan(req.params.id);
      res.json({ ok: true, plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/deployments/:id/rollback
   * Rollback a deployment.
   */
  router.post("/deployments/:id/rollback", async (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      await orchestrator.rollback(req.params.id);
      const plan = orchestrator.getPlan(req.params.id);
      res.json({ ok: true, plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/deployments/:id/cancel
   * Cancel a deployment plan.
   */
  router.post("/deployments/:id/cancel", (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      orchestrator.cancel(req.params.id);
      const plan = orchestrator.getPlan(req.params.id);
      res.json({ ok: true, plan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/deployments/:id/dry-run
   * Simulate a deployment without making changes.
   */
  router.post("/deployments/:id/dry-run", (req, res) => {
    try {
      const orchestrator = getDeploymentOrchestrator();
      const result = orchestrator.dryRun(req.params.id);
      res.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  return router;
}
