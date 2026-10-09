// Client for the API in server/. Items and groups are catalog JSON without
// `type` (and, for groups, without `members`, which are sent as database ids).

import type { MemberKind } from "./terria/catalog-ui";
import type { JsonObject } from "./terria/traits";

export interface ItemConfigSummary {
  /** Database row id. */
  id: string;
  /** Terria `type`, e.g. "wms". */
  type: string;
  /** Terria `id`, if the item sets one. */
  terriaId: string | null;
  name: string;
  url: string | null;
  isPublished: boolean;
  /** Incremented on every save; send it back when updating. */
  version: number;
  updatedAt: string;
}

/** A member of a group, enough to list it. */
export interface MemberRef {
  /** Database row id. */
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Dispatched on window when the session has expired or been ended elsewhere. */
export const UNAUTHORIZED_EVENT = "tlm:unauthorized";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`);
  }
  return body as T;
}

// --- Users and login ---------------------------------------------------------

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export const login = (email: string, password: string) =>
  request<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const logout = () => request<null>("/auth/logout", { method: "POST" });

/** The logged-in user, or null if there is no valid session. */
export async function currentUser(): Promise<User | null> {
  try {
    return await request<User>("/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export const listUsers = () => request<User[]>("/users");

export const createUser = (user: NewUser) => request<User>("/users", { method: "POST", body: JSON.stringify(user) });

export const deleteUser = (id: string) => request<null>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });

// --- Catalog item and group configs ------------------------------------------

const configPath = (kind: MemberKind, type: string, id?: string) =>
  `/${kind === "group" ? "groups" : "items"}/${encodeURIComponent(type)}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;

export const listConfigs = (kind: MemberKind, type: string) => request<ItemConfigSummary[]>(configPath(kind, type));

export const loadConfig = (kind: MemberKind, type: string, id: string) => request<ItemConfig>(configPath(kind, type, id));

/**
 * Saves an item or group. Without `existing` a new config is created; with it,
 * that config is overwritten, failing with status 409 if it changed since
 * `version`. `members` (database ids, in order) is sent for groups only.
 */
export function saveConfig(
  kind: MemberKind,
  type: string,
  item: JsonObject,
  members: string[] | undefined,
  existing?: { id: string; version: number },
) {
  return existing
    ? request<ItemConfig>(configPath(kind, type, existing.id), {
        method: "PUT",
        body: JSON.stringify({ version: existing.version, item, members }),
      })
    : request<ItemConfig>(configPath(kind, type), {
        method: "POST",
        // Items post the item itself; groups post { item, members }.
        body: JSON.stringify(kind === "group" ? { item, members } : item),
      });
}

/** Types a group of `groupType` may contain. */
export const listMemberTypes = (groupType: string) =>
  request<string[]>(`/groups/${encodeURIComponent(groupType)}/member-types`);

export interface MemberListEntry extends ItemConfigSummary {
  kind: MemberKind;
  description: string | null;
  updatedBy: string | null;
  /** Groups only: number of direct members. */
  memberCount: number | null;
}

export type MemberSortKey = "name" | "type" | "terriaId" | "url" | "isPublished" | "version" | "updatedAt" | "updatedBy";

export interface MemberListQuery {
  /** Matches name, Terria id, url or description. */
  q?: string;
  kind?: MemberKind;
  types?: string[];
  /** Only types that a group of this type may contain. */
  memberOf?: string;
  /** Only members of these groups (database ids), at any depth. */
  within?: string[];
  published?: boolean;
  sort?: MemberSortKey;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface MemberListPage {
  items: MemberListEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** One page of stored items and groups of every type. */
export function listMembers(query: MemberListQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.kind) params.set("kind", query.kind);
  if (query.types?.length) params.set("type", query.types.join(","));
  if (query.memberOf) params.set("memberOf", query.memberOf);
  if (query.within) params.set("within", query.within.join(","));
  if (query.published !== undefined) params.set("published", String(query.published));
  if (query.sort) params.set("sort", query.sort);
  if (query.dir) params.set("dir", query.dir);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  return request<MemberListPage>(`/members?${params}`, { signal });
}

// --- Init files --------------------------------------------------------------

/** A copy of an init file written to the server's public config folder. */
export interface InitFileOutput {
  /** Public path, e.g. /config/<slug>.json. */
  path: string;
  /** The init file version that was written. */
  version: number;
  writtenAt: string;
  writtenBy: string | null;
}

export type OutputTarget = "published" | "test";

export interface InitFileSummary {
  id: string;
  /** File name without .json. */
  slug: string;
  name: string;
  description: string | null;
  /** Number of top-level catalog groups. */
  catalogCount: number;
  /** Incremented on every save; send it back when updating. */
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  /** The file maps load, at /config/<slug>.json; null when not published. */
  published: InitFileOutput | null;
  /** The test copy at /config/test/<id>.json, rewritten on every save; null when test mode is off. */
  test: InitFileOutput | null;
}

export interface InitFile extends InitFileSummary {
  /** Every top-level init file key except catalog and workbench. */
  config: JsonObject;
  /** Top-level catalog groups, in order. */
  catalog: MemberRef[];
  /** Items added to the workbench on load, in order. */
  workbench: MemberRef[];
}

export interface InitFileInput {
  slug: string;
  name: string;
  description: string | null;
  config: JsonObject;
  /** Database ids of groups, in order. */
  catalog: string[];
  /** Database ids of items inside those groups, in order. */
  workbench: string[];
}

const initFilePath = (id?: string) => `/init-files${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;

export const listInitFiles = () => request<InitFileSummary[]>(initFilePath());

export const loadInitFile = (id: string) => request<InitFile>(initFilePath(id));

/** Creates an init file, or overwrites `existing` (409 if it changed since `version`). */
export const saveInitFile = (file: InitFileInput, existing?: { id: string; version: number }) =>
  existing
    ? request<InitFile>(initFilePath(existing.id), { method: "PUT", body: JSON.stringify({ ...file, version: existing.version }) })
    : request<InitFile>(initFilePath(), { method: "POST", body: JSON.stringify(file) });

export const deleteInitFile = (id: string) => request<null>(initFilePath(id), { method: "DELETE" });

/** The finished JSON as Terria would load it (published members only). */
export const exportInitFile = (id: string) => request<JsonObject>(`${initFilePath(id)}/export`);

/**
 * Publishes the last saved version to /config/<slug>.json, or with "test" writes
 * /config/test/<id>.json; `on: false` unpublishes or turns test mode off.
 */
export const setInitFileOutput = (id: string, target: OutputTarget, on: boolean) =>
  request<InitFile>(`${initFilePath(id)}/${target === "published" ? "publish" : "test"}`, { method: on ? "POST" : "DELETE" });

/** A link that downloads the finished JSON as <slug>.json. */
export const initFileDownloadUrl = (id: string) => `/api${initFilePath(id)}/export?download`;
