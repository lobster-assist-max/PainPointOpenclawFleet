/**
 * Fleet Customer Journey API Routes
 *
 * Endpoints for tracking and analyzing customer journeys across bots.
 */

import { Router } from "express";
import type { CustomerJourneyEngine, JourneySearchParams, JourneyStage } from "../services/fleet-customer-journey.js";

export function fleetCustomerJourneyRoutes(engine: CustomerJourneyEngine): Router {
  const router = Router();

  // GET /api/fleet-monitor/journeys — List all customer journeys
  router.get("/journeys", (req, res) => {
    try {
      const params: JourneySearchParams = {
        stage: req.query.stage as JourneyStage | undefined,
        botId: req.query.botId as string | undefined,
        channel: req.query.channel as string | undefined,
        atRiskOnly: req.query.atRiskOnly === "true",
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      if (req.query.dateFrom) params.dateFrom = new Date(req.query.dateFrom as string);
      if (req.query.dateTo) params.dateTo = new Date(req.query.dateTo as string);
      if (req.query.minTouchpoints) params.minTouchpoints = parseInt(req.query.minTouchpoints as string, 10);

      const journeys = engine.listJourneys(params);
      const stats = engine.getStats();

      res.json({ journeys, stats });
    } catch (err) {
      res.status(500).json({ error: "Failed to list journeys", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/journeys/analytics — Journey analytics
  router.get("/journeys/analytics", (_req, res) => {
    try {
      const analytics = engine.getAnalytics();
      res.json(analytics);
    } catch (err) {
      res.status(500).json({ error: "Failed to get analytics", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/journeys/funnel — Conversion funnel
  router.get("/journeys/funnel", (_req, res) => {
    try {
      const funnel = engine.getFunnel();
      res.json(funnel);
    } catch (err) {
      res.status(500).json({ error: "Failed to get funnel", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/journeys/search — Search journeys
  router.post("/journeys/search", (req, res) => {
    try {
      const params = req.body as JourneySearchParams;
      const journeys = engine.listJourneys(params);
      res.json({ journeys, total: journeys.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to search journeys", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/journeys/:customerId — Single customer journey
  router.get("/journeys/:customerId", (req, res) => {
    try {
      const journey = engine.getJourney(req.params.customerId);
      if (!journey) {
        return res.status(404).json({ error: "Journey not found" });
      }
      res.json(journey);
    } catch (err) {
      res.status(500).json({ error: "Failed to get journey", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/journeys/:customerId/predict — Predict next action
  router.get("/journeys/:customerId/predict", (req, res) => {
    try {
      const prediction = engine.predictNextAction(req.params.customerId);
      if (!prediction) {
        return res.status(404).json({ error: "Journey not found" });
      }
      res.json(prediction);
    } catch (err) {
      res.status(500).json({ error: "Failed to predict", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/journeys/merge — Merge two customer identities
  router.post("/journeys/merge", (req, res) => {
    try {
      const { customerId1, customerId2 } = req.body;
      if (!customerId1 || !customerId2) {
        return res.status(400).json({ error: "Both customerId1 and customerId2 are required" });
      }
      const merged = engine.mergeCustomers(customerId1, customerId2);
      if (!merged) {
        return res.status(404).json({ error: "One or both journeys not found" });
      }
      res.json(merged);
    } catch (err) {
      res.status(500).json({ error: "Failed to merge", details: String(err) });
    }
  });

  return router;
}
