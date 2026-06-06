CREATE TABLE IF NOT EXISTS "appointment_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"time_slot_size" integer NOT NULL,
	"working_days" text NOT NULL,
	"office_hours_start" text DEFAULT '08:00' NOT NULL,
	"office_hours_end" text DEFAULT '17:00' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"appointment_date" text NOT NULL,
	"time_slot" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"more_info" text DEFAULT '' NOT NULL,
	"cancellation_reason" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"cancelled_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_date_time_idx" ON "appointments" USING btree ("appointment_date","time_slot");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_client_id_idx" ON "appointments" USING btree ("client_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_active_slot_unique_idx" ON "appointments" USING btree ("appointment_date","time_slot") WHERE "status" <> 'cancelled';
