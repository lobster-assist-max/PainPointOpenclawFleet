/**
 * Fleet Time Machine
 *
 * Point-in-time reconstruction of the entire fleet state:
 * - Reconstruct any bot's status, config, alerts at any timestamp
 * - Compare fleet states between two points in time
 * - Link to incidents and deployments for context
 * - Playback mode: stream state changes over a time range
 *
 * Uses fleet_snapshots (hourly) + fleet_audit_history (events) +
 * fleet_alert_history (alerts) to interpolate state between snapshots.
 *
 * @see Planning #20
 */

import { EventEmitter } from "node:events";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FleetTimePoint {
  timestamp: Date;
  reconstructedAt: Date;
  confidence: "exact" | "interpolated" | "best_effort";
  dataAge: {
    nearestSnapshotMinutes: number;
    eventsCovered: boolean;
  };

  fleet: {
    id: string;
    name: string;
    totalBots: number;
    onlineBots: number;
    overallHealthScore: number;
    overallHealthGrade: string;
  };

  bots: Array<{
    botId: string;
    botName: string;
    connectionState: string;
    healthScore: number;
    healthGrade: string;
    trustLevel: number;
    activeSessions: number;
    tokenUsage1h: number;
    latencyMs: number;

    config: {
      promptVersion: number;
      modelId: string;
      skills: string[];
      cronJobs: number;
    };

    recentActions: Array<{ action: string; at: Date; by: string }>;
    activeAlerts: Array<{ rule: string; severity: string; since: Date }>;
    activeIncidents: Array<{ id: string; severity: string; status: string }>;
  }>;

  topology: {
    connections: Array<{ from: string; to: string; type: string }>;
    delegationChains: Array<{ delegator: string; delegate: string; task: string }>;
  };

  context: {
    eventsBefore: Array<{ type: string; description: string; at: Date }>;
    eventsAfter: Array<{ type: string; description: string; at: Date }>;
    activeDeployments: Array<{ id: string; status: string; wave: number }>;
  };
}

