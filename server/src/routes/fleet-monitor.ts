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
import { eq, inArray, and, gte, sql, desc } from "drizzle-orm";
import { getFleetMonitorService } from "../services/fleet-monitor.js";
import { recordAudit } from "../services/fleet-audit.js";
import { inferChannelFromSessionKey } from "../services/fleet-channels.js";
import { deriveBotHealthScore, healthScoreFromOverall, computeHealthTrend } from "../services/fleet-health-score.js";
import { getFleetMetricsSnapshots } from "../services/fleet-metrics-provider.js";
import type { Experiment } from "../services/fleet-canary.js";
import type { ForecastMetric } from "../services/fleet-capacity.js";

/**
 * Default context window used to compute a bot's context-fill percentage when
 * the bot doesn't advertise its own window in agent metadata. 200K is the
 * Claude standard the OpenClaw fleet runs on; the *numerator* (peak per-turn
 * context tokens) is real live data — only the denominator is a fleet default.
 */
const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Serialize a Canary Lab Experiment into the shape the CanaryLab widget
 * expects: sample *counts* instead of the raw sample arrays, and Date
 * fields rendered as ISO strings.
 */
function serializeExperiment(exp: Experiment) {
  return {
    id: exp.id,
    name: exp.name,
    hypothesis: exp.hypothesis,
    status: exp.status,
    controlGroup: exp.controlGroup,
    testGroup: { botIds: exp.testGroup.botIds, configPatch: exp.testGroup.configPatch },
    metrics: exp.metrics,
    startedAt: exp.startedAt?.toISOString(),
    endAt: exp.endAt?.toISOString(),
    minDurationMs: exp.minDurationMs,
    minSampleSize: exp.minSampleSize,
    guardrails: exp.guardrails,
    controlSampleCount: exp.controlSamples.length,
    testSampleCount: exp.testSamples.length,
    result: exp.result
      ? {
          comparisons: exp.result.comparisons,
          overallVerdict: exp.result.overallVerdict,
          recommendation: exp.result.recommendation,
          totalSamples: exp.result.totalSamples,
        }
      : undefined,
    createdAt: exp.createdAt.toISOString(),
  };
}

