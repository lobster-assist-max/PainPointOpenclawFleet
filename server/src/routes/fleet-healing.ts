/**
 * Fleet Self-Healing API Routes
 *
 * Endpoints for inspecting and managing the HealingPolicyEngine — automated
 * remediation policies, the global kill switch, remediation attempts, and the
 * audit log. Policies evaluate bot metrics every 30s and execute remediation
 * actions (reconnect, restart_channel, downgrade_model, …) with retry +
 * escalation.
 *
 * Mounted at /api/fleet-monitor (paths all under /healing/*).
 */

import { Router } from "express";
import type {
  HealingPolicyEngine,
  HealingMetric,
  HealingOperator,
  RemediationAction,
  EscalationTarget,
  HealingPolicyScope,
  HealingTrigger,
  EscalationConfig,
} from "../services/fleet-healing.js";

const VALID_METRICS: HealingMetric[] = [
  "health_score", "cost_1h", "cost_24h", "uptime", "error_rate",
  "channel_disconnected", "bot_offline_duration", "cron_failure_rate", "latency_avg",
];
const VALID_OPERATORS: HealingOperator[] = ["lt", "gt", "eq", "gte", "lte"];
const VALID_ACTIONS: RemediationAction[] = [
  "reconnect", "restart_channel", "downgrade_model", "restart_bot",
  "clear_session_cache", "throttle_requests", "notify_operator",
];
const VALID_ESCALATION_TARGETS: EscalationTarget[] = ["operator", "webhook", "pagerduty"];
const VALID_SCOPE_TYPES: HealingPolicyScope["type"][] = ["fleet", "tagged", "bot"];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isNonNegativeNumber(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0;
}

/** Validate a trigger object; returns an error string or null. */
function validateTrigger(t: unknown): string | null {
  if (typeof t !== "object" || t === null) return "trigger must be an object";
  const tr = t as Record<string, unknown>;
  if (!VALID_METRICS.includes(tr.metric as HealingMetric)) {
    return `trigger.metric must be one of: ${VALID_METRICS.join(", ")}`;
  }
  if (!VALID_OPERATORS.includes(tr.operator as HealingOperator)) {
    return `trigger.operator must be one of: ${VALID_OPERATORS.join(", ")}`;
  }
  if (!isFiniteNumber(tr.threshold)) return "trigger.threshold must be a finite number";
  if (!isNonNegativeNumber(tr.sustainedForMs)) return "trigger.sustainedForMs must be a non-negative number";
  return null;
}

/** Validate an escalation object; returns an error string or null. */
function validateEscalation(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return "escalation must be an object";
  const es = e as Record<string, unknown>;
  if (!isNonNegativeNumber(es.afterAttempts)) return "escalation.afterAttempts must be a non-negative number";
  if (!isNonNegativeNumber(es.afterMs)) return "escalation.afterMs must be a non-negative number";
  if (!VALID_ESCALATION_TARGETS.includes(es.escalateTo as EscalationTarget)) {
    return `escalation.escalateTo must be one of: ${VALID_ESCALATION_TARGETS.join(", ")}`;
  }
  return null;
}

/** Validate a scope object; returns an error string or null. */
function validateScope(s: unknown): string | null {
  if (typeof s !== "object" || s === null) return "scope must be an object";
  const sc = s as Record<string, unknown>;
  if (!VALID_SCOPE_TYPES.includes(sc.type as HealingPolicyScope["type"])) {
    return `scope.type must be one of: ${VALID_SCOPE_TYPES.join(", ")}`;
  }
  if (sc.type === "bot" && sc.botIds !== undefined && !Array.isArray(sc.botIds)) {
    return "scope.botIds must be an array";
  }
  if (sc.type === "tagged" && sc.tags !== undefined && !Array.isArray(sc.tags)) {
    return "scope.tags must be an array";
  }
  return null;
}

