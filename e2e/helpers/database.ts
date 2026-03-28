import pg from "pg";

const { Client } = pg;

function createClient() {
  return new Client({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? "5432"),
    user: process.env.PGUSER ?? "postgres",
    password: process.env.PGPASSWORD || undefined,
    database:
      process.env.PGDATABASE_E2E ?? process.env.PGDATABASE ?? "contact_webrtc_lab_playwright",
  });
}

export async function resetTestDatabase() {
  const client = createClient();
  await client.connect();

  try {
    await client.query(`
      truncate table
        call_events,
        call_sessions,
        user_sessions,
        app_users
      restart identity
      cascade
    `);
  } finally {
    await client.end();
  }
}
