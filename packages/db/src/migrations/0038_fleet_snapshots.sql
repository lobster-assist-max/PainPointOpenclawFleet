CREATE TABLE "fleet_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"health_score" integer,
	"health_grade" text,
	"connection_state" text,
	"input_tokens_1h" integer,
	"output_tokens_1h" integer,
	"cached_tokens_1h" integer,
	"active_sessions" integer,
	"connected_channels" integer,
	"total_channels" integer,
	"cron_success_rate" real,
	"avg_latency_ms" integer
);
--> statement-breakpoint
CREATE TABLE "fleet_daily_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"date" text NOT NULL,
	"avg_health_score" real,
	"min_health_score" integer,
	"uptime_pct" real,
	"total_input_tokens" bigint,
	"total_output_tokens" bigint,
	"total_cached_tokens" bigint,
	"estimated_cost_usd" real,
	"total_sessions" integer,
	"total_cron_runs" integer,
	"cron_success_rate" real
);
--> statement-breakpoint
CREATE TABLE "fleet_alert_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bot_id" uuid,
	"rule_id" text NOT NULL,
	"rule_name" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"metric_value" real,
	"threshold_value" real
);
--> statement-breakpoint
ALTER TABLE "fleet_snapshots" ADD CONSTRAINT "fleet_snapshots_bot_id_agents_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_snapshots" ADD CONSTRAINT "fleet_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_daily_summary" ADD CONSTRAINT "fleet_daily_summary_bot_id_agents_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_daily_summary" ADD CONSTRAINT "fleet_daily_summary_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_alert_history" ADD CONSTRAINT "fleet_alert_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_alert_history" ADD CONSTRAINT "fleet_alert_history_bot_id_agents_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fleet_snapshots_bot_time_idx" ON "fleet_snapshots" USING btree ("bot_id","captured_at");--> statement-breakpoint
CREATE INDEX "fleet_snapshots_company_time_idx" ON "fleet_snapshots" USING btree ("company_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_daily_summary_bot_date_idx" ON "fleet_daily_summary" USING btree ("bot_id","date");--> statement-breakpoint
CREATE INDEX "fleet_daily_summary_company_date_idx" ON "fleet_daily_summary" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "fleet_alert_history_company_state_idx" ON "fleet_alert_history" USING btree ("company_id","state");--> statement-breakpoint
CREATE INDEX "fleet_alert_history_bot_idx" ON "fleet_alert_history" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "fleet_alert_history_fired_at_idx" ON "fleet_alert_history" USING btree ("fired_at");
