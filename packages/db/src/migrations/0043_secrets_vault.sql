-- Fleet Secrets Vault — Centralized secret management with rotation and audit
-- Used by Fleet Secrets Vault Service (Planning #21)

CREATE TABLE IF NOT EXISTS "vault_secrets" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"              uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name"                    text NOT NULL,
  "category"                text NOT NULL DEFAULT 'custom',
  "description"             text,
  "encrypted_value"         text NOT NULL,
  "value_hash"              text NOT NULL,
  "rotation_policy"         text NOT NULL DEFAULT 'manual',
  "rotation_interval_days"  integer,
  "last_rotated"            timestamp with time zone NOT NULL DEFAULT now(),
  "next_rotation"           timestamp with time zone,
  "expires_at"              timestamp with time zone,
  "expiration_warning_days" integer NOT NULL DEFAULT 7,
  "tags"                    jsonb NOT NULL DEFAULT '[]',
  "created_by"              text NOT NULL,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vault_secrets_name_idx"
  ON "vault_secrets" ("company_id", "name");

CREATE INDEX IF NOT EXISTS "vault_secrets_category_idx"
  ON "vault_secrets" ("company_id", "category");

CREATE INDEX IF NOT EXISTS "vault_secrets_expiry_idx"
  ON "vault_secrets" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

-- Secret assignments to bots
CREATE TABLE IF NOT EXISTS "vault_assignments" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "secret_id"       uuid NOT NULL REFERENCES "vault_secrets"("id") ON DELETE CASCADE,
  "company_id"      uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "bot_id"          text NOT NULL,
  "bot_name"        text,
  "config_path"     text NOT NULL,
  "last_pushed"     timestamp with time zone,
  "last_verified"   timestamp with time zone,
  "status"          text NOT NULL DEFAULT 'unknown',
  "created_at"      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vault_assign_unique_idx"
  ON "vault_assignments" ("secret_id", "bot_id");

CREATE INDEX IF NOT EXISTS "vault_assign_bot_idx"
  ON "vault_assignments" ("bot_id");

-- Secret access audit log
CREATE TABLE IF NOT EXISTS "vault_access_log" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "secret_id"   uuid NOT NULL REFERENCES "vault_secrets"("id") ON DELETE CASCADE,
  "company_id"  uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "action"      text NOT NULL,
  "actor"       text NOT NULL,
  "bot_id"      text,
  "ip_address"  text,
  "details"     text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vault_access_log_secret_idx"
  ON "vault_access_log" ("secret_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "vault_access_log_company_idx"
  ON "vault_access_log" ("company_id", "created_at" DESC);

-- Rotation history
CREATE TABLE IF NOT EXISTS "vault_rotation_history" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "secret_id"         uuid NOT NULL REFERENCES "vault_secrets"("id") ON DELETE CASCADE,
  "company_id"        uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "rotated_by"        text NOT NULL,
  "reason"            text NOT NULL DEFAULT 'manual',
  "affected_bots"     integer NOT NULL DEFAULT 0,
  "successful_pushes" integer NOT NULL DEFAULT 0,
  "failed_pushes"     integer NOT NULL DEFAULT 0,
  "rotated_at"        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vault_rotation_secret_idx"
  ON "vault_rotation_history" ("secret_id", "rotated_at" DESC);
