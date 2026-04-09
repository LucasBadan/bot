CREATE TABLE "mercado_livre_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ml_user_id" text,
	"nickname" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_type" text NOT NULL,
	"expires_in" integer NOT NULL,
	"scope" text,
	"redirect_uri" text,
	"expires_at" timestamp with time zone NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
