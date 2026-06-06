import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { int, str, uuid } from "../../lib/sanitize.js";
import * as service from "./waitlist.service.js";

export const waitlistRouter = Router();

waitlistRouter.use(requireAuth, requireClient);

waitlistRouter.get("/", async (req, res, next) => {
  try {
    res.json(await service.listWaitlistEntries(req.user.clientId));
  } catch (error) { next(error); }
});

waitlistRouter.post("/", async (req, res, next) => {
  try {
    const customerId = uuid(req.body.customerId);
    const position   = int(req.body.position, { min: 1 });
    const notes      = str(req.body.notes, { max: 2000 });

    if (!customerId) { res.status(400).json({ error: "customerId must be a valid UUID" }); return; }
    if (!position)   { res.status(400).json({ error: "position must be a positive integer" }); return; }

    res.status(201).json(await service.createWaitlistEntry(req.user.clientId, { customerId, position, notes }));
  } catch (error) { next(error); }
});

waitlistRouter.get("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const entry = await service.getWaitlistEntry(req.user.clientId, id);
    if (!entry) { res.status(404).json({ error: "Waitlist entry not found" }); return; }
    res.json(entry);
  } catch (error) { next(error); }
});

waitlistRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const updates = {};
    if (req.body.position !== undefined) {
      const v = int(req.body.position, { min: 1 });
      if (!v) { res.status(400).json({ error: "position must be a positive integer" }); return; }
      updates.position = v;
    }
    if (req.body.notes !== undefined) updates.notes = str(req.body.notes, { max: 2000 });

    const entry = await service.updateWaitlistEntry(req.user.clientId, id, updates);
    if (!entry) { res.status(404).json({ error: "Waitlist entry not found" }); return; }
    res.json(entry);
  } catch (error) { next(error); }
});

waitlistRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const entry = await service.deleteWaitlistEntry(req.user.clientId, id);
    if (!entry) { res.status(404).json({ error: "Waitlist entry not found" }); return; }
    res.json(entry);
  } catch (error) { next(error); }
});