export function fleetMonitorRoutes(db?: Db) {
  const router = Router();

  /**
   * GET /api/fleet-monitor/status
   * Returns connection status for all monitored bots, enriched with agent data.
   */
  router.get("/status", async (req, res) => {
    try {
      const service = getFleetMonitorService();
      // Scope to the requesting company — without this the dashboard's core
      // status endpoint returned EVERY tenant's bots (useFleetStatus drives the
      // whole dashboard, sidebar Fleet Pulse, and every widget's bot-name/emoji
      // lookup). The UI always sends ?companyId=. Falls back to the whole fleet
      // only for unscoped/legacy callers.
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const bots = companyId
        ? service.getBotsByCompany(companyId)
        : service.getAllBots();

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

      // The shared metrics provider refreshes a channel-aware health score per
      // connected bot every 30s. Surface it here so the dashboard's "Avg Health
      // Score" KPI (which reads healthScore.overall) is no longer permanently
      // "—", and so the Bot Detail page has a real fallback when its per-bot
      // health RPC hasn't loaded. Empty when the metrics loop isn't running
      // (dev/test without bootstrap) → healthScore stays null (graceful).
      const healthByBot = new Map<string, number>();
      const sessionsByBot = new Map<string, number>();
      const costByBot = new Map<string, number>();
      // Per-bot channel connectivity (connected/total) from the same 30s cache —
      // lets the dashboard cards flag a bot whose customer channels are down
      // without the /status route issuing its own channels RPC per bot.
      const channelsByBot = new Map<string, { connected: number; total: number }>();
      for (const m of getFleetMetricsSnapshots()) {
        healthByBot.set(m.botId, m.healthScore);
        sessionsByBot.set(m.botId, m.activeSessions);
        if (m.monthCostUsd != null) costByBot.set(m.botId, m.monthCostUsd);
        if (m.channelsTotal > 0) {
          channelsByBot.set(m.botId, { connected: m.channelsConnected, total: m.channelsTotal });
        }
      }

      const mappedBots = bots.map((b) => {
        const agent = agentMap.get(b.agentId);
        const meta = agent?.metadata ?? {};
        const cachedHealth = healthByBot.get(b.botId);
        // Live peak context tokens from the trace buffer (falls back to any
        // persisted metadata value); denominator prefers a bot-advertised window.
        const metaContextMax =
          typeof meta.contextMaxTokens === "number" ? meta.contextMaxTokens : null;
        const contextTokens =
          service.getBotContextTokens(b.botId) ??
          (typeof meta.contextTokens === "number" ? meta.contextTokens : null);
        const connectedSinceMs = b.connectedSince ? new Date(b.connectedSince).getTime() : null;
        // The bot's emoji lives in metadata.emoji. `agent.icon` is a lucide
        // icon-name key (e.g. "bot") for the standard agent UI — never render it
        // as an emoji (that surfaced literal "bot" text on the dashboard). Older
        // ConnectBot records stored the raw emoji in `icon`, so fall back to it
        // only when it isn't a plain lucide-name token. Mirrors agentToBotStatus
        // (the DB-fallback mapper) so the live and fallback paths agree.
        const metaEmoji = typeof meta.emoji === "string" ? meta.emoji : "";
        const iconIsEmoji =
          agent?.icon != null && agent.icon !== "" && !/^[a-z0-9-]+$/i.test(agent.icon);
        return {
          botId: b.botId,
          agentId: b.agentId,
          name: agent?.name ?? b.botId,
          emoji: metaEmoji || (iconIsEmoji ? agent!.icon! : ""),
          // Map internal state to client BotConnectionState
          connectionState: b.state,
          healthScore:
            cachedHealth != null ? healthScoreFromOverall(cachedHealth) : null,
          freshness: b.dataFreshness ?? {
            lastUpdated: b.lastEventAt ?? new Date().toISOString(),
            source: "realtime",
            staleAfterMs: 30000,
          },
          gatewayUrl: b.gatewayUrl,
          gatewayVersion: b.capabilities?.serverVersion ?? null,
          channels: [],
          // Real live session count from the shared metrics cache (refreshed
          // every 30s). Was hardcoded 0, which left the dashboard "Active
          // Sessions" KPI and the per-bot session badge permanently empty even
          // when bots had live sessions. Falls back to 0 when the metrics loop
          // isn't running (dev/test without bootstrap).
          activeSessions: sessionsByBot.get(b.botId) ?? 0,
          uptime: connectedSinceMs ? Date.now() - connectedSinceMs : null,
          // typeof-string guards (not unchecked `as string` casts) so a
          // non-string metadata value can't leak through — mirrors the hardened
          // DB-fallback mapper agentToBotStatus (#259).
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          // Prefer the rich fleet role ID preserved in metadata (e.g.
          // "head-sales") over the coarse DB `role` enum, so the org chart and
          // pixel-art avatar palette colour by exact department. Mirrors
          // agentToBotStatus (the DB-fallback mapper).
          roleId: (typeof meta.roleId === "string" ? meta.roleId : null) ?? agent?.role ?? null,
          description:
            (typeof meta.description === "string" ? meta.description : null) ??
            agent?.title ??
            null,
          // Context-window occupancy: prefer the live peak context tokens from
          // the bot's most recent agent turn (in-memory trace buffer, no RPC);
          // fall back to any value persisted in agent metadata. The window
          // denominator prefers a bot-advertised value, else the fleet default.
          // Was permanently null (nothing ever wrote meta.contextTokens), so the
          // ContextBar never rendered on any bot — a dead Phase-3 feature.
          contextTokens,
          contextMaxTokens:
            contextTokens != null ? metaContextMax ?? DEFAULT_CONTEXT_WINDOW : metaContextMax,
          // Prefer the live month-to-date token cost from the metrics cache —
          // fleet bots write no costEvents so the DB `spentMonthlyCents` column
          // stays 0. Fall back to the DB value when the usage RPC is unavailable.
          monthCostUsd:
            costByBot.get(b.botId) ?? (agent ? agent.spentMonthlyCents / 100 : null),
          monthBudgetUsd: agent && agent.budgetMonthlyCents > 0
            ? agent.budgetMonthlyCents / 100
            : null,
          // Filter to strings — a non-string element (corrupt/legacy record)
          // would otherwise reach the dashboard's SkillBadges + the search
          // filter's `.toLowerCase()` and crash it. Mirrors agentToBotStatus.
          skills: Array.isArray(meta.skills)
            ? (meta.skills as unknown[]).filter(
                (s): s is string => typeof s === "string",
              )
            : [],
          // Live per-bot channel connectivity from the metrics cache (null when
          // the bot has no channels / the RPC hasn't run yet). Lets the
          // dashboard card flag a bot whose customer channels are down.
          channelsConnected: channelsByBot.get(b.botId)?.connected ?? null,
          channelsTotal: channelsByBot.get(b.botId)?.total ?? null,
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

      // Ensure the DB agent reflects the live connection. On a fresh launch the
      // agent is already "active"; this reactivates an agent that was paused by
      // a prior disconnect (symmetric with the disconnect handler below) so the
      // Dashboard's DB fallback renders it as "monitoring" again.
      if (db) {
        try {
          await db
            .update(agentsTable)
            .set({ status: "active", updatedAt: new Date() })
            .where(eq(agentsTable.id, agentId));
        } catch (err) {
          console.warn(
            `[fleet] connect: failed to mark agent ${agentId} active:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      // Probe the freshly-connected bot for its live identity + channels so the
      // client receives the full ConnectBotResponse shape (botId, identity,
      // channels) instead of a bare { ok, bot }. Both the ConnectBotWizard and
      // the onboarding launch rely on the connection actually being established;
      // this probe is best-effort and never fails the (already live) connect.
      let identity: { name: string; emoji: string | null; description: string | null } | null = null;
      let channels: Record<string, unknown>[] = [];
      let skills: string[] = [];
      try {
        const rawIdentity = await service.getBotIdentity(botId);
        if (rawIdentity) {
          identity = {
            name: typeof rawIdentity.name === "string" ? rawIdentity.name : "Unknown Bot",
            emoji: typeof rawIdentity.emoji === "string" ? rawIdentity.emoji : null,
            description:
              typeof rawIdentity.description === "string"
                ? rawIdentity.description
                : typeof rawIdentity.bio === "string"
                  ? rawIdentity.bio
                  : null,
          };
          if (Array.isArray(rawIdentity.skills)) {
            skills = (rawIdentity.skills as unknown[]).filter(
              (s): s is string => typeof s === "string",
            );
          }
        }
        const rawChannels = await service.getBotChannels(botId);
        if (Array.isArray(rawChannels)) channels = rawChannels;
      } catch {
        /* identity/channel probe is best-effort — the connection is already live */
      }

      // Backfill the DB agent's live identity (skills, emoji, description) from
      // the gateway when discovery left those fields blank. The onboarding-launch
      // path persists discovery-time metadata (the mDNS/port scan often surfaces
      // no skills and only a fallback emoji/description) and then discards the
      // connect response, so without this a launched bot never shows SkillBadges
      // or its real emoji/bio even though the live gateway reports them. Additive
      // + non-destructive: each field only fills in when the stored value is
      // empty, so a curated skill list / emoji / description is never clobbered.
      const liveEmoji = identity?.emoji ?? null;
      const liveDescription = identity?.description ?? null;
      const liveName =
        identity && identity.name !== "Unknown Bot" && identity.name.trim()
          ? identity.name.trim()
          : null;
      if (db && (skills.length > 0 || liveEmoji || liveDescription || liveName)) {
        try {
          const row = await db
            .select({ metadata: agentsTable.metadata, name: agentsTable.name })
            .from(agentsTable)
            .where(eq(agentsTable.id, agentId))
            .then((rows) => rows[0] ?? null);
          const meta =
            row?.metadata && typeof row.metadata === "object"
              ? (row.metadata as Record<string, unknown>)
              : {};
          const storedSkills = Array.isArray(meta.skills)
            ? (meta.skills as unknown[]).filter((s) => typeof s === "string")
            : [];
          const patch: Record<string, unknown> = {};
          if (skills.length > 0 && storedSkills.length === 0) patch.skills = skills;
          if (liveEmoji && !(typeof meta.emoji === "string" && meta.emoji.trim()))
            patch.emoji = liveEmoji;
          if (
            liveDescription &&
            !(typeof meta.description === "string" && meta.description.trim())
          )
            patch.description = liveDescription;
          const update: Record<string, unknown> = {};
          if (Object.keys(patch).length > 0) update.metadata = { ...meta, ...patch };
          // Only replace an obvious discovery fallback name ("Bot :<port>") — a
          // real or operator-set name is never overwritten by the live probe.
          if (liveName && typeof row?.name === "string" && /^Bot :/.test(row.name))
            update.name = liveName;
          if (Object.keys(update).length > 0) {
            update.updatedAt = new Date();
            await db.update(agentsTable).set(update).where(eq(agentsTable.id, agentId));
          }
        } catch (err) {
          console.warn(
            `[fleet] connect: failed to backfill identity for agent ${agentId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      recordAudit(req, {
        companyId,
        action: "bot.connect",
        targetType: "bot",
        targetId: botId,
        details: { agentId, gatewayUrl },
      });
      res.json({ ok: true, botId, identity, channels, skills, healthScore: null, bot: info });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordAudit(req, {
        companyId,
        action: "bot.connect",
        targetType: "bot",
        targetId: botId,
        details: { gatewayUrl, error: message },
        result: "error",
      });
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

    // Surface the bot's skills so the ConnectBotWizard can persist them on the
    // created DB agent (same as the onboarding discovery path, which reads
    // health.skills). Without this a standalone-connected bot never showed its
    // SkillBadges on the dashboard / detail page. The gateway exposes skills on
    // /health (preferred) or /identity.
    const skills = Array.isArray(health.skills)
      ? (health.skills as unknown[]).filter((s): s is string => typeof s === "string")
      : idData && Array.isArray(idData.skills)
        ? (idData.skills as unknown[]).filter((s): s is string => typeof s === "string")
        : [];

    res.json({
      ok: true,
      status: "connected",
      version,
      identity,
      channels,
      skills,
      error: null,
    });
  });

  /**
   * DELETE /api/fleet-monitor/disconnect/:botId
   * Disconnect a bot and stop monitoring.
   */
  router.delete("/disconnect/:botId", async (req, res) => {
    const { botId } = req.params;
    const service = getFleetMonitorService();

    const info = service.getBotInfo(botId);
    if (!info) {
      res.status(404).json({ ok: false, error: "Bot not found" });
      return;
    }

    // Tenant-ownership guard: the bot id is in the path (this route is NOT under
    // the /bot/:botId prefix guard), so the caller supplies ownership via
    // ?companyId=. Reject a cross-tenant disconnect with 404 (never 403 — avoids
    // leaking another tenant's bot). Unscoped/admin callers proceed.
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    if (companyId && info.companyId && info.companyId !== companyId) {
      res.status(404).json({ ok: false, error: "Bot not found" });
      return;
    }

    service.disconnectBot(botId);

    // Mark the DB agent dormant so the Dashboard's DB fallback
    // (agentToBotStatus: status === "active" → connectionState "monitoring") no
    // longer renders the just-disconnected bot as a live "monitoring" card.
    // Without this the bot reappears green on the next dashboard load and
    // Disconnect looks like a no-op. Best-effort — the live connection is
    // already dropped regardless of the DB write.
    if (db) {
      try {
        await db
          .update(agentsTable)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(agentsTable.id, info.agentId));
      } catch (err) {
        console.warn(
          `[fleet] disconnect: failed to mark agent ${info.agentId} paused:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    recordAudit(req, {
      companyId: info.companyId,
      action: "bot.disconnect",
      targetType: "bot",
      targetId: botId,
      details: { agentId: info.agentId },
    });
    res.json({ ok: true, botId });
  });

  /**
   * Tenant-ownership guard for every /bot/:botId/* endpoint (reads AND
   * mutations). The bot id is in the path, so the caller supplies ownership
   * via ?companyId= on every method. When a companyId is present and the bot
   * is connected but owned by a different company, respond 404 (never 403 —
   * avoids leaking the existence of another tenant's bot). A caller with no
   * ?companyId= (legacy/admin) or a disconnected bot (nothing reachable over
   * the gateway RPC) proceeds. NOTE: req.body is not parsed at this prefix
   * stage in Express, so the guard reads companyId from the query only.
   */
  router.use("/bot/:botId", (req, res, next) => {
    const botId = String(req.params.botId ?? "");
    const companyId =
      typeof req.query.companyId === "string" ? req.query.companyId : "";
    if (companyId) {
      const info = getFleetMonitorService().getBotInfo(botId);
      if (info && info.companyId && info.companyId !== companyId) {
        res.status(404).json({ ok: false, error: "Bot not found" });
        return;
      }
    }
    next();
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

      const snapshot = await service.getBotHealth(botId);
      if (!snapshot) {
        res.status(404).json({ ok: false, error: "Bot not found or health unavailable" });
        return;
      }

      // The gateway RPC returns a raw BotHealthSnapshot ({ ok, status, channels }),
      // but the client types + renders this as a BotHealthScore ({ overall,
      // breakdown, trend, grade }) — reading health.breakdown.connectivity, which
      // threw and blanked the entire Bot Detail health card for every live bot.
      // Convert the snapshot into a real BotHealthScore using the shared,
      // channel-aware fleet-standard derivation so the detail card agrees with
      // the dashboard KPI / heatmap / metrics feed.
      const info = service.getBotInfo(botId);
      const channelList = Array.isArray(snapshot.channels) ? snapshot.channels : [];
      const totalChannels = channelList.length;
      const connectedChannels = channelList.filter((c) => {
        const status = (c as { status?: unknown }).status;
        const connected = (c as { connected?: unknown }).connected;
        return status === "connected" || connected === true;
      }).length;

      // Fetch cron + usage in parallel so the breakdown's cron + efficiency
      // dimensions are REAL (gateway cron.list outcomes + sessions.usage cache
      // ratio) instead of mirroring the composite. Best-effort — a failed RPC
      // leaves the dimension mirroring the composite (undefined signal).
      const [cronJobs, usage] = await Promise.all([
        service.getBotCronJobs(botId).catch(() => null),
        service.getBotUsage(botId).catch(() => null),
      ]);
      let cronTotalRuns: number | undefined;
      let cronSuccessRuns: number | undefined;
      if (Array.isArray(cronJobs)) {
        // A "run" is any cron job that has executed (has a lastRunStatus);
        // success = lastRunStatus === "success".
        const ran = cronJobs.filter((j) => typeof (j as { lastRunStatus?: unknown }).lastRunStatus === "string");
        cronTotalRuns = ran.length;
        cronSuccessRuns = ran.filter((j) => (j as { lastRunStatus?: unknown }).lastRunStatus === "success").length;
      }
      const cachedInputTokens = usage?.total?.cachedInputTokens;
      const totalInputTokens = usage?.total?.inputTokens;

      const health = deriveBotHealthScore({
        connectionState: info?.state ?? "monitoring",
        healthOk: snapshot.ok === true,
        connectedChannels,
        totalChannels,
        cronTotalRuns,
        cronSuccessRuns,
        cachedInputTokens,
        totalInputTokens,
        // Real responsiveness from the gateway client's measured average RPC
        // round-trip latency (null when no RPC has completed → mirrors composite).
        responsivenessLatencyMs: service.getBotLatencyMs(botId) ?? undefined,
      });

      // Real health trend from the fleet_snapshots history (captured every
      // 15 min). Was hardcoded "stable" in deriveBotHealthScore, so the Bot
      // Detail "Trend" line never reflected an actual improving/degrading
      // trajectory. fleet_snapshots.botId is the agent UUID, so resolve it via
      // getBotInfo. Best-effort — no db / no agentId / thin history → "stable".
      if (db && info?.agentId) {
        try {
          const rows = await db
            .select({ healthScore: fleetSnapshots.healthScore })
            .from(fleetSnapshots)
            .where(eq(fleetSnapshots.botId, info.agentId))
            .orderBy(desc(fleetSnapshots.capturedAt))
            .limit(16);
          // rows are newest→oldest; computeHealthTrend wants oldest→newest.
          health.trend = computeHealthTrend(rows.map((r) => r.healthScore).reverse());
        } catch {
          /* best-effort: keep the derived "stable" trend on query failure */
        }
      }

      res.json({ ok: true, health, freshness: info?.dataFreshness ?? null });
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
      const raw = await service.getBotSessions(botId);
      // Normalize to the client `BotSession` contract — the gateway may omit
      // messageCount / timestamps, and the UI treats them as required (renders
      // "{messageCount} msgs"). Without this a bare session shows "undefined msgs".
      const sessions = raw.map((s) => ({
        sessionKey: s.sessionKey,
        title: s.title ?? null,
        createdAt: s.createdAt ?? "",
        lastActivityAt: s.lastActivityAt ?? s.createdAt ?? "",
        messageCount: typeof s.messageCount === "number" ? s.messageCount : 0,
      }));
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
  router.get("/config-drift", async (req, res) => {
    const service = getFleetMonitorService();
    // Scope to the requesting company — without this the detector compared
    // bots across ALL tenants, leaking config values and reporting false
    // cross-tenant drift. The UI always sends companyId.
    const companyId =
      typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    try {
      // Lazy-import to avoid circular dependency
      const { getFleetConfigDriftDetector } = await import(
        "../services/fleet-config-drift.js"
      );
      const detector = getFleetConfigDriftDetector();
      const report = await detector.analyze(service, companyId);
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

    // Scope to the requesting company — without this the breakdown summed token
    // costs across ALL tenants into one channel report. The UI always sends it.
    const companyId =
      typeof req.query.companyId === "string" ? req.query.companyId : undefined;

    try {
    const service = getFleetMonitorService();
    const bots = (companyId
      ? service.getBotsByCompany(companyId)
      : service.getAllBots()
    ).filter((b) => b.state === "monitoring");

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
            const channel = inferChannelFromSessionKey(session.sessionKey);

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
  router.get("/tags", async (req, res) => {
    try {
      const { getFleetTagService } = await import("../services/fleet-tags.js");
      const tagService = getFleetTagService();
      // Scope to the requesting company — without this the filter bar showed
      // tags derived from EVERY tenant's bots (useFleetTags drives the
      // company-scoped dashboard + CommandCenter tag filters). The UI sends
      // ?companyId=. Falls back to all tags only for unscoped/legacy callers.
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      let botIds: Set<string> | undefined;
      if (companyId) {
        const service = getFleetMonitorService();
        botIds = new Set(service.getBotsByCompany(companyId).map((b) => b.botId));
      }
      res.json({ ok: true, tags: tagService.getAllTags(botIds) });
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
      const companyId = getFleetMonitorService().getBotInfo(botId)?.companyId;
      if (companyId) {
        recordAudit(req, {
          companyId,
          action: "tag.add",
          targetType: "tag",
          targetId: botId,
          details: { tag, label, category: category ?? "custom" },
        });
      }
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
      const companyId = getFleetMonitorService().getBotInfo(botId)?.companyId;
      if (companyId) {
        recordAudit(req, {
          companyId,
          action: "tag.remove",
          targetType: "tag",
          targetId: botId,
          details: { tag },
        });
      }
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
   * GET /api/fleet-monitor/budgets?companyId=xxx
   * List cost budgets, scoped to a company (tenant) when companyId is given.
   */
  router.get("/budgets", async (req, res) => {
    try {
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const { getFleetBudgetService } = await import("../services/fleet-budget.js");
      const budgetService = getFleetBudgetService();
      res.json({ ok: true, budgets: budgetService.getAllBudgets(companyId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/budgets
   * Create a cost budget.
   * Body: { companyId, scope, scopeId, monthlyLimitUsd, alertThresholds?, action? }
   */
  router.post("/budgets", async (req, res) => {
    const { companyId, scope, scopeId, monthlyLimitUsd, alertThresholds, action } = req.body ?? {};
    if (!scope || !scopeId || monthlyLimitUsd == null) {
      res.status(400).json({ ok: false, error: "Missing required fields: scope, scopeId, monthlyLimitUsd" });
      return;
    }
    if (typeof companyId !== "string" || companyId.length === 0) {
      res.status(400).json({ ok: false, error: "companyId must be a non-empty string" });
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
        companyId,
        scope,
        scopeId,
        monthlyLimitUsd,
        alertThresholds: alertThresholds ?? [0.5, 0.8, 0.95],
        action: action ?? "alert_only",
      });
      // Audit the write — budget changes affect spend limits + throttling, so
      // they belong in the "all fleet operations are logged" trail. #166 deferred
      // this as an ambiguous scopeId→companyId mapping; budgets now carry a real
      // companyId (#192), so it can be recorded correctly.
      recordAudit(req, {
        companyId,
        action: "budget.create",
        targetType: "budget",
        targetId: budget.id,
        details: { scope, scopeId, monthlyLimitUsd, action: action ?? "alert_only" },
      });
      res.json({ ok: true, budget });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /api/fleet-monitor/budgets/status?companyId=xxx
   * Get current spending status for budgets, scoped to a company when given.
   */
  router.get("/budgets/status", async (req, res) => {
    try {
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const { getFleetBudgetService } = await import("../services/fleet-budget.js");
      const budgetService = getFleetBudgetService();
      const statuses = await budgetService.getAllBudgetStatuses(getFleetMonitorService(), companyId);
      res.json({ ok: true, statuses });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /api/fleet-monitor/budgets/:id?companyId=xxx
   * Delete a budget. When companyId is supplied it must own the budget —
   * a mismatch is reported 404 (not 403) so a caller can't probe the
   * existence of another tenant's budget by id.
   */
  router.delete("/budgets/:id", async (req, res) => {
    const { id } = req.params;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    try {
      const { getFleetBudgetService } = await import("../services/fleet-budget.js");
      const budgetService = getFleetBudgetService();
      // Capture the budget's details BEFORE deleting so the audit entry is
      // meaningful (scope/scopeId/limit), then delete under the tenant guard.
      const budget = budgetService.getBudget(id);
      const deleted = budgetService.deleteBudget(id, companyId);
      if (!deleted) {
        res.status(404).json({ ok: false, error: "Budget not found" });
        return;
      }
      // Audit the write — attribute to the budget's owning tenant.
      if (budget?.companyId) {
        recordAudit(req, {
          companyId: budget.companyId,
          action: "budget.delete",
          targetType: "budget",
          targetId: id,
          details: {
            scope: budget.scope,
            scopeId: budget.scopeId,
            monthlyLimitUsd: budget.monthlyLimitUsd,
          },
        });
      }
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
  router.get("/recommendations", async (req, res) => {
    try {
      const { getFleetIntelligenceEngine } = await import(
        "../services/fleet-intelligence.js"
      );
      const engine = getFleetIntelligenceEngine();
      const companyId =
        typeof req.query.companyId === "string" && req.query.companyId
          ? req.query.companyId
          : undefined;
      const recommendations = await engine.analyze(
        getFleetMonitorService(),
        companyId,
      );
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
  router.get("/inter-bot-graph", async (req, res) => {
    try {
      const { getInterBotGraph } = await import(
        "../services/fleet-inter-bot-graph.js"
      );
      const graph = getInterBotGraph();
      // Scope to the requesting company — without this a company's Network tab
      // leaked every other tenant's bot nodes + edges.
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      res.json({ ok: true, graph: graph.getGraph(companyId) });
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
      // Scope the blast traversal to the requesting company so one tenant can't
      // compute impact over another tenant's graph.
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const radius = graph.calculateBlastRadius(botId, companyId);
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
  router.get("/quality", async (req, res) => {
    try {
      const { getQualityEngine } = await import(
        "../services/fleet-quality.js"
      );
      const engine = getQualityEngine();
      // Scope to the requesting company — without this the fleet CQI summary
      // aggregated bots across ALL tenants and the company-scoped Quality tab
      // leaked other companies' bot scores.
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const fleet = engine.getFleetQuality(companyId);

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
  router.get("/plugin-inventory", async (req, res) => {
    try {
      const { getFleetPluginInventory } = await import(
        "../services/fleet-plugin-inventory.js"
      );
      const pluginService = getFleetPluginInventory();
      const service = getFleetMonitorService();
      // Scope to the requesting company — without this the matrix and drift
      // report aggregated bots across ALL tenants (the Intelligence ▸ Plugins
      // tab is company-scoped). Other tenants' bots leaked in as raw botIds
      // and produced false cross-tenant slot conflicts / channel-gap drift.
      const companyId =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const bots = (companyId
        ? service.getBotsByCompany(companyId)
        : service.getAllBots()
      ).filter((b) => b.state === "monitoring");

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

    // Audit the write — the avatar DELETE was already logged, but the UPLOAD
    // (which changes how the bot is presented fleet-wide) was silently unlogged,
    // leaving a gap in the "all fleet operations are logged" audit trail.
    recordAudit(req, {
      companyId: botInfo.companyId,
      action: "bot.avatar.upload",
      targetType: "bot",
      targetId: botId,
      details: { contentType, bytes: file.size },
    });

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

    recordAudit(req, {
      companyId: botInfo.companyId,
      action: "bot.avatar.delete",
      targetType: "bot",
      targetId: botId,
    });
    res.json({ ok: true, botId, avatar: null });
  });

  // ─── Canary Lab (A/B experiments) ──────────────────────────────────────

  /**
   * GET /api/fleet-monitor/canary/experiments
   * List all A/B experiments (control vs test config), serialized to the
   * CanaryLab widget shape. The engine is fed live metric samples every
   * 60s by fleet-bootstrap's collectSamples handler.
   */
  router.get("/canary/experiments", async (_req, res) => {
    try {
      const { getCanaryLabEngine } = await import("../services/fleet-canary.js");
      const engine = getCanaryLabEngine();
      res.json({ ok: true, experiments: engine.listExperiments().map(serializeExperiment) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/canary/experiments/:id/start */
  router.post("/canary/experiments/:id/start", async (req, res) => {
    try {
      const { getCanaryLabEngine } = await import("../services/fleet-canary.js");
      const exp = getCanaryLabEngine().startExperiment(req.params.id);
      res.json({ ok: true, experiment: serializeExperiment(exp) });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/canary/experiments/:id/pause */
  router.post("/canary/experiments/:id/pause", async (req, res) => {
    try {
      const { getCanaryLabEngine } = await import("../services/fleet-canary.js");
      const exp = getCanaryLabEngine().pauseExperiment(req.params.id);
      res.json({ ok: true, experiment: serializeExperiment(exp) });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/canary/experiments/:id/abort  body: { reason?: string } */
  router.post("/canary/experiments/:id/abort", async (req, res) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason : "Manual abort";
      const { getCanaryLabEngine } = await import("../services/fleet-canary.js");
      const exp = getCanaryLabEngine().abortExperiment(req.params.id, reason);
      res.json({ ok: true, experiment: serializeExperiment(exp) });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** POST /api/fleet-monitor/canary/experiments/:id/complete */
  router.post("/canary/experiments/:id/complete", async (req, res) => {
    try {
      const { getCanaryLabEngine } = await import("../services/fleet-canary.js");
      const exp = getCanaryLabEngine().completeExperiment(req.params.id);
      res.json({ ok: true, experiment: serializeExperiment(exp) });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Capacity Planner (Holt-Winters forecasts) ─────────────────────────

  /**
   * GET /api/fleet-monitor/capacity/forecasts
   * Returns cost + session-count forecasts for the whole fleet, each with
   * its historical series (for the chart). The planner is fed one daily
   * data point per metric by fleet-bootstrap's refreshData handler; a
   * forecast needs ≥3 points, so a young fleet returns null forecasts.
   *
   * Query: ?horizonDays=14&budgetThreshold=500
   */
  router.get("/capacity/forecasts", async (req, res) => {
    try {
      const rawHorizon = Number(req.query.horizonDays);
      const horizonDays =
        Number.isFinite(rawHorizon) && rawHorizon > 0 ? Math.min(Math.floor(rawHorizon), 90) : 14;
      const rawBudget = Number(req.query.budgetThreshold);
      const budgetThreshold =
        Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : undefined;

      const { getCapacityPlanner } = await import("../services/fleet-capacity.js");
      const planner = getCapacityPlanner();
      const entity = "fleet";

      // Historical numbers carry no timestamps; synthesize daily dates ending
      // today (matching the forecast points' daily cadence) so the chart can
      // plot the series. This is an approximation — the planner stores values
      // only, in daily push order.
      const withHistorical = (metric: ForecastMetric) => {
        const forecast = planner.forecast(entity, metric, { horizonDays, budgetThreshold });
        if (!forecast) return null;
        const values = planner.getHistoricalData(entity, metric) ?? [];
        const today = new Date();
        const historical = values.map((value, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - (values.length - 1 - i));
          return { date: d.toISOString().slice(0, 10), value };
        });
        return { ...forecast, historical };
      };

      res.json({
        ok: true,
        cost: withHistorical("cost_usd"),
        sessions: withHistorical("session_count"),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
