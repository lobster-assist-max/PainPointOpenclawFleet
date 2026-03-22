/**
 * AuditLog — Fleet audit trail page showing who did what and when.
 *
 * Features:
 * - Filterable by action, user, target type, date range
 * - Color-coded by action type (create=teal, update=gold, delete=red, denied=gray)
 * - CSV export
 * - Pagination
 */

import { useMemo, useState } from "react";
import {
  Download,
  Filter,
  Shield,
  ShieldCheck,
  ShieldX,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fleetCardStyles, fleetInfoStyles, severityColors } from "./design-tokens";

// ─── Types ──────────────────────────────────────────────────────────────────

import type { AuditEntry } from "@/api/fleet-monitor";

interface AuditLogProps {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onFilterChange?: (filters: AuditFilters) => void;
  onExportCsv?: () => void;
  className?: string;
}

interface AuditFilters {
  action?: string;
  userId?: string;
  targetType?: string;
}

// ─── Action color mapping ───────────────────────────────────────────────────

function actionColorClass(action: string, result: string): string {
  if (result === "denied") return "text-[#2C2420]/40 bg-[#2C2420]/5";
  if (result === "error") return "text-red-600 bg-red-50";
  if (action.includes("connect") || action.includes("create"))
    return "text-[#2A9D8F] bg-[#E0F2F1]";
  if (action.includes("patch") || action.includes("update") || action.includes("acknowledge"))
    return "text-[#9A7B5B] bg-[#D4A373]/10";
  if (action.includes("disconnect") || action.includes("delete"))
    return "text-red-600 bg-red-50";
  return "text-[#264653] bg-[#E0F2F1]";
}

function resultIcon(result: string) {
  switch (result) {
    case "success":
      return <ShieldCheck className="h-4 w-4 text-[#27BD74]" />;
    case "denied":
      return <ShieldX className="h-4 w-4 text-[#2C2420]/40" />;
    case "error":
      return <ShieldX className="h-4 w-4 text-red-500" />;
    default:
      return <Shield className="h-4 w-4 text-[#2C2420]/30" />;
  }
}

function roleColor(role: string): string {
  switch (role) {
    case "admin":
      return "text-[#D4A373] bg-[#D4A373]/10";
    case "operator":
      return "text-[#2A9D8F] bg-[#E0F2F1]";
    default:
      return "text-[#2C2420]/50 bg-[#2C2420]/5";
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AuditLog({
  entries,
  total,
  page,
  pageSize,
  onPageChange,
  onFilterChange,
  onExportCsv,
  className,
}: AuditLogProps) {
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterTarget, setFilterTarget] = useState<string>("");

  const totalPages = Math.ceil(total / pageSize);

  // Unique action types for filter dropdown
  const actionTypes = useMemo(() => {
    const types = new Set(entries.map((e) => e.action));
    return Array.from(types).sort();
  }, [entries]);

  return (
    <div className={cn(fleetCardStyles.default, "overflow-hidden", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E0E0E0]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#D4A373]" />
          <h3 className="text-sm font-medium text-[#2C2420]">Fleet Audit Log</h3>
          <span className={fleetInfoStyles.badge}>{total} entries</span>
        </div>
        {onExportCsv && (
          <button
            onClick={onExportCsv}
            className="flex items-center gap-1.5 text-xs text-[#2A9D8F] hover:text-[#264653] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-[#E0E0E0]/30 flex items-center gap-3 bg-[#FAF9F6]/50">
        <Filter className="h-3.5 w-3.5 text-[#2C2420]/40" />
        <select
          value={filterAction}
          onChange={(e) => {
            setFilterAction(e.target.value);
            onFilterChange?.({ action: e.target.value || undefined, userId: filterUser || undefined, targetType: filterTarget || undefined });
          }}
          className="text-xs bg-transparent border border-[#E0E0E0] rounded px-2 py-1 text-[#2C2420]/70 focus:border-[#D4A373] focus:outline-none"
        >
          <option value="">All Actions</option>
          {actionTypes.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="User ID..."
          aria-label="Filter by user ID"
          value={filterUser}
          onChange={(e) => {
            setFilterUser(e.target.value);
            onFilterChange?.({ action: filterAction || undefined, userId: e.target.value || undefined, targetType: filterTarget || undefined });
          }}
          className="text-xs bg-transparent border border-[#E0E0E0] rounded px-2 py-1 w-28 text-[#2C2420]/70 placeholder-[#2C2420]/30 focus:border-[#D4A373] focus:outline-none"
        />
        <select
          value={filterTarget}
          onChange={(e) => {
            setFilterTarget(e.target.value);
            onFilterChange?.({ action: filterAction || undefined, userId: filterUser || undefined, targetType: e.target.value || undefined });
          }}
          className="text-xs bg-transparent border border-[#E0E0E0] rounded px-2 py-1 text-[#2C2420]/70 focus:border-[#D4A373] focus:outline-none"
        >
          <option value="">All Targets</option>
          <option value="bot">Bot</option>
          <option value="fleet">Fleet</option>
          <option value="config">Config</option>
          <option value="budget">Budget</option>
          <option value="alert">Alert</option>
          <option value="tag">Tag</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>

      {/* Entries */}
      <div className="divide-y divide-[#E0E0E0]/30">
        {entries.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-[#2C2420]/40">
            No audit entries found
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "px-4 py-2.5 flex items-start gap-3 hover:bg-[#FAF9F6]/70 transition-colors",
                entry.result === "denied" && "opacity-60",
              )}
            >
              {/* Result icon */}
              <div className="mt-0.5 shrink-0">{resultIcon(entry.result)}</div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* User + role */}
                  <span className="text-xs font-medium text-[#2C2420]">
                    {entry.userId}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      roleColor(entry.userRole),
                    )}
                  >
                    {entry.userRole}
                  </span>

                  {/* Action */}
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      actionColorClass(entry.action, entry.result),
                    )}
                  >
                    {entry.action}
                  </span>

                  {/* Target */}
                  {entry.targetId && (
                    <span className="text-[10px] text-[#2C2420]/50">
                      on {entry.targetType}:{entry.targetId.slice(0, 8)}
                    </span>
                  )}

                  {/* Rate limited badge */}
                  {entry.rateLimited && (
                    <span className="text-[10px] text-orange-500 font-medium">
                      rate-limited
                    </span>
                  )}
                </div>

                {/* Details */}
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <p className="text-[10px] text-[#2C2420]/40 mt-0.5 truncate">
                    {JSON.stringify(entry.details).slice(0, 120)}
                  </p>
                )}
              </div>

              {/* Timestamp */}
              <div className="shrink-0 flex items-center gap-1 text-[10px] text-[#2C2420]/40">
                <Clock className="h-3 w-3" />
                {formatTimestamp(entry.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-[#E0E0E0]/50 flex items-center justify-between text-xs text-[#2C2420]/50">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1 rounded hover:bg-[#E0E0E0]/30 disabled:opacity-30 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1 rounded hover:bg-[#E0E0E0]/30 disabled:opacity-30 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
