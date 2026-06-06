DO $$ BEGIN
  CREATE TYPE "public"."appointment_status" AS ENUM(
    'scheduled',
    'confirmation_pending',
    'confirmed',
    'followup_sent',
    'cancel_pending',
    'cancelled',
    'completed',
    'no_show'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."communication_channel" AS ENUM('call', 'whatsapp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."communication_direction" AS ENUM('outbound', 'inbound');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."slot_status" AS ENUM('available', 'booked', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."waitlist_offer_status" AS ENUM(
    'pending',
    'calling',
    'call_no_answer',
    'whatsapp_sent',
    'accepted',
    'declined',
    'timed_out'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.clients') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'name'
    )
    AND to_regclass('public.legacy_clients') IS NULL
  THEN
    ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_client_id_clients_id_fk";
    ALTER TABLE "clients" RENAME TO "legacy_clients";

    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'clients_pkey'
        AND conrelid = 'public.legacy_clients'::regclass
    )
    THEN
      ALTER TABLE "legacy_clients" RENAME CONSTRAINT "clients_pkey" TO "legacy_clients_pkey";
    END IF;

    IF to_regclass('public.clients_created_at_idx') IS NOT NULL THEN
      ALTER INDEX "clients_created_at_idx" RENAME TO "legacy_clients_created_at_idx";
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "clients" ("id", "name")
VALUES ('default-client', 'Default Practice')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "client_id" text;
--> statement-breakpoint
UPDATE "user"
SET "client_id" = 'default-client'
WHERE "client_id" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user"
    ADD CONSTRAINT "user_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "phone" text,
  "whatsapp_phone" text,
  "email" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customers"
    ADD CONSTRAINT "customers_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.legacy_clients') IS NOT NULL THEN
    INSERT INTO "customers" (
      "id",
      "client_id",
      "first_name",
      "last_name",
      "phone",
      "whatsapp_phone",
      "email",
      "notes",
      "created_at",
      "updated_at"
    )
    SELECT
      "id",
      'default-client',
      "first_name",
      "last_name",
      "telephone_number",
      "telephone_number",
      "email",
      "description",
      "created_at",
      "updated_at"
    FROM "legacy_clients"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_client_id_idx" ON "customers" USING btree ("client_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedules" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "day_of_week" integer NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "slot_duration_minutes" integer DEFAULT 30 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "schedules"
    ADD CONSTRAINT "schedules_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedules_client_id_idx" ON "schedules" USING btree ("client_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slots" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "schedule_id" text,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "status" "slot_status" DEFAULT 'available' NOT NULL,
  "appointment_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "slots"
    ADD CONSTRAINT "slots_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "slots"
    ADD CONSTRAINT "slots_schedule_id_schedules_id_fk"
    FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slots_client_id_idx" ON "slots" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slots_status_idx" ON "slots" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slots_starts_at_idx" ON "slots" USING btree ("starts_at");
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.appointments') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'customer_id'
    )
    AND to_regclass('public.legacy_appointments') IS NULL
  THEN
    ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_client_id_clients_id_fk";
    ALTER TABLE "appointments" RENAME TO "legacy_appointments";

    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'appointments_pkey'
        AND conrelid = 'public.legacy_appointments'::regclass
    )
    THEN
      ALTER TABLE "legacy_appointments" RENAME CONSTRAINT "appointments_pkey" TO "legacy_appointments_pkey";
    END IF;

    IF to_regclass('public.appointments_date_time_idx') IS NOT NULL THEN
      ALTER INDEX "appointments_date_time_idx" RENAME TO "legacy_appointments_date_time_idx";
    END IF;

    IF to_regclass('public.appointments_client_id_idx') IS NOT NULL THEN
      ALTER INDEX "appointments_client_id_idx" RENAME TO "legacy_appointments_client_id_idx";
    END IF;

    IF to_regclass('public.appointments_active_slot_unique_idx') IS NOT NULL THEN
      ALTER INDEX "appointments_active_slot_unique_idx" RENAME TO "legacy_appointments_active_slot_unique_idx";
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "customer_id" text NOT NULL,
  "slot_id" text,
  "title" text NOT NULL,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
  "confirmation_deadline_at" timestamp,
  "followup_deadline_at" timestamp,
  "cancel_reason" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_slot_id_slots_id_fk"
    FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.legacy_appointments') IS NOT NULL THEN
    INSERT INTO "appointments" (
      "id",
      "client_id",
      "customer_id",
      "slot_id",
      "title",
      "starts_at",
      "ends_at",
      "status",
      "cancel_reason",
      "notes",
      "created_at",
      "updated_at"
    )
    SELECT
      "legacy_appointments"."id",
      'default-client',
      "legacy_appointments"."client_id",
      null,
      'Appointment',
      ("legacy_appointments"."appointment_date" || ' ' || "legacy_appointments"."time_slot")::timestamp,
      ("legacy_appointments"."appointment_date" || ' ' || "legacy_appointments"."time_slot")::timestamp + interval '30 minutes',
      CASE
        WHEN "legacy_appointments"."status" IN (
          'scheduled',
          'confirmation_pending',
          'confirmed',
          'followup_sent',
          'cancel_pending',
          'cancelled',
          'completed',
          'no_show'
        )
        THEN "legacy_appointments"."status"::appointment_status
        ELSE 'scheduled'::appointment_status
      END,
      "legacy_appointments"."cancellation_reason",
      nullif("legacy_appointments"."more_info", ''),
      "legacy_appointments"."created_at",
      "legacy_appointments"."updated_at"
    FROM "legacy_appointments"
    INNER JOIN "customers" ON "customers"."id" = "legacy_appointments"."client_id"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_client_id_idx" ON "appointments" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_customer_id_idx" ON "appointments" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_status_idx" ON "appointments" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waiting_list_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "customer_id" text NOT NULL,
  "position" integer NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waiting_list_entries"
    ADD CONSTRAINT "waiting_list_entries_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waiting_list_entries"
    ADD CONSTRAINT "waiting_list_entries_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waiting_list_entries_client_id_idx" ON "waiting_list_entries" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waiting_list_entries_client_position_idx" ON "waiting_list_entries" USING btree ("client_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist_offers" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "slot_id" text NOT NULL,
  "waiting_list_entry_id" text NOT NULL,
  "status" "waitlist_offer_status" DEFAULT 'pending' NOT NULL,
  "response_deadline_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_slot_id_slots_id_fk"
    FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_waiting_list_entry_id_waiting_list_entries_id_fk"
    FOREIGN KEY ("waiting_list_entry_id") REFERENCES "public"."waiting_list_entries"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_offers_slot_id_idx" ON "waitlist_offers" USING btree ("slot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_offers_status_idx" ON "waitlist_offers" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "communication_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "appointment_id" text,
  "customer_id" text,
  "waitlist_offer_id" text,
  "channel" "communication_channel" NOT NULL,
  "direction" "communication_direction" NOT NULL,
  "event_type" text NOT NULL,
  "status" text,
  "external_message_id" text,
  "external_call_id" text,
  "external_ref" text,
  "payload_json" text,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "communication_logs"
    ADD CONSTRAINT "communication_logs_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "communication_logs"
    ADD CONSTRAINT "communication_logs_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_logs_client_id_idx" ON "communication_logs" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_logs_appointment_id_idx" ON "communication_logs" USING btree ("appointment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_logs_waitlist_offer_id_idx" ON "communication_logs" USING btree ("waitlist_offer_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "event_type" text NOT NULL,
  "external_event_id" text UNIQUE,
  "payload_json" text NOT NULL,
  "received_at" timestamp DEFAULT now() NOT NULL,
  "processed_at" timestamp,
  "processing_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_external_event_id_idx" ON "webhook_events" USING btree ("external_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_processing_status_idx" ON "webhook_events" USING btree ("processing_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text,
  "user_id" text,
  "appointment_id" text,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "action" text NOT NULL,
  "from_state" text,
  "to_state" text,
  "reason" text,
  "metadata_json" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_client_id_idx" ON "audit_logs" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");
