import "dotenv/config";

const required = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long");
}

const defaultClientOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "https://nsxfonio.xaxa.at"
];

const configuredClientOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const clientOrigins = [...new Set([...defaultClientOrigins, ...configuredClientOrigins])];

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3005),
  host: process.env.HOST || "127.0.0.1",
  betterAuthUrl: process.env.BETTER_AUTH_URL,
  betterAuthSecret: process.env.BETTER_AUTH_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  databaseUrl: process.env.DATABASE_URL || "postgres://nsxfonio:nsxfonio@localhost:5432/nsxfonio",
  clientOrigins,
  fonioApiKey: process.env.API_FONIO,
  fonioFromNumber: process.env.FONIO_FROM_NUMBER,
  fonioAgentId: process.env.FONIO_AGENT_ID,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT || "587",
  smtpSecure: process.env.SMTP_SECURE || "false",
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || "noreply@nsxfonio.com"
};
