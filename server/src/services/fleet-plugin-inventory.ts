/**
 * Fleet Plugin Inventory — Tracks which plugins each bot has enabled.
 *
 * Data source: config.get("plugins") + tools.catalog + skills.bins RPC calls.
 *
 * Provides:
 * - Per-bot plugin list
 * - Cross-fleet plugin matrix
 * - Plugin drift detection (which bots are missing expected plugins)
 * - Slot conflict detection (e.g., different memory plugins)
 */

import { logger } from "../middleware/logger.js";
import type { FleetGatewayClient } from "./fleet-gateway-client.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PluginInfo {
  id: string;
  kind: "channel" | "memory" | "context-engine" | "tool" | "other";
  enabled: boolean;
  slot?: string;
  providedTools: string[];
  providedChannels: string[];
}

export interface BotPluginInventory {
  botId: string;
  botName: string;
  botEmoji: string;
  plugins: PluginInfo[];
  fetchedAt: Date;
}

export interface PluginDrift {
  pluginId: string;
  kind: string;
  present: string[];   // botIds that have it
  missing: string[];   // botIds that don't
  severity: "critical" | "warning" | "info";
  recommendation: string;
}

export interface SlotConflict {
  slotName: string;
  values: Map<string, string[]>; // pluginId → botIds
  recommendation: string;
}

export interface PluginDriftReport {
  drifts: PluginDrift[];
  slotConflicts: SlotConflict[];
  totalPlugins: number;
  consistentPlugins: number;
  generatedAt: Date;
}

export interface PluginMatrixEntry {
  pluginId: string;
  kind: string;
  bots: Map<string, boolean>; // botId → enabled
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Plugins that affect cost/behavior if inconsistent across fleet */
const CRITICAL_PLUGINS = new Set([
  "memory-lancedb",
  "memory-core",
  "diagnostics-otel",
]);

/** Channel plugins — inconsistency means some bots can't serve certain channels */
const CHANNEL_PLUGINS = new Set([
  "line",
  "telegram",
  "discord",
  "whatsapp",
  "slack",
  "signal",
  "imessage",
  "msteams",
  "matrix",
  "irc",
  "googlechat",
  "nostr",
  "twitch",
  "mattermost",
  "zalo",
  "feishu",
  "bluebubbles",
]);

// ─── Plugin Inventory Service ───────────────────────────────────────────────

export class FleetPluginInventory {
  private cache = new Map<string, { inventory: BotPluginInventory; fetchedAt: number }>();

  /**
   * Fetch plugin inventory for a single bot.
   * Uses cache if available and not expired.
   */
  async fetchForBot(
    botId: string,
    botName: string,
    botEmoji: string,
    client: FleetGatewayClient,
  ): Promise<BotPluginInventory> {
    // Check cache
    const cached = this.cache.get(botId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.inventory;
    }

    try {
      // Fetch plugin config, tools catalog, and skills in parallel
      const [pluginConfig, toolsCatalog, skillsBins] = await Promise.allSettled([
        client.rpc("config.get", { path: "plugins" }),
        client.rpc("tools.catalog", {}),
        client.rpc("skills.bins", {}),
      ]);

      const config =
        pluginConfig.status === "fulfilled"
          ? (pluginConfig.value as Record<string, unknown>)
          : {};

      const tools =
        toolsCatalog.status === "fulfilled"
          ? (toolsCatalog.value as Array<{ name: string }>) ?? []
          : [];

      const skills =
        skillsBins.status === "fulfilled"
          ? (skillsBins.value as Record<string, unknown>) ?? {}
          : {};

      // Parse enabled plugins
      const enabledIds = Array.isArray(config.enabled) ? config.enabled as string[] : [];
      const slots = (config.slots ?? {}) as Record<string, string>;

      // Build plugin info list
      const plugins: PluginInfo[] = enabledIds.map((id) => ({
        id,
        kind: classifyPlugin(id),
        enabled: true,
        slot: Object.entries(slots).find(([, v]) => v === id)?.[0],
        providedTools: tools
          .filter((t) => t.name.toLowerCase().includes(id.toLowerCase()))
          .map((t) => t.name),
        providedChannels: CHANNEL_PLUGINS.has(id) ? [id] : [],
      }));

      const inventory: BotPluginInventory = {
        botId,
        botName,
        botEmoji,
        plugins,
        fetchedAt: new Date(),
      };

      this.cache.set(botId, { inventory, fetchedAt: Date.now() });

      return inventory;
    } catch (err) {
      logger.error(
        { err, botId },
        "[Fleet Plugin Inventory] Failed to fetch inventory",
      );
      // Return cached version if available, even if stale
      if (cached) return cached.inventory;
      return { botId, botName, botEmoji, plugins: [], fetchedAt: new Date() };
    }
  }

