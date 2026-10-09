import { describe, expect, it } from "vitest";
import { buildModel } from "../terria/catalog-ui";
import { fieldId, traitMatches } from "./paths";

const model = buildModel({
  type: "t",
  model: "TCatalogItem",
  source: "",
  root: "Root",
  classes: {
    Root: [
      { name: "name", type: "string", description: "Display name" },
      { name: "legends", type: "LegendTraits[]", description: "Legends" },
      { name: "loop", type: "Loop", description: "Refers to itself" },
    ],
    LegendTraits: [{ name: "urlMimeType", type: "string", description: "MIME type of the legend image" }],
    Loop: [{ name: "next", type: "Loop", description: "" }],
  },
});
const trait = (name: string) => model.rootTraits.find((t) => t.name === name)!;

describe("fieldId", () => {
  it("makes a DOM id from a path", () => {
    expect(fieldId(["legends", 0, "url"])).toBe("f-legends.0.url");
  });
});

describe("traitMatches", () => {
  it("matches everything with no filter", () => {
    expect(traitMatches(model, trait("name"), "")).toBe(true);
  });

  it("matches name or description, ignoring case", () => {
    expect(traitMatches(model, trait("name"), "NAME")).toBe(true);
    expect(traitMatches(model, trait("name"), "display")).toBe(true);
    expect(traitMatches(model, trait("name"), "legend")).toBe(false);
  });

  it("matches traits of nested classes", () => {
    expect(traitMatches(model, trait("legends"), "mime")).toBe(true);
  });

  it("stops at a fixed depth for recursive classes", () => {
    expect(traitMatches(model, trait("loop"), "nothing matches")).toBe(false);
  });
});
