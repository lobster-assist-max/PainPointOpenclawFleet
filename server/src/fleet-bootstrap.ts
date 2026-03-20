/**
 * Fleet Bootstrap — Wires fleet monitoring services into the server lifecycle.
 *
 * Handles:
 * - Starting the FleetAlertService evaluation loop
 * - Connecting fleet events to Paperclip's LiveEvent system
 * - Starting Canary Lab, Quality Engine, and Capacity Planner
 * - Graceful shutdown (3-phase: pause → drain → force-close)
 */

import { logger } from "./middleware/logger.js";
import {
  getFleetMonitorService,
  disposeFleetMonitorService,
} from "./services/fleet-monitor.js";
import { getFleetAlertService } from "./services/fleet-alerts.js";
import { getInterBotGraph, disposeInterBotGraph } from "./services/fleet-inter-bot-graph.js";
import { getFleetRateLimiter, disposeFleetRateLimiter } from "./services/fleet-rate-limiter.js";
import { getCanaryLabEngine, disposeCanaryLabEngine } from "./services/fleet-canary.js";
import { getQualityEngine, disposeQualityEngine } from "./services/fleet-quality.js";
import { getCapacityPlanner, disposeCapacityPlanner } from "./services/fleet-capacity.js";
import { getCustomerJourneyEngine, disposeCustomerJourneyEngine } from "./services/fleet-customer-journey-singleton.js";
import { getMetaLearningEngine, disposeMetaLearningEngine } from "./services/fleet-meta-learning-singleton.js";
import { getAnomalyCorrelationEngine, disposeAnomalyCorrelationEngine } from "./services/fleet-anomaly-correlation-singleton.js";
import { getMemoryMeshEngine, disposeMemoryMeshEngine } from "./services/fleet-memory-mesh-singleton.js";

let booted = false;
let alertInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Bootstrap fleet monitoring services after server.listen().
 *
 * Routes are already mounted in app.ts — this function handles the
 * lifecycle concerns that routes can't: event wiring, alert scheduling,
 * and shutdown registration.
 */
export function bootstrapFleet(): void {
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
  canaryLab.on("collectSamples", () => {
    for (const bot of monitor.getAllBots()) {
      const b = bot as any;
      const health = b.healthScore ?? 0;
      const costPerSession = b.costPerSession ?? 0;
      const errorRate = b.errorRate ?? 0;
      canaryLab.ingestSample(bot.botId, {
        health_score: health,
        cost_per_session: costPerSession,
        error_rate: errorRate,
      });
    }
  });

  // ─── Initialize Quality Engine (CQI) ───────────────────────────────────────
  const qualityEngine = getQualityEngine();
  qualityEngine.start();

  // ─── Initialize Capacity Planner ────────────────────────────────────────────
  const capacityPlanner = getCapacityPlanner();
  capacityPlanner.start();

  // Wire daily cost/session data → capacity planner
  capacityPlanner.on("refreshData", () => {
    try {
      let totalCost = 0;
      let totalSessions = 0;
      for (const bot of monitor.getAllBots()) {
        const b = bot as any;
        totalCost += b.estimatedCost1h ?? 0;
        totalSessions += b.activeSessions ?? 0;
      }
      capacityPlanner.pushDataPoint("fleet", "cost_usd", totalCost);
      capacityPlanner.pushDataPoint("fleet", "session_count", totalSessions);
      capacityPlanner.pushDataPoint("fleet", "active_bots", monitor.getAllBots().length);
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

  // ─── Initialize Customer Journey Engine ──────────────────────────────────
  const journeyEngine = getCustomerJourneyEngine();
  journeyEngine.start();

  // Wire touchpoints from monitor session events
  monitor.on("sessionEvent", ({ botId, sessionKey, channel, data }: {
    botId: string; sessionKey: string; channel: string; data: Record<string, unknown>;
  }) => {
    try {
      const botName = (monitor.getAllBots().find((b) => b.botId === botId) as any)?.botName ?? botId;
      journeyEngine.addTouchpoint(sessionKey, botId, botName, channel, {
        summary: data.summary as string | undefined ?? "",
        intent: data.intent as "inquiry" | "pricing" | "technical" | "general" | undefined,
        turnCount: data.turnCount as number | undefined,
        cost: data.cost as number | undefined,
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
    name: (b as any).botName ?? b.botId,
    gatewayUrl: b.gatewayUrl ?? "",
  }));
  anomalyCorrelation.inferTopologyFromGateways(connectedBots);
  anomalyCorrelation.start();

  // Wire alert events → anomaly correlation
  alerts.on("alertTriggered", (alert: { id: string; botId: string; metric: string; value: number; threshold: number; severity: string }) => {
    try {
      const bot = monitor.getAllBots().find((b) => b.botId === alert.botId);
      anomalyCorrelation.ingestAlert({
        alertId: alert.id,
        botId: alert.botId,
        botName: (bot as any)?.botName ?? alert.botId,
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold,
        timestamp: new Date(),
        severity: alert.severity as "warning" | "critical",
      });
    } catch (err) {
      logger.error({ err }, "[Fleet] Anomaly correlation alert ingestion failed");
    }
  });

  // ─── Initialize Memory Mesh Engine ──────────────────────────────────────
  const memoryMesh = getMemoryMeshEngine();
  memoryMesh.start();

  booted = true;
  logger.info("[Fleet] Bootstrap complete — monitoring + alerts + graph + rate-limiter + canary-lab + quality + capacity + journey + meta-learning + anomaly-correlation + memory-mesh ready");
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

  // Phase 1: Stop alert loop
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
  }

  // Phase 2: Disconnect all bots gracefully
  const monitor = getFleetMonitorService();
  const botIds = monitor.getAllBots().map((b) => b.botId);
  const disconnectPromises = botIds.map((botId) => {
    try {
      monitor.disconnectBot(botId);
    } catch {
      // Best-effort disconnect
    }
  });
  await Promise.allSettled(disconnectPromises);

  // Phase 3: Dispose singletons
  disposeCustomerJourneyEngine();
  disposeMetaLearningEngine();
  disposeAnomalyCorrelationEngine();
  disposeMemoryMeshEngine();
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
