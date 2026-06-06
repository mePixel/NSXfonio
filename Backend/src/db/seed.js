import "dotenv/config";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { db, pool } from "./index.js";
import {
  appointments,
  clients,
  customers,
  schedules,
  slots,
  user,
  waitingListEntries
} from "./schema.js";

const SEED_CLIENT_ID = "seed-client-1";
const SEED_USER_EMAIL = "admin@praxis.at";
const SEED_USER_PASSWORD = "Password123!";

async function seed() {
  // Skip if already seeded
  const [existing] = await db.select().from(clients).where(eq(clients.id, SEED_CLIENT_ID));
  if (existing) {
    console.log("Seed data already present. Run with --force to reseed.");
    return;
  }

  console.log("Seeding...\n");

  // ── Client ───────────────────────────────────────────────────────────────

  await db.insert(clients).values({
    id: SEED_CLIENT_ID,
    name: "Praxis Müller"
  });
  console.log("✓ Client: Praxis Müller");

  // ── User ─────────────────────────────────────────────────────────────────

  let userId;
  try {
    const result = await auth.api.signUpEmail({
      body: { email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD, name: "Dr. Müller" }
    });
    userId = result.user.id;
  } catch {
    const [dbUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, SEED_USER_EMAIL));
    if (!dbUser) throw new Error("Could not create or find seed user");
    userId = dbUser.id;
  }
  await db.update(user).set({ clientId: SEED_CLIENT_ID }).where(eq(user.id, userId));
  console.log(`✓ User: ${SEED_USER_EMAIL} / ${SEED_USER_PASSWORD}`);

  // ── Customers ─────────────────────────────────────────────────────────────

  const customerRows = [
    { firstName: "Anna",      lastName: "Müller",  phone: "+43 664 1234567", whatsappPhone: "+43 664 1234567", email: "anna.mueller@example.at" },
    { firstName: "Thomas",    lastName: "Bauer",   phone: "+43 664 2345678", whatsappPhone: "+43 664 2345678" },
    { firstName: "Maria",     lastName: "Huber",   phone: "+43 676 3456789", email: "maria.huber@example.at" },
    { firstName: "Josef",     lastName: "Wagner",  phone: "+43 699 4567890", whatsappPhone: "+43 699 4567890" },
    { firstName: "Elisabeth", lastName: "Gruber",  phone: "+43 650 5678901", email: "eli.gruber@example.at" }
  ];

  const createdCustomers = [];
  for (const c of customerRows) {
    const id = randomUUID();
    await db.insert(customers).values({ id, clientId: SEED_CLIENT_ID, ...c });
    createdCustomers.push({ id, ...c });
  }
  console.log(`✓ Customers: ${createdCustomers.length}`);

  // ── Schedule ──────────────────────────────────────────────────────────────

  const scheduleId = randomUUID();
  await db.insert(schedules).values({
    id: scheduleId,
    clientId: SEED_CLIENT_ID,
    dayOfWeek: 1,           // Monday
    startTime: "09:00",
    endTime: "17:00",
    slotDurationMinutes: 30
  });
  console.log("✓ Schedule: Mon 09:00–17:00, 30 min slots");

  // ── Slots (Mon–Thu next week, 2 per day) ──────────────────────────────────

  // Using absolute dates so the seed data is always readable in Postman
  const slotDefs = [
    ["2026-06-09T07:00:00Z", "2026-06-09T07:30:00Z"], // Mon 09:00 local (UTC+2)
    ["2026-06-09T07:30:00Z", "2026-06-09T08:00:00Z"], // Mon 09:30
    ["2026-06-10T07:00:00Z", "2026-06-10T07:30:00Z"], // Tue 09:00
    ["2026-06-10T07:30:00Z", "2026-06-10T08:00:00Z"], // Tue 09:30
    ["2026-06-11T07:00:00Z", "2026-06-11T07:30:00Z"], // Wed 09:00
    ["2026-06-11T07:30:00Z", "2026-06-11T08:00:00Z"], // Wed 09:30
    ["2026-06-12T07:00:00Z", "2026-06-12T07:30:00Z"], // Thu 09:00
    ["2026-06-12T07:30:00Z", "2026-06-12T08:00:00Z"]  // Thu 09:30
  ];

  const createdSlots = [];
  for (const [start, end] of slotDefs) {
    const id = randomUUID();
    await db.insert(slots).values({
      id,
      clientId: SEED_CLIENT_ID,
      scheduleId,
      startsAt: new Date(start),
      endsAt: new Date(end),
      status: "available"
    });
    createdSlots.push({ id, start, end });
  }
  console.log(`✓ Slots: ${createdSlots.length} (all available to start)`);

  // ── Appointments ──────────────────────────────────────────────────────────

  // Appointment 1 — scheduled (Anna, Mon 09:00)
  const appt1Id = randomUUID();
  await db.insert(appointments).values({
    id: appt1Id,
    clientId: SEED_CLIENT_ID,
    customerId: createdCustomers[0].id,
    slotId: createdSlots[0].id,
    title: "Erstgespräch",
    startsAt: new Date(createdSlots[0].start),
    endsAt: new Date(createdSlots[0].end),
    status: "scheduled"
  });
  await db.update(slots)
    .set({ status: "booked", appointmentId: appt1Id })
    .where(eq(slots.id, createdSlots[0].id));

  // Appointment 2 — confirmed (Thomas, Mon 09:30)
  const appt2Id = randomUUID();
  await db.insert(appointments).values({
    id: appt2Id,
    clientId: SEED_CLIENT_ID,
    customerId: createdCustomers[1].id,
    slotId: createdSlots[1].id,
    title: "Kontrolluntersuchung",
    startsAt: new Date(createdSlots[1].start),
    endsAt: new Date(createdSlots[1].end),
    status: "confirmed"
  });
  await db.update(slots)
    .set({ status: "booked", appointmentId: appt2Id })
    .where(eq(slots.id, createdSlots[1].id));

  // Appointment 3 — already cancelled (Tue 09:00 slot stays available)
  await db.insert(appointments).values({
    id: randomUUID(),
    clientId: SEED_CLIENT_ID,
    customerId: createdCustomers[2].id,
    slotId: null,
    title: "Nachsorge",
    startsAt: new Date("2026-06-03T07:00:00Z"),
    endsAt: new Date("2026-06-03T07:30:00Z"),
    status: "cancelled",
    cancelReason: "Kunde abgesagt"
  });

  console.log("✓ Appointments: 3 (1 scheduled, 1 confirmed, 1 cancelled)");

  // ── Waiting list ──────────────────────────────────────────────────────────

  await db.insert(waitingListEntries).values([
    { id: randomUUID(), clientId: SEED_CLIENT_ID, customerId: createdCustomers[2].id, position: 1, notes: "Nur vormittags" },
    { id: randomUUID(), clientId: SEED_CLIENT_ID, customerId: createdCustomers[3].id, position: 2 },
    { id: randomUUID(), clientId: SEED_CLIENT_ID, customerId: createdCustomers[4].id, position: 3, notes: "Bevorzugt nachmittags" }
  ]);
  console.log("✓ Waitlist: 3 entries (Maria #1, Josef #2, Elisabeth #3)");

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Seed complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Login     ${SEED_USER_EMAIL}
 Password  ${SEED_USER_PASSWORD}
 Client    Praxis Müller
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

seed()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => pool.end());
