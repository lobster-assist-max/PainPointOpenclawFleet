/**
 * Fleet Self-Healing Service — Automated remediation for Fleet monitoring.
 *
 * Evaluates healing policies against bot metrics at regular intervals (30s).
 * When a policy trigger condition is sustained, executes remediation actions
 * (reconnect, restart_channel, downgrade_model, etc.) with retry and verification.
 * Escalates to operators when auto-fix fails.
 *
 * Ships with 3 default policies:
 *   1. Auto-Reconnect — reconnect bots offline > 2 minutes
 *   2. Channel Restart — restart channels disconnected > 1 minute
 *   3. Cost Circuit Breaker — downgrade model when hourly cost > $8
 *
 * Features:
 *   - Kill switch (pause/resume all healing globally)
 *   - Per-bot per-policy cooldown tracking
 *   - Rate limiting (maxAttemptsPerHour)
 *   - Escalation when attempts or time thresholds are exceeded
 *   - Full audit log for every remediation action
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export type HealingMetric =
  | "health_score"
  | "cost_1h"
  | "cost_24h"
  | "uptime"
  | "error_rate"
  | "channel_disconnected"
  | "bot_offline_duration"
  | "cron_failure_rate"
  | "latency_avg";

export type HealingOperator = "lt" | "gt" | "eq" | "gte" | "lte";

export type RemediationAction =
  | "reconnect"
  | "restart_channel"
  | "downgrade_model"
  | "restart_bot"
  | "clear_session_cache"
  | "throttle_requests"
  | "notify_operator";

export type HealingEventType =
  | "healing.started"
  | "healing.succeeded"
  | "healing.failed"
  | "healing.escalated";

export type EscalationTarget = "operator" | "webhook" | "pagerduty";

export interface HealingTrigger {
  metric: HealingMetric;
  operator: HealingOperator;
  threshold: number;
  /** How long the condition must be sustained before triggering (ms). 0 = immediate. */
  sustainedForMs: number;
}

export interface EscalationConfig {
  /** Escalate after this many failed remediation attempts */
  afterAttempts: number;
  /** Escalate after this many ms since first attempt (0 = never time-based) */
  afterMs: number;
  /** Where to escalate */
  escalateTo: EscalationTarget;
  /** Additional config for the escalation target (e.g. webhook URL) */
  config?: Record<string, unknown>;
}

export interface HealingPolicyScope {
  /** Apply to all bots, bots with specific tags, or specific bot IDs */
  type: "fleet" | "tagged" | "bot";
  /** Bot IDs — only used when type is "bot" */
  botIds?: string[];
  /** Bot tags — only used when type is "tagged" */
  tags?: string[];
}

export interface HealingPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: HealingTrigger;
  actions: RemediationAction[];
  escalation: EscalationConfig;
  /** Minimum time between remediation attempts for the same bot (ms) */
  cooldownMs: number;
  /** Maximum remediation attempts per bot per hour */
  maxAttemptsPerHour: number;
  scope: HealingPolicyScope;
  /** Priority: lower numbers run first when multiple policies match */
  priority: number;
}

export type HealingAttemptStatus = "started" | "succeeded" | "failed" | "escalated";

export interface HealingAttempt {
  id: string;
  policyId: string;
  policyName: string;
  botId: string;
  action: RemediationAction;
  status: HealingAttemptStatus;
  /** Metric value that triggered the healing */
  triggerValue: number;
  /** Policy threshold that was breached */
  threshold: number;
  startedAt: number;
  completedAt: number | null;
  /** How long the remediation took (ms) */
  durationMs: number | null;
  /** Error message if failed */
  error: string | null;
  /** Whether this attempt triggered an escalation */
  escalated: boolean;
}

export interface HealingAuditEntry {
  id: string;
  timestamp: number;
  policyId: string;
  policyName: string;
  botId: string;
  action: RemediationAction;
  status: HealingAttemptStatus;
  triggerMetric: HealingMetric;
  triggerValue: number;
  threshold: number;
  durationMs: number | null;
  error: string | null;
  escalated: boolean;
}

/** Snapshot of bot metrics used for policy evaluation (mirrors fleet-alerts pattern) */
export interface BotMetricSnapshot {
  botId: string;
  healthScore: number;
  cost1h: number;
  cost24h: number;
  uptimePct: number;
  errorRate: number;
  channelDisconnectedCount: number;
  botOfflineDurationMs: number;
  cronFailureRate: number;
  latencyAvgMs: number;
  tags?: string[];
}

