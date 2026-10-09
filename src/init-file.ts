// Pure helpers for the init file editor (InitFileEditor.tsx).

import type { Rect } from "./camera";
import { isPlainObject, type JsonObject } from "./terria/traits";

/** Allowed init file names (without .json); the server checks the same. */
export const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Ids of base maps that Terria provides by default, offered as suggestions.
export const BUILT_IN_BASE_MAPS = [
  "basemap-positron",
  "basemap-darkmatter",
  "basemap-voyager",
  "basemap-natural-earth-II",
  "basemap-black-marble",
  "basemap-bing-aerial-with-labels",
  "basemap-bing-aerial",
  "basemap-bing-roads",
];

/** A file name from a display name, e.g. "Ocean colour" -> "ocean-colour". */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A camera given as { west, south, east, north } and nothing else. */
export function asRect(value: unknown): Rect | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  const sides = ["west", "south", "east", "north"] as const;
  if (keys.length !== 4 || !sides.every((k) => typeof value[k] === "number")) return null;
  return value as unknown as Rect;
}

export function rectProblem(r: Rect): string | null {
  if (r.west < -180 || r.west > 180 || r.east < -180 || r.east > 180) return "west and east must be between -180 and 180";
  if (r.south < -90 || r.north > 90) return "south and north must be between -90 and 90";
  if (r.south >= r.north) return "south must be less than north";
  return null;
}

export const without = <T>(obj: Record<string, T>, keys: string[]): Record<string, T> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/** Sets or (for undefined) removes a key, keeping the object's key order. */
export function withKey(obj: JsonObject, key: string, value: unknown): JsonObject {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** Ids for the base map suggestions: Terria's defaults and any extra base maps. */
export function baseMapIds(baseMaps: JsonObject): string[] {
  const extra = Array.isArray(baseMaps.items)
    ? baseMaps.items.map((b) => (isPlainObject(b) ? (isPlainObject(b.item) ? b.item.id : b.item) : undefined))
    : [];
  return [...new Set([...extra.filter((id): id is string => typeof id === "string"), ...BUILT_IN_BASE_MAPS])];
}

/** How a camera value is edited: unset, a box, focus on the workbench, or JSON. */
export type CameraMode = "unset" | "rect" | "focus" | "json";

export function cameraMode(value: unknown): CameraMode {
  if (value === undefined) return "unset";
  if (asRect(value)) return "rect";
  if (isPlainObject(value) && value.focusWorkbenchItems === true && Object.keys(value).length === 1) return "focus";
  return "json";
}
