import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DialogHost } from "./DialogHost";
import { InitFilesPage } from "./InitFilesPage";
import { openDialog } from "./test/dialogs";
import { json, mockFetch } from "./test/fetch";
import { initFile, output } from "./test/fixtures";

describe("InitFilesPage", () => {
  it("lists init files with their publish and test status", async () => {
    mockFetch({
      "GET /api/init-files": [
        initFile({ id: "f1", name: "Live", slug: "live", catalogCount: 2, version: 3, published: output({ path: "/config/live.json", version: 3 }), test: output({ path: "/config/test/f1.json" }) }),
        initFile({ id: "f2", name: "Stale", slug: "stale", version: 4, published: output({ path: "/config/stale.json", version: 2 }) }),
        initFile({ id: "f3", name: "Draft", slug: "draft", description: "Work in progress" }),
      ],
    });
    render(<InitFilesPage />);
    const [, live, stale, draft] = await screen.findAllByRole("row");

    expect(within(live).getByRole("link", { name: "Live" })).toHaveAttribute("href", "#/init-files/f1");
    expect(within(live).getByText("live.json")).toBeInTheDocument();
    expect(within(live).getByRole("link", { name: "Published" })).toHaveAttribute("href", "/config/live.json");
    expect(within(live).getByRole("link", { name: "On" })).toHaveAttribute("href", "/config/test/f1.json");
    expect(within(live).getByRole("link", { name: "Download Live" })).toHaveAttribute("href", "/api/init-files/f1/export?download");
    expect(within(live).getByRole("button", { name: "Delete Live" })).toBeDisabled();
    expect(within(draft).getByRole("button", { name: "Delete Draft" })).toBeEnabled();

    expect(within(stale).getByRole("link", { name: "Published (out of date)" })).toBeInTheDocument();
    expect(within(stale).getByText("Off")).toBeInTheDocument();

    expect(within(draft).getByText("Not published")).toBeInTheDocument();
    expect(within(draft).getByText("Work in progress")).toBeInTheDocument();
  });

  it("says when there are none", async () => {
    mockFetch({ "GET /api/init-files": [] });
    render(<InitFilesPage />);
    expect(await screen.findByText(/No init files yet/)).toBeInTheDocument();
  });

  it("shows errors", async () => {
    mockFetch({ "GET /api/init-files": () => json({ error: "Down" }, 500) });
    render(<InitFilesPage />);
    expect(await screen.findByText("Down")).toBeInTheDocument();
  });

  it("copies an init file and opens the copy", async () => {
    const { calls } = mockFetch({
      "GET /api/init-files": [initFile({ id: "f1", name: "Live" })],
      "POST /api/init-files/f1/copy": () => json(initFile({ id: "f9", name: "Copy of Live" }), 201),
    });
    render(<InitFilesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy Live" }));
    await waitFor(() => expect(location.hash).toBe("#/init-files/f9"));
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  it("shows why a copy failed", async () => {
    mockFetch({
      "GET /api/init-files": [initFile({ id: "f1", name: "Live" })],
      "POST /api/init-files/f1/copy": () => json({ error: "No init file with id f1" }, 404),
    });
    render(<InitFilesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy Live" }));
    expect(await screen.findByText("No init file with id f1")).toBeInTheDocument();
  });

  it("deletes an unpublished init file after confirming", async () => {
    const { calls } = mockFetch({
      "GET /api/init-files": [initFile({ id: "f3", name: "Draft", slug: "draft", test: output({ path: "/config/test/f3.json" }) })],
      "DELETE /api/init-files/f3": () => json(null, 204),
    });
    render(
      <>
        <InitFilesPage />
        <DialogHost />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Draft" }));
    const dialog = await openDialog();
    expect(dialog.getByText(/\/config\/test\/f3\.json/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted “Draft”")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Draft" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});
