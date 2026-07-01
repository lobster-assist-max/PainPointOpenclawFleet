/**
 * Fleet Time Machine
 *
 * Point-in-time reconstruction of the fleet from persisted history:
 * - Reconstruct each bot's recorded health / connection / usage at any timestamp
 * - Compare fleet states between two points in time
 * - Bookmark notable moments (incidents, deployments, anomalies)
 *
 * Real implementation queries the `fleet_snapshots` table (captured every
 * 15 min by fleet-snapshot-capture) for the nearest snapshot at-or-before the
 * target time per bot, and `fleet_alert_history` for alerts that were active at
 * that moment. Only fields that have a genuine historical source are returned —
 * config/topology/trust were previously fabricated and have been removed.
 *
 * When no `db` is available (tests), reconstruct returns an empty fleet so the
 * caller can render an explicit "no history" state rather than mock data.
 *
 * @see Planning #20
 */

import { EventEmitter } from "node:events";
import type { Db } from "@paperclipai/db";
import {
  fleetSnapshots,
  fleetAlertHistory,
  agents as agentsTable,
} from "@paperclipai/db";
import { and, eq, lte, gt, gte, or, isNull, inArray, desc, sql } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReconstructedBot {
  botId: string;
  botName: string;
  botEmoji: string;
  connectionState: string;
  healthScore: number;
  healthGrade: string;
  activeSessions: number;
  tokenUsage1h: number;
  latencyMs: number;
  connectedChannels: number;
  totalChannels: number;
  /** Timestamp of the snapshot this bot's state was reconstructed from. */
  snapshotAt: Date;
  /** How stale the snapshot is relative to the requested time, in minutes. */
  snapshotAgeMinutes: number;
  activeAlerts: Array<{ rule: string; severity: string; since: Date }>;
}

export interface FleetTimePoint {
  timestamp: Date;
  reconstructedAt: Date;
  confidence: "exact" | "interpolated" | "best_effort" | "no_data";
  dataAge: {
    /** Minutes from the requested time back to the nearest snapshot used. */
    nearestSnapshotMinutes: number;
    /** Whether any snapshot existed before the requested time. */
    snapshotsFound: boolean;
  };
  fleet: {
    id: string;
    totalBots: number;
    onlineBots: number;
    overallHealthScore: number;
    overallHealthGrade: string;
  };
  bots: ReconstructedBot[];
}

export interface TimeDiff {
  added: string[];
  removed: string[];
  changed: Array<{
    botId: string;
    botName: string;
    field: string;
    before: unknown;
    after: unknown;
  }>;
  summary: string;
}

export interface TimeRange {
  earliest: Date;
  latest: Date;
  resolution: string;
  /** Whether any snapshot history exists for this fleet. */
  hasHistory: boolean;
}

// ─── Bookmarks ──────────────────────────────────────────────────────────────

export interface TimeBookmark {
  id: string;
  timestamp: Date;
  label: string;
  type: "incident" | "deployment" | "manual" | "anomaly";
  refId?: string;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

const SNAPSHOT_LOOKBACK_DAYS = 90;

// ─── Service ────────────────────────────────────────────────────────────────

export class TimeMachineEngine extends EventEmitter {
  private bookmarks: Map<string, TimeBookmark> = new Map();
  private nextBookmarkId = 1;
  private db: Db | null;

  constructor(db: Db | null = null) {
    super();
    this.db = db;
  }

  /** Attach a db handle if the engine was constructed without one. */
  ensureDb(db: Db | null): void {
    if (db && !this.db) this.db = db;
  }

  /**
   * Reconstruct the fleet state at a specific point in time.
   *
   * For each bot in `fleetId` (a company UUID), finds the most recent
   * `fleet_snapshots` row at-or-before `timestamp` (within a 90-day lookback)
   * and the alerts from `fleet_alert_history` that were active at that moment
   * (firedAt <= timestamp AND (resolvedAt IS NULL OR resolvedAt > timestamp)).
   */
  async reconstruct(fleetId: string, timestamp: Date): Promise<FleetTimePoint> {
    const now = new Date();
    const emptyPoint: FleetTimePoint = {
      timestamp,
      reconstructedAt: now,
      confidence: "no_data",
      dataAge: { nearestSnapshotMinutes: 0, snapshotsFound: false },
      fleet: {
        id: fleetId,
        totalBots: 0,
        onlineBots: 0,
        overallHealthScore: 0,
        overallHealthGrade: "F",
      },
      bots: [],
    };

    if (!this.db) {
      this.emit("reconstruct", { fleetId, timestamp, confidence: "no_data" });
      return emptyPoint;
    }

    const lookbackFloor = new Date(
      timestamp.getTime() - SNAPSHOT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    // Pull every snapshot for the company in [lookbackFloor, timestamp], newest
    // first, then keep the first (latest <= timestamp) per bot. A DISTINCT ON
    // would push this into SQL but the JS reduction keeps the query portable and
    // the per-company window is small.
    const rows = await this.db
      .select({
        botId: fleetSnapshots.botId,
        capturedAt: fleetSnapshots.capturedAt,
        healthScore: fleetSnapshots.healthScore,
        healthGrade: fleetSnapshots.healthGrade,
        connectionState: fleetSnapshots.connectionState,
        inputTokens1h: fleetSnapshots.inputTokens1h,
        outputTokens1h: fleetSnapshots.outputTokens1h,
        cachedTokens1h: fleetSnapshots.cachedTokens1h,
        activeSessions: fleetSnapshots.activeSessions,
        connectedChannels: fleetSnapshots.connectedChannels,
        totalChannels: fleetSnapshots.totalChannels,
        avgLatencyMs: fleetSnapshots.avgLatencyMs,
      })
      .from(fleetSnapshots)
      .where(
        and(
          eq(fleetSnapshots.companyId, fleetId),
          gte(fleetSnapshots.capturedAt, lookbackFloor),
          lte(fleetSnapshots.capturedAt, timestamp),
        ),
      )
      .orderBy(desc(fleetSnapshots.capturedAt));

    if (rows.length === 0) {
      this.emit("reconstruct", { fleetId, timestamp, confidence: "no_data" });
      return emptyPoint;
    }

    // Latest snapshot per bot.
    const latestByBot = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!latestByBot.has(r.botId)) latestByBot.set(r.botId, r);
    }
    const botIds = [...latestByBot.keys()];

