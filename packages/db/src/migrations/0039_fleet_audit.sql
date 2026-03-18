-- Fleet Audit Log — Records all fleet management write operations
-- Auto-cleaned after 90 days by the Fleet Snapshot Cron service

CREATE TABLE IF NOT EXISTS "fleet_audit_log" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"    uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id"       text NOT NULL,
  "user_role"     text NOT NULL,
  "action"        text NOT NULL,
  "target_type"   text NOT NULL,
  "target_id"     text,
  "details"       jsonb,
  "result"        text NOT NULL,
  "ip_address"    text,
  "rate_limited"  boolean DEFAULT false,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fleet_audit_log_company_time_idx"
  ON "fleet_audit_log" ("company_id", "created_at");

CREATE INDEX IF NOT EXISTS "fleet_audit_log_user_idx"
  ON "fleet_audit_log" ("user_id");

CREATE INDEX IF NOT EXISTS "fleet_audit_log_action_idx"
  ON "fleet_audit_log" ("action");

CREATE INDEX IF NOT EXISTS "fleet_audit_log_target_idx"
  ON "fleet_audit_log" ("target_type", "target_id");
