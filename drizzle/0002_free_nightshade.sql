CREATE TYPE "public"."queue_job_status" AS ENUM('waiting', 'active', 'completed', 'failed', 'paused', 'delayed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."publish_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "marketplace_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "marketplace" NOT NULL,
	"external_user_id" text,
	"nickname" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_type" text NOT NULL,
	"expires_in" integer NOT NULL,
	"scope" text,
	"redirect_uri" text,
	"expires_at" timestamp with time zone NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "publisher_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "publish_platform" NOT NULL,
	"name" varchar(120) NOT NULL,
	"target" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mercado_livre_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "mercado_livre_accounts" CASCADE;--> statement-breakpoint
ALTER TABLE "publish_logs" ADD COLUMN "queue_job_id" varchar(255);--> statement-breakpoint
ALTER TABLE "publish_logs" ADD COLUMN "queue_job_status" "queue_job_status";--> statement-breakpoint
ALTER TABLE "publish_logs" ADD COLUMN "retries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "marketplace_accounts_platform_idx" ON "marketplace_accounts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "marketplace_accounts_external_user_idx" ON "marketplace_accounts" USING btree ("external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_accounts_platform_external_user_uq" ON "marketplace_accounts" USING btree ("platform","external_user_id");--> statement-breakpoint
CREATE INDEX "publisher_channels_type_idx" ON "publisher_channels" USING btree ("type");--> statement-breakpoint
CREATE INDEX "publisher_channels_active_idx" ON "publisher_channels" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "publisher_channels_type_target_uq" ON "publisher_channels" USING btree ("type","target");--> statement-breakpoint
CREATE INDEX "publish_logs_queue_job_id_idx" ON "publish_logs" USING btree ("queue_job_id");