import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@strength/db";

export interface WorkerEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  APP_ENV?: string;
}

export function createAuth(env: WorkerEnv) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: [
      "strength://",
      "strength://*",
      "http://localhost:*",
      "http://localhost:8081",
      "http://127.0.0.1:*",
      "http://127.0.0.1:8081",
      "http://192.168.*.*:*",
      "http://10.*.*.*:*",
      "http://172.*.*.*:*",
      "exp://",
      "exp://**",
      "exp://127.0.0.1:8081/**",
      "exp://192.168.*.*:*/**",
      "exp://10.*.*.*:*/**",
      "exp://172.16.*.*:*/**",
    ],
    plugins: [expo()],
  });
}

export function isDevAuthEnabled(env: WorkerEnv) {
  return (env.APP_ENV ?? "development") === "development";
}
