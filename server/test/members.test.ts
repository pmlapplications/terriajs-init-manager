import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db.ts";
import { createGroup, createInitFile, createItem, loggedInClient, resetDatabase, setPublished, type Client } from "./helpers.ts";

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

describe("deleting", () => {
  // init_file isn't truncated between tests, so each init file needs its own slug.
  let files = 0;
  const initFile = (fields: Record<string, unknown>) => createInitFile(client, { slug: `delete-${++files}`, name: `Map ${files}`, ...fields });

  it("deletes an unused item, removing it from its groups", async () => {
    const item = await createItem(client, { name: "Gone" });
    const group = await createGroup(client, { name: "G" }, [item.id]);
    const res = await client.delete(`/api/items/wms/${item.id}`);
    expect(res.status).toBe(204);
    expect((await client.get(`/api/items/wms/${item.id}`)).status).toBe(404);
    expect((await client.get(`/api/groups/group/${group.id}`)).body.members).toEqual([]);
    const { rows } = await pool.query("select operation from catalog_member_revision where member_id = $1 order by id", [item.id]);
    expect(rows.map((r) => r.operation)).toEqual(["INSERT", "DELETE"]);
  });

  it("deletes a group but keeps its members", async () => {
    const item = await createItem(client, { name: "Kept" });
    const inner = await createGroup(client, { name: "Inner" }, [item.id]);
    const group = await createGroup(client, { name: "Outer" }, [inner.id]);
    expect((await client.delete(`/api/groups/group/${group.id}`)).status).toBe(204);
    expect((await client.get(`/api/groups/group/${group.id}`)).status).toBe(404);
    expect((await client.get(`/api/groups/group/${inner.id}`)).body.members.map((m: { id: string }) => m.id)).toEqual([item.id]);
    expect((await client.get(`/api/items/wms/${item.id}`)).status).toBe(200);
  });

  it("refuses to delete members an init file uses, at any depth", async () => {
    const item = await createItem(client, { name: "Layer" });
    const inner = await createGroup(client, { name: "Inner" }, [item.id]);
    const outer = await createGroup(client, { name: "Outer" }, [inner.id]);
    await initFile({ name: "Ocean map", catalog: [outer.id] });
    await initFile({ name: "Atlas", catalog: [outer.id], workbench: [item.id] });

    for (const [path, name] of [
      [`/api/items/wms/${item.id}`, "Layer"],
      [`/api/groups/group/${inner.id}`, "Inner"],
      [`/api/groups/group/${outer.id}`, "Outer"],
    ]) {
      const res = await client.delete(path);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        `“${name}” is used by the init files “Atlas”, “Ocean map”; remove it, or the groups containing it, from them before deleting it`,
      );
    }
    expect((await client.get(`/api/items/wms/${item.id}`)).status).toBe(200);
  });

  it("404s a missing member, or one of another type or kind", async () => {
    const item = await createItem(client, {});
    expect((await client.delete(`/api/items/wms/${MISSING}`)).status).toBe(404);
    expect((await client.delete("/api/items/wms/nope")).status).toBe(404);
    expect((await client.delete(`/api/items/csv/${item.id}`)).status).toBe(404);
    expect((await client.delete(`/api/groups/wms/${item.id}`)).status).toBe(404);
    expect((await client.get(`/api/items/wms/${item.id}`)).status).toBe(200);
  });

  it("counts the init files using each member, and finds orphans", async () => {
    const used = await createItem(client, { name: "A used item" });
    const grouped = await createItem(client, { name: "B unused item" });
    await createItem(client, { name: "D orphan item" });
    const usedGroup = await createGroup(client, { name: "E used group" }, [used.id]);
    await createGroup(client, { name: "C orphan group" }, [grouped.id]);
    await initFile({ catalog: [usedGroup.id] });
    await initFile({ catalog: [usedGroup.id] });

    const res = await client.get("/api/members?sort=name&dir=asc");
    expect(res.body.items.map((m: { name: string; initFileCount: number }) => [m.name, m.initFileCount])).toEqual([
      ["A used item", 2],
      ["B unused item", 0],
      ["C orphan group", 0],
      ["D orphan item", 0],
      ["E used group", 2],
    ]);
    const names = async (query: string) => ids(await client.get(`/api/members?sort=name&dir=asc&${query}`));
    expect(await names("orphaned=true")).toEqual(["C orphan group", "D orphan item"]);
    expect(await names("orphaned=true&kind=item")).toEqual(["D orphan item"]);
    expect(await names("orphaned=false")).toEqual(["A used item", "B unused item", "E used group"]);
  });
});

