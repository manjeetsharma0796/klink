ALTER TABLE "audit_log" ADD COLUMN "dodo_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "dodo_payments" ADD COLUMN "payment_id" varchar(100);--> statement-breakpoint
ALTER TABLE "dodo_payments" ADD COLUMN "invoice_id" varchar(100);--> statement-breakpoint
ALTER TABLE "dodo_payments" ADD COLUMN "invoice_url" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_dodo_payment_id_dodo_payments_id_fk" FOREIGN KEY ("dodo_payment_id") REFERENCES "public"."dodo_payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
