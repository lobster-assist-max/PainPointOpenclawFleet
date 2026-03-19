/**
 * Fleet Ops Playbook Engine
 *
 * Codified operational procedures (SOPs) that can be:
 * - Triggered manually or automatically by incidents/alerts
 * - Executed step-by-step with human checkpoints
 * - Fully automated for trusted bots (Trust L3+)
 * - Audited and versioned for compliance
 *
 * Playbooks bridge Self-Healing (automatic black-box) and
 * Command Center (manual ad-hoc) into structured, repeatable runbooks.
 *
 * @see Planning #20
 */

import { EventEmitter } from "node:events";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PlaybookStepType = "check" | "action" | "decision" | "notification" | "wait" | "approval";

export type PlaybookTriggerType =
  | "incident_severity"
  | "alert_rule"
  | "metric_threshold"
  | "manual"
  | "schedule";

export type ExecutionStatus =
  | "running"
  | "paused"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "aborted";

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface PlaybookStep {
  id: string;
  order: number;
  name: string;
  description: string;
  type: PlaybookStepType;

  check?: {
    method: "rpc" | "http" | "metric_query" | "custom";
    target: string;
    expectedResult?: unknown;
    timeoutMs: number;
  };

  action?: {
    method: "rpc" | "deployment" | "command" | "rollback";
    target: string;
    params: Record<string, unknown>;
    rollbackStep?: string;
    requiresTrustLevel?: number;
  };

  decision?: {
    condition: string;
    ifTrue: string;
    ifFalse: string;
  };

  approval?: {
    requiredRole: string;
    timeoutMs: number;
    autoAction: "skip" | "abort" | "continue";
  };

  notification?: {
    channels: string[];
    template: string;
  };

  wait?: {
    durationMs: number;
    reason: string;
  };
}

export interface TriggerCondition {
  type: PlaybookTriggerType;
  config: Record<string, unknown>;
}

export interface OpsPlaybook {
  id: string;
  name: string;
  description: string;
  version: number;
  tags: string[];
  triggerConditions: TriggerCondition[];
  steps: PlaybookStep[];
  metadata: {
    createdBy: string;
    createdAt: Date;
    lastUsed?: Date;
    timesExecuted: number;
    avgDurationMinutes: number;
    successRate: number;
  };
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  notes?: string;
}

export interface PlaybookExecution {
  id: string;
  playbookId: string;
  playbookName: string;
  playbookVersion: number;
  triggeredBy: "auto" | "manual";
  triggeredByRef?: string;
  linkedIncidentId?: string;
  targetBotId?: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  stepResults: StepResult[];
  currentStepIndex: number;
}

// ─── Built-in Playbook Templates ────────────────────────────────────────────

