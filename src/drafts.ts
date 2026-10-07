// Per-type editor drafts kept in localStorage, so a reload or switching item
// types doesn't lose work.

import type { ItemConfig } from "./api";
import { isPlainObject, type JsonObject } from "./terria/traits";

const draftKey = (type: string) => `tlm.${type}.draft`;
const recordKey = (type: string) => `tlm.${type}.record`;

/** The database config the draft was loaded from or last saved to. */
export type SavedRecord = Pick<ItemConfig, "id" | "version" | "name">;

function loadStored<T>(key: string, accept: (v: unknown) => v is T, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return accept(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode etc.); the draft just won't persist.
  }
}

export const loadDraft = (type: string) => loadStored<JsonObject>(draftKey(type), isPlainObject, {});
export const loadRecord = (type: string) =>
  loadStored<SavedRecord | null>(
    recordKey(type),
    (v): v is SavedRecord => isPlainObject(v) && typeof v.id === "string" && typeof v.version === "number",
    null,
  );

/** True if the browser holds a non-empty draft for this item type. */
export const hasDraft = (type: string) => Object.keys(loadDraft(type)).length > 0;

export function clearDraft(type: string) {
  store(draftKey(type), null);
  store(recordKey(type), null);
}

export const saveDraft = (type: string, item: JsonObject) => store(draftKey(type), item);
export const saveRecord = (type: string, record: SavedRecord | null) => store(recordKey(type), record);
