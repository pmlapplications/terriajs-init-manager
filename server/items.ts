// Stores catalog items as catalog_member rows of any catalog_type with kind
// 'item' (wms, csv, geojson, ...).
//
// The editor works with the item exactly as it appears in an init file, minus
// `type`. On save, `id`, `name`, `description` and `url` go to their columns,
// `shareKeys` to catalog_member_share_key, and everything else to `traits`.
// Loading reverses that, so an item round-trips unchanged.

import type pg from "pg";
import { pool, transaction } from "./db.ts";
import { ApiError } from "./errors.ts";

export type JsonObject = Record<string, unknown>;

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

export interface ItemConfig extends ItemConfigSummary {
  item: JsonObject;
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
  if (!isPlainObject(item)) throw new ApiError(400, "Expected a catalog item object");
  const { type: itemType, id: _id, name, description: _description, url: _url, shareKeys, members, ...traits } = item;
  void [_id, _description, _url];

  if (itemType !== undefined && itemType !== type) throw new ApiError(400, `Expected "type": "${type}"`);
  if (members !== undefined) throw new ApiError(400, `"members" can't be stored on a "${type}" item yet`);
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

async function fetchConfig(db: pg.Pool | pg.PoolClient, type: string, id: string): Promise<ItemConfig | null> {
  const { rows } = await db.query<MemberRow>(`${SELECT_MEMBER} and m.id = $2`, [type, id]);
  return rows[0] ? toConfig(rows[0]) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (type: string, id: string) => new ApiError(404, `No ${type} config with id ${id}`);

function checkId(type: string, id: string) {
  if (!UUID.test(id)) throw notFound(type, id);
}

const itemTypes = new Set<string>();

/** Rejects types that aren't catalog items, so groups etc. can't be written here. */
async function checkType(type: string) {
  if (itemTypes.has(type)) return;
  const { rows } = await pool.query("select 1 from catalog_type where type = $1 and kind = 'item'", [type]);
  if (!rows.length) throw new ApiError(404, `Unknown catalog item type "${type}"`);
  itemTypes.add(type);
}

/** All stored configs of a type, newest first. */
export async function listItemConfigs(type: string): Promise<ItemConfigSummary[]> {
  await checkType(type);
  const { rows } = await pool.query<MemberRow>(`${SELECT_MEMBER} order by m.updated_at desc`, [type]);
  return rows.map(toSummary);
}

export async function getItemConfig(type: string, id: string): Promise<ItemConfig> {
  checkId(type, id);
  await checkType(type);
  const config = await fetchConfig(pool, type, id);
  if (!config) throw notFound(type, id);
  return config;
}

export async function createItemConfig(type: string, item: unknown, user: string | null): Promise<ItemConfig> {
  await checkType(type);
  const f = toFields(type, item);
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into catalog_member (terria_id, type, name, description, url, traits, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       returning id`,
      [f.terriaId, type, f.name, f.description, f.url, f.traits, user],
    );
    await replaceShareKeys(client, rows[0].id, f.shareKeys);
    return (await fetchConfig(client, type, rows[0].id))!;
  });
}

/**
 * Overwrites a stored config. `version` must match the stored version, so a
 * save based on stale data is rejected rather than silently losing changes.
 */
export async function updateItemConfig(
  type: string,
  id: string,
  version: number,
  item: unknown,
  user: string | null,
): Promise<ItemConfig> {
  checkId(type, id);
  await checkType(type);
  const f = toFields(type, item);
  return transaction(async (client) => {
    const { rowCount } = await client.query(
      `update catalog_member
       set terria_id = $4, name = $5, description = $6, url = $7, traits = $8, updated_by = $9
       where id = $1 and type = $2 and version = $3`,
      [id, type, version, f.terriaId, f.name, f.description, f.url, f.traits, user],
    );
    if (!rowCount) {
      const current = await fetchConfig(client, type, id);
      if (!current) throw notFound(type, id);
      throw new ApiError(409, `This config was changed by someone else (now version ${current.version}); reload it before saving`);
    }
    await replaceShareKeys(client, id, f.shareKeys);
    return (await fetchConfig(client, type, id))!;
  });
}
