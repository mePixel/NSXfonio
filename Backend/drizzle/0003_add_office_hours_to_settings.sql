ALTER TABLE "appointment_settings" ADD COLUMN IF NOT EXISTS "office_hours_start" text DEFAULT '08:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "appointment_settings" ADD COLUMN IF NOT EXISTS "office_hours_end" text DEFAULT '17:00' NOT NULL;
