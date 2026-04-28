CREATE TYPE "public"."audit_decision" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."dodo_payment_status" AS ENUM('pending', 'settled', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"hashed_token" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet_id" uuid,
	"session_id" uuid,
	"action" varchar(64) NOT NULL,
	"amount" bigint,
	"recipient_or_url" text,
	"decision" "audit_decision" NOT NULL,
	"reason" text,
	"tx_signature" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dodo_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dodo_session_id" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount_usd" bigint NOT NULL,
	"amount_usdc" bigint NOT NULL,
	"status" "dodo_payment_status" DEFAULT 'pending' NOT NULL,
	"treasury_tx_signature" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "dodo_payments_dodo_session_id_unique" UNIQUE("dodo_session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "off_chain_policies" (
	"wallet_id" uuid PRIMARY KEY NOT NULL,
	"allowed_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_window_start_min" integer DEFAULT 0 NOT NULL,
	"time_window_end_min" integer DEFAULT 1440 NOT NULL,
	"time_window_dow_bitmask" integer DEFAULT 127 NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_url" text NOT NULL,
	"payment_recipient_pubkey" varchar(44) NOT NULL,
	"default_max_per_call" bigint DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_catalog_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"session_pubkey" varchar(44) NOT NULL,
	"encrypted_session_secret" text NOT NULL,
	"label" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_session_pubkey_unique" UNIQUE("session_pubkey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "treasury_disbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dodo_payment_id" uuid NOT NULL,
	"amount_usdc" bigint NOT NULL,
	"tx_signature" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phantom_pubkey" varchar(44) NOT NULL,
	"email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phantom_pubkey_unique" UNIQUE("phantom_pubkey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vault_pda" varchar(44) NOT NULL,
	"usdc_ata" varchar(44) NOT NULL,
	"max_deployed_fraction_bp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_vault_pda_unique" UNIQUE("vault_pda")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dodo_payments" ADD CONSTRAINT "dodo_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dodo_payments" ADD CONSTRAINT "dodo_payments_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "off_chain_policies" ADD CONSTRAINT "off_chain_policies_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treasury_disbursements" ADD CONSTRAINT "treasury_disbursements_dodo_payment_id_dodo_payments_id_fk" FOREIGN KEY ("dodo_payment_id") REFERENCES "public"."dodo_payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
