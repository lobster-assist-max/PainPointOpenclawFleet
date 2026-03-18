/**
 * Fleet Command Center API Routes
 *
 * Endpoints for orchestrating multi-bot pipeline executions —
 * start, pause, resume, abort, rollback — plus pipeline templates
 * and execution history.
 */

import { randomUUID } from "node:crypto";
import { Router } from "express";
import { logger } from "../middleware/logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PipelineStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "rolled_back";

export type PipelineStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "aborted"
  | "rolling_back"
  | "rolled_back";

export interface PipelineStep {
  id: string;
  name: string;
  action: string;
  params: Record<string, unknown>;
  status: PipelineStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  rollbackAction?: string;
}

export interface PipelineExecution {
  id: string;
  name: string;
  description: string;
  templateId: string | null;
  targetBotIds: string[];
  steps: PipelineStep[];
  status: PipelineStatus;
  currentStepIndex: number;
  progress: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string;
  error: string | null;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    name: string;
    action: string;
    params: Record<string, unknown>;
    rollbackAction?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isBuiltIn: boolean;
}

// ─── In-memory stores ──────────────────────────────────────────────────────

const executions = new Map<string, PipelineExecution>();
const templates = new Map<string, PipelineTemplate>();

// Seed built-in templates
function seedBuiltInTemplates(): void {
  const builtIns: Omit<PipelineTemplate, "id" | "createdAt" | "updatedAt">[] = [
    {
      name: "Rolling Restart",
      description: "Restart bots one at a time with health checks between each.",
      steps: [
        { name: "Pre-flight health check", action: "health.check", params: {} },
        { name: "Graceful shutdown", action: "bot.shutdown", params: { graceful: true } },
        { name: "Start bot", action: "bot.start", params: {}, rollbackAction: "bot.start" },
        { name: "Post-restart health check", action: "health.check", params: { waitMs: 5000 } },
      ],
      createdBy: "system",
      isBuiltIn: true,
    },
    {
      name: "Config Push",
      description: "Push configuration updates to target bots and verify application.",
      steps: [
        { name: "Snapshot current config", action: "config.snapshot", params: {}, rollbackAction: "config.restore" },
        { name: "Push config", action: "config.push", params: {} },
        { name: "Verify config applied", action: "config.verify", params: {} },
      ],
      createdBy: "system",
      isBuiltIn: true,
    },
    {
      name: "Plugin Update",
      description: "Update plugins across the fleet with rollback support.",
      steps: [
        { name: "Snapshot plugin state", action: "plugin.snapshot", params: {}, rollbackAction: "plugin.restore" },
        { name: "Install plugin update", action: "plugin.update", params: {} },
        { name: "Validate plugin health", action: "plugin.validate", params: {} },
        { name: "Reload plugin", action: "plugin.reload", params: {} },
      ],
      createdBy: "system",
      isBuiltIn: true,
    },
  ];

  for (const tpl of builtIns) {
    const id = randomUUID();
    const now = new Date().toISOString();
    templates.set(id, { id, ...tpl, createdAt: now, updatedAt: now });
  }
}

seedBuiltInTemplates();

// ─── Helpers ───────────────────────────────────────────────────────────────

function computeProgress(execution: PipelineExecution): number {
  if (execution.steps.length === 0) return 0;
  const completedCount = execution.steps.filter(
    (s) => s.status === "completed" || s.status === "skipped" || s.status === "rolled_back",
  ).length;
  return Math.round((completedCount / execution.steps.length) * 100);
}

function advancePipeline(execution: PipelineExecution): void {
  // Simulate advancing to the next step (in production, a service layer
  // would coordinate actual bot RPCs and step transitions).
  const currentStep = execution.steps[execution.currentStepIndex];
  if (currentStep && currentStep.status === "pending") {
    currentStep.status = "running";
    currentStep.startedAt = new Date().toISOString();
  }
  execution.progress = computeProgress(execution);
}

// ─── Router ────────────────────────────────────────────────────────────────

