/**
 * Fleet Compliance & Data Governance Engine
 *
 * Provides a comprehensive compliance toolkit for fleet-wide data governance:
 *   - PII scanning & masking (Taiwan-specific formats + international)
 *   - Data retention policy enforcement
 *   - Customer consent registry (per scope/channel/bot)
 *   - Right-to-erasure request execution with deletion certificates
 *   - Append-only audit logging for all data operations
 *   - Compliance scoring (0-100) across multiple dimensions
 *   - Summary report generation
 *
 * All storage is in-memory. Designed for Taiwan market regulatory requirements
 * including 個人資料保護法 (Personal Data Protection Act) compliance.
 */

import { createHash, randomUUID } from "node:crypto";
import { logger } from "../middleware/logger.js";

// ─── PII Types & Patterns ──────────────────────────────────────────────────

export type PiiType =
  | "phone"
  | "email"
  | "national_id"
  | "credit_card"
  | "company_id"
  | "name";

export type PiiSeverity = "critical" | "high" | "medium" | "low";

interface PiiPattern {
  type: PiiType;
  regex: RegExp;
  severity: PiiSeverity;
  recommendation: string;
}

/**
 * Practical regex patterns for Taiwan-specific and international PII.
 *
 * Phone patterns:
 *   - Taiwan mobile: +886 9xx-xxx-xxx or 09xx-xxx-xxx (with optional separators)
 *   - Taiwan landline: +886 2-xxxx-xxxx or 02-xxxx-xxxx
 *   - International: +<country code> followed by digits (7-15 digits total)
 *
 * National ID (身分證字號):
 *   - One uppercase letter (A-Z) + 1 digit (1 or 2 for gender) + 8 digits
 *
 * Company tax ID (統一編號):
 *   - Exactly 8 digits (often preceded by context like "統編" or "統一編號")
 *
 * Credit card:
 *   - 13-19 digits, optionally separated by spaces or dashes in groups of 4
 */
