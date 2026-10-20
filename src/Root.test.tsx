import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UNAUTHORIZED_EVENT } from "./api";
import { loadDraft, saveDraft, saveSnapshot } from "./drafts";
import Root from "./Root";
import { json, mockFetch } from "./test/fetch";
import { dialogOpen, openDialog } from "./test/dialogs";
import { memberEntry, user } from "./test/fixtures";

vi.mock("./CameraMap", () => ({ CameraMap: () => null }));

const EMPTY_PAGE = { items: [], total: 0, page: 1, pageSize: 25 };

function loggedIn(routes: Record<string, unknown> = {}) {
  return mockFetch({ "GET /api/auth/me": user(), "GET /api/members": EMPTY_PAGE, ...routes });
}

const go = (hash: string) => act(() => {
  location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
});

describe("Root", () => {
  it("shows the login form without a session, then the app after logging in", async () => {
    mockFetch({ "GET /api/auth/me": () => json({ error: "Not logged in" }, 401), "POST /api/auth/login": user(), "GET /api/members": EMPTY_PAGE });
    render(<Root />);
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows the navigation, user and version", async () => {
    loggedIn();
    render(<Root />);
    const nav = await screen.findByRole("navigation", { name: "Pages" });
    expect(nav).toHaveTextContent("Catalogue Groups/Items");
    expect(nav).toHaveTextContent("Init files");
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Catalogue Groups/Items" })).toHaveAttribute("aria-current", "page");
  });

  it("reports an unreachable server", async () => {
    mockFetch({ "GET /api/auth/me": () => json({ error: "Bad gateway" }, 502) });
    render(<Root />);
    expect(await screen.findByText("Could not reach the server: Bad gateway")).toBeInTheDocument();
  });

  it("returns to the login form on logout and when the session expires", async () => {
    loggedIn({ "POST /api/auth/logout": () => json(null, 204) });
    const { unmount } = render(<Root />);
    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("button", { name: "Log in" })).toBeInTheDocument();
    unmount();

    loggedIn();
    render(<Root />);
    await screen.findByText("Ada Lovelace");
    act(() => {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });
    expect(await screen.findByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it.each([
    ["#/users", { "GET /api/users": [user()] }, () => screen.getByRole("heading", { name: "Add a user" })],
    ["#/init-files", { "GET /api/init-files": [] }, () => screen.getByRole("heading", { name: "Init files" })],
    ["#/new", {}, () => screen.getByLabelText("Filter types")],
  ])("routes %s", async (hash, routes, find) => {
    loggedIn(routes);
    location.hash = hash;
    render(<Root />);
    await waitFor(() => expect(find()).toBeInTheDocument());
  });

  it.each([
    ["#/docs", "/docs/"],
    ["#/docs/user-guide/init-files.html", "/docs/user-guide/init-files.html"],
  ])("routes %s to the documentation", async (hash, src) => {
    loggedIn();
    location.hash = hash;
    render(<Root />);
    await waitFor(() => expect(screen.getByTitle("Documentation")).toHaveAttribute("src", src));
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "page");
  });

  it("has a Docs menu item", async () => {
    loggedIn();
    render(<Root />);
    expect(await screen.findByRole("link", { name: "Docs" })).toHaveAttribute("href", "#/docs");
  });

  it("routes #/init-files/new to an empty init file editor", async () => {
    loggedIn();
    location.hash = "#/init-files/new";
    render(<Root />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "New init file" })).toBeInTheDocument());
  });

  it("offers to continue the last edited form when it has a draft", async () => {
    loggedIn();
    localStorage.setItem("tlm.lastType", JSON.stringify("csv"));
    saveDraft("csv", { name: "Stations" });
    render(<Root />);
    expect(await screen.findByRole("link", { name: "Continue Editing Csv form" })).toHaveAttribute("href", "#/item/csv");
  });

  it("opens the editor for a type from Create New, clearing its draft after confirming", async () => {
    loggedIn({ "GET /api/groups/group/member-types": ["wms"] });
    saveDraft("wms", { name: "Old" });
    location.hash = "#/new";
    render(<Root />);
    await userEvent.click(await screen.findByTitle("WebMapServiceCatalogItem"));
    await userEvent.click((await openDialog()).getByRole("button", { name: "Start new" }));
    await waitFor(() => expect(location.hash).toBe("#/item/wms"));
    go("#/item/wms");
    expect(await screen.findByText(/"type": "wms"/, { selector: "code" })).toBeInTheDocument();
    expect(loadDraft("wms")).toEqual({});
  });

  it("opens a catalog row in its editor", async () => {
    loggedIn({
      "GET /api/members": { items: [memberEntry()], total: 1, page: 1, pageSize: 25 },
      "GET /api/items/wms/m1": { id: "m1", type: "wms", name: "Sea surface temperature", version: 2, item: { name: "Sea surface temperature", opacity: 0.4 } },
    });
    render(<Root />);
    await userEvent.click(await screen.findByRole("button", { name: "Sea surface temperature" }));
    await waitFor(() => expect(location.hash).toBe("#/item/wms"));
    go("#/item/wms");
    await waitFor(() => expect(loadDraft("wms")).toEqual({ name: "Sea surface temperature", opacity: 0.4 }));
  });

  it("opens another row straight away when the form has no unsaved changes", async () => {
    loggedIn({
      "GET /api/members": { items: [memberEntry()], total: 1, page: 1, pageSize: 25 },
      "GET /api/items/wms/m1": { id: "m1", type: "wms", name: "Sea surface temperature", version: 2, item: { name: "Sea surface temperature" } },
    });
    saveDraft("wms", { name: "Saved layer", opacity: 0.3 });
    saveSnapshot("wms", { opacity: 0.3, name: "Saved layer" });
    render(<Root />);
    await userEvent.click(await screen.findByRole("button", { name: "Sea surface temperature" }));
    await waitFor(() => expect(location.hash).toBe("#/item/wms"));
    expect(dialogOpen()).toBe(false);
    expect(loadDraft("wms")).toEqual({ name: "Sea surface temperature" });
  });

  it("asks before replacing a form with unsaved changes", async () => {
    const { calls } = loggedIn({ "GET /api/members": { items: [memberEntry()], total: 1, page: 1, pageSize: 25 } });
    saveDraft("wms", { name: "Saved layer", opacity: 0.9 });
    saveSnapshot("wms", { name: "Saved layer", opacity: 0.3 });
    render(<Root />);
    await userEvent.click(await screen.findByRole("button", { name: "Sea surface temperature" }));
    const dialog = await openDialog();
    expect(dialog.getByText(/has unsaved changes/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.url === "/api/items/wms/m1")).toBe(false);
    expect(loadDraft("wms")).toEqual({ name: "Saved layer", opacity: 0.9 });
  });

  it("duplicates a catalog row without its ids", async () => {
    loggedIn({
      "GET /api/members": { items: [memberEntry()], total: 1, page: 1, pageSize: 25 },
      "GET /api/items/wms/m1": { id: "m1", type: "wms", name: "SST", version: 2, item: { id: "sst", name: "SST", shareKeys: ["x"], layers: "a" } },
    });
    render(<Root />);
    await userEvent.click(await screen.findByRole("button", { name: "Duplicate Sea surface temperature" }));
    await waitFor(() => expect(loadDraft("wms")).toEqual({ name: "Copy of SST", layers: "a" }));
  });
});
