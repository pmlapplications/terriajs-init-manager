#!/usr/bin/env node
// Builds trait metadata for a Terria catalog type from its docs page.
//
//   node scripts/generate-traits.mjs [type]      (default: wms)
//
// Writes src/terria/generated/<type>-traits.json. The docs page has one table
// per traits class; nested classes are referenced by name in the Type column.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const type = process.argv[2] ?? "wms";
const url = `https://docs.terria.io/guide/connecting-to-data/catalog-type-details/${type}/`;

// Defaults rendered from the docs build environment rather than from Terria.
const DROP_DEFAULTS = new Set(["currentTime"]);

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const toText = (html) =>
  decode(
    html
      .replace(/<li>/g, "\n- ")
      .replace(/<br\s*\/?>|<\/p>\s*<p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

function parseDefault(raw, traitType) {
  if (raw === "") return undefined;
  if (traitType === "number") return Number(raw);
  if (traitType === "boolean") return raw === "true";
  return raw;
}

const res = await fetch(url);
if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
const html = await res.text();

const title = toText(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? "");
const parts = html.split(/<h[2-5] id="[^"]+">(.*?)<\/h[2-5]>/s);
const classes = {};

for (let i = 1; i < parts.length; i += 2) {
  const className = toText(parts[i]);
  const body = parts[i + 1].split(/<\/table>/)[0];
  const rows = [...body.matchAll(/<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gs)];
  if (rows.length === 0) continue;
  classes[className] = rows.map(([, name, t, def, desc]) => {
    const trait = { name: toText(name), type: toText(t) };
    const value = DROP_DEFAULTS.has(trait.name) ? undefined : parseDefault(toText(def), trait.type);
    if (value !== undefined) trait.default = value;
    trait.description = toText(desc);
    return trait;
  });
}

const root = Object.keys(classes)[0];
const unknown = new Set();
for (const traits of Object.values(classes)) {
  for (const { type: t } of traits) {
    const name = t.replace(/\[\]$/, "");
    if (!["string", "number", "boolean", "any"].includes(name) && !classes[name]) unknown.add(name);
  }
}
if (unknown.size) throw new Error(`Referenced classes missing from page: ${[...unknown].join(", ")}`);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "terria", "generated", `${type}-traits.json`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ type, model: title, source: url, root, classes }, null, 2) + "\n");

const count = Object.values(classes).reduce((n, t) => n + t.length, 0);
console.log(`${title}: ${Object.keys(classes).length} classes, ${count} traits -> ${out}`);
