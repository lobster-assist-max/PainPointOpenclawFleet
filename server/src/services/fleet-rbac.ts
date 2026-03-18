/**
 * Fleet RBAC — Role-Based Access Control for Fleet Dashboard.
 *
 * Maps Fleet roles (viewer/operator/admin) to fine-grained permissions
 * and Gateway operator scopes. Provides Express middleware for route
 * protection and an audit service for logging all actions.
 *
 * Gateway scope mapping:
 *   viewer   → operator.read
 *   operator → operator.read + operator.write
 *   admin    → operator.read + operator.write + operator.admin
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "../middleware/logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export type FleetRole = "viewer" | "operator" | "admin";

export type FleetPermission =
  // Viewer permissions
  | "fleet.dashboard.view"
  | "fleet.bot.status.view"
  | "fleet.bot.sessions.view"
  | "fleet.cost.view"
  | "fleet.report.download"
  | "fleet.graph.view"
  // Operator permissions
  | "fleet.bot.message.send"
  | "fleet.bot.cron.trigger"
  | "fleet.alert.acknowledge"
  | "fleet.runbook.execute"
  | "fleet.tag.manage"
  | "fleet.budget.view"
  // Admin permissions
  | "fleet.bot.connect"
  | "fleet.bot.disconnect"
  | "fleet.bot.config.patch"
  | "fleet.command.batch"
  | "fleet.budget.manage"
  | "fleet.rbac.manage"
  | "fleet.audit.view"
  | "fleet.webhook.manage"
  | "fleet.intelligence.dismiss";

// ─── Permission definitions ─────────────────────────────────────────────────

const VIEWER_PERMISSIONS: FleetPermission[] = [
  "fleet.dashboard.view",
  "fleet.bot.status.view",
  "fleet.bot.sessions.view",
  "fleet.cost.view",
  "fleet.report.download",
  "fleet.graph.view",
];

const OPERATOR_PERMISSIONS: FleetPermission[] = [
  ...VIEWER_PERMISSIONS,
  "fleet.bot.message.send",
  "fleet.bot.cron.trigger",
  "fleet.alert.acknowledge",
  "fleet.runbook.execute",
  "fleet.tag.manage",
  "fleet.budget.view",
];

const ADMIN_PERMISSIONS: FleetPermission[] = [
  ...OPERATOR_PERMISSIONS,
  "fleet.bot.connect",
  "fleet.bot.disconnect",
  "fleet.bot.config.patch",
  "fleet.command.batch",
  "fleet.budget.manage",
  "fleet.rbac.manage",
  "fleet.audit.view",
  "fleet.webhook.manage",
  "fleet.intelligence.dismiss",
];

const ROLE_PERMISSIONS: Record<FleetRole, FleetPermission[]> = {
  viewer: VIEWER_PERMISSIONS,
  operator: OPERATOR_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
};

/**
 * Maps Fleet roles to Gateway operator scopes for connection.
 */
export const ROLE_GATEWAY_SCOPES: Record<FleetRole, string[]> = {
  viewer: ["operator.read"],
  operator: ["operator.read", "operator.write"],
  admin: ["operator.read", "operator.write", "operator.admin"],
};

// ─── RBAC service ───────────────────────────────────────────────────────────

export function hasPermission(
  role: FleetRole,
  permission: FleetPermission,
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: FleetRole): FleetPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function getGatewayScopes(role: FleetRole): string[] {
  return ROLE_GATEWAY_SCOPES[role] ?? ["operator.read"];
}

// ─── Express middleware ─────────────────────────────────────────────────────

/**
 * Express middleware that checks if the current user has the required permission.
 *
 * Expects `req.user.fleetRole` to be set by the auth middleware upstream.
 * Falls back to "viewer" if not set.
 */
export function requirePermission(permission: FleetPermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getFleetRoleFromRequest(req);

    if (hasPermission(role, permission)) {
      next();
    } else {
      logger.warn(
        { userId: getUserIdFromRequest(req), role, permission },
        "[Fleet RBAC] Permission denied",
      );
      res.status(403).json({
        ok: false,
        error: "Forbidden",
        required: permission,
        currentRole: role,
      });
    }
  };
}

/**
 * Extract Fleet role from request.
 * Integration point with Paperclip's auth system.
 */
export function getFleetRoleFromRequest(req: Request): FleetRole {
  // Check header override (for API keys with role)
  const headerRole = req.headers["x-fleet-role"] as string | undefined;
  if (headerRole && isValidRole(headerRole)) return headerRole;

  // Check user session (Paperclip auth)
  const user = (req as any).user;
  if (user?.fleetRole && isValidRole(user.fleetRole)) return user.fleetRole;

  // Default: viewer (safest)
  return "viewer";
}

export function getUserIdFromRequest(req: Request): string {
  return (req as any).user?.id ?? "anonymous";
}

function isValidRole(role: string): role is FleetRole {
  return role === "viewer" || role === "operator" || role === "admin";
}
