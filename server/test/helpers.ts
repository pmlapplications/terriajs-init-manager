// Shared setup for the API tests: a client that calls the Hono app in-process
// (no port), a logged-in user, and fixtures for items, groups and init files.

import { app } from "../app.ts";
import { pool } from "../db.ts";
import { createUser } from "../users.ts";

export interface Response<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** Calls the API, keeping the session cookie from login like a browser would. */
export class Client {
  cookie: string | null = null;

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response<T>> {
    const res = await app.request(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (e.g. a plain-text 404); keep the text.
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  get = <T = any>(path: string) => this.request<T>("GET", path);
  post = <T = any>(path: string, body?: unknown) => this.request<T>("POST", path, body);
  put = <T = any>(path: string, body?: unknown) => this.request<T>("PUT", path, body);
  delete = <T = any>(path: string) => this.request<T>("DELETE", path);

  async login(email: string, password: string) {
    const res = await this.post("/api/auth/login", { email, password });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }
}

export const PASSWORD = "correct horse battery";

/** Deletes everything except the seeded catalog types and member type rules. */
export async function resetDatabase() {
  await pool.query(
    `truncate app_session, app_user, catalog_member, catalog_member_share_key, group_membership, init_file,
              init_file_catalog, init_file_workbench, init_file_output, init_file_release, catalog_member_revision cascade`,
  );
}

let userCount = 0;

/** Creates a user and returns a client logged in as them. */
export async function loggedInClient(firstName = "Test") {
  const email = `user${++userCount}-${Date.now()}@example.com`;
  const user = await createUser({ email, firstName, lastName: "User", password: PASSWORD }, "test");
  const client = new Client();
  const res = await client.login(email, PASSWORD);
  if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  return { client, user, email };
}

export async function createItem(client: Client, item: Record<string, unknown>, type = "wms") {
  const res = await client.post(`/api/items/${type}`, { name: "Item", ...item });
  if (res.status !== 201) throw new Error(`Create item failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function createGroup(client: Client, item: Record<string, unknown>, members: string[] = [], type = "group") {
  const res = await client.post(`/api/groups/${type}`, { item: { name: "Group", ...item }, members });
  if (res.status !== 201) throw new Error(`Create group failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

export const HOME_CAMERA = { west: -10, south: 45, east: 5, north: 60 };

export async function createInitFile(client: Client, fields: Record<string, unknown> = {}) {
  const res = await client.post("/api/init-files", {
    slug: "test-map",
    name: "Test map",
    description: null,
    config: { homeCamera: HOME_CAMERA },
    catalog: [],
    workbench: [],
    ...fields,
  });
  if (res.status !== 201) throw new Error(`Create init file failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function setPublished(memberId: string, published: boolean) {
  await pool.query("update catalog_member set is_published = $2 where id = $1", [memberId, published]);
}
