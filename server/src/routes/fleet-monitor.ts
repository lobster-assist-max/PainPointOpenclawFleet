/**
 * Fleet Monitor API Routes
 *
 * Endpoints for managing bot connections and querying bot data
 * through the FleetMonitorService.
 */

import { Router } from "express";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

export function fleetMonitorRoutes() {
  const router = Router();

  /**
   * GET /api/fleet-monitor/status
   * Returns connection status for all monitored bots.
   */
  router.get("/status", (_req, res) => {
    const service = getFleetMonitorService();
    const bots = service.getAllBots();
    res.json({
      ok: true,
      activeConnections: service.getActiveConnectionCount(),
      bots: bots.map((b) => ({
        botId: b.botId,
        agentId: b.agentId,
        companyId: b.companyId,
        gatewayUrl: b.gatewayUrl,
        state: b.state,
        lastEventAt: b.lastEventAt,
        connectedSince: b.connectedSince,
        dataFreshness: b.dataFreshness,
        capabilities: {
          methods: Array.from(b.capabilities.methods),
          events: Array.from(b.capabilities.events),
          serverVersion: b.capabilities.serverVersion ?? null,
        },
      })),
    });
  });

  /**
   * POST /api/fleet-monitor/connect
   * Connect to a bot's OpenClaw Gateway.
   *
   * Body: { botId, agentId, companyId, gatewayUrl, authToken?, devicePrivateKeyPem? }
   */
  router.post("/connect", async (req, res) => {
    const { botId, agentId, companyId, gatewayUrl, authToken, devicePrivateKeyPem } = req.body ?? {};

    if (!botId || !agentId || !companyId || !gatewayUrl) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: botId, agentId, companyId, gatewayUrl",
      });
      return;
    }

    const service = getFleetMonitorService();

    try {
      await service.connectBot({
        botId,
        agentId,
        companyId,
        gatewayUrl,
        authToken: authToken ?? null,
        devicePrivateKeyPem: devicePrivateKeyPem ?? null,
      });

      const info = service.getBotInfo(botId);
      res.json({ ok: true, bot: info });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /api/fleet-monitor/disconnect/:botId
   * Disconnect a bot and stop monitoring.
   */
  router.delete("/disconnect/:botId", (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();

    const info = service.getBotInfo(botId);
    if (!info) {
      res.status(404).json({ ok: false, error: "Bot not found" });
      return;
    }

    service.disconnectBot(botId);
    res.json({ ok: true, botId });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId
   * Get detailed connection info for a specific bot.
   */
  router.get("/bot/:botId", (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const info = service.getBotInfo(botId);

    if (!info) {
      res.status(404).json({ ok: false, error: "Bot not found" });
      return;
    }

    res.json({
      ok: true,
      bot: {
        ...info,
        capabilities: {
          methods: Array.from(info.capabilities.methods),
          events: Array.from(info.capabilities.events),
          serverVersion: info.capabilities.serverVersion ?? null,
        },
      },
    });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/health
   * Get real-time health snapshot from a bot's gateway.
   */
  router.get("/bot/:botId/health", async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();

    const health = await service.getBotHealth(botId);
    if (!health) {
      res.status(404).json({ ok: false, error: "Bot not found or health unavailable" });
      return;
    }

    res.json({ ok: true, health });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/sessions
   * Get session list from a bot.
   */
  router.get("/bot/:botId/sessions", async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const sessions = await service.getBotSessions(botId);
    res.json({ ok: true, sessions });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/usage
   * Get token usage report from a bot.
   * Query params: from, to (ISO date strings for date range)
   */
  router.get("/bot/:botId/usage", async (req, res) => {
    const { botId } = req.params;
    const { from, to } = req.query;
    const service = getFleetMonitorService();

    const dateRange = from && to
      ? { from: String(from), to: String(to) }
      : undefined;

    const usage = await service.getBotUsage(botId, dateRange);
    if (!usage) {
      res.status(404).json({ ok: false, error: "Bot not found or usage unavailable" });
      return;
    }

    res.json({ ok: true, usage });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/files/:filename
   * Read a file from the bot's workspace (e.g., IDENTITY.md, MEMORY.md).
   */
  router.get("/bot/:botId/files/:filename", async (req, res) => {
    const { botId, filename } = req.params;
    const service = getFleetMonitorService();
    const content = await service.getBotFile(botId, filename);

    if (content === null) {
      res.status(404).json({ ok: false, error: "Bot not found or file unavailable" });
      return;
    }

    res.json({ ok: true, filename, content });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/identity
   * Get bot's agent identity (name, avatar, emoji).
   */
  router.get("/bot/:botId/identity", async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const identity = await service.getBotIdentity(botId);

    if (!identity) {
      res.status(404).json({ ok: false, error: "Bot not found or identity unavailable" });
      return;
    }

    res.json({ ok: true, identity });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/channels
   * Get bot's channel statuses.
   */
  router.get("/bot/:botId/channels", async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const channels = await service.getBotChannels(botId);

    if (!channels) {
      res.status(404).json({ ok: false, error: "Bot not found or channels unavailable" });
      return;
    }

    res.json({ ok: true, channels });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/cron
   * Get bot's cron jobs.
   */
  router.get("/bot/:botId/cron", async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const jobs = await service.getBotCronJobs(botId);

    if (!jobs) {
      res.status(404).json({ ok: false, error: "Bot not found or cron unavailable" });
      return;
    }

    res.json({ ok: true, jobs });
  });

  /**
   * POST /api/fleet-monitor/bot/:botId/test-connection
   * Test connectivity to a gateway URL without establishing a persistent connection.
   */
  router.post("/bot/:botId/test-connection", async (req, res) => {
    const { gatewayUrl } = req.body ?? {};

    if (!gatewayUrl) {
      res.status(400).json({ ok: false, error: "Missing gatewayUrl" });
      return;
    }

    const httpUrl = String(gatewayUrl)
      .replace(/^ws:\/\//, "http://")
      .replace(/^wss:\/\//, "https://");
    const healthUrl = `${httpUrl.replace(/\/$/, "")}/health`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        res.json({ ok: false, reachable: true, httpStatus: response.status });
        return;
      }

      const data = await response.json();
      res.json({ ok: true, reachable: true, gateway: data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.json({ ok: false, reachable: false, error: message });
    }
  });

  return router;
}
