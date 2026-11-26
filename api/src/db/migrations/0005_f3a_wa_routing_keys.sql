-- F3a: routing keys on wa_numbers, one token row per WABA. Rows written before this (demo seed data on local and staging;
-- nothing real writes these tables before F3a) get unique placeholder values first, so SET NOT NULL cannot fail.
UPDATE "wa_numbers" SET "phone_number_id" = 'legacy-' || "id"::text WHERE "phone_number_id" IS NULL;--> statement-breakpoint
UPDATE "wa_numbers" SET "waba_id" = 'legacy-' || "id"::text WHERE "waba_id" IS NULL;--> statement-breakpoint
ALTER TABLE "wa_numbers" ALTER COLUMN "phone_number_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wa_numbers" ALTER COLUMN "waba_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD COLUMN "account_ref" text;--> statement-breakpoint
UPDATE "integration_tokens" SET "account_ref" = 'legacy-' || "id"::text WHERE "account_ref" IS NULL;--> statement-breakpoint
ALTER TABLE "integration_tokens" ALTER COLUMN "account_ref" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wa_numbers" ADD COLUMN "onboarded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "wa_numbers_waba_idx" ON "wa_numbers" USING btree ("waba_id");--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_integration_account" UNIQUE("integration_id","account_ref");--> statement-breakpoint
ALTER TABLE "wa_numbers" ADD CONSTRAINT "wa_numbers_phone_number_id_unique" UNIQUE("phone_number_id");
