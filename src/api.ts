// Client for the API in server/. Items are catalog JSON without `type`.

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

export interface ItemConfig extends ItemConfigSummary {
  item: JsonObject;
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

// --- Catalog item configs ----------------------------------------------------

const itemsPath = (type: string, id?: string) =>
  `/items/${encodeURIComponent(type)}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;

export const listItemConfigs = (type: string) => request<ItemConfigSummary[]>(itemsPath(type));

export const loadItemConfig = (type: string, id: string) => request<ItemConfig>(itemsPath(type, id));

/**
 * Saves an item. Without `existing` a new config is created; with it, that
 * config is overwritten, failing with status 409 if it changed since `version`.
 */
export function saveItemConfig(type: string, item: JsonObject, existing?: { id: string; version: number }) {
  return existing
    ? request<ItemConfig>(itemsPath(type, existing.id), {
        method: "PUT",
        body: JSON.stringify({ version: existing.version, item }),
      })
    : request<ItemConfig>(itemsPath(type), { method: "POST", body: JSON.stringify(item) });
}
