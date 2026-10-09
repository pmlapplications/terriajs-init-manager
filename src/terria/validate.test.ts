import { beforeAll, describe, expect, it } from "vitest";
import { loadModel, type CatalogModel } from "./catalog-ui";
import { checkNumber, checkStringWidget, isCssColor, validateItem, type Issue } from "./validate";

describe("checkStringWidget", () => {
  it.each([
    ["https://example.com/wms?x=1", null],
    ["http://example.com", null],
    ["data:image/png;base64,AAAA", null],
    ["/relative/path", null],
    ["example.com/wms", null],
    ["https://exa mple.com", "URLs cannot contain spaces"],
    ["ftp://example.com", 'Unsupported protocol "ftp:"'],
    ["javascript:alert(1)", 'Unsupported protocol "javascript:"'],
    ["http://[bad", "Not a valid URL"],
  ])("url %j", (value, problem) => {
    expect(checkStringWidget(value, "url")).toBe(problem);
  });

  it.each([
    ["2024-01-31", true],
    ["2024-01-31T12:00", true],
    ["2024-01-31T12:00:00Z", true],
    ["2024-01-31T12:00:00.5+01:00", true],
    ["2024-13-45", false],
    ["31/01/2024", false],
    ["yesterday", false],
  ])("datetime %j", (value, ok) => {
    expect(checkStringWidget(value, "datetime") === null).toBe(ok);
  });

  it.each([
    ["30s", true],
    ["1.5h", true],
    ["100ms", true],
    ["1w", true],
    ["1 day", false],
    ["d", false],
    ["10", false],
  ])("duration %j", (value, ok) => {
    expect(checkStringWidget(value, "duration") === null).toBe(ok);
  });

  it("checks colours", () => {
    expect(checkStringWidget("#00ffff", "color")).toBeNull();
    expect(checkStringWidget("not a colour!", "color")).toMatch(/Not a CSS colour/);
  });

  it("accepts anything for other widgets", () => {
    expect(checkStringWidget("any text", "textarea")).toBeNull();
    expect(checkStringWidget("any text", undefined)).toBeNull();
  });
});

describe("isCssColor", () => {
  it.each(["#fff", "#00ffffaa", "cyan", "rgba(0, 255, 255, 1)", "hsl(120, 50%, 50%)"])("accepts %s", (c) => {
    expect(isCssColor(c)).toBe(true);
  });
  it.each(["#ggg", "rgb(", "", "12"])("rejects %j", (c) => {
    expect(isCssColor(c)).toBe(false);
  });
});

describe("checkNumber", () => {
  it.each([
    [5, {}, null],
    [Infinity, {}, "Expected a number"],
    [NaN, {}, "Expected a number"],
    [1.5, { integer: true }, "Expected a whole number"],
    [-1, { min: 0 }, "Must be at least 0"],
    [0, { min: 0 }, null],
    [0, { min: 0, exclusiveMin: true }, "Must be greater than 0"],
    [0.1, { min: 0, exclusiveMin: true }, null],
    [2, { max: 1 }, "Must be at most 1"],
  ])("%s with %j", (value, spec, problem) => {
    expect(checkNumber(value, spec)).toBe(problem);
  });
});

