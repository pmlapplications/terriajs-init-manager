import { describe, expect, it } from "vitest";
import { groupTypes, itemTypes } from "./catalog-ui";
import { CATEGORIES, categoryOf, iconFor } from "./type-categories";

describe("type categories", () => {
  it("puts every group in Groups with a folder icon", () => {
    for (const { type } of groupTypes) {
      expect(categoryOf(type)).toBe("groups");
      expect(iconFor(type)).toBe(type === "group" ? "folder" : "folderServer");
    }
  });

  it("categorises the common item types", () => {
    expect([categoryOf("wms"), iconFor("wms")]).toEqual(["imagery", "globe"]);
    expect([categoryOf("geojson"), iconFor("geojson")]).toEqual(["vector", "shapes"]);
    expect([categoryOf("csv"), iconFor("csv")]).toEqual(["tables", "table"]);
    expect([categoryOf("3d-tiles"), iconFor("3d-tiles")]).toEqual(["3d", "cube"]);
  });

  it("falls back to Other for unknown types", () => {
    expect([categoryOf("future-type"), iconFor("future-type")]).toEqual(["other", "layers"]);
  });

  it("gives every item type a known category", () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const { type } of itemTypes) expect(ids).toContain(categoryOf(type));
  });
});
