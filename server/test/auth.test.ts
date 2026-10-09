import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db.ts";
import { VERSION } from "../version.ts";
import { Client, PASSWORD, loggedInClient, resetDatabase } from "./helpers.ts";

beforeAll(resetDatabase);
afterAll(() => pool.end());

describe("health", () => {
  it("is public and reports the version", async () => {
    const res = await new Client().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: VERSION });
  });
});

describe("login", () => {
  it("sets an HttpOnly, SameSite=Strict session cookie and returns the user", async () => {
    const { email } = await loggedInClient();
    const client = new Client();
    const res = await client.login(email, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email, firstName: "Test", lastName: "User" });
    expect(res.body).not.toHaveProperty("passwordHash");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^tlm_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Max-Age=43200/);
  });

  it("matches the email case-insensitively", async () => {
    const { email } = await loggedInClient();
    expect((await new Client().login(email.toUpperCase(), PASSWORD)).status).toBe(200);
  });

  it.each([
    ["a wrong password", (email: string) => ({ email, password: "wrong password" })],
    ["an unknown email", () => ({ email: "nobody@example.com", password: PASSWORD })],
    ["a missing password", (email: string) => ({ email })],
    ["an over-long password", (email: string) => ({ email, password: "x".repeat(1025) })],
  ])("rejects %s with the same 401", async (_label, body) => {
    const { email } = await loggedInClient();
    const res = await new Client().post("/api/auth/login", body(email));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Incorrect email or password" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("needs a JSON content type", async () => {
    const res = await new Client().request("POST", "/api/auth/login", "email=a&password=b", {
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Content-Type/);
  });

  it("rejects a body that isn't JSON", async () => {
    const res = await new Client().request("POST", "/api/auth/login", "{not json", { "Content-Type": "application/json" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be JSON/);
  });
});

describe("sessions", () => {
  it("returns the logged-in user from /api/auth/me", async () => {
    const { client, email } = await loggedInClient("Me");
    const res = await client.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email, firstName: "Me" });
  });

  it.each([
    ["GET", "/api/auth/me"],
    ["GET", "/api/users"],
    ["GET", "/api/members"],
    ["GET", "/api/items/wms"],
    ["POST", "/api/groups/group"],
    ["GET", "/api/init-files"],
    ["POST", "/api/init-files/00000000-0000-0000-0000-000000000000/publish"],
  ])("%s %s needs a session", async (method, path) => {
    const res = await new Client().request(method, path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Not logged in" });
  });

  it("rejects an unknown session token", async () => {
    const client = new Client();
    client.cookie = "tlm_session=forged";
    expect((await client.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects an expired session", async () => {
    const { client } = await loggedInClient();
    await pool.query("update app_session set expires_at = now() - interval '1 minute'");
    expect((await client.get("/api/auth/me")).status).toBe(401);
  });

  it("ends the session on logout", async () => {
    const { client } = await loggedInClient();
    const cookie = client.cookie;
    const res = await client.post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/tlm_session=;/);
    client.cookie = cookie;
    expect((await client.get("/api/auth/me")).status).toBe(401);
  });

  it("allows logout without a session", async () => {
    expect((await new Client().post("/api/auth/logout")).status).toBe(204);
  });
});

describe("unknown routes", () => {
  it("returns JSON 404 under /api", async () => {
    const { client } = await loggedInClient();
    const res = await client.get("/api/nothing-here");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});
