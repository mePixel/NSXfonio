CREATE TABLE "fonio_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"created_by_user_id" text,
	"name" text DEFAULT 'Fonio' NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fonio_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "fonio_api_keys" ADD CONSTRAINT "fonio_api_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fonio_api_keys" ADD CONSTRAINT "fonio_api_keys_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "fonio_api_keys_client_id_idx" ON "fonio_api_keys" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "fonio_api_keys_revoked_at_idx" ON "fonio_api_keys" USING btree ("revoked_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "fonio_api_keys_client_active_idx" ON "fonio_api_keys" USING btree ("client_id") WHERE "revoked_at" is null;
