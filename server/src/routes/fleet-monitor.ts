/**
 * Fleet Monitor API Routes
 *
 * Endpoints for managing bot connections and querying bot data
 * through the FleetMonitorService.
 */

import { Router } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { eq, inArray } from "drizzle-orm";
import { getFleetMonitorService } from "../services/fleet-monitor.js";

export function fleetMonitorRoutes(db?: Db) {
  const router = Router();

  /**
   * GET /api/fleet-monitor/status
   * Returns connection status for all monitored bots, enriched with agent data.
   */
  router.get("/status", async (_req, res) => {
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
   * POST /api/fleet-monitor/test-connection
   * Standalone test: probe a gateway URL for identity and channels without
   * creating a persistent connection. Used by ConnectBotWizard step 2.
   *
   * Body: { gatewayUrl, token }
   */
  router.post("/test-connection", async (req, res) => {
    const { gatewayUrl, token } = req.body ?? {};

    if (!gatewayUrl) {
      res.status(400).json({ ok: false, error: "Missing gatewayUrl", status: "error", version: null, identity: null });
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

      const dateRange = from && to
        ? { from: String(from), to: String(to) }
        : undefined;

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
    const limit = Math.min(Number(req.query.limit) || 50, 200);

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
  });

  /**
   * GET /api/fleet-monitor/fleet/:companyId/heatmap
   * Return hourly health snapshots for heatmap rendering.
   *
   * Query: ?days=28&botId=xxx (optional)
   */
  router.get("/fleet/:companyId/heatmap", async (req, res) => {
    const { companyId } = req.params;
    const days = Math.min(Number(req.query.days) || 28, 90);
    const botId = req.query.botId as string | undefined;

    // In production, this would query fleet_snapshots table.
    // For now, return the structure the frontend expects.
    const cutoff = new Date(Date.now() - days * 24 * 3600_000);
    res.json({
      ok: true,
      companyId,
      days,
      botId: botId ?? null,
      cells: [], // Populated from fleet_snapshots in production
      note: "Heatmap data populated from fleet_snapshots table after sufficient data collection.",
    });
  });

  // ─── Agent Turn Traces ─────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/bot/:botId/traces
   * List recent completed traces for a bot.
   * Query: ?limit=50
   */
  router.get("/bot/:botId/traces", (req, res) => {
    const { botId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
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
    if (!scope || !scopeId || !monthlyLimitUsd) {
      res.status(400).json({ ok: false, error: "Missing required fields: scope, scopeId, monthlyLimitUsd" });
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
      const matrix = pluginService.buildMatrix(inventories);

      res.json({ ok: true, inventories, driftReport, matrix });
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
        limit: Math.min(Number(req.query.limit) || 50, 200),
        offset: Number(req.query.offset) || 0,
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

    const file = (req as unknown as { file?: { mimetype: string; buffer: Buffer } }).file;
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
