/**
 * Fleet Voice Intelligence API Routes
 *
 * Endpoints for voice call analytics, sentiment tracking, ASR quality, survey
 * insights, and anomaly detection. Backed by the rich VoiceIntelligenceEngine
 * (fleet-voice-intelligence.ts). Mounted under /api/fleet-monitor.
 */

import { Router } from "express";
import type {
  VoiceIntelligenceEngine,
  VoiceAnomalyType,
} from "../services/fleet-voice-intelligence.js";

const VALID_ANOMALY_TYPES = new Set<VoiceAnomalyType>([
  "excessive_silence",
  "abnormal_hangup",
  "asr_degradation",
  "unusual_call_duration",
  "high_interruption_rate",
  "survey_abandonment",
]);

export function fleetVoiceRoutes(engine: VoiceIntelligenceEngine): Router {
  const router = Router();

  // GET /voice/summary?companyId= — Fleet-wide voice analytics summary
  router.get("/voice/summary", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      res.json({ ok: true, summary: engine.getFleetSummary(companyId) });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /voice/active?companyId= — Currently in-progress calls across the fleet
  router.get("/voice/active", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      res.json({ ok: true, calls: engine.getActiveCalls(companyId) });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /voice/calls?botId=&limit= — Completed call metrics for a bot
  router.get("/voice/calls", (req, res) => {
    try {
      const botId = req.query.botId;
      if (typeof botId !== "string" || botId.length === 0) {
        return res.status(400).json({ ok: false, error: "botId query param is required" });
      }
      const parsedLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : 50;
      res.json({ ok: true, calls: engine.getCallsForBot(botId, limit) });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /voice/calls/:id — Single call detail with transcript and metrics
  router.get("/voice/calls/:id", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const call = engine.getCallMetrics(req.params.id);
      // Tenant guard: a call transcript belongs to its bot's company. Report 404
      // (not 403) for another tenant's call so its existence isn't leaked.
      if (!call || !engine.botBelongsToCompany(call.botId, companyId)) {
        return res.status(404).json({ ok: false, error: "Call not found" });
      }
      res.json({ ok: true, call });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /voice/anomalies?botId=&type=&limit= — Anomalous calls
  router.get("/voice/anomalies", (req, res) => {
    try {
      const botId = typeof req.query.botId === "string" ? req.query.botId : undefined;
      let type: VoiceAnomalyType | undefined;
      if (typeof req.query.type === "string") {
        if (!VALID_ANOMALY_TYPES.has(req.query.type as VoiceAnomalyType)) {
          return res.status(400).json({
            ok: false,
            error: `Invalid type. Must be one of: ${[...VALID_ANOMALY_TYPES].join(", ")}`,
          });
        }
        type = req.query.type as VoiceAnomalyType;
      }
      const parsedLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : 50;
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      res.json({ ok: true, anomalies: engine.getAnomalies({ botId, type, limit, companyId }) });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /voice/survey?botId=&companyId= — Survey completion analytics
  router.get("/voice/survey", (req, res) => {
    try {
      const botId = typeof req.query.botId === "string" ? req.query.botId : undefined;
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const analytics = engine.getSurveyAnalytics(botId, companyId);
      // questionDropoff is a Map — JSON.stringify serializes Maps to {}; convert
      // to a plain object so the dropoff data reaches the client (see Build #161).
      res.json({
        ok: true,
        survey: {
          ...analytics,
          questionDropoff: Object.fromEntries(analytics.questionDropoff),
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /voice/asr/:botId — ASR quality report for a bot
  router.get("/voice/asr/:botId", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      // Tenant guard: reject a cross-tenant caller with 404 so the bot's ASR
      // data (and its existence) isn't leaked.
      if (!engine.botBelongsToCompany(req.params.botId, companyId)) {
        return res.status(404).json({ ok: false, error: "No ASR samples for bot" });
      }
      const report = engine.getASRReport(req.params.botId);
      if (!report) {
        return res.status(404).json({ ok: false, error: "No ASR samples for bot" });
      }
      res.json({ ok: true, report });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
