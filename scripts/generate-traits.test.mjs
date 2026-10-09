import { describe, expect, it } from "vitest";
import { decode, parseDefault, parseTraitsPage, parseTypeList, toText } from "./generate-traits.mjs";

const row = (name, type, def, desc) => `<tr>\n<td>${name}</td>\n<td>${type}</td>\n<td>${def}</td>\n<td>${desc}</td>\n</tr>`;

const PAGE = `
<h1 id="web-map-service">Web Map Service (WMS) Catalog Item</h1>
<h2 id="wms-traits">WebMapServiceCatalogItemTraits</h2>
<table><thead><tr><th>Trait</th><th>Type</th><th>Default</th><th>Description</th></tr></thead><tbody>
${row("layers", "string", "", "The layers to show, comma &amp; separated.")}
${row("opacity", "number", "0.8", "<p>Opacity.</p><p>From 0 to 1.</p>")}
${row("show", "boolean", "true", "Show it<br>or not.")}
${row("legends", "LegendTraits[]", "", "Legends:<ul><li>one</li><li>two</li></ul>")}
${row("currentTime", "string", "2024-01-01", "Rendered at docs build time")}
${row("members", "ModelReference[]", "", "Members")}
</tbody></table>
<h3 id="legend-traits">LegendTraits</h3>
<table><tbody>
${row("url", "string", "", "&quot;Legend&quot; URL")}
</tbody></table>
<h3 id="no-table">Notes</h3>
<p>Prose without a table.</p>
`;

describe("text helpers", () => {
  it("decodes entities", () => {
    expect(decode("&quot;a&quot; &#39;b&#x27; &lt;c&gt;&nbsp;&amp;amp;")).toBe(`"a" 'b' <c> &amp;`);
  });

  it("turns HTML into plain text lines", () => {
    expect(toText("<p>One</p> <p>Two<br/>Three</p><ul><li>a</li></ul>")).toBe("One\nTwo\nThree\n- a");
  });

  it("parses defaults by type", () => {
    expect(parseDefault("", "string")).toBeUndefined();
    expect(parseDefault("0.5", "number")).toBe(0.5);
    expect(parseDefault("false", "boolean")).toBe(false);
    expect(parseDefault("EPSG:3857", "string")).toBe("EPSG:3857");
  });
});

describe("parseTraitsPage", () => {
  const { model, root, classes } = parseTraitsPage(PAGE, "https://docs/wms");

  it("reads the title and root class", () => {
    expect(model).toBe("Web Map Service (WMS) Catalog Item");
    expect(root).toBe("WebMapServiceCatalogItemTraits");
    expect(Object.keys(classes)).toEqual(["WebMapServiceCatalogItemTraits", "LegendTraits"]);
  });

  it("reads every trait with its type, default and description", () => {
    expect(classes.WebMapServiceCatalogItemTraits).toEqual([
      { name: "layers", type: "string", description: "The layers to show, comma & separated." },
      { name: "opacity", type: "number", default: 0.8, description: "Opacity.\nFrom 0 to 1." },
      { name: "show", type: "boolean", default: true, description: "Show it\nor not." },
      { name: "legends", type: "LegendTraits[]", description: "Legends:\n- one\n- two" },
      { name: "currentTime", type: "string", description: "Rendered at docs build time" },
      { name: "members", type: "any", description: "Members" },
    ]);
    expect(classes.LegendTraits).toEqual([{ name: "url", type: "string", description: '"Legend" URL' }]);
  });

  it("fails without any trait tables", () => {
    expect(() => parseTraitsPage("<h1>Empty</h1>", "u")).toThrow("u: no trait tables found");
  });

  it("fails when a referenced class has no table", () => {
    const html = `<h1>X</h1><h2 id="x">XTraits</h2><table>${row("rect", "RectangleTraits", "", "")}</table>`;
    expect(() => parseTraitsPage(html, "u")).toThrow("referenced classes missing from page: RectangleTraits");
  });
});

describe("parseTypeList", () => {
  it("reads model and type from the index table", () => {
    const html = `<table><tr>\n<td><a href="wms/">WebMapServiceCatalogItem</a></td>\n<td><code>wms</code></td>\n</tr><tr><td><a href="csv/">CsvCatalogItem</a></td><td><code>csv</code></td></tr></table>`;
    expect(parseTypeList(html, "catalog-items")).toEqual([
      { type: "wms", model: "WebMapServiceCatalogItem" },
      { type: "csv", model: "CsvCatalogItem" },
    ]);
  });

  it("fails on a page without the table", () => {
    expect(() => parseTypeList("<p>moved</p>", "catalog-items")).toThrow("No catalog types found on the catalog-items page");
  });
});
