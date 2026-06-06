import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { user as userTable } from "../db/schema.js";

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