    // Resolve current display names/emojis for the reconstructed bots.
    const nameById = new Map<string, { name: string; emoji: string }>();
    try {
      const agentRows = await this.db
        .select({
          id: agentsTable.id,
          name: agentsTable.name,
          icon: agentsTable.icon,
          metadata: agentsTable.metadata,
        })
        .from(agentsTable)
        .where(inArray(agentsTable.id, botIds));
      for (const a of agentRows) {
        // The bot emoji lives in metadata.emoji; `icon` is a lucide icon-name
        // key (e.g. "bot"), never an emoji. Fall back to icon only when it isn't
        // a plain lucide-name token (legacy ConnectBot records). Mirrors the
        // /status route + agentToBotStatus so emojis are consistent everywhere.
        const meta = (a.metadata ?? {}) as Record<string, unknown>;
        const metaEmoji = typeof meta.emoji === "string" ? meta.emoji : "";
        const iconIsEmoji =
          a.icon != null && a.icon !== "" && !/^[a-z0-9-]+$/i.test(a.icon);
        nameById.set(a.id, {
          name: a.name,
          emoji: metaEmoji || (iconIsEmoji ? a.icon! : ""),
        });
      }
    } catch {
      /* agent name resolution is best-effort; fall back to botId below */
    }

    // Alerts active at `timestamp`, grouped by bot.
    const alertsByBot = new Map<
      string,
      Array<{ rule: string; severity: string; since: Date }>
    >();
    try {
      const alertRows = await this.db
        .select({
          botId: fleetAlertHistory.botId,
          ruleName: fleetAlertHistory.ruleName,
          severity: fleetAlertHistory.severity,
          firedAt: fleetAlertHistory.firedAt,
        })
        .from(fleetAlertHistory)
        .where(
          and(
            eq(fleetAlertHistory.companyId, fleetId),
            lte(fleetAlertHistory.firedAt, timestamp),
            or(
              isNull(fleetAlertHistory.resolvedAt),
              gt(fleetAlertHistory.resolvedAt, timestamp),
            ),
          ),
        );
      for (const a of alertRows) {
        if (!a.botId) continue;
        const list = alertsByBot.get(a.botId) ?? [];
        list.push({ rule: a.ruleName, severity: a.severity, since: a.firedAt });
        alertsByBot.set(a.botId, list);
      }
    } catch {
      /* alert history is best-effort context; absence just means no alerts shown */
    }

    let nearestSnapshotMinutes = Infinity;
    const bots: ReconstructedBot[] = botIds.map((botId) => {
      const r = latestByBot.get(botId)!;
      const id = nameById.get(botId);
      const ageMinutes = Math.max(
        0,
        Math.round((timestamp.getTime() - r.capturedAt.getTime()) / 60_000),
      );
      if (ageMinutes < nearestSnapshotMinutes) nearestSnapshotMinutes = ageMinutes;
      const tokens =
        (r.inputTokens1h ?? 0) + (r.outputTokens1h ?? 0) + (r.cachedTokens1h ?? 0);
      const score = r.healthScore ?? 0;
      return {
        botId,
        botName: id?.name ?? botId,
        botEmoji: id?.emoji ?? "",
        connectionState: r.connectionState ?? "unknown",
        healthScore: score,
        healthGrade: r.healthGrade ?? gradeFor(score),
        activeSessions: r.activeSessions ?? 0,
        tokenUsage1h: tokens,
        latencyMs: r.avgLatencyMs ?? 0,
        connectedChannels: r.connectedChannels ?? 0,
        totalChannels: r.totalChannels ?? 0,
        snapshotAt: r.capturedAt,
        snapshotAgeMinutes: ageMinutes,
        activeAlerts: alertsByBot.get(botId) ?? [],
      };
    });

