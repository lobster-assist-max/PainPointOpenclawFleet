/**
 * Fleet Command Pipeline Engine — Orchestrates multi-step command sequences
 * across fleet bots with safety gates, rollback, and progress tracking.
 *
 * Supports:
 * - Sequential step execution (command, gate, delay, verify, notify)
 * - Gate steps with health-check evaluation and configurable timeout
 * - Delay steps with timer progress events
 * - Automatic rollback on failure (reverse execution of completed steps)
 * - EventEmitter-based progress tracking for UI updates
 * - Rate-limit-aware execution via FleetRateLimiter
 * - Canary and Rolling execution modes
 * - 3 built-in pipeline templates (Safe Config Push, Fleet-Wide Cron Trigger,
 *   Emergency Rollback)
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { logger } from "../middleware/logger.js";
import { getFleetRateLimiter, type FleetRateLimiter } from "./fleet-rate-limiter.js";
import { getFleetMonitorService, type FleetMonitorService } from "./fleet-monitor.js";
import { publishLiveEvent } from "./live-events.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PipelineStepType = "command" | "gate" | "delay" | "verify" | "notify";

export type PipelineStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "rolling_back"
  | "rolled_back"
  | "cancelled";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type ExecutionMode = "canary" | "rolling" | "all_at_once";

export interface PipelineStepBase {
  id: string;
  type: PipelineStepType;
  name: string;
  /** Step-specific configuration */
  config: Record<string, unknown>;
  /** Optional rollback config — executed if pipeline rolls back past this step */
  rollback?: {
    type: "command";
    config: Record<string, unknown>;
  };
  /** Maximum time this step may run before being considered failed (ms) */
  timeoutMs: number;
}

export interface CommandStep extends PipelineStepBase {
  type: "command";
  config: {
    /** RPC method to invoke on the target bot */
    method: string;
    /** RPC params */
    params?: unknown;
    /** If true, failure of this step does not halt the pipeline */
    continueOnError?: boolean;
  };
}

export interface GateStep extends PipelineStepBase {
  type: "gate";
  config: {
    /** Metric to evaluate (maps to bot health snapshot fields) */
    metric: string;
    /** Comparison operator */
    operator: "lt" | "gt" | "eq" | "gte" | "lte";
    /** Value to compare against */
    threshold: number;
    /** How long the condition must hold before the gate passes (ms) */
    sustainedForMs: number;
    /** How often to poll the metric (ms). Default: 5000 */
    pollIntervalMs?: number;
  };
}

export interface DelayStep extends PipelineStepBase {
  type: "delay";
  config: {
    /** Delay duration in milliseconds */
    durationMs: number;
  };
}

export interface VerifyStep extends PipelineStepBase {
  type: "verify";
  config: {
    /** RPC method to call for verification */
    method: string;
    /** RPC params */
    params?: unknown;
    /** JSONPath-like key to extract from the result */
    resultKey?: string;
    /** Expected value at resultKey */
    expectedValue?: unknown;
  };
}

export interface NotifyStep extends PipelineStepBase {
  type: "notify";
  config: {
    /** Channel: "event" emits a fleet event, "webhook" posts to URL */
    channel: "event" | "webhook";
    /** Message template. Supports {{pipelineId}}, {{botId}}, {{stepName}} placeholders */
    message: string;
    /** Webhook URL (only for channel: "webhook") */
    webhookUrl?: string;
    /** Severity level for events */
    severity?: "info" | "warning" | "critical";
  };
}

export type PipelineStep = CommandStep | GateStep | DelayStep | VerifyStep | NotifyStep;

export interface StepResult {
  stepId: string;
  stepName: string;
  status: StepStatus;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  result?: unknown;
  error?: string;
}

export interface CommandPipeline {
  id: string;
  name: string;
  description: string;
  status: PipelineStatus;
  executionMode: ExecutionMode;
  /** Bot IDs targeted by this pipeline */
  targetBotIds: string[];
  /** For canary mode: subset of bots used as canaries */
  canaryBotIds: string[];
  /** For rolling mode: how many bots to process concurrently */
  rollingBatchSize: number;
  steps: PipelineStep[];
  stepResults: Map<string, StepResult>;
  /** Which bot is currently being processed (rolling/canary tracking) */
  currentBotId: string | null;
  /** Overall progress 0-100 */
  progress: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  createdBy: string;
  /** Template ID this pipeline was created from (if any) */
  templateId: string | null;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  defaultExecutionMode: ExecutionMode;
  steps: Omit<PipelineStep, "id">[];
}

