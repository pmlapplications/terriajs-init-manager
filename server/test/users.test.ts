import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db.ts";
import { Client, PASSWORD, loggedInClient, resetDatabase, type Client as ClientType } from "./helpers.ts";

let client: ClientType;
let me: { id: string; email: string };

beforeAll(async () => {
  await resetDatabase();
  const login = await loggedInClient("Admin");
  client = login.client;
  me = login.user;
});
afterAll(() => pool.end());

const newUser = (overrides: Record<string, unknown> = {}) => ({
  email: `new-${Math.random().toString(36).slice(2)}@example.com`,
  firstName: "New",
  lastName: "Person",
  password: PASSWORD,
  ...overrides,
});

describe("users", () => {
  it("creates a user who can then log in", async () => {
    const body = newUser({ firstName: "  Ada ", lastName: " Lovelace " });
    const res = await client.post("/api/users", body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: body.email, firstName: "Ada", lastName: "Lovelace" });
    expect(res.body).not.toHaveProperty("password");
    expect((await new Client().login(body.email, PASSWORD)).status).toBe(200);
  });

  it("lists users by last name", async () => {
    await client.post("/api/users", newUser({ lastName: "Aardvark" }));
    await client.post("/api/users", newUser({ lastName: "zebra" }));
    const res = await client.get("/api/users");
    expect(res.status).toBe(200);
    const lastNames = res.body.map((u: { lastName: string }) => u.lastName.toLowerCase());
    expect(lastNames).toEqual([...lastNames].sort());
    expect(res.body[0]).not.toHaveProperty("passwordHash");
  });

  it.each([
    ["no email", { email: "" }, /Email is required/],
    ["a bad email", { email: "not-an-email" }, /not valid/],
    ["a short password", { password: "short" }, /at least 10/],
    ["a huge password", { password: "x".repeat(1025) }, /too long/],
    ["no first name", { firstName: " " }, /First name is required/],
    ["no last name", { lastName: undefined }, /Last name is required/],
  ])("rejects %s", async (_label, overrides, message) => {
    const res = await client.post("/api/users", newUser(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("rejects a duplicate email", async () => {
    const body = newUser();
    await client.post("/api/users", body);
    const res = await client.post("/api/users", { ...body, firstName: "Other" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  it("records who created a user", async () => {
    const res = await client.post("/api/users", newUser());
    const { rows } = await pool.query("select created_by from app_user where id = $1", [res.body.id]);
    expect(rows[0].created_by).toBe(me.email);
  });

  it("deletes a user and ends their sessions", async () => {
    const other = await loggedInClient("Doomed");
    expect((await other.client.get("/api/auth/me")).status).toBe(200);
    const res = await client.delete(`/api/users/${other.user.id}`);
    expect(res.status).toBe(204);
    expect((await other.client.get("/api/auth/me")).status).toBe(401);
    expect((await client.get("/api/users")).body.some((u: { id: string }) => u.id === other.user.id)).toBe(false);
  });

  it("won't let you delete yourself", async () => {
    const res = await client.delete(`/api/users/${me.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/your own account/);
  });

  it.each(["00000000-0000-0000-0000-000000000000", "not-a-uuid"])("404s deleting unknown user %s", async (id) => {
    expect((await client.delete(`/api/users/${id}`)).status).toBe(404);
  });
});
