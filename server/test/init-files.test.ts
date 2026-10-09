import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db.ts";
import { CONFIG_DIR } from "../init-files.ts";
import {
  Client,
  HOME_CAMERA,
  createGroup,
  createInitFile,
  createItem,
  loggedInClient,
  resetDatabase,
  setPublished,
  type Client as ClientType,
} from "./helpers.ts";

let client: ClientType;
let email: string;

beforeAll(async () => {
  await resetDatabase();
  ({ client, email } = await loggedInClient());
});
beforeEach(() => pool.query("truncate catalog_member, init_file cascade"));
afterAll(() => pool.end());

const MISSING = "00000000-0000-0000-0000-000000000000";
const onDisk = (path: string) => join(CONFIG_DIR, path);
const readJson = (path: string) => JSON.parse(readFileSync(onDisk(path), "utf8"));

/** A group holding one item, both published. */
async function catalog() {
  const item = await createItem(client, { id: "sst", name: "SST", url: "https://example.com/wms", layers: "sst" });
  const group = await createGroup(client, { id: "ocean", name: "Ocean" }, [item.id]);
  return { item, group };
}

/** The editor's body for an existing init file, with changes. */
const bodyOf = (file: any, changes: Record<string, unknown> = {}) => ({
  slug: file.slug,
  name: file.name,
  description: file.description,
  config: file.config,
  catalog: file.catalog.map((m: { id: string }) => m.id),
  workbench: file.workbench.map((m: { id: string }) => m.id),
  version: file.version,
  ...changes,
});

