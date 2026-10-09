import { describe, expect, it } from "vitest";
import { BUILT_IN_BASE_MAPS, SLUG, asRect, baseMapIds, cameraMode, rectProblem, slugify, withKey, without } from "./init-file";

describe("slugify", () => {
  it.each([
    ["Ocean colour", "ocean-colour"],
    ["  CCI: Ocean / Colour (v6)! ", "cci-ocean-colour-v6"],
    ["Ünïcode", "n-code"],
    ["---", ""],
  ])("%j -> %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("makes valid file names from ordinary names", () => {
    expect(SLUG.test(slugify("My map 2024"))).toBe(true);
  });
});

describe("SLUG", () => {
  it.each(["map", "map-2.v1", "A_b"])("allows %s", (s) => expect(SLUG.test(s)).toBe(true));
  it.each(["", ".hidden", "-x", "a/b", "../x", "a b"])("rejects %j", (s) => expect(SLUG.test(s)).toBe(false));
});

describe("asRect", () => {
  it("accepts exactly west, south, east and north numbers", () => {
    const rect = { west: 1, south: 2, east: 3, north: 4 };
    expect(asRect(rect)).toBe(rect);
  });
  it.each([
    [undefined],
    [[1, 2, 3, 4]],
    [{ west: 1, south: 2, east: 3 }],
    [{ west: 1, south: 2, east: 3, north: "4" }],
    [{ west: 1, south: 2, east: 3, north: 4, extra: 5 }],
    [{ lookAt: {} }],
  ])("rejects %j", (value) => {
    expect(asRect(value)).toBeNull();
  });
});

describe("rectProblem", () => {
  it.each([
    [{ west: -10, south: 40, east: 10, north: 60 }, null],
    [{ west: -181, south: 0, east: 0, north: 1 }, "west and east must be between -180 and 180"],
    [{ west: 0, south: 0, east: 181, north: 1 }, "west and east must be between -180 and 180"],
    [{ west: 0, south: -91, east: 1, north: 1 }, "south and north must be between -90 and 90"],
    [{ west: 0, south: 0, east: 1, north: 91 }, "south and north must be between -90 and 90"],
    [{ west: 0, south: 5, east: 1, north: 5 }, "south must be less than north"],
  ])("%j", (rect, problem) => {
    expect(rectProblem(rect)).toBe(problem);
  });

  it("allows boxes crossing the antimeridian", () => {
    expect(rectProblem({ west: 170, south: 0, east: -170, north: 10 })).toBeNull();
  });
});

describe("without / withKey", () => {
  it("drops keys", () => {
    expect(without({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ b: 2 });
  });

  it("sets keys in place, keeping order, and removes them for undefined", () => {
    const obj = { a: 1, b: 2 };
    expect(Object.keys(withKey(obj, "a", 9))).toEqual(["a", "b"]);
    expect(withKey(obj, "c", 3)).toEqual({ a: 1, b: 2, c: 3 });
    expect(withKey(obj, "a", undefined)).toEqual({ b: 2 });
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});

describe("baseMapIds", () => {
  it("offers Terria's base maps by default", () => {
    expect(baseMapIds({})).toEqual(BUILT_IN_BASE_MAPS);
  });

  it("adds extra base maps first, given as ids or inline items", () => {
    const ids = baseMapIds({ items: [{ item: "//my-basemap" }, { item: { id: "inline", type: "wms" } }, { item: { type: "wms" } }, "junk", { item: "basemap-positron" }] });
    expect(ids.slice(0, 3)).toEqual(["//my-basemap", "inline", "basemap-positron"]);
    expect(ids).toHaveLength(2 + BUILT_IN_BASE_MAPS.length);
  });
});

describe("cameraMode", () => {
  it.each([
    [undefined, "unset"],
    [{ west: 0, south: 0, east: 1, north: 1 }, "rect"],
    [{ focusWorkbenchItems: true }, "focus"],
    [{ focusWorkbenchItems: true, west: 0 }, "json"],
    [{ lookAt: { targetLongitude: 0 } }, "json"],
    ["text", "json"],
  ])("%j -> %s", (value, mode) => {
    expect(cameraMode(value)).toBe(mode);
  });
});
