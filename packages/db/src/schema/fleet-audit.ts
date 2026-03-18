import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Fleet audit log — Records all fleet management actions for accountability.
 *
 * Only write operations are logged (read-only operations are not recorded
 * to avoid noise). Entries are auto-cleaned after 90 days.
 */
export const fleetAuditLog = pgTable(
  "fleet_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userRole: text("user_role").notNull(), // viewer, operator, admin
    action: text("action").notNull(), // e.g., "bot.connect", "bot.config.patch"
    targetType: text("target_type").notNull(), // bot, fleet, budget, alert, tag, config, webhook
    targetId: text("target_id"),
    details: jsonb("details"), // Change details (before/after values, etc.)
    result: text("result").notNull(), // success, denied, error
    ipAddress: text("ip_address"),
    rateLimited: boolean("rate_limited").default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyTimeIdx: index("fleet_audit_log_company_time_idx").on(
      table.companyId,
      table.createdAt,
    ),
    userIdx: index("fleet_audit_log_user_idx").on(table.userId),
    actionIdx: index("fleet_audit_log_action_idx").on(table.action),
    targetIdx: index("fleet_audit_log_target_idx").on(
      table.targetType,
      table.targetId,
    ),
  }),
);
