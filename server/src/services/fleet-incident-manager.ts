/**
 * Fleet Incident Lifecycle Manager
 *
 * End-to-end incident management for fleet operations. Automates the full
 * lifecycle from detection through postmortem, reducing manual toil and
 * improving mean-time-to-resolve (MTTR).
 *
 * Key capabilities:
 *   1. Auto-incident creation — Creates incidents from alerts and anomaly correlations
 *   2. Severity classification — Auto-classifies P1-P4 based on affected bots/impact
 *   3. On-call rotation — Manages schedules and auto-assigns responders
 *   4. Escalation engine — Escalates after configurable timeouts per severity
 *   5. Timeline builder — Collects all events into an ordered incident timeline
 *   6. AI postmortem generation — Produces structured postmortems from timeline data
 *   7. MTTR/MTTI calculation — Tracks incident response metrics over time
 *   8. Incident deduplication — Prevents duplicate incidents for the same root cause
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import pino from "pino";

const log = pino({ name: "fleet-incident-manager" });

// ─── Types ───────────────────────────────────────────────────────────────────

export type IncidentSeverity = "P1" | "P2" | "P3" | "P4";

export type IncidentStatus =
  | "detected"
  | "acknowledged"
  | "investigating"
  | "mitigating"
  | "resolved"
  | "postmortem";

export type IncidentCategory =
  | "infrastructure"
  | "provider"
  | "channel"
  | "config"
  | "traffic"
  | "performance"
  | "cost"
  | "security"
  | "unknown";

export type TimelineEventType =
  | "incident_created"
  | "incident_acknowledged"
  | "status_changed"
  | "assignee_changed"
  | "escalation"
  | "healing_attempt"
  | "bot_affected"
  | "bot_recovered"
  | "note_added"
  | "severity_changed"
  | "resolved"
  | "postmortem_generated";

export interface IncidentAssignee {
  userId: string;
  name: string;
  assignedAt: Date;
}

export interface IncidentClassification {
  severity: IncidentSeverity;
  category: IncidentCategory;
  source: string;
  sourceRef?: string;
}

export interface IncidentLifecycle {
  status: IncidentStatus;
  assignee?: IncidentAssignee;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

export interface TimelineEntry {
  timestamp: Date;
  type: TimelineEventType;
  actor: string;
  actorName?: string;
  message: string;
}

export interface EscalationLevel {
  level: number;
  afterMinutes: number;
  notifyChannels: string[];
}

export interface IncidentEscalation {
  currentLevel: number;
  policy: EscalationLevel[];
}

export interface PostmortemImpact {
  durationMinutes: number;
  affectedBots: number;
  affectedSessions: number;
}

export interface PostmortemActionItem {
  description: string;
  owner: string;
  priority: string;
}

export interface IncidentPostmortem {
  summary: string;
  rootCauseAnalysis: string;
  impact: PostmortemImpact;
  whatWorked: string[];
  whatFailed: string[];
  actionItems: PostmortemActionItem[];
}

export interface IncidentMetrics {
  /** Mean Time To Identify (minutes from detection to acknowledge) */
  mtti: number;
  /** Mean Time To Acknowledge (minutes) */
  mtta: number;
  /** Mean Time To Resolve (minutes from detection to resolution) */
  mttr: number;
  /** Total number of healing attempts during the incident */
  healingAttemptsCount: number;
  /** Total number of escalations triggered */
  escalationCount: number;
}

export interface FleetIncident {
  id: string;
  fleetId: string;
  createdAt: Date;
  updatedAt: Date;
  classification: IncidentClassification;
  title: string;
  description: string;
  affectedBots: string[];
  lifecycle: IncidentLifecycle;
  timeline: TimelineEntry[];
  escalation: IncidentEscalation;
  postmortem?: IncidentPostmortem;
  metrics: IncidentMetrics;
}

/** Input payload for auto-creating incidents from alerts or correlations. */
export interface IncidentTrigger {
  fleetId: string;
  source: string;
  sourceRef?: string;
  title: string;
  description: string;
  affectedBots: string[];
  category?: IncidentCategory;
  /** If provided, overrides automatic severity classification. */
  severityOverride?: IncidentSeverity;
  /** Estimated number of sessions affected (used for severity classification). */
  estimatedSessionsAffected?: number;
}

/** A member in the on-call rotation schedule. */
export interface OnCallMember {
  userId: string;
  name: string;
  /** ISO weekday 1=Monday..7=Sunday */
  scheduleDays: number[];
  /** UTC hour start of shift (0-23) */
  shiftStartHour: number;
  /** UTC hour end of shift (0-23) */
  shiftEndHour: number;
  /** Priority within the same shift — lower wins */
  priority: number;
}

/** Configuration for the incident lifecycle manager. */
export interface IncidentManagerConfig {
  /** How often (ms) the escalation engine checks for overdue incidents. Default 60_000. */
  escalationCheckIntervalMs: number;
  /** Default escalation policy applied to new incidents. */
  defaultEscalationPolicy: EscalationLevel[];
  /** Deduplication window (ms). Triggers with the same fingerprint within this window are merged. Default 600_000 (10 min). */
  deduplicationWindowMs: number;
  /** Maximum timeline entries per incident before oldest entries are trimmed. Default 500. */
  maxTimelineEntries: number;
}

