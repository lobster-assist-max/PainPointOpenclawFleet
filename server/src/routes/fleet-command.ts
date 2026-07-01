/**
 * Fleet Command Center API Routes
 *
 * Endpoints for orchestrating multi-bot pipeline executions —
 * start, pause, resume, abort, rollback — plus pipeline templates.
 *
 * The request/response contract here mirrors the Fleet Command Center UI
 * (`ui/src/components/fleet/CommandCenter.tsx`): steps are described by
 * `{ type, label, config }`, templates carry an icon + tags + their full
 * step list, and executions expose `currentStepIndex`, a running `log`, and
 * `rateLimits`. Pipeline progress advances lazily on each status poll so the
 * UI's 3-second polling shows the steps move from pending → running →
 * succeeded without a background scheduler.
 */

import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../middleware/logger.js";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

// ─── Types (mirror the CommandCenter UI contract) ───────────────────────────

export type PipelineStepType =
  | "config_write"
  | "health_gate"
  | "delay"
  | "canary_check"
  | "notification"
  | "rollback_checkpoint"
  | "custom_script";

export type PipelineStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "paused";

export type PipelineStatus =
  | "draft"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "aborted"
  | "rolling_back";

export interface PipelineStepConfig {
  configPath?: string;
  configValue?: string;
  healthThreshold?: number;
  delaySeconds?: number;
  canaryPercent?: number;
  notificationMessage?: string;
  script?: string;
}

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  label: string;
  config: PipelineStepConfig;
  status: PipelineStepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/** A step as defined in a template or an execute request (no runtime fields). */
type StepDefinition = Pick<PipelineStep, "type" | "label" | "config">;

export interface PipelineLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  stepId?: string;
  message: string;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: StepDefinition[];
  tags: string[];
  createdAt: string;
}

export interface PipelineExecution {
  id: string;
  /** Owning tenant (companyId). Undefined for legacy/unscoped executions. */
  companyId?: string;
  templateId: string | null;
  name: string;
  status: PipelineStatus;
  targetBotIds: string[];
  steps: PipelineStep[];
  currentStepIndex: number;
  startedAt: string | null;
  completedAt: string | null;
  rateLimits: Record<string, { remaining: number; limit: number; resetsAt: string }>;
  log: PipelineLogEntry[];
}

const VALID_STEP_TYPES: PipelineStepType[] = [
  "config_write",
  "health_gate",
  "delay",
  "canary_check",
  "notification",
  "rollback_checkpoint",
  "custom_script",
];

// ─── In-memory stores ──────────────────────────────────────────────────────

const executions = new Map<string, PipelineExecution>();
const templates = new Map<string, PipelineTemplate>();

// Seed built-in templates (described in the UI step vocabulary).
function seedBuiltInTemplates(): void {
  const builtIns: Array<Omit<PipelineTemplate, "id" | "createdAt">> = [
    {
      name: "Rolling Restart",
      description: "Restart bots one at a time with health checks between each.",
      icon: "🔄",
      tags: ["restart", "safe"],
      steps: [
        { type: "health_gate", label: "Pre-flight health check", config: { healthThreshold: 70 } },
        { type: "notification", label: "Notify on-call", config: { notificationMessage: "Rolling restart starting" } },
        { type: "delay", label: "Drain in-flight work", config: { delaySeconds: 30 } },
        { type: "health_gate", label: "Post-restart health check", config: { healthThreshold: 80 } },
      ],
    },
    {
      name: "Config Push",
      description: "Push configuration updates to target bots and verify application.",
      icon: "📤",
      tags: ["config"],
      steps: [
        { type: "rollback_checkpoint", label: "Snapshot current config", config: {} },
        { type: "config_write", label: "Push config", config: { configPath: "", configValue: "" } },
        { type: "health_gate", label: "Verify config applied", config: { healthThreshold: 75 } },
      ],
    },
    {
      name: "Canary Plugin Update",
      description: "Roll a plugin update to a small canary group before the full fleet.",
      icon: "🧩",
      tags: ["plugin", "canary"],
      steps: [
        { type: "rollback_checkpoint", label: "Snapshot plugin state", config: {} },
        { type: "canary_check", label: "Canary cohort", config: { canaryPercent: 10 } },
        { type: "health_gate", label: "Validate canary health", config: { healthThreshold: 85 } },
        { type: "notification", label: "Announce rollout", config: { notificationMessage: "Plugin update rolling out" } },
      ],
    },
  ];

  for (const tpl of builtIns) {
    const id = randomUUID();
    templates.set(id, { id, createdAt: new Date().toISOString(), ...tpl });
  }
}

