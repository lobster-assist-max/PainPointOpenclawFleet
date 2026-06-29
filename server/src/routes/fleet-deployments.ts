/**
 * Fleet Deployment Orchestrator API Routes
 *
 * Endpoints for creating, executing, and managing fleet-wide deployments.
 *
 * @see Planning #20
 */

import { Router } from "express";
import { getDeploymentOrchestrator, type DeploymentStatus, type DeploymentStrategy, type DeploymentTargetType } from "../services/fleet-deployment-orchestrator.js";

const VALID_TARGET_TYPES: DeploymentTargetType[] = ["prompt_update", "skill_install", "skill_update", "config_change", "gateway_upgrade"];
const VALID_STRATEGIES: DeploymentStrategy[] = ["all_at_once", "rolling", "blue_green", "canary_first", "ring_based"];
const VALID_ROLLBACK_POLICIES = ["auto", "manual", "auto_with_approval"] as const;
const VALID_DEPLOYMENT_STATUSES: DeploymentStatus[] = [
  "draft",
  "queued",
  "in_progress",
  "paused",
  "completed",
  "rolling_back",
  "rolled_back",
  "failed",
  "cancelled",
];

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
      // Reject unknown status values — an invalid status silently matched no plans
      // and returned an empty list with HTTP 200 instead of signalling the bad input.
      if (status !== undefined && !VALID_DEPLOYMENT_STATUSES.includes(status as DeploymentStatus)) {
        res.status(400).json({
          ok: false,
          error: `Invalid status. Must be one of: ${VALID_DEPLOYMENT_STATUSES.join(", ")}`,
        });
        return;
      }
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
      const { fleetId, name, createdBy, target, strategy } = req.body ?? {};

      // Validate required string fields
      if (typeof fleetId !== "string" || !fleetId.trim()) {
        res.status(400).json({ ok: false, error: "fleetId is required and must be a non-empty string" });
        return;
      }
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ ok: false, error: "name is required and must be a non-empty string" });
        return;
      }
      if (typeof createdBy !== "string" || !createdBy.trim()) {
        res.status(400).json({ ok: false, error: "createdBy is required and must be a non-empty string" });
        return;
      }

      // Validate target
      if (!target || typeof target !== "object") {
        res.status(400).json({ ok: false, error: "target is required and must be an object" });
        return;
      }
      if (!VALID_TARGET_TYPES.includes(target.type)) {
        res.status(400).json({ ok: false, error: `target.type must be one of: ${VALID_TARGET_TYPES.join(", ")}` });
        return;
      }

      // Validate strategy
      if (!strategy || typeof strategy !== "object") {
        res.status(400).json({ ok: false, error: "strategy is required and must be an object" });
        return;
      }
      if (!VALID_STRATEGIES.includes(strategy.type)) {
        res.status(400).json({ ok: false, error: `strategy.type must be one of: ${VALID_STRATEGIES.join(", ")}` });
        return;
      }
      if (!Array.isArray(strategy.waves) || strategy.waves.length === 0) {
        res.status(400).json({ ok: false, error: "strategy.waves must be a non-empty array" });
        return;
      }
      if (strategy.rollbackPolicy && !VALID_ROLLBACK_POLICIES.includes(strategy.rollbackPolicy)) {
        res.status(400).json({ ok: false, error: `strategy.rollbackPolicy must be one of: ${VALID_ROLLBACK_POLICIES.join(", ")}` });
        return;
      }

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
      const rawReason = req.body?.reason;
      if (rawReason !== undefined && typeof rawReason !== "string") {
        return res.status(400).json({ ok: false, error: "reason must be a string" });
      }
      const orchestrator = getDeploymentOrchestrator();
      const reason = rawReason ?? "Manual pause";
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
