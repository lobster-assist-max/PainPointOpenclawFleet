/**
 * Fleet Incident Lifecycle Manager
 *
 * In-memory incident tracking service for fleet operations.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface IncidentInput {
  title: string;
  description: string;
  severity: string;
  affectedBots: string[];
  source: string;
  /** Owning tenant. Set from the affected bot's company so the Incidents page
   *  can scope by company and one tenant never sees another's incidents. */
  companyId?: string;
}

interface Incident {
  id: string;
  companyId?: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  affectedBots: string[];
  source: string;
  acknowledgedBy: { userId: string; name: string } | null;
  acknowledgedAt: string | null;
  escalationLevel: number;
  resolution: { summary: string; rootCause: string; actions: string[] } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IncidentMetrics {
  total: number;
  open: number;
  resolved: number;
  avgMttrMinutes: number;
  avgMttiMinutes: number;
}

interface OnCallSchedule {
  current: { userId: string; name: string; since: string } | null;
  rotation: { userId: string; name: string }[];
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class IncidentLifecycleManager {
  private incidents = new Map<string, Incident>();
  private onCallSchedule: OnCallSchedule = { current: null, rotation: [] };

  createIncident(input: IncidentInput): Incident {
    const id = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const incident: Incident = {
      id,
      ...input,
      status: "open",
      acknowledgedBy: null,
      acknowledgedAt: null,
      escalationLevel: 0,
      resolution: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.incidents.set(id, incident);
    return incident;
  }

  getIncident(id: string): Incident | null {
    return this.incidents.get(id) ?? null;
  }

  listIncidents(filters: {
    status?: string;
    severity?: string;
    companyId?: string;
    limit: number;
    offset: number;
  }): { incidents: Incident[]; total: number } {
    let items = Array.from(this.incidents.values());
    // Scope to the requesting tenant. Legacy/unattributable incidents (no
    // companyId) are excluded from a scoped query so they can't leak; an
    // unscoped (admin) call still sees everything.
    if (filters.companyId) items = items.filter((i) => i.companyId === filters.companyId);
    if (filters.status) items = items.filter((i) => i.status === filters.status);
    if (filters.severity) items = items.filter((i) => i.severity === filters.severity);
    const total = items.length;
    items = items.slice(filters.offset, filters.offset + filters.limit);
    return { incidents: items, total };
  }

  updateIncident(id: string, updates: Partial<Incident>): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident) return null;
    Object.assign(incident, updates, { updatedAt: new Date().toISOString() });
    return incident;
  }

  /** Find the most recent non-resolved incident created from a given source (for dedup). */
  findOpenIncidentBySource(source: string): Incident | null {
    let match: Incident | null = null;
    for (const incident of this.incidents.values()) {
      if (incident.source === source && incident.status !== "resolved") {
        if (!match || incident.createdAt > match.createdAt) match = incident;
      }
    }
    return match;
  }

  acknowledgeIncident(id: string, by: { userId: string; name: string }): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident || incident.acknowledgedBy) return null;
    const now = new Date().toISOString();
    incident.acknowledgedBy = by;
    incident.acknowledgedAt = now;
    incident.status = "acknowledged";
    incident.updatedAt = now;
    return incident;
  }

  escalateIncident(id: string): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident || incident.status === "resolved") return null;
    incident.escalationLevel += 1;
    incident.status = "escalated";
    incident.updatedAt = new Date().toISOString();
    return incident;
  }

  resolveIncident(
    id: string,
    resolution: { summary: string; rootCause: string; actions: string[] },
  ): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident || incident.status === "resolved") return null;
    const now = new Date().toISOString();
    incident.resolution = resolution;
    incident.resolvedAt = now;
    incident.status = "resolved";
    incident.updatedAt = now;
    return incident;
  }

  async generatePostmortem(id: string): Promise<{ incidentId: string; markdown: string } | null> {
    const incident = this.incidents.get(id);
    if (!incident || incident.status !== "resolved") return null;
    return {
      incidentId: id,
      markdown: `# Postmortem: ${incident.title}\n\n**Severity:** ${incident.severity}\n**Resolution:** ${incident.resolution?.summary ?? "N/A"}\n**Root Cause:** ${incident.resolution?.rootCause ?? "Unknown"}\n`,
    };
  }

  getMetrics(companyId?: string): IncidentMetrics {
    // Scope to the requesting tenant so MTTR/MTTI/open/resolved counts don't
    // mix companies. Unscoped (admin) call aggregates the whole fleet.
    let all = Array.from(this.incidents.values());
    if (companyId) all = all.filter((i) => i.companyId === companyId);

    // MTTI (mean time to identify) = acknowledgedAt − createdAt, averaged over
    // acknowledged incidents. MTTR (mean time to resolve) = resolvedAt − createdAt,
    // averaged over resolved incidents. Both in minutes.
    const minutesBetween = (start: string, end: string): number =>
      (new Date(end).getTime() - new Date(start).getTime()) / 60_000;

    const acked = all.filter((i) => i.acknowledgedAt);
    const resolved = all.filter((i) => i.resolvedAt);

    const avg = (values: number[]): number =>
      values.length === 0
        ? 0
        : Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;

    return {
      total: all.length,
      open: all.filter((i) => i.status !== "resolved").length,
      resolved: resolved.length,
      avgMttrMinutes: avg(resolved.map((i) => minutesBetween(i.createdAt, i.resolvedAt!))),
      avgMttiMinutes: avg(acked.map((i) => minutesBetween(i.createdAt, i.acknowledgedAt!))),
    };
  }

  getOnCallSchedule(): OnCallSchedule {
    return this.onCallSchedule;
  }

  updateOnCallSchedule(schedule: Partial<OnCallSchedule>): OnCallSchedule {
    Object.assign(this.onCallSchedule, schedule);
    return this.onCallSchedule;
  }
}

// ─── Shared singleton ──────────────────────────────────────────────────────────
// The incident manager is in-memory; the HTTP routes and the alert→incident feed
// in fleet-bootstrap must share the SAME instance, or incidents created from alerts
// would be invisible to the API (and vice-versa).

let _incidentManager: IncidentLifecycleManager | null = null;

export function getIncidentManager(): IncidentLifecycleManager {
  if (!_incidentManager) {
    _incidentManager = new IncidentLifecycleManager();
  }
  return _incidentManager;
}
