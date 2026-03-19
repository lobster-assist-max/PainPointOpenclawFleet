/**
 * Fleet Anomaly Correlation API Routes
 *
 * Endpoints for cross-bot anomaly correlation and root cause analysis.
 */

import { Router } from "express";
import type { AnomalyCorrelationEngine, CorrelationStatus } from "../services/fleet-anomaly-correlation.js";

export function fleetAnomalyCorrelationRoutes(engine: AnomalyCorrelationEngine): Router {
  const router = Router();

  // GET /api/fleet-monitor/correlations — List active correlations
  router.get("/correlations", (req, res) => {
    try {
      const status = req.query.status as CorrelationStatus | undefined;
      const correlations = engine.listCorrelations(status);
      res.json({ correlations });
    } catch (err) {
      res.status(500).json({ error: "Failed to list correlations", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/correlations/stats — Correlation statistics
  router.get("/correlations/stats", (_req, res) => {
    try {
      const stats = engine.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to get stats", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/correlations/:id — Correlation details
  router.get("/correlations/:id", (req, res) => {
    try {
      const correlation = engine.getCorrelation(req.params.id);
      if (!correlation) {
        return res.status(404).json({ error: "Correlation not found" });
      }
      res.json(correlation);
    } catch (err) {
      res.status(500).json({ error: "Failed to get correlation", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/correlations/:id/resolve — Mark as resolved
  router.post("/correlations/:id/resolve", (req, res) => {
    try {
      const resolvedBy = req.body?.resolvedBy as string | undefined;
      const success = engine.resolveCorrelation(req.params.id, resolvedBy);
      if (!success) {
        return res.status(404).json({ error: "Correlation not found or already resolved" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/correlations/:id/false-positive — Mark as false positive
  router.post("/correlations/:id/false-positive", (req, res) => {
    try {
      const success = engine.markFalsePositive(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Correlation not found" });
      }
      res.json({ success: true, message: "Marked as false positive. Pattern recorded for future learning." });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark false positive", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/topology — Infrastructure topology
  router.get("/topology", (_req, res) => {
    try {
      const topology = engine.getTopology();
      res.json(topology);
    } catch (err) {
      res.status(500).json({ error: "Failed to get topology", details: String(err) });
    }
  });

  // PUT /api/fleet-monitor/topology — Update topology (manual override)
  router.put("/topology", (req, res) => {
    try {
      engine.updateTopology(req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update topology", details: String(err) });
    }
  });

  return router;
}
