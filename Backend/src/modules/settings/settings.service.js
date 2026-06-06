import { createHash, randomBytes, randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { fonioApiKeys } from "../../db/schema.js";

function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function generatePlaintextApiKey(id) {
  const secret = randomBytes(24).toString("base64url");
  return `nsxf_${id}.${secret}`;
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
  const [apiKey] = await db
    .select()
    .from(fonioApiKeys)
    .where(and(eq(fonioApiKeys.clientId, clientId), isNull(fonioApiKeys.revokedAt)))
    .orderBy(desc(fonioApiKeys.createdAt))
    .limit(1);

  return toApiKeySummary(apiKey);
}

export async function rotateFonioApiKey(clientId, { userId = null, name = "Fonio" } = {}) {
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
  const [revoked] = await db
    .update(fonioApiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(fonioApiKeys.clientId, clientId), isNull(fonioApiKeys.revokedAt)))
    .returning();

  return toApiKeySummary(revoked);
}
