-- Fleet Bot Profiles — Extended metadata for Fleet-managed bots
-- One row per bot; stores role, avatar, skills, budget, gateway info

CREATE TABLE IF NOT EXISTS "fleet_bot_profiles" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bot_id"              uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "company_id"          uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "role_id"             text,
  "description"         text,
  "avatar_url"          text,
  "skills"              jsonb DEFAULT '[]'::jsonb,
  "context_max_tokens"  integer,
  "month_budget_usd"    real,
  "gateway_url"         text,
  "gateway_version"     text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fleet_bot_profiles_bot_idx" ON "fleet_bot_profiles" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fleet_bot_profiles_company_idx" ON "fleet_bot_profiles" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fleet_bot_profiles_role_idx" ON "fleet_bot_profiles" ("role_id");
