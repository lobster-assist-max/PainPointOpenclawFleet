-- A2A Collaboration Mesh — Bot expertise profiles, routing rules, and collaboration history
-- Used by Fleet A2A Mesh Service (Planning #21)

CREATE TABLE IF NOT EXISTS "bot_expertise" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"      uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "bot_id"          text NOT NULL,
  "domain"          text NOT NULL,
  "confidence"      numeric(3,2) NOT NULL DEFAULT 0,
  "source"          text NOT NULL DEFAULT 'manual',
  "sample_count"    integer NOT NULL DEFAULT 0,
  "avg_satisfaction" numeric(5,2) NOT NULL DEFAULT 0,
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "bot_expertise_unique_idx"
  ON "bot_expertise" ("company_id", "bot_id", "domain");

CREATE INDEX IF NOT EXISTS "bot_expertise_domain_idx"
  ON "bot_expertise" ("company_id", "domain", "confidence" DESC);

-- A2A routing rules
CREATE TABLE IF NOT EXISTS "a2a_routes" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"      uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name"            text NOT NULL,
  "description"     text,
  "trigger_type"    text NOT NULL,
  "trigger_condition" jsonb NOT NULL DEFAULT '{}',
  "routing_strategy" text NOT NULL DEFAULT 'best_match',
  "routing_config"  jsonb NOT NULL DEFAULT '{}',
  "mode"            text NOT NULL DEFAULT 'transparent',
  "enabled"         boolean NOT NULL DEFAULT true,
  "priority"        integer NOT NULL DEFAULT 0,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "a2a_routes_company_idx"
  ON "a2a_routes" ("company_id", "enabled", "priority" DESC);

-- A2A collaboration history
CREATE TABLE IF NOT EXISTS "a2a_collaborations" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"          uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "route_id"            uuid REFERENCES "a2a_routes"("id") ON DELETE SET NULL,
  "origin_bot_id"       text NOT NULL,
  "origin_session_key"  text,
  "target_bot_id"       text NOT NULL,
  "status"              text NOT NULL DEFAULT 'in_progress',
  "mode"                text NOT NULL DEFAULT 'transparent',
  "detected_topic"      text,
  "origin_confidence"   numeric(3,2),
  "target_response_time_ms" integer,
  "user_satisfaction"   integer,
  "resolved_by_target"  boolean,
  "trace"               jsonb NOT NULL DEFAULT '[]',
  "initiated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at"        timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "a2a_collab_company_idx"
  ON "a2a_collaborations" ("company_id", "initiated_at" DESC);

CREATE INDEX IF NOT EXISTS "a2a_collab_origin_idx"
  ON "a2a_collaborations" ("origin_bot_id", "initiated_at" DESC);

CREATE INDEX IF NOT EXISTS "a2a_collab_target_idx"
  ON "a2a_collaborations" ("target_bot_id", "initiated_at" DESC);
