CREATE TYPE "public"."coupon_status" AS ENUM('active', 'expired', 'used', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('pending', 'approved', 'rejected', 'posted');--> statement-breakpoint
CREATE TYPE "public"."marketplace" AS ENUM('amazon', 'shopee', 'mercado_livre', 'aliexpress', 'other');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'ready', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."publish_platform" AS ENUM('telegram', 'whatsapp', 'discord', 'twitter', 'instagram', 'other');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rule_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'inactive', 'blocked', 'archived');--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_source_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"affiliate_program" varchar(120),
	"original_url" text NOT NULL,
	"affiliate_url" text NOT NULL,
	"campaign_tag" varchar(120),
	"is_active" boolean DEFAULT true NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_source_id" uuid NOT NULL,
	"code" varchar(120),
	"title" varchar(180),
	"description" text,
	"discount_type" varchar(50),
	"discount_value" numeric(12, 2),
	"minimum_order_value" numeric(12, 2),
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" "coupon_status" DEFAULT 'active' NOT NULL,
	"source_label" varchar(120),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"product_source_id" uuid NOT NULL,
	"coupon_id" uuid,
	"affiliate_link_id" uuid,
	"matched_rule_id" uuid,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_price" numeric(12, 2),
	"current_price" numeric(12, 2) NOT NULL,
	"list_price" numeric(12, 2),
	"discount_percent" numeric(5, 2),
	"discount_amount" numeric(12, 2),
	"final_price_with_coupon" numeric(12, 2),
	"headline" varchar(255),
	"reasoning" text,
	"score" numeric(6, 2),
	"image_url" text,
	"status" "deal_status" DEFAULT 'pending' NOT NULL,
	"ai_input" jsonb,
	"ai_summary" text,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"category_id" uuid,
	"marketplace" "marketplace",
	"min_discount_percent" numeric(5, 2),
	"min_discount_amount" numeric(12, 2),
	"max_price" numeric(12, 2),
	"require_coupon" boolean DEFAULT false NOT NULL,
	"require_lowest_in_period" boolean DEFAULT false NOT NULL,
	"lookback_days" integer DEFAULT 30,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"status" "rule_status" DEFAULT 'active' NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_candidate_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"caption" text NOT NULL,
	"call_to_action" varchar(255),
	"hashtags" text[],
	"image_url" text,
	"image_prompt" text,
	"model_name" varchar(120),
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"metadata" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_source_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"list_price" numeric(12, 2),
	"shipping_price" numeric(12, 2),
	"currency" varchar(10) DEFAULT 'BRL' NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"installment_info" varchar(255),
	"coupon_text_snapshot" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"external_product_id" varchar(180),
	"title_on_store" varchar(255) NOT NULL,
	"source_url" text NOT NULL,
	"canonical_url" text,
	"image_url" text,
	"seller_name" varchar(180),
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"is_monitored" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_price" numeric(12, 2),
	"last_price_old" numeric(12, 2),
	"currency" varchar(10) DEFAULT 'BRL' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(280) NOT NULL,
	"brand" varchar(120),
	"model" varchar(120),
	"description" text,
	"keywords" text[],
	"default_image_url" text,
	"is_tracked" boolean DEFAULT true NOT NULL,
	"is_approved" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_post_id" uuid NOT NULL,
	"platform" "publish_platform" NOT NULL,
	"destination" varchar(255),
	"external_post_id" varchar(255),
	"published_url" text,
	"status" "publish_status" DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"payload" jsonb,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_product_source_id_product_sources_id_fk" FOREIGN KEY ("product_source_id") REFERENCES "public"."product_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_product_source_id_product_sources_id_fk" FOREIGN KEY ("product_source_id") REFERENCES "public"."product_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_candidates" ADD CONSTRAINT "deal_candidates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_candidates" ADD CONSTRAINT "deal_candidates_product_source_id_product_sources_id_fk" FOREIGN KEY ("product_source_id") REFERENCES "public"."product_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_candidates" ADD CONSTRAINT "deal_candidates_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_candidates" ADD CONSTRAINT "deal_candidates_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_candidates" ADD CONSTRAINT "deal_candidates_matched_rule_id_deal_rules_id_fk" FOREIGN KEY ("matched_rule_id") REFERENCES "public"."deal_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_rules" ADD CONSTRAINT "deal_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_posts" ADD CONSTRAINT "generated_posts_deal_candidate_id_deal_candidates_id_fk" FOREIGN KEY ("deal_candidate_id") REFERENCES "public"."deal_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_source_id_product_sources_id_fk" FOREIGN KEY ("product_source_id") REFERENCES "public"."product_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_logs" ADD CONSTRAINT "publish_logs_generated_post_id_generated_posts_id_fk" FOREIGN KEY ("generated_post_id") REFERENCES "public"."generated_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_links_source_idx" ON "affiliate_links" USING btree ("product_source_id");--> statement-breakpoint
CREATE INDEX "affiliate_links_marketplace_idx" ON "affiliate_links" USING btree ("marketplace");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_uq" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "coupons_source_idx" ON "coupons" USING btree ("product_source_id");--> statement-breakpoint
CREATE INDEX "coupons_status_idx" ON "coupons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deal_candidates_product_idx" ON "deal_candidates" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "deal_candidates_source_idx" ON "deal_candidates" USING btree ("product_source_id");--> statement-breakpoint
CREATE INDEX "deal_candidates_status_idx" ON "deal_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deal_candidates_detected_at_idx" ON "deal_candidates" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "deal_rules_category_idx" ON "deal_rules" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "deal_rules_status_idx" ON "deal_rules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "generated_posts_deal_idx" ON "generated_posts" USING btree ("deal_candidate_id");--> statement-breakpoint
CREATE INDEX "generated_posts_status_idx" ON "generated_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "price_history_source_idx" ON "price_history" USING btree ("product_source_id");--> statement-breakpoint
CREATE INDEX "price_history_captured_at_idx" ON "price_history" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "product_sources_product_idx" ON "product_sources" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_sources_marketplace_idx" ON "product_sources" USING btree ("marketplace");--> statement-breakpoint
CREATE UNIQUE INDEX "product_sources_source_url_uq" ON "product_sources" USING btree ("source_url");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uq" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "publish_logs_generated_post_idx" ON "publish_logs" USING btree ("generated_post_id");--> statement-breakpoint
CREATE INDEX "publish_logs_platform_idx" ON "publish_logs" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "publish_logs_status_idx" ON "publish_logs" USING btree ("status");