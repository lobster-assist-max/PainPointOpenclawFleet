-- Conversation Analytics — Stores NLP analysis results for bot conversations
-- Used by Fleet Conversation Analytics Engine (Planning #21)

CREATE TABLE IF NOT EXISTS "conversation_analyses" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"          uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "bot_id"              text NOT NULL,
  "session_key"         text NOT NULL,
  "analyzed_at"         timestamp with time zone NOT NULL DEFAULT now(),

  -- Topic detection
  "topics"              jsonb NOT NULL DEFAULT '[]',

  -- Sentiment tracking
  "sentiment_overall"   text NOT NULL DEFAULT 'neutral',
  "sentiment_trajectory" text NOT NULL DEFAULT 'stable',
  "satisfaction_score"  integer NOT NULL DEFAULT 50,

  -- Resolution scoring
  "resolution_status"   text NOT NULL DEFAULT 'unresolved',
  "turn_count"          integer NOT NULL DEFAULT 0,
  "cost_per_resolution" numeric(10,4) DEFAULT 0,

  -- Knowledge gaps (array of gap objects)
  "knowledge_gaps"      jsonb NOT NULL DEFAULT '[]',

  -- Escalation info
  "escalation_occurred" boolean NOT NULL DEFAULT false,
  "escalation_reason"   text,

  -- Full analysis blob for detailed drill-down
  "analysis_data"       jsonb
);

CREATE INDEX IF NOT EXISTS "conv_analyses_company_idx"
  ON "conversation_analyses" ("company_id", "analyzed_at" DESC);

CREATE INDEX IF NOT EXISTS "conv_analyses_bot_idx"
  ON "conversation_analyses" ("bot_id", "analyzed_at" DESC);

CREATE INDEX IF NOT EXISTS "conv_analyses_session_idx"
  ON "conversation_analyses" ("session_key");

CREATE INDEX IF NOT EXISTS "conv_analyses_satisfaction_idx"
  ON "conversation_analyses" ("company_id", "satisfaction_score");

-- Topic clusters — aggregated topic data across the fleet
CREATE TABLE IF NOT EXISTS "topic_clusters" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"            uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "label"                 text NOT NULL,
  "category"              text NOT NULL,
  "conversation_count"    integer NOT NULL DEFAULT 0,
  "avg_satisfaction"      numeric(5,2) NOT NULL DEFAULT 0,
  "avg_resolution_rate"   numeric(5,4) NOT NULL DEFAULT 0,
  "avg_cost_per_resolution" numeric(10,4) NOT NULL DEFAULT 0,
  "trend"                 text NOT NULL DEFAULT 'stable',
  "period_start"          timestamp with time zone NOT NULL,
  "period_end"            timestamp with time zone NOT NULL,
  "top_bots"              jsonb NOT NULL DEFAULT '[]',
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "topic_clusters_company_idx"
  ON "topic_clusters" ("company_id", "period_end" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "topic_clusters_unique_idx"
  ON "topic_clusters" ("company_id", "label", "period_start");

-- Knowledge gaps — fleet-wide gap tracking
CREATE TABLE IF NOT EXISTS "knowledge_gaps" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"            uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "topic"                 text NOT NULL,
  "frequency"             integer NOT NULL DEFAULT 1,
  "affected_bots"         jsonb NOT NULL DEFAULT '[]',
  "sample_questions"      jsonb NOT NULL DEFAULT '[]',
  "suggested_training"    text,
  "priority"              text NOT NULL DEFAULT 'medium',
  "estimated_impact"      jsonb,
  "status"                text NOT NULL DEFAULT 'open',
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "knowledge_gaps_company_idx"
  ON "knowledge_gaps" ("company_id", "priority", "frequency" DESC);