function createBuiltinPlaybooks(): OpsPlaybook[] {
  return [
    {
      id: "pb-fleet-total-outage",
      name: "fleet-total-outage",
      description: "All bots offline — systematic diagnosis and recovery",
      version: 1,
      tags: ["P1", "outage", "critical"],
      triggerConditions: [
        { type: "incident_severity", config: { severity: "P1", category: "availability" } },
      ],
      steps: [
        {
          id: "s1", order: 1, name: "Ping Gateway Host", type: "check",
          description: "Verify the gateway host machine is reachable",
          check: { method: "http", target: "{{gatewayUrl}}/health", timeoutMs: 5000 },
        },
        {
          id: "s2", order: 2, name: "Check Gateway Process", type: "check",
          description: "Verify the OpenClaw gateway process is alive",
          check: { method: "rpc", target: "health", timeoutMs: 10000 },
        },
        {
          id: "s3", order: 3, name: "Diagnose", type: "decision",
          description: "Branch based on gateway reachability",
          decision: { condition: "s1.success && !s2.success", ifTrue: "s4a", ifFalse: "s4b" },
        },
        {
          id: "s4a", order: 4, name: "Restart Gateway", type: "action",
          description: "Gateway host is up but process is dead — restart",
          action: { method: "command", target: "gateway", params: { command: "restart" }, requiresTrustLevel: 2 },
        },
        {
          id: "s4b", order: 4, name: "Check System Resources", type: "check",
          description: "Gateway is responding — check CPU/memory/disk",
          check: { method: "rpc", target: "system-presence", timeoutMs: 10000 },
        },
        {
          id: "s5", order: 5, name: "Reconnect Bots", type: "action",
          description: "Attempt to reconnect all bots in the fleet",
          action: { method: "command", target: "fleet", params: { command: "reconnect_all" } },
        },
        {
          id: "s6", order: 6, name: "Verify Recovery", type: "check",
          description: "Confirm all bots are back online and healthy",
          check: { method: "http", target: "/api/fleet-monitor/status", timeoutMs: 30000 },
        },
        {
          id: "s7", order: 7, name: "Notify Team", type: "notification",
          description: "Send recovery notification to team",
          notification: { channels: ["slack", "line"], template: "Fleet recovered from total outage. Duration: {{duration}}" },
        },
      ],
      metadata: {
        createdBy: "system",
        createdAt: new Date(),
        timesExecuted: 0,
        avgDurationMinutes: 12,
        successRate: 0,
      },
    },
    {
      id: "pb-bot-unresponsive",
      name: "bot-unresponsive",
      description: "Single bot unresponsive — diagnose and recover",
      version: 1,
      tags: ["P2", "bot", "availability"],
      triggerConditions: [
        { type: "alert_rule", config: { rule: "bot_offline" } },
        { type: "incident_severity", config: { severity: "P2", category: "availability" } },
      ],
      steps: [
        {
          id: "s1", order: 1, name: "Ping Gateway", type: "check",
          description: "Check if the bot's gateway is reachable",
          check: { method: "http", target: "{{gatewayUrl}}/health", timeoutMs: 5000 },
        },
        {
          id: "s2", order: 2, name: "Health Check", type: "check",
          description: "Get detailed health status from gateway",
          check: { method: "rpc", target: "health", timeoutMs: 10000 },
        },
        {
          id: "s3", order: 3, name: "CPU Check", type: "decision",
          description: "Branch based on CPU usage",
          decision: { condition: "s2.result.cpu > 90", ifTrue: "s4a", ifFalse: "s4b" },
        },
        {
          id: "s4a", order: 4, name: "Restart Bot Process", type: "action",
          description: "CPU overloaded — restart the bot",
          action: { method: "rpc", target: "wake", params: {}, requiresTrustLevel: 1 },
        },
        {
          id: "s4b", order: 4, name: "Check Network", type: "check",
          description: "CPU is fine — check network connectivity",
          check: { method: "http", target: "{{gatewayUrl}}", timeoutMs: 5000 },
        },
        {
          id: "s5", order: 5, name: "Verify Recovery", type: "check",
          description: "Confirm the bot is back online",
          check: { method: "rpc", target: "health", timeoutMs: 15000 },
        },
        {
          id: "s6", order: 6, name: "Update Incident", type: "notification",
          description: "Update the linked incident with resolution",
          notification: { channels: ["incident"], template: "Bot {{botName}} recovered. Root cause: {{rootCause}}" },
        },
      ],
      metadata: {
        createdBy: "system",
        createdAt: new Date(),
        timesExecuted: 0,
        avgDurationMinutes: 4,
        successRate: 0,
      },
    },
    {
      id: "pb-cqi-degradation",
      name: "cqi-degradation",
      description: "Bot CQI declining — investigate and remediate",
      version: 1,
      tags: ["P3", "quality", "performance"],
      triggerConditions: [
        { type: "metric_threshold", config: { metric: "cqi_delta_7d", threshold: -10 } },
        { type: "manual", config: {} },
      ],
      steps: [
        {
          id: "s1", order: 1, name: "Check Recent Prompt Changes", type: "check",
          description: "Look for recent SOUL.md / IDENTITY.md changes",
          check: { method: "http", target: "/api/fleet-monitor/prompts/versions/{{botId}}", timeoutMs: 5000 },
        },
        {
          id: "s2", order: 2, name: "Check Config Changes", type: "check",
          description: "Look for recent config drift",
          check: { method: "http", target: "/api/fleet-monitor/config-drift/{{botId}}", timeoutMs: 5000 },
        },
        {
          id: "s3", order: 3, name: "Compare Timeline", type: "check",
          description: "Use Time Machine to compare CQI vs change timeline",
          check: { method: "http", target: "/api/fleet-monitor/time-machine/diff", timeoutMs: 10000 },
        },
        {
          id: "s4", order: 4, name: "Correlate Changes", type: "decision",
          description: "Determine if changes correlate with CQI drop",
          decision: { condition: "s1.result.recentChanges || s2.result.drifted", ifTrue: "s5a", ifFalse: "s5b" },
        },
        {
          id: "s5a", order: 5, name: "Rollback Changes", type: "approval",
          description: "Prompt/config change detected — request approval to rollback",
          approval: { requiredRole: "fleet_admin", timeoutMs: 600000, autoAction: "skip" },
        },
        {
          id: "s5b", order: 5, name: "Check External Factors", type: "check",
          description: "No internal changes — check API latency, model degradation",
          check: { method: "http", target: "/api/fleet-monitor/health/{{botId}}", timeoutMs: 10000 },
        },
        {
          id: "s6", order: 6, name: "Report Findings", type: "notification",
          description: "Send analysis report to team",
          notification: { channels: ["slack"], template: "CQI degradation analysis for {{botName}}: {{findings}}" },
        },
      ],
      metadata: {
        createdBy: "system",
        createdAt: new Date(),
        timesExecuted: 0,
        avgDurationMinutes: 25,
        successRate: 0,
      },
    },
    {
      id: "pb-cost-spike",
      name: "cost-spike",
      description: "Unexpected cost increase — investigate and cap",
      version: 1,
      tags: ["P2", "cost", "finance"],
      triggerConditions: [
        { type: "metric_threshold", config: { metric: "cost_delta_1h", threshold: 200 } },
      ],
      steps: [
        {
          id: "s1", order: 1, name: "Identify Source", type: "check",
          description: "Find which bot(s) are driving the cost spike",
          check: { method: "http", target: "/api/fleet-monitor/usage", timeoutMs: 5000 },
        },
        {
          id: "s2", order: 2, name: "Check Sessions", type: "check",
          description: "Examine active sessions for runaway conversations",
          check: { method: "rpc", target: "sessions.list", timeoutMs: 10000 },
        },
        {
          id: "s3", order: 3, name: "Alert Admin", type: "approval",
          description: "Notify admin and request approval for throttling",
          approval: { requiredRole: "fleet_admin", timeoutMs: 300000, autoAction: "continue" },
        },
        {
          id: "s4", order: 4, name: "Apply Rate Limit", type: "action",
          description: "Temporarily reduce the bot's max concurrent sessions",
          action: { method: "rpc", target: "config.patch", params: { path: "agent.maxConcurrent", value: 1 } },
        },
        {
          id: "s5", order: 5, name: "Monitor", type: "wait",
          description: "Wait 15 minutes and check if cost normalizes",
          wait: { durationMs: 900000, reason: "Monitoring cost trend after throttling" },
        },
      ],
      metadata: {
        createdBy: "system",
        createdAt: new Date(),
        timesExecuted: 0,
        avgDurationMinutes: 8,
        successRate: 0,
      },
    },
    {
      id: "pb-new-bot-validation",
      name: "new-bot-validation",
      description: "Validate a newly connected bot before production use",
      version: 1,
      tags: ["onboarding", "validation"],
      triggerConditions: [{ type: "manual", config: {} }],
      steps: [
        {
          id: "s1", order: 1, name: "Verify Connection", type: "check",
          description: "Confirm gateway connection is stable",
          check: { method: "rpc", target: "health", timeoutMs: 10000 },
        },
        {
          id: "s2", order: 2, name: "Read Identity", type: "check",
          description: "Fetch and validate SOUL.md / IDENTITY.md",
          check: { method: "rpc", target: "agent.identity.get", timeoutMs: 10000 },
        },
        {
          id: "s3", order: 3, name: "List Skills", type: "check",
          description: "Enumerate installed skills",
          check: { method: "rpc", target: "skills.status", timeoutMs: 10000 },
        },
        {
          id: "s4", order: 4, name: "Test Send", type: "action",
          description: "Send a test message and verify response",
          action: { method: "rpc", target: "send", params: { message: "Fleet validation test — please confirm." } },
        },
        {
          id: "s5", order: 5, name: "Assign Trust Level", type: "action",
          description: "Set initial trust level to L0 MANUAL",
          action: { method: "command", target: "trust", params: { level: 0 } },
        },
        {
          id: "s6", order: 6, name: "Confirm Onboarding", type: "notification",
          description: "Notify team that new bot is validated",
          notification: { channels: ["slack"], template: "🤖 New bot {{botName}} validated and connected at L0 MANUAL" },
        },
      ],
      metadata: {
        createdBy: "system",
        createdAt: new Date(),
        timesExecuted: 0,
        avgDurationMinutes: 6,
        successRate: 0,
      },
    },
  ];
}

