import { describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { json, mockFetch } from "./test/fetch";

describe("request handling", () => {
  it("sends JSON and returns the parsed body", async () => {
    const user = { id: "u1", email: "a@example.com" };
    const { fetch, calls } = mockFetch({ "POST /api/auth/login": user });
    expect(await api.login("a@example.com", "pw")).toEqual(user);
    expect(calls[0].body).toEqual({ email: "a@example.com", password: "pw" });
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("returns null for 204 No Content", async () => {
    mockFetch({ "DELETE /api/users/u1": () => json(null, 204) });
    expect(await api.deleteUser("u1")).toBeNull();
  });

  it("throws ApiError with the server's message and status", async () => {
    mockFetch({ "GET /api/users": () => json({ error: "Nope" }, 409) });
    const error = await api.listUsers().catch((e) => e);
    expect(error).toBeInstanceOf(api.ApiError);
    expect(error).toMatchObject({ status: 409, message: "Nope" });
  });

  it("falls back to the status text when the error body isn't JSON", async () => {
    mockFetch({ "GET /api/users": () => new Response("<html>", { status: 502, statusText: "Bad Gateway" }) });
    await expect(api.listUsers()).rejects.toThrow("502 Bad Gateway");
  });

  it("announces an expired session, except for a failed login", async () => {
    const listener = vi.fn();
    window.addEventListener(api.UNAUTHORIZED_EVENT, listener);
    mockFetch({ "GET /api/users": () => json({ error: "Not logged in" }, 401), "POST /api/auth/login": () => json({ error: "Wrong" }, 401) });
    await api.listUsers().catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    await api.login("a", "b").catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(api.UNAUTHORIZED_EVENT, listener);
  });
});

describe("currentUser", () => {
  it("returns the user, or null when not logged in", async () => {
    mockFetch({ "GET /api/auth/me": { id: "u1" } });
    expect(await api.currentUser()).toEqual({ id: "u1" });
    mockFetch({ "GET /api/auth/me": () => json({ error: "Not logged in" }, 401) });
    expect(await api.currentUser()).toBeNull();
  });

  it("passes other errors on", async () => {
    mockFetch({ "GET /api/auth/me": () => json({ error: "Down" }, 500) });
    await expect(api.currentUser()).rejects.toThrow("Down");
  });
});

describe("endpoints", () => {
  it.each([
    ["listUsers", () => api.listUsers(), "GET", "/api/users", undefined],
    ["createUser", () => api.createUser({ email: "e", firstName: "f", lastName: "l", password: "p" }), "POST", "/api/users", { email: "e", firstName: "f", lastName: "l", password: "p" }],
    ["logout", () => api.logout(), "POST", "/api/auth/logout", undefined],
    ["listConfigs item", () => api.listConfigs("item", "wms"), "GET", "/api/items/wms", undefined],
    ["listConfigs group", () => api.listConfigs("group", "wms-group"), "GET", "/api/groups/wms-group", undefined],
    ["loadConfig", () => api.loadConfig("item", "wms", "a/b"), "GET", "/api/items/wms/a%2Fb", undefined],
    ["create item", () => api.saveConfig("item", "wms", { name: "x" }, undefined), "POST", "/api/items/wms", { name: "x" }],
    ["create group", () => api.saveConfig("group", "group", { name: "g" }, ["m1"]), "POST", "/api/groups/group", { item: { name: "g" }, members: ["m1"] }],
    ["update item", () => api.saveConfig("item", "wms", { name: "x" }, undefined, { id: "i1", version: 2 }), "PUT", "/api/items/wms/i1", { version: 2, item: { name: "x" } }],
    ["listMemberTypes", () => api.listMemberTypes("wms-group"), "GET", "/api/groups/wms-group/member-types", undefined],
    ["listInitFiles", () => api.listInitFiles(), "GET", "/api/init-files", undefined],
    ["loadInitFile", () => api.loadInitFile("f1"), "GET", "/api/init-files/f1", undefined],
    ["deleteInitFile", () => api.deleteInitFile("f1"), "DELETE", "/api/init-files/f1", undefined],
    ["exportInitFile", () => api.exportInitFile("f1"), "GET", "/api/init-files/f1/export", undefined],
    ["publish", () => api.setInitFileOutput("f1", "published", true), "POST", "/api/init-files/f1/publish", undefined],
    ["unpublish", () => api.setInitFileOutput("f1", "published", false), "DELETE", "/api/init-files/f1/publish", undefined],
    ["test on", () => api.setInitFileOutput("f1", "test", true), "POST", "/api/init-files/f1/test", undefined],
    ["test off", () => api.setInitFileOutput("f1", "test", false), "DELETE", "/api/init-files/f1/test", undefined],
  ])("%s", async (_label, call, method, path, body) => {
    const { calls } = mockFetch({ [`${method} ${path}`]: {} });
    await call();
    expect(calls).toEqual([{ method, url: path, body }]);
  });

  it("saves init files as new or as an update of a version", async () => {
    const file = { slug: "s", name: "n", description: null, config: {}, catalog: [], workbench: [] };
    const { calls } = mockFetch({ "POST /api/init-files": {}, "PUT /api/init-files/f1": {} });
    await api.saveInitFile(file);
    await api.saveInitFile(file, { id: "f1", version: 4 });
    expect(calls[0].body).toEqual(file);
    expect(calls[1].body).toEqual({ ...file, version: 4 });
  });

  it("builds the download link", () => {
    expect(api.initFileDownloadUrl("f1")).toBe("/api/init-files/f1/export?download");
  });
});

describe("listMembers", () => {
  const query = async (q: api.MemberListQuery) => {
    const { calls } = mockFetch({ "GET /api/members": { items: [], total: 0, page: 1, pageSize: 25 } });
    await api.listMembers(q);
    return Object.fromEntries(new URL(calls[0].url, "http://x").searchParams);
  };

  it("sends only the filters that are set", async () => {
    expect(await query({})).toEqual({});
    expect(await query({ q: "  " })).toEqual({});
  });

  it("encodes every filter", async () => {
    expect(
      await query({
        q: " sst ",
        kind: "item",
        types: ["wms", "csv"],
        memberOf: "group",
        within: ["g1", "g2"],
        published: false,
        sort: "name",
        dir: "asc",
        page: 2,
        pageSize: 50,
      }),
    ).toEqual({ q: "sst", kind: "item", type: "wms,csv", memberOf: "group", within: "g1,g2", published: "false", sort: "name", dir: "asc", page: "2", pageSize: "50" });
  });

  it("sends an empty `within` so an empty catalog finds nothing", async () => {
    expect(await query({ within: [] })).toEqual({ within: "" });
  });
});