describe("init files", () => {
  it("creates, loads and lists an init file", async () => {
    const { item, group } = await catalog();
    const created = await createInitFile(client, {
      name: "  Ocean map ",
      description: "For the ocean team",
      config: { homeCamera: HOME_CAMERA, viewerMode: "2d" },
      catalog: [group.id],
      workbench: [item.id],
    });
    expect(created).toMatchObject({
      slug: "test-map",
      name: "Ocean map",
      description: "For the ocean team",
      config: { homeCamera: HOME_CAMERA, viewerMode: "2d" },
      catalogCount: 1,
      version: 1,
      updatedBy: email,
      published: null,
      test: null,
    });
    expect(created.catalog).toEqual([{ id: group.id, type: "group", kind: "group", terriaId: "ocean", name: "Ocean" }]);
    expect(created.workbench).toEqual([{ id: item.id, type: "wms", kind: "item", terriaId: "sst", name: "SST" }]);

    expect((await client.get(`/api/init-files/${created.id}`)).body).toEqual(created);
    const list = await client.get("/api/init-files");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty("config");
    expect(list.body[0]).toMatchObject({ id: created.id, catalogCount: 1, published: null, test: null });
  });

  it("lists init files by name", async () => {
    await createInitFile(client, { slug: "b", name: "beta" });
    await createInitFile(client, { slug: "a", name: "Alpha" });
    expect((await client.get("/api/init-files")).body.map((f: { name: string }) => f.name)).toEqual(["Alpha", "beta"]);
  });

  it.each([
    ["a bad file name", { slug: "../etc/passwd" }, /"slug"/],
    ["a file name starting with a dot", { slug: ".hidden" }, /"slug"/],
    ["no name", { name: " " }, /"name" is required/],
    ["a non-object config", { config: [] }, /"config" must be an object/],
    ["catalog inside config", { config: { catalog: [] } }, /not inside "config"/],
    ["a non-string description", { description: 5 }, /"description"/],
    ["bad catalog ids", { catalog: ["x"] }, /"catalog" must be an array/],
    ["repeated catalog ids", { catalog: [MISSING, MISSING] }, /twice/],
    ["unknown members", { catalog: [MISSING] }, /No catalog member/],
  ])("rejects %s", async (_label, fields, message) => {
    const res = await client.post("/api/init-files", { slug: "x", name: "X", config: {}, ...fields });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("only allows groups in the catalog and items from those groups on the workbench", async () => {
    const { item, group } = await catalog();
    const loose = await createItem(client, { name: "Loose" });
    const notGroup = await client.post("/api/init-files", { slug: "x", name: "X", config: {}, catalog: [item.id] });
    expect(notGroup.body.error).toMatch(/only contain groups, not “SST”/);
    const notItem = await client.post("/api/init-files", { slug: "x", name: "X", config: {}, catalog: [group.id], workbench: [group.id] });
    expect(notItem.body.error).toMatch(/only contain items, not “Ocean”/);
    const outside = await client.post("/api/init-files", { slug: "x", name: "X", config: {}, catalog: [group.id], workbench: [loose.id] });
    expect(outside.body.error).toMatch(/“Loose” is not/);
  });

  it("rejects a file name already in use", async () => {
    await createInitFile(client, { slug: "same" });
    expect((await client.post("/api/init-files", { slug: "same", name: "Other", config: {} })).status).toBe(409);
  });

  it("updates with the current version and rejects stale ones", async () => {
    const file = await createInitFile(client);
    const res = await client.put(`/api/init-files/${file.id}`, bodyOf(file, { name: "Renamed" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Renamed", version: 2 });
    const stale = await client.put(`/api/init-files/${file.id}`, bodyOf(file, { name: "Again" }));
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatch(/now version 2/);
    expect((await client.put(`/api/init-files/${file.id}`, bodyOf(file, { version: "1" }))).status).toBe(400);
    expect((await client.put(`/api/init-files/${MISSING}`, bodyOf(file))).status).toBe(404);
  });

  it("deletes an init file but keeps its groups and items", async () => {
    const { group } = await catalog();
    const file = await createInitFile(client, { catalog: [group.id] });
    expect((await client.delete(`/api/init-files/${file.id}`)).status).toBe(204);
    expect((await client.get(`/api/init-files/${file.id}`)).status).toBe(404);
    expect((await client.get(`/api/groups/group/${group.id}`)).status).toBe(200);
    expect((await client.delete(`/api/init-files/${file.id}`)).status).toBe(404);
    expect((await client.delete("/api/init-files/nope")).status).toBe(404);
  });
});

describe("export", () => {
  it("builds the init file JSON with published members only", async () => {
    const { item, group } = await catalog();
    const hidden = await createItem(client, { name: "Hidden" });
    await client.put(`/api/groups/group/${group.id}`, { version: 1, item: { id: "ocean", name: "Ocean" }, members: [item.id, hidden.id] });
    await setPublished(hidden.id, false);
    const file = await createInitFile(client, { config: { homeCamera: HOME_CAMERA }, catalog: [group.id], workbench: [item.id] });

    const res = await client.get(`/api/init-files/${file.id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(res.body).toEqual({
      homeCamera: HOME_CAMERA,
      catalog: [
        {
          id: "ocean",
          type: "group",
          name: "Ocean",
          members: [{ id: "sst", type: "wms", name: "SST", url: "https://example.com/wms", layers: "sst" }],
        },
      ],
      workbench: ["sst"],
    });

    await setPublished(item.id, false);
    const without = (await client.get(`/api/init-files/${file.id}/export`)).body;
    expect(without.catalog[0]).not.toHaveProperty("members");
    expect(without).not.toHaveProperty("workbench");
  });

  it("uses the database id for members without a Terria id", async () => {
    const group = await createGroup(client, { name: "No id" });
    const file = await createInitFile(client, { catalog: [group.id] });
    expect((await client.get(`/api/init-files/${file.id}/export`)).body.catalog[0].id).toBe(group.id);
  });

  it("offers <slug>.json as a download", async () => {
    const file = await createInitFile(client, { slug: "ocean-map" });
    const res = await client.get(`/api/init-files/${file.id}/export?download`);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="ocean-map.json"');
  });

  it("404s an unknown init file", async () => {
    expect((await client.get(`/api/init-files/${MISSING}/export`)).status).toBe(404);
  });
});

describe("publishing", () => {
  it("publishes to CONFIG_DIR/<slug>.json, served publicly at /config", async () => {
    const { group } = await catalog();
    const file = await createInitFile(client, { slug: "ocean-map", catalog: [group.id] });
    const res = await client.post(`/api/init-files/${file.id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.published).toMatchObject({ path: "/config/ocean-map.json", version: 1, writtenBy: email });
    expect(Date.parse(res.body.published.writtenAt)).not.toBeNaN();
    expect(res.body.test).toBeNull();

    const exported = (await client.get(`/api/init-files/${file.id}/export`)).body;
    expect(readJson("ocean-map.json")).toEqual(exported);
    expect(readFileSync(onDisk("ocean-map.json"), "utf8")).toBe(`${JSON.stringify(exported, null, 2)}\n`);

    const served = await new Client().get("/config/ocean-map.json");
    expect(served.status).toBe(200);
    expect(served.body).toEqual(exported);
    expect(served.headers.get("access-control-allow-origin")).toBe("*");
    expect(served.headers.get("cache-control")).toBe("no-cache");

    expect((await client.get("/api/init-files")).body[0].published.path).toBe("/config/ocean-map.json");
  });

  it("keeps the published file as a snapshot until it is published again", async () => {
    const file = await createInitFile(client, { slug: "snap" });
    await client.post(`/api/init-files/${file.id}/publish`);
    const saved = (await client.put(`/api/init-files/${file.id}`, bodyOf(file, { config: { homeCamera: HOME_CAMERA, viewerMode: "2d" } }))).body;
    expect(saved.version).toBe(2);
    expect(saved.published.version).toBe(1);
    expect(readJson("snap.json")).not.toHaveProperty("viewerMode");

    const republished = await client.post(`/api/init-files/${file.id}/publish`);
    expect(republished.body.published.version).toBe(2);
    expect(readJson("snap.json").viewerMode).toBe("2d");
  });

  it("doesn't change the init file's version, so an open editor can still save", async () => {
    const file = await createInitFile(client, { slug: "v" });
    const published = (await client.post(`/api/init-files/${file.id}/publish`)).body;
    expect(published.version).toBe(1);
    expect((await client.put(`/api/init-files/${file.id}`, bodyOf(file))).status).toBe(200);
  });

  it("moves the file when published again after a rename", async () => {
    const file = await createInitFile(client, { slug: "old-name" });
    await client.post(`/api/init-files/${file.id}/publish`);
    await client.put(`/api/init-files/${file.id}`, bodyOf(file, { slug: "new-name" }));
    expect(existsSync(onDisk("old-name.json"))).toBe(true);

    const res = await client.post(`/api/init-files/${file.id}/publish`);
    expect(res.body.published.path).toBe("/config/new-name.json");
    expect(existsSync(onDisk("new-name.json"))).toBe(true);
    expect(existsSync(onDisk("old-name.json"))).toBe(false);
  });

  it("won't publish over a file another init file still has published", async () => {
    const first = await createInitFile(client, { slug: "shared" });
    await client.post(`/api/init-files/${first.id}/publish`);
    await client.put(`/api/init-files/${first.id}`, bodyOf(first, { slug: "moved" }));
    const second = await createInitFile(client, { slug: "shared", name: "Second" });

    const res = await client.post(`/api/init-files/${second.id}/publish`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/shared\.json is already published by the init file “Test map”/);
    expect(readJson("shared.json")).toEqual({ homeCamera: HOME_CAMERA, catalog: [] });
    expect((await client.get(`/api/init-files/${second.id}`)).body.published).toBeNull();
  });

  it("unpublishes by deleting the file", async () => {
    const file = await createInitFile(client, { slug: "gone" });
    await client.post(`/api/init-files/${file.id}/publish`);
    const res = await client.delete(`/api/init-files/${file.id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.published).toBeNull();
    expect(existsSync(onDisk("gone.json"))).toBe(false);
    expect((await new Client().get("/config/gone.json")).status).toBe(404);
    // Unpublishing again is harmless.
    expect((await client.delete(`/api/init-files/${file.id}/publish`)).status).toBe(200);
  });

  it("doesn't mind if the file was already removed from disk", async () => {
    const file = await createInitFile(client, { slug: "manual" });
    await client.post(`/api/init-files/${file.id}/publish`);
    rmSync(onDisk("manual.json"));
    expect((await client.delete(`/api/init-files/${file.id}/publish`)).status).toBe(200);
  });

  it("404s publishing an unknown init file", async () => {
    expect((await client.post(`/api/init-files/${MISSING}/publish`)).status).toBe(404);
    expect((await client.delete(`/api/init-files/${MISSING}/publish`)).status).toBe(404);
    expect((await client.post("/api/init-files/nope/test")).status).toBe(404);
  });
});

describe("test mode", () => {
  it("writes /config/test/<id>.json and rewrites it on every save", async () => {
    const file = await createInitFile(client, { slug: "trial" });
    const on = await client.post(`/api/init-files/${file.id}/test`);
    expect(on.status).toBe(200);
    expect(on.body.test).toMatchObject({ path: `/config/test/${file.id}.json`, version: 1 });
    expect(on.body.published).toBeNull();
    expect(existsSync(onDisk("trial.json"))).toBe(false);

    const served = await new Client().get(`/config/test/${file.id}.json`);
    expect(served.status).toBe(200);
    expect(served.headers.get("access-control-allow-origin")).toBe("*");

    const saved = (await client.put(`/api/init-files/${file.id}`, bodyOf(file, { config: { homeCamera: HOME_CAMERA, viewerMode: "3d" } }))).body;
    expect(saved.test.version).toBe(2);
    expect(readJson(`test/${file.id}.json`).viewerMode).toBe("3d");
  });

  it("is independent of publishing", async () => {
    const file = await createInitFile(client, { slug: "both" });
    await client.post(`/api/init-files/${file.id}/publish`);
    await client.post(`/api/init-files/${file.id}/test`);
    const off = await client.delete(`/api/init-files/${file.id}/test`);
    expect(off.body.test).toBeNull();
    expect(off.body.published).not.toBeNull();
    expect(existsSync(onDisk(`test/${file.id}.json`))).toBe(false);
    expect(existsSync(onDisk("both.json"))).toBe(true);
  });

  it("doesn't write a test file on save when test mode is off", async () => {
    const file = await createInitFile(client, { slug: "quiet" });
    await client.put(`/api/init-files/${file.id}`, bodyOf(file));
    expect(existsSync(onDisk(`test/${file.id}.json`))).toBe(false);
  });
});

describe("deleting a published init file", () => {
  it("removes its published and test files", async () => {
    const file = await createInitFile(client, { slug: "bye" });
    await client.post(`/api/init-files/${file.id}/publish`);
    await client.post(`/api/init-files/${file.id}/test`);
    await client.delete(`/api/init-files/${file.id}`);
    expect(existsSync(onDisk("bye.json"))).toBe(false);
    expect(existsSync(onDisk(`test/${file.id}.json`))).toBe(false);
  });
});

describe("/config", () => {
  it("is public and 404s missing files and paths outside the folder", async () => {
    const anon = new Client();
    expect((await anon.get("/config/missing.json")).status).toBe(404);
    expect((await anon.get("/config/..%2f..%2fpackage.json")).status).toBe(404);
    expect((await anon.get("/config/../package.json")).status).toBe(404);
  });
});
