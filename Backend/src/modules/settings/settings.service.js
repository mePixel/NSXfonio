import { createHash, randomBytes, randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, pool } from "../../db/index.js";
import { fonioApiKeys } from "../../db/schema.js";

export const DEFAULT_RESCHEDULER_CANDIDATE_WINDOW = 3;

function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function generatePlaintextApiKey(id) {
  const secret = randomBytes(24).toString("base64url");
  return `nsxf_${id}.${secret}`;
}

async function ensureFonioApiKeysTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "fonio_api_keys" (
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
    )
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "fonio_api_keys"
        ADD CONSTRAINT "fonio_api_keys_client_id_clients_id_fk"
        FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "fonio_api_keys"
        ADD CONSTRAINT "fonio_api_keys_created_by_user_id_user_id_fk"
        FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "fonio_api_keys_client_id_idx"
      ON "fonio_api_keys" USING btree ("client_id")
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "fonio_api_keys_revoked_at_idx"
      ON "fonio_api_keys" USING btree ("revoked_at")
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "fonio_api_keys_client_active_idx"
      ON "fonio_api_keys" USING btree ("client_id")
      WHERE "revoked_at" is null
  `);
}

function toApiKeySummary(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt
  };
}

export async function ensureAppointmentSettingsStorage() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "appointment_settings" (
      "id" text PRIMARY KEY NOT NULL,
      "time_slot_size" integer NOT NULL,
      "working_days" text NOT NULL,
      "office_hours_start" text DEFAULT '08:00' NOT NULL,
      "office_hours_end" text DEFAULT '17:00' NOT NULL,
      "rescheduler_candidate_window" integer DEFAULT ${DEFAULT_RESCHEDULER_CANDIDATE_WINDOW} NOT NULL,
      "created_at" timestamp NOT NULL,
      "updated_at" timestamp NOT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE "appointment_settings"
    ADD COLUMN IF NOT EXISTS "rescheduler_candidate_window" integer
    DEFAULT ${DEFAULT_RESCHEDULER_CANDIDATE_WINDOW} NOT NULL
  `);
}

export async function getReschedulerCandidateWindow() {
  await ensureAppointmentSettingsStorage();

  const { rows } = await pool.query(
    `
      SELECT "rescheduler_candidate_window"
      FROM "appointment_settings"
      WHERE "id" = $1
      LIMIT 1
    `,
    ["default"]
  );

  const rawValue = Number(rows[0]?.rescheduler_candidate_window);
  if (!Number.isInteger(rawValue) || rawValue < 1) {
    return DEFAULT_RESCHEDULER_CANDIDATE_WINDOW;
  }

  return rawValue;
}

export async function getActiveFonioApiKey(clientId) {
  await ensureFonioApiKeysTable();

  const [apiKey] = await db
    .select()
    .from(fonioApiKeys)
    .where(and(eq(fonioApiKeys.clientId, clientId), isNull(fonioApiKeys.revokedAt)))
    .orderBy(desc(fonioApiKeys.createdAt))
    .limit(1);

  return toApiKeySummary(apiKey);
}

export async function rotateFonioApiKey(clientId, { userId = null, name = "Fonio" } = {}) {
  await ensureFonioApiKeysTable();

  const id = randomUUID();
  const plaintextApiKey = generatePlaintextApiKey(id);
  const keyHash = hashApiKey(plaintextApiKey);
  const keyPrefix = plaintextApiKey.slice(0, 18);

  const [createdKey] = await db.transaction(async (tx) => {
    await tx
      .update(fonioApiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(fonioApiKeys.clientId, clientId), isNull(fonioApiKeys.revokedAt)));

    return tx
      .insert(fonioApiKeys)
      .values({
        id,
        clientId,
        createdByUserId: userId,
        name,
        keyPrefix,
        keyHash
      })
      .returning();
  });

  return {
    apiKey: plaintextApiKey,
    summary: toApiKeySummary(createdKey)
  };
}

export async function revokeFonioApiKey(clientId) {
  await ensureFonioApiKeysTable();

  const [revoked] = await db
    .update(fonioApiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(fonioApiKeys.clientId, clientId), isNull(fonioApiKeys.revokedAt)))
    .returning();

  return toApiKeySummary(revoked);
}
