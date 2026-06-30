/**
 * Fleet Bootstrap — Wires fleet monitoring services into the server lifecycle.
 *
 * Handles:
 * - Starting the FleetAlertService evaluation loop
 * - Connecting fleet events to the LiveEvent system
 * - Starting Canary Lab, Quality Engine, and Capacity Planner
 * - Graceful shutdown (3-phase: pause → drain → force-close)
 */

import type { Db } from "@paperclipai/db";
import { logger } from "./middleware/logger.js";
import {
  getFleetMonitorService,
  disposeFleetMonitorService,
} from "./services/fleet-monitor.js";
import { captureFleetSnapshots } from "./services/fleet-snapshot-capture.js";
import { getFleetAlertService } from "./services/fleet-alerts.js";
import type { Alert } from "./services/fleet-alerts.js";
import { getIncidentManager } from "./services/fleet-incidents.js";
import { getInterBotGraph, disposeInterBotGraph } from "./services/fleet-inter-bot-graph.js";
import { getFleetRateLimiter, disposeFleetRateLimiter } from "./services/fleet-rate-limiter.js";
import { getCanaryLabEngine, disposeCanaryLabEngine } from "./services/fleet-canary.js";
import { getQualityEngine, disposeQualityEngine } from "./services/fleet-quality.js";
import { getCapacityPlanner, disposeCapacityPlanner } from "./services/fleet-capacity.js";
import { getCustomerJourneyEngine, disposeCustomerJourneyEngine } from "./services/fleet-customer-journey-singleton.js";
import { getMetaLearningEngine, disposeMetaLearningEngine } from "./services/fleet-meta-learning-singleton.js";
import { getAnomalyCorrelationEngine, disposeAnomalyCorrelationEngine } from "./services/fleet-anomaly-correlation-singleton.js";
import { getMemoryMeshEngine, disposeMemoryMeshEngine } from "./services/fleet-memory-mesh-singleton.js";
import { getVoiceIntelligenceEngine, disposeVoiceIntelligenceEngine } from "./services/fleet-voice-intelligence-singleton.js";

let booted = false;
let alertInterval: ReturnType<typeof setInterval> | null = null;
let snapshotInterval: ReturnType<typeof setInterval> | null = null;
let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;
let graphMetaInterval: ReturnType<typeof setInterval> | null = null;
let graphMetaTimeout: ReturnType<typeof setTimeout> | null = null;

// Capture a snapshot row per connected bot every 15 minutes. The heatmap
// query averages rows into day/hour buckets, so sub-hourly capture just
// smooths the average while making fresh data visible within minutes
// rather than after a full hour.
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
// Delay the first capture so bots have time to connect + authenticate
// after server boot (otherwise the first batch records everything as
// "connecting" / score 25).
const SNAPSHOT_INITIAL_DELAY_MS = 90 * 1000;

// Refresh inter-bot graph node metadata (name/emoji/health) every 5 minutes.
// Edges are fed live from agent events (sessions_send/sessions_spawn), but the
// node labels + health come from each bot's identity/health and would otherwise
// stay as raw botIds with health 0. Same 90s initial delay so identities are
// resolvable before the first refresh.
const GRAPH_META_INTERVAL_MS = 5 * 60 * 1000;
const GRAPH_META_INITIAL_DELAY_MS = 90 * 1000;

/**
 * Bootstrap fleet monitoring services after server.listen().
 *
 * Routes are already mounted in app.ts — this function handles the
 * lifecycle concerns that routes can't: event wiring, alert scheduling,
 * and shutdown registration.
 */
