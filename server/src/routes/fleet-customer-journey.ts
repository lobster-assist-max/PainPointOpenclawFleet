/**
 * Fleet Customer Journey API Routes
 *
 * Endpoints for tracking and analyzing customer journeys across bots.
 */

import { Router } from "express";
import type { CustomerJourneyEngine, JourneySearchParams, JourneyStage } from "../services/fleet-customer-journey.js";

const VALID_STAGES: JourneyStage[] = ["awareness", "consideration", "decision", "purchase", "retention", "churned"];

export function fleetCustomerJourneyRoutes(engine: CustomerJourneyEngine): Router {
  const router = Router();

  // GET /api/fleet-monitor/journeys — List all customer journeys
  router.get("/journeys", (req, res) => {
    try {
      // Floor pagination so a malformed/negative ?limit or ?offset can't make
      // listJourneys() slice(offset, offset + NaN) return zero rows (or drop the
      // tail on a negative limit).
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const rawOffset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const limit = Number.isFinite(rawLimit) ? Math.max(1, rawLimit) : 50;
      const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

      const stage = req.query.stage as JourneyStage | undefined;
      if (stage !== undefined && !VALID_STAGES.includes(stage)) {
        return res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(", ")}` });
      }

      const params: JourneySearchParams = {
        stage,
        botId: req.query.botId as string | undefined,
        channel: req.query.channel as string | undefined,
        atRiskOnly: req.query.atRiskOnly === "true",
        limit,
        offset,
      };

      // An Invalid Date silently filters out every journey (lastSeen >= NaN is
      // always false), so reject malformed date strings up front.
      if (req.query.dateFrom) {
        const dateFrom = new Date(req.query.dateFrom as string);
        if (isNaN(dateFrom.getTime())) {
          return res.status(400).json({ error: "dateFrom must be a valid date" });
        }
        params.dateFrom = dateFrom;
      }
      if (req.query.dateTo) {
        const dateTo = new Date(req.query.dateTo as string);
        if (isNaN(dateTo.getTime())) {
          return res.status(400).json({ error: "dateTo must be a valid date" });
        }
        params.dateTo = dateTo;
      }
      if (req.query.minTouchpoints) {
        const minTouchpoints = parseInt(req.query.minTouchpoints as string, 10);
        if (!Number.isFinite(minTouchpoints) || minTouchpoints < 0) {
          return res.status(400).json({ error: "minTouchpoints must be a non-negative number" });
        }
        params.minTouchpoints = minTouchpoints;
      }

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
      const body = req.body ?? {};

      // Validate optional typed fields
      if (body.stage !== undefined && !VALID_STAGES.includes(body.stage)) {
        res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(", ")}` });
        return;
      }
      if (body.botId !== undefined && typeof body.botId !== "string") {
        res.status(400).json({ error: "botId must be a string" });
        return;
      }
      if (body.channel !== undefined && typeof body.channel !== "string") {
        res.status(400).json({ error: "channel must be a string" });
        return;
      }
      if (body.limit !== undefined && (typeof body.limit !== "number" || body.limit < 1)) {
        res.status(400).json({ error: "limit must be a positive number" });
        return;
      }
      if (body.offset !== undefined && (typeof body.offset !== "number" || body.offset < 0)) {
        res.status(400).json({ error: "offset must be a non-negative number" });
        return;
      }

      const params: JourneySearchParams = {
        stage: body.stage,
        botId: body.botId,
        channel: body.channel,
        atRiskOnly: body.atRiskOnly === true,
        limit: body.limit ?? 50,
        offset: body.offset ?? 0,
      };

      if (body.dateFrom) params.dateFrom = new Date(body.dateFrom);
      if (body.dateTo) params.dateTo = new Date(body.dateTo);
      if (typeof body.minTouchpoints === "number") params.minTouchpoints = body.minTouchpoints;

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
