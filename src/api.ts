// Client for the API in server/. Items are catalog JSON without `type`.

import type { JsonObject } from "./terria/traits";

export interface WmsConfigSummary {
  /** Database row id. */
  id: string;
  /** Terria `id`, if the item sets one. */
  terriaId: string | null;
  name: string;
  url: string | null;
  isPublished: boolean;
  /** Incremented on every save; send it back when updating. */
  version: number;
  updatedAt: string;
}

export interface WmsConfig extends WmsConfigSummary {
  item: JsonObject;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

export const listWmsConfigs = () => request<WmsConfigSummary[]>("/wms");

export const loadWmsConfig = (id: string) => request<WmsConfig>(`/wms/${encodeURIComponent(id)}`);

/**
 * Saves an item. Without `existing` a new config is created; with it, that
 * config is overwritten, failing with status 409 if it changed since `version`.
 */
export function saveWmsConfig(item: JsonObject, existing?: { id: string; version: number }) {
  return existing
    ? request<WmsConfig>(`/wms/${encodeURIComponent(existing.id)}`, {
        method: "PUT",
        body: JSON.stringify({ version: existing.version, item }),
      })
    : request<WmsConfig>("/wms", { method: "POST", body: JSON.stringify(item) });
}
