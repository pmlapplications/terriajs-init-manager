import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db.ts";
import { createGroup, createItem, loggedInClient, resetDatabase, setPublished, type Client } from "./helpers.ts";

let client: Client;
let email: string;

beforeAll(async () => {
  await resetDatabase();
  ({ client, email } = await loggedInClient());
});
beforeEach(() => pool.query("truncate catalog_member, catalog_member_revision cascade"));
afterAll(() => pool.end());

const MISSING = "00000000-0000-0000-0000-000000000000";

describe("items", () => {
  it("round-trips an item: columns, share keys and traits", async () => {
    const item = {
      id: "sst",
      name: "Sea surface temperature",
      description: "Daily SST",
      url: "https://example.com/wms",
      layers: "sst",
      opacity: 0.8,
      legends: [{ url: "https://example.com/legend.png" }],
      shareKeys: ["Root/SST", "old-sst", "old-sst"],
    };
    const created = await createItem(client, item);
    expect(created).toMatchObject({ type: "wms", terriaId: "sst", name: item.name, url: item.url, isPublished: true, version: 1 });
    expect(created.item).toEqual({ ...item, shareKeys: ["Root/SST", "old-sst"] });

    const loaded = await client.get(`/api/items/wms/${created.id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.item).toEqual(created.item);

    const { rows } = await pool.query("select traits, created_by, updated_by from catalog_member where id = $1", [created.id]);
    expect(rows[0].traits).toEqual({ layers: "sst", opacity: 0.8, legends: item.legends });
    expect(rows[0]).toMatchObject({ created_by: email, updated_by: email });
  });

  it("leaves empty optional columns out", async () => {
    const created = await createItem(client, { name: "Bare", description: "", url: null });
    expect(created.item).toEqual({ name: "Bare" });
    expect(created.terriaId).toBeNull();
  });

  it("accepts a matching type in the body", async () => {
    expect((await client.post("/api/items/wms", { type: "wms", name: "x" })).status).toBe(201);
  });

  it.each([
    ["a missing name", { layers: "a" }, /"name" is required/],
    ["a blank name", { name: "  " }, /"name" is required/],
    ["the wrong type", { name: "x", type: "csv" }, /Expected "type": "wms"/],
    ["members on an item", { name: "x", members: [] }, /members/],
    ["a non-string url", { name: "x", url: 5 }, /"url" must be a string/],
    ["bad share keys", { name: "x", shareKeys: [1] }, /shareKeys/],
  ])("rejects %s", async (_label, item, message) => {
    const res = await client.post("/api/items/wms", item);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("rejects a body that isn't an object", async () => {
    expect((await client.post("/api/items/wms", [1, 2])).status).toBe(400);
  });

  it("404s an unknown type, and a group type used as an item", async () => {
    expect((await client.post("/api/items/not-a-type", { name: "x" })).status).toBe(404);
    expect((await client.get("/api/items/group")).status).toBe(404);
    expect((await client.post("/api/groups/wms", { item: { name: "x" } })).status).toBe(404);
  });

  it("rejects a Terria id already used by another member", async () => {
    await createItem(client, { id: "dup" });
    const res = await client.post("/api/items/wms", { name: "x", id: "dup" });
    expect(res.status).toBe(409);
  });

  it("lists items of a type, newest first, without bodies", async () => {
    const a = await createItem(client, { name: "A" });
    const b = await createItem(client, { name: "B" });
    await createItem(client, { name: "C" }, "csv");
    const res = await client.get("/api/items/wms");
    expect(res.body.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
    expect(res.body[0]).not.toHaveProperty("item");
  });

  it("404s an unknown or malformed id", async () => {
    expect((await client.get(`/api/items/wms/${MISSING}`)).status).toBe(404);
    expect((await client.get("/api/items/wms/nope")).status).toBe(404);
    const csv = await createItem(client, {}, "csv");
    expect((await client.get(`/api/items/wms/${csv.id}`)).status).toBe(404);
  });

  it("updates with the current version and bumps it", async () => {
    const created = await createItem(client, { name: "Old", layers: "a" });
    const res = await client.put(`/api/items/wms/${created.id}`, { version: 1, item: { name: "New", styles: "s" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "New", version: 2 });
    expect(res.body.item).toEqual({ name: "New", styles: "s" });
  });

  it("rejects an update based on a stale version", async () => {
    const created = await createItem(client, {});
    await client.put(`/api/items/wms/${created.id}`, { version: 1, item: { name: "First" } });
    const res = await client.put(`/api/items/wms/${created.id}`, { version: 1, item: { name: "Second" } });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/now version 2/);
  });

  it("requires an integer version to update, and 404s a missing item", async () => {
    const created = await createItem(client, {});
    expect((await client.put(`/api/items/wms/${created.id}`, { item: { name: "x" } })).status).toBe(400);
    expect((await client.put(`/api/items/wms/${MISSING}`, { version: 1, item: { name: "x" } })).status).toBe(404);
  });

  it("records a revision for every change", async () => {
    const created = await createItem(client, {});
    await client.put(`/api/items/wms/${created.id}`, { version: 1, item: { name: "x" } });
    const { rows } = await pool.query("select operation, version from catalog_member_revision where member_id = $1 order by id", [created.id]);
    expect(rows).toEqual([
      { operation: "INSERT", version: 1 },
      { operation: "UPDATE", version: 2 },
    ]);
  });
});

describe("groups", () => {
  it("stores members in order and returns them as references", async () => {
    const a = await createItem(client, { name: "A" });
    const b = await createItem(client, { name: "B" }, "csv");
    const inner = await createGroup(client, { name: "Inner" });
    const group = await createGroup(client, { name: "Outer", description: "d" }, [b.id, inner.id, a.id]);
    expect(group.item).toEqual({ name: "Outer", description: "d" });
    expect(group.members.map((m: { name: string; kind: string }) => [m.name, m.kind])).toEqual([
      ["B", "item"],
      ["Inner", "group"],
      ["A", "item"],
    ]);
    expect((await client.get(`/api/groups/group/${group.id}`)).body.members).toEqual(group.members);
  });

  it("keeps members when an update leaves them out, and replaces them when given", async () => {
    const a = await createItem(client, {});
    const b = await createItem(client, {});
    const group = await createGroup(client, {}, [a.id]);
    const kept = await client.put(`/api/groups/group/${group.id}`, { version: 1, item: { name: "Renamed" } });
    expect(kept.body.members.map((m: { id: string }) => m.id)).toEqual([a.id]);
    const replaced = await client.put(`/api/groups/group/${group.id}`, { version: 2, item: { name: "Renamed" }, members: [b.id] });
    expect(replaced.body.members.map((m: { id: string }) => m.id)).toEqual([b.id]);
  });

  it("lists the member types a group type may contain", async () => {
    const plain = await client.get("/api/groups/group/member-types");
    expect(plain.body).toEqual(expect.arrayContaining(["wms", "csv", "group", "wms-group"]));
    const wms = await client.get("/api/groups/wms-group/member-types");
    expect(wms.body).toEqual(["wms", "wms-group"]);
    expect((await client.get("/api/groups/wms/member-types")).status).toBe(404);
  });

  it("rejects members the group type doesn't allow", async () => {
    const csv = await createItem(client, { name: "Table" }, "csv");
    const res = await client.post("/api/groups/wms-group", { item: { name: "WMS" }, members: [csv.id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/A wms-group can't contain “Table” \(csv\)/);
  });

  it.each([
    ["not an array", "abc", /must be an array/],
    ["not ids", ["abc"], /must be an array/],
    ["unknown ids", [MISSING], /No catalog item or group/],
  ])("rejects members that are %s", async (_label, members, message) => {
    const res = await client.post("/api/groups/group", { item: { name: "G" }, members });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("rejects duplicate members, the group itself, and cycles", async () => {
    const a = await createItem(client, {});
    expect((await client.post("/api/groups/group", { item: { name: "G" }, members: [a.id, a.id] })).body.error).toMatch(/twice/);

    const parent = await createGroup(client, { name: "Parent" });
    const child = await createGroup(client, { name: "Child" });
    await client.put(`/api/groups/group/${parent.id}`, { version: 1, item: { name: "Parent" }, members: [child.id] });

    const self = await client.put(`/api/groups/group/${child.id}`, { version: 1, item: { name: "Child" }, members: [child.id] });
    expect(self.status).toBe(400);
    expect(self.body.error).toMatch(/contain itself/);

    const cycle = await client.put(`/api/groups/group/${child.id}`, { version: 1, item: { name: "Child" }, members: [parent.id] });
    expect(cycle.status).toBe(400);
    expect(cycle.body.error).toMatch(/“Parent” already contains this group/);
  });
});

describe("member search", () => {
  const ids = (res: { body: { items: { name: string }[] } }) => res.body.items.map((m) => m.name);

  it("pages through every item and group, newest first by default", async () => {
    for (const name of ["One", "Two", "Three"]) await createItem(client, { name });
    await createGroup(client, { name: "Folder" });
    const res = await client.get("/api/members?pageSize=2&page=2");
    expect(res.body).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(ids(res)).toEqual(["Two", "One"]);
  });

  it("searches name, Terria id, url and description, treating % and _ literally", async () => {
    await createItem(client, { name: "Chlorophyll" });
    await createItem(client, { name: "B", id: "chl-terria" });
    await createItem(client, { name: "C", url: "https://chl.example.com" });
    await createItem(client, { name: "D", description: "about CHL" });
    await createItem(client, { name: "100% wild_card" });
    expect(ids(await client.get("/api/members?q=chl&sort=name&dir=asc"))).toEqual(["B", "C", "Chlorophyll", "D"]);
    expect(ids(await client.get("/api/members?q=%25"))).toEqual(["100% wild_card"]);
    expect(ids(await client.get("/api/members?q=d_c"))).toEqual(["100% wild_card"]);
    expect(ids(await client.get("/api/members?q=1_0"))).toEqual([]);
  });

  it("filters by kind, type, allowed member types and published state", async () => {
    const hidden = await createItem(client, { name: "WMS" });
    await createItem(client, { name: "CSV" }, "csv");
    await createGroup(client, { name: "Group" });
    await setPublished(hidden.id, false);
    const names = async (query: string) => ids(await client.get(`/api/members?sort=name&dir=asc&${query}`));
    expect(await names("kind=group")).toEqual(["Group"]);
    expect(await names("kind=item")).toEqual(["CSV", "WMS"]);
    expect(await names("type=csv,group")).toEqual(["CSV", "Group"]);
    expect(await names("memberOf=wms-group")).toEqual(["WMS"]);
    expect(await names("published=false")).toEqual(["WMS"]);
    expect(await names("published=true")).toEqual(["CSV", "Group"]);
  });

  it("limits to members of groups at any depth with `within`", async () => {
    const deep = await createItem(client, { name: "Deep" });
    await createItem(client, { name: "Outside" });
    const inner = await createGroup(client, { name: "Inner" }, [deep.id]);
    const outer = await createGroup(client, { name: "Outer" }, [inner.id]);
    expect(ids(await client.get(`/api/members?within=${outer.id}&sort=name&dir=asc`))).toEqual(["Deep", "Inner"]);
    expect(ids(await client.get("/api/members?within="))).toEqual([]);
  });

  it("returns member counts for groups only", async () => {
    const a = await createItem(client, { name: "A" });
    await createGroup(client, { name: "G" }, [a.id]);
    const res = await client.get("/api/members?sort=name&dir=asc");
    expect(res.body.items.map((m: { memberCount: number | null }) => m.memberCount)).toEqual([null, 1]);
  });

  it("sorts by any column, with nulls last", async () => {
    await createItem(client, { name: "No url" });
    await createItem(client, { name: "B url", url: "https://b" });
    await createItem(client, { name: "A url", url: "https://a" });
    expect(ids(await client.get("/api/members?sort=url&dir=asc"))).toEqual(["A url", "B url", "No url"]);
    expect(ids(await client.get("/api/members?sort=url&dir=desc"))).toEqual(["B url", "A url", "No url"]);
  });

  it("caps the page size at 200", async () => {
    expect((await client.get("/api/members?pageSize=1000")).body.pageSize).toBe(200);
  });

  it.each([
    ["sort=password", /Can't sort/],
    ["kind=reference", /"kind"/],
    ["page=0", /"page"/],
    ["pageSize=abc", /"pageSize"/],
    ["within=nope", /"within"/],
  ])("rejects %s", async (query, message) => {
    const res = await client.get(`/api/members?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});