export function bootstrapFleet(db?: Db): void {
  if (booted) return;

  const monitor = getFleetMonitorService();
  const alerts = getFleetAlertService();

  // ─── Start alert evaluation loop (every 30s) ──────────────────────────
  alertInterval = setInterval(() => {
    try {
      alerts.evaluate();
    } catch (err) {
      logger.error({ err }, "[Fleet] Alert evaluation tick failed");
    }
  }, 30_000);

  // ─── Wire alerts → incidents ──────────────────────────────────────────
  // A serious alert (critical/warning) firing opens a fleet incident so the
  // Incidents page reflects live operational events, not just manually-filed
  // ones. Deduped by alert source so the same recurring alert doesn't spawn a
  // pile of duplicate open incidents — one open incident per (rule, bot) until
  // it's resolved. info-severity alerts are skipped (too noisy for incidents).
  alerts.on("alert.fired", (alert: Alert) => {
    try {
      if (alert.severity !== "critical" && alert.severity !== "warning") return;
      const manager = getIncidentManager();
      const source = `alert:${alert.ruleId}:${alert.botId}`;
      if (manager.findOpenIncidentBySource(source)) return;
      manager.createIncident({
        title: alert.ruleName,
        description: alert.message,
        severity: alert.severity === "critical" ? "critical" : "major",
        affectedBots: [alert.botId],
        source,
      });
    } catch (err) {
      logger.error({ err }, "[Fleet] Incident creation from alert failed");
    }
  });

  // ─── Start fleet snapshot capture loop ────────────────────────────────
  // Persists each connected bot's health/usage into fleet_snapshots so the
  // Fleet Health Heatmap has real data. Requires a db handle — skipped in
  // contexts where none is provided (e.g. tests).
  if (db) {
    const runCapture = () => {
      captureFleetSnapshots(db).catch((err) => {
        logger.warn({ err }, "[Fleet] snapshot capture batch failed");
      });
    };
    snapshotTimeout = setTimeout(() => {
      runCapture();
      snapshotInterval = setInterval(runCapture, SNAPSHOT_INTERVAL_MS);
    }, SNAPSHOT_INITIAL_DELAY_MS);
  }

  // ─── Wire monitor events → alert evaluation ───────────────────────────
  // When a bot's health changes, immediately re-evaluate alerts for that bot
  // instead of waiting for the next 30s tick.
  monitor.on("botStateChange", ({ botId }: { botId: string }) => {
    try {
      alerts.evaluate();
    } catch (err) {
      logger.error({ err, botId }, "[Fleet] Alert evaluation for bot failed");
    }
  });

  // ─── Wire monitor events → LiveEvent system ───────────────────────────
  // FleetMonitorService already calls publishLiveEvent() internally for
  // agent.status and activity.logged events. Fleet-specific events
  // (fleet.bot.health, fleet.bot.connected, fleet.alert.triggered) are
  // emitted via the EventEmitter and will be picked up by the
  // LiveUpdatesProvider on the frontend through the existing WS.

  // ─── Initialize inter-bot graph ───────────────────────────────────────
  const graph = getInterBotGraph();

  // ─── Initialize rate limiter ────────────────────────────────────────────
  const rateLimiter = getFleetRateLimiter();

  // ─── Initialize Canary Lab (A/B experiments) ──────────────────────────────
  const canaryLab = getCanaryLabEngine();
  canaryLab.start();

  // Wire monitor data → canary lab sample ingestion
  canaryLab.on("collectSamples", async () => {
    for (const bot of monitor.getAllBots()) {
      try {
        const health = await monitor.getBotHealth(bot.botId);
        canaryLab.ingestSample(bot.botId, {
          health_score: health?.ok ? 100 : 0,
          cost_per_session: 0,
          error_rate: health?.ok ? 0 : 1,
        });
      } catch {
        /* RPC failure — skip this bot for this collection cycle */
      }
    }
  });

  // ─── Initialize Quality Engine (CQI) ───────────────────────────────────────
  const qualityEngine = getQualityEngine();
  qualityEngine.start();

  // Wire monitor session data → quality engine computation.
  // The engine emits "computeAll" every 5 min; we feed each connected bot's
  // live sessions, mapping the monitor's BotSessionEntry → RawSessionData.
  // Note: the monitor exposes a limited session shape (no per-turn response
  // times, escalation flags, or returning-user signals), so reliability/
  // experience dimensions fall back to the engine's optimistic defaults while
  // effectiveness/engagement are driven by real session counts + activity.
  const ACTIVE_SESSION_WINDOW_MS = 30 * 60 * 1000; // 30 min since last activity = active
  qualityEngine.on("computeAll", async () => {
    for (const bot of monitor.getAllBots()) {
      try {
        const sessions = await monitor.getBotSessions(bot.botId);
        const now = Date.now();
        qualityEngine.computeForBot(bot.botId, {
          sessions: sessions.map((s) => {
            const lastActivity = s.lastActivityAt
              ? Date.parse(s.lastActivityAt)
              : NaN;
            const active =
              Number.isFinite(lastActivity) &&
              now - lastActivity < ACTIVE_SESSION_WINDOW_MS;
            const messageCount = s.messageCount ?? 0;
            return {
              id: s.sessionKey,
              userId: s.sessionKey,
              active,
              endedNormally: !active,
              escalated: false,
              isReturningUser: false,
              turnCount: messageCount,
              userMessageCount: Math.ceil(messageCount / 2),
              lastUserMessageAt: Number.isFinite(lastActivity)
                ? new Date(lastActivity)
                : undefined,
              responseTimes: [],
            };
          }),
          toolCalls: { total: 0, successful: 0 },
        });
      } catch {
        /* RPC failure — skip this bot for this computation cycle */
      }
    }
  });

  // ─── Initialize Capacity Planner ────────────────────────────────────────────
  const capacityPlanner = getCapacityPlanner();
  capacityPlanner.start();

  // Wire daily cost/session data → capacity planner
  capacityPlanner.on("refreshData", async () => {
    try {
      let totalSessions = 0;
      const bots = monitor.getAllBots();
      for (const bot of bots) {
        try {
          const sessions = await monitor.getBotSessions(bot.botId);
          totalSessions += sessions.length;
        } catch {
          /* RPC failure — skip this bot */
        }
      }
      capacityPlanner.pushDataPoint("fleet", "cost_usd", 0);
      capacityPlanner.pushDataPoint("fleet", "session_count", totalSessions);
      capacityPlanner.pushDataPoint("fleet", "active_bots", bots.length);
    } catch (err) {
      logger.error({ err }, "[Fleet] Capacity data push failed");
    }
  });

  // ─── Wire agent events → inter-bot graph ────────────────────────────────
  // Capture sessions_send / sessions_spawn tool calls to build the graph
  monitor.on("webhookEvent", ({ botId, type, payload }: { botId: string; type: string; payload: Record<string, unknown> }) => {
    if (type === "agent" && payload) {
      const toolName = payload.toolName as string | undefined;
      const args = payload.args as Record<string, unknown> | undefined;
      if (toolName === "sessions_send" && args?.targetAgentId) {
        graph.addEdge({
          from: botId,
          to: args.targetAgentId as string,
          type: "message",
          lastSeen: new Date(),
        });
      }
      if (toolName === "sessions_spawn" && args?.agentId) {
        graph.addEdge({
          from: botId,
          to: args.agentId as string,
          type: "spawn",
          lastSeen: new Date(),
        });
      }
    }
  });

  // ─── Refresh inter-bot graph node metadata periodically ─────────────────
  // The graph's edges arrive live from agent events above, but each node's
  // display name / emoji / health come from the bot's identity + health RPC.
  // Without this loop, getGraph() returns nodes labelled with raw botIds and
  // healthScore 0 (the widget would render anonymous grey circles).
  const refreshGraphMetadata = async () => {
    for (const bot of monitor.getAllBots()) {
      try {
        const [identity, health] = await Promise.all([
          monitor.getBotIdentity(bot.botId).catch(() => null),
          monitor.getBotHealth(bot.botId).catch(() => null),
        ]);
        const name =
          identity && typeof identity.name === "string"
            ? identity.name
            : bot.botId;
        const emoji =
          identity && typeof identity.emoji === "string"
            ? identity.emoji
            : "🤖";
        // Mirror the snapshot-capture health derivation: monitoring+ok → 100,
        // monitoring+unhealthy → 50, transitional → 25, else → 0.
        let healthScore = 0;
        if (bot.state === "monitoring") healthScore = health?.ok ? 100 : 50;
        else if (bot.state === "connecting" || bot.state === "authenticating") {
          healthScore = 25;
        }
        graph.updateBotMetadata(bot.botId, { name, emoji, healthScore });
      } catch (err) {
        logger.warn(
          { err, botId: bot.botId },
          "[Fleet] inter-bot graph metadata refresh failed for bot",
        );
      }
    }
  };
  graphMetaTimeout = setTimeout(() => {
    refreshGraphMetadata().catch((err) => {
      logger.warn({ err }, "[Fleet] inter-bot graph metadata refresh batch failed");
    });
    graphMetaInterval = setInterval(() => {
      refreshGraphMetadata().catch((err) => {
        logger.warn({ err }, "[Fleet] inter-bot graph metadata refresh batch failed");
      });
    }, GRAPH_META_INTERVAL_MS);
  }, GRAPH_META_INITIAL_DELAY_MS);

  // ─── Initialize Customer Journey Engine ──────────────────────────────────
  const journeyEngine = getCustomerJourneyEngine();
  journeyEngine.start();

  // Wire touchpoints from the monitor's live gateway event stream. The monitor
  // emits "botEvent" with the raw FleetGatewayEvent — the previous "sessionEvent"
  // listener matched no emitted event, so the Customer Journey engine was never
  // fed. We filter for chat events and defensively extract the session/channel
  // metadata (sessionKey is a real gateway-event payload key — see
  // fleet-gateway-client). addTouchpoint itself validates the session key shape
  // (peer sessions only) and skips anything else, so no garbage is recorded.
  const VALID_INTENTS = new Set(["inquiry", "pricing", "technical", "general"]);
  monitor.on("botEvent", ({ botId, event }: {
    botId: string; event: { type: string; payload?: Record<string, unknown> };
  }) => {
    if (event.type !== "chat") return;
    const payload = event.payload ?? {};
    const sessionKey =
      typeof payload.sessionKey === "string" ? payload.sessionKey
      : typeof payload.session === "string" ? payload.session
      : "";
    if (!sessionKey) return; // no session identity → nothing to attribute
    const channel = typeof payload.channel === "string" ? payload.channel : "unknown";
    const intent =
      typeof payload.intent === "string" && VALID_INTENTS.has(payload.intent)
        ? (payload.intent as "inquiry" | "pricing" | "technical" | "general")
        : undefined;
    try {
      journeyEngine.addTouchpoint(sessionKey, botId, botId, channel, {
        summary: typeof payload.summary === "string" ? payload.summary : "",
        intent,
        turnCount: typeof payload.turnCount === "number" ? payload.turnCount : undefined,
        cost: typeof payload.cost === "number" ? payload.cost : undefined,
      });
    } catch (err) {
      logger.error({ err, botId }, "[Fleet] Journey touchpoint ingestion failed");
    }
  });

  // ─── Initialize Meta-Learning Engine ────────────────────────────────────
  const metaLearning = getMetaLearningEngine();
  metaLearning.start();

  // ─── Initialize Anomaly Correlation Engine ──────────────────────────────
  const anomalyCorrelation = getAnomalyCorrelationEngine();

  // Infer topology from connected bots
  const connectedBots = monitor.getAllBots().map((b) => ({
    id: b.botId,
    name: b.botId,
    gatewayUrl: b.gatewayUrl ?? "",
  }));
  anomalyCorrelation.inferTopologyFromGateways(connectedBots);
  anomalyCorrelation.start();

  // Wire alert events → anomaly correlation. The alert service emits
  // "alert.fired" (see FleetAlertService) — the previous "alertTriggered"
  // listener matched no emitted event, so the correlation engine was never fed
  // and the Anomaly page stayed permanently empty. info-severity alerts are
  // skipped (the correlation engine only reasons about warning/critical
  // anomalies and CorrelatedAlert only models those two severities).
  alerts.on("alert.fired", (alert: Alert) => {
    try {
      if (alert.severity !== "warning" && alert.severity !== "critical") return;
      // Refresh topology from currently-connected bots before correlating.
      // The boot-time inference (below) runs before any bot has connected, so
      // without this the shared-host map is empty and the infrastructure
      // correlation dimension never fires. inferTopologyFromGateways is
      // idempotent (it fully rebuilds hosts + sharedResources each call).
      anomalyCorrelation.inferTopologyFromGateways(
        monitor.getAllBots().map((b) => ({
          id: b.botId,
          name: b.botId,
          gatewayUrl: b.gatewayUrl ?? "",
        })),
      );
      anomalyCorrelation.ingestAlert({
        alertId: alert.id,
        botId: alert.botId,
        botName: alert.botId,
        metric: alert.metric,
        value: alert.currentValue,
        threshold: alert.threshold,
        timestamp: new Date(alert.firedAt),
        severity: alert.severity,
      });
    } catch (err) {
      logger.error({ err }, "[Fleet] Anomaly correlation alert ingestion failed");
    }
  });

  // ─── Initialize Memory Mesh Engine ──────────────────────────────────────
  const memoryMesh = getMemoryMeshEngine();
  memoryMesh.start();

  // ─── Initialize Voice Intelligence Engine ───────────────────────────────
  // Starts the anomaly-pruning timer. Call data is populated via the engine's
  // ingestEvent/startCall API once a gateway forwards voice events; until then
  // the Voice page renders its Preview fallback.
  const voiceEngine = getVoiceIntelligenceEngine();
  voiceEngine.startPruning();

  booted = true;
  logger.info("[Fleet] Bootstrap complete — monitoring + alerts + graph + rate-limiter + canary-lab + quality + capacity + journey + meta-learning + anomaly-correlation + memory-mesh + voice ready");
}

