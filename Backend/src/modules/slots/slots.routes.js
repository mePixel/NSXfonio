import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { int, uuid } from "../../lib/sanitize.js";
import { startOfferCycle } from "../waitlist/offers.service.js";
import * as service from "./slots.service.js";

export const slotsRouter = Router();

slotsRouter.use(requireAuth, requireClient);

slotsRouter.get("/", async (req, res, next) => {
  try {
    res.json(await service.listSlots(req.user.clientId));
  } catch (error) { next(error); }
});

slotsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const slot = await service.getSlot(req.user.clientId, id);
    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    res.json(slot);
  } catch (error) { next(error); }
});

// Block or unblock a slot manually.
slotsRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const { status } = req.body;
    if (!status || typeof status !== "string") {
      res.status(400).json({ error: "status is required (available or blocked)" });
      return;
    }

    const slot = await service.updateSlotStatus(req.user.clientId, id, status);
    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    res.json(slot);
  } catch (error) { next(error); }
});

// Trigger the waitlist offer cycle for an available slot.
slotsRouter.post("/:id/start-offer-cycle", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const responseDeadlineMinutes = req.body.responseDeadlineMinutes !== undefined
      ? int(req.body.responseDeadlineMinutes, { min: 1, max: 1440 })
      : undefined;

    if (req.body.responseDeadlineMinutes !== undefined && !responseDeadlineMinutes) {
      res.status(400).json({ error: "responseDeadlineMinutes must be between 1 and 1440" });
      return;
    }

    const offer = await startOfferCycle(
      req.user.clientId,
      id,
      { userId: req.user.id, responseDeadlineMinutes }
    );
    res.status(201).json(offer);
  } catch (error) { next(error); }
});