export interface CreatePipelineParams {
  name: string;
  description?: string;
  executionMode?: ExecutionMode;
  targetBotIds: string[];
  canaryBotIds?: string[];
  rollingBatchSize?: number;
  steps?: PipelineStep[];
  templateId?: string;
  createdBy: string;
}

// ─── Pipeline Event Types ──────────────────────────────────────────────────

export interface PipelineEvent {
  pipelineId: string;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Built-in Templates ────────────────────────────────────────────────────

const BUILTIN_TEMPLATES: PipelineTemplate[] = [
  {
    id: "tpl-safe-config-push",
    name: "Safe Config Push",
    description:
      "Push a configuration change to fleet bots with pre-flight health check, " +
      "canary verification, and automatic rollback on failure.",
    defaultExecutionMode: "canary",
    steps: [
      {
        type: "gate",
        name: "Pre-flight health check",
        config: {
          metric: "healthScore",
          operator: "gte",
          threshold: 60,
          sustainedForMs: 0,
          pollIntervalMs: 5_000,
        },
        timeoutMs: 30_000,
      },
      {
        type: "command",
        name: "Push config patch",
        config: {
          method: "config.patch",
          params: {},
          continueOnError: false,
        },
        rollback: {
          type: "command",
          config: { method: "config.patch", params: {} },
        },
        timeoutMs: 30_000,
      },
      {
        type: "delay",
        name: "Stabilization wait",
        config: { durationMs: 15_000 },
        timeoutMs: 20_000,
      },
      {
        type: "verify",
        name: "Post-push health verification",
        config: {
          method: "health",
          resultKey: "ok",
          expectedValue: true,
        },
        timeoutMs: 15_000,
      },
      {
        type: "notify",
        name: "Completion notification",
        config: {
          channel: "event",
          message: "Config push completed for {{botId}} in pipeline {{pipelineId}}",
          severity: "info",
        },
        timeoutMs: 5_000,
      },
    ],
  },
  {
    id: "tpl-fleet-cron-trigger",
    name: "Fleet-Wide Cron Trigger",
    description:
      "Trigger a cron job across all fleet bots in a rolling fashion " +
      "with rate-limit awareness and post-execution verification.",
    defaultExecutionMode: "rolling",
    steps: [
      {
        type: "gate",
        name: "Rate limit check",
        config: {
          metric: "healthScore",
          operator: "gte",
          threshold: 40,
          sustainedForMs: 0,
          pollIntervalMs: 3_000,
        },
        timeoutMs: 60_000,
      },
      {
        type: "command",
        name: "Trigger cron job",
        config: {
          method: "cron.trigger",
          params: {},
          continueOnError: false,
        },
        timeoutMs: 60_000,
      },
      {
        type: "delay",
        name: "Execution cooldown",
        config: { durationMs: 5_000 },
        timeoutMs: 10_000,
      },
      {
        type: "verify",
        name: "Verify cron execution",
        config: {
          method: "cron.list",
          resultKey: "lastRunStatus",
          expectedValue: "success",
        },
        timeoutMs: 30_000,
      },
      {
        type: "notify",
        name: "Cron trigger result",
        config: {
          channel: "event",
          message: "Cron trigger completed for {{botId}} — pipeline {{pipelineId}}",
          severity: "info",
        },
        timeoutMs: 5_000,
      },
    ],
  },
  {
    id: "tpl-emergency-rollback",
    name: "Emergency Rollback",
    description:
      "Immediately roll back a previous config change across all bots. " +
      "Skips gates and delays for maximum speed.",
    defaultExecutionMode: "all_at_once",
    steps: [
      {
        type: "notify",
        name: "Rollback initiated",
        config: {
          channel: "event",
          message: "EMERGENCY ROLLBACK initiated — pipeline {{pipelineId}}",
          severity: "critical",
        },
        timeoutMs: 5_000,
      },
      {
        type: "command",
        name: "Apply rollback config",
        config: {
          method: "config.patch",
          params: {},
          continueOnError: true,
        },
        timeoutMs: 30_000,
      },
      {
        type: "verify",
        name: "Verify rollback applied",
        config: {
          method: "health",
          resultKey: "ok",
          expectedValue: true,
        },
        timeoutMs: 15_000,
      },
      {
        type: "notify",
        name: "Rollback result",
        config: {
          channel: "event",
          message: "Emergency rollback finished for {{botId}} — pipeline {{pipelineId}}",
          severity: "critical",
        },
        timeoutMs: 5_000,
      },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function evaluateOperator(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "lt": return value < threshold;
    case "gt": return value > threshold;
    case "eq": return value === threshold;
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
    default: return false;
  }
}

function resolveTemplatePlaceholders(
  message: string,
  vars: Record<string, string>,
): string {
  let result = message;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

function deepGet(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function assignStepIds(steps: Omit<PipelineStep, "id">[]): PipelineStep[] {
  return steps.map((step) => ({
    ...step,
    id: randomUUID(),
  })) as PipelineStep[];
}

// ─── Pipeline Executor ─────────────────────────────────────────────────────

export class PipelineExecutor extends EventEmitter {
  private pipelines = new Map<string, CommandPipeline>();
  private activeCancellers = new Map<string, AbortController>();
  private templates = new Map<string, PipelineTemplate>();
  private disposed = false;
  private monitor: FleetMonitorService;
  private rateLimiter: FleetRateLimiter;

  constructor() {
    super();
    this.setMaxListeners(100);
    this.monitor = getFleetMonitorService();
    this.rateLimiter = getFleetRateLimiter();

    // Register built-in templates
    for (const tpl of BUILTIN_TEMPLATES) {
      this.templates.set(tpl.id, tpl);
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /** Start the executor (registers event listeners, etc.) */
  start(): void {
    if (this.disposed) throw new Error("PipelineExecutor has been disposed");
    logger.info("[Fleet Pipeline] Executor started");
  }

  /** Stop the executor — cancel all running pipelines and clean up */
  stop(): void {
    // Cancel all running pipelines
    for (const [pipelineId, controller] of this.activeCancellers) {
      controller.abort();
      const pipeline = this.pipelines.get(pipelineId);
      if (pipeline && pipeline.status === "running") {
        pipeline.status = "cancelled";
        pipeline.completedAt = Date.now();
        this.emitPipelineEvent(pipelineId, "pipeline.cancelled", {});
      }
    }
    this.activeCancellers.clear();
    logger.info("[Fleet Pipeline] Executor stopped");
  }

  /** Dispose all resources */
  dispose(): void {
    this.stop();
    this.pipelines.clear();
    this.templates.clear();
    this.removeAllListeners();
    this.disposed = true;
  }

  // ─── Template Management ────────────────────────────────────────────────

  /** Get all available templates */
  getTemplates(): PipelineTemplate[] {
    return Array.from(this.templates.values());
  }

  /** Get a template by ID */
  getTemplate(templateId: string): PipelineTemplate | null {
    return this.templates.get(templateId) ?? null;
  }

  /** Register a custom template */
  addTemplate(template: Omit<PipelineTemplate, "id">): PipelineTemplate {
    const newTemplate: PipelineTemplate = { ...template, id: `tpl-${randomUUID()}` };
    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }

  /** Remove a custom template (built-in templates cannot be removed) */
  removeTemplate(templateId: string): boolean {
    if (BUILTIN_TEMPLATES.some((t) => t.id === templateId)) return false;
    return this.templates.delete(templateId);
  }

  // ─── Pipeline CRUD ──────────────────────────────────────────────────────

  /** Create a new pipeline (does not start execution) */
  createPipeline(params: CreatePipelineParams): CommandPipeline {
    if (this.disposed) throw new Error("PipelineExecutor has been disposed");

    let steps: PipelineStep[];
    let templateId: string | null = null;
    let executionMode: ExecutionMode = params.executionMode ?? "rolling";

    if (params.templateId) {
      const template = this.templates.get(params.templateId);
      if (!template) throw new Error(`Template not found: ${params.templateId}`);
      steps = assignStepIds(template.steps);
      templateId = template.id;
      executionMode = params.executionMode ?? template.defaultExecutionMode;
    } else if (params.steps && params.steps.length > 0) {
      steps = params.steps;
    } else {
      throw new Error("Either templateId or steps must be provided");
    }

    const pipeline: CommandPipeline = {
      id: randomUUID(),
      name: params.name,
      description: params.description ?? "",
      status: "pending",
      executionMode,
      targetBotIds: [...params.targetBotIds],
      canaryBotIds: params.canaryBotIds ? [...params.canaryBotIds] : [],
      rollingBatchSize: params.rollingBatchSize ?? 1,
      steps,
      stepResults: new Map(),
      currentBotId: null,
      progress: 0,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      createdBy: params.createdBy,
      templateId,
    };

    this.pipelines.set(pipeline.id, pipeline);

    this.emitPipelineEvent(pipeline.id, "pipeline.created", {
      name: pipeline.name,
      targetBotIds: pipeline.targetBotIds,
      executionMode: pipeline.executionMode,
      stepCount: pipeline.steps.length,
    });

    return pipeline;
  }

  /** Get a pipeline by ID */
  getPipeline(pipelineId: string): CommandPipeline | null {
    return this.pipelines.get(pipelineId) ?? null;
  }

  /** Get all pipelines, sorted by creation time descending */
  getAllPipelines(limit = 50): CommandPipeline[] {
    return Array.from(this.pipelines.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /** Get pipelines by status */
  getPipelinesByStatus(status: PipelineStatus): CommandPipeline[] {
    return Array.from(this.pipelines.values()).filter((p) => p.status === status);
  }

  /** Cancel a running pipeline */
  cancelPipeline(pipelineId: string): boolean {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return false;
    if (pipeline.status !== "running" && pipeline.status !== "paused") return false;

    const controller = this.activeCancellers.get(pipelineId);
    if (controller) controller.abort();

    pipeline.status = "cancelled";
    pipeline.completedAt = Date.now();
    this.emitPipelineEvent(pipelineId, "pipeline.cancelled", {});
    return true;
  }

  /** Prune completed/failed/cancelled pipelines older than maxAgeMs (default: 24h) */
  pruneOld(maxAgeMs = 86_400_000): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [id, pipeline] of this.pipelines) {
      if (
        pipeline.completedAt &&
        pipeline.completedAt < cutoff &&
        pipeline.status !== "running"
      ) {
        this.pipelines.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  // ─── Execution ──────────────────────────────────────────────────────────

  /** Start executing a pipeline */
  async executePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);
    if (pipeline.status !== "pending") {
      throw new Error(`Pipeline ${pipelineId} is in status '${pipeline.status}', expected 'pending'`);
    }

    const controller = new AbortController();
    this.activeCancellers.set(pipelineId, controller);

    pipeline.status = "running";
    pipeline.startedAt = Date.now();
    this.emitPipelineEvent(pipelineId, "pipeline.started", {
      executionMode: pipeline.executionMode,
    });

    try {
      switch (pipeline.executionMode) {
        case "canary":
          await this.executeCanaryMode(pipeline, controller.signal);
          break;
        case "rolling":
          await this.executeRollingMode(pipeline, controller.signal);
          break;
        case "all_at_once":
          await this.executeAllAtOnceMode(pipeline, controller.signal);
          break;
      }

      if (pipeline.status === "running") {
        pipeline.status = "completed";
        pipeline.completedAt = Date.now();
        pipeline.progress = 100;
        this.emitPipelineEvent(pipelineId, "pipeline.completed", {
          durationMs: pipeline.completedAt - (pipeline.startedAt ?? pipeline.completedAt),
        });
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // Already marked as cancelled
        return;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err, pipelineId }, "[Fleet Pipeline] Pipeline execution failed");

      pipeline.status = "failed";
      pipeline.completedAt = Date.now();
      this.emitPipelineEvent(pipelineId, "pipeline.failed", { error: errorMessage });

      // Attempt rollback
      await this.executeRollback(pipeline);
    } finally {
      this.activeCancellers.delete(pipelineId);
    }
  }

  // ─── Execution Modes ────────────────────────────────────────────────────

  /**
   * Canary mode: execute steps on canary bots first, then on the remaining fleet.
   * If any canary bot fails, the pipeline is aborted before touching the rest.
   */
  private async executeCanaryMode(
    pipeline: CommandPipeline,
    signal: AbortSignal,
  ): Promise<void> {
    const canaryBots = pipeline.canaryBotIds.length > 0
      ? pipeline.canaryBotIds
      : [pipeline.targetBotIds[0]]; // Default: first bot is canary

    const remainingBots = pipeline.targetBotIds.filter(
      (id) => !canaryBots.includes(id),
    );

    const totalBots = pipeline.targetBotIds.length;
    let processedBots = 0;

    // Phase 1: Canary bots
    this.emitPipelineEvent(pipeline.id, "pipeline.phase", {
      phase: "canary",
      botIds: canaryBots,
    });

    for (const botId of canaryBots) {
      this.throwIfAborted(signal);
      await this.executeStepsForBot(pipeline, botId, signal);
      processedBots++;
      pipeline.progress = Math.round((processedBots / totalBots) * 100);
      this.emitPipelineEvent(pipeline.id, "pipeline.progress", {
        progress: pipeline.progress,
        botId,
        phase: "canary",
      });
    }

    // Phase 2: Remaining fleet (rolling with batch size)
    if (remainingBots.length > 0) {
      this.emitPipelineEvent(pipeline.id, "pipeline.phase", {
        phase: "fleet",
        botIds: remainingBots,
      });

      for (let i = 0; i < remainingBots.length; i += pipeline.rollingBatchSize) {
        this.throwIfAborted(signal);
        const batch = remainingBots.slice(i, i + pipeline.rollingBatchSize);

        await Promise.all(
          batch.map((botId) => this.executeStepsForBot(pipeline, botId, signal)),
        );

        processedBots += batch.length;
        pipeline.progress = Math.round((processedBots / totalBots) * 100);
        this.emitPipelineEvent(pipeline.id, "pipeline.progress", {
          progress: pipeline.progress,
          phase: "fleet",
          batchIndex: Math.floor(i / pipeline.rollingBatchSize),
        });
      }
    }
  }

  /**
   * Rolling mode: process bots in batches of rollingBatchSize.
   */
  private async executeRollingMode(
    pipeline: CommandPipeline,
    signal: AbortSignal,
  ): Promise<void> {
    const totalBots = pipeline.targetBotIds.length;
    let processedBots = 0;

    for (let i = 0; i < totalBots; i += pipeline.rollingBatchSize) {
      this.throwIfAborted(signal);
      const batch = pipeline.targetBotIds.slice(i, i + pipeline.rollingBatchSize);

      this.emitPipelineEvent(pipeline.id, "pipeline.batch", {
        batchIndex: Math.floor(i / pipeline.rollingBatchSize),
        botIds: batch,
      });

      await Promise.all(
        batch.map((botId) => this.executeStepsForBot(pipeline, botId, signal)),
      );

      processedBots += batch.length;
      pipeline.progress = Math.round((processedBots / totalBots) * 100);
      this.emitPipelineEvent(pipeline.id, "pipeline.progress", {
        progress: pipeline.progress,
      });
    }
  }

  /**
   * All-at-once mode: execute steps on all bots simultaneously.
   */
  private async executeAllAtOnceMode(
    pipeline: CommandPipeline,
    signal: AbortSignal,
  ): Promise<void> {
    this.throwIfAborted(signal);

    await Promise.all(
      pipeline.targetBotIds.map((botId) =>
        this.executeStepsForBot(pipeline, botId, signal),
      ),
    );

    pipeline.progress = 100;
  }

  // ─── Step Execution ─────────────────────────────────────────────────────

  /**
   * Execute all pipeline steps for a single bot, sequentially.
   */
  private async executeStepsForBot(
    pipeline: CommandPipeline,
    botId: string,
    signal: AbortSignal,
  ): Promise<void> {
    pipeline.currentBotId = botId;

    for (const step of pipeline.steps) {
      this.throwIfAborted(signal);

      const resultKey = `${botId}:${step.id}`;
      const stepResult: StepResult = {
        stepId: step.id,
        stepName: step.name,
        status: "running",
        startedAt: Date.now(),
        completedAt: null,
        durationMs: null,
      };
      pipeline.stepResults.set(resultKey, stepResult);

      this.emitPipelineEvent(pipeline.id, "step.started", {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        botId,
      });

      try {
        const result = await this.executeStep(pipeline, step, botId, signal);
        stepResult.status = "completed";
        stepResult.result = result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        stepResult.status = "failed";
        stepResult.error = errorMessage;

        this.emitPipelineEvent(pipeline.id, "step.failed", {
          stepId: step.id,
          stepName: step.name,
          botId,
          error: errorMessage,
        });

        // Check if this step allows continuing on error
        const continueOnError =
          step.type === "command" && step.config.continueOnError === true;

        if (!continueOnError) {
          throw new Error(
            `Step "${step.name}" failed for bot ${botId}: ${errorMessage}`,
          );
        }

        logger.warn(
          { stepId: step.id, botId, error: errorMessage },
          "[Fleet Pipeline] Step failed but continueOnError is set — continuing",
        );
      } finally {
        stepResult.completedAt = Date.now();
        stepResult.durationMs = stepResult.completedAt - (stepResult.startedAt ?? stepResult.completedAt);

        if (stepResult.status === "completed") {
          this.emitPipelineEvent(pipeline.id, "step.completed", {
            stepId: step.id,
            stepName: step.name,
            botId,
            durationMs: stepResult.durationMs,
          });
        }
      }
    }
  }

  /**
   * Execute a single step, dispatching by type.
   */
  private async executeStep(
    pipeline: CommandPipeline,
    step: PipelineStep,
    botId: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const timeoutPromise = this.createStepTimeout(step.timeoutMs, step.name);

    const executionPromise = (async () => {
      switch (step.type) {
        case "command":
          return this.executeCommandStep(step, botId, signal);
        case "gate":
          return this.executeGateStep(pipeline, step, botId, signal);
        case "delay":
          return this.executeDelayStep(pipeline, step, botId, signal);
        case "verify":
          return this.executeVerifyStep(step, botId);
        case "notify":
          return this.executeNotifyStep(pipeline, step, botId);
        default:
          throw new Error(`Unknown step type: ${(step as PipelineStepBase).type}`);
      }
    })();

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Command step: invoke an RPC method on the target bot via FleetMonitorService,
   * respecting rate limits.
   */
  private async executeCommandStep(
    step: CommandStep,
    botId: string,
    _signal: AbortSignal,
  ): Promise<unknown> {
    const { method, params } = step.config;

    // Check bot connection info to get gateway URL for rate limiting
    const botInfo = this.monitor.getBotInfo(botId);
    if (botInfo) {
      const tracker = this.rateLimiter.getTracker(botInfo.gatewayUrl);

      // Wait for rate limit if this is a config write
      if (method.startsWith("config.")) {
        while (!tracker.canWriteConfig()) {
          const waitMs = tracker.nextConfigWriteAvailableInMs();
          logger.debug(
            { botId, method, waitMs },
            "[Fleet Pipeline] Waiting for rate limit window",
          );
          await delay(Math.min(waitMs + 500, 65_000));
        }
        tracker.recordConfigWrite();
      }
    }

    return this.monitor.rpcForBot(botId, method, params);
  }

  /**
   * Gate step: repeatedly poll a health metric until it meets the condition
   * for the sustained duration, or timeout.
   */
  private async executeGateStep(
    pipeline: CommandPipeline,
    step: GateStep,
    botId: string,
    signal: AbortSignal,
  ): Promise<{ passed: boolean; finalValue: number }> {
    const { metric, operator, threshold, sustainedForMs, pollIntervalMs = 5_000 } = step.config;
    let sustainedSince: number | null = null;

    const deadline = Date.now() + step.timeoutMs;

    while (Date.now() < deadline) {
      this.throwIfAborted(signal);

      // Poll health data from the bot
      const healthSnapshot = await this.monitor.getBotHealth(botId);
      const metricValue = healthSnapshot
        ? this.extractMetricFromHealth(healthSnapshot as unknown as Record<string, unknown>, metric)
        : 0;

      const conditionMet = evaluateOperator(metricValue, operator, threshold);

      if (conditionMet) {
        if (sustainedSince === null) sustainedSince = Date.now();
        const elapsed = Date.now() - sustainedSince;

        this.emitPipelineEvent(pipeline.id, "gate.progress", {
          stepId: step.id,
          botId,
          metricValue,
          threshold,
          sustainedMs: elapsed,
          requiredMs: sustainedForMs,
        });

        if (elapsed >= sustainedForMs) {
          return { passed: true, finalValue: metricValue };
        }
      } else {
        // Reset sustained tracking
        sustainedSince = null;
        this.emitPipelineEvent(pipeline.id, "gate.reset", {
          stepId: step.id,
          botId,
          metricValue,
          threshold,
        });
      }

      await delay(pollIntervalMs);
    }

    throw new Error(
      `Gate "${step.name}" timed out for bot ${botId}: ` +
      `metric '${metric}' did not meet condition (${operator} ${threshold}) ` +
      `for ${sustainedForMs}ms within the ${step.timeoutMs}ms timeout`,
    );
  }

  /**
   * Delay step: wait for the specified duration, emitting progress events.
   */
  private async executeDelayStep(
    pipeline: CommandPipeline,
    step: DelayStep,
    botId: string,
    signal: AbortSignal,
  ): Promise<{ waited: number }> {
    const { durationMs } = step.config;
    const startedAt = Date.now();
    const progressIntervalMs = Math.min(1_000, durationMs / 10);
    let elapsed = 0;

    while (elapsed < durationMs) {
      this.throwIfAborted(signal);

      const remaining = durationMs - elapsed;
      const sleepMs = Math.min(progressIntervalMs, remaining);
      await delay(sleepMs);

      elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));

      this.emitPipelineEvent(pipeline.id, "delay.progress", {
        stepId: step.id,
        botId,
        elapsedMs: elapsed,
        totalMs: durationMs,
        percent: pct,
      });
    }

    return { waited: elapsed };
  }

  /**
   * Verify step: call an RPC method and check the result against an expected value.
   */
  private async executeVerifyStep(
    step: VerifyStep,
    botId: string,
  ): Promise<{ verified: boolean; actual: unknown }> {
    const { method, params, resultKey, expectedValue } = step.config;

    const result = await this.monitor.rpcForBot(botId, method, params);

    if (resultKey !== undefined && expectedValue !== undefined) {
      const actual = deepGet(result, resultKey);
      const verified = actual === expectedValue;

      if (!verified) {
        throw new Error(
          `Verification failed for bot ${botId}: ` +
          `expected ${resultKey}=${JSON.stringify(expectedValue)}, ` +
          `got ${JSON.stringify(actual)}`,
        );
      }

      return { verified: true, actual };
    }

    // If no expected value is specified, just ensure the RPC succeeded
    return { verified: true, actual: result };
  }

  /**
   * Notify step: emit a fleet event or fire a webhook.
   */
  private async executeNotifyStep(
    pipeline: CommandPipeline,
    step: NotifyStep,
    botId: string,
  ): Promise<{ notified: boolean }> {
    const { channel, message, webhookUrl, severity = "info" } = step.config;

    const resolvedMessage = resolveTemplatePlaceholders(message, {
      pipelineId: pipeline.id,
      botId,
      stepName: step.name,
      pipelineName: pipeline.name,
    });

    if (channel === "event") {
      const botInfo = this.monitor.getBotInfo(botId);

      publishLiveEvent({
        companyId: botInfo?.companyId ?? "unknown",
        type: "fleet.pipeline.notify" as any,
        payload: {
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          botId,
          message: resolvedMessage,
          severity,
        },
      });

      this.emit("pipeline.notification", {
        pipelineId: pipeline.id,
        botId,
        message: resolvedMessage,
        severity,
      });
    } else if (channel === "webhook" && webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            botId,
            message: resolvedMessage,
            severity,
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        logger.warn(
          { err, webhookUrl, pipelineId: pipeline.id },
          "[Fleet Pipeline] Webhook notification failed",
        );
        // Notify steps should not block the pipeline
      }
    }

    return { notified: true };
  }

  // ─── Rollback ───────────────────────────────────────────────────────────

  /**
   * Execute rollback: walk completed steps in reverse order and execute
   * their rollback config (if defined).
   */
  private async executeRollback(pipeline: CommandPipeline): Promise<void> {
    const stepsWithRollback = pipeline.steps
      .filter((step) => step.rollback != null)
      .reverse();

    if (stepsWithRollback.length === 0) {
      logger.info(
        { pipelineId: pipeline.id },
        "[Fleet Pipeline] No rollback steps defined — skipping rollback",
      );
      return;
    }

    pipeline.status = "rolling_back";
    this.emitPipelineEvent(pipeline.id, "pipeline.rollback.started", {
      stepsToRollback: stepsWithRollback.length,
    });

    let rollbackSucceeded = true;

    for (const step of stepsWithRollback) {
      if (!step.rollback) continue;

      // Rollback only bots that had their step completed or failed
      const affectedBots = pipeline.targetBotIds.filter((botId) => {
        const resultKey = `${botId}:${step.id}`;
        const result = pipeline.stepResults.get(resultKey);
        return result && (result.status === "completed" || result.status === "failed");
      });

      for (const botId of affectedBots) {
        try {
          this.emitPipelineEvent(pipeline.id, "rollback.step.started", {
            stepId: step.id,
            stepName: step.name,
            botId,
          });

          const { config } = step.rollback;
          const method = config.method as string;
          const params = config.params;

          await this.monitor.rpcForBot(botId, method, params);

          this.emitPipelineEvent(pipeline.id, "rollback.step.completed", {
            stepId: step.id,
            stepName: step.name,
            botId,
          });
        } catch (err) {
          rollbackSucceeded = false;
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.error(
            { err, stepId: step.id, botId, pipelineId: pipeline.id },
            "[Fleet Pipeline] Rollback step failed",
          );
          this.emitPipelineEvent(pipeline.id, "rollback.step.failed", {
            stepId: step.id,
            stepName: step.name,
            botId,
            error: errorMessage,
          });
        }
      }
    }

    pipeline.status = rollbackSucceeded ? "rolled_back" : "failed";
    pipeline.completedAt = Date.now();
    this.emitPipelineEvent(pipeline.id, "pipeline.rollback.completed", {
      success: rollbackSucceeded,
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error("Pipeline execution was cancelled");
    }
  }

  private createStepTimeout(timeoutMs: number, stepName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Step "${stepName}" timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
  }

  /**
   * Extract a numeric metric value from a bot health snapshot.
   * Maps metric names to the snapshot structure returned by getBotHealth().
   */
  private extractMetricFromHealth(
    snapshot: Record<string, unknown>,
    metric: string,
  ): number {
    // Direct property match
    if (typeof snapshot[metric] === "number") {
      return snapshot[metric] as number;
    }

    // Common mappings
    switch (metric) {
      case "healthScore": {
        if (snapshot.ok === true) return 100;
        if (snapshot.ok === false) return 0;
        return 50;
      }
      case "ok":
        return snapshot.ok === true ? 1 : 0;
      default:
        return 0;
    }
  }

  private emitPipelineEvent(
    pipelineId: string,
    type: string,
    data: Record<string, unknown>,
  ): void {
    const event: PipelineEvent = {
      pipelineId,
      type,
      timestamp: Date.now(),
      data,
    };

    this.emit(type, event);
    this.emit("pipeline.event", event);

    // Also publish to the LiveEvent system for UI consumption
    const pipeline = this.pipelines.get(pipelineId);
    if (pipeline) {
      // Best-effort: get company ID from first target bot
      const firstBotInfo = pipeline.targetBotIds.length > 0
        ? this.monitor.getBotInfo(pipeline.targetBotIds[0])
        : null;

      publishLiveEvent({
        companyId: firstBotInfo?.companyId ?? "unknown",
        type: "fleet.pipeline.event" as any,
        payload: event as unknown as Record<string, unknown>,
      });
    }
  }

  // ─── Status Summaries ───────────────────────────────────────────────────

  /** Get a summary of pipeline execution suitable for API responses */
  getPipelineSummary(pipelineId: string): Record<string, unknown> | null {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return null;

    const stepResults: Record<string, unknown>[] = [];
    for (const [key, result] of pipeline.stepResults) {
      stepResults.push({
        key,
        ...result,
      });
    }

    return {
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      status: pipeline.status,
      executionMode: pipeline.executionMode,
      targetBotIds: pipeline.targetBotIds,
      canaryBotIds: pipeline.canaryBotIds,
      currentBotId: pipeline.currentBotId,
      progress: pipeline.progress,
      stepCount: pipeline.steps.length,
      stepResults,
      createdAt: pipeline.createdAt,
      startedAt: pipeline.startedAt,
      completedAt: pipeline.completedAt,
      createdBy: pipeline.createdBy,
      templateId: pipeline.templateId,
      durationMs: pipeline.completedAt && pipeline.startedAt
        ? pipeline.completedAt - pipeline.startedAt
        : null,
    };
  }

  /** Get counts of pipelines by status (for dashboard) */
  getPipelineCounts(): Record<PipelineStatus, number> {
    const counts: Record<PipelineStatus, number> = {
      pending: 0,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      rolling_back: 0,
      rolled_back: 0,
      cancelled: 0,
    };

    for (const pipeline of this.pipelines.values()) {
      counts[pipeline.status]++;
    }

    return counts;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: PipelineExecutor | null = null;

export function getPipelineExecutor(): PipelineExecutor {
  if (!_instance) {
    _instance = new PipelineExecutor();
  }
  return _instance;
}

export function disposePipelineExecutor(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}
