import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BulkEditPage } from "./BulkEditPage";
import { DialogHost } from "./DialogHost";
import { fieldId } from "./form/paths";
import { openDialog } from "./test/dialogs";
import { json, mockFetch } from "./test/fetch";

const config = (id: string, name: string, item: Record<string, unknown>) => ({
  id,
  type: "wms",
  terriaId: null,
  name,
  url: null,
  isPublished: true,
  version: 1,
  updatedAt: "",
  item: { name, ...item },
});

const A = config("m1", "Alpha", { id: "alpha", url: "https://a.example/wms", opacity: 0.4 });
const B = config("m2", "Beta", { shareKeys: ["old-beta"], layers: "sst" });

async function open(routes: Record<string, unknown> = {}) {
  const mock = mockFetch({ "GET /api/items/wms/m1": A, "GET /api/items/wms/m2": B, ...routes });
  render(
    <>
      <BulkEditPage type="wms" ids={["m1", "m2"]} />
      <DialogHost />
    </>,
  );
  await screen.findByRole("heading", { name: "Edit 2 WebMapService items" });
  return mock;
}

const input = (name: string) => document.getElementById(fieldId([name])) as HTMLInputElement | null;

describe("BulkEditPage", () => {
  it("starts empty, without the traits that must be unique", async () => {
    await open();
    expect(screen.getByText("Alpha, Beta")).toBeInTheDocument();
    expect(input("name")!.value).toBe("");
    expect(input("url")!.value).toBe("");
    expect(input("id")).toBeNull();
    expect(screen.queryByText("shareKeys", { selector: "code" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to 2 WebMapService items" })).toBeDisabled();
    expect(screen.getByText("No traits set yet.")).toBeInTheDocument();
  });

  it("shows each item's current value for a trait", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Current values of url: set on 1 of 2" }));
    const dialog = within(screen.getByRole("dialog", { name: "Current values of url" }));
    expect(dialog.getByRole("rowheader", { name: "Alpha" }).closest("tr")).toHaveTextContent("https://a.example/wms");
    expect(dialog.getByRole("rowheader", { name: "Beta" }).closest("tr")).toHaveTextContent("not set");
    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current values of name: set on 2 of 2" })).toBeInTheDocument();
    expect(screen.getAllByText("not set on any", { selector: ".bulk-note" }).length).toBeGreaterThan(0);
  });

  it("applies only the traits filled in, then reloads the items", async () => {
    const updated = { ...A, version: 2, item: { ...A.item, url: "https://shared.example/wms" } };
    let gets = 0;
    const { calls } = await open({
      "POST /api/items/wms/bulk-update": () => json([], 200),
      "GET /api/items/wms/m1": () => (++gets > 1 ? updated : A),
    });
    await userEvent.type(input("url")!, "https://shared.example/wms");
    expect(screen.getByText(/"url": "https:\/\/shared.example\/wms"/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply to 2 WebMapService items" }));
    const dialog = await openDialog();
    expect(dialog.getByText(/Set url on 2 WebMapService items\?/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Updated 2 WebMapService items")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ ids: ["m1", "m2"], set: { url: "https://shared.example/wms" } });
    await waitFor(() => expect(input("url")!.value).toBe(""));
    expect(gets).toBe(2);
  });

  it("shows an error from the server, keeping the changes", async () => {
    await open({ "POST /api/items/wms/bulk-update": () => json({ error: '“Beta”: "name" is required' }, 400) });
    await userEvent.type(input("description")!, "Shared");
    await userEvent.click(screen.getByRole("button", { name: "Apply to 2 WebMapService items" }));
    await userEvent.click((await openDialog()).getByRole("button", { name: "Apply" }));
    expect(await screen.findByText('“Beta”: "name" is required')).toBeInTheDocument();
    expect(input("description")!.value).toBe("Shared");
  });

  it("shows a load error", async () => {
    mockFetch({ "GET /api/items/wms/m1": A, "GET /api/items/wms/m2": () => json({ error: "No wms config with id m2" }, 404) });
    render(<BulkEditPage type="wms" ids={["m1", "m2"]} />);
    expect(await screen.findByText("No wms config with id m2")).toBeInTheDocument();
  });
});