export interface TimeDiff {
  added: string[];
  removed: string[];
  changed: Array<{
    botId: string;
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

// ─── Service ────────────────────────────────────────────────────────────────

export class TimeMachineEngine extends EventEmitter {
  private bookmarks: Map<string, TimeBookmark> = new Map();
  private nextBookmarkId = 1;

  /**
   * Reconstruct the fleet state at a specific point in time.
   *
   * Strategy:
   * 1. Find the nearest hourly snapshot before and after the target time
   * 2. Query audit events in the window around the target
   * 3. Query active alerts at that time
   * 4. Interpolate bot states between snapshots using event data
   *
   * Currently returns simulated data for UI development.
   * Real implementation would query fleetSnapshots + fleetAuditHistory tables.
   */
  reconstruct(fleetId: string, timestamp: Date): FleetTimePoint {
    const now = new Date();
    const ageMinutes = Math.floor((now.getTime() - timestamp.getTime()) / 60_000);
    const nearestSnapshotMinutes = ageMinutes % 60; // snapshots are hourly

    // Determine confidence based on data availability
    let confidence: FleetTimePoint["confidence"] = "exact";
    if (nearestSnapshotMinutes > 30) confidence = "interpolated";
    if (ageMinutes > 90 * 24 * 60) confidence = "best_effort"; // >90 days old

    const timePoint: FleetTimePoint = {
      timestamp,
      reconstructedAt: now,
      confidence,
      dataAge: {
        nearestSnapshotMinutes,
        eventsCovered: ageMinutes < 90 * 24 * 60,
      },
      fleet: {
        id: fleetId,
        name: "Pain Point Fleet",
        totalBots: 5,
        onlineBots: 4,
        overallHealthScore: 78,
        overallHealthGrade: "B+",
      },
      bots: [
        {
          botId: "lobster-01",
          botName: "🦞 小龍蝦",
          connectionState: "monitoring",
          healthScore: 85,
          healthGrade: "A-",
          trustLevel: 3,
          activeSessions: 2,
          tokenUsage1h: 12500,
          latencyMs: 145,
          config: { promptVersion: 7, modelId: "claude-sonnet-4-6", skills: ["calendar", "crm", "survey"], cronJobs: 3 },
          recentActions: [],
          activeAlerts: [],
          activeIncidents: [],
        },
        {
          botId: "squirrel-01",
          botName: "🐿️ 飛鼠",
          connectionState: "monitoring",
          healthScore: 79,
          healthGrade: "B",
          trustLevel: 2,
          activeSessions: 1,
          tokenUsage1h: 8700,
          latencyMs: 230,
          config: { promptVersion: 5, modelId: "claude-sonnet-4-6", skills: ["calendar", "crm"], cronJobs: 2 },
          recentActions: [],
          activeAlerts: [],
          activeIncidents: [],
        },
        {
          botId: "boar-01",
          botName: "🐗 山豬",
          connectionState: "monitoring",
          healthScore: 72,
          healthGrade: "B-",
          trustLevel: 2,
          activeSessions: 0,
          tokenUsage1h: 3200,
          latencyMs: 310,
          config: { promptVersion: 6, modelId: "claude-haiku-4-5", skills: ["survey"], cronJobs: 1 },
          recentActions: [],
          activeAlerts: [{ rule: "high_latency", severity: "warning", since: new Date(timestamp.getTime() - 300_000) }],
          activeIncidents: [],
        },
        {
          botId: "peacock-01",
          botName: "🦚 孔雀",
          connectionState: "monitoring",
          healthScore: 91,
          healthGrade: "A",
          trustLevel: 3,
          activeSessions: 3,
          tokenUsage1h: 15800,
          latencyMs: 120,
          config: { promptVersion: 8, modelId: "claude-sonnet-4-6", skills: ["calendar", "crm", "survey", "billing"], cronJobs: 4 },
          recentActions: [],
          activeAlerts: [],
          activeIncidents: [],
        },
        {
          botId: "monkey-01",
          botName: "🐒 猴子",
          connectionState: "disconnected",
          healthScore: 0,
          healthGrade: "F",
          trustLevel: 1,
          activeSessions: 0,
          tokenUsage1h: 0,
          latencyMs: 0,
          config: { promptVersion: 3, modelId: "claude-haiku-4-5", skills: ["survey"], cronJobs: 0 },
          recentActions: [{ action: "disconnected", at: new Date(timestamp.getTime() - 600_000), by: "system" }],
          activeAlerts: [{ rule: "bot_offline", severity: "critical", since: new Date(timestamp.getTime() - 600_000) }],
          activeIncidents: [{ id: "INC-20260319-01", severity: "P2", status: "investigating" }],
        },
      ],
      topology: {
        connections: [
          { from: "lobster-01", to: "squirrel-01", type: "delegation" },
          { from: "peacock-01", to: "boar-01", type: "delegation" },
        ],
        delegationChains: [
          { delegator: "lobster-01", delegate: "squirrel-01", task: "follow-up calls" },
        ],
      },
      context: {
        eventsBefore: [],
        eventsAfter: [],
        activeDeployments: [],
      },
    };

    this.emit("reconstruct", { fleetId, timestamp, confidence });
    return timePoint;
  }

  /**
   * Compare fleet states between two points in time.
   */
  diff(fleetId: string, t1: Date, t2: Date): TimeDiff {
    const state1 = this.reconstruct(fleetId, t1);
    const state2 = this.reconstruct(fleetId, t2);

    const botIds1 = new Set(state1.bots.map((b) => b.botId));
    const botIds2 = new Set(state2.bots.map((b) => b.botId));

    const added = [...botIds2].filter((id) => !botIds1.has(id));
    const removed = [...botIds1].filter((id) => !botIds2.has(id));
    const changed: TimeDiff["changed"] = [];

    for (const bot2 of state2.bots) {
      const bot1 = state1.bots.find((b) => b.botId === bot2.botId);
      if (!bot1) continue;

      if (bot1.healthScore !== bot2.healthScore) {
        changed.push({ botId: bot2.botId, field: "healthScore", before: bot1.healthScore, after: bot2.healthScore });
      }
      if (bot1.connectionState !== bot2.connectionState) {
        changed.push({ botId: bot2.botId, field: "connectionState", before: bot1.connectionState, after: bot2.connectionState });
      }
      if (bot1.trustLevel !== bot2.trustLevel) {
        changed.push({ botId: bot2.botId, field: "trustLevel", before: bot1.trustLevel, after: bot2.trustLevel });
      }
      if (bot1.config.promptVersion !== bot2.config.promptVersion) {
        changed.push({ botId: bot2.botId, field: "promptVersion", before: bot1.config.promptVersion, after: bot2.config.promptVersion });
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
   * Reconstruct state at the time an incident was created.
   */
  reconstructAtIncident(fleetId: string, incidentId: string, incidentCreatedAt: Date): FleetTimePoint {
    const point = this.reconstruct(fleetId, incidentCreatedAt);
    // Add incident context
    point.context.activeDeployments = [];
    return point;
  }

  /**
   * Reconstruct state before and after a deployment.
   */
  reconstructAroundDeployment(
    fleetId: string,
    deploymentStartedAt: Date,
    deploymentCompletedAt: Date,
  ): { before: FleetTimePoint; after: FleetTimePoint; diff: TimeDiff } {
    const before = this.reconstruct(fleetId, new Date(deploymentStartedAt.getTime() - 60_000));
    const after = this.reconstruct(fleetId, new Date(deploymentCompletedAt.getTime() + 60_000));
    const d = this.diff(fleetId, deploymentStartedAt, deploymentCompletedAt);
    return { before, after, diff: d };
  }

  /**
   * Get the available time range for reconstruction.
   */
  getAvailableRange(fleetId: string): TimeRange {
    return {
      earliest: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
      latest: new Date(),
      resolution: "hourly snapshots + event-level interpolation",
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

  /** List all bookmarks, optionally filtered by type. */
  listBookmarks(type?: TimeBookmark["type"]): TimeBookmark[] {
    const all = Array.from(this.bookmarks.values());
    if (type) return all.filter((b) => b.type === type);
    return all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /** Delete a bookmark. */
  deleteBookmark(id: string): boolean {
    return this.bookmarks.delete(id);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _engine: TimeMachineEngine | null = null;

export function getTimeMachineEngine(): TimeMachineEngine {
  if (!_engine) {
    _engine = new TimeMachineEngine();
  }
  return _engine;
}
