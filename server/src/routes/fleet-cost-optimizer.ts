/**
 * Fleet Cost Optimizer API Routes
 *
 * Endpoints for fleet cost scanning, optimization findings,
 * policy management, model right-sizing, and savings tracking.
 */

import { Router } from "express";
import {
  getFleetCostOptimizerService,
  type FindingSeverity,
  type FindingStatus,
} from "../services/fleet-cost-optimizer.js";

// ─── Router ─────────────────────────────────────────────────────────────────

export function fleetCostOptimizerRoutes(): Router {
  const router = Router();

  // ─── Fleet Cost Scan ──────────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/cost-optimizer/scan/:companyId
   * Trigger a full fleet cost optimization scan.
   */
  router.post("/cost-optimizer/scan/:companyId", async (req, res) => {
    const { companyId } = req.params;

    if (!companyId) {
      res.status(400).json({ ok: false, error: "Missing companyId" });
      return;
    }

    try {
      const service = getFleetCostOptimizerService();
      const scan = await service.scanFleet(companyId);
      res.status(201).json({ ok: true, scan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Findings ─────────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/cost-optimizer/findings/:companyId
   * Get optimization findings for a company.
   * Query: ?status=open&severity=high&botId=xxx
   */
  router.get("/cost-optimizer/findings/:companyId", (req, res) => {
    const { companyId } = req.params;

    try {
      const service = getFleetCostOptimizerService();
      const filters: {
        status?: FindingStatus;
        severity?: FindingSeverity;
        botId?: string;
      } = {};

      if (req.query.status) {
        filters.status = req.query.status as FindingStatus;
      }
      if (req.query.severity) {
        filters.severity = req.query.severity as FindingSeverity;
      }
      if (req.query.botId) {
        filters.botId = req.query.botId as string;
      }

      const findings = service.getFindings(companyId, filters);
      res.json({ ok: true, findings, total: findings.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Execute Optimization ─────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/cost-optimizer/execute/:findingId
   * Execute an approved optimization.
   */
  router.post("/cost-optimizer/execute/:findingId", async (req, res) => {
    const { findingId } = req.params;

    if (!findingId) {
      res.status(400).json({ ok: false, error: "Missing findingId" });
      return;
    }

    try {
      const service = getFleetCostOptimizerService();

      const finding = service.getFinding(findingId);
      if (!finding) {
        res.status(404).json({ ok: false, error: "Finding not found" });
        return;
      }

      const result = await service.executeOptimization(findingId);
      const status = result.success ? 200 : 500;
      res.status(status).json({
        ok: result.success,
        finding: result.finding,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  // ─── Policies ─────────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/cost-optimizer/policies/:companyId
   * List optimization policies for a company.
   */
  router.get("/cost-optimizer/policies/:companyId", (req, res) => {
    const { companyId } = req.params;

    try {
      const service = getFleetCostOptimizerService();
      const policies = service.listPolicies(companyId);
      res.json({ ok: true, policies, total: policies.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/cost-optimizer/policies
   * Create a new optimization policy.
   * Body: { companyId, name, enabled, rules, schedule, budget }
   */
  router.post("/cost-optimizer/policies", (req, res) => {
    const { companyId, name, enabled, rules, schedule, budget } = req.body ?? {};

    if (!companyId || typeof companyId !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: companyId" });
      return;
    }

    if (!name || typeof name !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: name" });
      return;
    }

    if (!rules || !Array.isArray(rules)) {
      res.status(400).json({ ok: false, error: "Missing required field: rules (must be an array)" });
      return;
    }

    if (!schedule || typeof schedule !== "object") {
      res.status(400).json({ ok: false, error: "Missing required field: schedule" });
      return;
    }

    if (!budget || typeof budget !== "object") {
      res.status(400).json({ ok: false, error: "Missing required field: budget" });
      return;
    }

    try {
      const service = getFleetCostOptimizerService();
      const policy = service.createPolicy({
        companyId,
        name,
        enabled: enabled !== false,
        rules,
        schedule,
        budget,
      });
      res.status(201).json({ ok: true, policy });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * PATCH /api/fleet-monitor/cost-optimizer/policies/:policyId
   * Update an existing optimization policy.
   * Body: partial policy fields (name, enabled, rules, schedule, budget)
   */
  router.patch("/cost-optimizer/policies/:policyId", (req, res) => {
    const { policyId } = req.params;

    try {
      const service = getFleetCostOptimizerService();
      const updated = service.updatePolicy(policyId, req.body ?? {});

      if (!updated) {
        res.status(404).json({ ok: false, error: "Policy not found" });
        return;
      }

      res.json({ ok: true, policy: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Savings History ──────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/cost-optimizer/savings/:companyId
   * Get historical savings data.
   * Query: ?periodStart=2026-01-01&periodEnd=2026-03-31
   */
  router.get("/cost-optimizer/savings/:companyId", (req, res) => {
    const { companyId } = req.params;

    try {
      const service = getFleetCostOptimizerService();

      let period: { start: Date; end: Date } | undefined;
      if (req.query.periodStart && req.query.periodEnd) {
        const start = new Date(req.query.periodStart as string);
        const end = new Date(req.query.periodEnd as string);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          period = { start, end };
        }
      }

      const savings = service.getSavingsHistory(companyId, period);
      res.json({ ok: true, ...savings });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Fleet Cost Breakdown ─────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/cost-optimizer/breakdown/:companyId
   * Get per-bot cost breakdown with waste estimates.
   */
  router.get("/cost-optimizer/breakdown/:companyId", async (req, res) => {
    const { companyId } = req.params;

    try {
      const service = getFleetCostOptimizerService();
      const breakdown = await service.getFleetCostBreakdown(companyId);
      res.json({ ok: true, ...breakdown });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Model Right-Sizing Analysis ──────────────────────────────────────

  /**
   * GET /api/fleet-monitor/cost-optimizer/model-analysis/:companyId/:botId
   * Get deep model right-sizing analysis for a specific bot.
   * Query: ?days=30
   */
  router.get("/cost-optimizer/model-analysis/:companyId/:botId", async (req, res) => {
    const { companyId, botId } = req.params;
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

    if (isNaN(days) || days < 1 || days > 365) {
      res.status(400).json({ ok: false, error: "Invalid days parameter (must be 1-365)" });
      return;
    }

    try {
      const service = getFleetCostOptimizerService();
      const analysis = await service.analyzeModelUsage(companyId, botId, days);

      if (!analysis) {
        res.status(404).json({ ok: false, error: "Bot not found or no usage data available" });
        return;
      }

      res.json({ ok: true, analysis });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
