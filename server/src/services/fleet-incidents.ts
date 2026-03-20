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
}

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  affectedBots: string[];
  source: string;
  acknowledgedBy: { userId: string; name: string } | null;
  escalationLevel: number;
  resolution: { summary: string; rootCause: string; actions: string[] } | null;
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
      escalationLevel: 0,
      resolution: null,
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
    limit: number;
    offset: number;
  }): { incidents: Incident[]; total: number } {
    let items = Array.from(this.incidents.values());
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

  acknowledgeIncident(id: string, by: { userId: string; name: string }): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident || incident.acknowledgedBy) return null;
    incident.acknowledgedBy = by;
    incident.status = "acknowledged";
    incident.updatedAt = new Date().toISOString();
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
    incident.resolution = resolution;
    incident.status = "resolved";
    incident.updatedAt = new Date().toISOString();
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

  getMetrics(): IncidentMetrics {
    const all = Array.from(this.incidents.values());
    return {
      total: all.length,
      open: all.filter((i) => i.status !== "resolved").length,
      resolved: all.filter((i) => i.status === "resolved").length,
      avgMttrMinutes: 0,
      avgMttiMinutes: 0,
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
