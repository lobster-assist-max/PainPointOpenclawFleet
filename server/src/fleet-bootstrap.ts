/**
 * Fleet Bootstrap — Wires fleet monitoring services into the server lifecycle.
 *
 * Handles:
 * - Starting the FleetAlertService evaluation loop
 * - Connecting fleet events to Paperclip's LiveEvent system
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
      alerts.evaluateAll();
    } catch (err) {
      logger.error({ err }, "[Fleet] Alert evaluation tick failed");
    }
  }, 30_000);

  // ─── Wire monitor events → alert evaluation ───────────────────────────
  // When a bot's health changes, immediately re-evaluate alerts for that bot
  // instead of waiting for the next 30s tick.
  monitor.on("botStateChange", ({ botId }: { botId: string }) => {
    try {
      alerts.evaluateBot(botId);
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

  booted = true;
  logger.info("[Fleet] Bootstrap complete — monitoring + alerts + graph + rate-limiter ready");
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
  disposeInterBotGraph();
  disposeFleetRateLimiter();
  disposeFleetMonitorService();

  booted = false;
  logger.info(
    `[Fleet] Shutdown complete — disconnected ${botIds.length} bot(s)`,
  );
}
