/**
 * Fleet Memory Mesh API Routes
 *
 * Endpoints for federated memory search across bots, conflict detection,
 * knowledge graph visualization, and memory health analysis.
 */

import { Router } from "express";
import type { MemoryMeshEngine, FederatedSearchOptions } from "../services/fleet-memory-mesh.js";

export function fleetMemoryMeshRoutes(engine: MemoryMeshEngine): Router {
  const router = Router();

  // POST /api/fleet-monitor/memory/search — Federated memory search
  router.post("/memory/search", async (req, res) => {
    try {
      const { query, ...options } = req.body as { query: unknown } & FederatedSearchOptions;
      if (typeof query !== "string" || query.trim().length === 0) {
        return res.status(400).json({ error: "query is required and must be a non-empty string" });
      }
      if (options.botIds !== undefined && !Array.isArray(options.botIds)) {
        return res.status(400).json({ error: "botIds must be an array of strings" });
      }
      if (options.topK !== undefined && (typeof options.topK !== "number" || !Number.isFinite(options.topK) || options.topK < 1)) {
        return res.status(400).json({ error: "topK must be a positive number" });
      }
      if (
        options.minSimilarity !== undefined &&
        (typeof options.minSimilarity !== "number" || options.minSimilarity < 0 || options.minSimilarity > 1)
      ) {
        return res.status(400).json({ error: "minSimilarity must be a number between 0 and 1" });
      }
      const results = await engine.federatedSearch(query, options);
      res.json(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Rate limit")) {
        return res.status(429).json({ error: message });
      }
      res.status(500).json({ error: "Failed to search", details: message });
    }
  });

  // GET /api/fleet-monitor/memory/graph — Knowledge graph
  router.get("/memory/graph", (req, res) => {
    try {
      const topics = req.query.topics
        ? (req.query.topics as string).split(",")
        : undefined;
      let minConnections: number | undefined;
      if (req.query.minConnections !== undefined) {
        minConnections = parseInt(req.query.minConnections as string, 10);
        // A non-numeric value parses to NaN, which is falsy — the engine's filter would be
        // silently skipped and the caller would get an unfiltered graph instead of an error.
        if (!Number.isFinite(minConnections) || minConnections < 0) {
          return res
            .status(400)
            .json({ error: "minConnections must be a non-negative number" });
        }
      }

      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const graph = engine.getKnowledgeGraph({ topics, minConnections }, companyId);
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: "Failed to get knowledge graph", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/conflicts — Memory conflicts
  router.get("/memory/conflicts", (req, res) => {
    try {
      // An invalid status is cast straight to the union and passed to the engine,
      // whose `c.status === status` filter never matches — so ?status=garbage would
      // silently return an empty list with HTTP 200 instead of signalling bad input.
      const VALID_CONFLICT_STATUSES = ["open", "resolved", "dismissed"] as const;
      const rawStatus = req.query.status;
      if (rawStatus !== undefined && !VALID_CONFLICT_STATUSES.includes(rawStatus as (typeof VALID_CONFLICT_STATUSES)[number])) {
        return res.status(400).json({
          error: `status must be one of: ${VALID_CONFLICT_STATUSES.join(", ")}`,
        });
      }
      const status = rawStatus as "open" | "resolved" | "dismissed" | undefined;
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const conflicts = engine.getConflicts(status, companyId);
      res.json({ conflicts });
    } catch (err) {
      res.status(500).json({ error: "Failed to get conflicts", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/memory/conflicts/:id/resolve — Resolve conflict
  router.post("/memory/conflicts/:id/resolve", (req, res) => {
    try {
      // Tenant ownership: a cross-tenant conflict id fails the engine's companyId
      // check → 404 (never 403 — avoids leaking another tenant's conflict existence).
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const success = engine.resolveConflict(req.params.id, companyId);
      if (!success) {
        return res.status(404).json({ error: "Conflict not found or not open" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve conflict", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/memory/conflicts/:id/dismiss — Dismiss conflict
  router.post("/memory/conflicts/:id/dismiss", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const success = engine.dismissConflict(req.params.id, companyId);
      if (!success) {
        return res.status(404).json({ error: "Conflict not found or not open" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to dismiss conflict", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/health — Memory health report
  router.get("/memory/health", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const health = engine.getHealthReport(companyId);
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: "Failed to get health report", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/bot/:id/stats — Single bot memory stats
  router.get("/memory/bot/:id/stats", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const health = engine.getHealthReport(companyId);
      const botStats = health.perBot.find((b) => b.botId === req.params.id);
      if (!botStats) {
        return res.status(404).json({ error: "Bot not found" });
      }
      res.json(botStats);
    } catch (err) {
      res.status(500).json({ error: "Failed to get bot stats", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/gaps — Knowledge gap analysis
  router.get("/memory/gaps", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const gaps = engine.getGaps(companyId);
      res.json({ gaps });
    } catch (err) {
      res.status(500).json({ error: "Failed to get gaps", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/stats — Memory mesh statistics
  router.get("/memory/stats", (req, res) => {
    try {
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const stats = engine.getStats(companyId);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to get stats", details: String(err) });
    }
  });

  return router;
}
