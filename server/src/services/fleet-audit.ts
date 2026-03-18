/**
 * Fleet Audit Service — Logs all fleet management actions for accountability.
 *
 * Every write operation (connect, disconnect, config change, etc.) is recorded
 * with who, when, what, and the result. Read-only operations are NOT logged
 * to avoid noise.
 *
 * Storage: fleet_audit_log table (90-day auto-cleanup).
 */

import { logger } from "../middleware/logger.js";
import type { FleetRole } from "./fleet-rbac.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  companyId: string;
  userId: string;
  userRole: FleetRole;
  action: string;
  targetType: "bot" | "fleet" | "budget" | "alert" | "tag" | "config" | "webhook";
  targetId: string | null;
  details: Record<string, unknown>;
  result: "success" | "denied" | "error";
  ipAddress: string | null;
  rateLimited?: boolean;
  createdAt: Date;
}

export interface AuditQueryParams {
  companyId: string;
  action?: string;
  userId?: string;
  targetType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

// ─── In-memory audit store (will be replaced with DB in production) ────────

const auditLog: AuditEntry[] = [];
const MAX_ENTRIES = 10_000;
let nextId = 1;

// ─── Audit Service ─────────────────────────────────────────────────────────

/**
 * Log an audit entry. Call this after every write operation.
 */
export function logAudit(
  entry: Omit<AuditEntry, "id" | "createdAt">,
): AuditEntry {
  const audit: AuditEntry = {
    ...entry,
    id: `audit_${Date.now()}_${nextId++}`,
    createdAt: new Date(),
  };

  auditLog.unshift(audit); // Newest first

  // Trim to max size
  if (auditLog.length > MAX_ENTRIES) {
    auditLog.length = MAX_ENTRIES;
  }

  logger.info(
    {
      userId: audit.userId,
      action: audit.action,
      target: audit.targetId,
      result: audit.result,
    },
    `[Fleet Audit] ${audit.action}`,
  );

  return audit;
}

/**
 * Query audit entries with filtering and pagination.
 */
export function queryAudit(params: AuditQueryParams): {
  entries: AuditEntry[];
  total: number;
} {
  let filtered = auditLog.filter((e) => e.companyId === params.companyId);

  if (params.action) {
    filtered = filtered.filter((e) => e.action === params.action);
  }
  if (params.userId) {
    filtered = filtered.filter((e) => e.userId === params.userId);
  }
  if (params.targetType) {
    filtered = filtered.filter((e) => e.targetType === params.targetType);
  }
  if (params.from) {
    filtered = filtered.filter((e) => e.createdAt >= params.from!);
  }
  if (params.to) {
    filtered = filtered.filter((e) => e.createdAt <= params.to!);
  }

  const total = filtered.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const entries = filtered.slice(offset, offset + limit);

  return { entries, total };
}

/**
 * Export audit entries as CSV string.
 */
export function exportAuditCsv(params: AuditQueryParams): string {
  const { entries } = queryAudit({ ...params, limit: 10_000, offset: 0 });

  const header = "Timestamp,User,Role,Action,Target Type,Target ID,Result,IP Address\n";
  const rows = entries.map((e) =>
    [
      e.createdAt.toISOString(),
      e.userId,
      e.userRole,
      e.action,
      e.targetType,
      e.targetId ?? "",
      e.result,
      e.ipAddress ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );

  return header + rows.join("\n");
}

/**
 * Clean up entries older than the given number of days.
 */
export function cleanupAudit(maxAgeDays: number): number {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const before = auditLog.length;
  const kept = auditLog.filter((e) => e.createdAt > cutoff);
  auditLog.length = 0;
  auditLog.push(...kept);
  return before - auditLog.length;
}
