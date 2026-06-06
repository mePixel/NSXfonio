import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { listAuditLogs } from "./audit.service.js";

export const auditRouter = Router();

auditRouter.use(requireAuth, requireClient);

auditRouter.get("/", async (req, res, next) => {
  try {
    const logs = await listAuditLogs(req.user.clientId);
    res.json(logs);
  } catch (error) {
    next(error);
  }
});
