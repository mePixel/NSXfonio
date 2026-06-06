CREATE TABLE IF NOT EXISTS "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"telephone_number" text NOT NULL,
	"email" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_created_at_idx" ON "clients" USING btree ("created_at");
