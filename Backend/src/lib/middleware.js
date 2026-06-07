import { createHash, timingSafeEqual } from "crypto";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { fonioApiKeys, user as userTable } from "../db/schema.js";

export async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [dbUser] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, session.user.id));

    if (!dbUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.user = dbUser;
    req.session = session.session;
    next();
  } catch (error) {
    next(error);
  }
}

// Use after requireAuth on routes that need a client association.
export function requireClient(req, res, next) {
  if (!req.user?.clientId) {
    res.status(403).json({ error: "User is not associated with a client" });
    return;
  }
  next();
}

function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stringsMatch(expected, provided) {
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function extractBearerToken(req) {
  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return req.header("x-api-key")?.trim() ?? null;
}

function parseApiKeyId(apiKey) {
  const match = /^nsxf_([^.]+)\.[A-Za-z0-9_-]+$/.exec(apiKey);
  return match?.[1] ?? null;
}

export async function requireFonioApiKey(req, res, next) {
  try {
    const providedApiKey = extractBearerToken(req);
    if (!providedApiKey) {
      res.status(401).json({ error: "Missing Fonio API key" });
      return;
    }

    const keyId = parseApiKeyId(providedApiKey);
    if (!keyId) {
      res.status(401).json({ error: "Invalid Fonio API key" });
      return;
    }

    const [apiKey] = await db
      .select()
      .from(fonioApiKeys)
      .where(and(eq(fonioApiKeys.id, keyId), isNull(fonioApiKeys.revokedAt)));

    if (!apiKey) {
      res.status(401).json({ error: "Invalid Fonio API key" });
      return;
    }

    const hashedProvidedKey = hashApiKey(providedApiKey);
    if (!stringsMatch(apiKey.keyHash, hashedProvidedKey)) {
      res.status(401).json({ error: "Invalid Fonio API key" });
      return;
    }

    await db
      .update(fonioApiKeys)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(fonioApiKeys.id, apiKey.id));

    req.fonioAuth = {
      apiKeyId: apiKey.id,
      clientId: apiKey.clientId
    };

    next();
  } catch (error) {
    next(error);
  }
}
