/**
 * Fleet Voice Intelligence API Routes
 *
 * Endpoints for voice call analytics, sentiment tracking, and survey insights.
 */

import { Router } from "express";
import type { VoiceIntelligenceEngine } from "../services/fleet-voice.js";

export function fleetVoiceRoutes(engine: VoiceIntelligenceEngine): Router {
  const router = Router();

  // GET /api/fleet-monitor/voice/calls — List voice calls
  router.get("/voice/calls", (req, res) => {
    try {
      const botId = req.query.botId as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const calls = engine.listCalls({ botId, status, limit, offset });
      res.json({ calls });
    } catch (err) {
      res.status(500).json({ error: "Failed to list voice calls", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/voice/calls/:id — Single call detail with transcript and metrics
  router.get("/voice/calls/:id", (req, res) => {
    try {
      const call = engine.getCall(req.params.id);
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      res.json(call);
    } catch (err) {
      res.status(500).json({ error: "Failed to get call", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/voice/calls/:id/sentiment — Sentiment trajectory for a call
  router.get("/voice/calls/:id/sentiment", (req, res) => {
    try {
      const sentiment = engine.getCallSentiment(req.params.id);
      if (!sentiment) {
        return res.status(404).json({ error: "Call not found" });
      }
      res.json(sentiment);
    } catch (err) {
      res.status(500).json({ error: "Failed to get sentiment", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/voice/analytics — Fleet-wide voice analytics summary
  router.get("/voice/analytics", (_req, res) => {
    try {
      const analytics = engine.getAnalytics();
      res.json(analytics);
    } catch (err) {
      res.status(500).json({ error: "Failed to get voice analytics", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/voice/quality — Voice quality trends over time
  router.get("/voice/quality", (_req, res) => {
    try {
      const quality = engine.getQualityTrends();
      res.json(quality);
    } catch (err) {
      res.status(500).json({ error: "Failed to get quality trends", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/voice/survey/funnel — Survey completion funnel
  router.get("/voice/survey/funnel", (_req, res) => {
    try {
      const funnel = engine.getSurveyFunnel();
      res.json(funnel);
    } catch (err) {
      res.status(500).json({ error: "Failed to get survey funnel", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/voice/survey/questions — Per-question analytics
  router.get("/voice/survey/questions", (_req, res) => {
    try {
      const questions = engine.getSurveyQuestions();
      res.json(questions);
    } catch (err) {
      res.status(500).json({ error: "Failed to get survey questions", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/voice/anomalies — Anomalous calls list
  router.get("/voice/anomalies", (_req, res) => {
    try {
      const anomalies = engine.getAnomalies();
      res.json(anomalies);
    } catch (err) {
      res.status(500).json({ error: "Failed to get anomalies", details: String(err) });
    }
  });

  return router;
}
