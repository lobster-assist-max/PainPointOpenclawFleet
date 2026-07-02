/**
 * Fleet Alert API Routes
 *
 * Endpoints for querying and managing fleet alerts.
 */

import { Router } from "express";
import { inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { getFleetAlertService, type Alert, type AlertState } from "../services/fleet-alerts.js";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

/** Client-facing alert shape (mirrors ui/src/api/fleet-monitor.ts `FleetAlert`). */
interface FleetAlertDTO {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: string;
  /** UI state vocabulary — the engine's "active" maps to "firing". */
  state: "firing" | "acknowledged" | "resolved";
  botId: string;
  botName: string;
  botEmoji: string;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
}

/** Engine state → UI state vocabulary. */
function toClientState(state: AlertState): FleetAlertDTO["state"] {
  return state === "active" ? "firing" : state;
}

const toIso = (ms: number | null): string | null =>
  ms == null ? null : new Date(ms).toISOString();

export function fleetAlertRoutes(db?: Db) {
  const router = Router();

  /**
   * Resolve botId → { name, emoji } for the given alerts, mirroring the
   * /fleet-monitor/status enrichment (emoji lives in metadata.emoji; `icon` is
   * a lucide-name key, only used as an emoji fallback for legacy records).
   * Disconnected bots (no live agentId mapping) fall back to botId / "".
   */
  async function buildBotInfoMap(
    alerts: Alert[],
  ): Promise<Map<string, { name: string; emoji: string }>> {
    const result = new Map<string, { name: string; emoji: string }>();
    const monitor = getFleetMonitorService();

    // botId → agentId via the live monitor registry.
    const botToAgent = new Map<string, string>();
    for (const alert of alerts) {
      if (botToAgent.has(alert.botId)) continue;
      const info = monitor.getBotInfo(alert.botId);
      if (info?.agentId) botToAgent.set(alert.botId, info.agentId);
    }

    if (db && botToAgent.size > 0) {
      try {
        const agentIds = [...new Set(botToAgent.values())];
        const rows = await db
          .select({
            id: agentsTable.id,
            name: agentsTable.name,
            icon: agentsTable.icon,
            metadata: agentsTable.metadata,
          })
          .from(agentsTable)
          .where(inArray(agentsTable.id, agentIds));

        const agentInfo = new Map<string, { name: string; emoji: string }>();
        for (const a of rows) {
          const meta = (a.metadata as Record<string, unknown> | null) ?? {};
          const metaEmoji = typeof meta.emoji === "string" ? meta.emoji : "";
          const iconIsEmoji =
            a.icon != null && a.icon !== "" && !/^[a-z0-9-]+$/i.test(a.icon);
          agentInfo.set(a.id, {
            name: a.name,
            emoji: metaEmoji || (iconIsEmoji ? a.icon! : ""),
          });
        }

        for (const [botId, agentId] of botToAgent) {
          const info = agentInfo.get(agentId);
          if (info) result.set(botId, info);
        }
      } catch (err) {
        console.warn(
          "[fleet] alert bot enrichment failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return result;
  }

  /**
   * GET /api/fleet-alerts
   * List alerts for a company. Returns FleetAlert[] (the client contract).
   * Query: ?companyId=xxx&state=firing|acknowledged|resolved&limit=50
   *
   * Scoping: without companyId every tenant's alerts were returned — the Alerts
   * page, Sidebar badge, and FleetDashboard all render whatever this endpoint
   * gives them. The UI always sends ?companyId=; unscoped falls back to the
   * whole fleet only for legacy/admin callers.
   */
  router.get("/", async (req, res) => {
    try {
      const service = getFleetAlertService();
      const companyId =
        typeof req.query.companyId === "string" && req.query.companyId
          ? req.query.companyId
          : undefined;
      const stateFilter =
        typeof req.query.state === "string" ? (req.query.state as string) : undefined;

      // Floor at 1 — a negative limit reaches slice(0, limit) and drops alerts.
      const parsedLimit = parseInt(req.query.limit as string, 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200;

      // Pull the full (tenant-scoped) set, then filter by the requested UI state.
      let alerts = service.getAllAlerts(limit, companyId);
      if (stateFilter === "firing" || stateFilter === "acknowledged" || stateFilter === "resolved") {
        const internal = stateFilter === "firing" ? "active" : stateFilter;
        alerts = alerts.filter((a) => a.state === internal);
      }

      const botInfo = await buildBotInfoMap(alerts);
      const mapped: FleetAlertDTO[] = alerts.map((a) => {
        const info = botInfo.get(a.botId);
        return {
          id: a.id,
          ruleId: a.ruleId,
          ruleName: a.ruleName,
          severity: a.severity,
          state: toClientState(a.state),
          botId: a.botId,
          botName: info?.name ?? a.botId,
          botEmoji: info?.emoji ?? "",
          message: a.message,
          firedAt: new Date(a.firedAt).toISOString(),
          resolvedAt: toIso(a.resolvedAt),
          acknowledgedAt: toIso(a.acknowledgedAt),
        };
      });

      res.json(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-alerts/counts
   * Active alert counts by severity (for a sidebar badge), tenant-scoped.
   */
  router.get("/counts", (req, res) => {
    const service = getFleetAlertService();
    const companyId =
      typeof req.query.companyId === "string" && req.query.companyId
        ? req.query.companyId
        : undefined;
    res.json({ ok: true, ...service.getAlertCounts(companyId) });
  });

  /**
   * POST /api/fleet-alerts/:alertId/acknowledge
   * Acknowledge an alert.
   * Body: { acknowledgedBy: string }
   */
  router.post("/:alertId/acknowledge", (req, res) => {
    const service = getFleetAlertService();
    const { acknowledgedBy } = req.body ?? {};
    // Tenant guard: the alert id is in the path, so ownership rides as ?companyId=.
    // A cross-tenant acknowledge is rejected as 404 (the service returns false).
    const companyId =
      typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const ok = service.acknowledgeAlert(req.params.alertId, acknowledgedBy ?? "unknown", companyId);
    if (!ok) {
      res.status(404).json({ ok: false, error: "Alert not found or already resolved" });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/fleet-alerts/:alertId/resolve
   * Manually resolve an alert.
   */
  router.post("/:alertId/resolve", (req, res) => {
    const service = getFleetAlertService();
    // Tenant guard: cross-tenant resolve rejected as 404 (service returns false).
    const companyId =
      typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const ok = service.resolveAlert(req.params.alertId, companyId);
    if (!ok) {
      res.status(404).json({ ok: false, error: "Alert not found or already resolved" });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * GET /api/fleet-alerts/rules
   * List all alert rules.
   */
  router.get("/rules", (_req, res) => {
    const service = getFleetAlertService();
    res.json({ ok: true, rules: service.getRules() });
  });

  /**
   * PUT /api/fleet-alerts/rules/:ruleId
   * Update an alert rule.
   */
  router.put("/rules/:ruleId", (req, res) => {
    const service = getFleetAlertService();
    const body = req.body ?? {};

    if (body.name !== undefined && typeof body.name !== "string") {
      res.status(400).json({ ok: false, error: "Invalid field: name (must be a string)" });
      return;
    }
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      res.status(400).json({ ok: false, error: "Invalid field: enabled (must be a boolean)" });
      return;
    }
    if (body.cooldownMs !== undefined && (typeof body.cooldownMs !== "number" || body.cooldownMs < 0)) {
      res.status(400).json({ ok: false, error: "Invalid field: cooldownMs (must be a non-negative number)" });
      return;
    }

    const ok = service.updateRule(req.params.ruleId, body);
    if (!ok) {
      res.status(404).json({ ok: false, error: "Rule not found" });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/fleet-alerts/rules
   * Add a new custom alert rule.
   */
  router.post("/rules", (req, res) => {
    const service = getFleetAlertService();
    const body = req.body ?? {};

    if (!body.name || typeof body.name !== "string") {
      res.status(400).json({ ok: false, error: "Missing or invalid field: name (must be a string)" });
      return;
    }
    if (typeof body.enabled !== "boolean") {
      res.status(400).json({ ok: false, error: "Missing or invalid field: enabled (must be a boolean)" });
      return;
    }
    if (!body.condition || typeof body.condition !== "object" || Array.isArray(body.condition)) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: condition (must be an object)" });
      return;
    }
    if (!body.scope || typeof body.scope !== "object" || Array.isArray(body.scope)) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: scope (must be an object)" });
      return;
    }
    const VALID_SCOPE_TYPES = ["fleet", "bot"];
    if (!VALID_SCOPE_TYPES.includes(body.scope.type)) {
      res.status(400).json({ ok: false, error: `Invalid scope.type (must be one of: ${VALID_SCOPE_TYPES.join(", ")})` });
      return;
    }
    if (!Array.isArray(body.actions)) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: actions (must be an array)" });
      return;
    }
    if (typeof body.cooldownMs !== "number" || body.cooldownMs < 0) {
      res.status(400).json({ ok: false, error: "Missing or invalid field: cooldownMs (must be a non-negative number)" });
      return;
    }

    const rule = service.addRule(body);
    res.status(201).json({ ok: true, rule });
  });

  /**
   * DELETE /api/fleet-alerts/rules/:ruleId
   * Remove an alert rule.
   */
  router.delete("/rules/:ruleId", (req, res) => {
    const service = getFleetAlertService();
    const ok = service.removeRule(req.params.ruleId);
    if (!ok) {
      res.status(404).json({ ok: false, error: "Rule not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
