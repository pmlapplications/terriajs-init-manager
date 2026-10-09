// Prepares the API test database: creates it if needed, then drops the
// `terria` schema and runs every migration in db/migrations, in order, so each
// run starts from the same schema as a fresh install.

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";

const MIGRATIONS = new URL("../../db/migrations/", import.meta.url);

export default async function setup(project: TestProject) {
  const url = new URL(project.config.env.DATABASE_URL as string);
  const name = decodeURIComponent(url.pathname.slice(1));
  // The schema is dropped below; never do that to a real database.
  if (!name.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in "_test" (got "${name}"); its data is deleted`);
  }

  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(`Can't connect to PostgreSQL for the API tests (${(e as Error).message}). Start it with \`docker compose up -d db\`.`);
  }
  try {
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) await admin.query(`create database "${name.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }

  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query("drop schema if exists terria cascade");
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(new URL(file, MIGRATIONS), "utf8"));
    }
  } finally {
    await db.end();
  }

  const configDir = project.config.env.CONFIG_DIR as string;
  return () => rmSync(join(configDir), { recursive: true, force: true });
}
