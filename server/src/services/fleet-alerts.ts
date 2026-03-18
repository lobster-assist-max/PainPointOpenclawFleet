/**
 * Fleet Alert Service — Rules-based alerting for Fleet monitoring.
 *
 * Evaluates alert rules against bot metrics at regular intervals.
 * Supports sustained-condition checks (avoid false positives from transient spikes),
 * cooldown periods (prevent alert fatigue), and multiple action types
 * (dashboard badges, fleet events, webhooks).
 *
 * Ships with 5 default rules out of the box:
 *   1. Bot offline > 5 minutes
 *   2. Health score critical (< 40 for 2+ minutes)
 *   3. Hourly cost spike (> $5)
 *   4. Channel disconnected (> 1 minute)
 *   5. Cron failure rate high (> 30%)
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertMetric =
  | "health_score"
  | "cost_1h"
  | "cost_24h"
  | "uptime"
  | "error_rate"
  | "channel_disconnected"
  | "bot_offline_duration"
  | "cron_failure_rate"
  | "latency_avg";

export type AlertOperator = "lt" | "gt" | "eq" | "gte" | "lte";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertActionType = "dashboard_badge" | "fleet_event" | "webhook";

export interface AlertCondition {
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  /** How long the condition must be sustained before firing (ms). 0 = immediate. */
  sustainedForMs: number;
}

export interface AlertAction {
  type: AlertActionType;
  config: Record<string, unknown>;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  scope: {
    type: "fleet" | "bot";
    /** Empty = all bots */
    botIds?: string[];
  };
  actions: AlertAction[];
  /** Minimum time between re-firing the same alert for the same bot (ms) */
  cooldownMs: number;
}

export type AlertState = "active" | "acknowledged" | "resolved";

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  botId: string;
  severity: AlertSeverity;
  state: AlertState;
  message: string;
  metric: AlertMetric;
  currentValue: number;
  threshold: number;
  firedAt: number;
  resolvedAt: number | null;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
}

/** Snapshot of bot metrics used for rule evaluation */
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
}

// ─── Default Rules ───────────────────────────────────────────────────────────

const DEFAULT_RULES: AlertRule[] = [
  {
    id: "default-offline-5m",
    name: "Bot Offline > 5 minutes",
    enabled: true,
    condition: { metric: "bot_offline_duration", operator: "gt", threshold: 300_000, sustainedForMs: 0 },
    scope: { type: "fleet" },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 600_000,
  },
  {
    id: "default-health-critical",
    name: "Health Score Critical",
    enabled: true,
    condition: { metric: "health_score", operator: "lt", threshold: 40, sustainedForMs: 120_000 },
    scope: { type: "fleet" },
    actions: [
      { type: "dashboard_badge", config: { severity: "critical" } },
      { type: "fleet_event", config: {} },
    ],
    cooldownMs: 300_000,
  },
  {
    id: "default-cost-spike",
    name: "Hourly Cost Spike",
    enabled: true,
    condition: { metric: "cost_1h", operator: "gt", threshold: 5.0, sustainedForMs: 0 },
    scope: { type: "fleet" },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 3_600_000,
  },
  {
    id: "default-channel-down",
    name: "Channel Disconnected",
    enabled: true,
    condition: { metric: "channel_disconnected", operator: "gt", threshold: 0, sustainedForMs: 60_000 },
    scope: { type: "fleet" },
    actions: [{ type: "dashboard_badge", config: { severity: "info" } }],
    cooldownMs: 300_000,
  },
  {
    id: "default-cron-failures",
    name: "Cron Failure Rate High",
    enabled: true,
    condition: { metric: "cron_failure_rate", operator: "gt", threshold: 0.3, sustainedForMs: 0 },
    scope: { type: "fleet" },
    actions: [{ type: "dashboard_badge", config: { severity: "warning" } }],
    cooldownMs: 3_600_000,
  },
];

// ─── Condition Evaluation ────────────────────────────────────────────────────

