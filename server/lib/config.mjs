const environment = process.env.NODE_ENV ?? "development";

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  environment,
  isProduction: environment === "production",
  host: process.env.HOST ?? "127.0.0.1",
  port: parseNumber(process.env.PORT, 3000),
  sessionCookieName: "contact_session",
  sessionLifetimeMs: 1000 * 60 * 60 * 24 * 7,
  sseHeartbeatMs: 15000,
  database: {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: parseNumber(process.env.PGPORT, 5432),
    user: process.env.PGUSER ?? "postgres",
    password: process.env.PGPASSWORD ?? "",
    database: process.env.PGDATABASE ?? "contact_webrtc_lab",
    adminDatabase: process.env.PGADMINDATABASE ?? "postgres",
    connectionTimeoutMs: parseNumber(process.env.PGCONNECT_TIMEOUT_MS, 2000),
  },
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    },
  ],
};
