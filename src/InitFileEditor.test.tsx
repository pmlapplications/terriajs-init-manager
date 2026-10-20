import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MapCamera } from "./CameraMap";
import { InitFileEditor } from "./InitFileEditor";
import { json, mockFetch, type Call } from "./test/fetch";
import { initFile, memberEntry, memberRef, output } from "./test/fixtures";

// Leaflet needs a real browser; stand in a button per camera that "uses the map view".
vi.mock("./CameraMap", () => ({
  CameraMap: ({ cameras }: { cameras: MapCamera[] }) => (
    <div>
      {cameras.map((c) => (
        <button key={c.key} type="button" onClick={() => c.onSet({ west: 1, south: 2, east: 3, north: 4 })}>
          Use map view for {c.label}
        </button>
      ))}
    </div>
  ),
}));

const NO_MEMBERS = { items: [], total: 0, page: 1, pageSize: 15 };

/** Loads an existing init file into the editor. */
async function openFile(file = initFile(), routes: Record<string, unknown> = {}) {
  const mock = mockFetch({ "GET /api/init-files/f1": file, "GET /api/members": NO_MEMBERS, ...routes });
  render(<InitFileEditor id="f1" />);
  await screen.findByRole("heading", { name: file.name });
  return mock;
}

/** A form row's input; the label's text also includes its hint. */
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));

const statusRow = (label: string) => screen.getByText(label, { selector: ".init-output-label" }).closest(".init-output") as HTMLElement;

