import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { startReschedulerExpiryWorker } from "./modules/rescheduler/rescheduler-expiry.service.js";

try {
  console.log("Applying database migrations...");
  await runMigrations();
  console.log("Database migrations are up to date.");
  startReschedulerExpiryWorker();

  app.listen(env.port, env.host, () => {
    console.log(`NSXfonio backend listening on http://${env.host}:${env.port}`);
  });
} catch (error) {
  console.error("Failed to start backend:", error);
  await pool.end();
  process.exit(1);
}