/** Handler that executes a specific remediation action against a bot */
export type RemediationHandler = (
  botId: string,
  action: RemediationAction,
  context: { policyId: string; triggerValue: number; threshold: number },
) => Promise<{ success: boolean; message?: string }>;

// ─── Default Policies ────────────────────────────────────────────────────────

const DEFAULT_POLICIES: HealingPolicy[] = [
  {
    id: "default-auto-reconnect",
    name: "Auto-Reconnect",
    description: "Automatically reconnect bots that have been offline for more than 2 minutes",
    enabled: true,
    trigger: {
      metric: "bot_offline_duration",
      operator: "gt",
      threshold: 120_000,
      sustainedForMs: 0,
    },
    actions: ["reconnect"],
    escalation: {
      afterAttempts: 3,
      afterMs: 600_000,
      escalateTo: "operator",
    },
    cooldownMs: 120_000,
    maxAttemptsPerHour: 5,
    scope: { type: "fleet" },
    priority: 1,
  },
  {
    id: "default-channel-restart",
    name: "Channel Restart",
    description: "Restart channels that have been disconnected for more than 1 minute",
    enabled: true,
    trigger: {
      metric: "channel_disconnected",
      operator: "gt",
      threshold: 0,
      sustainedForMs: 60_000,
    },
    actions: ["restart_channel"],
    escalation: {
      afterAttempts: 2,
      afterMs: 300_000,
      escalateTo: "operator",
    },
    cooldownMs: 180_000,
    maxAttemptsPerHour: 4,
    scope: { type: "fleet" },
    priority: 2,
  },
  {
    id: "default-cost-circuit-breaker",
    name: "Cost Circuit Breaker",
    description: "Downgrade to a cheaper model when hourly cost exceeds $8",
    enabled: true,
    trigger: {
      metric: "cost_1h",
      operator: "gt",
      threshold: 8.0,
      sustainedForMs: 0,
    },
    actions: ["downgrade_model", "notify_operator"],
    escalation: {
      afterAttempts: 1,
      afterMs: 0,
      escalateTo: "operator",
    },
    cooldownMs: 3_600_000,
    maxAttemptsPerHour: 2,
    scope: { type: "fleet" },
    priority: 0,
  },
];

// ─── Condition Evaluation ────────────────────────────────────────────────────

function getMetricValue(snapshot: BotMetricSnapshot, metric: HealingMetric): number {
  switch (metric) {
    case "health_score": return snapshot.healthScore;
    case "cost_1h": return snapshot.cost1h;
    case "cost_24h": return snapshot.cost24h;
    case "uptime": return snapshot.uptimePct;
    case "error_rate": return snapshot.errorRate;
    case "channel_disconnected": return snapshot.channelDisconnectedCount;
    case "bot_offline_duration": return snapshot.botOfflineDurationMs;
    case "cron_failure_rate": return snapshot.cronFailureRate;
    case "latency_avg": return snapshot.latencyAvgMs;
  }
}

function evaluateCondition(value: number, operator: HealingOperator, threshold: number): boolean {
  switch (operator) {
    case "lt": return value < threshold;
    case "gt": return value > threshold;
    case "eq": return value === threshold;
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
  }
}

// ─── Cooldown Tracker ────────────────────────────────────────────────────────

interface CooldownEntry {
  lastAttemptAt: number;
  firstAttemptAt: number;
  attemptsInWindow: { timestamp: number }[];
  totalAttempts: number;
}

// ─── Healing Policy Engine ───────────────────────────────────────────────────

const EVALUATION_INTERVAL_MS = 30_000; // Check policies every 30 seconds
const AUDIT_LOG_MAX_SIZE = 500;
const HOURLY_WINDOW_MS = 3_600_000;

export class HealingPolicyEngine extends EventEmitter {
  private policies: HealingPolicy[];
  private paused = false;
  private evaluationTimer: ReturnType<typeof setInterval> | null = null;
  private metricsProvider: (() => BotMetricSnapshot[]) | null = null;
  private remediationHandler: RemediationHandler | null = null;

  /** Track sustained condition per policy+bot: `${policyId}:${botId}` → first-condition-met timestamp */
  private sustainedSince = new Map<string, number>();

  /** Track cooldowns per policy+bot */
  private cooldowns = new Map<string, CooldownEntry>();

  /** Active healing attempts in progress (to avoid concurrent remediations for same bot+policy) */
  private activeRemediations = new Set<string>();

