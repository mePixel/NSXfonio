import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { env } from "./config/env.js";
import { db } from "./db/index.js";
import { schema } from "./db/schema.js";

const googleProvider =
  env.googleClientId && env.googleClientSecret
    ? {
        google: {
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret,
          prompt: "select_account"
        }
      }
    : {};

export const auth = betterAuth({
  appName: "NSXfonio",
  baseURL: env.betterAuthUrl,
  secret: env.betterAuthSecret,
  trustedOrigins: env.clientOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  socialProviders: googleProvider,
  emailAndPassword: {
    enabled: true
  },
  experimental: {
    joins: true
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
    }
  }
});
