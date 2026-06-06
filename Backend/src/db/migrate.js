import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";

export async function runMigrations() {
  await migrate(db, {
    migrationsFolder: "./drizzle"
  });

  await pool.query(`
    ALTER TABLE "appointment_settings"
      ADD COLUMN IF NOT EXISTS "office_hours_start" text DEFAULT '08:00' NOT NULL
  `);
  await pool.query(`
    ALTER TABLE "appointment_settings"
      ADD COLUMN IF NOT EXISTS "office_hours_end" text DEFAULT '17:00' NOT NULL
  `);
}
