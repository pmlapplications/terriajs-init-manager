#!/usr/bin/env node
// Builds trait metadata for Terria catalog types from their docs pages.
//
//   node scripts/generate-traits.mjs [type]      (default: wms)
//   node scripts/generate-traits.mjs --all       every type on the catalog items page
//
// Writes src/terria/generated/<type>-traits.json. Each docs page has one table
// per traits class; nested classes are referenced by name in the Type column.
// --all also writes src/terria/generated/index.json listing the item types.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = "https://docs.terria.io/guide/connecting-to-data";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "terria", "generated");

// Defaults rendered from the docs build environment rather than from Terria.
const DROP_DEFAULTS = new Set(["currentTime"]);

// Types the docs use without a table of their own. ModelReference is a member
// id or an inline catalog member, so it is edited as JSON.
const TYPE_ALIASES = { ModelReference: "any", "ModelReference[]": "any" };

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

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

/** Parses one catalog type's docs page and writes its traits file. */
async function generate(type) {
  const url = `${DOCS}/catalog-type-details/${type}/`;
  const html = await fetchText(url);

  const title = toText(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? "");
  const parts = html.split(/<h[2-5] id="[^"]+">(.*?)<\/h[2-5]>/s);
  const classes = {};

  for (let i = 1; i < parts.length; i += 2) {
    const className = toText(parts[i]);
    const body = parts[i + 1].split(/<\/table>/)[0];
    const rows = [...body.matchAll(/<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gs)];
    if (rows.length === 0) continue;
    classes[className] = rows.map(([, name, t, def, desc]) => {
      const rawType = toText(t);
      const trait = { name: toText(name), type: TYPE_ALIASES[rawType] ?? rawType };
      const value = DROP_DEFAULTS.has(trait.name) ? undefined : parseDefault(toText(def), trait.type);
      if (value !== undefined) trait.default = value;
      trait.description = toText(desc);
      return trait;
    });
  }

  const root = Object.keys(classes)[0];
  if (!root) throw new Error(`${url}: no trait tables found`);
  const unknown = new Set();
  for (const traits of Object.values(classes)) {
    for (const { type: t } of traits) {
      const name = t.replace(/\[\]$/, "");
      if (!["string", "number", "boolean", "any"].includes(name) && !classes[name]) unknown.add(name);
    }
  }
  if (unknown.size) throw new Error(`${url}: referenced classes missing from page: ${[...unknown].join(", ")}`);

  const out = join(OUT_DIR, `${type}-traits.json`);
  await writeFile(out, JSON.stringify({ type, model: title, source: url, root, classes }, null, 2) + "\n");

  const count = Object.values(classes).reduce((n, t) => n + t.length, 0);
  console.log(`${title}: ${Object.keys(classes).length} classes, ${count} traits -> ${out}`);
  return { type, model: title };
}

/** Item types listed on the catalog items page, as { type, model }. */
async function listItemTypes() {
  const html = await fetchText(`${DOCS}/catalog-items/`);
  const rows = [...html.matchAll(/<tr>\s*<td><a [^>]*>(.*?)<\/a><\/td>\s*<td><code>(.*?)<\/code><\/td>\s*<\/tr>/gs)];
  if (rows.length === 0) throw new Error("No catalog item types found on the catalog items page");
  return rows.map(([, model, type]) => ({ type: toText(type), model: toText(model) }));
}

await mkdir(OUT_DIR, { recursive: true });

if (process.argv[2] === "--all") {
  const types = await listItemTypes();
  const done = [];
  const failed = [];
  for (const { type, model } of types) {
    try {
      await generate(type);
      done.push({ type, model });
    } catch (e) {
      failed.push(type);
      console.error(`${type}: ${e.message}`);
    }
  }
  await writeFile(join(OUT_DIR, "index.json"), JSON.stringify(done, null, 2) + "\n");
  console.log(`${done.length} item types written${failed.length ? `; failed: ${failed.join(", ")}` : ""}`);
  if (failed.length) process.exitCode = 1;
} else {
  await generate(process.argv[2] ?? "wms");
}