// ─── Service ────────────────────────────────────────────────────────────────

export class PlaybookEngine extends EventEmitter {
  private playbooks: Map<string, OpsPlaybook> = new Map();
  private executions: Map<string, PlaybookExecution> = new Map();
  private nextExecId = 1;

  constructor() {
    super();
    // Register built-in playbooks
    for (const pb of createBuiltinPlaybooks()) {
      this.playbooks.set(pb.id, pb);
    }
  }

  /** Register a new playbook. */
  register(input: Omit<OpsPlaybook, "id" | "metadata"> & { createdBy: string }): OpsPlaybook {
    const id = `pb-${input.name.toLowerCase().replace(/\s+/g, "-")}`;
    const playbook: OpsPlaybook = {
      ...input,
      id,
      metadata: {
        createdBy: input.createdBy,
        createdAt: new Date(),
        timesExecuted: 0,
        avgDurationMinutes: 0,
        successRate: 0,
      },
    };
    this.playbooks.set(id, playbook);
    this.emit("playbook:registered", playbook);
    return playbook;
  }

  /** Get a playbook by ID. */
  getPlaybook(id: string): OpsPlaybook | undefined {
    return this.playbooks.get(id);
  }

  /** List all playbooks. */
  listPlaybooks(tags?: string[]): OpsPlaybook[] {
    let results = Array.from(this.playbooks.values());
    if (tags && tags.length > 0) {
      results = results.filter((p) => tags.some((t) => p.tags.includes(t)));
    }
    return results;
  }

