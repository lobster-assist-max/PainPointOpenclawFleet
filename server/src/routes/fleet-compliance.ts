/**
 * Fleet Compliance & Data Governance API Routes
 *
 * Endpoints for PII scanning, data retention policies, customer consent
 * management, right-to-erasure (GDPR/CCPA), audit trails, and
 * compliance scoring/reporting.
 */

import { randomUUID } from "node:crypto";
import { Router } from "express";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ScanStatus = "pending" | "running" | "completed" | "failed";

export interface PiiScanResult {
  id: string;
  status: ScanStatus;
  scope: string;
  targetBotIds: string[];
  findings: PiiFinding[];
  summary: {
    totalScanned: number;
    totalFindings: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
  startedAt: string;
  completedAt: string | null;
  requestedBy: string;
}

export interface PiiFinding {
  id: string;
  botId: string;
  location: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  sampleRedacted: string;
  detectedAt: string;
}

export type RetentionAction = "delete" | "anonymize" | "archive";

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  dataCategory: string;
  retentionDays: number;
  action: RetentionAction;
  scope: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ErasureStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partially_completed";

export interface ErasureRequest {
  id: string;
  customerId: string;
  reason: string;
  scope: string[];
  status: ErasureStatus;
  affectedBotIds: string[];
  deletedRecords: number;
  requestedAt: string;
  completedAt: string | null;
  requestedBy: string;
}

export interface ConsentRecord {
  customerId: string;
  consents: {
    category: string;
    granted: boolean;
    grantedAt: string | null;
    revokedAt: string | null;
    source: string;
  }[];
  lastUpdated: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  targetType: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ─── In-memory stores ──────────────────────────────────────────────────────

const scanResults = new Map<string, PiiScanResult>();
const retentionPolicies = new Map<string, RetentionPolicy>();
const erasureRequests = new Map<string, ErasureRequest>();
const consentRecords = new Map<string, ConsentRecord>();
const auditLog: AuditEntry[] = [];

const MAX_AUDIT_ENTRIES = 2000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function addAuditEntry(
  action: string,
  actor: string,
  target: string,
  targetType: string,
  details: Record<string, unknown> = {},
): void {
  const entry: AuditEntry = {
    id: randomUUID(),
    action,
    actor,
    target,
    targetType,
    details,
    timestamp: new Date().toISOString(),
  };
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }
}

function computeComplianceScore(): {
  score: number;
  breakdown: Record<string, { score: number; weight: number; details: string }>;
} {
  let totalWeight = 0;
  let weightedScore = 0;

  const breakdown: Record<
    string,
    { score: number; weight: number; details: string }
  > = {};

  // Factor 1: Retention policies defined (weight 25)
  const policyCount = retentionPolicies.size;
  const policyScore = Math.min(policyCount * 25, 100);
  breakdown.retentionPolicies = {
    score: policyScore,
    weight: 25,
    details: `${policyCount} retention ${policyCount === 1 ? "policy" : "policies"} defined`,
  };
  weightedScore += policyScore * 25;
  totalWeight += 25;

  // Factor 2: Recent PII scan (weight 30)
  const recentScans = Array.from(scanResults.values()).filter(
    (s) =>
      s.status === "completed" &&
      s.completedAt &&
      Date.now() - new Date(s.completedAt).getTime() < 7 * 24 * 3600_000,
  );
  const scanScore = recentScans.length > 0 ? 100 : 0;
  breakdown.piiScanning = {
    score: scanScore,
    weight: 30,
    details:
      recentScans.length > 0
        ? `${recentScans.length} scan(s) completed in last 7 days`
        : "No recent PII scans",
  };
  weightedScore += scanScore * 30;
  totalWeight += 30;

  // Factor 3: Erasure request handling (weight 20)
  const totalErasures = erasureRequests.size;
  const completedErasures = Array.from(erasureRequests.values()).filter(
    (e) => e.status === "completed",
  ).length;
  const erasureScore =
    totalErasures === 0
      ? 100
      : Math.round((completedErasures / totalErasures) * 100);
  breakdown.erasureCompliance = {
    score: erasureScore,
    weight: 20,
    details: `${completedErasures}/${totalErasures} erasure requests completed`,
  };
  weightedScore += erasureScore * 20;
  totalWeight += 20;

  // Factor 4: Consent records (weight 15)
  const consentCount = consentRecords.size;
  const consentScore = consentCount > 0 ? 100 : 0;
  breakdown.consentManagement = {
    score: consentScore,
    weight: 15,
    details: `${consentCount} customer consent ${consentCount === 1 ? "record" : "records"} tracked`,
  };
  weightedScore += consentScore * 15;
  totalWeight += 15;

  // Factor 5: Audit trail (weight 10)
  const auditScore = auditLog.length > 0 ? 100 : 0;
  breakdown.auditTrail = {
    score: auditScore,
    weight: 10,
    details: `${auditLog.length} audit entries recorded`,
  };
  weightedScore += auditScore * 10;
  totalWeight += 10;

  const overallScore =
    totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

  return { score: overallScore, breakdown };
}

// ─── Router ────────────────────────────────────────────────────────────────

export function fleetComplianceRoutes() {
  const router = Router();

  // ─── PII Scanning ──────────────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/compliance/scan
   * Initiate a PII scan across specified bots.
   * Body: { scope?, targetBotIds?, requestedBy? }
   */
  router.post("/compliance/scan", (req, res) => {
    const { scope, targetBotIds, requestedBy } = req.body ?? {};

    const now = new Date().toISOString();
    const scan: PiiScanResult = {
      id: randomUUID(),
      status: "running",
      scope: scope ?? "all",
      targetBotIds: targetBotIds ?? [],
      findings: [],
      summary: {
        totalScanned: 0,
        totalFindings: 0,
        bySeverity: {},
        byCategory: {},
      },
      startedAt: now,
      completedAt: null,
      requestedBy: requestedBy ?? "unknown",
    };

    scanResults.set(scan.id, scan);

    addAuditEntry(
      "compliance.scan.started",
      scan.requestedBy,
      scan.id,
      "pii_scan",
      { scope: scan.scope, targetBotIds: scan.targetBotIds },
    );

    // Simulate scan completion (in production, a background worker handles this)
    setTimeout(() => {
      scan.status = "completed";
      scan.completedAt = new Date().toISOString();
      scan.summary.totalScanned = scan.targetBotIds.length || 1;
    }, 0);

    res.status(201).json({
      ok: true,
      scan: {
        id: scan.id,
        status: scan.status,
        scope: scan.scope,
        startedAt: scan.startedAt,
      },
    });
  });

  /**
   * GET /api/fleet-monitor/compliance/scan/results
   * Retrieve PII scan results.
   * Query: ?scanId=xxx&status=completed&limit=20&offset=0
   */
  router.get("/compliance/scan/results", (req, res) => {
    try {
      const scanIdFilter = req.query.scanId as string | undefined;
      const statusFilter = req.query.status as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Number(req.query.offset) || 0;

      let items = Array.from(scanResults.values());

      if (scanIdFilter) {
        items = items.filter((s) => s.id === scanIdFilter);
      }
      if (statusFilter) {
        items = items.filter((s) => s.status === statusFilter);
      }

      items.sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

      const total = items.length;
      const paged = items.slice(offset, offset + limit);

      res.json({ ok: true, scans: paged, total, limit, offset });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Retention Policies ────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/compliance/policies
   * List all data retention policies.
   */
  router.get("/compliance/policies", (_req, res) => {
    try {
      const policies = Array.from(retentionPolicies.values());
      res.json({ ok: true, policies });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/fleet-monitor/compliance/policies
   * Create a data retention policy.
   * Body: { name, description?, dataCategory, retentionDays, action, scope?, enabled? }
   */
  router.post("/compliance/policies", (req, res) => {
    const { name, description, dataCategory, retentionDays, action, scope, enabled } =
      req.body ?? {};

    if (!name || typeof name !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: name" });
      return;
    }

    if (!dataCategory || typeof dataCategory !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: dataCategory" });
      return;
    }

    if (
      retentionDays === undefined ||
      typeof retentionDays !== "number" ||
      retentionDays < 1
    ) {
      res.status(400).json({
        ok: false,
        error: "Missing or invalid field: retentionDays (must be a positive number)",
      });
      return;
    }

    if (!action || !["delete", "anonymize", "archive"].includes(action)) {
      res.status(400).json({
        ok: false,
        error: "Missing or invalid field: action (must be delete, anonymize, or archive)",
      });
      return;
    }

    const now = new Date().toISOString();
    const policy: RetentionPolicy = {
      id: randomUUID(),
      name,
      description: description ?? "",
      dataCategory,
      retentionDays,
      action,
      scope: scope ?? "all",
      enabled: enabled !== false,
      createdAt: now,
      updatedAt: now,
    };

    retentionPolicies.set(policy.id, policy);

    addAuditEntry(
      "compliance.policy.created",
      "system",
      policy.id,
      "retention_policy",
      { name, dataCategory, retentionDays, action },
    );

    res.status(201).json({ ok: true, policy });
  });

  // ─── Customer Consent ──────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/compliance/consent/:customerId
   * Get consent records for a specific customer.
   */
  router.get("/compliance/consent/:customerId", (req, res) => {
    const { customerId } = req.params;

    const record = consentRecords.get(customerId);
    if (!record) {
      // Return an empty consent record rather than 404 — customer may simply
      // not have interacted with consent flows yet.
      res.json({
        ok: true,
        consent: {
          customerId,
          consents: [],
          lastUpdated: null,
        },
      });
      return;
    }

    res.json({ ok: true, consent: record });
  });

  // ─── Right to Erasure ──────────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/compliance/erasure
   * Submit a right-to-erasure (GDPR Article 17 / CCPA) request.
   * Body: { customerId, reason?, scope?, requestedBy? }
   */
  router.post("/compliance/erasure", (req, res) => {
    const { customerId, reason, scope, requestedBy } = req.body ?? {};

    if (!customerId || typeof customerId !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing required field: customerId" });
      return;
    }

    const now = new Date().toISOString();
    const request: ErasureRequest = {
      id: randomUUID(),
      customerId,
      reason: reason ?? "Customer request",
      scope: scope ?? ["conversations", "profile", "analytics"],
      status: "pending",
      affectedBotIds: [],
      deletedRecords: 0,
      requestedAt: now,
      completedAt: null,
      requestedBy: requestedBy ?? "unknown",
    };

    erasureRequests.set(request.id, request);

    addAuditEntry(
      "compliance.erasure.requested",
      request.requestedBy,
      request.id,
      "erasure_request",
      { customerId, reason: request.reason, scope: request.scope },
    );

    // In production, a background worker would process the erasure.
    // Simulate transitioning to processing state.
    request.status = "processing";

    res.status(201).json({
      ok: true,
      erasure: {
        id: request.id,
        customerId: request.customerId,
        status: request.status,
        requestedAt: request.requestedAt,
      },
    });
  });

  /**
   * GET /api/fleet-monitor/compliance/erasure/:id
   * Check the status of an erasure request.
   */
  router.get("/compliance/erasure/:id", (req, res) => {
    const request = erasureRequests.get(req.params.id);
    if (!request) {
      res.status(404).json({ ok: false, error: "Erasure request not found" });
      return;
    }

    res.json({ ok: true, erasure: request });
  });

  // ─── Audit Trail ───────────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/compliance/audit
   * Query the compliance audit trail.
   * Query: ?action=xxx&actor=xxx&targetType=xxx&limit=50&offset=0
   */
  router.get("/compliance/audit", (req, res) => {
    try {
      const actionFilter = req.query.action as string | undefined;
      const actorFilter = req.query.actor as string | undefined;
      const targetTypeFilter = req.query.targetType as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      let items = [...auditLog];

      if (actionFilter) {
        items = items.filter((e) => e.action === actionFilter);
      }
      if (actorFilter) {
        items = items.filter((e) => e.actor === actorFilter);
      }
      if (targetTypeFilter) {
        items = items.filter((e) => e.targetType === targetTypeFilter);
      }

      // Newest first
      items.reverse();

      const total = items.length;
      const paged = items.slice(offset, offset + limit);

      res.json({ ok: true, entries: paged, total, limit, offset });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Compliance Report ─────────────────────────────────────────────────

  /**
   * POST /api/fleet-monitor/compliance/report
   * Generate a compliance report snapshot.
   * Body: { reportType?, requestedBy? }
   */
  router.post("/compliance/report", (req, res) => {
    const { reportType, requestedBy } = req.body ?? {};

    try {
      const scoreData = computeComplianceScore();
      const now = new Date().toISOString();

      const report = {
        id: randomUUID(),
        reportType: reportType ?? "full",
        generatedAt: now,
        requestedBy: requestedBy ?? "unknown",
        score: scoreData.score,
        breakdown: scoreData.breakdown,
        summary: {
          totalPolicies: retentionPolicies.size,
          activePolicies: Array.from(retentionPolicies.values()).filter(
            (p) => p.enabled,
          ).length,
          totalScans: scanResults.size,
          completedScans: Array.from(scanResults.values()).filter(
            (s) => s.status === "completed",
          ).length,
          totalErasureRequests: erasureRequests.size,
          completedErasures: Array.from(erasureRequests.values()).filter(
            (e) => e.status === "completed",
          ).length,
          pendingErasures: Array.from(erasureRequests.values()).filter(
            (e) => e.status === "pending" || e.status === "processing",
          ).length,
          consentRecords: consentRecords.size,
          auditEntries: auditLog.length,
        },
      };

      addAuditEntry(
        "compliance.report.generated",
        report.requestedBy,
        report.id,
        "compliance_report",
        { reportType: report.reportType },
      );

      res.status(201).json({ ok: true, report });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Compliance Score ──────────────────────────────────────────────────

  /**
   * GET /api/fleet-monitor/compliance/score
   * Get the current compliance score with breakdown.
   */
  router.get("/compliance/score", (_req, res) => {
    try {
      const scoreData = computeComplianceScore();
      res.json({ ok: true, ...scoreData });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
