// Stores catalog items and groups as catalog_member rows. Items are any
// catalog_type with kind 'item' (wms, csv, geojson, ...), groups any with kind
// 'group' (group, wms-group, ...).
//
// The editor works with the member exactly as it appears in an init file,
// minus `type` and `members`. On save, `id`, `name`, `description` and `url` go
// to their columns, `shareKeys` to catalog_member_share_key, and everything
// else to `traits`. Loading reverses that, so a member round-trips unchanged.
//
// A group's members are other catalog_member rows, linked in order through
// group_membership, so one item can sit in several groups. group_member_type
// says which types each group type may contain.

import type pg from "pg";
import { pool, transaction } from "./db.ts";
import { ApiError } from "./errors.ts";

export type JsonObject = Record<string, unknown>;
export type MemberKind = "item" | "group";

export interface ItemConfigSummary {
  id: string;
  type: string;
  terriaId: string | null;
  name: string;
  url: string | null;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}

/** A member of a group, enough to list it. */
export interface MemberRef {
  id: string;
  type: string;
  kind: MemberKind;
  terriaId: string | null;
  name: string;
}

export interface ItemConfig extends ItemConfigSummary {
  item: JsonObject;
  /** Groups only: the group's members, in order. */
  members?: MemberRef[];
}

interface MemberRow {
  id: string;
  type: string;
  terria_id: string | null;
  name: string;
  description: string | null;
  url: string | null;
  traits: JsonObject;
  is_published: boolean;
  version: number;
  updated_at: Date;
  share_keys: string[] | null;
}

const SELECT_MEMBER = `
  select m.id, m.type, m.terria_id, m.name, m.description, m.url, m.traits, m.is_published, m.version, m.updated_at,
         (select array_agg(k.share_key order by k.share_key)
          from catalog_member_share_key k where k.member_id = m.id) as share_keys
  from catalog_member m
  where m.type = $1`;

const toSummary = (row: MemberRow): ItemConfigSummary => ({
  id: row.id,
  type: row.type,
  terriaId: row.terria_id,
  name: row.name,
  url: row.url,
  isPublished: row.is_published,
  version: row.version,
  updatedAt: row.updated_at.toISOString(),
});

function toConfig(row: MemberRow): ItemConfig {
  const item: JsonObject = {};
  if (row.terria_id !== null) item.id = row.terria_id;
  item.name = row.name;
  if (row.description !== null) item.description = row.description;
  if (row.url !== null) item.url = row.url;
  Object.assign(item, row.traits);
  if (row.share_keys?.length) item.shareKeys = row.share_keys;
  return { ...toSummary(row), item };
}

interface MemberFields {
  terriaId: string | null;
  name: string;
  description: string | null;
  url: string | null;
  shareKeys: string[];
  traits: JsonObject;
}

const isPlainObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

function optionalString(item: JsonObject, key: string): string | null {
  const v = item[key];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new ApiError(400, `"${key}" must be a string`);
  return v;
}

/** Splits an editor item into catalog_member columns and traits. */
function toFields(type: string, item: unknown): MemberFields {
  if (!isPlainObject(item)) throw new ApiError(400, "Expected a catalog member object");
  const { type: itemType, id: _id, name, description: _description, url: _url, shareKeys, members, ...traits } = item;
  void [_id, _description, _url];

  if (itemType !== undefined && itemType !== type) throw new ApiError(400, `Expected "type": "${type}"`);
  if (members !== undefined) throw new ApiError(400, `Send a group's members as "members" next to "item", as database ids`);
  if (typeof name !== "string" || !name.trim()) throw new ApiError(400, `"name" is required`);
  if (shareKeys !== undefined && !(Array.isArray(shareKeys) && shareKeys.every((k) => typeof k === "string"))) {
    throw new ApiError(400, `"shareKeys" must be an array of strings`);
  }

  return {
    terriaId: optionalString(item, "id"),
    name,
    description: optionalString(item, "description"),
    url: optionalString(item, "url"),
    shareKeys: [...new Set((shareKeys as string[] | undefined) ?? [])],
    traits,
  };
}