  /**
   * Detect plugin drift across the fleet.
   */
  detectDrift(inventories: BotPluginInventory[]): PluginDriftReport {
    if (inventories.length < 2) {
      return {
        drifts: [],
        slotConflicts: [],
        totalPlugins: 0,
        consistentPlugins: 0,
        generatedAt: new Date(),
      };
    }

    // Collect all plugin IDs
    const allPluginIds = new Set<string>();
    for (const inv of inventories) {
      for (const plugin of inv.plugins) {
        allPluginIds.add(plugin.id);
      }
    }

    // Check each plugin across all bots
    const drifts: PluginDrift[] = [];
    let consistentCount = 0;

    for (const pluginId of allPluginIds) {
      const present: string[] = [];
      const missing: string[] = [];

      for (const inv of inventories) {
        if (inv.plugins.some((p) => p.id === pluginId)) {
          present.push(inv.botId);
        } else {
          missing.push(inv.botId);
        }
      }

      if (missing.length === 0) {
        consistentCount++;
        continue;
      }

      const severity = pluginSeverity(pluginId);
      drifts.push({
        pluginId,
        kind: classifyPlugin(pluginId),
        present,
        missing,
        severity,
        recommendation: generateRecommendation(pluginId, present, missing, inventories),
      });
    }

    // Detect slot conflicts
    const slotConflicts = detectSlotConflicts(inventories);

    return {
      drifts,
      slotConflicts,
      totalPlugins: allPluginIds.size,
      consistentPlugins: consistentCount,
      generatedAt: new Date(),
    };
  }

  /**
   * Build the full plugin × bot matrix for the UI.
   */
  buildMatrix(inventories: BotPluginInventory[]): PluginMatrixEntry[] {
    const allPluginIds = new Set<string>();
    for (const inv of inventories) {
      for (const plugin of inv.plugins) {
        allPluginIds.add(plugin.id);
      }
    }

    return Array.from(allPluginIds)
      .sort()
      .map((pluginId) => {
        const bots = new Map<string, boolean>();
        for (const inv of inventories) {
          bots.set(inv.botId, inv.plugins.some((p) => p.id === pluginId));
        }
        return { pluginId, kind: classifyPlugin(pluginId), bots };
      });
  }

  /** Clear cache for a specific bot or all bots. */
  clearCache(botId?: string): void {
    if (botId) {
      this.cache.delete(botId);
    } else {
      this.cache.clear();
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function classifyPlugin(id: string): PluginInfo["kind"] {
  if (CHANNEL_PLUGINS.has(id)) return "channel";
  if (id.startsWith("memory-")) return "memory";
  if (id.includes("context")) return "context-engine";
  return "other";
}

function pluginSeverity(pluginId: string): PluginDrift["severity"] {
  if (CRITICAL_PLUGINS.has(pluginId)) return "critical";
  if (CHANNEL_PLUGINS.has(pluginId)) return "warning";
  return "info";
}

function generateRecommendation(
  pluginId: string,
  present: string[],
  missing: string[],
  inventories: BotPluginInventory[],
): string {
  const presentNames = present
    .map((id) => inventories.find((inv) => inv.botId === id)?.botEmoji ?? id)
    .join(", ");
  const missingNames = missing
    .map((id) => inventories.find((inv) => inv.botId === id)?.botEmoji ?? id)
    .join(", ");

  if (CHANNEL_PLUGINS.has(pluginId)) {
    return `Enable ${pluginId} on ${missingNames} for consistent channel coverage (currently only on ${presentNames})`;
  }
  if (CRITICAL_PLUGINS.has(pluginId)) {
    return `Standardize ${pluginId} across all bots — current inconsistency may cause behavior differences`;
  }
  return `${pluginId} is enabled on ${present.length}/${present.length + missing.length} bots`;
}

function detectSlotConflicts(inventories: BotPluginInventory[]): SlotConflict[] {
  // Collect slot → pluginId for each bot
  const slotMap = new Map<string, Map<string, string[]>>(); // slot → (plugin → botIds)

  for (const inv of inventories) {
    for (const plugin of inv.plugins) {
      if (!plugin.slot) continue;
      if (!slotMap.has(plugin.slot)) slotMap.set(plugin.slot, new Map());
      const pluginMap = slotMap.get(plugin.slot)!;
      if (!pluginMap.has(plugin.id)) pluginMap.set(plugin.id, []);
      pluginMap.get(plugin.id)!.push(inv.botId);
    }
  }

  const conflicts: SlotConflict[] = [];
  for (const [slotName, pluginMap] of slotMap) {
    if (pluginMap.size > 1) {
      const entries = Array.from(pluginMap.entries());
      const majority = entries.reduce((a, b) => (a[1].length >= b[1].length ? a : b));
      conflicts.push({
        slotName,
        values: pluginMap,
        recommendation: `Standardize ${slotName} slot to "${majority[0]}" (used by ${majority[1].length} bots)`,
      });
    }
  }

  return conflicts;
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: FleetPluginInventory | null = null;

export function getFleetPluginInventory(): FleetPluginInventory {
  if (!instance) instance = new FleetPluginInventory();
  return instance;
}
