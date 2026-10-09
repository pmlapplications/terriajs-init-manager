import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemberList, MemberSearch, MembersPanel } from "./MembersPanel";
import { json, mockFetch, type Call } from "./test/fetch";
import { memberEntry, memberRef } from "./test/fixtures";

const a = memberRef({ id: "a", name: "Alpha" });
const b = memberRef({ id: "b", name: "Beta" });
const c = memberRef({ id: "c", name: "Gamma", type: "group", kind: "group" });
const params = (call: Call) => Object.fromEntries(new URL(call.url, "http://x").searchParams);

describe("MemberList", () => {
  it("shows the empty message", () => {
    render(<MemberList members={[]} onChange={() => {}} empty="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("moves and removes members", async () => {
    const onChange = vi.fn();
    render(<MemberList members={[a, b, c]} onChange={onChange} empty="" />);
    expect(screen.getByRole("button", { name: "Move Alpha up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Gamma down" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Alpha down" }));
    expect(onChange).toHaveBeenLastCalledWith([b, a, c]);
    await userEvent.click(screen.getByRole("button", { name: "Move Gamma up" }));
    expect(onChange).toHaveBeenLastCalledWith([a, c, b]);
    await userEvent.click(screen.getByRole("button", { name: "Remove Beta" }));
    expect(onChange).toHaveBeenLastCalledWith([a, c]);
  });

  it("shows a badge per member", () => {
    render(<MemberList members={[a]} onChange={() => {}} empty="" badge={(m) => <span>badge for {m.name}</span>} />);
    expect(screen.getByText("badge for Alpha")).toBeInTheDocument();
  });
});

describe("MemberSearch", () => {
  const entries = [memberEntry({ id: "a", name: "Alpha" }), memberEntry({ id: "b", name: "Beta" }), memberEntry({ id: "x", name: "Self" })];

  function setup(props: Partial<Parameters<typeof MemberSearch>[0]> = {}, total = 3) {
    const { calls } = mockFetch({ "GET /api/members": { items: entries, total, page: 1, pageSize: 15 } });
    const onAdd = vi.fn();
    render(<MemberSearch query={{ kind: "item" }} typeChoices={["wms", "csv"]} added={[]} onAdd={onAdd} label="Search members" empty="None saved" {...props} />);
    return { calls, onAdd, last: () => params(calls[calls.length - 1]) };
  }

  it("searches with the fixed filters, by name", async () => {
    const { last } = setup({ query: { memberOf: "wms-group", within: ["g1", "g2"] } });
    await screen.findByText("Alpha");
    expect(last()).toEqual({ memberOf: "wms-group", within: "g1,g2", sort: "name", dir: "asc", page: "1", pageSize: "15" });
  });

  it("adds one or all addable members", async () => {
    const { onAdd } = setup({ added: [memberRef({ id: "a" })], exclude: { id: "x", label: "This group", reason: "A group can't contain itself" } });
    await screen.findByText("Alpha");
    expect(screen.getByRole("button", { name: "Added" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "This group" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenLastCalledWith([expect.objectContaining({ id: "b", name: "Beta", kind: "item" })]);
    expect(screen.queryByRole("button", { name: /Add all/ })).not.toBeInTheDocument();
  });

  it("offers Add all when several can be added", async () => {
    const { onAdd } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Add all 3 shown" }));
    expect(onAdd.mock.calls[0][0].map((m: { id: string }) => m.id)).toEqual(["a", "b", "x"]);
  });

  it("filters by text and type, and pages", async () => {
    const { last } = setup({}, 40);
    await screen.findByText("Alpha");
    await userEvent.type(screen.getByLabelText("Search members"), "alp");
    await waitFor(() => expect(last().q).toBe("alp"));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "csv");
    await waitFor(() => expect(last().type).toBe("csv"));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(last().page).toBe("2"));
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(last().page).toBe("1"));
  });

  it("hides the type filter for a single type", async () => {
    setup({ typeChoices: ["wms"] });
    await screen.findByText("Alpha");
    expect(screen.queryByLabelText("Type")).not.toBeInTheDocument();
  });

  it("shows empty and error states", async () => {
    mockFetch({ "GET /api/members": { items: [], total: 0, page: 1, pageSize: 15 } });
    const { unmount } = render(<MemberSearch query={{}} typeChoices={[]} added={[]} onAdd={() => {}} label="s" empty="None saved" />);
    expect(await screen.findByText("None saved")).toBeInTheDocument();
    unmount();
    mockFetch({ "GET /api/members": () => json({ error: "Broken" }, 500) });
    render(<MemberSearch query={{}} typeChoices={[]} added={[]} onAdd={() => {}} label="s" empty="None saved" />);
    expect(await screen.findByText("Broken")).toBeInTheDocument();
  });
});

describe("MembersPanel", () => {
  it("limits the search to the types the group may contain", async () => {
    const { calls } = mockFetch({
      "GET /api/groups/wms-group/member-types": ["wms", "wms-group"],
      "GET /api/members": { items: [memberEntry({ id: "self", name: "This one", type: "wms-group", kind: "group" })], total: 1, page: 1, pageSize: 15 },
    });
    render(<MembersPanel groupType="wms-group" members={[]} onChange={() => {}} groupId="self" />);
    expect(await screen.findByText("This one")).toBeInTheDocument();
    expect(params(calls.find((c) => c.url.startsWith("/api/members"))!).memberOf).toBe("wms-group");
    expect(screen.getByRole("button", { name: "This group" })).toBeDisabled();
  });

  it("shows an error loading member types", async () => {
    mockFetch({ "GET /api/groups/group/member-types": () => json({ error: "Nope" }, 500), "GET /api/members": { items: [], total: 0, page: 1, pageSize: 15 } });
    render(<MembersPanel groupType="group" members={[]} onChange={() => {}} groupId={null} />);
    expect(await screen.findByText("Nope")).toBeInTheDocument();
  });
});
