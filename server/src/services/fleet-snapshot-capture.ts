/**
 * Fleet Snapshot Capture — periodically records each connected bot's
 * current health/usage into the `fleet_snapshots` table.
 *
 * These rows are the data source for the Fleet Health Heatmap
 * (GET /api/fleet-monitor/fleet/:companyId/heatmap) and any future
 * trend/anomaly baselines. Without this capture loop the table stays
 * empty and the heatmap has nothing to render.
 *
 * Design notes:
 * - One row per connected bot per capture tick. The heatmap query
 *   averages rows into day/hour buckets, so capturing more often than
 *   hourly simply produces a smoother average — it does not corrupt the
 *   bucketing.
 * - `botId`/`companyId` come straight from BotConnectionInfo, which holds
 *   the agents.id / companies.id UUIDs (fleet_snapshots FKs reference
 *   those). A bot whose agentId is not a real agents row will fail its
 *   INSERT — caught per-bot so one bad row never aborts the batch.
 */

import type { Db } from "@paperclipai/db";
import { fleetSnapshots } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import {
  getFleetMonitorService,
  type FleetMonitorService,
} from "./fleet-monitor.js";

/**
 * Derive a 0–100 health score from a bot's live health snapshot + connection
 * state. The gateway health RPC only returns a boolean `ok`, so we fold the
 * connection state in to get more than a binary signal:
 *   - monitoring + ok        → 100
 *   - monitoring + not ok     → 50  (connected but unhealthy)
 *   - connecting/authenticating → 25 (transitional)
 *   - anything else (error/disconnected/backoff/dormant) → 0
 */
function deriveHealthScore(
  connectionState: string,
  healthOk: boolean,
): number {
  if (connectionState === "monitoring") return healthOk ? 100 : 50;
  if (connectionState === "connecting" || connectionState === "authenticating") {
    return 25;
  }
  return 0;
}

function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Capture one snapshot row per connected bot. Returns the number of rows
 * successfully written. Never throws — per-bot failures are logged and
 * skipped so a single bad bot can't abort the batch.
 */
export async function captureFleetSnapshots(
  db: Db,
  monitor: FleetMonitorService = getFleetMonitorService(),
): Promise<number> {
  const bots = monitor.getAllBots();
  let captured = 0;

  for (const bot of bots) {
    try {
      const [health, usage] = await Promise.all([
        monitor.getBotHealth(bot.botId).catch(() => null),
        monitor.getBotUsage(bot.botId).catch(() => null),
      ]);

      const score = deriveHealthScore(bot.state, health?.ok ?? false);
      const channels = Array.isArray(health?.channels) ? health!.channels : [];
      const connectedChannels = channels.filter((c) => {
        const status = (c as { status?: unknown }).status;
        const connected = (c as { connected?: unknown }).connected;
        return status === "connected" || connected === true;
      }).length;

      await db.insert(fleetSnapshots).values({
        botId: bot.agentId,
        companyId: bot.companyId,
        healthScore: score,
        healthGrade: gradeFor(score),
        connectionState: bot.state,
        inputTokens1h: usage?.total?.inputTokens ?? null,
        outputTokens1h: usage?.total?.outputTokens ?? null,
        cachedTokens1h: usage?.total?.cachedInputTokens ?? null,
        activeSessions: Array.isArray(health?.sessions)
          ? health!.sessions.length
          : null,
        connectedChannels,
        totalChannels: channels.length,
      });
      captured += 1;
    } catch (err) {
      logger.warn(
        { err, botId: bot.botId, agentId: bot.agentId },
        "[Fleet] snapshot capture failed for bot",
      );
    }
  }

  if (captured > 0) {
    logger.debug({ captured, total: bots.length }, "[Fleet] snapshots captured");
  }
  return captured;
}