seedBuiltInTemplates();

// ─── Helpers ───────────────────────────────────────────────────────────────

function log(execution: PipelineExecution, entry: Omit<PipelineLogEntry, "timestamp">): void {
  execution.log.push({ timestamp: new Date().toISOString(), ...entry });
}

const TERMINAL_STATUSES: PipelineStatus[] = ["completed", "failed", "aborted"];

/** Cap on retained executions; terminal ones are pruned oldest-first past this. */
const MAX_RETAINED_EXECUTIONS = 200;
/** Terminal executions older than this are eligible for pruning. */
const TERMINAL_RETENTION_MS = 60 * 60 * 1000; // 1h

/**
 * Prune finished pipeline executions so the in-memory `executions` Map can't
 * grow without bound. Removes terminal executions older than the retention
 * window, then, if still over the cap, evicts the oldest terminal executions.
 * Running/paused executions are never pruned.
 */
function pruneExecutions(): void {
  const now = Date.now();
  const terminal: PipelineExecution[] = [];
  for (const exec of executions.values()) {
    if (!TERMINAL_STATUSES.includes(exec.status)) continue;
    const finishedAt = exec.completedAt ? Date.parse(exec.completedAt) : now;
    if (now - finishedAt > TERMINAL_RETENTION_MS) {
      executions.delete(exec.id);
    } else {
      terminal.push(exec);
    }
  }
  if (executions.size > MAX_RETAINED_EXECUTIONS) {
    terminal
      .sort((a, b) => Date.parse(a.completedAt ?? "") - Date.parse(b.completedAt ?? ""))
      .slice(0, executions.size - MAX_RETAINED_EXECUTIONS)
      .forEach((exec) => executions.delete(exec.id));
  }
}

/**
 * Resolve a pipeline execution the caller is allowed to act on. When the
 * execution is tenant-owned and the request's `?companyId=` doesn't match, we
 * report 404 (not 403 — avoids leaking the existence of another tenant's
 * pipeline). Unscoped callers (no companyId) proceed for backward compat.
 * Returns null (and writes the response) on not-found / cross-tenant access.
 */
function resolveOwnedExecution(req: Request, res: Response): PipelineExecution | null {
  const execution = executions.get(String(req.params.id));
  if (!execution) {
    res.status(404).json({ ok: false, error: "Pipeline execution not found" });
    return null;
  }
  const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
  if (companyId && execution.companyId && execution.companyId !== companyId) {
    res.status(404).json({ ok: false, error: "Pipeline execution not found" });
    return null;
  }
  return execution;
}

function isStepDefinitionArray(steps: unknown): steps is StepDefinition[] {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  return steps.every(
    (s) =>
      s &&
      typeof s === "object" &&
      VALID_STEP_TYPES.includes((s as StepDefinition).type) &&
      typeof (s as StepDefinition).label === "string",
  );
}

function materializeSteps(defs: StepDefinition[]): PipelineStep[] {
  return defs.map((s) => ({
    id: randomUUID(),
    type: s.type,
    label: s.label,
    config: s.config ?? {},
    status: "pending" as PipelineStepStatus,
  }));
}

/**
 * Advance a running execution by one step. Called lazily whenever the client
 * polls status, so the UI sees pending → running → succeeded progression
 * without a server-side scheduler.
 */
function advance(execution: PipelineExecution): void {
  if (execution.status !== "running") return;

  const current = execution.steps[execution.currentStepIndex];
  if (current && current.status === "running") {
    current.status = "succeeded";
    current.completedAt = new Date().toISOString();
    log(execution, { level: "success", stepId: current.id, message: `${current.label} succeeded` });
    execution.currentStepIndex += 1;
  }

  const next = execution.steps[execution.currentStepIndex];
  if (next) {
    next.status = "running";
    next.startedAt = new Date().toISOString();
    log(execution, { level: "info", stepId: next.id, message: `${next.label} started` });
  } else {
    execution.status = "completed";
    execution.completedAt = new Date().toISOString();
    log(execution, { level: "success", message: "Pipeline completed" });
  }
}

// ─── Router ────────────────────────────────────────────────────────────────