describe("InitFileEditor: new file", () => {
  it("fills the file name from the name until it is edited", async () => {
    mockFetch({ "GET /api/members": NO_MEMBERS });
    render(<InitFileEditor id={null} />);
    expect(screen.getByRole("heading", { name: "New init file" })).toBeInTheDocument();
    await userEvent.type(field("Name"), "Ocean Colour!");
    expect(field("File name")).toHaveValue("ocean-colour");
    await userEvent.clear(field("File name"));
    await userEvent.type(field("File name"), "custom");
    await userEvent.type(field("Name"), " v2");
    expect(field("File name")).toHaveValue("custom");
  });

  it("lists problems and blocks saving until they are fixed", async () => {
    mockFetch({ "GET /api/members": NO_MEMBERS });
    render(<InitFileEditor id={null} />);
    const save = screen.getByRole("button", { name: "Save new" });
    expect(save).toBeDisabled();
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Set a home camera (it is required by Terria).")).toBeInTheDocument();

    await userEvent.type(field("Name"), "Ocean");
    await userEvent.click(screen.getByRole("button", { name: "Use map view for Home camera" }));
    expect(screen.queryByText("Name is required.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Set a home camera/)).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it("saves a new file and moves to its URL", async () => {
    const saved = initFile({ id: "new-id", name: "Ocean", slug: "ocean", config: { homeCamera: { west: 1, south: 2, east: 3, north: 4 } } });
    const { calls } = mockFetch({ "GET /api/members": NO_MEMBERS, "POST /api/init-files": saved });
    render(<InitFileEditor id={null} />);
    await userEvent.type(field("Name"), "Ocean");
    await userEvent.click(screen.getByRole("button", { name: "Use map view for Home camera" }));
    await userEvent.click(screen.getByRole("button", { name: "Save new" }));

    expect(await screen.findByText("Saved version 1")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      slug: "ocean",
      name: "Ocean",
      description: null,
      config: { homeCamera: { west: 1, south: 2, east: 3, north: 4 } },
      catalog: [],
      workbench: [],
    });
    expect(location.hash).toBe("#/init-files/new-id");
    // Publishing appears once there is a saved file.
    expect(screen.getByRole("button", { name: "Publish to /config/ocean.json" })).toBeInTheDocument();
  });
});

describe("InitFileEditor: existing file", () => {
  it("loads the file into the form", async () => {
    await openFile(initFile({ description: "Notes here", config: { homeCamera: { west: -10, south: 40, east: 10, north: 60 }, viewerMode: "2d", corsDomains: ["a.org", "b.org"] } }));
    expect(field("Name")).toHaveValue("Ocean map");
    expect(field("File name")).toHaveValue("ocean");
    expect(field("Notes")).toHaveValue("Notes here");
    expect(field("Viewer mode")).toHaveValue("2d");
    expect(field("CORS domains")).toHaveValue("a.org\nb.org");
    expect(screen.queryByText("· Unsaved changes", { exact: false })).not.toBeInTheDocument();
  });

  it("marks unsaved changes and saves with the loaded version", async () => {
    const { calls } = await openFile(initFile({ version: 3 }), { "PUT /api/init-files/f1": initFile({ version: 4, name: "Renamed" }) });
    await userEvent.clear(field("Name"));
    await userEvent.type(field("Name"), "Renamed");
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved version 4")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ name: "Renamed", version: 3 });
    expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
  });

  it("shows a save conflict", async () => {
    await openFile(initFile(), { "PUT /api/init-files/f1": () => json({ error: "This init file was changed by someone else" }, 409) });
    await userEvent.type(field("Name"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This init file was changed by someone else")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    mockFetch({ "GET /api/init-files/f1": () => json({ error: "No init file with id f1" }, 404) });
    render(<InitFileEditor id="f1" />);
    expect(await screen.findByText("No init file with id f1")).toBeInTheDocument();
  });

  it("deletes after confirming, mentioning the test copy", async () => {
    const test = output({ path: "/config/test/f1.json" });
    const { calls } = await openFile(initFile({ test }), { "DELETE /api/init-files/f1": () => json(null, 204) });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm.mock.calls[0][0]).toContain("/config/test/f1.json");
    await waitFor(() => expect(location.hash).toBe("#/init-files"));
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("can't delete a published file", async () => {
    await openFile(initFile({ published: output() }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("shows the exported JSON on request", async () => {
    const exported = { homeCamera: { west: 0 }, catalog: [] };
    await openFile(initFile(), { "GET /api/init-files/f1/export": exported });
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(await screen.findByText(/"catalog": \[\]/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("adds catalog groups from the search", async () => {
    await openFile(initFile(), {
      "GET /api/members": (call: Call) =>
        call.url.includes("kind=group") ? { items: [memberEntry({ id: "g1", name: "Ocean group", type: "group", kind: "group" })], total: 1, page: 1, pageSize: 15 } : NO_MEMBERS,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "Remove Ocean group" })).toBeInTheDocument();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
  });

  it("flags workbench items that are no longer in the catalog", async () => {
    await openFile(initFile({ catalog: [memberRef({ id: "g1", type: "group", kind: "group", name: "G" })], workbench: [memberRef({ id: "i1", name: "Lost" })] }));
    expect(await screen.findByText("Not in the catalog")).toBeInTheDocument();
  });
});

describe("InitFileEditor: publishing", () => {
  it("publishes and shows where", async () => {
    const { calls } = await openFile(initFile(), { "POST /api/init-files/f1/publish": initFile({ published: output() }) });
    const row = statusRow("Status");
    expect(within(row).getByText("Not published")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Publish to /config/ocean.json" }));
    expect(await within(row).findByText("Published")).toBeInTheDocument();
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/config/ocean.json");
    expect(within(row).getByText(/version 1, .* by ada@example.com/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/init-files/f1/publish")).toBe(true);
  });

  it("offers to update a published file that is out of date", async () => {
    const { calls } = await openFile(initFile({ version: 2, published: output({ version: 1 }) }), {
      "POST /api/init-files/f1/publish": initFile({ version: 2, published: output({ version: 2 }) }),
    });
    const row = statusRow("Status");
    expect(within(row).getByText(/out of date \(now version 2\)/)).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Update" }));
    await waitFor(() => expect(within(row).queryByText(/out of date/)).not.toBeInTheDocument());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("unpublishes only after confirming", async () => {
    const { calls } = await openFile(initFile({ published: output() }), { "DELETE /api/init-files/f1/publish": initFile() });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const row = statusRow("Status");
    await userEvent.click(within(row).getByRole("button", { name: "Unpublish" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(within(row).getByRole("button", { name: "Unpublish" }));
    expect(await within(row).findByText("Not published")).toBeInTheDocument();
    expect(confirm.mock.calls[0][0]).toContain("/config/ocean.json is deleted");
  });

  it("turns test mode on and off without confirmation", async () => {
    const testOutput = output({ path: "/config/test/f1.json" });
    let on = false;
    const { calls } = await openFile(initFile(), {
      "POST /api/init-files/f1/test": () => ((on = true), initFile({ test: testOutput })),
      "DELETE /api/init-files/f1/test": () => ((on = false), initFile()),
    });
    const confirm = vi.spyOn(window, "confirm");
    const row = statusRow("Test mode");
    expect(within(row).getByText(/updated every time you save/)).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Turn on" }));
    expect(await within(row).findByRole("link")).toHaveAttribute("href", "/config/test/f1.json");
    expect(on).toBe(true);
    await userEvent.click(within(row).getByRole("button", { name: "Turn off" }));
    expect(await within(row).findByText("Off")).toBeInTheDocument();
    expect(on).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.url.endsWith("/test")).map((c) => c.method)).toEqual(["POST", "DELETE"]);
  });

  it("shows publishing errors", async () => {
    await openFile(initFile(), { "POST /api/init-files/f1/publish": () => json({ error: "ocean.json is already published by the init file “Other”" }, 409) });
    await userEvent.click(screen.getByRole("button", { name: "Publish to /config/ocean.json" }));
    expect(await screen.findByText(/already published by the init file “Other”/)).toBeInTheDocument();
  });
});

describe("InitFileEditor: fields", () => {
  /** Saves and returns the config that was sent. */
  async function savedConfig(calls: Call[]) {
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Saved version/);
    return calls.filter((c) => c.method === "PUT").at(-1)!.body as { config: Record<string, unknown> };
  }
  const HOME = { west: -10, south: 40, east: 10, north: 60 };
  const camera = (label: string) => screen.getByRole("group", { name: new RegExp(`^${label}`) });

  it("sets the map, base map, settings and other keys", async () => {
    const { calls } = await openFile(initFile(), { "PUT /api/init-files/f1": initFile({ version: 2 }) });
    await userEvent.selectOptions(field("Viewer mode"), "3dSmooth");
    await userEvent.selectOptions(field("Show splitter"), "Yes");
    fireEvent.change(field("Split position"), { target: { value: "0.3" } });
    await userEvent.type(field("Default base map"), "basemap-voyager");
    await userEvent.type(field("Enabled base maps"), "basemap-voyager{enter}  {enter}basemap-positron");
    fireEvent.change(field("Extra base maps"), { target: { value: '[{"item": "//my-base", "image": "x.png"}]' } });
    await userEvent.selectOptions(field("Use native resolution"), "No");
    fireEvent.change(field("Base maximum screen space error"), { target: { value: "1.5" } });
    await userEvent.selectOptions(field("Terrain split direction"), "Right (1)");
    await userEvent.type(field("CORS domains"), "example.org");
    fireEvent.change(field("Stories"), { target: { value: '[{"id": "s1"}]' } });
    fireEvent.change(field("Other keys"), { target: { value: '{"custom": true}' } });
    await userEvent.type(field("Previewed item id"), "sst");

    expect((await savedConfig(calls)).config).toEqual({
      homeCamera: HOME,
      viewerMode: "3dSmooth",
      showSplitter: true,
      splitPosition: 0.3,
      baseMaps: { defaultBaseMapId: "basemap-voyager", enabledBaseMaps: ["basemap-voyager", "basemap-positron"], items: [{ item: "//my-base", image: "x.png" }] },
      settings: { useNativeResolution: false, baseMaximumScreenSpaceError: 1.5, terrainSplitDirection: 1 },
      corsDomains: ["example.org"],
      stories: [{ id: "s1" }],
      custom: true,
      previewedItemId: "sst",
    });
  });

  it("drops emptied objects", async () => {
    const { calls } = await openFile(initFile({ config: { homeCamera: HOME, settings: { alwaysShowTimeline: true } } }), { "PUT /api/init-files/f1": initFile({ version: 2 }) });
    await userEvent.selectOptions(field("Always show timeline"), "Default");
    expect((await savedConfig(calls)).config).toEqual({ homeCamera: HOME });
  });

  it("rejects bad JSON and keys that have their own fields", async () => {
    await openFile();
    fireEvent.change(field("Stories"), { target: { value: "{" } });
    expect(screen.getByText(/^Stories: not valid JSON/)).toBeInTheDocument();
    fireEvent.change(field("Stories"), { target: { value: "{}" } });
    expect(screen.getByText("Stories: must be a JSON array")).toBeInTheDocument();
    fireEvent.change(field("Stories"), { target: { value: "" } });
    expect(screen.queryByText(/^Stories:/)).not.toBeInTheDocument();

    fireEvent.change(field("Other keys"), { target: { value: '{"viewerMode": "2d", "catalog": []}' } });
    expect(screen.getByText("Other keys: set viewerMode, catalog with their own fields")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("checks the split position and camera boxes", async () => {
    await openFile(initFile({ config: { homeCamera: { west: 0, south: 10, east: 1, north: 5 }, splitPosition: 2 } }));
    expect(screen.getByText("Home camera: south must be less than north.")).toBeInTheDocument();
    expect(screen.getByText("Split position must be between 0 and 1.")).toBeInTheDocument();
  });

  it("edits a camera box by its sides, or from the map", async () => {
    const { calls } = await openFile(initFile(), { "PUT /api/init-files/f1": initFile({ version: 2 }) });
    const home = camera("Home camera");
    const west = within(home).getByLabelText("west");
    fireEvent.change(west, { target: { value: "-20" } });
    expect((await savedConfig(calls)).config.homeCamera).toEqual({ ...HOME, west: -20 });

    await userEvent.click(screen.getByRole("button", { name: "Use map view for Initial camera" }));
    expect(within(camera("Initial camera")).getByLabelText("Initial camera type")).toHaveValue("rect");
    expect((await savedConfig(calls)).config.initialCamera).toEqual({ west: 1, south: 2, east: 3, north: 4 });
  });

  it("sets the initial camera to focus on the workbench, JSON, or nothing", async () => {
    const { calls } = await openFile(initFile(), { "PUT /api/init-files/f1": initFile({ version: 2 }) });
    const initial = camera("Initial camera");
    const type = within(initial).getByLabelText("Initial camera type");
    expect(type).toHaveValue("unset");

    await userEvent.selectOptions(type, "focus");
    expect((await savedConfig(calls)).config.initialCamera).toEqual({ focusWorkbenchItems: true });

    await userEvent.selectOptions(type, "json");
    fireEvent.change(within(initial).getByRole("textbox"), { target: { value: '{"lookAt": {"targetLongitude": 1}}' } });
    expect((await savedConfig(calls)).config.initialCamera).toEqual({ lookAt: { targetLongitude: 1 } });

    await userEvent.selectOptions(type, "unset");
    expect((await savedConfig(calls)).config).not.toHaveProperty("initialCamera");
  });

  it("shows a JSON camera as JSON", async () => {
    await openFile(initFile({ config: { homeCamera: { position: { x: 1 } } } }));
    expect(within(camera("Home camera")).getByLabelText("Home camera type")).toHaveValue("json");
    expect(within(camera("Home camera")).getByRole("textbox")).toHaveValue(JSON.stringify({ position: { x: 1 } }, null, 2));
  });
});
