// Trait metadata as generated from the Terria docs (scripts/generate-traits.mjs).

export type Primitive = "string" | "number" | "boolean" | "any";

export interface TraitDef {
  name: string;
  /** Raw docs type: a primitive, `string[]`, a class name, or `ClassName[]`. */
  type: string;
  default?: string | number | boolean;
  description: string;
}

export interface TraitsFile {
  type: string;
  model: string;
  source: string;
  root: string;
  classes: Record<string, TraitDef[]>;
}

export type TraitKind =
  | { kind: Primitive }
  | { kind: "stringArray" }
  | { kind: "object"; className: string }
  | { kind: "objectArray"; className: string };

const PRIMITIVES = new Set<string>(["string", "number", "boolean", "any"]);

export function traitKind(type: string): TraitKind {
  if (type === "string[]") return { kind: "stringArray" };
  if (PRIMITIVES.has(type)) return { kind: type as Primitive };
  if (type.endsWith("[]")) return { kind: "objectArray", className: type.slice(0, -2) };
  return { kind: "object", className: type };
}

export type Path = (string | number)[];

export const pathKey = (path: Path) => path.join(".");

export type JsonObject = Record<string, unknown>;

export const isPlainObject = (v: unknown): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Immutably set `value` at `path`; `undefined` removes the key. */
export function setIn(target: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const arr = Array.isArray(target) ? [...target] : [];
    arr[head] = setIn(arr[head], rest, value);
    return arr;
  }
  const obj: JsonObject = isPlainObject(target) ? { ...target } : {};
  const next = setIn(obj[head], rest, value);
  if (next === undefined) delete obj[head];
  else obj[head] = next;
  return obj;
}

export function getIn(target: unknown, path: Path): unknown {
  let cur = target;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** Turn `getFeatureInfoUrl` into "Get feature info URL". */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(" ")
    .map((w) => (/^(url|wms|wcs|crs|id|ncwms|html)$/i.test(w) ? w.toUpperCase().replace("NCWMS", "NcWMS") : w.toLowerCase()));
  // The camel-case split breaks "NcWMS" in two.
  const label = words.join(" ").replace(/\bnc WMS\b/i, "NcWMS");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
