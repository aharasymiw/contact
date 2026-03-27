import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { config } from "../server/lib/config.mjs";

const { Client } = pg;

function escapeIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectDirectory = path.resolve(currentDirectory, "..");
const schemaPath = path.resolve(projectDirectory, "db/schema.sql");

async function main() {
  const schema = await fs.readFile(schemaPath, "utf8");
  const maintenanceClient = new Client({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password || undefined,
    database: config.database.adminDatabase,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
  });

  await maintenanceClient.connect();

  try {
    const databaseCheck = await maintenanceClient.query(
      `
        select 1
        from pg_database
        where datname = $1
      `,
      [config.database.database],
    );

    if (databaseCheck.rowCount === 0) {
      await maintenanceClient.query(
        `create database ${escapeIdentifier(config.database.database)}`,
      );
      console.log(`Created database ${config.database.database}`);
    } else {
      console.log(`Database ${config.database.database} already exists`);
    }
  } finally {
    await maintenanceClient.end();
  }

  const applicationClient = new Client({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password || undefined,
    database: config.database.database,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
  });

  await applicationClient.connect();

  try {
    await applicationClient.query(schema);
    console.log("Applied db/schema.sql successfully");
  } finally {
    await applicationClient.end();
  }
}

main().catch((error) => {
  console.error("Unable to prepare the PostgreSQL database.");
  console.error(error.message);
  process.exitCode = 1;
});
