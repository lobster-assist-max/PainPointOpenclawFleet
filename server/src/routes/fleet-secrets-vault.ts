/**
 * Fleet Secrets Vault API Routes
 *
 * Endpoints for centralized secret management — creating, assigning,
 * pushing, verifying, rotating, and auditing secrets across the fleet.
 */

import { Router, type Request, type Response } from "express";
import {
  getFleetSecretsVaultService,
  type FleetSecretsVaultService,
  type VaultSecret,
  type SecretCategory,
  type RotationPolicy,
  type BulkRotateFilter,
} from "../services/fleet-secrets-vault.js";

const VALID_SECRET_CATEGORIES: SecretCategory[] = [
  "api_key",
  "oauth_token",
  "password",
  "certificate",
  "webhook_secret",
  "custom",
];

/**
 * Resolve a secret by id and verify the caller owns it.
 *
 * Secrets are credential material, so every by-id route (patch/delete/assign/
 * push/verify/rotate/rotation-policy/audit) MUST confirm the request's
 * `?companyId=` matches the secret's owning company — otherwise any company
 * could read, overwrite, rotate, or push another tenant's secret just by
 * knowing (or guessing) its id. Returns the secret, or null after writing a
 * 404 response. Reports 404 (never 403) so we never leak the existence of
 * another tenant's secret. A caller with no `?companyId=` (legacy/admin)
 * proceeds for backward compatibility.
 */
