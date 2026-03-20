/**
 * Fleet Bot Workshop API Routes
 *
 * Provides CRUD for bot workspace files, personality versioning,
 * memory management, and skill management — all proxied through
 * the OpenClaw Gateway.
 */

import { Router } from "express";
import { getFleetBotWorkshopService } from "../services/fleet-bot-workshop.js";

export function fleetWorkshopRoutes() {
  const router = Router();

  // ─── File Operations ──────────────────────────────────────────────────

  /**
   * GET /api/fleet-workshop/:botId/files
   * List all workspace files for a bot.
   * Query: ?prefix=memory/
   */
  router.get("/:botId/files", async (req, res) => {
    const { botId } = req.params;
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;

    try {
      const service = getFleetBotWorkshopService();
      const files = await service.listFiles(botId, prefix);
      res.json({ ok: true, files });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-workshop/:botId/files/:path(*)
   * Read a specific file from bot workspace.
   */
  router.get("/:botId/files/*filepath", async (req, res) => {
    const { botId } = req.params;
    const filePath = (req.params as unknown as Record<string, string>).filepath;

    if (!filePath) {
      res.status(400).json({ ok: false, error: "File path is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      const file = await service.getFile(botId, filePath);
      res.json({ ok: true, file });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * PUT /api/fleet-workshop/:botId/files/:path(*)
   * Write a file to bot workspace (pushes to Gateway).
   * Body: { content: string }
   */
  router.put("/:botId/files/*filepath", async (req, res) => {
    const { botId } = req.params;
    const filePath = (req.params as unknown as Record<string, string>).filepath;
    const { content } = req.body ?? {};

    if (!filePath) {
      res.status(400).json({ ok: false, error: "File path is required" });
      return;
    }
    if (typeof content !== "string") {
      res.status(400).json({ ok: false, error: "content (string) is required in body" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();

      // Auto-snapshot personality before overwriting SOUL.md or IDENTITY.md
      const lower = filePath.toLowerCase();
      if (lower === "soul.md" || lower === "identity.md") {
        await service.createPersonalityVersion(
          botId,
          "user",
          `Auto-snapshot before editing ${filePath}`,
        );
      }

      await service.setFile(botId, filePath, content);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /api/fleet-workshop/:botId/files/:path(*)
   * Delete a file from bot workspace.
   */
  router.delete("/:botId/files/*filepath", async (req, res) => {
    const { botId } = req.params;
    const filePath = (req.params as unknown as Record<string, string>).filepath;

    if (!filePath) {
      res.status(400).json({ ok: false, error: "File path is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.deleteFile(botId, filePath);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Personality Versioning ───────────────────────────────────────────

  /**
   * GET /api/fleet-workshop/:botId/personality/versions
   * Get personality version history.
   */
  router.get("/:botId/personality/versions", (req, res) => {
    const { botId } = req.params;
    const service = getFleetBotWorkshopService();
    const versions = service.getVersionHistory(botId);
    res.json({ ok: true, versions });
  });

  /**
   * POST /api/fleet-workshop/:botId/personality/versions
   * Create a new personality snapshot.
   * Body: { createdBy?: string, description: string }
   */
  router.post("/:botId/personality/versions", async (req, res) => {
    const { botId } = req.params;
    const { createdBy, description } = req.body ?? {};

    if (!description || typeof description !== "string") {
      res.status(400).json({ ok: false, error: "description is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      const version = await service.createPersonalityVersion(
        botId,
        typeof createdBy === "string" ? createdBy : "user",
        description,
      );
      res.json({ ok: true, version });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-workshop/:botId/personality/diff
   * Diff two personality versions.
   * Query: ?from=1&to=2
   */
  router.get("/:botId/personality/diff", (req, res) => {
    const { botId } = req.params;
    const from = parseInt(req.query.from as string, 10);
    const to = parseInt(req.query.to as string, 10);

    if (isNaN(from) || isNaN(to)) {
      res.status(400).json({ ok: false, error: "from and to version numbers are required" });
      return;
    }

    const service = getFleetBotWorkshopService();
    const diff = service.diffVersions(botId, from, to);

    if (!diff) {
      res.status(404).json({ ok: false, error: "One or both versions not found" });
      return;
    }

    res.json({ ok: true, diff });
  });

  /**
   * POST /api/fleet-workshop/:botId/personality/rollback
   * Rollback to a specific personality version.
   * Body: { versionId: string }
   */
  router.post("/:botId/personality/rollback", async (req, res) => {
    const { botId } = req.params;
    const { versionId } = req.body ?? {};

    if (!versionId || typeof versionId !== "string") {
      res.status(400).json({ ok: false, error: "versionId is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.rollbackToVersion(botId, versionId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Memory Management ────────────────────────────────────────────────

  /**
   * GET /api/fleet-workshop/:botId/memories
   * List all memory entries for a bot.
   */
  router.get("/:botId/memories", async (req, res) => {
    const { botId } = req.params;

    try {
      const service = getFleetBotWorkshopService();
      const memories = await service.listMemories(botId);
      res.json({ ok: true, memories });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-workshop/:botId/memories
   * Inject a new memory into a bot.
   * Body: { name, type, description, content }
   */
  router.post("/:botId/memories", async (req, res) => {
    const { botId } = req.params;
    const { name, type, description, content } = req.body ?? {};

    if (!name || !type || !description || !content) {
      res.status(400).json({
        ok: false,
        error: "name, type, description, and content are required",
      });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.injectMemory(botId, { name, type, description, content });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /api/fleet-workshop/:botId/memories/:path(*)
   * Remove a memory from a bot.
   */
  router.delete("/:botId/memories/*mempath", async (req, res) => {
    const { botId } = req.params;
    const memoryPath = (req.params as unknown as Record<string, string>).mempath;

    if (!memoryPath) {
      res.status(400).json({ ok: false, error: "Memory path is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.removeMemory(botId, `memory/${memoryPath}`);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Skill Management ─────────────────────────────────────────────────

  /**
   * GET /api/fleet-workshop/:botId/skills
   * List installed skills for a bot.
   */
  router.get("/:botId/skills", async (req, res) => {
    const { botId } = req.params;

    try {
      const service = getFleetBotWorkshopService();
      const skills = await service.listSkills(botId);
      res.json({ ok: true, skills });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-workshop/:botId/skills/install
   * Install a skill on a bot.
   * Body: { skillName: string }
   */
  router.post("/:botId/skills/install", async (req, res) => {
    const { botId } = req.params;
    const { skillName } = req.body ?? {};

    if (!skillName || typeof skillName !== "string") {
      res.status(400).json({ ok: false, error: "skillName is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.installSkill(botId, skillName);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
