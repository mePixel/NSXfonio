import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmation_pending",
  "confirmed",
  "followup_sent",
  "cancel_pending",
  "cancelled",
  "completed",
  "no_show"
]);

export const slotStatusEnum = pgEnum("slot_status", [
  "available",
  "booked",
  "blocked"
]);

export const waitlistOfferStatusEnum = pgEnum("waitlist_offer_status", [
  "pending",
  "calling",
  "call_no_answer",
  "whatsapp_sent",
  "accepted",
  "declined",
  "timed_out"
]);

export const communicationChannelEnum = pgEnum("communication_channel", [
  "call",
  "whatsapp",
  "email"
]);

export const communicationDirectionEnum = pgEnum("communication_direction", [
  "outbound",
  "inbound"
]);

// ── Clients (defined first so user can reference it) ─────────────────────────

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// ── Better Auth tables ────────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull()
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull()
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId)
  ]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

// ── Customers ─────────────────────────────────────────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    whatsappPhone: text("whatsapp_phone"),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (table) => [index("customers_client_id_idx").on(table.clientId)]
);

// ── Schedules and slots ───────────────────────────────────────────────────────

export const schedules = pgTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday … 6=Saturday
    startTime: text("start_time").notNull(),     // "09:00"
    endTime: text("end_time").notNull(),         // "17:00"
    slotDurationMinutes: integer("slot_duration_minutes").notNull().default(30),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (table) => [index("schedules_client_id_idx").on(table.clientId)]
);

export const slots = pgTable(
  "slots",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: slotStatusEnum("status").notNull().default("available"),
    // No FK here to avoid circular reference with appointments — managed at app level
    appointmentId: text("appointment_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (table) => [
    index("slots_client_id_idx").on(table.clientId),
    index("slots_status_idx").on(table.status),
    index("slots_starts_at_idx").on(table.startsAt)
  ]
);

// ── Appointments ──────────────────────────────────────────────────────────────

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    slotId: text("slot_id").references(() => slots.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: appointmentStatusEnum("status").notNull().default("scheduled"),
    confirmationDeadlineAt: timestamp("confirmation_deadline_at"),
    followupDeadlineAt: timestamp("followup_deadline_at"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (table) => [
    index("appointments_client_id_idx").on(table.clientId),
    index("appointments_customer_id_idx").on(table.customerId),
    index("appointments_status_idx").on(table.status)
  ]
);

// ── Waiting list ──────────────────────────────────────────────────────────────

export const waitingListEntries = pgTable(
  "waiting_list_entries",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (table) => [
    index("waiting_list_entries_client_id_idx").on(table.clientId),
    index("waiting_list_entries_client_position_idx").on(table.clientId, table.position)
  ]
);

export const waitlistOffers = pgTable(
  "waitlist_offers",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    slotId: text("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    waitingListEntryId: text("waiting_list_entry_id")
      .notNull()
      .references(() => waitingListEntries.id, { onDelete: "cascade" }),
    status: waitlistOfferStatusEnum("status").notNull().default("pending"),
    responseDeadlineAt: timestamp("response_deadline_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (table) => [
    index("waitlist_offers_slot_id_idx").on(table.slotId),
    index("waitlist_offers_status_idx").on(table.status)
  ]
);

// ── Communication logs ────────────────────────────────────────────────────────

export const communicationLogs = pgTable(
  "communication_logs",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id"),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    waitlistOfferId: text("waitlist_offer_id"),
    channel: communicationChannelEnum("channel").notNull(),
    direction: communicationDirectionEnum("direction").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status"),
    externalMessageId: text("external_message_id"),
    externalCallId: text("external_call_id"),
    externalRef: text("external_ref"),
    payloadJson: text("payload_json"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [
    index("communication_logs_client_id_idx").on(table.clientId),
    index("communication_logs_appointment_id_idx").on(table.appointmentId),
    index("communication_logs_waitlist_offer_id_idx").on(table.waitlistOfferId)
  ]
);

// ── Webhook events ────────────────────────────────────────────────────────────

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    externalEventId: text("external_event_id").unique(),
    payloadJson: text("payload_json").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
    processingStatus: text("processing_status").notNull().default("pending")
  },
  (table) => [
    index("webhook_events_external_event_id_idx").on(table.externalEventId),
    index("webhook_events_processing_status_idx").on(table.processingStatus)
  ]
);

// ── Audit logs ────────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    appointmentId: text("appointment_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    reason: text("reason"),
    metadataJson: text("metadata_json"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [
    index("audit_logs_client_id_idx").on(table.clientId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId)
  ]
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const clientRelations = relations(clients, ({ many }) => ({
  users: many(user),
  customers: many(customers),
  schedules: many(schedules),
  slots: many(slots),
  appointments: many(appointments),
  waitingListEntries: many(waitingListEntries),
  waitlistOffers: many(waitlistOffers),
  communicationLogs: many(communicationLogs),
  auditLogs: many(auditLogs)
}));

export const userRelations = relations(user, ({ one, many }) => ({
  client: one(clients, { fields: [user.clientId], references: [clients.id] }),
  sessions: many(session),
  accounts: many(account)
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] })
}));

export const customerRelations = relations(customers, ({ one, many }) => ({
  client: one(clients, { fields: [customers.clientId], references: [clients.id] }),
  appointments: many(appointments),
  waitingListEntries: many(waitingListEntries),
  communicationLogs: many(communicationLogs)
}));

export const scheduleRelations = relations(schedules, ({ one, many }) => ({
  client: one(clients, { fields: [schedules.clientId], references: [clients.id] }),
  slots: many(slots)
}));

export const slotRelations = relations(slots, ({ one, many }) => ({
  client: one(clients, { fields: [slots.clientId], references: [clients.id] }),
  schedule: one(schedules, { fields: [slots.scheduleId], references: [schedules.id] }),
  waitlistOffers: many(waitlistOffers)
}));

export const appointmentRelations = relations(appointments, ({ one, many }) => ({
  client: one(clients, { fields: [appointments.clientId], references: [clients.id] }),
  customer: one(customers, { fields: [appointments.customerId], references: [customers.id] }),
  slot: one(slots, { fields: [appointments.slotId], references: [slots.id] }),
  communicationLogs: many(communicationLogs)
}));

export const waitingListEntryRelations = relations(waitingListEntries, ({ one, many }) => ({
  client: one(clients, { fields: [waitingListEntries.clientId], references: [clients.id] }),
  customer: one(customers, { fields: [waitingListEntries.customerId], references: [customers.id] }),
  waitlistOffers: many(waitlistOffers)
}));

export const waitlistOfferRelations = relations(waitlistOffers, ({ one, many }) => ({
  client: one(clients, { fields: [waitlistOffers.clientId], references: [clients.id] }),
  slot: one(slots, { fields: [waitlistOffers.slotId], references: [slots.id] }),
  waitingListEntry: one(waitingListEntries, {
    fields: [waitlistOffers.waitingListEntryId],
    references: [waitingListEntries.id]
  }),
  communicationLogs: many(communicationLogs)
}));

// ── Schema export (used by Better Auth adapter and drizzle) ───────────────────

export const schema = {
  user,
  session,
  account,
  verification,
  clients,
  customers,
  schedules,
  slots,
  appointments,
  waitingListEntries,
  waitlistOffers,
  communicationLogs,
  webhookEvents,
  auditLogs,
  userRelations,
  sessionRelations,
  accountRelations,
  clientRelations,
  customerRelations,
  scheduleRelations,
  slotRelations,
  appointmentRelations,
  waitingListEntryRelations,
  waitlistOfferRelations
};