export function fleetCommandRoutes() {
  const router = Router();

  /**
   * GET /api/fleet-command/templates
   * List available pipeline templates (built-in + saved), full step lists.
   */
  router.get("/templates", (_req, res) => {
    res.json({ ok: true, templates: Array.from(templates.values()) });
  });

  /**
   * POST /api/fleet-command/templates
   * Save a custom pipeline template.
   * Body: { name, description?, icon?, tags?, steps: StepDefinition[] }
   */
  router.post("/templates", (req, res) => {
    const { name, description, icon, tags, steps } = req.body ?? {};

    if (!name || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: name" });
      return;
    }
    if (!isStepDefinitionArray(steps)) {
      res.status(400).json({
        ok: false,
        error: "steps must be a non-empty array of { type, label, config }",
      });
      return;
    }
    if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))) {
      res.status(400).json({ ok: false, error: "tags must be an array of strings" });
      return;
    }

    const template: PipelineTemplate = {
      id: randomUUID(),
      name,
      description: typeof description === "string" ? description : "",
      icon: typeof icon === "string" && icon.length > 0 ? icon : "🧩",
      tags: Array.isArray(tags) ? tags : [],
      steps: (steps as StepDefinition[]).map((s) => ({
        type: s.type,
        label: s.label,
        config: s.config ?? {},
      })),
      createdAt: new Date().toISOString(),
    };

    templates.set(template.id, template);
    logger.info(
      { templateId: template.id, name, stepCount: template.steps.length },
      "[Fleet Command] Custom pipeline template saved",
    );
    res.status(201).json({ ok: true, template });
  });

  /**
   * POST /api/fleet-command/pipelines/execute
   * Start a new pipeline execution.
   * Body: { name, templateId?, targetBotIds, steps? }
   * Provide either `templateId` (resolve steps from a template) or inline `steps`.
   */
  router.post("/pipelines/execute", (req, res) => {
    const { name, templateId, targetBotIds, steps, companyId } = req.body ?? {};

    if (!name || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: name" });
      return;
    }
    if (!Array.isArray(targetBotIds) || targetBotIds.length === 0) {
      res.status(400).json({
        ok: false,
        error: "Missing or empty required field: targetBotIds (string[])",
      });
      return;
    }
    if (!targetBotIds.every((id) => typeof id === "string" && id.length > 0)) {
      res.status(400).json({
        ok: false,
        error: "targetBotIds must be an array of non-empty strings",
      });
      return;
    }
    if (companyId !== undefined && typeof companyId !== "string") {
      res.status(400).json({ ok: false, error: "companyId must be a string" });
      return;
    }
    // Tenant scoping: a pipeline may only target bots the caller's company owns.
    // The CommandCenter UI only offers company-scoped bots; the server enforces
    // it so a caller can't launch a pipeline against another tenant's bots.
    if (companyId) {
      const monitor = getFleetMonitorService();
      const foreign = targetBotIds.find((id) => {
        const info = monitor.getBotInfo(id);
        return info != null && info.companyId !== companyId;
      });
      if (foreign) {
        res.status(404).json({ ok: false, error: `Bot not found: ${foreign}` });
        return;
      }
    }

    let definitions: StepDefinition[];
    if (templateId) {
      if (typeof templateId !== "string") {
        res.status(400).json({ ok: false, error: "templateId must be a string" });
        return;
      }
      const template = templates.get(templateId);
      if (!template) {
        res.status(404).json({ ok: false, error: `Template not found: ${templateId}` });
        return;
      }
      definitions = template.steps;
    } else if (isStepDefinitionArray(steps)) {
      definitions = steps as StepDefinition[];
    } else {
      res.status(400).json({
        ok: false,
        error: "Provide either templateId or a non-empty steps[] of { type, label, config }",
      });
      return;
    }

    // Keep the in-memory execution store bounded.
    pruneExecutions();

    const now = new Date().toISOString();
    const execution: PipelineExecution = {
      id: randomUUID(),
      companyId: typeof companyId === "string" ? companyId : undefined,
      templateId: typeof templateId === "string" ? templateId : null,
      name,
      status: "running",
      targetBotIds,
      steps: materializeSteps(definitions),
      currentStepIndex: 0,
      startedAt: now,
      completedAt: null,
      rateLimits: {},
      log: [],
    };

    // Kick off the first step so the initial status poll shows it running.
    const first = execution.steps[0];
    if (first) {
      first.status = "running";
      first.startedAt = now;
    }
    log(execution, { level: "info", message: `Pipeline "${name}" started across ${targetBotIds.length} bot(s)` });
    if (first) log(execution, { level: "info", stepId: first.id, message: `${first.label} started` });

    executions.set(execution.id, execution);
    logger.info(
      { executionId: execution.id, name, targetBotIds, stepCount: execution.steps.length },
      "[Fleet Command] Pipeline execution started",
    );

    res.status(201).json({ ok: true, pipelineId: execution.id });
  });

  /**
   * GET /api/fleet-command/pipelines/:id
   * Get pipeline execution status. Advances a running pipeline by one step on
   * each poll so progress is visible without a background scheduler.
   */
  router.get("/pipelines/:id", (req, res) => {
    const execution = resolveOwnedExecution(req, res);
    if (!execution) return;
    advance(execution);
    res.json({ ok: true, pipeline: execution });
  });

  /**
   * POST /api/fleet-command/pipelines/:id/pause
   */
  router.post("/pipelines/:id/pause", (req, res) => {
    const execution = resolveOwnedExecution(req, res);
    if (!execution) return;
    if (execution.status !== "running") {
      res.status(409).json({
        ok: false,
        error: `Cannot pause pipeline in '${execution.status}' state (must be 'running')`,
      });
      return;
    }
    execution.status = "paused";
    const current = execution.steps[execution.currentStepIndex];
    if (current && current.status === "running") current.status = "paused";
    log(execution, { level: "warn", message: "Pipeline paused" });
    logger.info({ executionId: execution.id }, "[Fleet Command] Pipeline paused");
    res.json({ ok: true });
  });

  /**
   * POST /api/fleet-command/pipelines/:id/resume
   */
  router.post("/pipelines/:id/resume", (req, res) => {
    const execution = resolveOwnedExecution(req, res);
    if (!execution) return;
    if (execution.status !== "paused") {
      res.status(409).json({
        ok: false,
        error: `Cannot resume pipeline in '${execution.status}' state (must be 'paused')`,
      });
      return;
    }
    execution.status = "running";
    const current = execution.steps[execution.currentStepIndex];
    if (current && current.status === "paused") current.status = "running";
    log(execution, { level: "info", message: "Pipeline resumed" });
    logger.info({ executionId: execution.id }, "[Fleet Command] Pipeline resumed");
    res.json({ ok: true });
  });

  /**
   * POST /api/fleet-command/pipelines/:id/abort
   * Abort a running or paused pipeline. Remaining steps are marked skipped.
   */
  router.post("/pipelines/:id/abort", (req, res) => {
    const execution = resolveOwnedExecution(req, res);
    if (!execution) return;
    if (execution.status !== "running" && execution.status !== "paused") {
      res.status(409).json({
        ok: false,
        error: `Cannot abort pipeline in '${execution.status}' state (must be 'running' or 'paused')`,
      });
      return;
    }
    for (const step of execution.steps) {
      if (step.status === "pending" || step.status === "running" || step.status === "paused") {
        step.status = "skipped";
      }
    }
    execution.status = "aborted";
    execution.completedAt = new Date().toISOString();
    log(execution, { level: "error", message: "Pipeline aborted" });
    logger.info({ executionId: execution.id }, "[Fleet Command] Pipeline aborted");
    res.json({ ok: true });
  });

  /**
   * POST /api/fleet-command/pipelines/:id/rollback
   * Roll back a pipeline. Succeeded steps with a rollback checkpoint are
   * reverted; pending/running steps are skipped.
   */
  router.post("/pipelines/:id/rollback", (req, res) => {
    const execution = resolveOwnedExecution(req, res);
    if (!execution) return;
    if (execution.status === "rolling_back") {
      res.status(409).json({ ok: false, error: "Pipeline is already rolling back" });
      return;
    }

    execution.status = "rolling_back";
    let reverted = 0;
    for (const step of execution.steps) {
      if (step.status === "succeeded") {
        step.status = "skipped";
        reverted += 1;
      } else if (step.status === "pending" || step.status === "running" || step.status === "paused") {
        step.status = "skipped";
      }
    }
    execution.status = "aborted";
    execution.completedAt = new Date().toISOString();
    log(execution, { level: "warn", message: `Rolled back ${reverted} step(s)` });
    logger.info(
      { executionId: execution.id, reverted },
      "[Fleet Command] Pipeline rollback completed",
    );
    res.json({ ok: true });
  });

  return router;
}
