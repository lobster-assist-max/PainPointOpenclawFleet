/**
 * Fleet Time Machine API Routes
 *
 * Endpoints for point-in-time fleet state reconstruction,
 * state comparison, and bookmark management.
 *
 * @see Planning #20
 */

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { getTimeMachineEngine, type TimeBookmark } from "../services/fleet-time-machine.js";

const VALID_BOOKMARK_TYPES: TimeBookmark["type"][] = [
  "incident",
  "deployment",
  "manual",
  "anomaly",
];

export function fleetTimeMachineRoutes(db: Db | null = null): Router {
  const router = Router();
  const engine = getTimeMachineEngine(db);

  /**
   * GET /api/fleet-monitor/time-machine/reconstruct
   * Reconstruct fleet state at a specific timestamp.
   * Query params: fleetId, timestamp (ISO string)
   */
  router.get("/time-machine/reconstruct", async (req, res) => {
    try {
      const fleetId = (req.query.fleetId as string) ?? "default";
      // An Invalid Date flows into reconstruct() as NaN getTime(), producing a
      // timePoint with timestamp: null and NaN dataAge fields instead of an error.
      let timestamp = new Date();
      if (req.query.timestamp) {
        timestamp = new Date(req.query.timestamp as string);
        if (isNaN(timestamp.getTime())) {
          return res.status(400).json({ ok: false, error: "timestamp must be a valid date" });
        }
      }
      const point = await engine.reconstruct(fleetId, timestamp);
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
  router.get("/time-machine/diff", async (req, res) => {
    try {
      const fleetId = (req.query.fleetId as string) ?? "default";
      // t1/t2 are required — without validation a missing or malformed param
      // becomes Invalid Date and engine.diff() returns a garbage NaN-based diff.
      const t1 = new Date(req.query.t1 as string);
      const t2 = new Date(req.query.t2 as string);
      if (isNaN(t1.getTime())) {
        return res.status(400).json({ ok: false, error: "t1 must be a valid date" });
      }
      if (isNaN(t2.getTime())) {
        return res.status(400).json({ ok: false, error: "t2 must be a valid date" });
      }
      const diff = await engine.diff(fleetId, t1, t2);
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
  router.get("/time-machine/range", async (req, res) => {
    try {
      const fleetId = (req.query.fleetId as string) ?? "default";
      const range = await engine.getAvailableRange(fleetId);
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
      // listBookmarks filters b.type === type, so an invalid ?type=garbage passes
      // the truthy check, matches nothing, and returns an empty list with HTTP 200
      // instead of signalling bad input.
      const type = req.query.type as string | undefined;
      if (type !== undefined && !VALID_BOOKMARK_TYPES.includes(type as TimeBookmark["type"])) {
        return res.status(400).json({
          ok: false,
          error: `type must be one of: ${VALID_BOOKMARK_TYPES.join(", ")}`,
        });
      }
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
    const { timestamp, label, type, refId } = req.body ?? {};

    if (!timestamp || typeof timestamp !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: timestamp (ISO 8601 string)" });
      return;
    }
    const parsedDate = new Date(timestamp);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ ok: false, error: "Field 'timestamp' is not a valid date" });
      return;
    }
    if (!label || typeof label !== "string") {
      res.status(400).json({ ok: false, error: "Missing required field: label" });
      return;
    }
    const validTypes = ["manual", "deployment", "incident", "anomaly"];
    if (type !== undefined && !validTypes.includes(type)) {
      res.status(400).json({ ok: false, error: `Field 'type' must be one of: ${validTypes.join(", ")}` });
      return;
    }

    try {
      const bookmark = engine.createBookmark(
        parsedDate,
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
      const deleted = engine.deleteBookmark(req.params.id);
      res.json({ ok: true, deleted });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