function resolveOwnedSecret(
  vault: FleetSecretsVaultService,
  req: Request,
  res: Response,
  secretId: string,
): VaultSecret | null {
  const secret = vault.getSecret(secretId);
  if (!secret) {
    res.status(404).json({ ok: false, error: `Secret not found: ${secretId}` });
    return null;
  }
  const requestCompanyId =
    typeof req.query.companyId === "string" && req.query.companyId
      ? req.query.companyId
      : undefined;
  if (requestCompanyId && secret.companyId !== requestCompanyId) {
    res.status(404).json({ ok: false, error: `Secret not found: ${secretId}` });
    return null;
  }
  return secret;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function fleetSecretsVaultRoutes(): Router {
  const router = Router();

  // ── Secret CRUD ─────────────────────────────────────────────────────────

  /**
   * GET /secrets/:companyId
   * List secrets for a company. Never returns decrypted or encrypted values.
   * Query: ?category=api_key&tag=production
   */
  router.get("/secrets/:companyId", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { companyId } = req.params;
      // listSecrets filters s.category === category, so an invalid ?category=garbage
      // passes the truthy check, matches nothing, and returns an empty list with
      // HTTP 200 instead of signalling bad input.
      const category = req.query.category as SecretCategory | undefined;
      if (category !== undefined && !VALID_SECRET_CATEGORIES.includes(category)) {
        return res.status(400).json({
          ok: false,
          error: `category must be one of: ${VALID_SECRET_CATEGORIES.join(", ")}`,
        });
      }
      const tag = req.query.tag as string | undefined;

      const secrets = vault.listSecrets(companyId, { category, tag });
      res.json({ ok: true, secrets });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /secrets
   * Create a new secret.
   * Body: { companyId, name, category, value, description?, tags?, createdBy }
   */
  router.post("/secrets", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { companyId, name, category, value, description, tags, createdBy } =
        req.body ?? {};

      if (!companyId || typeof companyId !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: companyId" });
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: name" });
        return;
      }
      if (!category || typeof category !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: category" });
        return;
      }
      if (!value || typeof value !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: value" });
        return;
      }
      if (!createdBy || typeof createdBy !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: createdBy" });
        return;
      }

      const secret = vault.createSecret(companyId, {
        name,
        category: category as SecretCategory,
        value,
        description,
        tags,
        createdBy,
      });

      res.status(201).json({ ok: true, secret });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * PATCH /secrets/:secretId
   * Update a secret's value, description, or tags.
   * Body: { value?, description?, tags? }
   */
  router.patch("/secrets/:secretId", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { secretId } = req.params;
      if (!resolveOwnedSecret(vault, req, res, secretId)) return;
      const { value, description, tags } = req.body ?? {};

      if (value !== undefined && typeof value !== "string") {
        res.status(400).json({ ok: false, error: "Invalid field: value (must be a string)" });
        return;
      }
      if (description !== undefined && typeof description !== "string") {
        res.status(400).json({ ok: false, error: "Invalid field: description (must be a string)" });
        return;
      }
      if (tags !== undefined && !Array.isArray(tags)) {
        res.status(400).json({ ok: false, error: "Invalid field: tags (must be an array)" });
        return;
      }
      if (value === undefined && description === undefined && tags === undefined) {
        res.status(400).json({ ok: false, error: "At least one field must be provided: value, description, or tags" });
        return;
      }

      const secret = vault.updateSecret(secretId, { value, description, tags });
      res.json({ ok: true, secret });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /secrets/:secretId
   * Delete a secret and all its bot assignments.
   */
  router.delete("/secrets/:secretId", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      if (!resolveOwnedSecret(vault, req, res, req.params.secretId)) return;
      vault.deleteSecret(req.params.secretId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  // ── Bot Assignment ──────────────────────────────────────────────────────

  /**
   * POST /secrets/:secretId/assign
   * Assign a secret to a bot.
   * Body: { botId, botName, configPath }
   */
  router.post("/secrets/:secretId/assign", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { secretId } = req.params;
      if (!resolveOwnedSecret(vault, req, res, secretId)) return;
      const { botId, botName, configPath } = req.body ?? {};

      if (!botId || typeof botId !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: botId" });
        return;
      }
      if (!botName || typeof botName !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: botName" });
        return;
      }
      if (!configPath || typeof configPath !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: configPath" });
        return;
      }

      const assignment = vault.assignToBot(secretId, botId, botName, configPath);
      res.status(201).json({ ok: true, assignment });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : message.includes("already assigned") ? 409 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  /**
   * DELETE /secrets/:secretId/assign/:botId
   * Unassign a secret from a bot.
   */
  router.delete("/secrets/:secretId/assign/:botId", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      if (!resolveOwnedSecret(vault, req, res, req.params.secretId)) return;
      vault.unassignFromBot(req.params.secretId, req.params.botId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") || message.includes("not assigned") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  // ── Push & Verify ──────────────────────────────────────────────────────

  /**
   * POST /secrets/:secretId/push/:botId
   * Push a secret to a specific bot via gateway RPC.
   */
  router.post("/secrets/:secretId/push/:botId", async (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      if (!resolveOwnedSecret(vault, req, res, req.params.secretId)) return;
      const result = await vault.pushToBot(req.params.secretId, req.params.botId);
      const status = result.ok ? 200 : 502;
      res.status(status).json({ ok: result.ok, error: result.error });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") || message.includes("not assigned") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  /**
   * POST /secrets/:secretId/push-all
   * Push a secret to all assigned bots.
   */
  router.post("/secrets/:secretId/push-all", async (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      if (!resolveOwnedSecret(vault, req, res, req.params.secretId)) return;
      const { results } = await vault.pushToAllBots(req.params.secretId);
      res.json({ ok: true, results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  /**
   * POST /secrets/:secretId/verify/:botId
   * Verify a secret's sync status on a specific bot.
   */
  router.post("/secrets/:secretId/verify/:botId", async (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      if (!resolveOwnedSecret(vault, req, res, req.params.secretId)) return;
      const result = await vault.verifyOnBot(req.params.secretId, req.params.botId);
      res.json({ ok: result.ok, inSync: result.inSync, error: result.error });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") || message.includes("not assigned") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  /**
   * POST /secrets/:secretId/verify-all
   * Verify a secret on all assigned bots.
   */
  router.post("/secrets/:secretId/verify-all", async (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { secretId } = req.params;

      const secret = resolveOwnedSecret(vault, req, res, secretId);
      if (!secret) return;

      const results: Array<{ botId: string; inSync: boolean; error?: string }> = [];

      for (const assignment of secret.assignedBots) {
        const result = await vault.verifyOnBot(secretId, assignment.botId);
        results.push({
          botId: assignment.botId,
          inSync: result.inSync,
          error: result.error,
        });
      }

      res.json({ ok: true, results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ── Rotation ───────────────────────────────────────────────────────────

  /**
   * POST /secrets/:secretId/rotate
   * Rotate a secret with a new value.
   * Body: { newValue, reason, actor }
   */
  router.post("/secrets/:secretId/rotate", async (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { secretId } = req.params;
      if (!resolveOwnedSecret(vault, req, res, secretId)) return;
      const { newValue, reason, actor } = req.body ?? {};

      if (!newValue || typeof newValue !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: newValue" });
        return;
      }
      if (!reason || typeof reason !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: reason" });
        return;
      }
      if (!actor || typeof actor !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: actor" });
        return;
      }

      const result = await vault.rotateSecret(secretId, newValue, reason, actor);
      res.json({ ok: true, pushResults: result.pushResults });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  /**
   * PUT /secrets/:secretId/rotation-policy
   * Set the rotation policy for a secret.
   * Body: { policy, intervalDays? }
   */
  router.put("/secrets/:secretId/rotation-policy", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { secretId } = req.params;
      if (!resolveOwnedSecret(vault, req, res, secretId)) return;
      const { policy, intervalDays } = req.body ?? {};

      if (!policy || !["manual", "auto"].includes(policy)) {
        res.status(400).json({
          ok: false,
          error: "Missing or invalid field: policy (must be 'manual' or 'auto')",
        });
        return;
      }

      if (policy === "auto" && (!intervalDays || typeof intervalDays !== "number" || intervalDays < 1)) {
        res.status(400).json({
          ok: false,
          error: "Auto rotation requires intervalDays as a positive number",
        });
        return;
      }

      vault.setRotationPolicy(secretId, policy as RotationPolicy, intervalDays);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  // ── Health & Audit ─────────────────────────────────────────────────────

  /**
   * GET /health/:companyId
   * Get a health report for all secrets belonging to a company.
   */
  router.get("/health/:companyId", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const report = vault.getHealthReport(req.params.companyId);
      res.json({ ok: true, report });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * GET /audit/:secretId
   * Get the access log for a specific secret.
   * Query: ?since=2025-01-01T00:00:00Z
   */
  router.get("/audit/:secretId", (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      if (!resolveOwnedSecret(vault, req, res, req.params.secretId)) return;
      let since: Date | undefined;
      if (req.query.since) {
        since = new Date(req.query.since as string);
        // An Invalid Date silently filters out every entry downstream
        // (getAccessLog compares timestamp.getTime() >= since.getTime(),
        // and NaN comparisons are always false) — reject it as a 400 instead.
        if (isNaN(since.getTime())) {
          res
            .status(400)
            .json({ ok: false, error: "since must be a valid date" });
          return;
        }
      }

      const log = vault.getAccessLog(req.params.secretId, since);
      res.json({ ok: true, log });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  // ── Bulk Operations ────────────────────────────────────────────────────

  /**
   * POST /bulk-rotate
   * Rotate multiple secrets matching filter criteria.
   * Body: { companyId, filter: { category?, olderThanDays? } }
   */
  router.post("/bulk-rotate", async (req, res) => {
    try {
      const vault = getFleetSecretsVaultService();
      const { companyId, filter } = req.body ?? {};

      if (!companyId || typeof companyId !== "string") {
        res.status(400).json({ ok: false, error: "Missing required field: companyId" });
        return;
      }

      const bulkFilter: BulkRotateFilter = {
        category: filter?.category,
        olderThanDays: filter?.olderThanDays,
      };

      const result = await vault.bulkRotate(companyId, bulkFilter);
      res.json({
        ok: true,
        rotated: result.rotated,
        failed: result.failed,
        results: result.results,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