export function fleetCommandRoutes() {
  const router = Router();

  /**
   * POST /api/fleet-command/execute
   * Start a new pipeline execution.
   *
   * Body: { name, description?, templateId?, targetBotIds, steps?, params?, createdBy? }
   *
   * Either provide `templateId` to use a saved template, or provide
   * `steps` inline for an ad-hoc pipeline. `targetBotIds` is always required.
   */
  router.post("/execute", (req, res) => {
    const { name, description, templateId, targetBotIds, steps, params, createdBy } =
      req.body ?? {};

    if (!name || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: name" });
      return;
    }

    if (!targetBotIds || !Array.isArray(targetBotIds) || targetBotIds.length === 0) {
      res.status(400).json({
        ok: false,
        error: "Missing or empty required field: targetBotIds (string[])",
      });
      return;
    }

    // Resolve steps from template or inline definition
    let resolvedSteps: PipelineStep[];

    if (templateId) {
      const template = templates.get(templateId);
      if (!template) {
        res.status(404).json({ ok: false, error: `Template not found: ${templateId}` });
        return;
      }
      resolvedSteps = template.steps.map((s) => ({
        id: randomUUID(),
        name: s.name,
        action: s.action,
        params: { ...s.params, ...(params ?? {}) },
        status: "pending" as PipelineStepStatus,
        startedAt: null,
        completedAt: null,
        error: null,
        rollbackAction: s.rollbackAction,
      }));
    } else if (steps && Array.isArray(steps) && steps.length > 0) {
      resolvedSteps = steps.map(
        (s: { name?: string; action?: string; params?: Record<string, unknown>; rollbackAction?: string }) => {
          if (!s.action) {
            throw new Error("Each step must have an action");
          }
          return {
            id: randomUUID(),
            name: s.name ?? s.action,
            action: s.action,
            params: s.params ?? {},
            status: "pending" as PipelineStepStatus,
            startedAt: null,
            completedAt: null,
            error: null,
            rollbackAction: s.rollbackAction,
          };
        },
      );
    } else {
      res.status(400).json({
        ok: false,
        error: "Provide either templateId or steps[] to define the pipeline",
      });
      return;
    }

    const now = new Date().toISOString();
    const execution: PipelineExecution = {
      id: randomUUID(),
      name,
      description: description ?? "",
      templateId: templateId ?? null,
      targetBotIds,
      steps: resolvedSteps,
      status: "running",
      currentStepIndex: 0,
      progress: 0,
      createdAt: now,
      startedAt: now,
      completedAt: null,
      createdBy: createdBy ?? "unknown",
      error: null,
    };

    // Kick off the first step
    advancePipeline(execution);
    executions.set(execution.id, execution);

    logger.info(
      { executionId: execution.id, name, targetBotIds, stepCount: resolvedSteps.length },
      "[Fleet Command] Pipeline execution started",
    );

    res.status(201).json({ ok: true, execution });
  });

  /**
   * GET /api/fleet-command/:id/status
   * Get pipeline execution status including steps, progress, and current step.
   */
  router.get("/:id/status", (req, res) => {
    const execution = executions.get(req.params.id);
    if (!execution) {
      res.status(404).json({ ok: false, error: "Pipeline execution not found" });
      return;
    }

    res.json({
      ok: true,
      id: execution.id,
      name: execution.name,
      status: execution.status,
      progress: execution.progress,
      currentStepIndex: execution.currentStepIndex,
      currentStep: execution.steps[execution.currentStepIndex] ?? null,
      steps: execution.steps,
      targetBotIds: execution.targetBotIds,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      error: execution.error,
    });
  });

  /**
   * POST /api/fleet-command/:id/pause
   * Pause a running pipeline. The current step will finish, but no new steps start.
   */
  router.post("/:id/pause", (req, res) => {
    const execution = executions.get(req.params.id);
    if (!execution) {
      res.status(404).json({ ok: false, error: "Pipeline execution not found" });
      return;
    }

    if (execution.status !== "running") {
      res.status(409).json({
        ok: false,
        error: `Cannot pause pipeline in '${execution.status}' state (must be 'running')`,
      });
      return;
    }

    execution.status = "paused";
    logger.info({ executionId: execution.id }, "[Fleet Command] Pipeline paused");
    res.json({ ok: true, id: execution.id, status: execution.status });
  });

  /**
   * POST /api/fleet-command/:id/resume
   * Resume a paused pipeline from where it left off.
   */
  router.post("/:id/resume", (req, res) => {
    const execution = executions.get(req.params.id);
    if (!execution) {
      res.status(404).json({ ok: false, error: "Pipeline execution not found" });
      return;
    }

    if (execution.status !== "paused") {
      res.status(409).json({
        ok: false,
        error: `Cannot resume pipeline in '${execution.status}' state (must be 'paused')`,
      });
      return;
    }

    execution.status = "running";
    advancePipeline(execution);
    logger.info({ executionId: execution.id }, "[Fleet Command] Pipeline resumed");
    res.json({ ok: true, id: execution.id, status: execution.status });
  });

  /**
   * POST /api/fleet-command/:id/abort
   * Abort a running or paused pipeline. Remaining steps are marked as skipped.
   */
  router.post("/:id/abort", (req, res) => {
    const execution = executions.get(req.params.id);
    if (!execution) {
      res.status(404).json({ ok: false, error: "Pipeline execution not found" });
      return;
    }

    if (execution.status !== "running" && execution.status !== "paused") {
      res.status(409).json({
        ok: false,
        error: `Cannot abort pipeline in '${execution.status}' state (must be 'running' or 'paused')`,
      });
      return;
    }

    // Mark remaining pending steps as skipped
    for (const step of execution.steps) {
      if (step.status === "pending") {
        step.status = "skipped";
      }
    }

    execution.status = "aborted";
    execution.completedAt = new Date().toISOString();
    execution.progress = computeProgress(execution);

    logger.info({ executionId: execution.id }, "[Fleet Command] Pipeline aborted");
    res.json({ ok: true, id: execution.id, status: execution.status });
  });

  /**
   * POST /api/fleet-command/:id/rollback
   * Trigger manual rollback. Walks completed steps in reverse order,
   * executing each step's rollbackAction if defined.
   */
  router.post("/:id/rollback", (req, res) => {
    const execution = executions.get(req.params.id);
    if (!execution) {
      res.status(404).json({ ok: false, error: "Pipeline execution not found" });
      return;
    }

    const terminalStates: PipelineStatus[] = ["rolled_back", "rolling_back"];
    if (terminalStates.includes(execution.status)) {
      res.status(409).json({
        ok: false,
        error: `Pipeline is already in '${execution.status}' state`,
      });
      return;
    }

    if (execution.status === "pending") {
      res.status(409).json({
        ok: false,
        error: "Cannot rollback a pipeline that has not started",
      });
      return;
    }

    execution.status = "rolling_back";

    // Walk completed steps in reverse, mark as rolling back
    const completedSteps = execution.steps
      .filter((s) => s.status === "completed" && s.rollbackAction)
      .reverse();

    const rollbackStepIds: string[] = [];
    for (const step of completedSteps) {
      step.status = "rolled_back";
      rollbackStepIds.push(step.id);
    }

    // Mark any pending/running steps as skipped
    for (const step of execution.steps) {
      if (step.status === "pending" || step.status === "running") {
        step.status = "skipped";
      }
    }

    execution.status = "rolled_back";
    execution.completedAt = new Date().toISOString();
    execution.progress = computeProgress(execution);

    logger.info(
      { executionId: execution.id, rolledBackSteps: rollbackStepIds.length },
      "[Fleet Command] Pipeline rollback completed",
    );

    res.json({
      ok: true,
      id: execution.id,
      status: execution.status,
      rolledBackSteps: rollbackStepIds,
    });
  });

  /**
   * GET /api/fleet-command/templates
   * List available pipeline templates.
   */
  router.get("/templates", (_req, res) => {
    const list = Array.from(templates.values()).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      stepCount: t.steps.length,
      isBuiltIn: t.isBuiltIn,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: t.createdBy,
    }));

    res.json({ ok: true, templates: list });
  });

  /**
   * POST /api/fleet-command/templates
   * Save a custom pipeline template.
   *
   * Body: { name, description?, steps, createdBy? }
   */
  router.post("/templates", (req, res) => {
    const { name, description, steps, createdBy } = req.body ?? {};

    if (!name || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: name" });
      return;
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ ok: false, error: "Missing or empty required field: steps[]" });
      return;
    }

    // Validate each step has at minimum an action
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].action || typeof steps[i].action !== "string") {
        res.status(400).json({
          ok: false,
          error: `Step at index ${i} is missing required field: action`,
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const template: PipelineTemplate = {
      id: randomUUID(),
      name,
      description: description ?? "",
      steps: steps.map((s: { name?: string; action: string; params?: Record<string, unknown>; rollbackAction?: string }) => ({
        name: s.name ?? s.action,
        action: s.action,
        params: s.params ?? {},
        rollbackAction: s.rollbackAction,
      })),
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy ?? "unknown",
      isBuiltIn: false,
    };

    templates.set(template.id, template);

    logger.info(
      { templateId: template.id, name, stepCount: template.steps.length },
      "[Fleet Command] Custom pipeline template saved",
    );

    res.status(201).json({ ok: true, template });
  });

  /**
   * GET /api/fleet-command/history
   * List past pipeline executions with pagination.
   *
   * Query: ?limit=20&offset=0&status=completed&botId=xxx
   */
  router.get("/history", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const statusFilter = req.query.status as string | undefined;
    const botIdFilter = req.query.botId as string | undefined;

    let items = Array.from(executions.values());

    // Apply filters
    if (statusFilter) {
      items = items.filter((e) => e.status === statusFilter);
    }
    if (botIdFilter) {
      items = items.filter((e) => e.targetBotIds.includes(botIdFilter));
    }

    // Sort by creation date, newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = items.length;
    const paged = items.slice(offset, offset + limit);

    res.json({
      ok: true,
      executions: paged.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        progress: e.progress,
        targetBotIds: e.targetBotIds,
        stepCount: e.steps.length,
        createdAt: e.createdAt,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        createdBy: e.createdBy,
      })),
      total,
      limit,
      offset,
    });
  });

  return router;
}