  /** Completed healing attempts (ring buffer) */
  private attempts: HealingAttempt[] = [];

  /** Full audit log (ring buffer) */
  private auditLog: HealingAuditEntry[] = [];

  constructor(customPolicies?: HealingPolicy[]) {
    super();
    this.policies = customPolicies ?? [...DEFAULT_POLICIES];
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Register the function that provides current bot metrics for evaluation */
  setMetricsProvider(provider: () => BotMetricSnapshot[]): void {
    this.metricsProvider = provider;
  }

  /** Register the handler that executes remediation actions */
  setRemediationHandler(handler: RemediationHandler): void {
    this.remediationHandler = handler;
  }

  /** Start periodic policy evaluation (every 30s) */
  start(): void {
    if (this.evaluationTimer) return;
    this.evaluationTimer = setInterval(() => this.evaluate(), EVALUATION_INTERVAL_MS);
    // Also run immediately
    this.evaluate();
  }

  /** Stop periodic policy evaluation */
  stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
  }

  // ─── Kill Switch ────────────────────────────────────────────────────────────

  /** Pause all healing (kill switch). Evaluation continues but no actions are taken. */
  pause(): void {
    this.paused = true;
    this.emit("healing.paused", { timestamp: Date.now() });
  }

  /** Resume healing after a pause. */
  resume(): void {
    this.paused = false;
    this.emit("healing.resumed", { timestamp: Date.now() });
  }

  /** Check if healing is currently paused. */
  isPaused(): boolean {
    return this.paused;
  }

  // ─── Core Evaluation ────────────────────────────────────────────────────────

  /** Run a single evaluation cycle against all enabled policies and all bots */
  evaluate(): void {
    if (!this.metricsProvider) return;

    const snapshots = this.metricsProvider();
    const now = Date.now();

    // Sort policies by priority (lower first)
    const sortedPolicies = [...this.policies].sort((a, b) => a.priority - b.priority);

    for (const policy of sortedPolicies) {
      if (!policy.enabled) continue;

      const targetBots = this.resolvePolicyScope(policy.scope, snapshots);

      for (const snapshot of targetBots) {
        const conditionKey = `${policy.id}:${snapshot.botId}`;
        const value = getMetricValue(snapshot, policy.trigger.metric);
        const conditionMet = evaluateCondition(value, policy.trigger.operator, policy.trigger.threshold);

        if (conditionMet) {
          // Track sustained duration
          if (!this.sustainedSince.has(conditionKey)) {
            this.sustainedSince.set(conditionKey, now);
          }

          const sustainedStart = this.sustainedSince.get(conditionKey)!;
          const sustainedDuration = now - sustainedStart;

          // Check if condition has been sustained long enough
          if (sustainedDuration >= policy.trigger.sustainedForMs) {
            this.maybeRemediate(policy, snapshot, value, now);
          }
        } else {
          // Condition no longer met — reset sustained tracking
          this.sustainedSince.delete(conditionKey);
        }
      }
    }
  }

  /** Resolve which bots a policy scope applies to */
  private resolvePolicyScope(scope: HealingPolicyScope, snapshots: BotMetricSnapshot[]): BotMetricSnapshot[] {
    switch (scope.type) {
      case "fleet":
        return snapshots;

      case "bot":
        if (!scope.botIds?.length) return snapshots;
        return snapshots.filter((s) => scope.botIds!.includes(s.botId));

      case "tagged":
        if (!scope.tags?.length) return snapshots;
        return snapshots.filter((s) =>
          s.tags?.some((tag) => scope.tags!.includes(tag)) ?? false,
        );
    }
  }

  // ─── Remediation Execution ──────────────────────────────────────────────────

  private maybeRemediate(policy: HealingPolicy, snapshot: BotMetricSnapshot, value: number, now: number): void {
    const conditionKey = `${policy.id}:${snapshot.botId}`;

    // Kill switch check
    if (this.paused) return;

    // Already running a remediation for this policy+bot?
    if (this.activeRemediations.has(conditionKey)) return;

    // Check cooldown
    const cooldown = this.cooldowns.get(conditionKey);
    if (cooldown && (now - cooldown.lastAttemptAt) < policy.cooldownMs) {
      return; // Still in cooldown
    }

    // Check rate limit (maxAttemptsPerHour)
    if (cooldown) {
      const recentAttempts = cooldown.attemptsInWindow.filter(
        (a) => (now - a.timestamp) < HOURLY_WINDOW_MS,
      );
      if (recentAttempts.length >= policy.maxAttemptsPerHour) {
        // Rate limited — check if we should escalate
        this.maybeEscalate(policy, snapshot.botId, cooldown, value, now, "Rate limit exceeded");
        return;
      }
    }

    // Execute remediation asynchronously
    this.activeRemediations.add(conditionKey);
    this.executeRemediation(policy, snapshot.botId, value, now).finally(() => {
      this.activeRemediations.delete(conditionKey);
    });
  }