/** Validate the full body of a policy create request. */
function validatePolicyBody(body: Record<string, unknown>): string | null {
  if (!isNonEmptyString(body.name)) return "name must be a non-empty string";
  if (typeof body.description !== "string") return "description must be a string";
  if (typeof body.enabled !== "boolean") return "enabled must be a boolean";
  const triggerErr = validateTrigger(body.trigger);
  if (triggerErr) return triggerErr;
  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    return "actions must be a non-empty array";
  }
  for (const a of body.actions) {
    if (!VALID_ACTIONS.includes(a as RemediationAction)) {
      return `actions must each be one of: ${VALID_ACTIONS.join(", ")}`;
    }
  }
  const escErr = validateEscalation(body.escalation);
  if (escErr) return escErr;
  if (!isNonNegativeNumber(body.cooldownMs)) return "cooldownMs must be a non-negative number";
  if (!isNonNegativeNumber(body.maxAttemptsPerHour) || body.maxAttemptsPerHour < 1) {
    return "maxAttemptsPerHour must be a positive number";
  }
  const scopeErr = validateScope(body.scope);
  if (scopeErr) return scopeErr;
  if (!isFiniteNumber(body.priority)) return "priority must be a finite number";
  return null;
}

export function fleetHealingRoutes(engine: HealingPolicyEngine): Router {
  const router = Router();

  // ─── Stats + kill switch ──────────────────────────────────────────────

  /** GET /api/fleet-monitor/healing/stats */
  router.get("/healing/stats", (_req, res) => {
    try {
      res.json({ ok: true, stats: engine.getStats() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/healing/pause — engage the global kill switch */
  router.post("/healing/pause", (_req, res) => {
    try {
      engine.pause();
      res.json({ ok: true, paused: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/healing/resume */
  router.post("/healing/resume", (_req, res) => {
    try {
      engine.resume();
      res.json({ ok: true, paused: false });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Attempts + audit log ─────────────────────────────────────────────

  /** GET /api/fleet-monitor/healing/attempts?botId=&limit= */
  router.get("/healing/attempts", (req, res) => {
    try {
      const limit = Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50);
      const botId = req.query.botId;
      const attempts = isNonEmptyString(botId)
        ? engine.getAttemptsForBot(botId, limit)
        : engine.getAttempts(limit);
      res.json({ ok: true, attempts });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** GET /api/fleet-monitor/healing/audit?botId=&limit= */
  router.get("/healing/audit", (req, res) => {
    try {
      const limit = Math.max(1, Number.parseInt(String(req.query.limit ?? "100"), 10) || 100);
      const botId = req.query.botId;
      const entries = isNonEmptyString(botId)
        ? engine.getAuditLogForBot(botId, limit)
        : engine.getAuditLog(limit);
      res.json({ ok: true, entries });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Cooldown reset ───────────────────────────────────────────────────

  /** POST /api/fleet-monitor/healing/reset-cooldowns?policyId=&botId= */
  router.post("/healing/reset-cooldowns", (req, res) => {
    try {
      const policyId = isNonEmptyString(req.query.policyId) ? req.query.policyId : undefined;
      const botId = isNonEmptyString(req.query.botId) ? req.query.botId : undefined;
      engine.resetCooldowns(policyId, botId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Policy CRUD ──────────────────────────────────────────────────────

  /** GET /api/fleet-monitor/healing/policies */
  router.get("/healing/policies", (_req, res) => {
    try {
      res.json({ ok: true, policies: engine.getPolicies() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/healing/policies — create a policy */
  router.post("/healing/policies", (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const error = validatePolicyBody(body);
      if (error) {
        res.status(400).json({ ok: false, error });
        return;
      }
      const policy = engine.addPolicy({
        name: body.name as string,
        description: body.description as string,
        enabled: body.enabled as boolean,
        trigger: body.trigger as HealingTrigger,
        actions: body.actions as RemediationAction[],
        escalation: body.escalation as EscalationConfig,
        cooldownMs: body.cooldownMs as number,
        maxAttemptsPerHour: body.maxAttemptsPerHour as number,
        scope: body.scope as HealingPolicyScope,
        priority: body.priority as number,
      });
      res.status(201).json({ ok: true, policy });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** PATCH /api/fleet-monitor/healing/policies/:id — partial update */
  router.patch("/healing/policies/:id", (req, res) => {
    try {
      const policyId = req.params.id;
      if (!engine.getPolicy(policyId)) {
        res.status(404).json({ ok: false, error: "Policy not found" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = {};

      if (body.name !== undefined) {
        if (!isNonEmptyString(body.name)) {
          res.status(400).json({ ok: false, error: "name must be a non-empty string" });
          return;
        }
        updates.name = body.name;
      }
      if (body.description !== undefined) {
        if (typeof body.description !== "string") {
          res.status(400).json({ ok: false, error: "description must be a string" });
          return;
        }
        updates.description = body.description;
      }
      if (body.enabled !== undefined) {
        if (typeof body.enabled !== "boolean") {
          res.status(400).json({ ok: false, error: "enabled must be a boolean" });
          return;
        }
        updates.enabled = body.enabled;
      }
      if (body.trigger !== undefined) {
        const err = validateTrigger(body.trigger);
        if (err) { res.status(400).json({ ok: false, error: err }); return; }
        updates.trigger = body.trigger;
      }
      if (body.actions !== undefined) {
        if (!Array.isArray(body.actions) || body.actions.length === 0
          || body.actions.some((a) => !VALID_ACTIONS.includes(a as RemediationAction))) {
          res.status(400).json({ ok: false, error: `actions must be a non-empty array of: ${VALID_ACTIONS.join(", ")}` });
          return;
        }
        updates.actions = body.actions;
      }
      if (body.escalation !== undefined) {
        const err = validateEscalation(body.escalation);
        if (err) { res.status(400).json({ ok: false, error: err }); return; }
        updates.escalation = body.escalation;
      }
      if (body.cooldownMs !== undefined) {
        if (!isNonNegativeNumber(body.cooldownMs)) {
          res.status(400).json({ ok: false, error: "cooldownMs must be a non-negative number" });
          return;
        }
        updates.cooldownMs = body.cooldownMs;
      }
      if (body.maxAttemptsPerHour !== undefined) {
        if (!isNonNegativeNumber(body.maxAttemptsPerHour) || (body.maxAttemptsPerHour as number) < 1) {
          res.status(400).json({ ok: false, error: "maxAttemptsPerHour must be a positive number" });
          return;
        }
        updates.maxAttemptsPerHour = body.maxAttemptsPerHour;
      }
      if (body.scope !== undefined) {
        const err = validateScope(body.scope);
        if (err) { res.status(400).json({ ok: false, error: err }); return; }
        updates.scope = body.scope;
      }
      if (body.priority !== undefined) {
        if (!isFiniteNumber(body.priority)) {
          res.status(400).json({ ok: false, error: "priority must be a finite number" });
          return;
        }
        updates.priority = body.priority;
      }

      engine.updatePolicy(policyId, updates);
      res.json({ ok: true, policy: engine.getPolicy(policyId) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/healing/policies/:id/enable — toggle enabled */
  router.post("/healing/policies/:id/enable", (req, res) => {
    try {
      const policyId = req.params.id;
      const { enabled } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof enabled !== "boolean") {
        res.status(400).json({ ok: false, error: "enabled must be a boolean" });
        return;
      }
      if (!engine.setPolicyEnabled(policyId, enabled)) {
        res.status(404).json({ ok: false, error: "Policy not found" });
        return;
      }
      res.json({ ok: true, policy: engine.getPolicy(policyId) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** DELETE /api/fleet-monitor/healing/policies/:id */
  router.delete("/healing/policies/:id", (req, res) => {
    try {
      if (!engine.removePolicy(req.params.id)) {
        res.status(404).json({ ok: false, error: "Policy not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
