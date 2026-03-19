-- Cost Optimization — Scan results, findings, and policies for cost autopilot
-- Used by Fleet Cost Optimizer Service (Planning #21)

CREATE TABLE IF NOT EXISTS "optimization_scans" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"            uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "scanned_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "total_findings"        integer NOT NULL DEFAULT 0,
  "total_monthly_waste"   numeric(10,2) NOT NULL DEFAULT 0,
  "automatable_findings"  integer NOT NULL DEFAULT 0,
  "top_waste_category"    text
);

CREATE INDEX IF NOT EXISTS "opt_scans_company_idx"
  ON "optimization_scans" ("company_id", "scanned_at" DESC);

CREATE TABLE IF NOT EXISTS "optimization_findings" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scan_id"           uuid NOT NULL REFERENCES "optimization_scans"("id") ON DELETE CASCADE,
  "company_id"        uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "bot_id"            text NOT NULL,
  "bot_name"          text,
  "type"              text NOT NULL,
  "severity"          text NOT NULL DEFAULT 'medium',
  "description"       text NOT NULL,
  "evidence"          jsonb NOT NULL DEFAULT '{}',
  "recommendation"    jsonb NOT NULL DEFAULT '{}',
  "status"            text NOT NULL DEFAULT 'detected',
  "executed_at"       timestamp with time zone,
  "rollback_info"     jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "opt_findings_scan_idx"
  ON "optimization_findings" ("scan_id");

CREATE INDEX IF NOT EXISTS "opt_findings_company_idx"
  ON "optimization_findings" ("company_id", "status", "severity");

CREATE INDEX IF NOT EXISTS "opt_findings_bot_idx"
  ON "optimization_findings" ("bot_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "optimization_policies" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"        uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name"              text NOT NULL,
  "enabled"           boolean NOT NULL DEFAULT true,
  "rules"             jsonb NOT NULL DEFAULT '[]',
  "schedule"          jsonb NOT NULL DEFAULT '{}',
  "budget"            jsonb NOT NULL DEFAULT '{}',
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "opt_policies_company_idx"
  ON "optimization_policies" ("company_id", "enabled");

-- Savings history for tracking over time
CREATE TABLE IF NOT EXISTS "optimization_savings" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"          uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "finding_id"          uuid REFERENCES "optimization_findings"("id") ON DELETE SET NULL,
  "date"                date NOT NULL,
  "savings_amount"      numeric(10,4) NOT NULL DEFAULT 0,
  "optimization_type"   text NOT NULL,
  "cqi_impact"          numeric(5,2) DEFAULT 0,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "opt_savings_company_date_idx"
  ON "optimization_savings" ("company_id", "date" DESC);
