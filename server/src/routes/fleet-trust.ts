/**
 * Fleet Trust Graduation API Routes
 *
 * Endpoints for managing bot trust levels, evaluating promotions,
 * and viewing fleet-wide trust distribution.
 *
 * @see Planning #20
 */

import { Router } from "express";
import { getTrustGraduationEngine, type TrustLevel } from "../services/fleet-trust-graduation.js";

export function fleetTrustRoutes(): Router {
  const router = Router();

  /**
   * GET /api/fleet-monitor/trust/distribution
   * Get fleet-wide trust level distribution.
   */
  router.get("/trust/distribution", (req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      const distribution = engine.getFleetTrustDistribution();
      res.json({ ok: true, distribution });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/trust/profiles
   * List all bot trust profiles.
   */
  router.get("/trust/profiles", (_req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      const profiles = engine.getAllProfiles();
      res.json({ ok: true, profiles });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/trust/:botId
   * Get trust profile for a specific bot.
   */
  router.get("/trust/:botId", (req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      const profile = engine.getProfile(req.params.botId);
      res.json({ ok: true, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/trust/:botId/evaluate
   * Evaluate whether a bot is eligible for promotion.
   */
  router.get("/trust/:botId/evaluate", (req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      const evaluation = engine.evaluate(req.params.botId);
      res.json({ ok: true, evaluation });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/trust/:botId/promote
   * Promote a bot to the next trust level.
   */
  router.post("/trust/:botId/promote", (req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      const profile = engine.promote(req.params.botId, req.body.approvedBy);
      res.json({ ok: true, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/trust/:botId/demote
   * Demote a bot one trust level.
   */
  router.post("/trust/:botId/demote", (req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      const reason = req.body.reason ?? "Manual demotion";
      const profile = engine.demote(req.params.botId, reason);
      res.json({ ok: true, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/trust/:botId/metrics
   * Record daily metrics for a bot (updates streaks and trust evaluation).
   */
  router.post("/trust/:botId/metrics", (req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      engine.recordDailyMetrics(req.params.botId, req.body);
      const profile = engine.getProfile(req.params.botId);
      res.json({ ok: true, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/trust/permissions/:level
   * Get the permission set for a trust level.
   */
  router.get("/trust/permissions/:level", (req, res) => {
    try {
      const engine = getTrustGraduationEngine();
      const level = parseInt(req.params.level, 10);
      if (level < 0 || level > 4) {
        res.status(400).json({ ok: false, error: "Trust level must be 0-4" });
        return;
      }
      const permissions = engine.getPermissions(level as TrustLevel);
      res.json({ ok: true, level, permissions });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
