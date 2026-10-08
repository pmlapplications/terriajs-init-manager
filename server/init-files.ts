// Stores Terria init files (https://docs.terria.io/guide/customizing/initialization-files/).
//
// An init file row holds every top-level key except `catalog` and `workbench`
// in its `config` JSONB. The catalog is an ordered list of stored groups
// (init_file_catalog) and the workbench an ordered list of items inside those
// groups (init_file_workbench). export_init_file() in the database assembles
// the finished JSON, with published members only.

import type pg from "pg";
import { pool, transaction } from "./db.ts";
import { ApiError } from "./errors.ts";
import type { JsonObject, MemberKind, MemberRef } from "./members.ts";

export interface InitFileSummary {
  id: string;
  /** File name without .json. */
  slug: string;
  name: string;
  description: string | null;
  /** Number of top-level catalog groups. */
  catalogCount: number;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface InitFile extends InitFileSummary {
  /** Every top-level key except catalog and workbench. */
  config: JsonObject;
  /** Top-level catalog groups, in order. */
  catalog: MemberRef[];
  /** Items added to the workbench on load, in order. */
  workbench: MemberRef[];
}

interface InitFileRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  config: JsonObject;
  version: number;
  updated_at: Date;
  updated_by: string | null;
  catalog_count: number;
}

interface InitFileFields {
  slug: string;
  name: string;
  description: string | null;
  config: JsonObject;
  catalog: string[];
  workbench: string[];
}

const SELECT_INIT_FILE = `
  select f.id, f.slug, f.name, f.description, f.config, f.version, f.updated_at, f.updated_by,
         (select count(*)::int from init_file_catalog c where c.init_file_id = f.id) as catalog_count
  from init_file f`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const isPlainObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

const toSummary = (row: InitFileRow): InitFileSummary => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  catalogCount: row.catalog_count,
  version: row.version,
  updatedAt: row.updated_at.toISOString(),
  updatedBy: row.updated_by,
});

function parseIds(value: unknown, key: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((m) => typeof m === "string" && UUID.test(m))) {
    throw new ApiError(400, `"${key}" must be an array of catalog member ids`);
  }
  if (new Set(value).size !== value.length) throw new ApiError(400, `"${key}" can't list the same member twice`);
  return value as string[];
}

function toFields(body: unknown): InitFileFields {
  if (!isPlainObject(body)) throw new ApiError(400, "Expected an init file object");
  const { slug, name, description, config } = body;
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    throw new ApiError(400, `"slug" must start with a letter or digit and contain only letters, digits, ".", "_" and "-"`);
  }
  if (typeof name !== "string" || !name.trim()) throw new ApiError(400, `"name" is required`);
  if (description !== undefined && description !== null && typeof description !== "string") {
    throw new ApiError(400, `"description" must be a string`);
  }
  if (!isPlainObject(config)) throw new ApiError(400, `"config" must be an object`);
  if ("catalog" in config || "workbench" in config) {
    throw new ApiError(400, `Send the catalog and workbench as "catalog" and "workbench" lists of ids, not inside "config"`);
  }
  return {
    slug,
    name: name.trim(),
    description: description || null,
    config,
    catalog: parseIds(body.catalog, "catalog"),
    workbench: parseIds(body.workbench, "workbench"),
  };
}