const PII_PATTERNS: PiiPattern[] = [
  // Taiwan mobile: +886 9xx xxx xxx or 09xx-xxx-xxx
  {
    type: "phone",
    regex: /(?:\+886[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{3}/g,
    severity: "high",
    recommendation:
      "Mask or remove phone number. Store only hashed version if needed for dedup.",
  },
  // Taiwan landline: +886 2-xxxx-xxxx or 0x-xxxx-xxxx (area codes 2-8)
  {
    type: "phone",
    regex: /(?:\+886[\s-]?|0)[2-8][\s-]?\d{4}[\s-]?\d{4}/g,
    severity: "high",
    recommendation:
      "Mask or remove phone number. Store only hashed version if needed for dedup.",
  },
  // International phone: +<country code> <number> (E.164-ish)
  {
    type: "phone",
    regex: /\+(?!886)[1-9]\d{0,2}[\s-]?\d[\d\s-]{5,13}\d/g,
    severity: "high",
    recommendation:
      "Mask or remove phone number. Store only hashed version if needed for dedup.",
  },
  // Email
  {
    type: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    severity: "high",
    recommendation:
      "Mask email address. Use pseudonymized identifier for analytics.",
  },
  // Taiwan National ID: A123456789 format (letter + 9 digits, 2nd digit is 1 or 2)
  {
    type: "national_id",
    regex: /\b[A-Z][12]\d{8}\b/g,
    severity: "critical",
    recommendation:
      "Immediately remove national ID. Never store in plaintext. Use tokenized reference only.",
  },
  // Credit card: 13-19 digits with optional separators
  {
    type: "credit_card",
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g,
    severity: "critical",
    recommendation:
      "Remove credit card number immediately. PCI-DSS requires tokenization via payment processor.",
  },
  // Taiwan company tax ID (統一編號): 8 digits, optionally preceded by context
  {
    type: "company_id",
    regex: /(?:統一?編號?[：:\s]*)?\b\d{8}\b/g,
    severity: "medium",
    recommendation:
      "Company tax ID is semi-public but should still be masked in logs and chat transcripts.",
  },
];

// ─── Core Interfaces ────────────────────────────────────────────────────────

export interface PiiFindings {
  botId: string;
  location: string;
  piiType: PiiType;
  piiValue: string;
  severity: string;
  recommendation: string;
}

export interface PiiScanResult {
  scannedAt: Date;
  totalItemsScanned: number;
  findings: PiiFindings[];
  summary: {
    totalFindings: number;
    byType: Record<string, number>;
    byBot: Record<string, number>;
  };
}

export interface RetentionPolicy {
  id: string;
  name: string;
  dataCategory: string;
  retentionDays: number;
  action: "delete" | "archive" | "anonymize";
  createdAt: Date;
}

export interface RetainedDataRecord {
  id: string;
  botId: string;
  dataCategory: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface RetentionEnforcementReport {
  generatedAt: Date;
  policiesEvaluated: number;
  overdueItems: Array<{
    recordId: string;
    botId: string;
    dataCategory: string;
    createdAt: Date;
    overdueDays: number;
    requiredAction: string;
  }>;
  summary: {
    totalOverdue: number;
    byCategory: Record<string, number>;
    byBot: Record<string, number>;
  };
}

export interface ConsentEntry {
  scope: string;
  granted: boolean;
  grantedAt?: Date;
  revokedAt?: Date;
  channel: string;
  botId: string;
}

export interface CustomerConsent {
  customerId: string;
  consents: ConsentEntry[];
}

export interface ErasureRequest {
  id: string;
  customerId: string;
  requestedAt: Date;
  status: "pending" | "processing" | "completed" | "failed";
  progress: {
    botsScanned: number;
    botsTotal: number;
    itemsDeleted: number;
  };
  completedAt?: Date;
  failureReason?: string;
  certificate?: {
    hash: string;
    issuedAt: Date;
    itemsDeleted: number;
    botsAffected: string[];
  };
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  actor: {
    type: string;
    id: string;
    name: string;
  };
  action: string;
  target: {
    type: string;
    id: string;
    piiInvolved: boolean;
  };
  result: string;
  details?: Record<string, unknown>;
}

export interface ComplianceScore {
  overall: number;
  breakdown: {
    piiHandling: number;
    consentCoverage: number;
    retentionCompliance: number;
    erasureResponsiveness: number;
    auditCompleteness: number;
  };
  grade: "A" | "B" | "C" | "D" | "F";
  computedAt: Date;
}

export interface ComplianceReport {
  generatedAt: Date;
  period: { from: Date; to: Date };
  score: ComplianceScore;
  piiSummary: {
    totalScans: number;
    totalFindings: number;
    unresolvedFindings: number;
  };
  consentSummary: {
    totalCustomers: number;
    fullConsentRate: number;
  };
  retentionSummary: {
    activePolicies: number;
    overdueRecords: number;
  };
  erasureSummary: {
    totalRequests: number;
    completed: number;
    pending: number;
    averageCompletionMs: number;
  };
  auditSummary: {
    totalEntries: number;
    piiRelatedEntries: number;
  };
  recommendations: string[];
}

// ─── Compliance Engine ──────────────────────────────────────────────────────

export class ComplianceEngine {
  // In-memory stores
  private readonly auditLog: AuditEntry[] = [];
  private readonly consentRegistry: Map<string, CustomerConsent> = new Map();
  private readonly retentionPolicies: Map<string, RetentionPolicy> = new Map();
  private readonly dataRecords: RetainedDataRecord[] = [];
  private readonly erasureRequests: Map<string, ErasureRequest> = new Map();
  private readonly scanHistory: PiiScanResult[] = [];

  // Simulated bot registry for erasure operations
  private readonly registeredBotIds: Set<string> = new Set();

  private auditSeq = 0;

  // ─── PII Scanner ────────────────────────────────────────────────────────

  /**
   * Scan a batch of text items for PII. Each item is associated with a bot
   * and a location descriptor (e.g., "chat_transcript:msg_42").
   */
  scanForPii(
    items: Array<{ botId: string; location: string; text: string }>,
  ): PiiScanResult {
    const findings: PiiFindings[] = [];

    for (const item of items) {
      for (const pattern of PII_PATTERNS) {
        // Reset regex state for each item
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(item.text)) !== null) {
          findings.push({
            botId: item.botId,
            location: item.location,
            piiType: pattern.type,
            piiValue: match[0],
            severity: pattern.severity,
            recommendation: pattern.recommendation,
          });
        }
      }
    }

    // Build summary
    const byType: Record<string, number> = {};
    const byBot: Record<string, number> = {};
    for (const f of findings) {
      byType[f.piiType] = (byType[f.piiType] ?? 0) + 1;
      byBot[f.botId] = (byBot[f.botId] ?? 0) + 1;
    }

    const result: PiiScanResult = {
      scannedAt: new Date(),
      totalItemsScanned: items.length,
      findings,
      summary: {
        totalFindings: findings.length,
        byType,
        byBot,
      },
    };

    this.scanHistory.push(result);

    this.appendAudit({
      actor: { type: "system", id: "compliance-engine", name: "PII Scanner" },
      action: "pii.scan",
      target: { type: "batch", id: `scan_${this.scanHistory.length}`, piiInvolved: findings.length > 0 },
      result: "success",
      details: { itemsScanned: items.length, findingsCount: findings.length },
    });

    logger.info(
      { itemsScanned: items.length, findings: findings.length },
      "[Compliance] PII scan completed",
    );

    return result;
  }

  // ─── PII Masker ─────────────────────────────────────────────────────────

  /**
   * Mask all detected PII in the given text. Returns masked text.
   *
   * Masking strategies:
   *   phone:       "+886912****78" (keep first 6, last 2)
   *   email:       "a***@example.com" (keep first char + domain)
   *   national_id: "A1******89" (keep first 2, last 2)
   *   credit_card: "****-****-****-1234" (keep last 4)
   *   company_id:  "1234****" (keep first 4)
   *   name:        "X**" (keep first char)
   */
  maskPii(text: string): string {
    let masked = text;

    for (const pattern of PII_PATTERNS) {
      pattern.regex.lastIndex = 0;
      masked = masked.replace(pattern.regex, (match) =>
        this.applyMask(match, pattern.type),
      );
    }

    return masked;
  }

  /**
   * Mask a single PII value according to its type.
   */
  maskPiiValue(value: string, type: PiiType): string {
    return this.applyMask(value, type);
  }

  private applyMask(value: string, type: PiiType): string {
    switch (type) {
      case "phone": {
        // Strip separators, mask middle, restore rough shape
        const digits = value.replace(/[\s-]/g, "");
        if (digits.length <= 4) return "****";
        const prefix = digits.slice(0, Math.min(6, digits.length - 2));
        const suffix = digits.slice(-2);
        const starCount = Math.max(1, digits.length - prefix.length - suffix.length);
        return `${prefix}${"*".repeat(starCount)}${suffix}`;
      }
      case "email": {
        const atIdx = value.indexOf("@");
        if (atIdx <= 0) return "***@***";
        const localPart = value.slice(0, atIdx);
        const domain = value.slice(atIdx);
        return `${localPart[0]}***${domain}`;
      }
      case "national_id": {
        if (value.length < 4) return "****";
        return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
      }
      case "credit_card": {
        const ccDigits = value.replace(/[\s-]/g, "");
        const last4 = ccDigits.slice(-4);
        return `****-****-****-${last4}`;
      }
      case "company_id": {
        const raw = value.replace(/[^\d]/g, "");
        if (raw.length < 8) return "****";
        // Keep context prefix (e.g., "統一編號：") if present
        const numStart = value.search(/\d{8}/);
        const contextPrefix = numStart > 0 ? value.slice(0, numStart) : "";
        return `${contextPrefix}${raw.slice(0, 4)}****`;
      }
      case "name": {
        if (value.length <= 1) return "*";
        return `${value[0]}${"*".repeat(value.length - 1)}`;
      }
      default:
        return "*".repeat(value.length);
    }
  }

  // ─── Data Retention Enforcer ────────────────────────────────────────────

  /**
   * Register a data retention policy.
   */
  addRetentionPolicy(
    policy: Omit<RetentionPolicy, "id" | "createdAt">,
  ): RetentionPolicy {
    const id = `rp_${randomUUID()}`;
    const record: RetentionPolicy = {
      ...policy,
      id,
      createdAt: new Date(),
    };
    this.retentionPolicies.set(id, record);

    this.appendAudit({
      actor: { type: "system", id: "compliance-engine", name: "Retention Enforcer" },
      action: "retention.policy.created",
      target: { type: "retention_policy", id, piiInvolved: false },
      result: "success",
      details: { name: policy.name, retentionDays: policy.retentionDays },
    });

    logger.info({ policyId: id, name: policy.name }, "[Compliance] Retention policy added");
    return record;
  }

  /**
   * Remove a retention policy.
   */
  removeRetentionPolicy(policyId: string): boolean {
    const removed = this.retentionPolicies.delete(policyId);
    if (removed) {
      this.appendAudit({
        actor: { type: "system", id: "compliance-engine", name: "Retention Enforcer" },
        action: "retention.policy.removed",
        target: { type: "retention_policy", id: policyId, piiInvolved: false },
        result: "success",
      });
    }
    return removed;
  }

  /**
   * Track a data record for retention management.
   */
  addDataRecord(record: Omit<RetainedDataRecord, "id">): RetainedDataRecord {
    const entry: RetainedDataRecord = {
      ...record,
      id: `dr_${randomUUID()}`,
    };
    this.dataRecords.push(entry);
    this.registeredBotIds.add(record.botId);
    return entry;
  }

  /**
   * Check for overdue data records and generate an enforcement report.
   */
  enforceRetention(now: Date = new Date()): RetentionEnforcementReport {
    const overdueItems: RetentionEnforcementReport["overdueItems"] = [];
    const policies = Array.from(this.retentionPolicies.values());

    for (const record of this.dataRecords) {
      // Find matching policy by data category
      const policy = policies.find((p) => p.dataCategory === record.dataCategory);
      if (!policy) continue;

      const ageMs = now.getTime() - record.createdAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if (ageDays > policy.retentionDays) {
        overdueItems.push({
          recordId: record.id,
          botId: record.botId,
          dataCategory: record.dataCategory,
          createdAt: record.createdAt,
          overdueDays: Math.floor(ageDays - policy.retentionDays),
          requiredAction: policy.action,
        });
      }
    }

    // Build summary
    const byCategory: Record<string, number> = {};
    const byBot: Record<string, number> = {};
    for (const item of overdueItems) {
      byCategory[item.dataCategory] = (byCategory[item.dataCategory] ?? 0) + 1;
      byBot[item.botId] = (byBot[item.botId] ?? 0) + 1;
    }

    const report: RetentionEnforcementReport = {
      generatedAt: now,
      policiesEvaluated: policies.length,
      overdueItems,
      summary: {
        totalOverdue: overdueItems.length,
        byCategory,
        byBot,
      },
    };

    this.appendAudit({
      actor: { type: "system", id: "compliance-engine", name: "Retention Enforcer" },
      action: "retention.enforcement.check",
      target: { type: "fleet", id: "all", piiInvolved: overdueItems.length > 0 },
      result: "success",
      details: {
        policiesEvaluated: policies.length,
        overdueCount: overdueItems.length,
      },
    });

    logger.info(
      { policiesEvaluated: policies.length, overdueCount: overdueItems.length },
      "[Compliance] Retention enforcement check completed",
    );

    return report;
  }

  // ─── Consent Registry ───────────────────────────────────────────────────

  /**
   * Record or update consent for a customer.
   */
  recordConsent(
    customerId: string,
    consent: Omit<ConsentEntry, "grantedAt" | "revokedAt">,
  ): CustomerConsent {
    let record = this.consentRegistry.get(customerId);
    if (!record) {
      record = { customerId, consents: [] };
      this.consentRegistry.set(customerId, record);
    }

    // Find existing consent for same scope+channel+bot
    const existing = record.consents.find(
      (c) =>
        c.scope === consent.scope &&
        c.channel === consent.channel &&
        c.botId === consent.botId,
    );

    if (existing) {
      existing.granted = consent.granted;
      if (consent.granted) {
        existing.grantedAt = new Date();
        existing.revokedAt = undefined;
      } else {
        existing.revokedAt = new Date();
      }
    } else {
      record.consents.push({
        ...consent,
        grantedAt: consent.granted ? new Date() : undefined,
        revokedAt: consent.granted ? undefined : new Date(),
      });
    }

    this.appendAudit({
      actor: { type: "customer", id: customerId, name: customerId },
      action: consent.granted ? "consent.granted" : "consent.revoked",
      target: {
        type: "consent",
        id: `${customerId}:${consent.scope}:${consent.botId}`,
        piiInvolved: true,
      },
      result: "success",
      details: { scope: consent.scope, channel: consent.channel, botId: consent.botId },
    });

    logger.info(
      { customerId, scope: consent.scope, granted: consent.granted },
      "[Compliance] Consent updated",
    );

    return record;
  }

  /**
   * Get all consent records for a customer.
   */
  getConsent(customerId: string): CustomerConsent | undefined {
    return this.consentRegistry.get(customerId);
  }

  /**
   * Check whether a customer has granted consent for a specific scope+bot.
   */
  hasConsent(customerId: string, scope: string, botId: string): boolean {
    const record = this.consentRegistry.get(customerId);
    if (!record) return false;
    return record.consents.some(
      (c) => c.scope === scope && c.botId === botId && c.granted,
    );
  }

  /**
   * Get all customer IDs that have any consent records.
   */
  getAllConsentCustomerIds(): string[] {
    return Array.from(this.consentRegistry.keys());
  }

  // ─── Erasure Executor ───────────────────────────────────────────────────

  /**
   * Register a bot so the erasure executor knows about it.
   */
  registerBot(botId: string): void {
    this.registeredBotIds.add(botId);
  }

  /**
   * Submit a right-to-erasure request for a customer.
   */
  submitErasureRequest(customerId: string): ErasureRequest {
    const id = `er_${randomUUID()}`;
    const botsTotal = this.registeredBotIds.size;

    const request: ErasureRequest = {
      id,
      customerId,
      requestedAt: new Date(),
      status: "pending",
      progress: {
        botsScanned: 0,
        botsTotal,
        itemsDeleted: 0,
      },
    };

    this.erasureRequests.set(id, request);

    this.appendAudit({
      actor: { type: "customer", id: customerId, name: customerId },
      action: "erasure.requested",
      target: { type: "erasure_request", id, piiInvolved: true },
      result: "success",
      details: { botsTotal },
    });

    logger.info(
      { requestId: id, customerId, botsTotal },
      "[Compliance] Erasure request submitted",
    );

    return request;
  }

  /**
   * Execute an erasure request. Simulates scanning each registered bot,
   * removing matching data records and consent entries, then generates
   * a SHA-256 deletion certificate as proof.
   */
  executeErasure(requestId: string): ErasureRequest {
    const request = this.erasureRequests.get(requestId);
    if (!request) {
      throw new Error(`Erasure request not found: ${requestId}`);
    }

    if (request.status === "completed") {
      return request;
    }

    request.status = "processing";
    const botsAffected: Set<string> = new Set();
    let itemsDeleted = 0;

    // Scan all registered bots and remove customer data
    const botIds = Array.from(this.registeredBotIds);
    for (let i = 0; i < botIds.length; i++) {
      const botId = botIds[i];

      // Remove data records belonging to this customer's bot
      const toRemove: number[] = [];
      for (let j = this.dataRecords.length - 1; j >= 0; j--) {
        const rec = this.dataRecords[j];
        if (rec.botId === botId && rec.metadata?.customerId === request.customerId) {
          toRemove.push(j);
          botsAffected.add(botId);
        }
      }

      for (const idx of toRemove) {
        this.dataRecords.splice(idx, 1);
        itemsDeleted++;
      }

      request.progress.botsScanned = i + 1;
      request.progress.itemsDeleted = itemsDeleted;
    }

    // Remove consent records
    const consentRecord = this.consentRegistry.get(request.customerId);
    if (consentRecord) {
      itemsDeleted += consentRecord.consents.length;
      for (const c of consentRecord.consents) {
        botsAffected.add(c.botId);
      }
      this.consentRegistry.delete(request.customerId);
    }

    request.progress.itemsDeleted = itemsDeleted;

    // Generate deletion certificate with SHA-256 hash proof
    const certificateData = JSON.stringify({
      requestId,
      customerId: request.customerId,
      itemsDeleted,
      botsAffected: Array.from(botsAffected).sort(),
      executedAt: new Date().toISOString(),
      nonce: randomUUID(),
    });

    const hash = createHash("sha256").update(certificateData).digest("hex");

    request.certificate = {
      hash,
      issuedAt: new Date(),
      itemsDeleted,
      botsAffected: Array.from(botsAffected).sort(),
    };

    request.status = "completed";
    request.completedAt = new Date();

    this.appendAudit({
      actor: { type: "system", id: "compliance-engine", name: "Erasure Executor" },
      action: "erasure.completed",
      target: { type: "erasure_request", id: requestId, piiInvolved: true },
      result: "success",
      details: {
        customerId: request.customerId,
        itemsDeleted,
        botsAffected: Array.from(botsAffected),
        certificateHash: hash,
      },
    });

    logger.info(
      { requestId, itemsDeleted, botsAffected: botsAffected.size, hash },
      "[Compliance] Erasure completed with certificate",
    );

    return request;
  }

  /**
   * Retrieve an erasure request by ID.
   */
  getErasureRequest(requestId: string): ErasureRequest | undefined {
    return this.erasureRequests.get(requestId);
  }

  /**
   * Mark an erasure request as failed.
   */
  failErasure(requestId: string, reason: string): ErasureRequest {
    const request = this.erasureRequests.get(requestId);
    if (!request) {
      throw new Error(`Erasure request not found: ${requestId}`);
    }

    request.status = "failed";
    request.failureReason = reason;

    this.appendAudit({
      actor: { type: "system", id: "compliance-engine", name: "Erasure Executor" },
      action: "erasure.failed",
      target: { type: "erasure_request", id: requestId, piiInvolved: true },
      result: "failure",
      details: { reason },
    });

    logger.warn({ requestId, reason }, "[Compliance] Erasure request failed");
    return request;
  }

  // ─── Audit Logger ──────────────────────────────────────────────────────

  /**
   * Append an entry to the audit trail. This is append-only; entries
   * cannot be modified or deleted.
   */
  appendAudit(
    entry: Omit<AuditEntry, "id" | "timestamp">,
  ): AuditEntry {
    const auditEntry: AuditEntry = {
      ...entry,
      id: `audit_${Date.now()}_${++this.auditSeq}`,
      timestamp: new Date(),
    };

    // Freeze the entry to enforce immutability
    Object.freeze(auditEntry);
    Object.freeze(auditEntry.actor);
    Object.freeze(auditEntry.target);

    this.auditLog.push(auditEntry);

    return auditEntry;
  }

  /**
   * Query audit log entries with optional filters.
   */
  queryAuditLog(filters?: {
    action?: string;
    actorId?: string;
    targetType?: string;
    piiOnly?: boolean;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): { entries: AuditEntry[]; total: number } {
    let entries = [...this.auditLog];

    if (filters?.action) {
      entries = entries.filter((e) => e.action === filters.action);
    }
    if (filters?.actorId) {
      entries = entries.filter((e) => e.actor.id === filters.actorId);
    }
    if (filters?.targetType) {
      entries = entries.filter((e) => e.target.type === filters.targetType);
    }
    if (filters?.piiOnly) {
      entries = entries.filter((e) => e.target.piiInvolved);
    }
    if (filters?.from) {
      entries = entries.filter((e) => e.timestamp >= filters.from!);
    }
    if (filters?.to) {
      entries = entries.filter((e) => e.timestamp <= filters.to!);
    }

    const total = entries.length;
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 100;
    entries = entries.slice(offset, offset + limit);

    return { entries, total };
  }

  /**
   * Get the full audit log size.
   */
  getAuditLogSize(): number {
    return this.auditLog.length;
  }

  // ─── Compliance Scorer ─────────────────────────────────────────────────

  /**
   * Calculate overall compliance score (0-100) based on five dimensions:
   *   - PII handling (25%): ratio of resolved vs total PII findings
   *   - Consent coverage (25%): ratio of customers with full consent
   *   - Retention compliance (20%): ratio of data within retention limits
   *   - Erasure responsiveness (15%): ratio of completed erasure requests
   *   - Audit completeness (15%): presence and recency of audit trail
   */
  calculateComplianceScore(): ComplianceScore {
    const piiScore = this.scorePiiHandling();
    const consentScore = this.scoreConsentCoverage();
    const retentionScore = this.scoreRetentionCompliance();
    const erasureScore = this.scoreErasureResponsiveness();
    const auditScore = this.scoreAuditCompleteness();

    const overall = Math.round(
      piiScore * 0.25 +
      consentScore * 0.25 +
      retentionScore * 0.2 +
      erasureScore * 0.15 +
      auditScore * 0.15,
    );

    const grade = this.scoreToGrade(overall);

    const result: ComplianceScore = {
      overall,
      breakdown: {
        piiHandling: piiScore,
        consentCoverage: consentScore,
        retentionCompliance: retentionScore,
        erasureResponsiveness: erasureScore,
        auditCompleteness: auditScore,
      },
      grade,
      computedAt: new Date(),
    };

    this.appendAudit({
      actor: { type: "system", id: "compliance-engine", name: "Compliance Scorer" },
      action: "compliance.score.calculated",
      target: { type: "fleet", id: "all", piiInvolved: false },
      result: "success",
      details: { overall, grade },
    });

    logger.info(
      { overall, grade },
      "[Compliance] Compliance score calculated",
    );

    return result;
  }

  private scorePiiHandling(): number {
    if (this.scanHistory.length === 0) return 100; // No scans = no violations (but score may be penalized by audit)

    const lastScan = this.scanHistory[this.scanHistory.length - 1];
    if (lastScan.summary.totalFindings === 0) return 100;

    // More findings = lower score, scaled logarithmically
    const findingsPerItem = lastScan.summary.totalFindings / Math.max(1, lastScan.totalItemsScanned);
    // 0 findings/item -> 100, 0.5+ findings/item -> ~20
    return Math.max(0, Math.round(100 * Math.exp(-3 * findingsPerItem)));
  }

  private scoreConsentCoverage(): number {
    const customers = Array.from(this.consentRegistry.values());
    if (customers.length === 0) return 100;

    let fullyConsented = 0;
    for (const customer of customers) {
      const allGranted = customer.consents.length > 0 &&
        customer.consents.every((c) => c.granted);
      if (allGranted) fullyConsented++;
    }

    return Math.round((fullyConsented / customers.length) * 100);
  }

  private scoreRetentionCompliance(): number {
    if (this.retentionPolicies.size === 0 && this.dataRecords.length === 0) return 100;
    if (this.retentionPolicies.size === 0 && this.dataRecords.length > 0) return 50; // Data without policies is risky

    const report = this.enforceRetention();
    if (this.dataRecords.length === 0) return 100;

    const complianceRate = 1 - report.summary.totalOverdue / Math.max(1, this.dataRecords.length);
    return Math.round(complianceRate * 100);
  }

  private scoreErasureResponsiveness(): number {
    const requests = Array.from(this.erasureRequests.values());
    if (requests.length === 0) return 100;

    const completed = requests.filter((r) => r.status === "completed").length;
    const failed = requests.filter((r) => r.status === "failed").length;

    // Completed = full marks, pending/processing = partial, failed = penalty
    const score = ((completed * 1.0 + (requests.length - completed - failed) * 0.5) / requests.length) * 100;
    return Math.round(Math.max(0, score));
  }

  private scoreAuditCompleteness(): number {
    // Presence of audit entries is good; recency matters too
    if (this.auditLog.length === 0) return 50; // No audit trail is concerning

    // Check if audit entries are recent (within last 24h)
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const recentEntries = this.auditLog.filter(
      (e) => now - e.timestamp.getTime() < dayMs,
    ).length;

    const recencyRatio = recentEntries / this.auditLog.length;

    // Base 70 for having an audit trail + up to 30 for recency
    return Math.round(70 + recencyRatio * 30);
  }

  private scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  // ─── Report Generator ──────────────────────────────────────────────────

  /**
   * Generate a comprehensive compliance report for the given time period.
   */
  generateReport(
    from: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: Date = new Date(),
  ): ComplianceReport {
    const score = this.calculateComplianceScore();

    // PII summary
    const scansInPeriod = this.scanHistory.filter(
      (s) => s.scannedAt >= from && s.scannedAt <= to,
    );
    const totalFindings = scansInPeriod.reduce(
      (sum, s) => sum + s.summary.totalFindings,
      0,
    );
    // "Unresolved" = findings from the most recent scan (simplification)
    const unresolvedFindings =
      scansInPeriod.length > 0
        ? scansInPeriod[scansInPeriod.length - 1].summary.totalFindings
        : 0;

    // Consent summary
    const allCustomers = Array.from(this.consentRegistry.values());
    const fullyConsentedCount = allCustomers.filter(
      (c) => c.consents.length > 0 && c.consents.every((e) => e.granted),
    ).length;
    const fullConsentRate =
      allCustomers.length > 0
        ? fullyConsentedCount / allCustomers.length
        : 1.0;

    // Retention summary
    const retentionReport = this.enforceRetention(to);

    // Erasure summary
    const allErasures = Array.from(this.erasureRequests.values());
    const erasuresInPeriod = allErasures.filter(
      (r) => r.requestedAt >= from && r.requestedAt <= to,
    );
    const completedErasures = erasuresInPeriod.filter(
      (r) => r.status === "completed",
    );
    const pendingErasures = erasuresInPeriod.filter(
      (r) => r.status === "pending" || r.status === "processing",
    );
    const avgCompletionMs =
      completedErasures.length > 0
        ? completedErasures.reduce(
            (sum, r) =>
              sum +
              (r.completedAt!.getTime() - r.requestedAt.getTime()),
            0,
          ) / completedErasures.length
        : 0;

    // Audit summary
    const auditInPeriod = this.auditLog.filter(
      (e) => e.timestamp >= from && e.timestamp <= to,
    );
    const piiRelated = auditInPeriod.filter(
      (e) => e.target.piiInvolved,
    ).length;

    // Generate recommendations
    const recommendations: string[] = [];

    if (score.overall < 80) {
      recommendations.push(
        "Overall compliance score is below target (80). Review each dimension for improvement areas.",
      );
    }
    if (score.breakdown.piiHandling < 70) {
      recommendations.push(
        "PII handling score is low. Run PII scans more frequently and remediate findings promptly.",
      );
    }
    if (score.breakdown.consentCoverage < 80) {
      recommendations.push(
        "Consent coverage is insufficient. Ensure all customers have provided consent for active scopes.",
      );
    }
    if (retentionReport.summary.totalOverdue > 0) {
      recommendations.push(
        `${retentionReport.summary.totalOverdue} data records exceed retention limits. Execute enforcement actions immediately.`,
      );
    }
    if (pendingErasures.length > 0) {
      recommendations.push(
        `${pendingErasures.length} erasure request(s) are pending. Process within regulatory deadline (typically 30 days).`,
      );
    }
    if (this.auditLog.length === 0) {
      recommendations.push(
        "No audit trail detected. Ensure all data operations are being logged.",
      );
    }
    if (this.retentionPolicies.size === 0 && this.dataRecords.length > 0) {
      recommendations.push(
        "Data records exist without retention policies. Define policies for all data categories.",
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        "All compliance metrics are within acceptable thresholds. Continue current practices.",
      );
    }

    const report: ComplianceReport = {
      generatedAt: new Date(),
      period: { from, to },
      score,
      piiSummary: {
        totalScans: scansInPeriod.length,
        totalFindings,
        unresolvedFindings,
      },
      consentSummary: {
        totalCustomers: allCustomers.length,
        fullConsentRate: Math.round(fullConsentRate * 100) / 100,
      },
      retentionSummary: {
        activePolicies: this.retentionPolicies.size,
        overdueRecords: retentionReport.summary.totalOverdue,
      },
      erasureSummary: {
        totalRequests: erasuresInPeriod.length,
        completed: completedErasures.length,
        pending: pendingErasures.length,
        averageCompletionMs: Math.round(avgCompletionMs),
      },
      auditSummary: {
        totalEntries: auditInPeriod.length,
        piiRelatedEntries: piiRelated,
      },
      recommendations,
    };

    this.appendAudit({
      actor: { type: "system", id: "compliance-engine", name: "Report Generator" },
      action: "compliance.report.generated",
      target: { type: "report", id: `report_${Date.now()}`, piiInvolved: false },
      result: "success",
      details: {
        period: { from: from.toISOString(), to: to.toISOString() },
        overallScore: score.overall,
      },
    });

    logger.info(
      { overallScore: score.overall, grade: score.grade },
      "[Compliance] Compliance report generated",
    );

    return report;
  }

  // ─── Utility ───────────────────────────────────────────────────────────

  /**
   * Get counts of all in-memory stores (for diagnostics).
   */
  getStats(): Record<string, number> {
    return {
      auditEntries: this.auditLog.length,
      consentRecords: this.consentRegistry.size,
      retentionPolicies: this.retentionPolicies.size,
      dataRecords: this.dataRecords.length,
      erasureRequests: this.erasureRequests.size,
      scanHistory: this.scanHistory.length,
      registeredBots: this.registeredBotIds.size,
    };
  }

  /**
   * Reset all in-memory stores. Use for testing only.
   */
  reset(): void {
    (this.auditLog as AuditEntry[]).length = 0;
    this.consentRegistry.clear();
    this.retentionPolicies.clear();
    this.dataRecords.length = 0;
    this.erasureRequests.clear();
    this.scanHistory.length = 0;
    this.registeredBotIds.clear();
    this.auditSeq = 0;

    logger.info("[Compliance] Engine state reset");
  }
}

// ─── Default export (singleton) ─────────────────────────────────────────────

export default new ComplianceEngine();
