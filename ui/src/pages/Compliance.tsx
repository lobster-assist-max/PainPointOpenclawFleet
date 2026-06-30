/**
 * Fleet Compliance & Data Governance page.
 *
 * Surfaces the compliance backend (server/src/routes/fleet-compliance.ts):
 * a weighted compliance score with factor breakdown, PII scanning, data
 * retention policies, GDPR/CCPA right-to-erasure requests, and the compliance
 * audit trail. The store is a global in-memory registry, so all data is
 * fleet-wide (not company-scoped).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useComplianceScore,
  useComplianceScans,
  useCompliancePolicies,
  useComplianceAudit,
  useStartComplianceScan,
  useCreateRetentionPolicy,
  useSubmitErasure,
  timeAgo,
} from "@/hooks/useFleetMonitor";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { authApi } from "@/api/auth";
import { cn } from "@/lib/utils";
import type { RetentionAction } from "@/api/fleet-monitor";
import {
  ShieldCheck,
  ScanLine,
  FileLock2,
  UserX,
  AlertTriangle,
  Loader2,
  Plus,
  ScrollText,
} from "lucide-react";

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

const FACTOR_LABELS: Record<string, string> = {
  retentionPolicies: "Retention Policies",
  piiScanning: "PII Scanning",
  erasureCompliance: "Erasure Compliance",
  consentManagement: "Consent Management",
  auditTrail: "Audit Trail",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
    case "running":
    case "processing":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
  }
}

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "high":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300";
    case "medium":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

const SECTION_CARD =
  "rounded-xl border border-border bg-card p-4 space-y-3";

export function Compliance() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Compliance" }]);
  }, [setBreadcrumbs]);

  const scoreQuery = useComplianceScore();
  const scansQuery = useComplianceScans();
  const policiesQuery = useCompliancePolicies();
  const auditQuery = useComplianceAudit();

  const startScan = useStartComplianceScan();
  const createPolicy = useCreateRetentionPolicy();
  const submitErasure = useSubmitErasure();

  // Resolve the acting operator for attribution (null in local mode).
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
    staleTime: 60_000,
  });
  const actorName = useMemo(
    () => session?.user?.name ?? session?.user?.email ?? "Operator",
    [session],
  );

  // ── Retention policy create form ─────────────────────────────────────────
  const [policyOpen, setPolicyOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pCategory, setPCategory] = useState("conversations");
  const [pDays, setPDays] = useState("90");
  const [pAction, setPAction] = useState<RetentionAction>("delete");

  const submitPolicy = () => {
    const days = Number(pDays);
    if (!pName.trim() || !pCategory.trim() || !Number.isFinite(days) || days < 1) return;
    createPolicy.mutate(
      {
        name: pName.trim(),
        dataCategory: pCategory.trim(),
        retentionDays: days,
        action: pAction,
      },
      {
        onSuccess: () => {
          setPName("");
          setPDays("90");
          setPolicyOpen(false);
        },
      },
    );
  };

  // ── Erasure request form ─────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState("");
  const [erasureReason, setErasureReason] = useState("");
  const [lastErasure, setLastErasure] = useState<{
    id: string;
    customerId: string;
    status: string;
  } | null>(null);

  const submitErasureRequest = () => {
    if (!customerId.trim()) return;
    submitErasure.mutate(
      {
        customerId: customerId.trim(),
        reason: erasureReason.trim() || undefined,
        requestedBy: actorName,
      },
      {
        onSuccess: (res) => {
          setLastErasure(res.erasure);
          setCustomerId("");
          setErasureReason("");
        },
      },
    );
  };

  const score = scoreQuery.data?.score ?? 0;
  const breakdown = scoreQuery.data?.breakdown ?? {};
  const policies = policiesQuery.data?.policies ?? [];
  const scans = scansQuery.data?.scans ?? [];
  const auditEntries = auditQuery.data?.entries ?? [];

  const mutationError =
    startScan.error || createPolicy.error || submitErasure.error;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Compliance &amp; Data Governance
          </h1>
          <p className="text-sm text-muted-foreground">
            PII scanning, retention policies, GDPR/CCPA erasure, and audit trail
            across the fleet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startScan.mutate({ requestedBy: actorName })}
          disabled={startScan.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {startScan.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanLine className="h-4 w-4" />
          )}
          Run PII Scan
        </button>
      </div>

      {mutationError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-400">
          {mutationError instanceof Error ? mutationError.message : "Action failed"}
        </div>
      ) : null}

      {/* ── Compliance score ─────────────────────────────────────────────── */}
      <div className={SECTION_CARD}>
        {scoreQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance score…
          </div>
        ) : scoreQuery.isError ? (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" /> Failed to load compliance score.
            The fleet monitor may be offline.
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-col items-center justify-center px-4">
              <span className={cn("text-5xl font-bold tabular-nums", scoreColor(score))}>
                {score}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <div className="flex-1 space-y-2">
              {Object.entries(breakdown).map(([key, factor]) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground">
                      {FACTOR_LABELS[key] ?? key}
                      <span className="text-muted-foreground"> · weight {factor.weight}</span>
                    </span>
                    <span className="text-muted-foreground">{factor.details}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", scoreBarColor(factor.score))}
                      style={{ width: `${Math.max(0, Math.min(100, factor.score))}%` }}
                      role="progressbar"
                      aria-valuenow={factor.score}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${FACTOR_LABELS[key] ?? key} score`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Retention policies ─────────────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileLock2 className="h-4 w-4 text-primary" /> Retention Policies
            </h2>
            <button
              type="button"
              onClick={() => setPolicyOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> New
            </button>
          </div>

          {policyOpen ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <input
                type="text"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="Policy name"
                aria-label="Policy name"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pCategory}
                  onChange={(e) => setPCategory(e.target.value)}
                  placeholder="Data category"
                  aria-label="Data category"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
                <input
                  type="number"
                  min={1}
                  value={pDays}
                  onChange={(e) => setPDays(e.target.value)}
                  placeholder="Days"
                  aria-label="Retention days"
                  className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
                <select
                  value={pAction}
                  onChange={(e) => setPAction(e.target.value as RetentionAction)}
                  aria-label="Retention action"
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="delete">Delete</option>
                  <option value="anonymize">Anonymize</option>
                  <option value="archive">Archive</option>
                </select>
              </div>
              <button
                type="button"
                onClick={submitPolicy}
                disabled={createPolicy.isPending || !pName.trim()}
                className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createPolicy.isPending ? "Creating…" : "Create policy"}
              </button>
            </div>
          ) : null}

          {policiesQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : policies.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No retention policies defined yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {policies.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.dataCategory} · {p.retentionDays}d · {p.action}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      p.enabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {p.enabled ? "Enabled" : "Disabled"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Right to erasure ───────────────────────────────────────────── */}
        <div className={SECTION_CARD}>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <UserX className="h-4 w-4 text-primary" /> Right to Erasure (GDPR/CCPA)
          </h2>
          <div className="space-y-2">
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="Customer ID"
              aria-label="Customer ID"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
            <input
              type="text"
              value={erasureReason}
              onChange={(e) => setErasureReason(e.target.value)}
              placeholder="Reason (optional)"
              aria-label="Erasure reason"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={submitErasureRequest}
              disabled={submitErasure.isPending || !customerId.trim()}
              className="w-full rounded-md bg-primary px-2 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitErasure.isPending ? "Submitting…" : "Submit erasure request"}
            </button>
          </div>
          {lastErasure ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <div className="text-foreground">
                Request for{" "}
                <span className="font-medium">{lastErasure.customerId}</span> submitted.
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5",
                    statusBadgeClass(lastErasure.status),
                  )}
                >
                  {lastErasure.status}
                </span>
                <span className="text-muted-foreground">ID: {lastErasure.id.slice(0, 8)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── PII scan results ─────────────────────────────────────────────── */}
      <div className={SECTION_CARD}>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-primary" /> PII Scans
        </h2>
        {scansQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : scans.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No scans yet. Click “Run PII Scan” to start one.
          </div>
        ) : (
          <ul className="space-y-2">
            {scans.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-foreground">
                      Scope: <span className="font-medium">{s.scope}</span> ·{" "}
                      {s.summary.totalFindings} findings
                    </div>
                    <div className="text-xs text-muted-foreground">
                      by {s.requestedBy} · {timeAgo(s.startedAt)}
                      {s.summary.totalScanned > 0
                        ? ` · ${s.summary.totalScanned} messages scanned`
                        : ""}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      statusBadgeClass(s.status),
                    )}
                  >
                    {s.status}
                  </span>
                </div>
                {s.status === "completed" && s.findings.length === 0 ? (
                  <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                    No PII detected in scanned transcripts. ✓
                  </div>
                ) : s.findings.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-border pt-2">
                    {s.findings.slice(0, 50).map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase shrink-0",
                              severityBadgeClass(f.severity),
                            )}
                          >
                            {f.severity}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {f.category}
                          </span>
                          <code className="text-xs text-foreground truncate">
                            {f.sampleRedacted}
                          </code>
                        </div>
                        <span
                          className="text-[10px] text-muted-foreground truncate max-w-[40%]"
                          title={`${f.botId} · ${f.location}`}
                        >
                          {f.botId} · {f.location}
                        </span>
                      </li>
                    ))}
                    {s.findings.length > 50 ? (
                      <li className="text-[10px] text-muted-foreground">
                        +{s.findings.length - 50} more findings
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Audit trail ──────────────────────────────────────────────────── */}
      <div className={SECTION_CARD}>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" /> Compliance Audit Trail
        </h2>
        {auditQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : auditQuery.isError ? (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" /> Failed to load audit trail.
          </div>
        ) : auditEntries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No audit entries yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {auditEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-mono text-xs text-foreground">{e.action}</span>
                  <span className="text-muted-foreground"> · {e.targetType}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.actor} · {timeAgo(e.timestamp)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