/** Fingerprint used to detect duplicate incidents. */
interface DeduplicationEntry {
  incidentId: string;
  fingerprint: string;
  createdAt: number;
}

// ─── Event Types ─────────────────────────────────────────────────────────────

export type IncidentEvent =
  | "incident.created"
  | "incident.acknowledged"
  | "incident.status_changed"
  | "incident.assigned"
  | "incident.escalated"
  | "incident.resolved"
  | "incident.postmortem_generated"
  | "incident.timeline_updated"
  | "incident.severity_changed"
  | "incident.merged";

// ─── Default Escalation Policy ───────────────────────────────────────────────

const DEFAULT_ESCALATION_POLICY: EscalationLevel[] = [
  { level: 1, afterMinutes: 5, notifyChannels: ["slack-oncall", "dashboard"] },
  { level: 2, afterMinutes: 15, notifyChannels: ["slack-oncall", "slack-engineering", "pagerduty"] },
  { level: 3, afterMinutes: 30, notifyChannels: ["slack-oncall", "slack-engineering", "slack-leadership", "pagerduty"] },
  { level: 4, afterMinutes: 60, notifyChannels: ["slack-oncall", "slack-engineering", "slack-leadership", "phone-tree"] },
];

/**
 * Severity-specific escalation timing overrides (in minutes).
 * P1 incidents escalate much faster than P4.
 */
