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
      const { query, ...options } = req.body as { query: string } & FederatedSearchOptions;
      if (!query) {
        return res.status(400).json({ error: "query is required" });
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
      const minConnections = req.query.minConnections
        ? parseInt(req.query.minConnections as string, 10)
        : undefined;

      const graph = engine.getKnowledgeGraph({ topics, minConnections });
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: "Failed to get knowledge graph", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/conflicts — Memory conflicts
  router.get("/memory/conflicts", (req, res) => {
    try {
      const status = req.query.status as "open" | "resolved" | "dismissed" | undefined;
      const conflicts = engine.getConflicts(status);
      res.json({ conflicts });
    } catch (err) {
      res.status(500).json({ error: "Failed to get conflicts", details: String(err) });
    }
  });

  // POST /api/fleet-monitor/memory/conflicts/:id/resolve — Resolve conflict
  router.post("/memory/conflicts/:id/resolve", (req, res) => {
    try {
      const success = engine.resolveConflict(req.params.id);
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
      const success = engine.dismissConflict(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Conflict not found or not open" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to dismiss conflict", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/health — Memory health report
  router.get("/memory/health", (_req, res) => {
    try {
      const health = engine.getHealthReport();
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: "Failed to get health report", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/bot/:id/stats — Single bot memory stats
  router.get("/memory/bot/:id/stats", (req, res) => {
    try {
      const health = engine.getHealthReport();
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
  router.get("/memory/gaps", (_req, res) => {
    try {
      const gaps = engine.getGaps();
      res.json({ gaps });
    } catch (err) {
      res.status(500).json({ error: "Failed to get gaps", details: String(err) });
    }
  });

  // GET /api/fleet-monitor/memory/stats — Memory mesh statistics
  router.get("/memory/stats", (_req, res) => {
    try {
      const stats = engine.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to get stats", details: String(err) });
    }
  });

  return router;
}