/**
 * Graceful shutdown: clean up fleet monitoring resources.
 *
 * Phase 1 (immediate): Stop alert evaluation
 * Phase 2 (0-3s): Disconnect all bots (sends WS close frames)
 * Phase 3 (forced): Dispose service instances
 */
export async function shutdownFleet(): Promise<void> {
  if (!booted) return;

  logger.info("[Fleet] Shutting down...");

  // Phase 1: Stop alert loop + snapshot capture
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
  }
  if (snapshotTimeout) {
    clearTimeout(snapshotTimeout);
    snapshotTimeout = null;
  }
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
  }
  if (graphMetaTimeout) {
    clearTimeout(graphMetaTimeout);
    graphMetaTimeout = null;
  }
  if (graphMetaInterval) {
    clearInterval(graphMetaInterval);
    graphMetaInterval = null;
  }

  // Phase 2: Disconnect all bots gracefully
  const monitor = getFleetMonitorService();
  const botIds = monitor.getAllBots().map((b) => b.botId);
  const disconnectPromises = botIds.map((botId) => {
    try {
      monitor.disconnectBot(botId);
    } catch (err) {
      logger.warn({ err, botId }, "[Fleet] Best-effort disconnect failed");
    }
  });
  await Promise.allSettled(disconnectPromises);

  // Phase 3: Dispose singletons
  disposeCustomerJourneyEngine();
  disposeMetaLearningEngine();
  disposeAnomalyCorrelationEngine();
  disposeMemoryMeshEngine();
  disposeVoiceIntelligenceEngine();
  disposeCanaryLabEngine();
  disposeQualityEngine();
  disposeCapacityPlanner();
  disposeInterBotGraph();
  disposeFleetRateLimiter();
  disposeFleetMonitorService();

  booted = false;
  logger.info(
    `[Fleet] Shutdown complete — disconnected ${botIds.length} bot(s)`,
  );
}
