/**
 * FleetConfigDriftDetector — detects configuration differences across bots.
 *
 * For each connected bot, calls `config.get` RPC, flattens the result
 * to key-value pairs, and compares across all bots to find drift.
 *
 * Severity classification:
 *   critical — model, gateway version (affects cost/compatibility)
 *   warning  — session settings, channel config, cron schedules
 *   info     — cosmetic differences (names, descriptions)
 */

import type { FleetMonitorService } from "./fleet-monitor.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigDriftEntry {
  configPath: string;
  severity: "critical" | "warning" | "info";
  values: Record<string, string[]>; // stringified value → [botId, ...]
  recommendation: string;
}

export interface ConfigDriftReport {
  generatedAt: string;
  botsCompared: number;
  drifts: ConfigDriftEntry[];
  consistentCount: number;
}

// ---------------------------------------------------------------------------
// Severity classification
// ---------------------------------------------------------------------------

const CRITICAL_PATHS = new Set([
  "model",
  "provider",
  "gateway.version",
  "session.model",
  "apiKey",
]);

const WARNING_PATHS = new Set([
  "session.maxTokens",
  "session.thinkingLevel",
  "session.dmScope",
  "heartbeat.intervalMs",
  "channel",
]);

function classifySeverity(path: string): "critical" | "warning" | "info" {
  if (CRITICAL_PATHS.has(path)) return "critical";
  for (const wp of WARNING_PATHS) {
    if (path.startsWith(wp)) return "warning";
  }
  return "info";
}

// ---------------------------------------------------------------------------
// Config flattening
// ---------------------------------------------------------------------------

function flattenConfig(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value == null) continue;

    // Skip large objects / arrays > 5 items (noise)
    if (Array.isArray(value) && value.length > 5) {
      entries.push([path, `[Array(${value.length})]`]);
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      entries.push(...flattenConfig(value as Record<string, unknown>, path));
    } else {
      entries.push([path, JSON.stringify(value)]);
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Recommendation generation
// ---------------------------------------------------------------------------

function generateRecommendation(
  path: string,
  values: Record<string, string[]>,
): string {
  const entries = Object.entries(values);
  if (entries.length <= 1) return "";

  // Find majority value
  const sorted = entries.sort((a, b) => b[1].length - a[1].length);
  const majority = sorted[0];
  const minority = sorted.slice(1);

  const minorityBots = minority.flatMap(([, bots]) => bots).length;
  const majorityValue = majority[0];

  if (path.includes("model")) {
    return `${minorityBots} bot(s) using a different model. Consider standardizing for consistent cost and behavior.`;
  }
  if (path.includes("version")) {
    return `${minorityBots} bot(s) running an older version. Consider fleet-wide update.`;
  }
  return `${majority[1].length} bots use ${majorityValue}, ${minorityBots} differ. Consider harmonizing.`;
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

// Sentinel cache key for an unscoped (all-tenant) analysis.
const ALL_COMPANIES_KEY = "__all__";

export class FleetConfigDriftDetector {
  // Cache is keyed per company so one tenant's report is never served to
  // another (and so a fleet-wide call doesn't poison a scoped one).
  private cache = new Map<string, { report: ConfigDriftReport; expiresAt: number }>();
  private static CACHE_TTL_MS = 600_000; // 10 minutes

  /**
   * Analyze config drift across a company's connected bots.
   *
   * @param monitor - FleetMonitorService to access bot connections
   * @param companyId - scope the comparison to one company's bots. Omitting it
   *   compares every connected bot across all tenants (legacy/unscoped callers).
   *   Always pass it from multi-tenant request paths — otherwise a company's
   *   report leaks other tenants' config values and reports false cross-tenant
   *   drift.
   * @returns ConfigDriftReport
   */
  async analyze(monitor: FleetMonitorService, companyId?: string): Promise<ConfigDriftReport> {
    const cacheKey = companyId ?? ALL_COMPANIES_KEY;

    // Return cache if fresh
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.report;
    }

    const bots = companyId
      ? monitor.getBotsByCompany(companyId)
      : monitor.getAllBots();
    const connectedBots = bots.filter((b) => b.state === "monitoring");

    if (connectedBots.length < 2) {
      return {
        generatedAt: new Date().toISOString(),
        botsCompared: connectedBots.length,
        drifts: [],
        consistentCount: 0,
      };
    }

    // Collect configs from all bots
    const botConfigs = new Map<string, Array<[string, string]>>();

    for (const bot of connectedBots) {
      try {
        const config = await monitor.rpcForBot(bot.botId, "config.get", {});
        if (config && typeof config === "object") {
          botConfigs.set(bot.botId, flattenConfig(config as Record<string, unknown>));
        }
      } catch (err) {
        console.warn("[fleet] config.get RPC failed for bot", bot.botId, err instanceof Error ? err.message : String(err));
      }
    }

    // Also add gateway version from capabilities
    for (const bot of connectedBots) {
      if (bot.capabilities?.serverVersion) {
        const existing = botConfigs.get(bot.botId) ?? [];
        existing.push(["gateway.version", JSON.stringify(bot.capabilities.serverVersion)]);
        botConfigs.set(bot.botId, existing);
      }
    }

    if (botConfigs.size < 2) {
      return {
        generatedAt: new Date().toISOString(),
        botsCompared: botConfigs.size,
        drifts: [],
        consistentCount: 0,
      };
    }

    // Build per-path value map: path → { value → [botIds] }
    const pathValues = new Map<string, Map<string, string[]>>();

    for (const [botId, entries] of botConfigs) {
      for (const [path, value] of entries) {
        if (!pathValues.has(path)) {
          pathValues.set(path, new Map());
        }
        const valueMap = pathValues.get(path)!;
        if (!valueMap.has(value)) {
          valueMap.set(value, []);
        }
        valueMap.get(value)!.push(botId);
      }
    }

    // Find drifts (paths with more than one unique value)
    const drifts: ConfigDriftEntry[] = [];
    let consistentCount = 0;

    for (const [path, valueMap] of pathValues) {
      if (valueMap.size <= 1) {
        consistentCount++;
        continue;
      }

      // This path has drift
      const severity = classifySeverity(path);
      const values: Record<string, string[]> = {};
      for (const [val, botIds] of valueMap) {
        values[val] = botIds;
      }

      drifts.push({
        configPath: path,
        severity,
        values,
        recommendation: generateRecommendation(path, values),
      });
    }

    // Sort: critical first, then warning, then info
    drifts.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    const report: ConfigDriftReport = {
      generatedAt: new Date().toISOString(),
      botsCompared: botConfigs.size,
      drifts,
      consistentCount,
    };

    // Cache result (per company)
    this.cache.set(cacheKey, {
      report,
      expiresAt: Date.now() + FleetConfigDriftDetector.CACHE_TTL_MS,
    });

    return report;
  }

  invalidateCache(companyId?: string) {
    if (companyId) {
      this.cache.delete(companyId);
    } else {
      this.cache.clear();
    }
  }
}

// Shared singleton so the per-company cache actually persists between requests.
// (The route previously constructed a fresh detector per call, throwing the
// cache away every time and re-running config.get RPCs on every poll.)
let detectorSingleton: FleetConfigDriftDetector | null = null;

export function getFleetConfigDriftDetector(): FleetConfigDriftDetector {
  if (!detectorSingleton) {
    detectorSingleton = new FleetConfigDriftDetector();
  }
  return detectorSingleton;
}
