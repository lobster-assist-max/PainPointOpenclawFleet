/**
 * Fleet Monitor API Routes
 *
 * Endpoints for managing bot connections and querying bot data
 * through the FleetMonitorService.
 */

import { Router } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, fleetSnapshots } from "@paperclipai/db";
import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

export function fleetMonitorRoutes(db?: Db) {
  const router = Router();

  /**
   * GET /api/fleet-monitor/status
   * Returns connection status for all monitored bots, enriched with agent data.
   */
  router.get("/status", async (_req, res) => {
    try {
      const service = getFleetMonitorService();
      const bots = service.getAllBots();

      // Enrich with agent DB records (name, icon, role, cost, etc.)
      let agentMap = new Map<string, {
        name: string;
        icon: string | null;
        title: string | null;
        role: string;
        budgetMonthlyCents: number;
        spentMonthlyCents: number;
        metadata: Record<string, unknown> | null;
      }>();

      if (db && bots.length > 0) {
        try {
          const agentIds = bots.map((b) => b.agentId);
          const agents = await db
            .select({
              id: agentsTable.id,
              name: agentsTable.name,
              icon: agentsTable.icon,
              title: agentsTable.title,
              role: agentsTable.role,
              budgetMonthlyCents: agentsTable.budgetMonthlyCents,
              spentMonthlyCents: agentsTable.spentMonthlyCents,
              metadata: agentsTable.metadata,
            })
            .from(agentsTable)
            .where(inArray(agentsTable.id, agentIds));

          for (const a of agents) {
            agentMap.set(a.id, {
              name: a.name,
              icon: a.icon,
              title: a.title,
              role: a.role,
              budgetMonthlyCents: a.budgetMonthlyCents,
              spentMonthlyCents: a.spentMonthlyCents,
              metadata: a.metadata as Record<string, unknown> | null,
            });
          }
        } catch (err) {
          console.warn("[fleet] DB agent enrichment failed:", err instanceof Error ? err.message : err);
        }
      }

      const mappedBots = bots.map((b) => {
        const agent = agentMap.get(b.agentId);
        const meta = agent?.metadata ?? {};
        const connectedSinceMs = b.connectedSince ? new Date(b.connectedSince).getTime() : null;
        return {
          botId: b.botId,
          agentId: b.agentId,
          name: agent?.name ?? b.botId,
          emoji: agent?.icon ?? "",
          // Map internal state to client BotConnectionState
          connectionState: b.state,
          healthScore: null,
          freshness: b.dataFreshness ?? {
            lastUpdated: b.lastEventAt ?? new Date().toISOString(),
            source: "realtime",
            staleAfterMs: 30000,
          },
          gatewayUrl: b.gatewayUrl,
          gatewayVersion: b.capabilities?.serverVersion ?? null,
          channels: [],
          activeSessions: 0,
          uptime: connectedSinceMs ? Date.now() - connectedSinceMs : null,
          avatar: (meta.avatar as string) ?? null,
          roleId: (meta.roleId as string) ?? null,
          description: (meta.description as string) ?? agent?.title ?? null,
          contextTokens: (meta.contextTokens as number) ?? null,
          contextMaxTokens: (meta.contextMaxTokens as number) ?? null,
          monthCostUsd: agent ? agent.spentMonthlyCents / 100 : null,
          monthBudgetUsd: agent && agent.budgetMonthlyCents > 0
            ? agent.budgetMonthlyCents / 100
            : null,
          skills: Array.isArray(meta.skills) ? meta.skills : [],
        };
      });
      const totalConnected = mappedBots.filter(
        (b) => b.connectionState === "monitoring",
      ).length;

      res.json({
        bots: mappedBots,
        totalConnected,
        totalBots: mappedBots.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
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

    if (typeof botId !== "string" || typeof agentId !== "string" || typeof companyId !== "string" || typeof gatewayUrl !== "string") {
      res.status(400).json({
        ok: false,
        error: "botId, agentId, companyId, and gatewayUrl must be strings",
      });
      return;
    }

    // Validate gatewayUrl is a well-formed URL
    try {
      const parsed = new URL(gatewayUrl);
      if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
        res.status(400).json({ ok: false, error: "gatewayUrl must use http, https, ws, or wss protocol" });
        return;
      }
    } catch {
      /* invalid URL syntax */
      res.status(400).json({ ok: false, error: "gatewayUrl must be a valid URL" });
      return;
    }

    if (authToken != null && typeof authToken !== "string") {
      res.status(400).json({ ok: false, error: "authToken must be a string" });
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
   * POST /api/fleet-monitor/test-connection
   * Standalone test: probe a gateway URL for identity and channels without
   * creating a persistent connection. Used by ConnectBotWizard step 2.
   *
   * Body: { gatewayUrl, token }
   */
  router.post("/test-connection", async (req, res) => {
    const { gatewayUrl, token } = req.body ?? {};

    if (!gatewayUrl || typeof gatewayUrl !== "string") {
      res.status(400).json({ ok: false, error: "Missing or invalid gatewayUrl", status: "error", version: null, identity: null });
      return;
    }

    // Validate gatewayUrl format
    try {
      const parsed = new URL(gatewayUrl);
      if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
        res.status(400).json({ ok: false, error: "gatewayUrl must use http, https, ws, or wss protocol", status: "error", version: null, identity: null });
        return;
      }
    } catch {
      /* invalid URL syntax */
      res.status(400).json({ ok: false, error: "gatewayUrl must be a valid URL", status: "error", version: null, identity: null });
      return;
    }

    if (token != null && (typeof token !== "string" || token.trim().length === 0)) {
      res.status(400).json({ ok: false, error: "token must be a non-empty string", status: "error", version: null, identity: null });
      return;
    }

    const httpUrl = String(gatewayUrl)
      .replace(/^ws:\/\//, "http://")
      .replace(/^wss:\/\//, "https://");
    const base = httpUrl.replace(/\/$/, "");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Helper to fetch JSON from gateway with timeout
    async function probe(url: string): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const response = await fetch(url, { signal: controller.signal, headers });
        clearTimeout(timeout);
        if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
        const data = await response.json();
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Probe health endpoint
    const healthResult = await probe(`${base}/health`);
    if (!healthResult.ok) {
      res.json({
        ok: false,
        status: "unreachable",
        version: null,
        identity: null,
        error: healthResult.error ?? "Cannot reach gateway",
      });
      return;
    }

    const health = healthResult.data ?? {};
    const version = health.version ?? health.serverVersion ?? null;

    // Probe identity endpoint
    const identityResult = await probe(`${base}/identity`);
    const idData = identityResult.ok ? identityResult.data : null;
    const healthIdentity = health.identity && typeof health.identity === "object"
      ? health.identity as Record<string, unknown>
      : null;
    const identity = idData
      ? {
          name: idData.name ?? "Unknown Bot",
          emoji: idData.emoji ?? null,
          description: idData.description ?? idData.bio ?? null,
        }
      : healthIdentity
        ? {
            name: healthIdentity.name ?? "Unknown Bot",
            emoji: healthIdentity.emoji ?? null,
            description: healthIdentity.description ?? healthIdentity.bio ?? null,
          }
        : null;

    // Probe channels endpoint
    const channelsResult = await probe(`${base}/channels`);
    const chData = channelsResult.ok ? channelsResult.data : null;
    const channels = chData && Array.isArray(chData.channels)
      ? chData.channels
      : Array.isArray(chData)
        ? chData
        : [];

    res.json({
      ok: true,
      status: "connected",
      version,
      identity,
      channels,
      error: null,
    });
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
    try {
      const { botId } = req.params;
      const service = getFleetMonitorService();

      const health = await service.getBotHealth(botId);
      if (!health) {
        res.status(404).json({ ok: false, error: "Bot not found or health unavailable" });
        return;
      }

      res.json({ ok: true, health });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to fetch bot health" });
    }
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/sessions
   * Get session list from a bot.
   */
  router.get("/bot/:botId/sessions", async (req, res) => {
    try {
      const { botId } = req.params;
      const service = getFleetMonitorService();
      const sessions = await service.getBotSessions(botId);
      res.json({ ok: true, sessions });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to fetch bot sessions" });
    }
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/usage
   * Get token usage report from a bot.
   * Query params: from, to (ISO date strings for date range)
   */
  router.get("/bot/:botId/usage", async (req, res) => {
    try {
      const { botId } = req.params;
      const { from, to } = req.query;
      const service = getFleetMonitorService();

      let dateRange: { from: string; to: string } | undefined;
      if (from && to) {
        const fromStr = String(from);
        const toStr = String(to);
        if (isNaN(Date.parse(fromStr)) || isNaN(Date.parse(toStr))) {
          res.status(400).json({ ok: false, error: "Invalid date format for 'from' or 'to' — expected ISO 8601 strings" });
          return;
        }
        dateRange = { from: fromStr, to: toStr };
      }

      const usage = await service.getBotUsage(botId, dateRange);
      if (!usage) {
        res.status(404).json({ ok: false, error: "Bot not found or usage unavailable" });
        return;
      }

      res.json({ ok: true, usage });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to fetch bot usage" });
    }
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/files/:filename
   * Read a file from the bot's workspace (e.g., IDENTITY.md, MEMORY.md).
   */
  router.get("/bot/:botId/files/:filename", async (req, res) => {
    try {
      const { botId, filename } = req.params;
      const service = getFleetMonitorService();
      const content = await service.getBotFile(botId, filename);

      if (content === null) {
        res.status(404).json({ ok: false, error: "Bot not found or file unavailable" });
        return;
      }

      res.json({ ok: true, filename, content });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to fetch bot file" });
    }
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/identity
   * Get bot's agent identity (name, avatar, emoji).
   */
  router.get("/bot/:botId/identity", async (req, res) => {
    try {
      const { botId } = req.params;
      const service = getFleetMonitorService();
      const identity = await service.getBotIdentity(botId);

      if (!identity) {
        res.status(404).json({ ok: false, error: "Bot not found or identity unavailable" });
        return;
      }

      res.json({ ok: true, identity });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to fetch bot identity" });
    }
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/channels
   * Get bot's channel statuses.
   */
  router.get("/bot/:botId/channels", async (req, res) => {
    try {
      const { botId } = req.params;
      const service = getFleetMonitorService();
      const channels = await service.getBotChannels(botId);

      if (!channels) {
        res.status(404).json({ ok: false, error: "Bot not found or channels unavailable" });
        return;
      }

      res.json({ ok: true, channels });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to fetch bot channels" });
    }
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/cron
   * Get bot's cron jobs.
   */
  router.get("/bot/:botId/cron", async (req, res) => {
    try {
      const { botId } = req.params;
      const service = getFleetMonitorService();
      const jobs = await service.getBotCronJobs(botId);

      if (!jobs) {
        res.status(404).json({ ok: false, error: "Bot not found or cron unavailable" });
        return;
      }

      res.json({ ok: true, jobs });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to fetch bot cron jobs" });
    }
  });

  /**
   * POST /api/fleet-monitor/bot/:botId/test-connection
   * Test connectivity to a gateway URL without establishing a persistent connection.
   */
  router.post("/bot/:botId/test-connection", async (req, res) => {
    const { gatewayUrl } = req.body ?? {};

    if (!gatewayUrl || typeof gatewayUrl !== "string") {
      res.status(400).json({ ok: false, error: "Missing or invalid gatewayUrl" });
      return;
    }

    // Validate gatewayUrl format
    try {
      const parsed = new URL(gatewayUrl);
      if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
        res.status(400).json({ ok: false, error: "gatewayUrl must use http, https, ws, or wss protocol" });
        return;
      }
    } catch {
      /* invalid URL syntax */
      res.status(400).json({ ok: false, error: "gatewayUrl must be a valid URL" });
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

  /**
   * GET /api/fleet-monitor/bot/:botId/chat-history
   * Fetch chat history for a bot's session via chat.history RPC.
   *
   * Query: ?sessionKey=xxx&limit=50
   */
  router.get("/bot/:botId/chat-history", async (req, res) => {
    const { botId } = req.params;
    const sessionKeyParam = req.query.sessionKey;
    const sessionKey = Array.isArray(sessionKeyParam) ? sessionKeyParam[0] : sessionKeyParam;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));

    if (!sessionKey || typeof sessionKey !== "string") {
      res.status(400).json({ ok: false, error: "Missing sessionKey" });
      return;
    }

    const service = getFleetMonitorService();
    try {
      const history = await service.rpcForBot(botId, "chat.history", {
        sessionKey,
        limit,
      });
      res.json({ ok: true, history });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/config-drift
   * Analyze config differences across all connected bots.
   *
   * Query: ?companyId=xxx
   */
  router.get("/config-drift", async (_req, res) => {
    const service = getFleetMonitorService();
    try {
      // Lazy-import to avoid circular dependency
      const { FleetConfigDriftDetector } = await import(
        "../services/fleet-config-drift.js"
      );
      const detector = new FleetConfigDriftDetector();
      const report = await detector.analyze(service);
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/cost-by-channel
   * Break down token costs by messaging channel.
   *
   * Query: ?companyId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
   */
  router.get("/cost-by-channel", async (req, res) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // A date range must be supplied as a pair — a single bound silently dropped
    // the dateRange and returned all-time costs instead of the requested window.
    if ((from && !to) || (!from && to)) {
      res.status(400).json({ ok: false, error: "from and to must be provided together" });
      return;
    }
    // Reject malformed dates — an Invalid Date was passed straight to the RPC
    // dateRange, producing a garbage/unfiltered cost window with HTTP 200.
    if (from && to && (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime()))) {
      res.status(400).json({ ok: false, error: "from and to must be valid dates" });
      return;
    }

    try {
    const service = getFleetMonitorService();
    const bots = service.getAllBots().filter((b) => b.state === "monitoring");

    const channelCosts = new Map<
      string,
      { sessions: number; input: number; output: number; cached: number }
    >();

    for (const bot of bots) {
      try {
        const usage = await service.rpcForBot<{
          sessions?: Array<{ sessionKey?: string; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number }>;
        }>(bot.botId, "sessions.usage", {
          dateRange: from && to ? { from, to } : undefined,
        });
        if (usage && Array.isArray(usage.sessions)) {
          for (const session of usage.sessions) {
            const key: string = session.sessionKey ?? "";
            let channel = "other";
            if (key.includes(":channel:")) {
              const m = key.match(/:channel:(\w+)/);
              channel = m ? m[1] : "other";
            } else if (key.includes(":peer:")) {
              channel = "direct";
            } else if (key.includes(":guild:")) {
              channel = "group";
            } else if (key.includes("cron:")) {
              channel = "cron";
            }

            const existing = channelCosts.get(channel) ?? {
              sessions: 0,
              input: 0,
              output: 0,
              cached: 0,
            };
            existing.sessions += 1;
            existing.input += session.inputTokens ?? 0;
            existing.output += session.outputTokens ?? 0;
            existing.cached += session.cachedInputTokens ?? 0;
            channelCosts.set(channel, existing);
          }
        }
      } catch (err) {
        console.warn(`[fleet] cost-by-channel: failed to fetch usage for bot ${bot.botId}:`, err instanceof Error ? err.message : err);
      }
    }

    const result = Array.from(channelCosts.entries()).map(([channel, data]) => ({
      channel,
      sessions: data.sessions,
      inputTokens: data.input,
      outputTokens: data.output,
      cachedInputTokens: data.cached,
    }));

    res.json({ ok: true, channels: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/fleet/:companyId/heatmap
   * Return hourly health snapshots for heatmap rendering.
   *
   * Query: ?days=28&botId=xxx (optional)
   */
  router.get("/fleet/:companyId/heatmap", async (req, res) => {
    try {
      const { companyId } = req.params;
      // Floor at 1 — a negative days makes the cutoff land in the future, returning an empty/garbage window.
      const days = Math.max(1, Math.min(Number(req.query.days) || 28, 90));
      const botId = req.query.botId as string | undefined;
      const granularity = req.query.granularity === "hourly" ? "hourly" : "daily";

      if (!db) {
        res.json({ ok: true, companyId, days, botId: botId ?? null, granularity, cells: [] });
        return;
      }

      // Aggregate fleet_snapshots into day or hour buckets, averaging
      // each bot's recorded health score within the window. Sparse data
      // is expected early on — the frontend fills a continuous calendar
      // grid and renders missing buckets as "no data".
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const bucketExpr =
        granularity === "hourly"
          ? sql<string>`to_char(${fleetSnapshots.capturedAt}, 'YYYY-MM-DD"T"HH24')`
          : sql<string>`to_char(${fleetSnapshots.capturedAt}, 'YYYY-MM-DD')`;

      const conditions = [
        eq(fleetSnapshots.companyId, companyId),
        gte(fleetSnapshots.capturedAt, cutoff),
      ];
      if (botId) conditions.push(eq(fleetSnapshots.botId, botId));

      const rows = await db
        .select({
          bucket: bucketExpr,
          avgHealth: sql<number | null>`avg(${fleetSnapshots.healthScore})`,
          samples: sql<number>`count(*)`,
        })
        .from(fleetSnapshots)
        .where(and(...conditions))
        .groupBy(bucketExpr)
        .orderBy(bucketExpr);

      const cells = rows.map((r) => ({
        date: r.bucket,
        avgHealthScore: r.avgHealth == null ? null : Math.round(Number(r.avgHealth)),
        events: Number(r.samples),
      }));

      res.json({ ok: true, companyId, days, botId: botId ?? null, granularity, cells });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Agent Turn Traces ─────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/bot/:botId/traces
   * List recent completed traces for a bot.
   * Query: ?limit=50
   */
  router.get("/bot/:botId/traces", (req, res) => {
    const { botId } = req.params;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const service = getFleetMonitorService();
    const traces = service.getBotTraces(botId, limit);
    res.json({ ok: true, traces });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/traces/active
   * Get the currently active (in-progress) trace.
   */
  router.get("/bot/:botId/traces/active", (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const trace = service.getBotActiveTrace(botId);
    res.json({ ok: true, trace: trace ?? null });
  });

  /**
   * GET /api/fleet-monitor/bot/:botId/traces/:runId
   * Get a specific trace by runId.
   */
  router.get("/bot/:botId/traces/:runId", (req, res) => {
    const { botId, runId } = req.params;
    const service = getFleetMonitorService();
    const trace = service.getBotTrace(botId, runId);

    if (!trace) {
      res.status(404).json({ ok: false, error: "Trace not found" });
      return;
    }

    res.json({ ok: true, trace });
  });

  // ─── Gateway mDNS Auto-Discovery ─────────────────────────────────────

  /**
   * GET /api/fleet-monitor/discovery
   * List gateways discovered via mDNS on the local network.
   */
  router.get("/discovery", async (_req, res) => {
    try {
      const { getGatewayDiscoveryService } = await import(
        "../services/gateway-discovery.js"
      );
      const discovery = getGatewayDiscoveryService();
      res.json({ ok: true, gateways: discovery.getDiscovered() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.json({ ok: true, gateways: [], note: `Discovery unavailable: ${message}` });
    }
  });

  /**
   * POST /api/fleet-monitor/discovery/refresh
   * Trigger a fresh mDNS scan (30s timeout).
   */
  router.post("/discovery/refresh", async (_req, res) => {
    try {
      const { getGatewayDiscoveryService } = await import(
        "../services/gateway-discovery.js"
      );
      const discovery = getGatewayDiscoveryService();
      discovery.refresh();
      // Wait 3 seconds for initial results
      await new Promise((r) => setTimeout(r, 3_000));
      res.json({ ok: true, gateways: discovery.getDiscovered() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.json({ ok: true, gateways: [], note: `Discovery unavailable: ${message}` });
    }
  });

  // ─── Bot Tags ─────────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/tags
   * List all tags for the current fleet.
   */
  router.get("/tags", async (_req, res) => {
    try {
      const { getFleetTagService } = await import("../services/fleet-tags.js");
      const tagService = getFleetTagService();
      res.json({ ok: true, tags: tagService.getAllTags() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/bot/:botId/tags
   * Add a tag to a bot.
   * Body: { tag, label, color?, category? }
   */
  router.post("/bot/:botId/tags", async (req, res) => {
    const { botId } = req.params;
    const { tag, label, color, category } = req.body ?? {};
    if (!tag || !label) {
      res.status(400).json({ ok: false, error: "Missing required fields: tag, label" });
      return;
    }
    if (typeof tag !== "string" || typeof label !== "string") {
      res.status(400).json({ ok: false, error: "tag and label must be strings" });
      return;
    }
    if (tag.length > 64 || label.length > 128) {
      res.status(400).json({ ok: false, error: "tag must be <= 64 chars, label must be <= 128 chars" });
      return;
    }
    if (color != null && (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))) {
      res.status(400).json({ ok: false, error: "color must be a hex color string (e.g. #FF0000)" });
      return;
    }
    const validCategories = ["environment", "channel", "team", "model", "custom"] as const;
    if (category != null && !validCategories.includes(category)) {
      res.status(400).json({ ok: false, error: `Invalid category: must be one of ${validCategories.join(", ")}` });
      return;
    }
    try {
      const { getFleetTagService } = await import("../services/fleet-tags.js");
      const tagService = getFleetTagService();
      tagService.addTag(botId, { tag, label, color, category: category ?? "custom" });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /api/fleet-monitor/bot/:botId/tags/:tag
   * Remove a tag from a bot.
   */
  router.delete("/bot/:botId/tags/:tag", async (req, res) => {
    const { botId, tag } = req.params;
    try {
      const { getFleetTagService } = await import("../services/fleet-tags.js");
      const tagService = getFleetTagService();
      tagService.removeTag(botId, tag);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/tags/auto-detect
   * Trigger smart auto-tagging based on bot state.
   */
  router.post("/tags/auto-detect", async (_req, res) => {
    try {
      const { getFleetTagService } = await import("../services/fleet-tags.js");
      const tagService = getFleetTagService();
      const detected = await tagService.autoDetect(getFleetMonitorService());
      res.json({ ok: true, detected });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Cost Budgets ─────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/budgets
   * List all cost budgets.
   */
  router.get("/budgets", async (_req, res) => {
    try {
      const { getFleetBudgetService } = await import("../services/fleet-budget.js");
      const budgetService = getFleetBudgetService();
      res.json({ ok: true, budgets: budgetService.getAllBudgets() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/budgets
   * Create a cost budget.
   * Body: { scope, scopeId, monthlyLimitUsd, alertThresholds?, action? }
   */
  router.post("/budgets", async (req, res) => {
    const { scope, scopeId, monthlyLimitUsd, alertThresholds, action } = req.body ?? {};
    if (!scope || !scopeId || monthlyLimitUsd == null) {
      res.status(400).json({ ok: false, error: "Missing required fields: scope, scopeId, monthlyLimitUsd" });
      return;
    }
    const validScopes = ["fleet", "bot", "channel"] as const;
    if (!validScopes.includes(scope)) {
      res.status(400).json({ ok: false, error: `Invalid scope: must be one of ${validScopes.join(", ")}` });
      return;
    }
    if (typeof scopeId !== "string" || scopeId.length === 0) {
      res.status(400).json({ ok: false, error: "scopeId must be a non-empty string" });
      return;
    }
    if (typeof monthlyLimitUsd !== "number" || monthlyLimitUsd <= 0 || !Number.isFinite(monthlyLimitUsd)) {
      res.status(400).json({ ok: false, error: "monthlyLimitUsd must be a positive number" });
      return;
    }
    if (alertThresholds != null) {
      if (!Array.isArray(alertThresholds) || !alertThresholds.every((t: unknown) => typeof t === "number" && t > 0 && t <= 1)) {
        res.status(400).json({ ok: false, error: "alertThresholds must be an array of numbers between 0 and 1" });
        return;
      }
    }
    const validActions = ["alert_only", "alert_and_throttle"] as const;
    if (action != null && !validActions.includes(action)) {
      res.status(400).json({ ok: false, error: `Invalid action: must be one of ${validActions.join(", ")}` });
      return;
    }
    try {
      const { getFleetBudgetService } = await import("../services/fleet-budget.js");
      const budgetService = getFleetBudgetService();
      const budget = budgetService.createBudget({
        scope,
        scopeId,
        monthlyLimitUsd,
        alertThresholds: alertThresholds ?? [0.5, 0.8, 0.95],
        action: action ?? "alert_only",
      });
      res.json({ ok: true, budget });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/budgets/status
   * Get current spending status for all budgets.
   */
  router.get("/budgets/status", async (_req, res) => {
    try {
      const { getFleetBudgetService } = await import("../services/fleet-budget.js");
      const budgetService = getFleetBudgetService();
      const statuses = await budgetService.getAllBudgetStatuses(getFleetMonitorService());
      res.json({ ok: true, statuses });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /api/fleet-monitor/budgets/:id
   * Delete a budget.
   */
  router.delete("/budgets/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { getFleetBudgetService } = await import("../services/fleet-budget.js");
      const budgetService = getFleetBudgetService();
      budgetService.deleteBudget(id);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Fleet Intelligence ───────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/recommendations
   * Get fleet intelligence recommendations.
   */
  router.get("/recommendations", async (_req, res) => {
    try {
      const { getFleetIntelligenceEngine } = await import(
        "../services/fleet-intelligence.js"
      );
      const engine = getFleetIntelligenceEngine();
      const recommendations = await engine.analyze(getFleetMonitorService());
      res.json({ ok: true, recommendations });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/recommendations/:id/dismiss
   * Dismiss a recommendation.
   */
  router.post("/recommendations/:id/dismiss", async (req, res) => {
    const { id } = req.params;
    try {
      const { getFleetIntelligenceEngine } = await import(
        "../services/fleet-intelligence.js"
      );
      const engine = getFleetIntelligenceEngine();
      engine.dismiss(id);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Inter-Bot Communication Graph ───────────────────────────────────

  /**
   * GET /api/fleet-monitor/inter-bot-graph
   * Get the full inter-bot communication graph.
   */
  router.get("/inter-bot-graph", async (_req, res) => {
    try {
      const { getInterBotGraph } = await import(
        "../services/fleet-inter-bot-graph.js"
      );
      const graph = getInterBotGraph();
      res.json({ ok: true, graph: graph.getGraph() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/inter-bot-graph/blast/:botId
   * Calculate blast radius if a specific bot goes offline.
   */
  router.get("/inter-bot-graph/blast/:botId", async (req, res) => {
    const { botId } = req.params;
    try {
      const { getInterBotGraph } = await import(
        "../services/fleet-inter-bot-graph.js"
      );
      const graph = getInterBotGraph();
      const radius = graph.calculateBlastRadius(botId);
      res.json({
        ok: true,
        blastRadius: {
          offlineBot: radius.offlineBot,
          affected: Object.fromEntries(radius.affected),
          totalImpacted: radius.totalImpacted,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/quality
   * Fleet-wide Conversation Quality Index (CQI) — per-bot + fleet-average
   * scores across the 4 quality dimensions, plus a fleet 7-day trend line
   * derived from each bot's daily history. Returns botId only; the UI
   * enriches names/emojis from fleet status (BotQuality carries no identity).
   */
  router.get("/quality", async (_req, res) => {
    try {
      const { getQualityEngine } = await import(
        "../services/fleet-quality.js"
      );
      const engine = getQualityEngine();
      const fleet = engine.getFleetQuality();

      // Fleet 7-day trend: average each bot's daily overall score per date.
      const perDate = new Map<string, { sum: number; count: number }>();
      for (const bot of fleet.bots) {
        for (const entry of bot.history7d) {
          const acc = perDate.get(entry.date) ?? { sum: 0, count: 0 };
          acc.sum += entry.overall;
          acc.count += 1;
          perDate.set(entry.date, acc);
        }
      }
      const trend7d = Array.from(perDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, acc]) => Math.round(acc.sum / acc.count));

      res.json({
        ok: true,
        quality: {
          fleetAvg: fleet.fleetAvg,
          fleetGrade: fleet.fleetGrade,
          dimensions: fleet.dimensions,
          bots: fleet.bots.map((b) => ({
            botId: b.botId,
            overall: b.current.overall,
            grade: b.current.grade,
            trend: b.current.trend,
            comparedToFleetAvg: b.current.comparedToFleetAvg,
            dimensions: b.current.dimensions,
          })),
          trend7d,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Plugin Inventory ──────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/plugin-inventory
   * Get plugin inventory and drift report for all connected bots.
   */
  router.get("/plugin-inventory", async (_req, res) => {
    try {
      const { getFleetPluginInventory } = await import(
        "../services/fleet-plugin-inventory.js"
      );
      const pluginService = getFleetPluginInventory();
      const service = getFleetMonitorService();
      const bots = service.getAllBots().filter((b) => b.state === "monitoring");

      const inventories = await Promise.all(
        bots.map((bot) =>
          pluginService.fetchForBot(
            bot.botId,
            bot.agentId,
            bot.botId, // emoji placeholder
            service.getClient(bot.botId)!,
          ),
        ),
      );

      const driftReport = pluginService.detectDrift(inventories);

      // detectDrift returns slotConflicts[].values as a Map, which JSON
      // serializes to {} — convert to a plain object so the UI receives the
      // pluginId → botIds mapping (the PluginMatrix widget reads it directly).
      const serializedDriftReport = {
        ...driftReport,
        slotConflicts: driftReport.slotConflicts.map((conflict) => ({
          ...conflict,
          values: Object.fromEntries(conflict.values),
        })),
      };

      res.json({ ok: true, inventories, driftReport: serializedDriftReport });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Audit Log ─────────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/audit
   * Query fleet audit log entries.
   * Query: ?companyId=xxx&action=xxx&userId=xxx&limit=50&offset=0
   */
  router.get("/audit", async (req, res) => {
    try {
      const { queryAudit } = await import("../services/fleet-audit.js");
      const result = queryAudit({
        companyId: (req.query.companyId as string) ?? "",
        action: (req.query.action as string) || undefined,
        userId: (req.query.userId as string) || undefined,
        targetType: (req.query.targetType as string) || undefined,
        limit: Math.max(1, Math.min(Number(req.query.limit) || 50, 200)),
        // Floor offset at 0 — a negative offset reaches slice() and returns tail data.
        offset: Math.max(0, Number(req.query.offset) || 0),
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/audit/export
   * Export audit log as CSV.
   * Query: ?companyId=xxx&format=csv
   */
  router.get("/audit/export", async (req, res) => {
    try {
      const { exportAuditCsv } = await import("../services/fleet-audit.js");
      const csv = exportAuditCsv({
        companyId: (req.query.companyId as string) ?? "",
        action: (req.query.action as string) || undefined,
        userId: (req.query.userId as string) || undefined,
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="fleet-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Rate Limit Status ─────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/rate-limits
   * Get rate limit status for all tracked gateways.
   */
  router.get("/rate-limits", async (_req, res) => {
    try {
      const { getFleetRateLimiter } = await import(
        "../services/fleet-rate-limiter.js"
      );
      const limiter = getFleetRateLimiter();
      res.json({
        ok: true,
        gateways: limiter.getAllStatus(),
        batchQueue: {
          pending: limiter.batchQueue.pendingCount,
          estimatedCompletionMs: limiter.batchQueue.estimatedCompletionMs,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ── Bot Avatar Upload ──────────────────────────────────────────────────

  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  /**
   * POST /api/fleet-monitor/bot/:botId/avatar
   * Upload a square avatar image for a bot.
   * Stores as base64 data URL in agent metadata.avatar.
   */
  router.post("/bot/:botId/avatar", (req, res, next) => {
    avatarUpload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ ok: false, error: "Image exceeds 5MB limit" });
          return;
        }
        res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Upload error" });
        return;
      }
      next();
    });
  }, async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const botInfo = service.getBotInfo(botId);

    if (!botInfo) {
      res.status(404).json({ ok: false, error: "Bot not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "Missing file field 'file'" });
      return;
    }

    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    const contentType = (file.mimetype || "").toLowerCase();
    if (!allowed.has(contentType)) {
      res.status(422).json({ ok: false, error: `Unsupported image type: ${contentType}` });
      return;
    }

    const dataUrl = `data:${contentType};base64,${file.buffer.toString("base64")}`;

    if (db) {
      try {
        const [agent] = await db
          .select({ id: agentsTable.id, metadata: agentsTable.metadata })
          .from(agentsTable)
          .where(eq(agentsTable.id, botInfo.agentId));

        if (agent) {
          const existingMeta = (agent.metadata as Record<string, unknown>) ?? {};
          await db
            .update(agentsTable)
            .set({
              metadata: { ...existingMeta, avatar: dataUrl },
              updatedAt: new Date(),
            })
            .where(eq(agentsTable.id, botInfo.agentId));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ ok: false, error: `Failed to save avatar: ${message}` });
        return;
      }
    }

    res.json({ ok: true, botId, avatar: dataUrl });
  });

  /**
   * DELETE /api/fleet-monitor/bot/:botId/avatar
   * Remove avatar from bot metadata.
   */
  router.delete("/bot/:botId/avatar", async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();
    const botInfo = service.getBotInfo(botId);

    if (!botInfo) {
      res.status(404).json({ ok: false, error: "Bot not found" });
      return;
    }

    if (db) {
      try {
        const [agent] = await db
          .select({ id: agentsTable.id, metadata: agentsTable.metadata })
          .from(agentsTable)
          .where(eq(agentsTable.id, botInfo.agentId));

        if (agent) {
          const existingMeta = (agent.metadata as Record<string, unknown>) ?? {};
          const { avatar: _, ...rest } = existingMeta;
          await db
            .update(agentsTable)
            .set({ metadata: rest, updatedAt: new Date() })
            .where(eq(agentsTable.id, botInfo.agentId));
        }
      } catch (err) {
        console.warn(`[fleet] avatar-delete: failed to clear DB metadata for bot ${botId}:`, err instanceof Error ? err.message : err);
      }
    }

    res.json({ ok: true, botId, avatar: null });
  });

  return router;
}