describe("bulk update", () => {
  it("sets the same traits on several configs, keeping their other traits", async () => {
    const a = await createItem(client, { id: "a", name: "A", url: "https://a.example/wms", opacity: 0.2, layers: "a" });
    const b = await createItem(client, { id: "b", name: "B", shareKeys: ["old-b"], rectangle: { west: 1, south: 2, east: 3, north: 4 } });
    const other = await createItem(client, { name: "Other" });

    const res = await client.post("/api/items/wms/bulk-update", {
      ids: [a.id, b.id],
      set: { url: "https://shared.example/wms", opacity: 0.7, rectangle: { west: 0, south: 0, east: 10, north: 10 } },
    });
    expect(res.status).toBe(200);
    expect(res.body.map((m: { name: string; version: number }) => [m.name, m.version]).sort()).toEqual([
      ["A", 2],
      ["B", 2],
    ]);

    const load = async (id: string) => (await client.get(`/api/items/wms/${id}`)).body.item;
    expect(await load(a.id)).toEqual({
      id: "a",
      name: "A",
      url: "https://shared.example/wms",
      opacity: 0.7,
      layers: "a",
      rectangle: { west: 0, south: 0, east: 10, north: 10 },
    });
    expect(await load(b.id)).toEqual({
      id: "b",
      name: "B",
      url: "https://shared.example/wms",
      opacity: 0.7,
      rectangle: { west: 0, south: 0, east: 10, north: 10 },
      shareKeys: ["old-b"],
    });
    expect(await load(other.id)).toEqual({ name: "Other" });
    const { rows } = await pool.query("select updated_by from catalog_member where id = $1", [a.id]);
    expect(rows[0].updated_by).toBe(email);
  });

  it("keeps a group's members", async () => {
    const item = await createItem(client, {});
    const group = await createGroup(client, { name: "G" }, [item.id]);
    expect((await client.post("/api/groups/group/bulk-update", { ids: [group.id], set: { isOpen: true } })).status).toBe(200);
    const loaded = (await client.get(`/api/groups/group/${group.id}`)).body;
    expect(loaded.item).toEqual({ name: "G", isOpen: true });
    expect(loaded.members.map((m: { id: string }) => m.id)).toEqual([item.id]);
  });

  it("refuses unique traits, bad input and other types, changing nothing", async () => {
    const a = await createItem(client, { name: "A" });
    const csv = await createItem(client, { name: "C" }, "csv");
    const post = (body: unknown, type = "wms") => client.post(`/api/items/${type}/bulk-update`, body);

    const unique = await post({ ids: [a.id], set: { id: "same", shareKeys: ["x"] } });
    expect(unique.status).toBe(400);
    expect(unique.body.error).toMatch(/"id" and "shareKeys" must be unique/);
    expect((await post({ ids: [a.id], set: {} })).status).toBe(400);
    expect((await post({ ids: [], set: { opacity: 1 } })).status).toBe(400);
    expect((await post({ ids: [a.id], set: { members: [] } })).status).toBe(400);
    expect((await post({ ids: [a.id], set: { opacity: null } })).status).toBe(400);
    const blank = await post({ ids: [a.id], set: { name: "" } });
    expect(blank.status).toBe(400);
    expect(blank.body.error).toMatch(/^“A”: "name" is required/);

    const mixed = await post({ ids: [a.id, csv.id], set: { opacity: 1 } });
    expect(mixed.status).toBe(404);
    expect(mixed.body.error).toContain(csv.id);
    expect((await post({ ids: [a.id], set: { opacity: 1 } }, "nope")).status).toBe(404);
    expect((await client.get(`/api/items/wms/${a.id}`)).body).toMatchObject({ version: 1, item: { name: "A" } });
  });
});

const ids = (res: { body: { items: { name: string }[] } }) => res.body.items.map((m) => m.name);

describe("member search", () => {
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
    ["orphaned=yes", /"orphaned"/],
  ])("rejects %s", async (query, message) => {
    const res = await client.get(`/api/members?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});
