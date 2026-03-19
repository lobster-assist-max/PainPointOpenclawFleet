/**
 * Fleet Sandbox Environment API Routes
 *
 * Endpoints for creating, managing, and promoting sandbox environments.
 */

import { Router } from "express";
import type { FleetSandboxEngine, CreateSandboxRequest } from "../services/fleet-sandbox.js";

export function fleetSandboxRoutes(engine: FleetSandboxEngine): Router {
  const router = Router();

  // POST /api/fleet-monitor/sandbox — Create a new sandbox
  router.post("/sandbox", (req, res) => {
    try {
      const request = req.body as CreateSandboxRequest;
      if (!request.name || !request.fleetId || !request.trafficSource) {
        return res.status(400).json({ error: "name, fleetId, and trafficSource are required" });
      }
      const sandbox = engine.createSandbox(request);
      res.status(201).json(sandbox);
    } catch (err) {
      res.status(500).json({ error: "Failed to create sandbox", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/sandbox — List all sandboxes
  router.get("/sandbox", (req, res) => {
    try {
      const includeDestroyed = req.query.includeDestroyed === "true";
      const sandboxes = engine.listSandboxes(includeDestroyed);
      res.json({ sandboxes });
    } catch (err) {
      res.status(500).json({ error: "Failed to list sandboxes", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/sandbox/:id — Sandbox details
  router.get("/sandbox/:id", (req, res) => {
    try {
      const sandbox = engine.getSandbox(req.params.id);
      if (!sandbox) {
        return res.status(404).json({ error: "Sandbox not found" });
      }
      res.json(sandbox);
    } catch (err) {
      res.status(500).json({ error: "Failed to get sandbox", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/sandbox/:id/start — Start sandbox
  router.post("/sandbox/:id/start", (req, res) => {
    try {
      const success = engine.startSandbox(req.params.id);
      if (!success) {
        return res.status(400).json({ error: "Cannot start sandbox (not in ready/paused state)" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to start sandbox", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/sandbox/:id/pause — Pause sandbox
  router.post("/sandbox/:id/pause", (req, res) => {
    try {
      const success = engine.pauseSandbox(req.params.id);
      if (!success) {
        return res.status(400).json({ error: "Cannot pause sandbox (not running)" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to pause sandbox", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/sandbox/:id/destroy — Destroy sandbox
  router.post("/sandbox/:id/destroy", (req, res) => {
    try {
      const success = engine.destroySandbox(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Sandbox not found" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to destroy sandbox", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/sandbox/:id/comparison — Sandbox vs Production comparison
  router.get("/sandbox/:id/comparison", (req, res) => {
    try {
      const comparison = engine.getComparison(req.params.id);
      if (!comparison) {
        return res.status(404).json({ error: "No comparison data available" });
      }
      res.json(comparison);
    } catch (err) {
      res.status(500).json({ error: "Failed to get comparison", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/sandbox/:id/promote — Promote sandbox to production
  router.post("/sandbox/:id/promote", (req, res) => {
    try {
      const result = engine.promoteSandbox(req.params.id);
      if (!result.success) {
        return res.status(400).json({ error: result.reason });
      }
      res.json({ success: true, overrides: result.overrides });
    } catch (err) {
      res.status(500).json({ error: "Failed to promote sandbox", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/sandbox/:id/gates — Promotion gate status
  router.get("/sandbox/:id/gates", (req, res) => {
    try {
      const gates = engine.getGates(req.params.id);
      res.json({ gates });
    } catch (err) {
      res.status(500).json({ error: "Failed to get gates", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/sandbox/:id/gates/:gateName/approve — Manually approve a gate
  router.post("/sandbox/:id/gates/:gateName/approve", (req, res) => {
    try {
      const success = engine.approveGate(req.params.id, req.params.gateName);
      if (!success) {
        return res.status(404).json({ error: "Sandbox or gate not found" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to approve gate", details: String(err) });
    }
  });

  return router;
}
