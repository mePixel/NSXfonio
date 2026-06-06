import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { str, uuid } from "../../lib/sanitize.js";
import * as service from "./customers.service.js";

export const customersRouter = Router();

customersRouter.use(requireAuth, requireClient);

customersRouter.get("/", async (req, res, next) => {
  try {
    const list = await service.listCustomers(req.user.clientId);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

customersRouter.post("/", async (req, res, next) => {
  try {
    const firstName = str(req.body.firstName, { required: true, max: 100 });
    const lastName  = str(req.body.lastName,  { required: true, max: 100 });

    if (!firstName || !lastName) {
      res.status(400).json({ error: "firstName and lastName are required and must be non-empty strings under 100 characters" });
      return;
    }

    const phone        = str(req.body.phone,        { max: 30 });
    const whatsappPhone = str(req.body.whatsappPhone, { max: 30 });
    const email        = str(req.body.email,        { max: 254 });
    const notes        = str(req.body.notes,        { max: 2000 });

    const customer = await service.createCustomer(req.user.clientId, {
      firstName,
      lastName,
      phone,
      whatsappPhone,
      email,
      notes
    });
    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
});

customersRouter.get("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const customer = await service.getCustomer(req.user.clientId, id);
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    res.json(customer);
  } catch (error) {
    next(error);
  }
});

customersRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const updates = {};
    if (req.body.firstName !== undefined) {
      const v = str(req.body.firstName, { required: true, max: 100 });
      if (!v) { res.status(400).json({ error: "firstName must be a non-empty string under 100 characters" }); return; }
      updates.firstName = v;
    }
    if (req.body.lastName !== undefined) {
      const v = str(req.body.lastName, { required: true, max: 100 });
      if (!v) { res.status(400).json({ error: "lastName must be a non-empty string under 100 characters" }); return; }
      updates.lastName = v;
    }
    if (req.body.phone !== undefined)         updates.phone         = str(req.body.phone,         { max: 30 });
    if (req.body.whatsappPhone !== undefined)  updates.whatsappPhone  = str(req.body.whatsappPhone,  { max: 30 });
    if (req.body.email !== undefined)          updates.email          = str(req.body.email,          { max: 254 });
    if (req.body.notes !== undefined)          updates.notes          = str(req.body.notes,          { max: 2000 });

    const customer = await service.updateCustomer(req.user.clientId, id, updates);
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    res.json(customer);
  } catch (error) {
    next(error);
  }
});
