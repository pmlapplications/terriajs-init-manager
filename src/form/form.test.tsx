// The form widgets, exercised through the WMS editor, which has a trait of
// every kind: text, select, number, boolean, JSON, lists, colours, nested
// objects and lists of objects, plus the GetCapabilities helpers.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import App from "../App";
import { saveDraft } from "../drafts";
import { loadModel, type CatalogModel } from "../terria/catalog-ui";
import { mockFetch } from "../test/fetch";
import { fieldId } from "./paths";

let wms: CatalogModel;
beforeAll(async () => {
  wms = await loadModel("wms");
});

const byId = (...path: (string | number)[]) => document.getElementById(fieldId(path)) as HTMLInputElement;
const preview = () => {
  const { type: _type, ...item } = JSON.parse(document.querySelector(".preview pre")!.textContent!);
  return item;
};
const field = (path: string) => byId(path).closest(".field, fieldset") as HTMLElement;

function editor(draft: Record<string, unknown> = {}) {
  saveDraft("wms", draft);
  render(<App model={wms} />);
}

async function openSection(title: string) {
  const nav = screen.getByRole("navigation", { name: "Sections" });
  await userEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${title}`) }));
}

describe("text and textarea", () => {
  it("sets text and removes the trait when emptied", async () => {
    editor();
    await userEvent.type(byId("name"), "SST");
    expect(preview()).toEqual({ name: "SST" });
    await userEvent.clear(byId("name"));
    expect(preview()).toEqual({});
  });

  it("edits the description as multi-line text", async () => {
    editor();
    await userEvent.type(byId("description"), "Line 1{enter}Line 2");
    expect(preview()).toEqual({ description: "Line 1\nLine 2" });
  });

  it("clears a trait from its label", async () => {
    editor({ name: "SST" });
    await userEvent.click(within(field("name")).getByRole("button", { name: "clear" }));
    expect(preview()).toEqual({});
  });
});

describe("selects", () => {
  it("chooses from allowed values and can unset", async () => {
    editor();
    await openSection("Service requests");
    await userEvent.selectOptions(byId("crs"), "EPSG:4326");
    expect(preview()).toEqual({ crs: "EPSG:4326" });
    await userEvent.selectOptions(byId("crs"), "");
    expect(preview()).toEqual({});
  });

  it("keeps a value that isn't allowed, marked as such", async () => {
    editor({ crs: "EPSG:1234" });
    await openSection("Service requests");
    expect(within(byId("crs")).getByRole("option", { name: "EPSG:1234 (not allowed)" })).toBeInTheDocument();
    expect(byId("crs")).toHaveAttribute("aria-invalid", "true");
  });

  it("sends numbers for numeric selects", async () => {
    editor();
    await openSection("Display");
    await userEvent.selectOptions(byId("splitDirection"), "Left (-1)");
    expect(preview()).toEqual({ splitDirection: -1 });
  });
});

describe("numbers", () => {
  it("commits numbers and holds back text that isn't one", async () => {
    editor();
    await openSection("Display");
    await userEvent.type(byId("opacity"), "0.5");
    expect(preview()).toEqual({ opacity: 0.5 });
    await userEvent.clear(byId("opacity"));
    await userEvent.type(byId("opacity"), "abc");
    expect(byId("opacity")).toHaveValue("abc");
    expect(preview()).toEqual({});
    expect(screen.getByRole("button", { name: /3 errors/ })).toBeInTheDocument();
  });

  it("shows range errors", async () => {
    editor({ opacity: 2 });
    await openSection("Display");
    expect(within(field("opacity")).getByText("Must be at most 1")).toBeInTheDocument();
  });
});

describe("booleans", () => {
  it("chooses yes, no or unset", async () => {
    editor();
    await openSection("Service requests");
    const group = byId("isGeoServer");
    await userEvent.click(within(group).getByRole("radio", { name: "Yes" }));
    expect(preview()).toEqual({ isGeoServer: true });
    expect(within(group).getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(group).getByRole("radio", { name: "No" }));
    expect(preview()).toEqual({ isGeoServer: false });
    await userEvent.click(within(group).getByRole("radio", { name: /Default|Not set/ }));
    expect(preview()).toEqual({});
  });
});

describe("JSON", () => {
  it("commits valid JSON and reports invalid JSON", async () => {
    editor();
    await openSection("Service requests");
    fireEvent.change(byId("parameters"), { target: { value: '{"styles": "x"}' } });
    expect(preview()).toEqual({ parameters: { styles: "x" } });
    fireEvent.change(byId("parameters"), { target: { value: "{oops" } });
    expect(preview()).toEqual({ parameters: { styles: "x" } });
    await userEvent.click(screen.getByRole("button", { name: /errors/ }));
    expect(within(document.querySelector(".issue-panel") as HTMLElement).getByText(/Invalid JSON/)).toBeInTheDocument();
  });

  it("requires an object where the trait says so", async () => {
    editor({ parameters: [1] });
    await openSection("Service requests");
    expect(within(field("parameters")).getByText("Expected a JSON object, got a list")).toBeInTheDocument();
  });
});

describe("lists of text", () => {
  it("adds, edits and removes values", async () => {
    editor();
    const list = byId("shareKeys");
    await userEvent.click(within(list).getByRole("button", { name: "+ Add value" }));
    await userEvent.type(byId("shareKeys", 0), "Root/SST");
    await userEvent.click(within(list).getByRole("button", { name: "+ Add value" }));
    await userEvent.type(byId("shareKeys", 1), "old");
    expect(preview()).toEqual({ shareKeys: ["Root/SST", "old"] });
    await userEvent.click(within(list).getAllByRole("button", { name: "Remove" })[0]);
    expect(preview()).toEqual({ shareKeys: ["old"] });
    await userEvent.click(within(list).getByRole("button", { name: "Remove" }));
    expect(preview()).toEqual({});
  });
});

describe("colours", () => {
  it("takes text or the picker", async () => {
    editor();
    await openSection("Legends");
    await userEvent.type(byId("legendBackgroundColor"), "red");
    expect(preview()).toEqual({ legendBackgroundColor: "red" });
    fireEvent.input(within(field("legendBackgroundColor")).getByLabelText("Pick colour"), { target: { value: "#00ff00" } });
    expect(preview()).toEqual({ legendBackgroundColor: "#00ff00" });
  });

  it("flags text that isn't a colour", async () => {
    editor({ legendBackgroundColor: "not-a-colour!" });
    await openSection("Legends");
    expect(within(field("legendBackgroundColor")).getByText(/Not a CSS colour/)).toBeInTheDocument();
  });
});

describe("nested objects", () => {
  it("expands, edits and clears", async () => {
    editor();
    await openSection("Extent");
    const rectangle = byId("rectangle");
    await userEvent.click(within(rectangle).getByRole("button", { name: "Rectangle" }));
    await userEvent.type(byId("rectangle", "west"), "-10");
    await userEvent.type(byId("rectangle", "north"), "60");
    expect(preview()).toEqual({ rectangle: { west: -10, north: 60 } });
    expect(within(rectangle).getByText("2 set")).toBeInTheDocument();
    // The legend's own clear button, not those of the fields inside.
    await userEvent.click(within(rectangle.querySelector("legend")!).getByRole("button", { name: "clear" }));
    expect(preview()).toEqual({});
  });

  it("counts errors inside a collapsed object", async () => {
    editor({ rectangle: { west: "x" } });
    await openSection("Extent");
    expect(within(byId("rectangle")).getByText("1", { selector: ".badge.error" })).toBeInTheDocument();
  });
});

describe("lists of objects", () => {
  it("adds, titles, reorders and removes entries", async () => {
    editor();
    await openSection("Legends");
    const legends = byId("legends");
    await userEvent.click(within(legends).getByRole("button", { name: "+ Add legend" }));
    await userEvent.type(byId("legends", 0, "title"), "First");
    await userEvent.click(within(legends).getByRole("button", { name: "+ Add legend" }));
    await userEvent.type(byId("legends", 1, "url"), "https://example.com/l.png");
    expect(preview()).toEqual({ legends: [{ title: "First" }, { url: "https://example.com/l.png" }] });
    expect(within(legends).getByRole("button", { name: "First" })).toBeInTheDocument();
    expect(within(legends).getByRole("button", { name: "https://example.com/l.png" })).toBeInTheDocument();

    await userEvent.click(within(legends).getAllByRole("button", { name: "Move down" })[0]);
    expect(preview().legends.map((l: { title?: string }) => l.title)).toEqual([undefined, "First"]);
    await userEvent.click(within(legends).getAllByRole("button", { name: "Move up" })[1]);
    expect(preview().legends[0]).toEqual({ title: "First" });

    await userEvent.click(within(legends).getAllByRole("button", { name: "Remove" })[0]);
    await userEvent.click(within(legends).getByRole("button", { name: "Remove" }));
    expect(preview()).toEqual({});
  });

  it("names untitled entries by position", async () => {
    editor({ legends: [{}] });
    await openSection("Legends");
    expect(within(byId("legends")).getByRole("button", { name: "Item 1" })).toBeInTheDocument();
  });
});

describe("descriptions and filters", () => {
  it("expands long descriptions", async () => {
    editor();
    await openSection("Service requests");
    const description = screen.getAllByRole("button", { name: "more" })[0].closest(".desc")!;
    expect(description).not.toHaveClass("open");
    await userEvent.click(within(description as HTMLElement).getByRole("button", { name: "more" }));
    expect(description).toHaveClass("open");
    expect(within(description as HTMLElement).getByRole("button", { name: "less" })).toBeInTheDocument();
  });

  it("can show only the traits that are set", async () => {
    editor({ name: "SST" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Only show set traits" }));
    expect(byId("name")).toBeInTheDocument();
    expect(byId("url")).toBeNull();
  });

  it("searches across sections", async () => {
    editor();
    await userEvent.type(screen.getByPlaceholderText(/Search \d+ traits/), "opacity");
    expect(byId("opacity")).toBeInTheDocument();
    expect(byId("name")).toBeNull();
  });

  it("switches sections from the dropdown", async () => {
    editor();
    await userEvent.selectOptions(screen.getByLabelText("Section"), "Legends");
    expect(byId("legends")).toBeInTheDocument();
  });
});

describe("WMS layers and styles", () => {
  it("adds layers as chips and removes them", async () => {
    editor();
    await userEvent.type(byId("layers"), "chl, sst{enter}");
    expect(preview()).toEqual({ layers: "chl,sst" });
    await userEvent.type(byId("layers"), "chl");
    await userEvent.click(within(field("layers")).getByRole("button", { name: "Add" }));
    expect(preview()).toEqual({ layers: "chl,sst" });
    await userEvent.click(screen.getByRole("button", { name: "Remove chl" }));
    expect(preview()).toEqual({ layers: "sst" });
    await userEvent.click(screen.getByRole("button", { name: "Remove sst" }));
    expect(preview()).toEqual({});
  });

  it("takes styles as text without layers, and one per layer with them", async () => {
    editor();
    await userEvent.type(byId("styles"), "a,b");
    expect(preview()).toEqual({ styles: "a,b" });
  });

  it("gives one style box per layer", async () => {
    editor({ layers: "chl,sst" });
    const boxes = within(byId("styles")).getAllByPlaceholderText("Server default");
    expect(boxes).toHaveLength(2);
    await userEvent.type(boxes[1], "log,x");
    expect(preview()).toEqual({ layers: "chl,sst", styles: ",logx" });
  });
});

const CAPS = `<WMS_Capabilities version="1.3.0"><Service><Title>Ocean</Title></Service><Capability><Layer>
  <Layer><Name>chl</Name><Title>Chlorophyll</Title><Abstract>Chl-a</Abstract>
    <Style><Name>log</Name><Title>Log scale</Title></Style><Style><Name>linear</Name></Style>
    <EX_GeographicBoundingBox><westBoundLongitude>-20</westBoundLongitude><eastBoundLongitude>10</eastBoundLongitude><southBoundLatitude>40</southBoundLatitude><northBoundLatitude>65</northBoundLatitude></EX_GeographicBoundingBox>
  </Layer></Layer></Capability></WMS_Capabilities>`;

describe("GetCapabilities", () => {
  it("needs a URL first", () => {
    editor();
    expect(screen.getByText("Enter the service URL first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load from server" })).toBeDisabled();
  });

  it("loads layers, then offers names, descriptions, styles and extents", async () => {
    mockFetch({ "GET https://example.com/wms": () => new Response(CAPS) });
    editor({ url: "https://example.com/wms", layers: "chl,missing" });
    await userEvent.click(screen.getByRole("button", { name: "Load from server" }));
    expect(await screen.findByText("Ocean · version 1.3.0 · 1 layers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();

    // Layers the server doesn't list are flagged.
    expect(within(field("layers")).getByText("missing").closest("li")).toHaveClass("warn");
    expect(screen.getByText("Chlorophyll", { selector: "small" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Use “Chlorophyll” as name" }));
    await userEvent.click(screen.getByRole("button", { name: "Use layer abstract as description" }));
    expect(preview()).toMatchObject({ name: "Chlorophyll", description: "Chl-a" });

    const styleSelect = within(byId("styles")).getAllByRole("combobox")[0];
    await userEvent.selectOptions(styleSelect, "log");
    expect(preview().styles).toBe("log,");

    await openSection("Extent");
    await userEvent.click(within(byId("rectangle")).getByRole("button", { name: "Rectangle" }));
    expect(screen.getByText("W -20 · S 40 · E 10 · N 65")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use extent of selected layers" }));
    expect(preview().rectangle).toEqual({ west: -20, south: 40, east: 10, north: 65 });
  });

  it("shows load errors", async () => {
    mockFetch({ "GET https://example.com/wms": () => new Response("<html/>") });
    editor({ url: "https://example.com/wms" });
    await userEvent.click(screen.getByRole("button", { name: "Load from server" }));
    expect(await screen.findByText(/Not a WMS capabilities document/)).toBeInTheDocument();
  });

  it("prefers getCapabilitiesUrl over url", async () => {
    const { calls } = mockFetch({ "GET https://example.com/caps": () => new Response(CAPS) });
    editor({ url: "https://example.com/wms", getCapabilitiesUrl: "https://example.com/caps" });
    await userEvent.click(screen.getByRole("button", { name: "Load from server" }));
    await waitFor(() => expect(calls[0]?.url).toContain("https://example.com/caps?"));
  });
});
