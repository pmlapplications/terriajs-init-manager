// Stores WMS catalog items as catalog_member rows (type 'wms').
//
// The editor works with the item exactly as it appears in an init file, minus
// `type`. On save, `id`, `name`, `description` and `url` go to their columns,
// `shareKeys` to catalog_member_share_key, and everything else to `traits`.
// Loading reverses that, so an item round-trips unchanged.

import type pg from "pg";
import { pool, transaction } from "./db.ts";

const TYPE = "wms";

export type JsonObject = Record<string, unknown>;

export interface WmsConfigSummary {
  id: string;
  terriaId: string | null;
  name: string;
  url: string | null;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}

export interface WmsConfig extends WmsConfigSummary {
  item: JsonObject;
}

/** Thrown for problems the client can fix; `status` is the HTTP status to send. */
export class ApiError extends Error {
  status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

interface MemberRow {
  id: string;
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
  select m.id, m.terria_id, m.name, m.description, m.url, m.traits, m.is_published, m.version, m.updated_at,
         (select array_agg(k.share_key order by k.share_key)
          from catalog_member_share_key k where k.member_id = m.id) as share_keys
  from catalog_member m
  where m.type = $1`;

const toSummary = (row: MemberRow): WmsConfigSummary => ({
  id: row.id,
  terriaId: row.terria_id,
  name: row.name,
  url: row.url,
  isPublished: row.is_published,
  version: row.version,
  updatedAt: row.updated_at.toISOString(),
});

function toConfig(row: MemberRow): WmsConfig {
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
function toFields(item: unknown): MemberFields {
  if (!isPlainObject(item)) throw new ApiError(400, "Expected a catalog item object");
  const { type, id: _id, name, description: _description, url: _url, shareKeys, members, ...traits } = item;
  void [_id, _description, _url];

  if (type !== undefined && type !== TYPE) throw new ApiError(400, `Expected "type": "${TYPE}"`);
  if (members !== undefined) throw new ApiError(400, `A "${TYPE}" item cannot have "members"`);
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

async function fetchConfig(db: pg.Pool | pg.PoolClient, id: string): Promise<WmsConfig | null> {
  const { rows } = await db.query<MemberRow>(`${SELECT_MEMBER} and m.id = $2`, [TYPE, id]);
  return rows[0] ? toConfig(rows[0]) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkId(id: string) {
  if (!UUID.test(id)) throw new ApiError(404, `No WMS config with id ${id}`);
}

/** All stored WMS configs, newest first. */
export async function listWmsConfigs(): Promise<WmsConfigSummary[]> {
  const { rows } = await pool.query<MemberRow>(`${SELECT_MEMBER} order by m.updated_at desc`, [TYPE]);
  return rows.map(toSummary);
}

export async function getWmsConfig(id: string): Promise<WmsConfig> {
  checkId(id);
  const config = await fetchConfig(pool, id);
  if (!config) throw new ApiError(404, `No WMS config with id ${id}`);
  return config;
}

export async function createWmsConfig(item: unknown, user: string | null): Promise<WmsConfig> {
  const f = toFields(item);
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into catalog_member (terria_id, type, name, description, url, traits, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       returning id`,
      [f.terriaId, TYPE, f.name, f.description, f.url, f.traits, user],
    );
    await replaceShareKeys(client, rows[0].id, f.shareKeys);
    return (await fetchConfig(client, rows[0].id))!;
  });
}

/**
 * Overwrites a stored config. `version` must match the stored version, so a
 * save based on stale data is rejected rather than silently losing changes.
 */
export async function updateWmsConfig(id: string, version: number, item: unknown, user: string | null): Promise<WmsConfig> {
  checkId(id);
  const f = toFields(item);
  return transaction(async (client) => {
    const { rowCount } = await client.query(
      `update catalog_member
       set terria_id = $3, name = $4, description = $5, url = $6, traits = $7, updated_by = $8
       where id = $1 and type = '${TYPE}' and version = $2`,
      [id, version, f.terriaId, f.name, f.description, f.url, f.traits, user],
    );
    if (!rowCount) {
      const current = await fetchConfig(client, id);
      if (!current) throw new ApiError(404, `No WMS config with id ${id}`);
      throw new ApiError(409, `This config was changed by someone else (now version ${current.version}); reload it before saving`);
    }
    await replaceShareKeys(client, id, f.shareKeys);
    return (await fetchConfig(client, id))!;
  });
}