  /** Execute the full remediation sequence for a policy (all actions in order) */
  private async executeRemediation(
    policy: HealingPolicy,
    botId: string,
    triggerValue: number,
    now: number,
  ): Promise<void> {
    const conditionKey = `${policy.id}:${botId}`;

    // Initialize or update cooldown tracking
    if (!this.cooldowns.has(conditionKey)) {
      this.cooldowns.set(conditionKey, {
        lastAttemptAt: now,
        firstAttemptAt: now,
        attemptsInWindow: [{ timestamp: now }],
        totalAttempts: 1,
      });
    } else {
      const cd = this.cooldowns.get(conditionKey)!;
      cd.lastAttemptAt = now;
      cd.attemptsInWindow.push({ timestamp: now });
      // Prune old entries outside the hourly window
      cd.attemptsInWindow = cd.attemptsInWindow.filter(
        (a) => (now - a.timestamp) < HOURLY_WINDOW_MS,
      );
      cd.totalAttempts++;
    }

    for (const action of policy.actions) {
      const attemptId = randomUUID();
      const attempt: HealingAttempt = {
        id: attemptId,
        policyId: policy.id,
        policyName: policy.name,
        botId,
        action,
        status: "started",
        triggerValue,
        threshold: policy.trigger.threshold,
        startedAt: now,
        completedAt: null,
        durationMs: null,
        error: null,
        escalated: false,
      };

      this.recordAttempt(attempt);

      this.emit("healing.started", {
        attemptId,
        policyId: policy.id,
        policyName: policy.name,
        botId,
        action,
        triggerValue,
        threshold: policy.trigger.threshold,
        timestamp: now,
      });

      try {
        const result = await this.callRemediationHandler(botId, action, {
          policyId: policy.id,
          triggerValue,
          threshold: policy.trigger.threshold,
        });

        const completedAt = Date.now();
        attempt.completedAt = completedAt;
        attempt.durationMs = completedAt - now;

        if (result.success) {
          attempt.status = "succeeded";

          this.emit("healing.succeeded", {
            attemptId,
            policyId: policy.id,
            policyName: policy.name,
            botId,
            action,
            durationMs: attempt.durationMs,
            message: result.message,
            timestamp: completedAt,
          });

          // Success — reset sustained tracking so we don't re-trigger immediately
          this.sustainedSince.delete(conditionKey);
        } else {
          attempt.status = "failed";
          attempt.error = result.message ?? "Remediation reported failure";

          this.emit("healing.failed", {
            attemptId,
            policyId: policy.id,
            policyName: policy.name,
            botId,
            action,
            error: attempt.error,
            durationMs: attempt.durationMs,
            timestamp: completedAt,
          });

          // Check if we should escalate
          const cooldown = this.cooldowns.get(conditionKey)!;
          const didEscalate = this.maybeEscalate(
            policy, botId, cooldown, triggerValue, completedAt, attempt.error,
          );
          attempt.escalated = didEscalate;
        }
      } catch (err) {
        const completedAt = Date.now();
        attempt.completedAt = completedAt;
        attempt.durationMs = completedAt - now;
        attempt.status = "failed";
        attempt.error = err instanceof Error ? err.message : String(err);

        this.emit("healing.failed", {
          attemptId,
          policyId: policy.id,
          policyName: policy.name,
          botId,
          action,
          error: attempt.error,
          durationMs: attempt.durationMs,
          timestamp: completedAt,
        });

        // Check if we should escalate
        const cooldown = this.cooldowns.get(conditionKey)!;
        const didEscalate = this.maybeEscalate(
          policy, botId, cooldown, triggerValue, completedAt, attempt.error,
        );
        attempt.escalated = didEscalate;
      }

      // Write audit log entry for this action
      this.writeAuditEntry(attempt, policy.trigger.metric);
    }
  }

  /** Call the registered remediation handler, or return a no-op result if none is registered */
  private async callRemediationHandler(
    botId: string,
    action: RemediationAction,
    context: { policyId: string; triggerValue: number; threshold: number },
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.remediationHandler) {
      return { success: false, message: "No remediation handler registered" };
    }

