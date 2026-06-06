import { createHash, randomBytes, randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, pool } from "../../db/index.js";
import { fonioApiKeys } from "../../db/schema.js";

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