    const onlineBots = bots.filter(
      (b) => b.connectionState === "monitoring",
    ).length;
    const overallHealthScore = bots.length
      ? Math.round(bots.reduce((s, b) => s + b.healthScore, 0) / bots.length)
      : 0;

    if (!Number.isFinite(nearestSnapshotMinutes)) nearestSnapshotMinutes = 0;
    let confidence: FleetTimePoint["confidence"] = "exact";
    if (nearestSnapshotMinutes > 15) confidence = "interpolated";
    if (nearestSnapshotMinutes > 24 * 60) confidence = "best_effort";

    const point: FleetTimePoint = {
      timestamp,
      reconstructedAt: now,
      confidence,
      dataAge: { nearestSnapshotMinutes, snapshotsFound: true },
      fleet: {
        id: fleetId,
        totalBots: bots.length,
        onlineBots,
        overallHealthScore,
        overallHealthGrade: gradeFor(overallHealthScore),
      },
      bots,
    };

    this.emit("reconstruct", { fleetId, timestamp, confidence });
    return point;
  }

  /**
   * Compare reconstructed fleet states between two points in time.
   */
  async diff(fleetId: string, t1: Date, t2: Date): Promise<TimeDiff> {
    const [state1, state2] = await Promise.all([
      this.reconstruct(fleetId, t1),
      this.reconstruct(fleetId, t2),
    ]);

    const botIds1 = new Set(state1.bots.map((b) => b.botId));
    const botIds2 = new Set(state2.bots.map((b) => b.botId));

    const nameOf = (id: string) =>
      state2.bots.find((b) => b.botId === id)?.botName ??
      state1.bots.find((b) => b.botId === id)?.botName ??
      id;

    const added = [...botIds2].filter((id) => !botIds1.has(id));
    const removed = [...botIds1].filter((id) => !botIds2.has(id));
    const changed: TimeDiff["changed"] = [];

    for (const bot2 of state2.bots) {
      const bot1 = state1.bots.find((b) => b.botId === bot2.botId);
      if (!bot1) continue;

      if (bot1.healthScore !== bot2.healthScore) {
        changed.push({ botId: bot2.botId, botName: bot2.botName, field: "healthScore", before: bot1.healthScore, after: bot2.healthScore });
      }
      if (bot1.connectionState !== bot2.connectionState) {
        changed.push({ botId: bot2.botId, botName: bot2.botName, field: "connectionState", before: bot1.connectionState, after: bot2.connectionState });
      }
      if (bot1.activeSessions !== bot2.activeSessions) {
        changed.push({ botId: bot2.botId, botName: bot2.botName, field: "activeSessions", before: bot1.activeSessions, after: bot2.activeSessions });
      }
    }

    return {
      added,
      removed,
      changed,
      summary: `${added.length} added, ${removed.length} removed, ${changed.length} changed`,
    };
  }

  /**
   * Get the available time range for reconstruction, derived from the actual
   * earliest/latest snapshot timestamps for the fleet.
   */
  async getAvailableRange(fleetId: string): Promise<TimeRange> {
    const fallback: TimeRange = {
      earliest: new Date(Date.now() - SNAPSHOT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      latest: new Date(),
      resolution: "15-minute snapshots",
      hasHistory: false,
    };
    if (!this.db) return fallback;

    const [row] = await this.db
      .select({
        earliest: sql<string | null>`min(${fleetSnapshots.capturedAt})`,
        latest: sql<string | null>`max(${fleetSnapshots.capturedAt})`,
      })
      .from(fleetSnapshots)
      .where(eq(fleetSnapshots.companyId, fleetId));

    if (!row?.earliest || !row?.latest) return fallback;
    return {
      earliest: new Date(row.earliest),
      latest: new Date(row.latest),
      resolution: "15-minute snapshots",
      hasHistory: true,
    };
  }

  // ─── Bookmarks ──────────────────────────────────────────────────────────

  /** Create a bookmark at a specific time. */
  createBookmark(
    timestamp: Date,
    label: string,
    type: TimeBookmark["type"],
    refId?: string,
  ): TimeBookmark {
    const id = `BM-${String(this.nextBookmarkId++).padStart(4, "0")}`;
    const bookmark: TimeBookmark = {
      id,
      timestamp,
      label,
      type,
      refId,
      createdAt: new Date(),
    };
    this.bookmarks.set(id, bookmark);
    this.emit("bookmark:created", bookmark);
    return bookmark;
  }

  /** List all bookmarks, optionally filtered by type, newest first. */
  listBookmarks(type?: TimeBookmark["type"]): TimeBookmark[] {
    const all = Array.from(this.bookmarks.values());
    const filtered = type ? all.filter((b) => b.type === type) : all;
    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /** Delete a bookmark. */
  deleteBookmark(id: string): boolean {
    return this.bookmarks.delete(id);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _engine: TimeMachineEngine | null = null;

export function getTimeMachineEngine(db: Db | null = null): TimeMachineEngine {
  if (!_engine) {
    _engine = new TimeMachineEngine(db);
  } else {
    // Backfill the db handle if the singleton was first created without one.
    _engine.ensureDb(db);
  }
  return _engine;
}
