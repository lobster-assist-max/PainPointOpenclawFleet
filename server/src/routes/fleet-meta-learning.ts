/**
 * Fleet Meta-Learning API Routes
 *
 * Endpoints for the adaptive meta-learning engine that observes
 * fleet engine parameters and suggests optimizations.
 */

import { Router } from "express";
import type { MetaLearningEngine, SuggestionStatus } from "../services/fleet-meta-learning.js";

export function fleetMetaLearningRoutes(engine: MetaLearningEngine): Router {
  const router = Router();

  // GET /api/fleet-monitor/meta/observables — List all observable parameters
  router.get("/meta/observables", (_req, res) => {
    try {
      const observables = engine.getObservables();
      res.json({ observables });
    } catch (err) {
      res.status(500).json({ error: "Failed to list observables", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/meta/suggestions — List suggestions
  router.get("/meta/suggestions", (req, res) => {
    try {
      const status = req.query.status as SuggestionStatus | undefined;
      const suggestions = engine.getSuggestions(status);
      res.json({ suggestions });
    } catch (err) {
      res.status(500).json({ error: "Failed to list suggestions", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/meta/suggestions/:id/apply — Apply a suggestion
  router.post("/meta/suggestions/:id/apply", (req, res) => {
    try {
      const success = engine.applySuggestion(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Suggestion not found or not in pending state" });
      }
      res.json({ success: true, message: "Suggestion applied with safety guard active" });
    } catch (err) {
      res.status(500).json({ error: "Failed to apply suggestion", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/meta/suggestions/:id/reject — Reject a suggestion
  router.post("/meta/suggestions/:id/reject", (req, res) => {
    try {
      const success = engine.rejectSuggestion(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Suggestion not found or not in pending state" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to reject suggestion", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/meta/history — Learning history
  router.get("/meta/history", (req, res) => {
    try {
      const engine_param = req.query.engine as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const history = engine.getHistory({ engine: engine_param, limit });
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: "Failed to get history", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/meta/sensitivity — Parameter sensitivity analysis
  router.get("/meta/sensitivity", (_req, res) => {
    try {
      const analysis = engine.getSensitivityAnalysis();
      res.json({ analysis });
    } catch (err) {
      res.status(500).json({ error: "Failed to get sensitivity", details: String(err) });
    }
  });

  // PUT /api/fleet-monitor/meta/config — Update meta-learning config
  router.put("/meta/config", (req, res) => {
    try {
      const config = engine.updateConfig(req.body);
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: "Failed to update config", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/meta/stats — Meta-learning statistics
  router.get("/meta/stats", (_req, res) => {
    try {
      const stats = engine.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to get stats", details: String(err) });
    }
  });

  return router;
}
