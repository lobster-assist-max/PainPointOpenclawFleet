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
      // Floor the limit: getHistory() does slice(0, limit), so a malformed
      // ?limit=abc (NaN) would return zero rows and ?limit=-5 would drop the
      // 5 most-recent observations from the tail.
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const limit = Number.isFinite(rawLimit) ? Math.max(1, rawLimit) : 50;
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
      const body = req.body ?? {};

      // Validate config fields have correct types when provided
      if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      if (body.autoApply !== undefined && typeof body.autoApply !== "boolean") {
        return res.status(400).json({ error: "autoApply must be a boolean" });
      }
      if (body.explorationRate !== undefined && (typeof body.explorationRate !== "number" || body.explorationRate < 0 || body.explorationRate > 1)) {
        return res.status(400).json({ error: "explorationRate must be a number between 0 and 1" });
      }
      if (body.observationPeriodMs !== undefined && (typeof body.observationPeriodMs !== "number" || body.observationPeriodMs <= 0 || !Number.isFinite(body.observationPeriodMs))) {
        return res.status(400).json({ error: "observationPeriodMs must be a positive number" });
      }
      if (body.safetyGuardPeriodMs !== undefined && (typeof body.safetyGuardPeriodMs !== "number" || body.safetyGuardPeriodMs <= 0 || !Number.isFinite(body.safetyGuardPeriodMs))) {
        return res.status(400).json({ error: "safetyGuardPeriodMs must be a positive number" });
      }
      if (body.safetyThreshold !== undefined && (typeof body.safetyThreshold !== "number" || body.safetyThreshold < 0 || !Number.isFinite(body.safetyThreshold))) {
        return res.status(400).json({ error: "safetyThreshold must be a non-negative number" });
      }
      if (body.maxSuggestionsPerDay !== undefined && (typeof body.maxSuggestionsPerDay !== "number" || body.maxSuggestionsPerDay < 0 || !Number.isInteger(body.maxSuggestionsPerDay))) {
        return res.status(400).json({ error: "maxSuggestionsPerDay must be a non-negative integer" });
      }

      // Only pass known fields to prevent injecting unexpected properties
      const updates: Record<string, unknown> = {};
      for (const key of ["enabled", "autoApply", "explorationRate", "observationPeriodMs", "safetyGuardPeriodMs", "safetyThreshold", "maxSuggestionsPerDay"] as const) {
        if (body[key] !== undefined) updates[key] = body[key];
      }

      const config = engine.updateConfig(updates);
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