const SEVERITY_ESCALATION_MULTIPLIERS: Record<IncidentSeverity, number> = {
  P1: 0.5,
  P2: 1.0,
  P3: 2.0,
  P4: 4.0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a fingerprint for an incident trigger to detect duplicates.
 * Two triggers with the same fingerprint within the dedup window are
 * considered to be the same root-cause incident.
 */
function computeFingerprint(trigger: IncidentTrigger): string {
  const sortedBots = [...trigger.affectedBots].sort().join(",");
  const category = trigger.category ?? "unknown";
  return `${trigger.fleetId}:${trigger.source}:${category}:${sortedBots}`;
}

/**
 * Calculate the number of minutes between two dates.
 * Returns 0 if either date is missing.
 */
function minutesBetween(a: Date | undefined, b: Date | undefined): number {
  if (!a || !b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 60_000);
}

// ─── Incident Lifecycle Manager ──────────────────────────────────────────────

/**
 * Fleet Incident Lifecycle Manager.
 *
 * Manages the full lifecycle of fleet incidents, from automated creation
 * through resolution and postmortem generation. Integrates with the fleet
 * alerting, anomaly correlation, and self-healing subsystems.
 *
 * @example
 * ```ts
 * const manager = new IncidentLifecycleManager();
 * manager.setOnCallRotation([
 *   { userId: "u1", name: "Alice", scheduleDays: [1,2,3,4,5], shiftStartHour: 9, shiftEndHour: 17, priority: 1 },
 * ]);
 * manager.start();
 *
 * // Auto-create from an alert
 * const incident = manager.createIncident({
 *   fleetId: "fleet-1",
 *   source: "alert",
 *   sourceRef: "alert-123",
 *   title: "Multiple bots offline",
 *   description: "3 bots went offline simultaneously",
 *   affectedBots: ["bot-1", "bot-2", "bot-3"],
 *   category: "infrastructure",
 * });
 *
 * manager.acknowledgeIncident(incident.id, "u1", "Alice");
 * manager.updateStatus(incident.id, "investigating", "u1", "Alice");
 * manager.resolveIncident(incident.id, "u1", "Alice", "Root cause fixed");
 * const postmortem = manager.generatePostmortem(incident.id);
 * ```
 */
class IncidentLifecycleManager extends EventEmitter {
  /** In-memory incident store. Keyed by incident ID. */
  private incidents: Map<string, FleetIncident> = new Map();

  /** Deduplication index. Keyed by fingerprint. */
  private deduplicationIndex: Map<string, DeduplicationEntry> = new Map();

  /** On-call rotation members. */
  private onCallRotation: OnCallMember[] = [];

  /** Timer handle for the escalation check loop. */
  private escalationTimer: ReturnType<typeof setInterval> | null = null;

  /** Manager configuration. */
  private config: IncidentManagerConfig;

  constructor(config?: Partial<IncidentManagerConfig>) {
    super();
    this.config = {
      escalationCheckIntervalMs: 60_000,
      defaultEscalationPolicy: [...DEFAULT_ESCALATION_POLICY],
      deduplicationWindowMs: 600_000,
      maxTimelineEntries: 500,
      ...config,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Start the escalation check loop.
   * Should be called once after construction and on-call setup.
   */
  start(): void {
    if (this.escalationTimer) return;
    log.info("Incident lifecycle manager started");
    this.escalationTimer = setInterval(
      () => this.runEscalationCheck(),
      this.config.escalationCheckIntervalMs,
    );
    // Run an immediate first check
    this.runEscalationCheck();
  }

  /**
   * Stop the escalation check loop and release resources.
   */
  stop(): void {
    if (this.escalationTimer) {
      clearInterval(this.escalationTimer);
      this.escalationTimer = null;
    }
    log.info("Incident lifecycle manager stopped");
  }

  // ── On-Call Rotation ───────────────────────────────────────────────────────

  /**
   * Replace the entire on-call rotation schedule.
   * @param members - Array of on-call members with shift definitions.
   */
  setOnCallRotation(members: OnCallMember[]): void {
    this.onCallRotation = [...members];
    log.info({ count: members.length }, "On-call rotation updated");
  }

  /**
   * Add or update a single on-call member.
   * If a member with the same userId already exists it is replaced.
   * @param member - The on-call member definition.
   */
  upsertOnCallMember(member: OnCallMember): void {
    const idx = this.onCallRotation.findIndex((m) => m.userId === member.userId);
    if (idx >= 0) {
      this.onCallRotation[idx] = member;
    } else {
      this.onCallRotation.push(member);
    }
  }

  /**
   * Remove an on-call member by user ID.
   * @param userId - The user to remove from rotation.
   */
  removeOnCallMember(userId: string): void {
    this.onCallRotation = this.onCallRotation.filter((m) => m.userId !== userId);
  }

  /**
   * Determine who is currently on-call based on the rotation schedule.
   * @param at - The point in time to evaluate. Defaults to now.
   * @returns The on-call member, or undefined if nobody is on shift.
   */
  getCurrentOnCall(at: Date = new Date()): OnCallMember | undefined {
    const utcDay = at.getUTCDay(); // 0=Sun
    const isoDay = utcDay === 0 ? 7 : utcDay; // Convert to ISO 1=Mon..7=Sun
    const utcHour = at.getUTCHours();

    const candidates = this.onCallRotation.filter((m) => {
      if (!m.scheduleDays.includes(isoDay)) return false;
      // Handle shifts that cross midnight
      if (m.shiftStartHour <= m.shiftEndHour) {
        return utcHour >= m.shiftStartHour && utcHour < m.shiftEndHour;
      }
      // Overnight shift (e.g., 22:00 - 06:00)
      return utcHour >= m.shiftStartHour || utcHour < m.shiftEndHour;
    });

    if (candidates.length === 0) return undefined;

    // Return highest priority (lowest number) candidate
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0];
  }

  // ── Severity Classification ────────────────────────────────────────────────

  /**
   * Auto-classify incident severity based on the number of affected bots,
   * estimated session impact, and category.
   *
   * Classification rules:
   *   - P1: >= 5 bots affected OR >= 100 sessions OR security category
   *   - P2: >= 3 bots affected OR >= 50 sessions
   *   - P3: >= 2 bots affected OR >= 10 sessions
   *   - P4: everything else (single bot, low impact)
   *
   * @param trigger - The incident trigger payload.
   * @returns The computed severity level.
   */
  classifySeverity(trigger: IncidentTrigger): IncidentSeverity {
    if (trigger.severityOverride) return trigger.severityOverride;

    const botCount = trigger.affectedBots.length;
    const sessions = trigger.estimatedSessionsAffected ?? 0;

    // Security incidents are always P1
    if (trigger.category === "security") return "P1";

    // P1: large blast radius
    if (botCount >= 5 || sessions >= 100) return "P1";

    // P2: significant impact
    if (botCount >= 3 || sessions >= 50) return "P2";

    // P3: moderate impact
    if (botCount >= 2 || sessions >= 10) return "P3";

    // P4: low / isolated
    return "P4";
  }

  // ── Incident Deduplication ─────────────────────────────────────────────────

  /**
   * Check if an incoming trigger is a duplicate of an existing open incident.
   * Uses a fingerprint based on fleet, source, category, and affected bots.
   *
   * @param trigger - The incident trigger to check.
   * @returns The existing incident if a duplicate is found, or undefined.
   */
  findDuplicate(trigger: IncidentTrigger): FleetIncident | undefined {
    const fingerprint = computeFingerprint(trigger);
    const now = Date.now();

    // Purge expired dedup entries
    for (const [fp, entry] of this.deduplicationIndex) {
      if (now - entry.createdAt > this.config.deduplicationWindowMs) {
        this.deduplicationIndex.delete(fp);
      }
    }

    const entry = this.deduplicationIndex.get(fingerprint);
    if (!entry) return undefined;

    const incident = this.incidents.get(entry.incidentId);
    if (!incident) {
      // Stale entry pointing to a removed incident
      this.deduplicationIndex.delete(fingerprint);
      return undefined;
    }

    // Only dedup against open (unresolved) incidents
    if (incident.lifecycle.status === "resolved" || incident.lifecycle.status === "postmortem") {
      return undefined;
    }

    return incident;
  }

  // ── Incident CRUD ──────────────────────────────────────────────────────────

  /**
   * Create a new incident from an alert, anomaly correlation, or manual trigger.
   *
   * Performs deduplication first: if a matching open incident exists, the new
   * trigger is merged into the existing incident's timeline and affected bot
   * list instead of creating a duplicate.
   *
   * @param trigger - The incident trigger payload.
   * @returns The created (or merged-into) FleetIncident.
   */
  createIncident(trigger: IncidentTrigger): FleetIncident {
    // ── Deduplication check ──
    const existing = this.findDuplicate(trigger);
    if (existing) {
      return this.mergeIntoExisting(existing, trigger);
    }

    const now = new Date();
    const severity = this.classifySeverity(trigger);

    // Build severity-adjusted escalation policy
    const multiplier = SEVERITY_ESCALATION_MULTIPLIERS[severity];
    const adjustedPolicy: EscalationLevel[] = this.config.defaultEscalationPolicy.map((level) => ({
      ...level,
      afterMinutes: Math.max(1, Math.round(level.afterMinutes * multiplier)),
    }));

    const incident: FleetIncident = {
      id: randomUUID(),
      fleetId: trigger.fleetId,
      createdAt: now,
      updatedAt: now,
      classification: {
        severity,
        category: trigger.category ?? "unknown",
        source: trigger.source,
        sourceRef: trigger.sourceRef,
      },
      title: trigger.title,
      description: trigger.description,
      affectedBots: [...trigger.affectedBots],
      lifecycle: {
        status: "detected",
      },
      timeline: [
        {
          timestamp: now,
          type: "incident_created",
          actor: "system",
          message: `Incident created from ${trigger.source}${trigger.sourceRef ? ` (${trigger.sourceRef})` : ""}. Severity: ${severity}. Affected bots: ${trigger.affectedBots.length}.`,
        },
      ],
      escalation: {
        currentLevel: 0,
        policy: adjustedPolicy,
      },
      metrics: {
        mtti: 0,
        mtta: 0,
        mttr: 0,
        healingAttemptsCount: 0,
        escalationCount: 0,
      },
    };

    // Store
    this.incidents.set(incident.id, incident);

    // Register dedup fingerprint
    const fingerprint = computeFingerprint(trigger);
    this.deduplicationIndex.set(fingerprint, {
      incidentId: incident.id,
      fingerprint,
      createdAt: now.getTime(),
    });

    // Auto-assign on-call
    this.autoAssign(incident);

    log.info(
      { incidentId: incident.id, severity, bots: incident.affectedBots.length },
      "Incident created",
    );
    this.emit("incident.created", incident);
    return incident;
  }

  /**
   * Merge a duplicate trigger into an existing open incident.
   * Adds new bots and a timeline entry, then re-evaluates severity.
   */
  private mergeIntoExisting(incident: FleetIncident, trigger: IncidentTrigger): FleetIncident {
    const now = new Date();

    // Merge affected bots (deduplicated)
    const botSet = new Set(incident.affectedBots);
    let newBotsAdded = 0;
    for (const botId of trigger.affectedBots) {
      if (!botSet.has(botId)) {
        botSet.add(botId);
        newBotsAdded++;
      }
    }
    incident.affectedBots = [...botSet];

    // Re-classify severity based on updated bot count
    const newSeverity = this.classifySeverity({
      ...trigger,
      affectedBots: incident.affectedBots,
      severityOverride: undefined,
    });

    const severityChanged = newSeverity !== incident.classification.severity;
    if (severityChanged && this.isSeverityHigher(newSeverity, incident.classification.severity)) {
      const oldSeverity = incident.classification.severity;
      incident.classification.severity = newSeverity;

      // Recalculate escalation timing
      const multiplier = SEVERITY_ESCALATION_MULTIPLIERS[newSeverity];
      incident.escalation.policy = this.config.defaultEscalationPolicy.map((level) => ({
        ...level,
        afterMinutes: Math.max(1, Math.round(level.afterMinutes * multiplier)),
      }));

      this.addTimelineEntry(incident, {
        timestamp: now,
        type: "severity_changed",
        actor: "system",
        message: `Severity upgraded from ${oldSeverity} to ${newSeverity} due to expanded blast radius (${incident.affectedBots.length} bots).`,
      });
      this.emit("incident.severity_changed", incident);
    }

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "incident_created",
      actor: "system",
      message: `Duplicate trigger merged from ${trigger.source}${trigger.sourceRef ? ` (${trigger.sourceRef})` : ""}. ${newBotsAdded} new bots added. Total affected: ${incident.affectedBots.length}.`,
    });

    incident.updatedAt = now;

    log.info(
      { incidentId: incident.id, newBots: newBotsAdded, totalBots: incident.affectedBots.length },
      "Duplicate trigger merged into existing incident",
    );
    this.emit("incident.merged", incident);
    return incident;
  }

  /**
   * Acknowledge an incident, marking that a human responder is aware.
   *
   * @param incidentId - The incident to acknowledge.
   * @param userId - The acknowledging user's ID.
   * @param userName - The acknowledging user's display name.
   * @returns The updated incident, or undefined if not found.
   */
  acknowledgeIncident(incidentId: string, userId: string, userName: string): FleetIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      log.warn({ incidentId }, "Cannot acknowledge: incident not found");
      return undefined;
    }

    if (incident.lifecycle.status !== "detected") {
      log.warn(
        { incidentId, status: incident.lifecycle.status },
        "Cannot acknowledge: incident not in detected status",
      );
      return incident;
    }

    const now = new Date();
    incident.lifecycle.status = "acknowledged";
    incident.lifecycle.acknowledgedAt = now;
    incident.lifecycle.assignee = { userId, name: userName, assignedAt: now };
    incident.updatedAt = now;

    // Update MTTI and MTTA
    incident.metrics.mtti = minutesBetween(incident.createdAt, now);
    incident.metrics.mtta = minutesBetween(incident.createdAt, now);

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "incident_acknowledged",
      actor: userId,
      actorName: userName,
      message: `Incident acknowledged by ${userName}.`,
    });

    log.info({ incidentId, userId }, "Incident acknowledged");
    this.emit("incident.acknowledged", incident);
    return incident;
  }

  /**
   * Update the status of an incident (e.g., investigating, mitigating).
   *
   * @param incidentId - The incident to update.
   * @param status - The new status.
   * @param userId - The actor's user ID.
   * @param userName - The actor's display name.
   * @param note - Optional note describing the status change.
   * @returns The updated incident, or undefined if not found.
   */
  updateStatus(
    incidentId: string,
    status: IncidentStatus,
    userId: string,
    userName: string,
    note?: string,
  ): FleetIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      log.warn({ incidentId }, "Cannot update status: incident not found");
      return undefined;
    }

    const oldStatus = incident.lifecycle.status;
    if (oldStatus === status) return incident;

    const now = new Date();
    incident.lifecycle.status = status;
    incident.updatedAt = now;

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "status_changed",
      actor: userId,
      actorName: userName,
      message: `Status changed from ${oldStatus} to ${status}${note ? `: ${note}` : ""}.`,
    });

    log.info({ incidentId, oldStatus, newStatus: status }, "Incident status updated");
    this.emit("incident.status_changed", incident);
    return incident;
  }

  /**
   * Reassign an incident to a different responder.
   *
   * @param incidentId - The incident to reassign.
   * @param userId - The new assignee's user ID.
   * @param userName - The new assignee's display name.
   * @param assignedBy - Who performed the reassignment (user ID).
   * @param assignedByName - Who performed the reassignment (display name).
   * @returns The updated incident, or undefined if not found.
   */
  reassignIncident(
    incidentId: string,
    userId: string,
    userName: string,
    assignedBy: string,
    assignedByName: string,
  ): FleetIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      log.warn({ incidentId }, "Cannot reassign: incident not found");
      return undefined;
    }

    const now = new Date();
    const previousAssignee = incident.lifecycle.assignee?.name ?? "nobody";
    incident.lifecycle.assignee = { userId, name: userName, assignedAt: now };
    incident.updatedAt = now;

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "assignee_changed",
      actor: assignedBy,
      actorName: assignedByName,
      message: `Reassigned from ${previousAssignee} to ${userName}.`,
    });

    log.info({ incidentId, from: previousAssignee, to: userName }, "Incident reassigned");
    this.emit("incident.assigned", incident);
    return incident;
  }

  /**
   * Resolve an incident.
   * Updates status, records resolution time, and computes final MTTR.
   *
   * @param incidentId - The incident to resolve.
   * @param userId - The resolver's user ID.
   * @param userName - The resolver's display name.
   * @param resolutionNote - Description of how the incident was resolved.
   * @returns The updated incident, or undefined if not found.
   */
  resolveIncident(
    incidentId: string,
    userId: string,
    userName: string,
    resolutionNote?: string,
  ): FleetIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      log.warn({ incidentId }, "Cannot resolve: incident not found");
      return undefined;
    }

    if (incident.lifecycle.status === "resolved" || incident.lifecycle.status === "postmortem") {
      log.warn({ incidentId, status: incident.lifecycle.status }, "Incident already resolved");
      return incident;
    }

    const now = new Date();
    incident.lifecycle.status = "resolved";
    incident.lifecycle.resolvedAt = now;
    incident.updatedAt = now;

    // Compute final MTTR
    incident.metrics.mttr = minutesBetween(incident.createdAt, now);

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "resolved",
      actor: userId,
      actorName: userName,
      message: `Incident resolved by ${userName}${resolutionNote ? `: ${resolutionNote}` : ""}.`,
    });

    log.info(
      { incidentId, mttr: incident.metrics.mttr },
      "Incident resolved",
    );
    this.emit("incident.resolved", incident);
    return incident;
  }

  /**
   * Record a healing attempt on an incident.
   *
   * @param incidentId - The target incident.
   * @param action - Description of the healing action taken.
   * @param success - Whether the healing attempt succeeded.
   */
  recordHealingAttempt(incidentId: string, action: string, success: boolean): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    incident.metrics.healingAttemptsCount++;
    const now = new Date();
    incident.updatedAt = now;

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "healing_attempt",
      actor: "system",
      message: `Healing attempt: ${action} — ${success ? "succeeded" : "failed"}.`,
    });
  }

  /**
   * Add a free-form note to the incident timeline.
   *
   * @param incidentId - The target incident.
   * @param userId - Who is adding the note.
   * @param userName - The author's display name.
   * @param message - The note content.
   */
  addNote(incidentId: string, userId: string, userName: string, message: string): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    const now = new Date();
    incident.updatedAt = now;

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "note_added",
      actor: userId,
      actorName: userName,
      message,
    });

    this.emit("incident.timeline_updated", incident);
  }

  // ── Escalation Engine ──────────────────────────────────────────────────────

  /**
   * Manually escalate an incident to the next level.
   *
   * @param incidentId - The incident to escalate.
   * @param reason - Reason for the escalation.
   * @returns The updated incident, or undefined if not found.
   */
  escalateIncident(incidentId: string, reason?: string): FleetIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      log.warn({ incidentId }, "Cannot escalate: incident not found");
      return undefined;
    }

    return this.performEscalation(incident, reason ?? "Manual escalation");
  }

  /**
   * Run the periodic escalation check.
   * Iterates over all open incidents and escalates any that have exceeded
   * their current-level timeout without acknowledgement or resolution.
   */
  private runEscalationCheck(): void {
    const now = Date.now();

    for (const incident of this.incidents.values()) {
      // Only escalate incidents that aren't resolved or in postmortem
      if (incident.lifecycle.status === "resolved" || incident.lifecycle.status === "postmortem") {
        continue;
      }

      const currentLevel = incident.escalation.currentLevel;
      const nextPolicy = incident.escalation.policy.find((p) => p.level === currentLevel + 1);
      if (!nextPolicy) continue; // Already at max escalation

      // How long since the incident was created (or since last escalation)?
      const referenceTime = this.getEscalationReferenceTime(incident);
      const elapsedMinutes = (now - referenceTime) / 60_000;

      if (elapsedMinutes >= nextPolicy.afterMinutes) {
        this.performEscalation(
          incident,
          `Auto-escalation: ${nextPolicy.afterMinutes} minutes elapsed without resolution`,
        );
      }
    }
  }

  /**
   * Determine the reference timestamp for escalation timing.
   * Uses the timestamp of the last escalation event if one exists,
   * otherwise falls back to the incident creation time.
   */
  private getEscalationReferenceTime(incident: FleetIncident): number {
    // Find the last escalation event in the timeline
    for (let i = incident.timeline.length - 1; i >= 0; i--) {
      if (incident.timeline[i].type === "escalation") {
        return incident.timeline[i].timestamp.getTime();
      }
    }
    return incident.createdAt.getTime();
  }

  /**
   * Execute an escalation: bump the level, record timeline, notify channels.
   */
  private performEscalation(incident: FleetIncident, reason: string): FleetIncident {
    const now = new Date();
    const newLevel = incident.escalation.currentLevel + 1;
    const policy = incident.escalation.policy.find((p) => p.level === newLevel);

    incident.escalation.currentLevel = newLevel;
    incident.metrics.escalationCount++;
    incident.updatedAt = now;

    const channels = policy?.notifyChannels ?? [];

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "escalation",
      actor: "system",
      message: `Escalated to level ${newLevel}. Reason: ${reason}. Notifying: ${channels.join(", ") || "none"}.`,
    });

    // If there's an on-call person and no assignee, try to assign
    if (!incident.lifecycle.assignee) {
      this.autoAssign(incident);
    }

    log.warn(
      { incidentId: incident.id, level: newLevel, channels },
      "Incident escalated",
    );
    this.emit("incident.escalated", { incident, level: newLevel, channels });
    return incident;
  }

  /**
   * Auto-assign the current on-call responder to an incident.
   * Skips if someone is already assigned or no one is on-call.
   */
  private autoAssign(incident: FleetIncident): void {
    if (incident.lifecycle.assignee) return;

    const onCall = this.getCurrentOnCall();
    if (!onCall) {
      log.debug({ incidentId: incident.id }, "No on-call member available for auto-assignment");
      return;
    }

    const now = new Date();
    incident.lifecycle.assignee = {
      userId: onCall.userId,
      name: onCall.name,
      assignedAt: now,
    };
    incident.updatedAt = now;

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: "assignee_changed",
      actor: "system",
      message: `Auto-assigned to on-call responder ${onCall.name}.`,
    });

    log.info(
      { incidentId: incident.id, assignee: onCall.userId },
      "Auto-assigned on-call responder",
    );
    this.emit("incident.assigned", incident);
  }

  // ── Timeline Builder ───────────────────────────────────────────────────────

  /**
   * Append an entry to the incident timeline, enforcing the max entries limit.
   */
  private addTimelineEntry(incident: FleetIncident, entry: TimelineEntry): void {
    incident.timeline.push(entry);

    // Trim oldest entries if we exceed the cap (keep the first entry always)
    if (incident.timeline.length > this.config.maxTimelineEntries) {
      const first = incident.timeline[0];
      incident.timeline = [
        first,
        ...incident.timeline.slice(incident.timeline.length - this.config.maxTimelineEntries + 1),
      ];
    }
  }

  /**
   * Get the full timeline for an incident.
   *
   * @param incidentId - The target incident.
   * @returns The timeline entries, or an empty array if not found.
   */
  getTimeline(incidentId: string): TimelineEntry[] {
    return this.incidents.get(incidentId)?.timeline ?? [];
  }

  // ── AI Postmortem Generator ────────────────────────────────────────────────

  /**
   * Generate a structured postmortem from the incident timeline and metadata.
   *
   * Analyzes the timeline to extract root-cause signals, identify what worked
   * and what failed, and produce actionable recommendations. In a production
   * system this would call an LLM; here we produce a deterministic summary
   * from the collected data.
   *
   * @param incidentId - The incident to generate a postmortem for.
   * @param estimatedSessionsAffected - Number of user sessions impacted.
   * @returns The generated postmortem, or undefined if the incident is not resolved.
   */
  generatePostmortem(
    incidentId: string,
    estimatedSessionsAffected: number = 0,
  ): IncidentPostmortem | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      log.warn({ incidentId }, "Cannot generate postmortem: incident not found");
      return undefined;
    }

    if (incident.lifecycle.status !== "resolved" && incident.lifecycle.status !== "postmortem") {
      log.warn(
        { incidentId, status: incident.lifecycle.status },
        "Cannot generate postmortem: incident not yet resolved",
      );
      return undefined;
    }

    const durationMinutes = minutesBetween(incident.createdAt, incident.lifecycle.resolvedAt);

    // Analyze timeline events to build postmortem
    const healingEvents = incident.timeline.filter((e) => e.type === "healing_attempt");
    const escalationEvents = incident.timeline.filter((e) => e.type === "escalation");
    const statusChanges = incident.timeline.filter((e) => e.type === "status_changed");
    const successfulHealings = healingEvents.filter((e) => e.message.includes("succeeded"));
    const failedHealings = healingEvents.filter((e) => e.message.includes("failed"));

    // ── Summary ──
    const summary = [
      `${incident.classification.severity} incident affecting ${incident.affectedBots.length} bot(s)`,
      `in fleet ${incident.fleetId}.`,
      `Category: ${incident.classification.category}.`,
      `Duration: ${durationMinutes.toFixed(1)} minutes.`,
      `Source: ${incident.classification.source}${incident.classification.sourceRef ? ` (${incident.classification.sourceRef})` : ""}.`,
      incident.metrics.mtta > 0
        ? `Acknowledged in ${incident.metrics.mtta.toFixed(1)} minutes.`
        : "Not formally acknowledged before resolution.",
      `${escalationEvents.length} escalation(s), ${healingEvents.length} healing attempt(s).`,
    ].join(" ");

    // ── Root Cause Analysis ──
    const rootCauseLines: string[] = [
      `Root cause category: ${incident.classification.category}.`,
    ];
    if (incident.description) {
      rootCauseLines.push(`Initial description: ${incident.description}`);
    }
    // Extract resolution note from the resolved timeline entry
    const resolvedEntry = incident.timeline.find((e) => e.type === "resolved");
    if (resolvedEntry) {
      rootCauseLines.push(`Resolution: ${resolvedEntry.message}`);
    }
    const rootCauseAnalysis = rootCauseLines.join("\n");

    // ── What Worked ──
    const whatWorked: string[] = [];
    if (incident.metrics.mtta > 0 && incident.metrics.mtta < 5) {
      whatWorked.push("Fast acknowledgement time (< 5 minutes)");
    }
    if (successfulHealings.length > 0) {
      whatWorked.push(`Automated healing succeeded ${successfulHealings.length} time(s)`);
    }
    if (incident.lifecycle.assignee) {
      whatWorked.push(`On-call responder ${incident.lifecycle.assignee.name} was assigned promptly`);
    }
    if (statusChanges.length > 0) {
      whatWorked.push("Status transitions were tracked throughout the incident");
    }
    if (whatWorked.length === 0) {
      whatWorked.push("Incident was detected and tracked through the lifecycle");
    }

    // ── What Failed ──
    const whatFailed: string[] = [];
    if (failedHealings.length > 0) {
      whatFailed.push(`${failedHealings.length} healing attempt(s) failed before resolution`);
    }
    if (escalationEvents.length > 1) {
      whatFailed.push(`Required ${escalationEvents.length} escalations before resolution`);
    }
    if (incident.metrics.mtta > 15) {
      whatFailed.push(`Slow acknowledgement time (${incident.metrics.mtta.toFixed(1)} minutes)`);
    }
    if (durationMinutes > 60) {
      whatFailed.push(`Long resolution time (${durationMinutes.toFixed(0)} minutes)`);
    }
    if (incident.metrics.mtti === 0 && incident.metrics.mtta === 0) {
      whatFailed.push("Incident was not formally acknowledged before resolution");
    }
    if (whatFailed.length === 0) {
      whatFailed.push("No significant failures identified in the response process");
    }

    // ── Action Items ──
    const actionItems: PostmortemActionItem[] = [];

    if (failedHealings.length > 0) {
      actionItems.push({
        description: "Review and improve automated healing policies for this failure mode",
        owner: incident.lifecycle.assignee?.name ?? "On-call team",
        priority: "high",
      });
    }

    if (incident.metrics.mtta > 10) {
      actionItems.push({
        description: "Improve alerting and on-call notification to reduce acknowledgement time",
        owner: "Platform team",
        priority: "medium",
      });
    }

    if (incident.affectedBots.length >= 3) {
      actionItems.push({
        description: "Investigate shared infrastructure dependencies to prevent multi-bot failures",
        owner: "Infrastructure team",
        priority: "high",
      });
    }

    if (durationMinutes > 30) {
      actionItems.push({
        description: "Create or update runbook for this incident category to speed up resolution",
        owner: incident.lifecycle.assignee?.name ?? "On-call team",
        priority: "medium",
      });
    }

    // Always add a postmortem review action item
    actionItems.push({
      description: "Schedule postmortem review meeting with all stakeholders",
      owner: incident.lifecycle.assignee?.name ?? "Engineering lead",
      priority: "low",
    });

    const postmortem: IncidentPostmortem = {
      summary,
      rootCauseAnalysis,
      impact: {
        durationMinutes: Math.round(durationMinutes * 10) / 10,
        affectedBots: incident.affectedBots.length,
        affectedSessions: estimatedSessionsAffected,
      },
      whatWorked,
      whatFailed,
      actionItems,
    };

    incident.postmortem = postmortem;
    incident.lifecycle.status = "postmortem";
    incident.updatedAt = new Date();

    this.addTimelineEntry(incident, {
      timestamp: new Date(),
      type: "postmortem_generated",
      actor: "system",
      message: "Postmortem report generated.",
    });

    log.info({ incidentId }, "Postmortem generated");
    this.emit("incident.postmortem_generated", incident);
    return postmortem;
  }

  // ── Metrics ────────────────────────────────────────────────────────────────

  /**
   * Get the metrics for a single incident.
   *
   * @param incidentId - The target incident.
   * @returns The incident metrics, or undefined if not found.
   */
  getIncidentMetrics(incidentId: string): IncidentMetrics | undefined {
    return this.incidents.get(incidentId)?.metrics;
  }

  /**
   * Calculate aggregate MTTR/MTTI/MTTA across all resolved incidents in a fleet.
   * Useful for SLA dashboards and trend reporting.
   *
   * @param fleetId - The fleet to calculate metrics for.
   * @returns Aggregated metrics (averages) across all resolved incidents.
   */
  getFleetMetrics(fleetId: string): {
    totalIncidents: number;
    resolvedIncidents: number;
    avgMtti: number;
    avgMtta: number;
    avgMttr: number;
    avgHealingAttempts: number;
    avgEscalations: number;
    incidentsByseverity: Record<IncidentSeverity, number>;
  } {
    const fleetIncidents = [...this.incidents.values()].filter(
      (i) => i.fleetId === fleetId,
    );
    const resolved = fleetIncidents.filter(
      (i) => i.lifecycle.status === "resolved" || i.lifecycle.status === "postmortem",
    );

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => (arr.length > 0 ? sum(arr) / arr.length : 0);

    const incidentsByseverity: Record<IncidentSeverity, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const inc of fleetIncidents) {
      incidentsByseverity[inc.classification.severity]++;
    }

    return {
      totalIncidents: fleetIncidents.length,
      resolvedIncidents: resolved.length,
      avgMtti: avg(resolved.map((i) => i.metrics.mtti)),
      avgMtta: avg(resolved.map((i) => i.metrics.mtta)),
      avgMttr: avg(resolved.map((i) => i.metrics.mttr)),
      avgHealingAttempts: avg(resolved.map((i) => i.metrics.healingAttemptsCount)),
      avgEscalations: avg(resolved.map((i) => i.metrics.escalationCount)),
      incidentsByseverity,
    };
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Get an incident by ID.
   * @param incidentId - The incident ID.
   */
  getIncident(incidentId: string): FleetIncident | undefined {
    return this.incidents.get(incidentId);
  }

  /**
   * List all incidents for a fleet, optionally filtered by status.
   *
   * @param fleetId - The fleet to query.
   * @param statusFilter - Optional status(es) to filter by.
   * @returns Matching incidents sorted by creation time (newest first).
   */
  listIncidents(fleetId: string, statusFilter?: IncidentStatus[]): FleetIncident[] {
    const all = [...this.incidents.values()].filter((i) => i.fleetId === fleetId);

    const filtered = statusFilter
      ? all.filter((i) => statusFilter.includes(i.lifecycle.status))
      : all;

    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * List all currently open (unresolved) incidents across all fleets.
   * @returns Open incidents sorted by severity (P1 first), then by creation time.
   */
  listOpenIncidents(): FleetIncident[] {
    const severityOrder: Record<IncidentSeverity, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return [...this.incidents.values()]
      .filter((i) => i.lifecycle.status !== "resolved" && i.lifecycle.status !== "postmortem")
      .sort((a, b) => {
        const sevDiff = severityOrder[a.classification.severity] - severityOrder[b.classification.severity];
        if (sevDiff !== 0) return sevDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  /**
   * Get all incidents affecting a specific bot.
   * @param botId - The bot ID to search for.
   */
  getIncidentsForBot(botId: string): FleetIncident[] {
    return [...this.incidents.values()]
      .filter((i) => i.affectedBots.includes(botId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Delete a resolved incident from the store.
   * Only allows deletion of resolved/postmortem incidents.
   *
   * @param incidentId - The incident to delete.
   * @returns True if deleted, false otherwise.
   */
  deleteIncident(incidentId: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;
    if (incident.lifecycle.status !== "resolved" && incident.lifecycle.status !== "postmortem") {
      log.warn({ incidentId }, "Cannot delete: incident is still open");
      return false;
    }
    this.incidents.delete(incidentId);
    // Clean dedup index
    for (const [fp, entry] of this.deduplicationIndex) {
      if (entry.incidentId === incidentId) {
        this.deduplicationIndex.delete(fp);
      }
    }
    return true;
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Check if severity `a` is higher (more critical) than severity `b`.
   */
  private isSeverityHigher(a: IncidentSeverity, b: IncidentSeverity): boolean {
    const order: Record<IncidentSeverity, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
    return order[a] < order[b];
  }

  /**
   * Get a snapshot of the manager's internal state for debugging.
   */
  getDebugState(): {
    totalIncidents: number;
    openIncidents: number;
    dedupEntries: number;
    onCallMembers: number;
    escalationTimerActive: boolean;
  } {
    const open = [...this.incidents.values()].filter(
      (i) => i.lifecycle.status !== "resolved" && i.lifecycle.status !== "postmortem",
    ).length;

    return {
      totalIncidents: this.incidents.size,
      openIncidents: open,
      dedupEntries: this.deduplicationIndex.size,
      onCallMembers: this.onCallRotation.length,
      escalationTimerActive: this.escalationTimer !== null,
    };
  }
}

export default IncidentLifecycleManager;
