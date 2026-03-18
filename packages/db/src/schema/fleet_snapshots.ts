import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  index,
  uniqueIndex,
  bigint,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * Hourly fleet snapshots — captures each bot's state every hour.
 * Used for trend charts, health heatmaps, and anomaly detection baselines.
 * Auto-cleaned after 90 days.
 */
export const fleetSnapshots = pgTable(
  "fleet_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    healthScore: integer("health_score"),
    healthGrade: text("health_grade"),
    connectionState: text("connection_state"),
    inputTokens1h: integer("input_tokens_1h"),
    outputTokens1h: integer("output_tokens_1h"),
    cachedTokens1h: integer("cached_tokens_1h"),
    activeSessions: integer("active_sessions"),
    connectedChannels: integer("connected_channels"),
    totalChannels: integer("total_channels"),
    cronSuccessRate: real("cron_success_rate"),
    avgLatencyMs: integer("avg_latency_ms"),
  },
  (table) => ({
    botTimeIdx: index("fleet_snapshots_bot_time_idx").on(
      table.botId,
      table.capturedAt,
    ),
    companyTimeIdx: index("fleet_snapshots_company_time_idx").on(
      table.companyId,
      table.capturedAt,
    ),
  }),
);

/**
 * Daily fleet summary — aggregated from hourly snapshots.
 * Permanent storage (never auto-cleaned); one row per bot per day.
 * Used for cost forecasting, monthly reports, and long-term trends.
 */
export const fleetDailySummary = pgTable(
  "fleet_daily_summary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    avgHealthScore: real("avg_health_score"),
    minHealthScore: integer("min_health_score"),
    uptimePct: real("uptime_pct"),
    totalInputTokens: bigint("total_input_tokens", { mode: "number" }),
    totalOutputTokens: bigint("total_output_tokens", { mode: "number" }),
    totalCachedTokens: bigint("total_cached_tokens", { mode: "number" }),
    estimatedCostUsd: real("estimated_cost_usd"),
    totalSessions: integer("total_sessions"),
    totalCronRuns: integer("total_cron_runs"),
    cronSuccessRate: real("cron_success_rate"),
  },
  (table) => ({
    botDateIdx: uniqueIndex("fleet_daily_summary_bot_date_idx").on(
      table.botId,
      table.date,
    ),
    companyDateIdx: index("fleet_daily_summary_company_date_idx").on(
      table.companyId,
      table.date,
    ),
  }),
);

/**
 * Fleet alert history — persists fired alerts across server restarts.
 * Tracks the full alert lifecycle: active → acknowledged → resolved.
 */
export const fleetAlertHistory = pgTable(
  "fleet_alert_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    botId: uuid("bot_id").references(() => agents.id, { onDelete: "set null" }),
    ruleId: text("rule_id").notNull(),
    ruleName: text("rule_name").notNull(),
    severity: text("severity").notNull(), // critical, warning, info
    message: text("message").notNull(),
    state: text("state").notNull().default("active"), // active, acknowledged, resolved
    firedAt: timestamp("fired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    metricValue: real("metric_value"),
    thresholdValue: real("threshold_value"),
  },
  (table) => ({
    companyStateIdx: index("fleet_alert_history_company_state_idx").on(
      table.companyId,
      table.state,
    ),
    botIdx: index("fleet_alert_history_bot_idx").on(table.botId),
    firedAtIdx: index("fleet_alert_history_fired_at_idx").on(table.firedAt),
  }),
);