/** Checks the catalog is all groups and the workbench all items inside them. */
async function checkMembers(client: pg.PoolClient, f: InitFileFields) {
  const ids = [...f.catalog, ...f.workbench];
  const { rows } = await client.query<{ id: string; name: string; kind: string }>(
    `select m.id, m.name, t.kind from catalog_member m join catalog_type t on t.type = m.type where m.id = any($1::uuid[])`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new ApiError(400, `No catalog member with id ${missing.join(", ")}`);

  const notGroups = f.catalog.map((id) => byId.get(id)!).filter((m) => m.kind !== "group");
  if (notGroups.length) {
    throw new ApiError(400, `The catalog can only contain groups, not ${notGroups.map((m) => `“${m.name}”`).join(", ")}`);
  }
  const notItems = f.workbench.map((id) => byId.get(id)!).filter((m) => m.kind !== "item");
  if (notItems.length) {
    throw new ApiError(400, `The workbench can only contain items, not ${notItems.map((m) => `“${m.name}”`).join(", ")}`);
  }

  if (!f.workbench.length) return;
  const { rows: reachable } = await client.query<{ id: string }>(
    `with recursive descendants(id) as (
       select unnest($1::uuid[])
       union
       select gm.child_id from group_membership gm join descendants d on gm.parent_id = d.id
     )
     select id from descendants where id = any($2::uuid[])`,
    [f.catalog, f.workbench],
  );
  const inCatalog = new Set(reachable.map((r) => r.id));
  const outside = f.workbench.filter((id) => !inCatalog.has(id)).map((id) => byId.get(id)!);
  if (outside.length) {
    throw new ApiError(
      400,
      `Workbench items must be in one of the catalog groups: ${outside.map((m) => `“${m.name}”`).join(", ")} ${outside.length === 1 ? "is" : "are"} not`,
    );
  }
}

async function replaceLinks(client: pg.PoolClient, table: "init_file_catalog" | "init_file_workbench", fileId: string, ids: string[]) {
  await client.query(`delete from ${table} where init_file_id = $1`, [fileId]);
  if (ids.length) {
    await client.query(
      `insert into ${table} (init_file_id, member_id, sort_order)
       select $1, member_id, ord from unnest($2::uuid[]) with ordinality as m(member_id, ord)`,
      [fileId, ids],
    );
  }
}

async function fetchLinks(db: pg.Pool | pg.PoolClient, table: "init_file_catalog" | "init_file_workbench", fileId: string) {
  const { rows } = await db.query<{ id: string; type: string; kind: MemberKind; terria_id: string | null; name: string }>(
    `select m.id, m.type, t.kind, m.terria_id, m.name
     from ${table} l
     join catalog_member m on m.id = l.member_id
     join catalog_type t on t.type = m.type
     where l.init_file_id = $1
     order by l.sort_order, m.name`,
    [fileId],
  );
  return rows.map((r): MemberRef => ({ id: r.id, type: r.type, kind: r.kind, terriaId: r.terria_id, name: r.name }));
}

async function fetchInitFile(db: pg.Pool | pg.PoolClient, id: string): Promise<InitFile | null> {
  const { rows } = await db.query<InitFileRow>(`${SELECT_INIT_FILE} where f.id = $1`, [id]);
  if (!rows[0]) return null;
  return {
    ...toSummary(rows[0]),
    config: rows[0].config,
    catalog: await fetchLinks(db, "init_file_catalog", id),
    workbench: await fetchLinks(db, "init_file_workbench", id),
  };
}

const notFound = (id: string) => new ApiError(404, `No init file with id ${id}`);

function checkId(id: string) {
  if (!UUID.test(id)) throw notFound(id);
}

/** All init files, by name. */
export async function listInitFiles(): Promise<InitFileSummary[]> {
  const { rows } = await pool.query<InitFileRow>(`${SELECT_INIT_FILE} order by lower(f.name), f.slug`);
  return rows.map(toSummary);
}

export async function getInitFile(id: string): Promise<InitFile> {
  checkId(id);
  const file = await fetchInitFile(pool, id);
  if (!file) throw notFound(id);
  return file;
}

export async function createInitFile(body: unknown, user: string | null): Promise<InitFile> {
  const f = toFields(body);
  return transaction(async (client) => {
    await checkMembers(client, f);
    const { rows } = await client.query<{ id: string }>(
      `insert into init_file (slug, name, description, config, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $5)
       returning id`,
      [f.slug, f.name, f.description, f.config, user],
    );
    await replaceLinks(client, "init_file_catalog", rows[0].id, f.catalog);
    await replaceLinks(client, "init_file_workbench", rows[0].id, f.workbench);
    return (await fetchInitFile(client, rows[0].id))!;
  });
}

/** Overwrites an init file; rejected with 409 if it changed since `version`. */
export async function updateInitFile(id: string, version: number, body: unknown, user: string | null): Promise<InitFile> {
  checkId(id);
  const f = toFields(body);
  return transaction(async (client) => {
    await checkMembers(client, f);
    const { rowCount } = await client.query(
      `update init_file set slug = $3, name = $4, description = $5, config = $6, updated_by = $7
       where id = $1 and version = $2`,
      [id, version, f.slug, f.name, f.description, f.config, user],
    );
    if (!rowCount) {
      const current = await fetchInitFile(client, id);
      if (!current) throw notFound(id);
      throw new ApiError(409, `This init file was changed by someone else (now version ${current.version}); reload it before saving`);
    }
    await replaceLinks(client, "init_file_catalog", id, f.catalog);
    await replaceLinks(client, "init_file_workbench", id, f.workbench);
    return (await fetchInitFile(client, id))!;
  });
}

export async function deleteInitFile(id: string): Promise<void> {
  checkId(id);
  const { rowCount } = await pool.query("delete from init_file where id = $1", [id]);
  if (!rowCount) throw notFound(id);
}

/** The finished init file JSON, with published catalog members only. */
export async function exportInitFile(id: string): Promise<{ slug: string; content: JsonObject }> {
  checkId(id);
  const { rows } = await pool.query<{ slug: string; content: JsonObject }>(
    "select slug, export_init_file(id) as content from init_file where id = $1",
    [id],
  );
  if (!rows[0]) throw notFound(id);
  return rows[0];
}