    // Add a timeout to prevent hung handlers from blocking the engine
    const HANDLER_TIMEOUT_MS = 30_000;

    return Promise.race([
      this.remediationHandler(botId, action, context),
      new Promise<{ success: boolean; message: string }>((_, reject) => {
        setTimeout(() => reject(new Error(`Remediation handler timed out after ${HANDLER_TIMEOUT_MS}ms`)), HANDLER_TIMEOUT_MS);
      }),
    ]);
  }

  // ─── Escalation ─────────────────────────────────────────────────────────────

  /**
   * Check if escalation criteria are met and escalate if so.
   * Returns true if escalation was triggered.
   */
  private maybeEscalate(
    policy: HealingPolicy,
    botId: string,
    cooldown: CooldownEntry,
    triggerValue: number,
    now: number,
    reason: string,
  ): boolean {
    const { escalation } = policy;

    const attemptThresholdMet = cooldown.totalAttempts >= escalation.afterAttempts;
    const timeThresholdMet = escalation.afterMs > 0
      && (now - cooldown.firstAttemptAt) >= escalation.afterMs;

    if (!attemptThresholdMet && !timeThresholdMet) {
      return false;
    }

    this.escalate(policy, botId, triggerValue, now, reason, cooldown.totalAttempts);
    return true;
  }

  /** Execute an escalation */
  private escalate(
    policy: HealingPolicy,
    botId: string,
    triggerValue: number,
    now: number,
    reason: string,
    totalAttempts: number,
  ): void {
    const escalationEvent = {
      policyId: policy.id,
      policyName: policy.name,
      botId,
      escalateTo: policy.escalation.escalateTo,
      reason,
      triggerMetric: policy.trigger.metric,
      triggerValue,
      threshold: policy.trigger.threshold,
      totalAttempts,
      config: policy.escalation.config,
      timestamp: now,
    };

    this.emit("healing.escalated", escalationEvent);

    // If escalation target is a webhook, fire it
    if (policy.escalation.escalateTo === "webhook" && policy.escalation.config?.url) {
      const url = policy.escalation.config.url as string;
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "healing.escalation",
          ...escalationEvent,
          timestamp: new Date(now).toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch((err) => {
        this.emit("escalation.webhook.error", {
          url,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Write escalation to audit log
    this.auditLog.push({
      id: randomUUID(),
      timestamp: now,
      policyId: policy.id,
      policyName: policy.name,
      botId,
      action: "notify_operator",
      status: "escalated",
      triggerMetric: policy.trigger.metric,
      triggerValue,
      threshold: policy.trigger.threshold,
      durationMs: null,
      error: reason,
      escalated: true,
    });
    this.pruneAuditLog();
  }

  // ─── Audit Log ──────────────────────────────────────────────────────────────

  private recordAttempt(attempt: HealingAttempt): void {
    this.attempts.push(attempt);
    // Keep ring buffer bounded
    if (this.attempts.length > AUDIT_LOG_MAX_SIZE) {
      this.attempts = this.attempts.slice(-AUDIT_LOG_MAX_SIZE);
    }
  }

  private writeAuditEntry(attempt: HealingAttempt, triggerMetric: HealingMetric): void {
    this.auditLog.push({
      id: attempt.id,
      timestamp: attempt.startedAt,
      policyId: attempt.policyId,
      policyName: attempt.policyName,
      botId: attempt.botId,
      action: attempt.action,
      status: attempt.status,
      triggerMetric,
      triggerValue: attempt.triggerValue,
      threshold: attempt.threshold,
      durationMs: attempt.durationMs,
      error: attempt.error,
      escalated: attempt.escalated,
    });
    this.pruneAuditLog();
  }

  private pruneAuditLog(): void {
    if (this.auditLog.length > AUDIT_LOG_MAX_SIZE) {
      this.auditLog = this.auditLog.slice(-AUDIT_LOG_MAX_SIZE);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Get all healing policies */
  getPolicies(): HealingPolicy[] {
    return [...this.policies];
  }

  /** Get a single policy by ID */
  getPolicy(policyId: string): HealingPolicy | undefined {
    return this.policies.find((p) => p.id === policyId);
  }

  /** Add a custom healing policy */
  addPolicy(policy: Omit<HealingPolicy, "id">): HealingPolicy {
    const newPolicy: HealingPolicy = { ...policy, id: randomUUID() };
    this.policies.push(newPolicy);
    return newPolicy;
  }

  /** Update an existing policy */
  updatePolicy(policyId: string, updates: Partial<Omit<HealingPolicy, "id">>): boolean {
    const idx = this.policies.findIndex((p) => p.id === policyId);
    if (idx < 0) return false;
    this.policies[idx] = { ...this.policies[idx], ...updates, id: policyId };
    return true;
  }

  /** Remove a policy by ID */
  removePolicy(policyId: string): boolean {
    const idx = this.policies.findIndex((p) => p.id === policyId);
    if (idx < 0) return false;
    this.policies.splice(idx, 1);
    // Clean up related tracking state
    for (const key of [...this.sustainedSince.keys()]) {
      if (key.startsWith(`${policyId}:`)) {
        this.sustainedSince.delete(key);
      }
    }
    for (const key of [...this.cooldowns.keys()]) {
      if (key.startsWith(`${policyId}:`)) {
        this.cooldowns.delete(key);
      }
    }
    return true;
  }

  /** Enable or disable a specific policy */
  setPolicyEnabled(policyId: string, enabled: boolean): boolean {
    return this.updatePolicy(policyId, { enabled });
  }

  /** Get recent healing attempts, sorted by startedAt descending */
  getAttempts(limit = 50): HealingAttempt[] {
    return [...this.attempts]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  /** Get healing attempts for a specific bot */
  getAttemptsForBot(botId: string, limit = 50): HealingAttempt[] {
    return this.attempts
      .filter((a) => a.botId === botId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  /** Get the full audit log, sorted by timestamp descending */
  getAuditLog(limit = 100): HealingAuditEntry[] {
    return [...this.auditLog]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /** Get audit log entries for a specific bot */
  getAuditLogForBot(botId: string, limit = 50): HealingAuditEntry[] {
    return this.auditLog
      .filter((e) => e.botId === botId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /** Get summary statistics */
  getStats(): {
    totalAttempts: number;
    succeeded: number;
    failed: number;
    escalated: number;
    paused: boolean;
    activePolicies: number;
    activeRemediations: number;
  } {
    let succeeded = 0;
    let failed = 0;
    let escalated = 0;

    for (const attempt of this.attempts) {
      switch (attempt.status) {
        case "succeeded": succeeded++; break;
        case "failed": failed++; break;
      }
      if (attempt.escalated) escalated++;
    }

    return {
      totalAttempts: this.attempts.length,
      succeeded,
      failed,
      escalated,
      paused: this.paused,
      activePolicies: this.policies.filter((p) => p.enabled).length,
      activeRemediations: this.activeRemediations.size,
    };
  }

  /** Reset cooldown tracking for a specific bot+policy (or all if no args) */
  resetCooldowns(policyId?: string, botId?: string): void {
    if (policyId && botId) {
      const key = `${policyId}:${botId}`;
      this.cooldowns.delete(key);
      this.sustainedSince.delete(key);
    } else if (policyId) {
      for (const key of [...this.cooldowns.keys()]) {
        if (key.startsWith(`${policyId}:`)) this.cooldowns.delete(key);
      }
      for (const key of [...this.sustainedSince.keys()]) {
        if (key.startsWith(`${policyId}:`)) this.sustainedSince.delete(key);
      }
    } else {
      this.cooldowns.clear();
      this.sustainedSince.clear();
    }
  }

  /** Prune old audit entries (default: older than 24h) */
  pruneOldEntries(maxAgeMs = 86_400_000): { attempts: number; auditEntries: number } {
    const cutoff = Date.now() - maxAgeMs;
    const prevAttempts = this.attempts.length;
    const prevAudit = this.auditLog.length;

    this.attempts = this.attempts.filter((a) => a.startedAt >= cutoff);
    this.auditLog = this.auditLog.filter((e) => e.timestamp >= cutoff);

    return {
      attempts: prevAttempts - this.attempts.length,
      auditEntries: prevAudit - this.auditLog.length,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _healingEngine: HealingPolicyEngine | null = null;

export function getHealingPolicyEngine(): HealingPolicyEngine {
  if (!_healingEngine) {
    _healingEngine = new HealingPolicyEngine();
  }
  return _healingEngine;
}

export function disposeHealingPolicyEngine(): void {
  if (_healingEngine) {
    _healingEngine.stop();
    _healingEngine.removeAllListeners();
    _healingEngine = null;
  }
}
