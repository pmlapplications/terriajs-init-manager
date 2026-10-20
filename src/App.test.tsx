import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import App from "./App";
import { DialogHost } from "./DialogHost";
import { loadDraft, loadRecord, saveDraft } from "./drafts";
import { fieldId } from "./form/paths";
import { loadModel, type CatalogModel } from "./terria/catalog-ui";
import { json, mockFetch } from "./test/fetch";
import { openDialog } from "./test/dialogs";
import { memberEntry } from "./test/fixtures";

let wms: CatalogModel;
let group: CatalogModel;
beforeAll(async () => {
  [wms, group] = await Promise.all([loadModel("wms"), loadModel("group")]);
});

const input = (name: string) => document.getElementById(fieldId([name])) as HTMLInputElement;
const preview = () => JSON.parse(document.querySelector(".preview pre")!.textContent!);
const status = () => screen.getByRole("button", { name: /errors|Valid/ });

describe("item editor", () => {
  it("describes the type and starts with the required fields missing", () => {
    render(<App model={wms} />);
    expect(screen.getByText("WebMapServiceCatalogItem", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute("href", wms.source);
    expect(status()).toHaveTextContent("2 errors · 1 warnings");
    expect(preview()).toEqual({ type: "wms" });
    expect(screen.getByRole("button", { name: "Save new" })).toBeDisabled();
  });

  it("builds the JSON as fields are filled, and keeps a draft", async () => {
    render(<App model={wms} />);
    await userEvent.type(input("name"), "SST");
    await userEvent.type(input("url"), "https://example.com/wms");
    expect(preview()).toEqual({ type: "wms", name: "SST", url: "https://example.com/wms" });
    expect(status()).toHaveTextContent("0 errors · 1 warnings");
    expect(loadDraft("wms")).toEqual({ name: "SST", url: "https://example.com/wms" });
  });

  it("restores the draft for its type", () => {
    saveDraft("wms", { name: "Restored", opacity: 0.5 });
    render(<App model={wms} />);
    expect(input("name")).toHaveValue("Restored");
    expect(preview()).toEqual({ type: "wms", name: "Restored", opacity: 0.5 });
  });

  it("lists issues and jumps to a field", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<App model={wms} />);
    await userEvent.click(status());
    const panel = document.querySelector(".issue-panel") as HTMLElement;
    expect(within(panel).getByText("name")).toBeInTheDocument();
    await userEvent.click(within(panel).getByText("url"));
    await waitFor(() => expect(scroll.mock.contexts).toContain(input("url")));
  });

  it("saves new, then updates with the returned version", async () => {
    saveDraft("wms", { name: "SST", url: "https://example.com/wms" });
    const config = (version: number) => ({ id: "c1", type: "wms", terriaId: null, name: "SST", url: "https://example.com/wms", isPublished: true, version, updatedAt: "", item: { name: "SST", url: "https://example.com/wms" } });
    const { calls } = mockFetch({ "POST /api/items/wms": config(1), "PUT /api/items/wms/c1": config(2) });
    render(<App model={wms} />);
    await userEvent.click(screen.getByRole("button", { name: "Save new" }));
    expect(await screen.findByText("Saved version 1")).toBeInTheDocument();
    expect(calls[0].body).toEqual({ name: "SST", url: "https://example.com/wms" });
    expect(loadRecord("wms")).toEqual({ id: "c1", version: 1, name: "SST" });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved version 2")).toBeInTheDocument();
    expect(calls[1]).toMatchObject({ method: "PUT", body: { version: 1, item: { name: "SST", url: "https://example.com/wms" } } });
  });

  it("shows save errors", async () => {
    saveDraft("wms", { name: "SST", url: "https://example.com/wms" });
    mockFetch({ "POST /api/items/wms": () => json({ error: "Already in use: terria_id" }, 409) });
    render(<App model={wms} />);
    await userEvent.click(screen.getByRole("button", { name: "Save new" }));
    expect(await screen.findByText("Already in use: terria_id")).toBeInTheDocument();
  });

  it("imports JSON, dropping type and inline members", async () => {
    render(<App model={wms} />);
    await userEvent.click(screen.getByRole("button", { name: "Import JSON" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: '{"type":"wms","name":"Imported","layers":"a"}' } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(preview()).toEqual({ type: "wms", name: "Imported", layers: "a" });
  });

  it.each([
    ["[1]", "Expected a single catalog item object"],
    ['{"type":"csv"}', 'This editor only handles "wms" items; got type "csv"'],
    ["{oops", "in JSON at position 1"],
  ])("rejects imported %s", async (text, message) => {
    render(<App model={wms} />);
    await userEvent.click(screen.getByRole("button", { name: "Import JSON" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: text } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    expect(within(dialog).getByText(new RegExp(message.replace(/[()[\]{}"]/g, "\\$&")))).toBeInTheDocument();
  });

  it("opens a saved config", async () => {
    mockFetch({
      "GET /api/items/wms": [{ id: "c1", type: "wms", terriaId: null, name: "Saved layer", url: null, isPublished: true, version: 3, updatedAt: "2026-01-01T00:00:00Z" }],
      "GET /api/items/wms/c1": { id: "c1", type: "wms", name: "Saved layer", version: 3, item: { name: "Saved layer", opacity: 0.3 } },
    });
    render(<App model={wms} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: /Saved layer/ }));
    await waitFor(() => expect(preview()).toEqual({ type: "wms", name: "Saved layer", opacity: 0.3 }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("starts a new item after confirming", async () => {
    saveDraft("wms", { name: "Old" });
    render(
      <>
        <App model={wms} />
        <DialogHost />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "New" }));
    await userEvent.click((await openDialog()).getByRole("button", { name: "Clear form" }));
    expect(preview()).toEqual({ type: "wms" });
  });

  it("filters traits by search text", async () => {
    render(<App model={wms} />);
    await userEvent.type(screen.getByPlaceholderText(/Search \d+ traits/), "no such trait anywhere");
    expect(screen.getByText("No traits match “no such trait anywhere”.")).toBeInTheDocument();
  });
});

describe("group editor", () => {
  it("edits members and sends them as ids", async () => {
    saveDraft("group", { name: "Folder" });
    const { calls } = mockFetch({
      "GET /api/groups/group/member-types": ["wms"],
      "GET /api/members": { items: [memberEntry({ id: "m1", name: "SST" })], total: 1, page: 1, pageSize: 15 },
      "POST /api/groups/group": { id: "g1", type: "group", name: "Folder", version: 1, item: { name: "Folder" }, members: [] },
    });
    render(<App model={group} />);
    await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Members/ }));
    expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    // The preview lists members by Terria id; the API gets database ids.
    expect(preview()).toEqual({ type: "group", name: "Folder", members: ["sst"] });
    await userEvent.click(screen.getByRole("button", { name: "Save new" }));
    await screen.findByText("Saved version 1");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ item: { name: "Folder" }, members: ["m1"] });
  });
});