  /** Execute a playbook. */
  execute(
    playbookId: string,
    options?: {
      triggeredBy?: "auto" | "manual";
      triggeredByRef?: string;
      linkedIncidentId?: string;
      targetBotId?: string;
      context?: Record<string, unknown>;
    },
  ): PlaybookExecution {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) throw new Error(`Playbook ${playbookId} not found`);

    const id = `EXEC-${String(this.nextExecId++).padStart(4, "0")}`;
    const execution: PlaybookExecution = {
      id,
      playbookId,
      playbookName: playbook.name,
      playbookVersion: playbook.version,
      triggeredBy: options?.triggeredBy ?? "manual",
      triggeredByRef: options?.triggeredByRef,
      linkedIncidentId: options?.linkedIncidentId,
      targetBotId: options?.targetBotId,
      status: "running",
      startedAt: new Date(),
      stepResults: playbook.steps.map((s) => ({
        stepId: s.id,
        status: "pending" as StepStatus,
      })),
      currentStepIndex: 0,
    };

    this.executions.set(id, execution);
    playbook.metadata.timesExecuted++;
    playbook.metadata.lastUsed = new Date();

    this.emit("execution:started", { executionId: id, playbookId });

    // Simulate first step execution
    this.advanceStep(id);

    return execution;
  }

  /** Advance to the next step in an execution. */
  private advanceStep(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== "running") return;

    const playbook = this.playbooks.get(execution.playbookId);
    if (!playbook) return;

    if (execution.currentStepIndex >= playbook.steps.length) {
      execution.status = "completed";
      execution.completedAt = new Date();
      this.emit("execution:completed", { executionId });
      return;
    }

    const step = playbook.steps[execution.currentStepIndex]!;
    const stepResult = execution.stepResults[execution.currentStepIndex]!;

    stepResult.status = "running";
    stepResult.startedAt = new Date();

    this.emit("step:started", { executionId, stepId: step.id, stepName: step.name });

    // For approval steps, pause and wait
    if (step.type === "approval") {
      execution.status = "waiting_approval";
      this.emit("step:waiting_approval", { executionId, stepId: step.id });
      return;
    }

    // Simulate step completion (in real implementation, this would execute the actual check/action)
    stepResult.status = "success";
    stepResult.completedAt = new Date();
    stepResult.result = { simulated: true, stepType: step.type };

    execution.currentStepIndex++;
    this.emit("step:completed", { executionId, stepId: step.id, status: "success" });
  }

  /** Approve a pending approval step. */
  approveStep(executionId: string, stepId: string, approvedBy: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    if (execution.status !== "waiting_approval") {
      throw new Error(`Execution ${executionId} is not waiting for approval`);
    }

    const stepResult = execution.stepResults.find((s) => s.stepId === stepId);
    if (!stepResult) throw new Error(`Step ${stepId} not found`);

    stepResult.status = "success";
    stepResult.completedAt = new Date();
    stepResult.notes = `Approved by ${approvedBy}`;

    execution.status = "running";
    execution.currentStepIndex++;
    this.emit("step:approved", { executionId, stepId, approvedBy });

    // Continue to next step
    this.advanceStep(executionId);
  }

  /** Pause a running execution. */
  pause(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    execution.status = "paused";
    this.emit("execution:paused", { executionId });
  }

  /** Resume a paused execution. */
  resume(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    if (execution.status !== "paused") throw new Error("Execution is not paused");
    execution.status = "running";
    this.advanceStep(executionId);
  }

  /** Abort an execution. */
  abort(executionId: string, reason: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    execution.status = "aborted";
    execution.completedAt = new Date();

    // Mark remaining steps as skipped
    for (const step of execution.stepResults) {
      if (step.status === "pending" || step.status === "running") {
        step.status = "skipped";
        step.notes = `Aborted: ${reason}`;
      }
    }

    this.emit("execution:aborted", { executionId, reason });
  }

  /** Get an execution by ID. */
  getExecution(id: string): PlaybookExecution | undefined {
    return this.executions.get(id);
  }

  /** List executions, optionally filtered. */
  listExecutions(filters?: {
    playbookId?: string;
    status?: ExecutionStatus;
    since?: Date;
  }): PlaybookExecution[] {
    let results = Array.from(this.executions.values());
    if (filters?.playbookId) results = results.filter((e) => e.playbookId === filters.playbookId);
    if (filters?.status) results = results.filter((e) => e.status === filters.status);
    if (filters?.since) results = results.filter((e) => e.startedAt >= filters.since!);
    return results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /** Get execution statistics. */
  getStats(): {
    totalPlaybooks: number;
    executionsToday: number;
    activeExecutions: number;
    successRate: number;
  } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const executions = Array.from(this.executions.values());
    const todayExecs = executions.filter((e) => e.startedAt >= today);
    const completed = executions.filter((e) => e.status === "completed");
    const failed = executions.filter((e) => e.status === "failed");

    return {
      totalPlaybooks: this.playbooks.size,
      executionsToday: todayExecs.length,
      activeExecutions: executions.filter((e) => e.status === "running" || e.status === "waiting_approval").length,
      successRate: completed.length + failed.length > 0
        ? (completed.length / (completed.length + failed.length)) * 100
        : 0,
    };
  }

  /**
   * Evaluate triggers against a fleet event.
   * Returns matching playbook if one should auto-trigger.
   */
  evaluateTriggers(event: {
    type: string;
    severity?: string;
    rule?: string;
    metric?: string;
    value?: number;
  }): OpsPlaybook | null {
    for (const playbook of this.playbooks.values()) {
      for (const trigger of playbook.triggerConditions) {
        if (trigger.type === "incident_severity" && event.type === "incident") {
          if (trigger.config.severity === event.severity) return playbook;
        }
        if (trigger.type === "alert_rule" && event.type === "alert") {
          if (trigger.config.rule === event.rule) return playbook;
        }
        if (trigger.type === "metric_threshold" && event.type === "metric") {
          const threshold = trigger.config.threshold as number;
          if (event.value !== undefined && event.value > threshold) return playbook;
        }
      }
    }
    return null;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _engine: PlaybookEngine | null = null;

export function getPlaybookEngine(): PlaybookEngine {
  if (!_engine) {
    _engine = new PlaybookEngine();
  }
  return _engine;
}
