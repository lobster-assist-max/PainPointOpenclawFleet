/**
 * Fleet Bot Workshop API Routes
 *
 * Provides CRUD for bot workspace files, personality versioning,
 * memory management, and skill management — all proxied through
 * the OpenClaw Gateway.
 */

import { Router, type Request } from "express";
import { getFleetBotWorkshopService } from "../services/fleet-bot-workshop.js";
import { getFleetMonitorService } from "../services/fleet-monitor.js";
import { recordAudit } from "../services/fleet-audit.js";

/** Extract a named wildcard param from Express route params (handles string | string[] union). */
function getWildcardParam(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

/**
 * Audit a Workshop write. These mutate a bot's core identity — SOUL.md /
 * IDENTITY.md, personality versions, memories, installed skills — the most
 * security-sensitive fleet operations, yet they left ZERO trail in the
 * "all fleet operations are logged" audit log (only connect/disconnect,
 * tag, budget, and avatar writes were recorded). Attribute to the bot's
 * owning tenant: prefer the request-scoped companyId (the prefix guard
 * already verified it matches the bot), else fall back to the live bot's
 * company. Skip when neither is resolvable (disconnected bot, no scope) —
 * can't attribute it correctly, matching the budget-delete audit pattern.
 */
function auditWorkshopWrite(
  req: Request,
  botId: string,
  action: string,
  details: Record<string, unknown>,
): void {
  const queryCompanyId =
    typeof req.query.companyId === "string" && req.query.companyId.length > 0
      ? req.query.companyId
      : undefined;
  const companyId =
    queryCompanyId ?? getFleetMonitorService().getBotInfo(botId)?.companyId;
  if (!companyId) return;
  recordAudit(req, {
    companyId,
    action,
    targetType: "bot",
    targetId: botId,
    details,
  });
}

export function fleetWorkshopRoutes() {
  const router = Router();

  // ─── Cross-tenant ownership guard ─────────────────────────────────────
  // Every workshop route is /:botId/* and READS or WRITES a bot's SOUL.md,
  // IDENTITY.md, memories, and installed skills via the gateway RPC. Without
  // an ownership check, any caller could pass another tenant's botId and
  // read — or overwrite — that bot's core personality/memory/skills (a
  // severe cross-tenant IDOR, worse than the #204 read/execute guards). The
  // BotWorkshop UI always sends ?companyId= (as a query param on every method,
  // GET/PUT/POST/DELETE — NOT the body: at this router.use prefix stage
  // express.json() has not populated req.body yet, only the concrete route
  // handler runs after parsing). When the bot is connected but owned by a
  // different company, report 404 (not 403 — avoids leaking existence,
  // matching the journey/incident/anomaly/#204 by-id guards). A disconnected
  // bot (getBotInfo null) proceeds — every workshop op proxies through the
  // gateway RPC, so nothing is reachable for a bot that isn't connected, and
  // there is no tenant to compare against. Applied as a single prefix
  // middleware so no endpoint can be missed.
  router.use("/:botId", (req, res, next) => {
    const { botId } = req.params;
    const companyId =
      typeof req.query.companyId === "string" && req.query.companyId.length > 0
        ? req.query.companyId
        : undefined;
    if (companyId) {
      const botInfo = getFleetMonitorService().getBotInfo(botId);
      if (botInfo && botInfo.companyId !== companyId) {
        res.status(404).json({ ok: false, error: "Bot not found" });
        return;
      }
    }
    next();
  });

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
    const filePath = getWildcardParam(req, "filepath");

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
    const filePath = getWildcardParam(req, "filepath");
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
      auditWorkshopWrite(req, botId, "bot.workshop.file.write", { filePath, bytes: content.length });
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
    const filePath = getWildcardParam(req, "filepath");

    if (!filePath) {
      res.status(400).json({ ok: false, error: "File path is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.deleteFile(botId, filePath);
      auditWorkshopWrite(req, botId, "bot.workshop.file.delete", { filePath });
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
      auditWorkshopWrite(req, botId, "bot.workshop.personality.snapshot", { description });
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
      auditWorkshopWrite(req, botId, "bot.workshop.personality.rollback", { versionId });
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

    // Validate types — injectMemory calls name.toLowerCase(), so a non-string
    // name that only passes a truthiness check throws a TypeError (→ 500).
    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      typeof description !== "string" ||
      description.trim().length === 0 ||
      typeof content !== "string" ||
      content.length === 0
    ) {
      res.status(400).json({
        ok: false,
        error: "name, description, and content must be non-empty strings",
      });
      return;
    }
    const validTypes = ["user", "feedback", "project", "reference", "unknown"];
    if (typeof type !== "string" || !validTypes.includes(type)) {
      res.status(400).json({
        ok: false,
        error: `type must be one of: ${validTypes.join(", ")}`,
      });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.injectMemory(botId, {
        name,
        type: type as "user" | "feedback" | "project" | "reference" | "unknown",
        description,
        content,
      });
      auditWorkshopWrite(req, botId, "bot.workshop.memory.inject", { name, type });
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
    const memoryPath = getWildcardParam(req, "mempath");

    if (!memoryPath) {
      res.status(400).json({ ok: false, error: "Memory path is required" });
      return;
    }

    try {
      const service = getFleetBotWorkshopService();
      await service.removeMemory(botId, `memory/${memoryPath}`);
      auditWorkshopWrite(req, botId, "bot.workshop.memory.delete", { memoryPath });
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
      auditWorkshopWrite(req, botId, "bot.workshop.skill.install", { skillName });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