function getMetricValue(snapshot: BotMetricSnapshot, metric: AlertMetric): number {
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

function evaluateCondition(value: number, operator: AlertOperator, threshold: number): boolean {
  switch (operator) {
    case "lt": return value < threshold;
    case "gt": return value > threshold;
    case "eq": return value === threshold;
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
  }
}

function severityFromActions(actions: AlertAction[]): AlertSeverity {
  for (const action of actions) {
    if (action.config.severity === "critical") return "critical";
  }
  for (const action of actions) {
    if (action.config.severity === "warning") return "warning";
  }
  return "info";
}

function formatAlertMessage(rule: AlertRule, botId: string, value: number): string {
  const opStr: Record<AlertOperator, string> = {
    lt: "below", gt: "above", eq: "equals",
    gte: "at or above", lte: "at or below",
  };
  return `${rule.name}: ${rule.condition.metric} is ${opStr[rule.condition.operator]} threshold (current: ${value}, threshold: ${rule.condition.threshold})`;
}

// ─── Fleet Alert Service ─────────────────────────────────────────────────────

const EVALUATION_INTERVAL_MS = 30_000; // Check rules every 30 seconds

export class FleetAlertService extends EventEmitter {
  private rules: AlertRule[];
  private activeAlerts: Map<string, Alert> = new Map(); // alertId → Alert
  private lastFiredAt: Map<string, number> = new Map(); // `${ruleId}:${botId}` → timestamp
  private sustainedSince: Map<string, number> = new Map(); // `${ruleId}:${botId}` → first-condition-met timestamp
  private evaluationTimer: ReturnType<typeof setInterval> | null = null;
  private metricsProvider: (() => BotMetricSnapshot[]) | null = null;

  constructor(customRules?: AlertRule[]) {
    super();
    this.rules = customRules ?? [...DEFAULT_RULES];
  }

  /** Register the function that provides current bot metrics for evaluation */
  setMetricsProvider(provider: () => BotMetricSnapshot[]): void {
    this.metricsProvider = provider;
  }

  /** Start periodic rule evaluation */
  start(): void {
    if (this.evaluationTimer) return;
    this.evaluationTimer = setInterval(() => this.evaluate(), EVALUATION_INTERVAL_MS);
    // Also run immediately
    this.evaluate();
  }

  /** Stop periodic rule evaluation */
  stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
  }

  /** Run a single evaluation cycle against all rules and all bots */
  evaluate(): void {
    if (!this.metricsProvider) return;

    const snapshots = this.metricsProvider();
    const now = Date.now();

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const targetBots = rule.scope.botIds?.length
        ? snapshots.filter((s) => rule.scope.botIds!.includes(s.botId))
        : snapshots;

      for (const snapshot of targetBots) {
        const conditionKey = `${rule.id}:${snapshot.botId}`;
        const value = getMetricValue(snapshot, rule.condition.metric);
        const conditionMet = evaluateCondition(value, rule.condition.operator, rule.condition.threshold);

        if (conditionMet) {
          // Track sustained duration
          if (!this.sustainedSince.has(conditionKey)) {
            this.sustainedSince.set(conditionKey, now);
          }

          const sustainedStart = this.sustainedSince.get(conditionKey)!;
          const sustainedDuration = now - sustainedStart;

          // Check if condition has been sustained long enough
          if (sustainedDuration >= rule.condition.sustainedForMs) {
            this.maybeFireAlert(rule, snapshot, value, now);
          }
        } else {
          // Condition no longer met — reset sustained tracking
          this.sustainedSince.delete(conditionKey);

          // Auto-resolve any active alert for this rule+bot
          this.autoResolve(rule.id, snapshot.botId, now);
        }
      }
    }
  }

  private maybeFireAlert(rule: AlertRule, snapshot: BotMetricSnapshot, value: number, now: number): void {
    const conditionKey = `${rule.id}:${snapshot.botId}`;

    // Check cooldown
    const lastFired = this.lastFiredAt.get(conditionKey);
    if (lastFired && (now - lastFired) < rule.cooldownMs) {
      return; // Still in cooldown
    }

    // Check if there's already an active alert for this rule+bot
    const existingAlert = this.findActiveAlert(rule.id, snapshot.botId);
    if (existingAlert) {
      return; // Already active, don't duplicate
    }

    // Fire!
    const alert: Alert = {
      id: randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      botId: snapshot.botId,
      severity: severityFromActions(rule.actions),
      state: "active",
      message: formatAlertMessage(rule, snapshot.botId, value),
      metric: rule.condition.metric,
      currentValue: value,
      threshold: rule.condition.threshold,
      firedAt: now,
      resolvedAt: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
    };

    this.activeAlerts.set(alert.id, alert);
    this.lastFiredAt.set(conditionKey, now);

    // Execute actions
    for (const action of rule.actions) {
      this.executeAction(action, alert);
    }

    this.emit("alert.fired", alert);
  }

  private autoResolve(ruleId: string, botId: string, now: number): void {
    const alert = this.findActiveAlert(ruleId, botId);
    if (alert && alert.state === "active") {
      alert.state = "resolved";
      alert.resolvedAt = now;
      this.emit("alert.resolved", alert);
    }
  }

  private findActiveAlert(ruleId: string, botId: string): Alert | undefined {
    for (const alert of this.activeAlerts.values()) {
      if (alert.ruleId === ruleId && alert.botId === botId && alert.state !== "resolved") {
        return alert;
      }
    }
    return undefined;
  }

  private executeAction(action: AlertAction, alert: Alert): void {
    switch (action.type) {
      case "dashboard_badge":
        // Emit event for the UI to pick up via LiveEvents
        this.emit("action.dashboard_badge", {
          alertId: alert.id,
          severity: alert.severity,
          botId: alert.botId,
          message: alert.message,
        });
        break;

      case "fleet_event":
        // Emit a fleet-scoped event
        this.emit("action.fleet_event", {
          type: "fleet.alert.triggered",
          alertId: alert.id,
          ruleId: alert.ruleId,
          botId: alert.botId,
          severity: alert.severity,
          message: alert.message,
          firedAt: alert.firedAt,
        });
        break;

      case "webhook": {
        const url = action.config.url as string | undefined;
        if (url) {
          // Fire-and-forget webhook. Errors are logged but don't block.
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              alert: {
                id: alert.id,
                ruleName: alert.ruleName,
                botId: alert.botId,
                severity: alert.severity,
                message: alert.message,
                metric: alert.metric,
                currentValue: alert.currentValue,
                threshold: alert.threshold,
                firedAt: new Date(alert.firedAt).toISOString(),
              },
            }),
            signal: AbortSignal.timeout(10_000),
          }).catch((err) => {
            this.emit("action.webhook.error", { url, error: err instanceof Error ? err.message : String(err) });
          });
        }
        break;
      }
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Get all active (unfired or acknowledged but unresolved) alerts */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(
      (a) => a.state === "active" || a.state === "acknowledged",
    );
  }

  /** Get all alerts (including resolved), sorted by firedAt descending */
  getAllAlerts(limit = 50): Alert[] {
    return Array.from(this.activeAlerts.values())
      .sort((a, b) => b.firedAt - a.firedAt)
      .slice(0, limit);
  }

  /** Get alerts for a specific bot */
  getAlertsForBot(botId: string): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter((a) => a.botId === botId)
      .sort((a, b) => b.firedAt - a.firedAt);
  }

  /** Acknowledge an alert (stops re-notification but doesn't resolve) */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.state !== "active") return false;
    alert.state = "acknowledged";
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = acknowledgedBy;
    this.emit("alert.acknowledged", alert);
    return true;
  }

  /** Manually resolve an alert */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.state === "resolved") return false;
    alert.state = "resolved";
    alert.resolvedAt = Date.now();
    this.emit("alert.resolved", alert);
    return true;
  }

  /** Get current rules */
  getRules(): AlertRule[] {
    return [...this.rules];
  }

  /** Update a rule */
  updateRule(ruleId: string, updates: Partial<Omit<AlertRule, "id">>): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx < 0) return false;
    this.rules[idx] = { ...this.rules[idx], ...updates, id: ruleId };
    return true;
  }

  /** Add a custom rule */
  addRule(rule: Omit<AlertRule, "id">): AlertRule {
    const newRule: AlertRule = { ...rule, id: randomUUID() };
    this.rules.push(newRule);
    return newRule;
  }

  /** Remove a rule (and resolve any active alerts from it) */
  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx < 0) return false;
    this.rules.splice(idx, 1);
    // Resolve all alerts from this rule
    for (const alert of this.activeAlerts.values()) {
      if (alert.ruleId === ruleId && alert.state !== "resolved") {
        alert.state = "resolved";
        alert.resolvedAt = Date.now();
        this.emit("alert.resolved", alert);
      }
    }
    return true;
  }

  /** Prune resolved alerts older than maxAgeMs (default: 24h) */
  pruneResolved(maxAgeMs = 86_400_000): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [id, alert] of this.activeAlerts) {
      if (alert.state === "resolved" && alert.resolvedAt && alert.resolvedAt < cutoff) {
        this.activeAlerts.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  /** Get count of active alerts by severity (for sidebar badge) */
  getAlertCounts(): { critical: number; warning: number; info: number; total: number } {
    let critical = 0, warning = 0, info = 0;
    for (const alert of this.activeAlerts.values()) {
      if (alert.state === "resolved") continue;
      switch (alert.severity) {
        case "critical": critical++; break;
        case "warning": warning++; break;
        case "info": info++; break;
      }
    }
    return { critical, warning, info, total: critical + warning + info };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _alertService: FleetAlertService | null = null;

export function getFleetAlertService(): FleetAlertService {
  if (!_alertService) {
    _alertService = new FleetAlertService();
  }
  return _alertService;
}
