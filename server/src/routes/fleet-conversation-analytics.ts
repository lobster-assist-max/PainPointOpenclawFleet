/**
 * Fleet Conversation Analytics API Routes
 *
 * Endpoints for conversation analysis, topic clustering, knowledge gap
 * detection, satisfaction trends, and resolution funnel reporting.
 */

import { Router } from "express";
import {
  getConversationAnalyticsEngine,
  type SatisfactionGranularity,
} from "../services/fleet-conversation-analytics.js";

export function fleetConversationAnalyticsRoutes() {
  const router = Router();

  /**
   * POST /analyze/:botId
   * Trigger a batch analysis of conversations for a specific bot.
   *
   * Body: { companyId: string, since?: string, limit?: number }
   */
  router.post("/analyze/:botId", async (req, res) => {
    try {
      const { botId } = req.params;
      const { companyId, since, limit } = req.body ?? {};

      if (!companyId) {
        res.status(400).json({ ok: false, error: "Missing companyId in request body" });
        return;
      }

      const engine = getConversationAnalyticsEngine();
      const analyses = await engine.analyzeBatch(
        botId,
        companyId,
        since,
        typeof limit === "number" ? limit : undefined,
      );

      res.json({
        ok: true,
        data: {
          botId,
          companyId,
          sessionsAnalyzed: analyses.length,
          analyses,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /topics/:companyId
   * Get topic clusters for a company.
   *
   * Query: ?periodStart=ISO&periodEnd=ISO
   */
  router.get("/topics/:companyId", (req, res) => {
    try {
      const { companyId } = req.params;
      const periodStart = req.query.periodStart as string | undefined;
      const periodEnd = req.query.periodEnd as string | undefined;

      const period = periodStart && periodEnd
        ? { periodStart, periodEnd }
        : undefined;

      const engine = getConversationAnalyticsEngine();
      const clusters = engine.getTopicClusters(companyId, period);

      res.json({ ok: true, data: clusters });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /gaps/:companyId
   * Get knowledge gap report for a company.
   */
  router.get("/gaps/:companyId", (req, res) => {
    try {
      const { companyId } = req.params;

      const engine = getConversationAnalyticsEngine();
      const report = engine.generateKnowledgeGapReport(companyId);

      res.json({ ok: true, data: report });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /satisfaction/:companyId
   * Get satisfaction trend for a company.
   *
   * Query: ?granularity=hour|day|week&periodStart=ISO&periodEnd=ISO
   */
  router.get("/satisfaction/:companyId", (req, res) => {
    try {
      const { companyId } = req.params;
      const granularity = (req.query.granularity as string) || "day";
      const periodStart = req.query.periodStart as string | undefined;
      const periodEnd = req.query.periodEnd as string | undefined;

      if (!periodStart || !periodEnd) {
        res.status(400).json({ ok: false, error: "Missing periodStart or periodEnd query parameters" });
        return;
      }

      const validGranularities: SatisfactionGranularity[] = ["hour", "day", "week"];
      if (!validGranularities.includes(granularity as SatisfactionGranularity)) {
        res.status(400).json({ ok: false, error: `Invalid granularity. Must be one of: ${validGranularities.join(", ")}` });
        return;
      }

      const engine = getConversationAnalyticsEngine();
      const trend = engine.getSatisfactionTrend(
        companyId,
        granularity as SatisfactionGranularity,
        { periodStart, periodEnd },
      );

      res.json({ ok: true, data: trend });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /funnel/:companyId
   * Get resolution funnel for a company.
   */
  router.get("/funnel/:companyId", (req, res) => {
    try {
      const { companyId } = req.params;

      const engine = getConversationAnalyticsEngine();
      const funnel = engine.getResolutionFunnel(companyId);

      res.json({ ok: true, data: funnel });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /inconsistencies/:companyId
   * Find cross-bot inconsistencies for a company.
   */
  router.get("/inconsistencies/:companyId", (req, res) => {
    try {
      const { companyId } = req.params;

      const engine = getConversationAnalyticsEngine();
      const inconsistencies = engine.findInconsistencies(companyId);

      res.json({ ok: true, data: inconsistencies });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /training-data/:gapId
   * Generate training data (MEMORY.md entry) for a knowledge gap.
   */
  router.post("/training-data/:gapId", (req, res) => {
    try {
      const { gapId } = req.params;

      const engine = getConversationAnalyticsEngine();
      const entry = engine.generateTrainingData(gapId);

      if (!entry) {
        res.status(404).json({ ok: false, error: "Knowledge gap not found" });
        return;
      }

      res.json({ ok: true, data: entry });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
