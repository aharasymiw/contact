import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().trim().optional(),
  TRUST_PROXY: z.string().trim().default("false"),
  PGHOST: z.string().default("127.0.0.1"),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGUSER: z.string().default("postgres"),
  PGPASSWORD: z.string().default(""),
  PGDATABASE: z.string().default("contact_webrtc_lab"),
  PGADMINDATABASE: z.string().default("postgres"),
  PGCONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

const environmentConfig = envSchema.parse(process.env);

function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") {
    return true;
  }

  if (value === "false" || value === "") {
    return false;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

export const config = {
  environment: environmentConfig.NODE_ENV,
  isProduction: environmentConfig.NODE_ENV === "production",
  host: environmentConfig.HOST,
  port: environmentConfig.PORT,
  appOrigin: environmentConfig.APP_ORIGIN || undefined,
  trustProxy: parseTrustProxy(environmentConfig.TRUST_PROXY),
  sessionCookieName: "contact_session",
  sessionLifetimeMs: 1000 * 60 * 60 * 24 * 7,
  sseHeartbeatMs: 15000,
  authRateLimitWindowMs: environmentConfig.AUTH_RATE_LIMIT_WINDOW_MS,
  authRateLimitMax: environmentConfig.AUTH_RATE_LIMIT_MAX,
  database: {
    host: environmentConfig.PGHOST,
    port: environmentConfig.PGPORT,
    user: environmentConfig.PGUSER,
    password: environmentConfig.PGPASSWORD,
    database: environmentConfig.PGDATABASE,
    adminDatabase: environmentConfig.PGADMINDATABASE,
    connectionTimeoutMs: environmentConfig.PGCONNECT_TIMEOUT_MS,
  },
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    },
  ],
};

export type AppConfig = typeof config;
