import { describe, expect, it } from "vitest";
import { getIn, humanize, isPlainObject, pathKey, setIn, traitKind } from "./traits";

describe("traitKind", () => {
  it.each([
    ["string", { kind: "string" }],
    ["number", { kind: "number" }],
    ["boolean", { kind: "boolean" }],
    ["any", { kind: "any" }],
    ["string[]", { kind: "stringArray" }],
    ["LegendTraits", { kind: "object", className: "LegendTraits" }],
    ["LegendTraits[]", { kind: "objectArray", className: "LegendTraits" }],
  ])("%s", (type, kind) => {
    expect(traitKind(type)).toEqual(kind);
  });
});

describe("pathKey", () => {
  it("joins with dots", () => {
    expect(pathKey(["legends", 0, "url"])).toBe("legends.0.url");
    expect(pathKey([])).toBe("");
  });
});

describe("isPlainObject", () => {
  it.each([
    [{}, true],
    [{ a: 1 }, true],
    [[], false],
    [null, false],
    ["x", false],
    [undefined, false],
  ])("%j -> %s", (v, expected) => {
    expect(isPlainObject(v)).toBe(expected);
  });
});

describe("setIn", () => {
  it("sets nested values without changing the original", () => {
    const original = { a: { b: 1 }, c: [1, 2] };
    const next = setIn(original, ["a", "b"], 2);
    expect(next).toEqual({ a: { b: 2 }, c: [1, 2] });
    expect(original.a.b).toBe(1);
    expect((next as typeof original).c).toBe(original.c);
  });

  it("creates objects and arrays along the path", () => {
    expect(setIn(undefined, ["legends", 0, "url"], "u")).toEqual({ legends: [{ url: "u" }] });
  });

  it("removes a key when set to undefined", () => {
    expect(setIn({ a: 1, b: 2 }, ["a"], undefined)).toEqual({ b: 2 });
    expect(setIn({ a: { b: 1 } }, ["a", "b"], undefined)).toEqual({ a: {} });
  });

  it("replaces the whole value for an empty path", () => {
    expect(setIn({ a: 1 }, [], 5)).toBe(5);
  });

  it("replaces non-objects in the way", () => {
    expect(setIn({ a: "text" }, ["a", "b"], 1)).toEqual({ a: { b: 1 } });
  });
});

describe("getIn", () => {
  const obj = { legends: [{ url: "u" }], n: null };
  it("reads nested values", () => {
    expect(getIn(obj, ["legends", 0, "url"])).toBe("u");
    expect(getIn(obj, [])).toBe(obj);
  });
  it("returns undefined for missing paths", () => {
    expect(getIn(obj, ["legends", 3, "url"])).toBeUndefined();
    expect(getIn(obj, ["n", "x"])).toBeUndefined();
    expect(getIn("text", ["length"])).toBeUndefined();
  });
});

describe("humanize", () => {
  it.each([
    ["getFeatureInfoUrl", "Get feature info URL"],
    ["url", "URL"],
    ["colorScaleMinimum", "Color scale minimum"],
    ["isGeoServer", "Is geo server"],
    ["supportsColorScaleRange", "Supports color scale range"],
    ["crs", "CRS"],
    ["WMSVersion", "WMS version"],
    ["isNcWMS", "Is NcWMS"],
    ["featureInfoTemplateHtml", "Feature info template HTML"],
  ])("%s -> %s", (name, label) => {
    expect(humanize(name)).toBe(label);
  });
});
