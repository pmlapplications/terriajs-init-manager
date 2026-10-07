// API server. In production it also serves the built frontend from dist/.
//
//   GET  /api/wms        list stored WMS configs
//   GET  /api/wms/:id    load one config
//   POST /api/wms        create a config from an item
//   PUT  /api/wms/:id    update a config; body { version, item }

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { PG_CHECK_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorCode, pool } from "./db.ts";
import { ApiError, createWmsConfig, getWmsConfig, listWmsConfigs, updateWmsConfig } from "./wms.ts";

const app = new Hono();

// No auth yet; callers may say who they are so it lands in the audit columns.
const userOf = (c: Context) => c.req.header("x-user") ?? null;

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON");
  }
}

app.get("/api/health", async (c) => {
  await pool.query("select 1");
  return c.json({ ok: true });
});

app.get("/api/wms", async (c) => c.json(await listWmsConfigs()));

app.get("/api/wms/:id", async (c) => c.json(await getWmsConfig(c.req.param("id"))));

app.post("/api/wms", async (c) => c.json(await createWmsConfig(await jsonBody(c), userOf(c)), 201));

app.put("/api/wms/:id", async (c) => {
  const body = await jsonBody(c);
  const { version, item } = (body ?? {}) as { version?: unknown; item?: unknown };
  if (!Number.isInteger(version)) throw new ApiError(400, `"version" must be an integer`);
  return c.json(await updateWmsConfig(c.req.param("id"), version as number, item, userOf(c)));
});

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.text("Not found", 404)));

app.onError((e, c) => {
  if (e instanceof ApiError) return c.json({ error: e.message }, e.status);
  const code = pgErrorCode(e);
  if (code === PG_UNIQUE_VIOLATION) {
    return c.json({ error: `Already in use by another catalog member: ${(e as { detail?: string }).detail ?? e.message}` }, 409);
  }
  if (code === PG_CHECK_VIOLATION) return c.json({ error: e.message }, 400);
  console.error(e);
  return c.json({ error: "Internal server error" }, 500);
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`API listening on http://localhost:${port}`));
