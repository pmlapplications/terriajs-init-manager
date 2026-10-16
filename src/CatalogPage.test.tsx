import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CatalogPage } from "./CatalogPage";
import { json, mockFetch, type Call } from "./test/fetch";
import { memberEntry } from "./test/fixtures";

const params = (call: Call) => Object.fromEntries(new URL(call.url, "http://x").searchParams);

function setup(total = 2, items = [memberEntry(), memberEntry({ id: "g1", type: "group", kind: "group", name: "Ocean", terriaId: null, url: null, memberCount: 1 })]) {
  const { calls } = mockFetch({ "GET /api/members": (call: Call) => ({ items, total, page: Number(params(call).page ?? 1), pageSize: Number(params(call).pageSize ?? 25) }) });
  const onOpen = vi.fn();
  const onDuplicate = vi.fn();
  render(<CatalogPage onOpen={onOpen} onDuplicate={onDuplicate} />);
  return { calls, onOpen, onDuplicate, last: () => params(calls[calls.length - 1]) };
}

describe("CatalogPage", () => {
  it("lists items and groups, newest first", async () => {
    const { last } = setup();
    expect(await screen.findByText("Sea surface temperature")).toBeInTheDocument();
    expect(screen.getByText("1 member")).toBeInTheDocument();
    expect(last()).toEqual({ sort: "updatedAt", dir: "desc", page: "1", pageSize: "25" });
  });

  it("opens and duplicates rows", async () => {
    const { onOpen, onDuplicate } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Sea surface temperature" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }));
    await userEvent.click(screen.getByRole("button", { name: "Duplicate Ocean" }));
    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }));
  });

  it("searches after a pause in typing", async () => {
    const { last } = setup();
    await screen.findByText("Ocean");
    await userEvent.type(screen.getByLabelText("Search catalog items and groups"), "sst");
    await waitFor(() => expect(last().q).toBe("sst"));
  });

  it("filters by kind, type and published state, and clears filters", async () => {
    const { last } = setup();
    await screen.findByText("Ocean");
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "item");
    await waitFor(() => expect(last().kind).toBe("item"));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "wms");
    await waitFor(() => expect(last().type).toBe("wms"));
    await userEvent.selectOptions(screen.getByLabelText("Published"), "false");
    await waitFor(() => expect(last().published).toBe("false"));
    // Switching to groups drops the item type filter.
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "group");
    await waitFor(() => expect(last()).toMatchObject({ kind: "group" }));
    expect(last().type).toBeUndefined();
    await userEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    await waitFor(() => expect(last()).toEqual({ sort: "updatedAt", dir: "desc", page: "1", pageSize: "25" }));
  });

  it("sorts by a column, then reverses it", async () => {
    const { last } = setup();
    await screen.findByText("Ocean");
    await userEvent.click(screen.getByRole("button", { name: /^Name/ }));
    await waitFor(() => expect(last()).toMatchObject({ sort: "name", dir: "asc" }));
    expect(screen.getByRole("columnheader", { name: /^Name/ })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByRole("button", { name: /^Name/ }));
    await waitFor(() => expect(last()).toMatchObject({ sort: "name", dir: "desc" }));
    await userEvent.click(screen.getByRole("button", { name: /^Version/ }));
    await waitFor(() => expect(last()).toMatchObject({ sort: "version", dir: "desc" }));
  });

  it("pages through results", async () => {
    const { last } = setup(60);
    await screen.findByText("Ocean");
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(last().page).toBe("2"));
    await userEvent.click(screen.getByRole("button", { name: "Last page" }));
    await waitFor(() => expect(last().page).toBe("3"));
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "First page" }));
    await waitFor(() => expect(last().page).toBe("1"));
  });

  it("remembers the table state for the tab", async () => {
    const { last } = setup();
    await screen.findByText("Ocean");
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "group");
    await waitFor(() => expect(last().kind).toBe("group"));
    expect(JSON.parse(sessionStorage.getItem("tlm.catalog.table")!)).toMatchObject({ kind: "group" });
  });

  it("shows errors", async () => {
    mockFetch({ "GET /api/members": () => json({ error: "Can't sort by \"x\"" }, 400) });
    render(<CatalogPage onOpen={() => {}} onDuplicate={() => {}} />);
    expect(await screen.findByText('Can\'t sort by "x"')).toBeInTheDocument();
  });

  it("filters to orphaned members", async () => {
    const { last } = setup();
    await screen.findByText("Ocean");
    await userEvent.click(screen.getByRole("checkbox", { name: /Orphaned only/ }));
    await waitFor(() => expect(last().orphaned).toBe("true"));
    await userEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    await waitFor(() => expect(last().orphaned).toBeUndefined());
    expect(screen.getByRole("checkbox", { name: /Orphaned only/ })).not.toBeChecked();
  });

  it("deletes a member after confirming, and reloads the page", async () => {
    const { calls } = mockFetch({
      "GET /api/members": { items: [memberEntry({ id: "g1", type: "group", kind: "group", name: "Ocean", memberCount: 3 })], total: 1, page: 1, pageSize: 25 },
      "DELETE /api/groups/group/g1": () => json(null, 204),
    });
    localStorage.setItem("tlm.group.record", JSON.stringify({ id: "g1", version: 2, name: "Ocean" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<CatalogPage onOpen={() => {}} onDuplicate={() => {}} />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete Ocean" }));
    expect(confirm).toHaveBeenLastCalledWith("Delete the group “Ocean”? It is also removed from any groups it is in. Its 3 members are kept.");
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Delete Ocean" }));
    expect(await screen.findByText("Deleted “Ocean”")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/groups/group/g1"]);
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/api/members"))).toHaveLength(2));
    // The editor's draft of it can no longer be saved over it.
    expect(localStorage.getItem("tlm.group.record")).toBeNull();
  });

  it("shows why a delete failed", async () => {
    mockFetch({
      "GET /api/members": { items: [memberEntry()], total: 1, page: 1, pageSize: 25 },
      "DELETE /api/items/wms/m1": () => json({ error: "“Sea surface temperature” is used by the init file “Atlas”" }, 409),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CatalogPage onOpen={() => {}} onDuplicate={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete Sea surface temperature" }));
    expect(await screen.findByText(/is used by the init file “Atlas”/)).toBeInTheDocument();
  });

  it("disables deleting members that init files use", async () => {
    setup(2, [memberEntry({ initFileCount: 2 }), memberEntry({ id: "m2", name: "Unused" })]);
    const used = await screen.findByRole("button", { name: "Delete Sea surface temperature" });
    expect(used).toBeDisabled();
    expect(used).toHaveAttribute("title", "Used by 2 init files; remove it from them to delete it");
    expect(screen.getByRole("button", { name: "Delete Unused" })).toBeEnabled();
  });

  it("shows the description under the name", async () => {
    setup(1, [memberEntry({ description: "Daily SST" })]);
    const row = (await screen.findByText("Sea surface temperature")).closest("tr")!;
    expect(within(row).getByText("Daily SST")).toBeInTheDocument();
  });
});
