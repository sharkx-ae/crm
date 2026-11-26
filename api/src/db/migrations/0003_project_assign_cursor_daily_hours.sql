-- 0003 (F4a S3, F2b S4): round-robin cursor per client, and business hours as seven per-day windows.
-- Rows created before this migration hold the F1b shape {days, start, end}; they are converted in place.
ALTER TABLE "projects" ALTER COLUMN "business_hours" SET DEFAULT '[{"day":1,"open":true,"from":"09:00","to":"18:00"},{"day":2,"open":true,"from":"09:00","to":"18:00"},{"day":3,"open":true,"from":"09:00","to":"18:00"},{"day":4,"open":true,"from":"09:00","to":"18:00"},{"day":5,"open":true,"from":"09:00","to":"18:00"},{"day":6,"open":false,"from":"09:00","to":"18:00"},{"day":7,"open":false,"from":"09:00","to":"18:00"}]'::jsonb;--> statement-breakpoint
UPDATE "projects" SET "business_hours" = (
  SELECT jsonb_agg(jsonb_build_object(
    'day', d,
    'open', ("business_hours"->'days') @> to_jsonb(d),
    'from', "business_hours"->>'start',
    'to', "business_hours"->>'end'
  ) ORDER BY d)
  FROM generate_series(1, 7) AS d
) WHERE jsonb_typeof("business_hours") = 'object';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "assign_cursor" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_assign_cursor_users_id_fk" FOREIGN KEY ("assign_cursor") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
