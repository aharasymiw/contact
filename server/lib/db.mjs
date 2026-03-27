import { Pool } from "pg";

import { config } from "./config.mjs";

let pool;

function createPool() {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password || undefined,
    database: config.database.database,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
  });
}

export function getPool() {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function withClient(work) {
  const client = await getPool().connect();

  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
