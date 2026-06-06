import { Router } from "express";
import { env } from "../../config/env.js";
import { isoDate, str } from "../../lib/sanitize.js";
import {
  buildInboundContext,
  handleInboundAppointmentWebhook,
  searchFonioAvailableSlots,
  listFonioAvailableSlots
} from "./fonio.inbound.service.js";

export const fonioRouter = Router();

function requireFonioSecret(req, res, next) {
  if (!env.fonioSharedSecret) {
    next();
    return;
  }

  const provided = req.header("x-fonio-secret");
  if (provided !== env.fonioSharedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

fonioRouter.use(requireFonioSecret);

fonioRouter.post("/inbound-context", async (req, res, next) => {
  try {
    const maxSlotsRaw = Number(req.body?.maxSlots ?? req.query?.maxSlots ?? 3);
    const maxSlots = Number.isInteger(maxSlotsRaw) && maxSlotsRaw > 0 && maxSlotsRaw <= 10
      ? maxSlotsRaw
      : 3;

    const context = await buildInboundContext(req.body ?? {}, { maxSlots });
    res.json(context);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/inbound-booking", async (req, res, next) => {
  try {
    const result = await handleInboundAppointmentWebhook(req.body ?? {});

    if (result.handled) {
      res.status(201).json(result);
      return;
    }

    const statusByReason = {
      unresolved_client: 422,
      no_booking_intent: 422,
      no_matching_available_slot: 409
    };

    res.status(statusByReason[result.reason] ?? 422).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/inbound-search-slots", async (req, res, next) => {
  try {
    const maxSlotsRaw = Number(req.body?.maxSlots ?? req.query?.maxSlots ?? 6);
    const maxSlots = Number.isInteger(maxSlotsRaw) && maxSlotsRaw > 0 && maxSlotsRaw <= 12
      ? maxSlotsRaw
      : 6;

    const result = await searchFonioAvailableSlots(req.body ?? {}, { maxSlots });

    if (result.handled) {
      res.json(result);
      return;
    }

    const statusByReason = {
      unresolved_client: 422,
      invalid_range: 400
    };

    res.status(statusByReason[result.reason] ?? 422).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.get("/availability", async (req, res, next) => {
  try {
    const clientId = str(req.query.clientId, { required: true, max: 100 });
    if (!clientId) {
      res.status(400).json({ error: "clientId is required" });
      return;
    }

    const from = req.query.from !== undefined ? isoDate(String(req.query.from)) : undefined;
    const to = req.query.to !== undefined ? isoDate(String(req.query.to)) : undefined;

    if (req.query.from !== undefined && from === undefined) {
      res.status(400).json({ error: "from must be a valid ISO date string" });
      return;
    }
    if (req.query.to !== undefined && to === undefined) {
      res.status(400).json({ error: "to must be a valid ISO date string" });
      return;
    }

    const slots = await listFonioAvailableSlots(clientId, { from, to });
    res.json({
      clientId,
      slots,
      count: slots.length
    });
  } catch (error) {
    next(error);
  }
});
