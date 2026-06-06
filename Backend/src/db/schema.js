import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
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
  (table) => [
    index("session_user_id_idx").on(table.userId)
  ]
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

export const clients = pgTable(
  "clients",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    telephoneNumber: text("telephone_number").notNull(),
    email: text("email").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull()
  },
  (table) => [index("clients_created_at_idx").on(table.createdAt)]
);

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    appointmentDate: text("appointment_date").notNull(),
    timeSlot: text("time_slot").notNull(),
    status: text("status").notNull().default("scheduled"),
    moreInfo: text("more_info").notNull().default(""),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    cancelledAt: timestamp("cancelled_at")
  },
  (table) => [
    index("appointments_date_time_idx").on(table.appointmentDate, table.timeSlot),
    index("appointments_client_id_idx").on(table.clientId)
  ]
);

export const appointmentSettings = pgTable("appointment_settings", {
  id: text("id").primaryKey(),
  timeSlotSize: integer("time_slot_size").notNull(),
  workingDays: text("working_days").notNull(),
  officeHoursStart: text("office_hours_start").notNull().default("08:00"),
  officeHoursEnd: text("office_hours_end").notNull().default("17:00"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull()
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account)
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id]
  })
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id]
  })
}));

export const clientRelations = relations(clients, ({ many }) => ({
  appointments: many(appointments)
}));

export const appointmentRelations = relations(appointments, ({ one }) => ({
  client: one(clients, {
    fields: [appointments.clientId],
    references: [clients.id]
  })
}));

export const schema = {
  user,
  session,
  account,
  verification,
  clients,
  appointments,
  appointmentSettings,
  userRelations,
  sessionRelations,
  accountRelations,
  clientRelations,
  appointmentRelations
};
