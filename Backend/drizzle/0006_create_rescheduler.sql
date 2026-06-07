DO $$ BEGIN
  CREATE TYPE "public"."rescheduler_state" AS ENUM ('pending', 'calling', 'filled', 'aborted', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."rescheduler_candidate_call_state" AS ENUM ('not_reached', 'declined', 'interested', 'accepted', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "rescheduler_flows" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "cancelled_appointment_id" text NOT NULL,
  "original_slot_id" text,
  "state" "rescheduler_state" DEFAULT 'pending' NOT NULL,
  "replacement_appointment_id" text,
  "replacement_customer_id" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "aborted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rescheduler_flows_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "rescheduler_flows_cancelled_appointment_id_appointments_id_fk"
    FOREIGN KEY ("cancelled_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "rescheduler_flows_original_slot_id_slots_id_fk"
    FOREIGN KEY ("original_slot_id") REFERENCES "public"."slots"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "rescheduler_flows_replacement_appointment_id_appointments_id_fk"
    FOREIGN KEY ("replacement_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "rescheduler_flows_replacement_customer_id_customers_id_fk"
    FOREIGN KEY ("replacement_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "rescheduler_candidate_calls" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "rescheduler_flow_id" text NOT NULL,
  "customer_id" text,
  "waitlist_offer_id" text,
  "state" "rescheduler_candidate_call_state" DEFAULT 'skipped' NOT NULL,
  "notes" text,
  "called_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rescheduler_candidate_calls_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "rescheduler_candidate_calls_rescheduler_flow_id_rescheduler_flows_id_fk"
    FOREIGN KEY ("rescheduler_flow_id") REFERENCES "public"."rescheduler_flows"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "rescheduler_candidate_calls_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "rescheduler_candidate_calls_waitlist_offer_id_waitlist_offers_id_fk"
    FOREIGN KEY ("waitlist_offer_id") REFERENCES "public"."waitlist_offers"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "rescheduler_flows_client_id_idx" ON "rescheduler_flows" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "rescheduler_flows_cancelled_appointment_idx" ON "rescheduler_flows" USING btree ("cancelled_appointment_id");
CREATE INDEX IF NOT EXISTS "rescheduler_flows_state_idx" ON "rescheduler_flows" USING btree ("state");
CREATE UNIQUE INDEX IF NOT EXISTS "rescheduler_flows_cancelled_appointment_unique_idx" ON "rescheduler_flows" USING btree ("cancelled_appointment_id");
CREATE INDEX IF NOT EXISTS "rescheduler_candidate_calls_client_id_idx" ON "rescheduler_candidate_calls" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "rescheduler_candidate_calls_flow_id_idx" ON "rescheduler_candidate_calls" USING btree ("rescheduler_flow_id");
CREATE INDEX IF NOT EXISTS "rescheduler_candidate_calls_customer_id_idx" ON "rescheduler_candidate_calls" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "rescheduler_candidate_calls_waitlist_offer_id_idx" ON "rescheduler_candidate_calls" USING btree ("waitlist_offer_id");
