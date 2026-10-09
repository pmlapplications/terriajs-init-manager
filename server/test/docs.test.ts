import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db.ts";
import { Client } from "./helpers.ts";

let docs: string;

beforeAll(() => {
  docs = mkdtempSync(join(tmpdir(), "tlm-docs-"));
  mkdirSync(join(docs, "user-guide"));
  writeFileSync(join(docs, "index.html"), "<title>Home</title>");
  writeFileSync(join(docs, "user-guide", "catalog.html"), "<title>Catalog</title>");
  process.env.DOCS_DIR = docs;
});
afterAll(async () => {
  rmSync(docs, { recursive: true, force: true });
  delete process.env.DOCS_DIR;
  await pool.end();
});

describe("/docs", () => {
  const anon = new Client();

  it("serves the built docs without a login", async () => {
    const index = await anon.get("/docs/");
    expect(index.status).toBe(200);
    expect(index.body).toBe("<title>Home</title>");
    expect(index.headers.get("content-type")).toMatch(/text\/html/);
    expect((await anon.get("/docs/user-guide/catalog.html")).body).toBe("<title>Catalog</title>");
  });

  it("redirects /docs to /docs/", async () => {
    const res = await anon.get("/docs");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/docs/");
  });

  it("404s missing pages and paths outside the docs", async () => {
    expect((await anon.get("/docs/nope.html")).status).toBe(404);
    expect((await anon.get("/docs/..%2f..%2fpackage.json")).status).toBe(404);
  });

  it("explains when the docs haven't been built", async () => {
    process.env.DOCS_DIR = join(docs, "missing");
    try {
      const res = await anon.get("/docs/");
      expect(res.status).toBe(404);
      expect(res.body).toMatch(/npm run docs/);
    } finally {
      process.env.DOCS_DIR = docs;
    }
  });
});
