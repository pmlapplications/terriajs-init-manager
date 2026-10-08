// API server. In production it also serves the built frontend from dist/.
//
// Every /api route except login and health needs a session cookie.
//
//   POST   /api/auth/login   body { email, password }; sets the session cookie
//   POST   /api/auth/logout  ends the session
//   GET    /api/auth/me      the logged-in user
//
//   GET    /api/users        list users
//   POST   /api/users        create a user; body { email, firstName, lastName, password }
//   DELETE /api/users/:id    delete a user (not yourself)
//
//   GET    /api/members           one page of items and groups of every type; query q, kind,
//                                  type, memberOf, published, sort, dir, page, pageSize
//
//   GET    /api/items/:type       list stored configs of a catalog item type (wms, csv, ...)
//   GET    /api/items/:type/:id   load one config
//   POST   /api/items/:type       create a config from an item
//   PUT    /api/items/:type/:id   update a config; body { version, item }
//
//   GET    /api/groups/:type      the same for catalog group types (group, wms-group, ...);
//   GET    /api/groups/:type/:id  a group config also has `members`, and POST/PUT bodies
//   POST   /api/groups/:type      are { item, members } / { version, item, members } with
//   PUT    /api/groups/:type/:id  members as an ordered array of catalog member ids
//   GET    /api/groups/:type/member-types  types a group of this type may contain

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { PG_CHECK_VIOLATION, PG_RAISE_EXCEPTION, PG_UNIQUE_VIOLATION, pgErrorCode, pool } from "./db.ts";
import { ApiError } from "./errors.ts";
import { SESSION_HOURS, createUser, deleteUser, listUsers, login, logout, parseNewUser, sessionUser, type User } from "./users.ts";
import { createConfig, getConfig, listConfigs, listMembers, listMemberTypes, updateConfig, type MemberKind } from "./members.ts";

const app = new Hono<{ Variables: { user: User } }>();

const SESSION_COOKIE = "tlm_session";
// Browsers accept Secure cookies on http://localhost, so this only needs
// turning off when serving production over plain http to another host.
const secureCookie = (process.env.COOKIE_SECURE ?? String(process.env.NODE_ENV === "production")) === "true";

// Requiring a JSON content type means a cross-site form can't post here; other
// sites can't send JSON without a CORS preflight, which we never allow.
async function jsonBody(c: Context): Promise<unknown> {
  if (!c.req.header("content-type")?.startsWith("application/json")) {
    throw new ApiError(400, "Content-Type must be application/json");
  }
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

app.post("/api/auth/login", async (c) => {
  const { email, password } = ((await jsonBody(c)) ?? {}) as { email?: unknown; password?: unknown };
  const { token, user } = await login(email, password);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return c.json(user);
});

app.post("/api/auth/logout", async (c) => {
  await logout(getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

// Everything below needs a logged-in user.
app.use("/api/*", async (c, next) => {
  const user = await sessionUser(getCookie(c, SESSION_COOKIE));
  if (!user) throw new ApiError(401, "Not logged in");
  c.set("user", user);
  await next();
});

app.get("/api/auth/me", (c) => c.json(c.var.user));

app.get("/api/users", async (c) => c.json(await listUsers()));

app.post("/api/users", async (c) => c.json(await createUser(parseNewUser(await jsonBody(c)), c.var.user.email), 201));

app.delete("/api/users/:id", async (c) => {
  await deleteUser(c.req.param("id"), c.var.user.id);
  return c.body(null, 204);
});

app.get("/api/members", async (c) => c.json(await listMembers(c.req.query())));

// Before /api/groups/:type/:id, which would otherwise take "member-types" as an id.
app.get("/api/groups/:type/member-types", async (c) => c.json(await listMemberTypes(c.req.param("type"))));

for (const [kind, base] of [["item", "/api/items"], ["group", "/api/groups"]] as [MemberKind, string][]) {
  app.get(`${base}/:type`, async (c) => c.json(await listConfigs(kind, c.req.param("type"))));

  app.get(`${base}/:type/:id`, async (c) => c.json(await getConfig(kind, c.req.param("type"), c.req.param("id"))));

  app.post(`${base}/:type`, async (c) => {
    const body = await jsonBody(c);
    // Items post the item itself; groups post { item, members }.
    const { item, members } = kind === "group" ? ((body ?? {}) as { item?: unknown; members?: unknown }) : { item: body, members: undefined };
    return c.json(await createConfig(kind, c.req.param("type"), item, members, c.var.user.email), 201);
  });

  app.put(`${base}/:type/:id`, async (c) => {
    const body = await jsonBody(c);
    const { version, item, members } = (body ?? {}) as { version?: unknown; item?: unknown; members?: unknown };
    if (!Number.isInteger(version)) throw new ApiError(400, `"version" must be an integer`);
    return c.json(
      await updateConfig(kind, c.req.param("type"), c.req.param("id"), version as number, item, members, c.var.user.email),
    );
  });
}

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.text("Not found", 404)));

app.onError((e, c) => {
  if (e instanceof ApiError) return c.json({ error: e.message }, e.status);
  const code = pgErrorCode(e);
  if (code === PG_UNIQUE_VIOLATION) {
    return c.json({ error: `Already in use by another catalog member: ${(e as { detail?: string }).detail ?? e.message}` }, 409);
  }
  // Check constraints, and triggers such as the group cycle check.
  if (code === PG_CHECK_VIOLATION || code === PG_RAISE_EXCEPTION) return c.json({ error: e.message }, 400);
  console.error(e);
  return c.json({ error: "Internal server error" }, 500);
});

// The frontend itself is public; it shows the login form until /api/auth/me
// succeeds, and all data comes from the API above.
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`API listening on http://localhost:${port}`));