describe("validateItem (wms)", () => {
  let model: CatalogModel;
  beforeAll(async () => {
    model = await loadModel("wms");
  });

  const issues = (item: Record<string, unknown>) => validateItem(model, { name: "Layer", url: "https://example.com/wms", layers: "a", ...item });
  const at = (list: Issue[], path: string) => list.filter((i) => i.path === path);

  it("accepts a valid item", () => {
    expect(issues({ type: "wms", opacity: 0.5, legends: [{ url: "https://example.com/l.png" }], rectangle: { west: 0, south: 0, east: 1, north: 1 } })).toEqual([]);
  });

  it("requires name and url", () => {
    const list = validateItem(model, { layers: "a" });
    expect(at(list, "name")).toEqual([{ path: "name", level: "error", message: "Required" }]);
    expect(at(list, "url")[0].message).toBe("Required");
  });

  it("checks the type", () => {
    expect(at(issues({ type: "csv" }), "type")[0].message).toBe('type must be "wms", got "csv"');
  });

  it("warns about unknown traits", () => {
    expect(at(issues({ madeUp: 1 }), "madeUp")).toEqual([{ path: "madeUp", level: "warning", message: '"madeUp" is not a WebMapServiceCatalogItemTraits trait' }]);
  });

  it("allows null to clear a value", () => {
    expect(issues({ opacity: null })).toEqual([]);
  });

  it.each([
    ["name", 5, "Expected text, got number 5"],
    ["opacity", "high", 'Expected a number, got string "high"'],
    ["opacity", 2, "Must be at most 1"],
    ["isGeoServer", "yes", 'Expected true or false, got string "yes"'],
    ["dimensions", [1], "Expected a JSON object, got a list"],
    ["rectangle", "box", 'Expected an object, got string "box"'],
    ["legends", {}, "Expected a list, got an object"],
    ["splitDirection", 2, "2 is not one of: -1, 0, 1"],
    ["crs", "EPSG:1", '"EPSG:1" is not one of: EPSG:3857, EPSG:900913, EPSG:4326, CRS:84, EPSG:4283'],
    ["startTime", "soon", "Expected an ISO 8601 date/time, e.g. 2024-01-31 or 2024-01-31T12:00:00Z"],
    ["url", "ftp://x", 'Unsupported protocol "ftp:"'],
  ])("rejects %s = %j", (key, value, message) => {
    expect(at(issues({ [key]: value }), key)).toEqual([{ path: key, level: "error", message }]);
  });

  it("shortens long values in messages", () => {
    expect(at(issues({ opacity: "x".repeat(60) }), "opacity")[0].message).toMatch(/…$/);
  });

  it("validates inside nested objects and lists", () => {
    const list = issues({ rectangle: { west: "w" }, legends: [{ url: 5 }, "x"], shareKeys: ["ok", 3] });
    expect(at(list, "rectangle.west")[0].message).toMatch(/Expected a number/);
    expect(at(list, "legends.0.url")[0].message).toMatch(/Expected text/);
    expect(at(list, "legends.1")[0].message).toBe("Expected an object");
    expect(at(list, "shareKeys.1")[0].message).toBe("Expected text");
    expect(at(issues({ shareKeys: "a" }), "shareKeys")[0].message).toMatch(/Expected a list of text values/);
  });

  describe("cross-field rules", () => {
    it.each([
      [{ colorScaleMinimum: 5, colorScaleMaximum: 1 }, "colorScaleMinimum", "error"],
      [{ minimumLevel: 5, maximumLevel: 1 }, "minimumLevel", "error"],
      [{ minScaleDenominator: 5, maxScaleDenominator: 1 }, "minScaleDenominator", "error"],
      [{ startTime: "2024-02-01", stopTime: "2024-01-01" }, "startTime", "error"],
      [{ layers: "" }, "layers", "warning"],
      [{ layers: "a,b", styles: "s" }, "styles", "warning"],
      [{ rectangle: { south: 10, north: 0 } }, "rectangle.south", "error"],
      [{ rectangle: { west: 10, east: 0 } }, "rectangle.west", "warning"],
      [{ legends: [{ url: "https://example.com/legend" }] }, "legends.0.urlMimeType", "warning"],
      [{ isShowingDiff: true }, "firstDiffDate", "warning"],
    ])("%j flags %s", (item, path, level) => {
      expect(at(issues(item), path).map((i) => i.level)).toContain(level);
    });

    it("accepts the same values the right way round", () => {
      expect(
        issues({
          colorScaleMinimum: 1,
          colorScaleMaximum: 5,
          startTime: "2024-01-01",
          stopTime: "2024-02-01",
          styles: "s1,s2",
          layers: "a,b",
          legends: [{ url: "https://example.com/legend", urlMimeType: "image/png" }, { url: "https://example.com/l.svg?x" }],
          isShowingDiff: true,
          firstDiffDate: "2024-01-01",
          secondDiffDate: "2024-01-02",
          diffStyleId: "diff",
        }),
      ).toEqual([]);
    });
  });
});
