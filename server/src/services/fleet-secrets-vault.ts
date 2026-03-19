/**
 * Fleet Secrets Vault Service
 *
 * Provides centralized secret management for the fleet. Stores encrypted
 * secrets, assigns them to bots, pushes via gateway RPC, verifies sync
 * status, and supports auto-rotation with full audit trails.
 *
 * Key capabilities:
 * - AES-256-GCM encryption at rest (master key from env)
 * - Per-bot secret assignment and push via `config.patch` RPC
 * - Hash-based sync verification via `secrets.resolve` RPC
 * - Rotation policies (manual / auto) with history tracking
 * - Expiration monitoring and health reporting
 * - Full access audit log
 */

import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { getFleetMonitorService } from "./fleet-monitor.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SecretCategory =
  | "api_key"
  | "oauth_token"
  | "password"
  | "certificate"
  | "webhook_secret"
  | "custom";

export type RotationPolicy = "manual" | "auto";

export type BotSecretStatus = "pending" | "pushed" | "verified" | "out_of_sync" | "error";

export interface BotAssignment {
  botId: string;
  botName: string;
  configPath: string;
  lastPushed?: Date;
  lastVerified?: Date;
  status: BotSecretStatus;
}

export interface RotationHistoryEntry {
  rotatedAt: Date;
  reason: string;
  actor: string;
  previousValueHash: string;
}

export interface SecretRotation {
  policy: RotationPolicy;
  intervalDays?: number;
  lastRotated: Date;
  nextRotation?: Date;
  history: RotationHistoryEntry[];
}

export interface AccessLogEntry {
  timestamp: Date;
  action: string;
  actor: string;
  details?: string;
}

