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

      if (typeof companyId !== "string" || companyId.trim().length === 0) {
        res.status(400).json({ ok: false, error: "Missing or invalid companyId (must be a non-empty string)" });
        return;
      }

      if (since !== undefined && typeof since !== "string") {
        res.status(400).json({ ok: false, error: "since must be an ISO date string" });
        return;
      }

      if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1)) {
        res.status(400).json({ ok: false, error: "limit must be a positive number" });
        return;
      }

      // Tenant-ownership guard: analyzeBatch fetches the bot's private chat
      // transcripts over the gateway RPC and caches the derived topics/sentiment
      // under `companyId`. Without this check a caller could pass its own
      // companyId + ANOTHER tenant's botId and read that tenant's conversations
      // into its analytics (cross-tenant leak, same class as #195/#197). Reject
      // when the bot is connected but owned by a different company. Report 404
      // (not 403) so we don't leak the existence of another tenant's bot.
      const { getFleetMonitorService } = await import(
        "../services/fleet-monitor.js"
      );
      const botInfo = getFleetMonitorService().getBotInfo(botId);
      if (botInfo && botInfo.companyId !== companyId) {
        res.status(404).json({ ok: false, error: "Bot not found" });
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

      // A malformed date flows into the engine's `new Date(periodStart).getTime()`
      // filter as NaN, where every comparison is false — silently returning an empty
      // cluster set with HTTP 200 instead of signalling bad input.
      if (periodStart !== undefined && Number.isNaN(new Date(periodStart).getTime())) {
        res.status(400).json({ ok: false, error: "periodStart must be a valid date" });
        return;
      }
      if (periodEnd !== undefined && Number.isNaN(new Date(periodEnd).getTime())) {
        res.status(400).json({ ok: false, error: "periodEnd must be a valid date" });
        return;
      }

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

      // A malformed date makes the engine's bucket loop `start.getTime()` (NaN), so
      // `while (NaN < end)` never iterates — silently returning an empty trend with
      // HTTP 200 instead of signalling bad input.
      if (Number.isNaN(new Date(periodStart).getTime())) {
        res.status(400).json({ ok: false, error: "periodStart must be a valid date" });
        return;
      }
      if (Number.isNaN(new Date(periodEnd).getTime())) {
        res.status(400).json({ ok: false, error: "periodEnd must be a valid date" });
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
