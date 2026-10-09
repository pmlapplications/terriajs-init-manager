import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InitFilesPage } from "./InitFilesPage";
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
    expect(within(live).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/init-files/f1/export?download");

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
});
