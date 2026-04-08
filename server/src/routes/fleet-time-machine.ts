/**
 * Fleet Time Machine API Routes
 *
 * Endpoints for point-in-time fleet state reconstruction,
 * state comparison, and bookmark management.
 *
 * @see Planning #20
 */

import { Router } from "express";
import { getTimeMachineEngine, type TimeBookmark } from "../services/fleet-time-machine.js";

export function fleetTimeMachineRoutes(): Router {
  const router = Router();

  /**
   * GET /api/fleet-monitor/time-machine/reconstruct
   * Reconstruct fleet state at a specific timestamp.
   * Query params: fleetId, timestamp (ISO string)
   */
  router.get("/time-machine/reconstruct", (req, res) => {
    try {
      const engine = getTimeMachineEngine();
      const fleetId = (req.query.fleetId as string) ?? "default";
      const timestamp = req.query.timestamp ? new Date(req.query.timestamp as string) : new Date();
      const point = engine.reconstruct(fleetId, timestamp);
      res.json({ ok: true, point });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/time-machine/diff
   * Compare fleet states between two timestamps.
   * Query params: fleetId, t1, t2 (ISO strings)
   */
  router.get("/time-machine/diff", (req, res) => {
    try {
      const engine = getTimeMachineEngine();
      const fleetId = (req.query.fleetId as string) ?? "default";
      const t1 = new Date(req.query.t1 as string);
      const t2 = new Date(req.query.t2 as string);
      const diff = engine.diff(fleetId, t1, t2);
      res.json({ ok: true, diff });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/time-machine/range
   * Get available time range for reconstruction.
   */
  router.get("/time-machine/range", (req, res) => {
    try {
      const engine = getTimeMachineEngine();
      const fleetId = (req.query.fleetId as string) ?? "default";
      const range = engine.getAvailableRange(fleetId);
      res.json({ ok: true, range });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/time-machine/bookmarks
   * List time bookmarks.
   */
  router.get("/time-machine/bookmarks", (req, res) => {
    try {
      const engine = getTimeMachineEngine();
      const type = req.query.type as string | undefined;
      const bookmarks = engine.listBookmarks(type as TimeBookmark["type"] | undefined);
      res.json({ ok: true, bookmarks });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/time-machine/bookmarks
   * Create a new time bookmark.
   */
  router.post("/time-machine/bookmarks", (req, res) => {
    try {
      const engine = getTimeMachineEngine();
      const { timestamp, label, type, refId } = req.body;
      const bookmark = engine.createBookmark(
        new Date(timestamp),
        label,
        type ?? "manual",
        refId,
      );
      res.status(201).json({ ok: true, bookmark });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /api/fleet-monitor/time-machine/bookmarks/:id
   * Delete a time bookmark.
   */
  router.delete("/time-machine/bookmarks/:id", (req, res) => {
    try {
      const engine = getTimeMachineEngine();
      const deleted = engine.deleteBookmark(req.params.id);
      res.json({ ok: true, deleted });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
