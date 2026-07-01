/**
 * Fleet Ops Playbook API Routes
 *
 * Endpoints for managing operational playbooks and their executions.
 *
 * @see Planning #20
 */

import { Router } from "express";
import type { Request, Response } from "express";
import {
  getPlaybookEngine,
  type ExecutionStatus,
  type PlaybookExecution,
} from "../services/fleet-playbook-engine.js";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

const VALID_EXECUTION_STATUSES: ExecutionStatus[] = [
  "running",
  "paused",
  "waiting_approval",
  "completed",
  "failed",
  "aborted",
];

/**
 * Resolve an execution the caller is allowed to act on. When the execution is
 * tenant-owned and the request's `?companyId=` doesn't match, we report 404
 * (not 403 — avoids leaking the existence of another tenant's execution).
 * Unscoped callers (no companyId) proceed for backward compat. Returns null
 * (and writes the response) on not-found / cross-tenant access.
 */
function resolveOwnedExecution(req: Request, res: Response): PlaybookExecution | null {
  const engine = getPlaybookEngine();
  const execution = engine.getExecution(String(req.params.execId));
  if (!execution) {
    res.status(404).json({ ok: false, error: "Execution not found" });
    return null;
  }
  const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
  if (companyId && execution.companyId && execution.companyId !== companyId) {
    res.status(404).json({ ok: false, error: "Execution not found" });
    return null;
  }
  return execution;
}

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
      const { name, description, version, tags, triggerConditions, steps, createdBy } = req.body ?? {};

      if (!name || typeof name !== "string") {
        res.status(400).json({ ok: false, error: "Missing or invalid field: name (must be a string)" });
        return;
      }
      if (!description || typeof description !== "string") {
        res.status(400).json({ ok: false, error: "Missing or invalid field: description (must be a string)" });
        return;
      }
      if (typeof version !== "number" || version < 1) {
        res.status(400).json({ ok: false, error: "Missing or invalid field: version (must be a positive number)" });
        return;
      }
      if (!Array.isArray(tags)) {
        res.status(400).json({ ok: false, error: "Missing or invalid field: tags (must be an array)" });
        return;
      }
      if (!Array.isArray(steps) || steps.length === 0) {
        res.status(400).json({ ok: false, error: "Missing or invalid field: steps (must be a non-empty array)" });
        return;
      }
      if (!createdBy || typeof createdBy !== "string") {
        res.status(400).json({ ok: false, error: "Missing or invalid field: createdBy (must be a string)" });
        return;
      }

      const playbook = engine.register({
        name,
        description,
        version,
        tags,
        triggerConditions: Array.isArray(triggerConditions) ? triggerConditions : [],
        steps,
        createdBy,
      });
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
      // listExecutions filters e.status === status, so an invalid ?status=garbage
      // passes the truthy check, matches nothing, and returns an empty list with
      // HTTP 200 instead of signalling bad input.
      const status = req.query.status as string | undefined;
      if (status !== undefined && !VALID_EXECUTION_STATUSES.includes(status as ExecutionStatus)) {
        return res.status(400).json({
          ok: false,
          error: `status must be one of: ${VALID_EXECUTION_STATUSES.join(", ")}`,
        });
      }
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const executions = engine.listExecutions({
        playbookId,
        status: status as ExecutionStatus | undefined,
        companyId,
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
      const body = req.body ?? {};
      const VALID_TRIGGERS = ["auto", "manual"];

      if (body.triggeredBy && !VALID_TRIGGERS.includes(body.triggeredBy)) {
        res.status(400).json({ ok: false, error: `Invalid triggeredBy value (must be one of: ${VALID_TRIGGERS.join(", ")})` });
        return;
      }
      if (body.targetBotId && typeof body.targetBotId !== "string") {
        res.status(400).json({ ok: false, error: "Invalid targetBotId (must be a string)" });
        return;
      }
      if (body.companyId !== undefined && typeof body.companyId !== "string") {
        res.status(400).json({ ok: false, error: "companyId must be a string" });
        return;
      }

      // Tenant scoping: a playbook run may only target a bot the caller's
      // company owns. The engine's step executor actuates real gateway RPCs
      // against targetBotId, so a caller must not be able to drive a playbook
      // against another tenant's bot. Rejected with 404 (not 403) to avoid
      // leaking the existence of another tenant's bot.
      const companyId: string | undefined = body.companyId;
      if (companyId && body.targetBotId) {
        const info = getFleetMonitorService().getBotInfo(body.targetBotId);
        if (info != null && info.companyId !== companyId) {
          res.status(404).json({ ok: false, error: `Bot not found: ${body.targetBotId}` });
          return;
        }
      }

      const execution = engine.execute(req.params.id, {
        triggeredBy: body.triggeredBy,
        triggeredByRef: body.triggeredByRef,
        linkedIncidentId: body.linkedIncidentId,
        targetBotId: body.targetBotId,
        companyId,
        context: body.context,
      });
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
      const execution = resolveOwnedExecution(req, res);
      if (!execution) return;
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
      if (!resolveOwnedExecution(req, res)) return;
      const { stepId, approvedBy } = req.body ?? {};
      if (!stepId || typeof stepId !== "string") {
        res.status(400).json({ ok: false, error: "Missing or invalid field: stepId (must be a string)" });
        return;
      }
      if (approvedBy !== undefined && typeof approvedBy !== "string") {
        res.status(400).json({ ok: false, error: "Invalid field: approvedBy (must be a string)" });
        return;
      }
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
      if (!resolveOwnedExecution(req, res)) return;
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
      if (!resolveOwnedExecution(req, res)) return;
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
      if (!resolveOwnedExecution(req, res)) return;
      const body = req.body ?? {};
      if (body.reason !== undefined && typeof body.reason !== "string") {
        res.status(400).json({ ok: false, error: "Invalid field: reason (must be a string)" });
        return;
      }
      const reason = body.reason ?? "Manual abort";
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
