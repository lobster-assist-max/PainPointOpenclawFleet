import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * Fleet bot profiles — extended metadata for bots managed by Fleet.
 *
 * Stores Fleet-specific fields (role, avatar, skills, budget) that
 * don't belong in the core `agents` table. One row per bot.
 */
export const fleetBotProfiles = pgTable(
  "fleet_bot_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    roleId: text("role_id"),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    skills: jsonb("skills").$type<string[]>().default([]),
    contextMaxTokens: integer("context_max_tokens"),
    monthBudgetUsd: real("month_budget_usd"),
    gatewayUrl: text("gateway_url"),
    gatewayVersion: text("gateway_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    botIdx: uniqueIndex("fleet_bot_profiles_bot_idx").on(table.botId),
    companyIdx: index("fleet_bot_profiles_company_idx").on(table.companyId),
    roleIdx: index("fleet_bot_profiles_role_idx").on(table.roleId),
  }),
);
