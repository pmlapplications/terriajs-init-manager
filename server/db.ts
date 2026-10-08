import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://terria:terria@localhost:5432/terria",
  // Tables and functions live in the `terria` schema (db/migrations).
  options: "-c search_path=terria,public",
});

/** Runs `fn` in a transaction, rolling back if it throws. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Postgres error codes we map to HTTP responses. */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";
/** RAISE EXCEPTION in a trigger or function. */
export const PG_RAISE_EXCEPTION = "P0001";

export const pgErrorCode = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