export interface VaultSecret {
  id: string;
  companyId: string;
  name: string;
  category: SecretCategory;
  description?: string;
  encryptedValue: string;
  valueHash: string;
  assignedBots: BotAssignment[];
  rotation: SecretRotation;
  expiresAt?: Date;
  expirationWarningDays: number;
  accessLog: AccessLogEntry[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface SecretHealthAlert {
  secretId: string;
  secretName: string;
  type: "expiring_soon" | "expired" | "never_rotated" | "out_of_sync" | "overexposed";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export interface SecretHealthReport {
  companyId: string;
  generatedAt: Date;
  summary: {
    totalSecrets: number;
    expiringSoon: number;
    expired: number;
    neverRotated: number;
    outOfSync: number;
    overexposed: number;
  };
  alerts: SecretHealthAlert[];
}

export interface CreateSecretData {
  name: string;
  category: SecretCategory;
  value: string;
  description?: string;
  tags?: string[];
  expiresAt?: Date;
  expirationWarningDays?: number;
  createdBy: string;
}

export interface SecretFilters {
  category?: SecretCategory;
  tag?: string;
}

export interface BulkRotateFilter {
  category?: SecretCategory;
  olderThanDays?: number;
}

// ─── Encryption Helpers ──────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const hex = process.env.VAULT_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "VAULT_MASTER_KEY must be set as a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: base64(iv + authTag + ciphertext)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

function decrypt(ciphertext: string): string {
  const key = getMasterKey();
  const combined = Buffer.from(ciphertext, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function hashValue(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext, "utf8").digest("hex");
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class FleetSecretsVaultService extends EventEmitter {
  private secrets: Map<string, VaultSecret> = new Map();

  constructor() {
    super();
  }

  // ── Access Logging ──────────────────────────────────────────────────────

  private logAccess(
    secretId: string,
    companyId: string,
    action: string,
    actor: string,
    details?: string,
  ): void {
    const secret = this.secrets.get(secretId);
    if (secret) {
      secret.accessLog.push({
        timestamp: new Date(),
        action,
        actor,
        details,
      });
    }
    this.emit("access_logged", { secretId, companyId, action, actor, details });
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  createSecret(companyId: string, data: CreateSecretData): VaultSecret {
    const id = `sec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const now = new Date();

    const encryptedValue = encrypt(data.value);
    const valHash = hashValue(data.value);

    const secret: VaultSecret = {
      id,
      companyId,
      name: data.name,
      category: data.category,
      description: data.description,
      encryptedValue,
      valueHash: valHash,
      assignedBots: [],
      rotation: {
        policy: "manual",
        lastRotated: now,
        history: [],
      },
      expiresAt: data.expiresAt,
      expirationWarningDays: data.expirationWarningDays ?? 14,
      accessLog: [],
      tags: data.tags ?? [],
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy,
    };

    this.secrets.set(id, secret);
    this.logAccess(id, companyId, "created", data.createdBy);
    this.emit("secret_created", { secretId: id, companyId, name: data.name });

    return {
      ...secret,
      encryptedValue: "[REDACTED]",
    };
  }

  updateSecret(
    secretId: string,
    patch: { value?: string; description?: string; tags?: string[] },
  ): VaultSecret {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    if (patch.value !== undefined) {
      secret.encryptedValue = encrypt(patch.value);
      secret.valueHash = hashValue(patch.value);
      // Mark all bot assignments as pending re-push
      for (const assignment of secret.assignedBots) {
        assignment.status = "pending";
      }
    }

    if (patch.description !== undefined) {
      secret.description = patch.description;
    }

    if (patch.tags !== undefined) {
      secret.tags = patch.tags;
    }

    secret.updatedAt = new Date();
    this.logAccess(secretId, secret.companyId, "updated", "system", JSON.stringify(Object.keys(patch)));
    this.emit("secret_updated", { secretId, companyId: secret.companyId });

    return {
      ...secret,
      encryptedValue: "[REDACTED]",
    };
  }

  deleteSecret(secretId: string): void {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    this.logAccess(secretId, secret.companyId, "deleted", "system");
    this.emit("secret_deleted", {
      secretId,
      companyId: secret.companyId,
      name: secret.name,
      assignedBotCount: secret.assignedBots.length,
    });

    this.secrets.delete(secretId);
  }

  listSecrets(companyId: string, filters?: SecretFilters): Omit<VaultSecret, "encryptedValue">[] {
    let results = Array.from(this.secrets.values()).filter(
      (s) => s.companyId === companyId,
    );

    if (filters?.category) {
      results = results.filter((s) => s.category === filters.category);
    }

    if (filters?.tag) {
      results = results.filter((s) => s.tags.includes(filters.tag!));
    }

    // Never return encrypted values
    return results
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((s) => ({
        ...s,
        encryptedValue: "[REDACTED]",
      }));
  }

  // ── Bot Assignment ──────────────────────────────────────────────────────

  assignToBot(
    secretId: string,
    botId: string,
    botName: string,
    configPath: string,
  ): BotAssignment {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    // Prevent duplicate assignment
    const existing = secret.assignedBots.find((a) => a.botId === botId);
    if (existing) {
      throw new Error(`Secret ${secretId} is already assigned to bot ${botId}`);
    }

    const assignment: BotAssignment = {
      botId,
      botName,
      configPath,
      status: "pending",
    };

    secret.assignedBots.push(assignment);
    secret.updatedAt = new Date();

    this.logAccess(secretId, secret.companyId, "assigned_to_bot", "system", `botId=${botId}`);
    this.emit("secret_assigned", { secretId, botId, botName, configPath });

    return assignment;
  }

  unassignFromBot(secretId: string, botId: string): void {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    const idx = secret.assignedBots.findIndex((a) => a.botId === botId);
    if (idx === -1) {
      throw new Error(`Secret ${secretId} is not assigned to bot ${botId}`);
    }

    secret.assignedBots.splice(idx, 1);
    secret.updatedAt = new Date();

    this.logAccess(secretId, secret.companyId, "unassigned_from_bot", "system", `botId=${botId}`);
    this.emit("secret_unassigned", { secretId, botId });
  }

  // ── Push & Verify ──────────────────────────────────────────────────────

  async pushToBot(secretId: string, botId: string): Promise<{ ok: boolean; error?: string }> {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    const assignment = secret.assignedBots.find((a) => a.botId === botId);
    if (!assignment) {
      throw new Error(`Secret ${secretId} is not assigned to bot ${botId}`);
    }

    try {
      const plaintext = decrypt(secret.encryptedValue);
      const monitor = getFleetMonitorService();

      await monitor.rpcForBot(botId, "config.patch", {
        path: assignment.configPath,
        value: plaintext,
      });

      assignment.lastPushed = new Date();
      assignment.status = "pushed";
      secret.updatedAt = new Date();

      this.logAccess(secretId, secret.companyId, "pushed_to_bot", "system", `botId=${botId}`);
      this.emit("secret_pushed", { secretId, botId });

      return { ok: true };
    } catch (err) {
      assignment.status = "error";
      const message = err instanceof Error ? err.message : String(err);
      this.logAccess(secretId, secret.companyId, "push_failed", "system", `botId=${botId} error=${message}`);
      return { ok: false, error: message };
    }
  }

  async pushToAllBots(secretId: string): Promise<{ results: Array<{ botId: string; ok: boolean; error?: string }> }> {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    const results: Array<{ botId: string; ok: boolean; error?: string }> = [];

    for (const assignment of secret.assignedBots) {
      const result = await this.pushToBot(secretId, assignment.botId);
      results.push({ botId: assignment.botId, ...result });
    }

    this.emit("secret_pushed_all", { secretId, results });
    return { results };
  }

  async verifyOnBot(
    secretId: string,
    botId: string,
  ): Promise<{ ok: boolean; inSync: boolean; error?: string }> {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    const assignment = secret.assignedBots.find((a) => a.botId === botId);
    if (!assignment) {
      throw new Error(`Secret ${secretId} is not assigned to bot ${botId}`);
    }

    try {
      const monitor = getFleetMonitorService();

      const result = await monitor.rpcForBot<{ hash?: string }>(
        botId,
        "secrets.resolve",
        { path: assignment.configPath },
      );

      const remoteHash = result?.hash;
      const inSync = remoteHash === secret.valueHash;

      assignment.lastVerified = new Date();
      assignment.status = inSync ? "verified" : "out_of_sync";
      secret.updatedAt = new Date();

      this.logAccess(
        secretId,
        secret.companyId,
        "verified_on_bot",
        "system",
        `botId=${botId} inSync=${inSync}`,
      );
      this.emit("secret_verified", { secretId, botId, inSync });

      return { ok: true, inSync };
    } catch (err) {
      assignment.status = "error";
      const message = err instanceof Error ? err.message : String(err);
      this.logAccess(
        secretId,
        secret.companyId,
        "verify_failed",
        "system",
        `botId=${botId} error=${message}`,
      );
      return { ok: false, inSync: false, error: message };
    }
  }

  async verifyAll(
    companyId: string,
  ): Promise<{ results: Array<{ secretId: string; botId: string; inSync: boolean; error?: string }> }> {
    const companySecrets = Array.from(this.secrets.values()).filter(
      (s) => s.companyId === companyId,
    );

    const results: Array<{ secretId: string; botId: string; inSync: boolean; error?: string }> = [];

    for (const secret of companySecrets) {
      for (const assignment of secret.assignedBots) {
        const result = await this.verifyOnBot(secret.id, assignment.botId);
        results.push({
          secretId: secret.id,
          botId: assignment.botId,
          inSync: result.inSync,
          error: result.error,
        });
      }
    }

    this.emit("secrets_verified_all", { companyId, resultCount: results.length });
    return { results };
  }

  // ── Rotation ───────────────────────────────────────────────────────────

  async rotateSecret(
    secretId: string,
    newValue: string,
    reason: string,
    actor: string,
  ): Promise<{ ok: boolean; pushResults: Array<{ botId: string; ok: boolean; error?: string }> }> {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    const previousHash = secret.valueHash;
    const now = new Date();

    // Encrypt and store the new value
    secret.encryptedValue = encrypt(newValue);
    secret.valueHash = hashValue(newValue);
    secret.updatedAt = now;

    // Record rotation history
    secret.rotation.lastRotated = now;
    secret.rotation.history.push({
      rotatedAt: now,
      reason,
      actor,
      previousValueHash: previousHash,
    });

    // Recalculate next rotation date
    if (secret.rotation.policy === "auto" && secret.rotation.intervalDays) {
      secret.rotation.nextRotation = new Date(
        now.getTime() + secret.rotation.intervalDays * 24 * 60 * 60 * 1000,
      );
    }

    this.logAccess(secretId, secret.companyId, "rotated", actor, reason);
    this.emit("secret_rotated", { secretId, companyId: secret.companyId, actor, reason });

    // Push new value to all assigned bots
    const pushResults: Array<{ botId: string; ok: boolean; error?: string }> = [];
    for (const assignment of secret.assignedBots) {
      const result = await this.pushToBot(secretId, assignment.botId);
      pushResults.push({ botId: assignment.botId, ...result });
    }

    return { ok: true, pushResults };
  }

  setRotationPolicy(
    secretId: string,
    policy: RotationPolicy,
    intervalDays?: number,
  ): void {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    secret.rotation.policy = policy;
    secret.rotation.intervalDays = intervalDays;

    if (policy === "auto" && intervalDays) {
      secret.rotation.nextRotation = new Date(
        secret.rotation.lastRotated.getTime() + intervalDays * 24 * 60 * 60 * 1000,
      );
    } else {
      secret.rotation.nextRotation = undefined;
    }

    secret.updatedAt = new Date();

    this.logAccess(
      secretId,
      secret.companyId,
      "rotation_policy_set",
      "system",
      `policy=${policy} intervalDays=${intervalDays}`,
    );
    this.emit("rotation_policy_changed", { secretId, policy, intervalDays });
  }

  // ── Health Report ──────────────────────────────────────────────────────

  getHealthReport(companyId: string): SecretHealthReport {
    const companySecrets = Array.from(this.secrets.values()).filter(
      (s) => s.companyId === companyId,
    );

    const now = new Date();
    const alerts: SecretHealthAlert[] = [];

    let expiringSoon = 0;
    let expired = 0;
    let neverRotated = 0;
    let outOfSync = 0;
    let overexposed = 0;

    const OVEREXPOSED_THRESHOLD = 10;

    for (const secret of companySecrets) {
      // Check expiration
      if (secret.expiresAt) {
        const msUntilExpiry = secret.expiresAt.getTime() - now.getTime();
        const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);

        if (msUntilExpiry <= 0) {
          expired++;
          alerts.push({
            secretId: secret.id,
            secretName: secret.name,
            type: "expired",
            severity: "critical",
            message: `Secret "${secret.name}" expired on ${secret.expiresAt.toISOString()}`,
          });
        } else if (daysUntilExpiry <= secret.expirationWarningDays) {
          expiringSoon++;
          alerts.push({
            secretId: secret.id,
            secretName: secret.name,
            type: "expiring_soon",
            severity: "high",
            message: `Secret "${secret.name}" expires in ${Math.ceil(daysUntilExpiry)} day(s)`,
          });
        }
      }

      // Check rotation history
      if (secret.rotation.history.length === 0) {
        neverRotated++;
        alerts.push({
          secretId: secret.id,
          secretName: secret.name,
          type: "never_rotated",
          severity: "medium",
          message: `Secret "${secret.name}" has never been rotated since creation`,
        });
      }

      // Check bot sync status
      const outOfSyncBots = secret.assignedBots.filter(
        (a) => a.status === "out_of_sync" || a.status === "error",
      );
      if (outOfSyncBots.length > 0) {
        outOfSync++;
        alerts.push({
          secretId: secret.id,
          secretName: secret.name,
          type: "out_of_sync",
          severity: "high",
          message: `Secret "${secret.name}" is out of sync on ${outOfSyncBots.length} bot(s): ${outOfSyncBots.map((b) => b.botName).join(", ")}`,
        });
      }

      // Check overexposure
      if (secret.assignedBots.length >= OVEREXPOSED_THRESHOLD) {
        overexposed++;
        alerts.push({
          secretId: secret.id,
          secretName: secret.name,
          type: "overexposed",
          severity: "low",
          message: `Secret "${secret.name}" is assigned to ${secret.assignedBots.length} bots (threshold: ${OVEREXPOSED_THRESHOLD})`,
        });
      }
    }

    return {
      companyId,
      generatedAt: now,
      summary: {
        totalSecrets: companySecrets.length,
        expiringSoon,
        expired,
        neverRotated,
        outOfSync,
        overexposed,
      },
      alerts,
    };
  }

  // ── Query ──────────────────────────────────────────────────────────────

  getSecret(secretId: string): VaultSecret | undefined {
    const secret = this.secrets.get(secretId);
    if (!secret) return undefined;
    return { ...secret, encryptedValue: "[REDACTED]" };
  }

  // ── Audit ──────────────────────────────────────────────────────────────

  getAccessLog(secretId: string, since?: Date): AccessLogEntry[] {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret not found: ${secretId}`);

    if (since) {
      return secret.accessLog.filter((e) => e.timestamp.getTime() >= since.getTime());
    }

    return [...secret.accessLog];
  }

  // ── Bulk Operations ────────────────────────────────────────────────────

  async bulkRotate(
    companyId: string,
    filter: BulkRotateFilter,
  ): Promise<{
    rotated: number;
    failed: number;
    results: Array<{ secretId: string; secretName: string; ok: boolean; error?: string }>;
  }> {
    const now = new Date();
    let candidates = Array.from(this.secrets.values()).filter(
      (s) => s.companyId === companyId,
    );

    if (filter.category) {
      candidates = candidates.filter((s) => s.category === filter.category);
    }

    if (filter.olderThanDays) {
      const cutoff = new Date(
        now.getTime() - filter.olderThanDays * 24 * 60 * 60 * 1000,
      );
      candidates = candidates.filter(
        (s) => s.rotation.lastRotated.getTime() < cutoff.getTime(),
      );
    }

    const results: Array<{ secretId: string; secretName: string; ok: boolean; error?: string }> = [];
    let rotated = 0;
    let failed = 0;

    for (const secret of candidates) {
      try {
        // Generate a new random value for bulk rotation
        const newValue = crypto.randomBytes(32).toString("base64url");
        await this.rotateSecret(secret.id, newValue, "bulk_rotation", "system");
        results.push({ secretId: secret.id, secretName: secret.name, ok: true });
        rotated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ secretId: secret.id, secretName: secret.name, ok: false, error: message });
        failed++;
      }
    }

    this.emit("bulk_rotation_completed", { companyId, rotated, failed });
    return { rotated, failed, results };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: FleetSecretsVaultService | null = null;

export function getFleetSecretsVaultService(): FleetSecretsVaultService {
  if (!_instance) {
    _instance = new FleetSecretsVaultService();
  }
  return _instance;
}

export function disposeFleetSecretsVaultService(): void {
  _instance = null;
}
