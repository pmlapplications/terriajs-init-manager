import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "./version.ts";

describe("VERSION", () => {
  it("is package.json's version, in semver form", () => {
    expect(VERSION).toBe(JSON.parse(readFileSync("package.json", "utf8")).version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  it("has a CHANGELOG entry", () => {
    expect(readFileSync("CHANGELOG.md", "utf8")).toContain(`## [${VERSION}]`);
  });
});
