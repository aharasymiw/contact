import { Pool } from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { config } from "./config.ts";

let pool: Pool | undefined;

function createPool(): Pool {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password || undefined,
    database: config.database.database,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
  });
}

export function getPool(): Pool {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, params as unknown[]) as Promise<QueryResult<Row>>;
}

export async function withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
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
