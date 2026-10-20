import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CatalogPage } from "./CatalogPage";
import { DialogHost } from "./DialogHost";
import { openDialog } from "./test/dialogs";
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

  it("links to Create New", async () => {
    setup();
    expect(await screen.findByRole("link", { name: "Create New" })).toHaveAttribute("href", "#/new");
    expect(screen.queryByRole("link", { name: /Continue Editing/ })).not.toBeInTheDocument();
  });

  it("links back to a draft in the editor", async () => {
    mockFetch({ "GET /api/members": { items: [], total: 0, page: 1, pageSize: 25 } });
    render(<CatalogPage draft={{ type: "wms", href: "#/item/wms" }} onOpen={() => {}} onDuplicate={() => {}} />);
    expect(await screen.findByRole("link", { name: "Continue Editing WebMapService form" })).toHaveAttribute("href", "#/item/wms");
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
    render(
      <>
        <CatalogPage onOpen={() => {}} onDuplicate={() => {}} />
        <DialogHost />
      </>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Delete Ocean" }));
    const dialog = await openDialog();
    expect(dialog.getByText("Delete the group “Ocean”? It is also removed from any groups it is in. Its 3 members are kept.")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Delete Ocean" }));
    await userEvent.click((await openDialog()).getByRole("button", { name: "Delete" }));
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
    render(
      <>
        <CatalogPage onOpen={() => {}} onDuplicate={() => {}} />
        <DialogHost />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Sea surface temperature" }));
    await userEvent.click((await openDialog()).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/is used by the init file “Atlas”/)).toBeInTheDocument();
  });

  it("selects rows one by one or all at once", async () => {
    setup(3, [memberEntry({ initFileCount: 2 }), memberEntry({ id: "m2", name: "Unused" }), memberEntry({ id: "m3", name: "Spare" })]);
    const all = await screen.findByRole("checkbox", { name: "Select all rows on this page" });

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Unused" }));
    expect(all).not.toBeChecked();
    expect((all as HTMLInputElement).indeterminate).toBe(true);
    expect(screen.getByRole("region", { name: "Selected rows" })).toHaveTextContent("1 selected");

    await userEvent.click(all);
    expect(all).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Sea surface temperature" })).toBeChecked();
    expect(screen.getByRole("region", { name: "Selected rows" })).toHaveTextContent("3 selected");
    // One of them is used by init files, so only the other two can be deleted.
    expect(screen.getByRole("button", { name: "Delete 2 deletable" })).toBeEnabled();

    await userEvent.click(all);
    expect(screen.queryByRole("region", { name: "Selected rows" })).not.toBeInTheDocument();
  });

  it("can't delete a selection that init files all use", async () => {
    setup(1, [memberEntry({ initFileCount: 1 })]);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Sea surface temperature" }));
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeDisabled();
  });

  it("opens the bulk editor for selected rows of one type", async () => {
    setup(3, [memberEntry(), memberEntry({ id: "m2", name: "Second" }), memberEntry({ id: "g1", type: "group", kind: "group", name: "Ocean", memberCount: 0 })]);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Sea surface temperature" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Ocean" }));
    const edit = screen.getByRole("button", { name: "Edit selected" });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute("title", "Select rows of one type to edit them together");

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Ocean" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Second" }));
    await userEvent.click(edit);
    expect(location.hash).toBe("#/bulk/wms/m1,m2");
  });

  it("clears the selection when the table changes", async () => {
    setup();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Ocean" }));
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "group");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Ocean" })).not.toBeChecked());
  });

  it("deletes the selected rows after confirming, reporting any that fail", async () => {
    const { calls } = mockFetch({
      "GET /api/members": {
        items: [memberEntry(), memberEntry({ id: "m2", name: "Locked" }), memberEntry({ id: "g1", type: "group", kind: "group", name: "Ocean", memberCount: 1 })],
        total: 3,
        page: 1,
        pageSize: 25,
      },
      "DELETE /api/items/wms/m1": () => json(null, 204),
      "DELETE /api/items/wms/m2": () => json({ error: "used by the init file “Atlas”" }, 409),
      "DELETE /api/groups/group/g1": () => json(null, 204),
    });
    render(
      <>
        <CatalogPage onOpen={() => {}} onDuplicate={() => {}} />
        <DialogHost />
      </>,
    );
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select all rows on this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await openDialog();
    expect(screen.getByRole("dialog", { name: "Delete 2 items and 1 group?" })).toBeInTheDocument();
    expect(dialog.getByText(/“Sea surface temperature”, “Locked”, “Ocean”/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Deleted 1 item and 1 group")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("“Locked”: used by the init file “Atlas”");
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(3);
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/api/members"))).toHaveLength(2));
    expect(screen.queryByRole("region", { name: "Selected rows" })).not.toBeInTheDocument();
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
