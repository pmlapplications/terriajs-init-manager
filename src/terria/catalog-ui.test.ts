import { describe, expect, it } from "vitest";
import { buildModel, groupTypes, itemTypes, kindOf, loadModel, orderLikeForm, shortModelName, typeLabel } from "./catalog-ui";
import type { TraitsFile } from "./traits";

describe("type lists", () => {
  it("lists item and group types without overlap", () => {
    expect(itemTypes.length).toBeGreaterThan(30);
    expect(groupTypes.length).toBeGreaterThan(5);
    const groups = new Set(groupTypes.map((t) => t.type));
    expect(itemTypes.filter((t) => groups.has(t.type))).toEqual([]);
  });

  it("includes the common types", () => {
    expect(itemTypes.map((t) => t.type)).toEqual(expect.arrayContaining(["wms", "csv", "geojson"]));
    expect(groupTypes.map((t) => t.type)).toEqual(expect.arrayContaining(["group", "wms-group"]));
  });
});

describe("kindOf", () => {
  it("knows groups from items", () => {
    expect(kindOf("group")).toBe("group");
    expect(kindOf("wms-group")).toBe("group");
    expect(kindOf("wms")).toBe("item");
    expect(kindOf("unknown")).toBe("item");
  });
});

describe("labels", () => {
  it("shortens model names", () => {
    expect(shortModelName("WebMapServiceCatalogItem")).toBe("WebMapService");
    expect(shortModelName("WebMapServiceCatalogGroup")).toBe("WebMapService");
    // Nothing would be left, so the name is kept.
    expect(shortModelName("CatalogGroup")).toBe("CatalogGroup");
  });

  it("labels types", () => {
    expect(typeLabel("group")).toBe("Group");
    expect(typeLabel("wms")).toBe("WebMapService");
    expect(typeLabel("wms-group")).toBe("WebMapService group");
    expect(typeLabel("made-up")).toBe("made-up");
  });
});

/** A small traits file: a root class with a nested object and object list. */
const FILE: TraitsFile = {
  type: "test-type",
  model: "TestCatalogItem",
  source: "https://example.com/docs",
  root: "TestTraits",
  classes: {
    TestTraits: [
      { name: "name", type: "string", description: "Name" },
      { name: "url", type: "string", description: "Service URL" },
      { name: "legendUrl", type: "string", description: "Legend URL" },
      { name: "fillColor", type: "string", description: "Fill" },
      { name: "opacity", type: "number", description: "Opacity" },
      { name: "special", type: "boolean", description: "Only this type has it" },
      { name: "rectangle", type: "RectangleTraits", description: "Extent" },
      { name: "legends", type: "LegendTraits[]", description: "Legends" },
    ],
    RectangleTraits: [
      { name: "west", type: "number", description: "" },
      { name: "south", type: "number", description: "" },
      { name: "east", type: "number", description: "" },
      { name: "north", type: "number", description: "" },
    ],
    LegendTraits: [
      { name: "title", type: "string", description: "" },
      { name: "url", type: "string", description: "" },
    ],
  },
};

describe("buildModel", () => {
  const model = buildModel(FILE);

  it("adds the id and share key fields to the root traits", () => {
    expect(model.rootTraits.map((t) => t.name).slice(0, 3)).toEqual(["id", "shareKeys", "name"]);
    expect(model.totalTraitCount).toBe(2 + 8 + 4 + 2);
    expect(model).toMatchObject({ type: "test-type", kind: "item", rootClass: "TestTraits", source: FILE.source });
  });

  it("puts traits without a section in '<Type> options' after Basics", () => {
    expect(model.sections[0].id).toBe("basics");
    expect(model.sections[0].traits).toEqual(["id", "name", "url", "shareKeys"]);
    expect(model.sections[1]).toEqual({ id: "specific", title: "Test options", traits: ["legendUrl", "fillColor", "special"] });
    expect(model.sections.map((s) => s.id)).toEqual(["basics", "specific", "display", "legends", "extent"]);
  });

  it("returns nested class traits, and none for unknown classes", () => {
    expect(model.classTraits("RectangleTraits").map((t) => t.name)).toEqual(["west", "south", "east", "north"]);
    expect(model.classTraits("TestTraits")).toBe(model.rootTraits);
    expect(model.classTraits("Nope")).toEqual([]);
  });

  it("infers url and colour widgets from names, and uses common root specs", () => {
    const spec = (name: string, className = "TestTraits") =>
      model.specFor(className, model.classTraits(className).find((t) => t.name === name)!);
    expect(spec("url")).toEqual({ widget: "url" });
    expect(spec("legendUrl")).toEqual({ widget: "url" });
    expect(spec("fillColor")).toEqual({ widget: "color" });
    expect(spec("name")).toEqual({ required: true });
    expect(spec("opacity")).toEqual({ min: 0, max: 1 });
    expect(spec("special")).toEqual({});
    // Common root specs only apply at the root.
    expect(spec("url", "LegendTraits")).toEqual({ widget: "url" });
    expect(spec("title", "LegendTraits")).toEqual({});
  });

  it("only applies a common spec when the trait has the expected type", () => {
    const odd = buildModel({ ...FILE, classes: { ...FILE.classes, TestTraits: [{ name: "opacity", type: "string", description: "" }] } });
    expect(odd.specFor("TestTraits", odd.rootTraits.find((t) => t.name === "opacity")!)).toEqual({});
  });

  it("leaves `members` out of groups and names their options section", () => {
    const group = buildModel({
      type: "wms-group",
      model: "WebMapServiceCatalogGroup",
      source: "",
      root: "G",
      classes: { G: [{ name: "name", type: "string", description: "" }, { name: "members", type: "any", description: "" }, { name: "flatten", type: "boolean", description: "" }] },
    });
    expect(group.kind).toBe("group");
    expect(group.rootTraits.map((t) => t.name)).not.toContain("members");
    expect(group.sections.find((s) => s.id === "specific")?.title).toBe("WebMapService group options");
  });
});

describe("loadModel", () => {
  it.each([...itemTypes, ...groupTypes].map((t) => t.type))("builds a model for %s", async (type) => {
    const model = await loadModel(type);
    expect(model.type).toBe(type);
    expect(model.rootTraits.some((t) => t.name === "name")).toBe(true);
    // Every trait is in exactly one section.
    const placed = model.sections.flatMap((s) => s.traits);
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.sort()).toEqual(model.rootTraits.map((t) => t.name).sort());
  });

  it("loads each type once", async () => {
    expect(await loadModel("wms")).toBe(await loadModel("wms"));
  });

  it("rejects unknown types", async () => {
    await expect(loadModel("no-such-type")).rejects.toThrow('Unknown catalog type "no-such-type"');
  });
});

describe("orderLikeForm", () => {
  const model = buildModel(FILE);

  it("orders root keys by section and nested keys by docs order, unknown keys last", () => {
    const ordered = orderLikeForm(model, {
      zzz: 1,
      legends: [{ url: "u", title: "t", extra: true }, "not an object"],
      rectangle: { north: 1, west: 2 },
      name: "n",
      special: true,
      id: "x",
    });
    expect(Object.keys(ordered)).toEqual(["id", "name", "special", "legends", "rectangle", "zzz"]);
    expect(Object.keys((ordered.legends as object[])[0])).toEqual(["title", "url", "extra"]);
    expect((ordered.legends as unknown[])[1]).toBe("not an object");
    expect(Object.keys(ordered.rectangle as object)).toEqual(["west", "north"]);
  });
});