async function replaceShareKeys(client: pg.PoolClient, memberId: string, keys: string[]) {
  await client.query("delete from catalog_member_share_key where member_id = $1", [memberId]);
  if (keys.length) {
    await client.query(
      "insert into catalog_member_share_key (share_key, member_id) select unnest($1::text[]), $2",
      [keys, memberId],
    );
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks a group's member list: unique database ids of items or groups, not the group itself. */
function parseMemberIds(groupId: string | null, members: unknown): string[] {
  if (!Array.isArray(members) || !members.every((m) => typeof m === "string" && UUID.test(m))) {
    throw new ApiError(400, `"members" must be an array of catalog member ids`);
  }
  if (new Set(members).size !== members.length) throw new ApiError(400, "A group can't contain the same member twice");
  if (groupId !== null && members.includes(groupId)) throw new ApiError(400, "A group can't contain itself");
  return members as string[];
}

/** Types a group of `groupType` may contain. */
export async function listMemberTypes(groupType: string): Promise<string[]> {
  await checkType("group", groupType);
  const { rows } = await pool.query<{ member_type: string }>(
    "select member_type from group_member_type where group_type = $1 order by member_type",
    [groupType],
  );
  return rows.map((r) => r.member_type);
}

async function replaceGroupMembers(client: pg.PoolClient, groupType: string, groupId: string, memberIds: string[]) {
  const { rows } = await client.query<{ id: string; name: string; type: string; allowed: boolean }>(
    `select m.id, m.name, m.type,
            exists (select 1 from group_member_type a where a.group_type = $2 and a.member_type = m.type) as allowed
     from catalog_member m join catalog_type t on t.type = m.type
     where m.id = any($1::uuid[]) and t.kind in ('item', 'group')`,
    [memberIds, groupType],
  );
  const found = new Set(rows.map((r) => r.id));
  const missing = memberIds.filter((id) => !found.has(id));
  if (missing.length) throw new ApiError(400, `No catalog item or group with id ${missing.join(", ")}`);
  const disallowed = rows.filter((r) => !r.allowed);
  if (disallowed.length) {
    const list = disallowed.map((r) => `“${r.name}” (${r.type})`).join(", ");
    throw new ApiError(400, `A ${groupType} can't contain ${list}`);
  }

  // The membership trigger also rejects cycles; this names the group at fault.
  const { rows: ancestors } = await client.query<{ name: string }>(
    `with recursive ancestors(id) as (
       select parent_id from group_membership where child_id = $1
       union
       select gm.parent_id from group_membership gm join ancestors a on gm.child_id = a.id
     )
     select m.name from catalog_member m where m.id in (select id from ancestors) and m.id = any($2::uuid[])`,
    [groupId, memberIds],
  );
  if (ancestors.length) {
    const names = ancestors.map((a) => `“${a.name}”`).join(", ");
    throw new ApiError(400, `${names} already contain${ancestors.length === 1 ? "s" : ""} this group, so can't be a member of it`);
  }

  await client.query("delete from group_membership where parent_id = $1", [groupId]);
  if (memberIds.length) {
    await client.query(
      `insert into group_membership (parent_id, child_id, sort_order)
       select $1, child_id, ord from unnest($2::uuid[]) with ordinality as m(child_id, ord)`,
      [groupId, memberIds],
    );
  }
}

async function fetchGroupMembers(db: pg.Pool | pg.PoolClient, groupId: string): Promise<MemberRef[]> {
  const { rows } = await db.query<{ id: string; type: string; kind: MemberKind; terria_id: string | null; name: string }>(
    `select c.id, c.type, t.kind, c.terria_id, c.name
     from group_membership gm
     join catalog_member c on c.id = gm.child_id
     join catalog_type t on t.type = c.type
     where gm.parent_id = $1
     order by gm.sort_order, c.name`,
    [groupId],
  );
  return rows.map((r) => ({ id: r.id, type: r.type, kind: r.kind, terriaId: r.terria_id, name: r.name }));
}

async function fetchConfig(db: pg.Pool | pg.PoolClient, kind: MemberKind, type: string, id: string): Promise<ItemConfig | null> {
  const { rows } = await db.query<MemberRow>(`${SELECT_MEMBER} and m.id = $2`, [type, id]);
  if (!rows[0]) return null;
  const config = toConfig(rows[0]);
  if (kind === "group") config.members = await fetchGroupMembers(db, id);
  return config;
}

/**
 * SQL selecting the ids of the init files that use a member: those with it,
 * or a group containing it at any depth, in their catalog, or with it on their
 * workbench. `member` is an SQL expression for the member's id.
 */
const initFilesUsing = (member: string) => `
  select c.init_file_id from init_file_catalog c
  where c.member_id in (
    with recursive ancestors(id) as (
      select ${member}
      union
      select gm.parent_id from group_membership gm join ancestors a on gm.child_id = a.id
    )
    select id from ancestors)
  union
  select w.init_file_id from init_file_workbench w where w.member_id = ${member}`;

const notFound = (type: string, id: string) => new ApiError(404, `No ${type} config with id ${id}`);

function checkId(type: string, id: string) {
  if (!UUID.test(id)) throw notFound(type, id);
}

const knownTypes = new Set<string>();

/** Rejects types not of `kind`, so e.g. a group can't be written as an item. */
async function checkType(kind: MemberKind, type: string) {
  if (knownTypes.has(`${kind}:${type}`)) return;
  const { rows } = await pool.query("select 1 from catalog_type where type = $1 and kind = $2", [type, kind]);
  if (!rows.length) throw new ApiError(404, `Unknown catalog ${kind} type "${type}"`);
  knownTypes.add(`${kind}:${type}`);
}

/** All stored configs of a type, newest first. */
export async function listConfigs(kind: MemberKind, type: string): Promise<ItemConfigSummary[]> {
  await checkType(kind, type);
  const { rows } = await pool.query<MemberRow>(`${SELECT_MEMBER} order by m.updated_at desc`, [type]);
  return rows.map(toSummary);
}

export async function getConfig(kind: MemberKind, type: string, id: string): Promise<ItemConfig> {
  checkId(type, id);
  await checkType(kind, type);
  const config = await fetchConfig(pool, kind, type, id);
  if (!config) throw notFound(type, id);
  return config;
}

/** Creates a config. `members` (database ids, in order) is for groups only. */
export async function createConfig(
  kind: MemberKind,
  type: string,
  item: unknown,
  members: unknown,
  user: string | null,
): Promise<ItemConfig> {
  await checkType(kind, type);
  const f = toFields(type, item);
  const memberIds = kind === "group" && members !== undefined ? parseMemberIds(null, members) : null;
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into catalog_member (terria_id, type, name, description, url, traits, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       returning id`,
      [f.terriaId, type, f.name, f.description, f.url, f.traits, user],
    );
    await replaceShareKeys(client, rows[0].id, f.shareKeys);
    if (memberIds) await replaceGroupMembers(client, type, rows[0].id, memberIds);
    return (await fetchConfig(client, kind, type, rows[0].id))!;
  });
}

/**
 * Overwrites a stored config. `version` must match the stored version, so a
 * save based on stale data is rejected rather than silently losing changes.
 * For groups, `members` replaces the member list; leave it out to keep it.
 */
export async function updateConfig(
  kind: MemberKind,
  type: string,
  id: string,
  version: number,
  item: unknown,
  members: unknown,
  user: string | null,
): Promise<ItemConfig> {
  checkId(type, id);
  await checkType(kind, type);
  const f = toFields(type, item);
  const memberIds = kind === "group" && members !== undefined ? parseMemberIds(id, members) : null;
  return transaction(async (client) => {
    const { rowCount } = await client.query(
      `update catalog_member
       set terria_id = $4, name = $5, description = $6, url = $7, traits = $8, updated_by = $9
       where id = $1 and type = $2 and version = $3`,
      [id, type, version, f.terriaId, f.name, f.description, f.url, f.traits, user],
    );
    if (!rowCount) {
      const current = await fetchConfig(client, kind, type, id);
      if (!current) throw notFound(type, id);
      throw new ApiError(409, `This config was changed by someone else (now version ${current.version}); reload it before saving`);
    }
    await replaceShareKeys(client, id, f.shareKeys);
    if (memberIds) await replaceGroupMembers(client, type, id, memberIds);
    return (await fetchConfig(client, kind, type, id))!;
  });
}

/**
 * Deletes an item or group. Refused while an init file uses it (see
 * initFilesUsing). Deleting a group removes it from its parent groups and
 * unlinks its members, which are kept.
 */
export async function deleteConfig(kind: MemberKind, type: string, id: string): Promise<void> {
  checkId(type, id);
  await checkType(kind, type);
  await transaction(async (client) => {
    // Locking the row stops an init file or group linking to it until we're done.
    const { rows } = await client.query<{ name: string }>("select name from catalog_member where id = $1 and type = $2 for update", [
      id,
      type,
    ]);
    if (!rows[0]) throw notFound(type, id);
    const { rows: files } = await client.query<{ name: string }>(
      `select f.name from init_file f where f.id in (${initFilesUsing("$1::uuid")}) order by lower(f.name)`,
      [id],
    );
    if (files.length) {
      const names = files.map((f) => `“${f.name}”`).join(", ");
      throw new ApiError(
        409,
        `“${rows[0].name}” is used by the init file${files.length === 1 ? "" : "s"} ${names}; remove it, or the groups containing it, from ${files.length === 1 ? "that file" : "them"} before deleting it`,
      );
    }
    await client.query("delete from catalog_member where id = $1", [id]);
  });
}

export interface MemberListEntry extends ItemConfigSummary {
  kind: MemberKind;
  description: string | null;
  updatedBy: string | null;
  /** Groups only: number of direct members. */
  memberCount: number | null;
  /** Number of init files using the member, directly or through a group; it can only be deleted when 0. */
  initFileCount: number;
}

export interface MemberListPage {
  items: MemberListEntry[];
  /** Matching members across all pages. */
  total: number;
  page: number;
  pageSize: number;
}

// Sortable columns; the key is what the client sends as `sort`.
const SORT_COLUMNS: Record<string, string> = {
  name: "lower(m.name)",
  type: "m.type",
  terriaId: "lower(m.terria_id)",
  url: "lower(m.url)",
  isPublished: "m.is_published",
  version: "m.version",
  updatedAt: "m.updated_at",
  updatedBy: "lower(m.updated_by)",
};

const MAX_PAGE_SIZE = 200;

function positiveInt(value: string | undefined, name: string, fallback: number, max = Infinity): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new ApiError(400, `"${name}" must be a positive integer`);
  return Math.min(n, max);
}

/**
 * One page of items and groups of every type. `q` searches name, Terria id,
 * url and description; `kind` is "item" or "group" (default both); `type` is a
 * comma-separated list of types; `memberOf` limits to the types a group type
 * may contain; `within` is a comma-separated list of group ids, limiting to
 * their members at any depth; `published` is "true" or "false"; `orphaned`
 * "true" limits to members in no group and no init file ("false" to the rest).
 */
export async function listMembers(query: Record<string, string | undefined>): Promise<MemberListPage> {
  const page = positiveInt(query.page, "page", 1);
  const pageSize = positiveInt(query.pageSize, "pageSize", 25, MAX_PAGE_SIZE);
  const sort = query.sort ?? "updatedAt";
  if (!(sort in SORT_COLUMNS)) throw new ApiError(400, `Can't sort by "${sort}"`);
  const dir = query.dir === "asc" ? "asc" : "desc";

  const params: unknown[] = [];
  const where: string[] = [];
  if (query.kind === "item" || query.kind === "group") {
    params.push(query.kind);
    where.push(`t.kind = $${params.length}`);
  } else if (query.kind) {
    throw new ApiError(400, `"kind" must be "item" or "group"`);
  } else {
    where.push("t.kind in ('item', 'group')");
  }
  const q = query.q?.trim();
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
    const p = `$${params.length}`;
    where.push(`(m.name ilike ${p} or m.terria_id ilike ${p} or m.url ilike ${p} or m.description ilike ${p})`);
  }
  const types = query.type?.split(",").filter(Boolean);
  if (types?.length) {
    params.push(types);
    where.push(`m.type = any($${params.length}::text[])`);
  }
  if (query.memberOf) {
    params.push(query.memberOf);
    where.push(`m.type in (select member_type from group_member_type where group_type = $${params.length})`);
  }
  if (query.within !== undefined) {
    const groups = query.within.split(",").filter(Boolean);
    if (!groups.every((id) => UUID.test(id))) throw new ApiError(400, `"within" must be a comma-separated list of group ids`);
    params.push(groups);
    where.push(`m.id in (
      with recursive descendants(id) as (
        select gm.child_id from group_membership gm where gm.parent_id = any($${params.length}::uuid[])
        union
        select gm.child_id from group_membership gm join descendants d on gm.parent_id = d.id
      )
      select id from descendants)`);
  }
  if (query.published === "true" || query.published === "false") {
    params.push(query.published === "true");
    where.push(`m.is_published = $${params.length}`);
  }
  if (query.orphaned === "true" || query.orphaned === "false") {
    const orphaned = `not exists (select 1 from group_membership gm where gm.child_id = m.id)
      and not exists (select 1 from init_file_catalog c where c.member_id = m.id)
      and not exists (select 1 from init_file_workbench w where w.member_id = m.id)`;
    where.push(query.orphaned === "true" ? `(${orphaned})` : `not (${orphaned})`);
  } else if (query.orphaned !== undefined) {
    throw new ApiError(400, `"orphaned" must be "true" or "false"`);
  }

  const from = `from catalog_member m join catalog_type t on t.type = m.type where ${where.join(" and ")}`;
  const { rows: countRows } = await pool.query<{ total: number }>(`select count(*)::int as total ${from}`, params);
  const { rows } = await pool.query<
    MemberRow & { kind: MemberKind; updated_by: string | null; member_count: number | null; init_file_count: number }
  >(
    `select m.id, m.type, t.kind, m.terria_id, m.name, m.description, m.url, m.is_published, m.version, m.updated_at, m.updated_by,
            case when t.kind = 'group'
                 then (select count(*)::int from group_membership gm where gm.parent_id = m.id) end as member_count,
            (select count(*)::int from (${initFilesUsing("m.id")}) u) as init_file_count
     ${from}
     order by ${SORT_COLUMNS[sort]} ${dir} nulls last, m.id
     limit ${pageSize} offset ${(page - 1) * pageSize}`,
    params,
  );
  return {
    items: rows.map((row) => ({
      ...toSummary(row),
      kind: row.kind,
      description: row.description,
      updatedBy: row.updated_by,
      memberCount: row.member_count,
      initFileCount: row.init_file_count,
    })),
    total: countRows[0].total,
    page,
    pageSize,
  };
}
