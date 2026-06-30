/**
 * Fleet Device Token Store — persists a refreshed openclaw-gateway device
 * token back into the owning agent's `adapterConfig.deviceToken`.
 *
 * Why this exists: the openclaw-gateway adapter authenticates with a device
 * credential (`ctx.config.deviceToken`, alongside an Ed25519 `devicePrivateKeyPem`).
 * During the connection handshake the gateway can hand back a freshly issued /
 * rotated device token, which FleetGatewayClient surfaces as a `deviceToken`
 * event and FleetMonitorService re-emits as `deviceTokenReceived`. Before this
 * store nothing listened to that event, so the rotated token was dropped on the
 * floor and `agents.adapterConfig.deviceToken` stayed stale — meaning the next
 * reconnect (or the adapter's own runtime) kept using the old token and could
 * fail auth once the old token expired.
 *
 * The persist is surgical and idempotent:
 * - resolves botId → agents.id via the monitor's BotConnectionInfo,
 * - merges only `deviceToken` into the existing adapterConfig (never clobbers
 *   devicePrivateKeyPem or any other field),
 * - skips the write entirely when the token is unchanged (the common case —
 *   the gateway echoes the same token on every connect),
 * - never throws; failures are logged so a bad write can't break the monitor
 *   event stream.
 */
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import {
  getFleetMonitorService,
  type FleetMonitorService,
} from "./fleet-monitor.js";

/**
 * Persist a received device token to the owning agent's adapterConfig.
 * Returns true when a write happened, false when skipped (unchanged / no agent).
 * Never throws.
 */
export async function persistDeviceToken(
  db: Db,
  botId: string,
  deviceToken: string,
  monitor: FleetMonitorService = getFleetMonitorService(),
): Promise<boolean> {
  const token = deviceToken.trim();
  if (!token) return false;

  try {
    const agentId = monitor.getBotInfo(botId)?.agentId;
    if (!agentId) {
      logger.warn(
        { botId },
        "[fleet] deviceTokenReceived for unknown bot — cannot persist token",
      );
      return false;
    }

    const row = await db
      .select({ adapterConfig: agents.adapterConfig })
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0] ?? null);
    if (!row) {
      logger.warn(
        { botId, agentId },
        "[fleet] deviceTokenReceived — agent row not found, cannot persist token",
      );
      return false;
    }

    const current =
      row.adapterConfig && typeof row.adapterConfig === "object"
        ? (row.adapterConfig as Record<string, unknown>)
        : {};

    // No-op when the gateway echoed the same token (the common case).
    if (current.deviceToken === token) return false;

    await db
      .update(agents)
      .set({
        adapterConfig: { ...current, deviceToken: token },
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    logger.info(
      { botId, agentId },
      "[fleet] persisted refreshed gateway device token to agent adapterConfig",
    );
    return true;
  } catch (err) {
    logger.warn(
      { botId, err: err instanceof Error ? err.message : String(err) },
      "[fleet] failed to persist device token",
    );
    return false;
  }
}
