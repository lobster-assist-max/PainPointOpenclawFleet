/**
 * Fleet Metrics Provider — shared bot-metric snapshot source for the
 * alert engine (FleetAlertService) and the self-healing engine
 * (HealingPolicyEngine).
 *
 * Both engines evaluate policies/rules against a `() => BotMetricSnapshot[]`
 * provider that they expect to be registered via `setMetricsProvider`. Before
 * this module existed NOTHING called `setMetricsProvider` on either engine, so
 * `evaluate()` always early-returned (`if (!this.metricsProvider) return;`) —
 * no alert ever fired, which in turn starved the entire downstream chain
 * (alert → incident, alert → anomaly-correlation). This module is the missing
 * feed.
 *
 * The engines call the provider synchronously every 30s, but the richer
 * signals (health `ok`, channel status) come from async gateway RPCs. So a
 * background refresh task (`refreshFleetMetrics`) does the async work and
 * caches one snapshot per connected bot; the sync provider just returns the
 * current cache. A bot present in the monitor but whose RPC fails still gets a
 * snapshot derived from its connection state — important so the
 * "bot offline > N" reconnect policy can still fire.
 *
 * Honest scope: the monitor exposes connection state + a boolean health `ok` +
 * a channels array, but no per-bot cost, error-rate, cron-failure, or latency
 * stream. So `healthScore`, `botOfflineDurationMs`, `uptimePct`, and
 * `channelDisconnectedCount` are real, while `cost1h`/`cost24h`/`errorRate`/
 * `cronFailureRate`/`latencyAvgMs` stay 0 until a source exists — the
 * health/offline/channel policies work with live data; cost/error policies stay
 * dormant rather than firing on fabricated numbers.
 */

import { logger } from "../middleware/logger.js";
import {
  getFleetMonitorService,
  type FleetMonitorService,
} from "./fleet-monitor.js";
import { deriveFleetHealthScore } from "./fleet-health-score.js";

/**
 * Bot metric shape consumed by both FleetAlertService and HealingPolicyEngine.
 * Structurally identical to each engine's local `BotMetricSnapshot` (plus an
 * optional `tags` used by healing's "tagged" scope), so a `() => FleetBotMetrics[]`
 * provider satisfies both `setMetricsProvider` signatures via structural typing.
 */
export interface FleetBotMetrics {
  botId: string;
  /** Owning company/tenant — lets the healing engine attribute remediations. */
  companyId?: string;
  healthScore: number;
  cost1h: number;
  cost24h: number;
  uptimePct: number;
  errorRate: number;
  channelDisconnectedCount: number;
  botOfflineDurationMs: number;
  cronFailureRate: number;
  latencyAvgMs: number;
  tags?: string[];
}

// Module-level cache: one snapshot per connected bot, refreshed in the
// background and read synchronously by the engines.
const metricsCache = new Map<string, FleetBotMetrics>();

/**
 * Refresh the cached metric snapshot for every connected bot. Async (does the
 * gateway health RPC per bot) and never throws — per-bot RPC failures degrade
 * that bot to a connection-state-only snapshot rather than aborting the batch.
 * Bots no longer present in the monitor are pruned from the cache.
 */
export async function refreshFleetMetrics(
  monitor: FleetMonitorService = getFleetMonitorService(),
): Promise<void> {
  const bots = monitor.getAllBots();
  const now = Date.now();
  const liveIds = new Set<string>();

  for (const bot of bots) {
    liveIds.add(bot.botId);
    let healthOk = false;
    let totalChannels = 0;
    let channelDisconnectedCount = 0;
    try {
      const health = await monitor.getBotHealth(bot.botId);
      healthOk = health?.ok ?? false;
      const channels = Array.isArray(health?.channels) ? health!.channels : [];
      totalChannels = channels.length;
      channelDisconnectedCount = channels.filter((c) => {
        const status = (c as { status?: unknown }).status;
        const connected = (c as { connected?: unknown }).connected;
        return !(status === "connected" || connected === true);
      }).length;
    } catch {
      /* health RPC failed — fall back to connection-state-only snapshot */
    }

    const online = bot.state === "monitoring";
    const lastSeen = bot.lastEventAt ?? bot.connectedSince ?? now;

    metricsCache.set(bot.botId, {
      botId: bot.botId,
      companyId: bot.companyId,
      healthScore: deriveFleetHealthScore({
        connectionState: bot.state,
        healthOk,
        connectedChannels: totalChannels - channelDisconnectedCount,
        totalChannels,
      }),
      cost1h: 0,
      cost24h: 0,
      uptimePct: online ? 100 : 0,
      errorRate: 0,
      channelDisconnectedCount,
      botOfflineDurationMs: online ? 0 : Math.max(0, now - lastSeen),
      cronFailureRate: 0,
      latencyAvgMs: 0,
    });
  }

  // Prune snapshots for disconnected/removed bots so a stale "offline" reading
  // doesn't keep triggering remediation after a bot is gone.
  for (const id of [...metricsCache.keys()]) {
    if (!liveIds.has(id)) metricsCache.delete(id);
  }

  if (bots.length > 0) {
    logger.debug({ bots: bots.length }, "[Fleet] metrics snapshot refreshed");
  }
}

/** Synchronous provider: current cached snapshot for every connected bot. */
export function getFleetMetricsSnapshots(): FleetBotMetrics[] {
  return [...metricsCache.values()];
}

/** Clear the cache (shutdown). */
export function disposeFleetMetricsProvider(): void {
  metricsCache.clear();
}
