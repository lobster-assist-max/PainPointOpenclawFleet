/**
 * Fleet Sandbox Environment API Routes
 *
 * Endpoints for creating, managing, and promoting sandbox environments.
 */

import type { Request, Response } from "express";
import { Router } from "express";
import type { FleetSandboxEngine, CreateSandboxRequest, FleetSandbox } from "../services/fleet-sandbox.js";

/**
 * Resolve a sandbox by id and verify the requesting company owns it.
 *
 * Sandboxes are tenant-scoped by `fleetId` (= companyId, see #178), but the by-id routes
 * (get / start / pause / destroy / comparison / promote / gates / approve-gate) took the
 * sandbox id straight from the path with NO ownership check — a cross-tenant IDOR where
 * one company could read, start/pause/destroy, or PROMOTE another company's sandbox
 * (promote actuates a real change to production by pushing the sandbox's overrides).
 *
 * Returns the sandbox when it exists and belongs to the caller. Writes a 404 (never 403 —
 * avoids leaking the existence of another tenant's sandbox, matching the #204/#205/#207/#208
 * by-id guards) and returns null otherwise. A caller with no `?companyId=` (legacy/admin)
 * proceeds unchanged for backward compat.
 */
function resolveOwnedSandbox(
  engine: FleetSandboxEngine,
  req: Request,
  res: Response,
): FleetSandbox | null {
  const sandbox = engine.getSandbox(String(req.params.id));
  if (!sandbox) {
    res.status(404).json({ error: "Sandbox not found" });
    return null;
  }
  const companyId =
    typeof req.query.companyId === "string" ? req.query.companyId : undefined;
  if (companyId && sandbox.fleetId !== companyId) {
    res.status(404).json({ error: "Sandbox not found" });
    return null;
  }
  return sandbox;
}

export function fleetSandboxRoutes(engine: FleetSandboxEngine): Router {
  const router = Router();

  // POST /api/fleet-monitor/sandbox — Create a new sandbox
  router.post("/sandbox", (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Request body must be a JSON object" });
      }
      if (typeof body.name !== "string" || !body.name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      if (typeof body.fleetId !== "string" || !body.fleetId.trim()) {
        return res.status(400).json({ error: "fleetId must be a non-empty string" });
      }
      if (!body.trafficSource || typeof body.trafficSource !== "object") {
        return res.status(400).json({ error: "trafficSource must be an object" });
      }
      const validTrafficTypes = ["synthetic", "shadow", "replay", "manual"];
      if (typeof body.trafficSource.type !== "string" || !validTrafficTypes.includes(body.trafficSource.type)) {
        return res.status(400).json({ error: `trafficSource.type must be one of: ${validTrafficTypes.join(", ")}` });
      }
      if (body.overrides != null && typeof body.overrides !== "object") {
        return res.status(400).json({ error: "overrides must be an object" });
      }
      if (body.promotionGates != null && !Array.isArray(body.promotionGates)) {
        return res.status(400).json({ error: "promotionGates must be an array" });
      }
      const request = body as CreateSandboxRequest;
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
      const sandbox = resolveOwnedSandbox(engine, req, res);
      if (!sandbox) return;
      res.json(sandbox);
    } catch (err) {
      res.status(500).json({ error: "Failed to get sandbox", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/sandbox/:id/start — Start sandbox
  router.post("/sandbox/:id/start", (req, res) => {
    try {
      if (!resolveOwnedSandbox(engine, req, res)) return;
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
      if (!resolveOwnedSandbox(engine, req, res)) return;
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
      if (!resolveOwnedSandbox(engine, req, res)) return;
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
      if (!resolveOwnedSandbox(engine, req, res)) return;
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
      if (!resolveOwnedSandbox(engine, req, res)) return;
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
      if (!resolveOwnedSandbox(engine, req, res)) return;
      const gates = engine.getGates(req.params.id);
      res.json({ gates });
    } catch (err) {
      res.status(500).json({ error: "Failed to get gates", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/sandbox/:id/gates/:gateName/approve — Manually approve a gate
  router.post("/sandbox/:id/gates/:gateName/approve", (req, res) => {
    try {
      if (!resolveOwnedSandbox(engine, req, res)) return;
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
