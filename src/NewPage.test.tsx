import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewPage } from "./NewPage";
import { groupTypes, itemTypes } from "./terria/catalog-ui";

describe("NewPage", () => {
  it("shows every type, grouped by category, with the plain group first", () => {
    render(<NewPage onCreate={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(itemTypes.length + groupTypes.length);
    const groups = screen.getByRole("region", { name: /^Groups/ });
    expect(within(groups).getAllByRole("button")[0]).toHaveAttribute("title", "CatalogGroup");
    expect(screen.getByRole("region", { name: /^Imagery/ })).toBeInTheDocument();
  });

  it("filters by type, model or label", async () => {
    render(<NewPage onCreate={() => {}} />);
    await userEvent.type(screen.getByLabelText("Filter types"), "WebMapService");
    const titles = screen.getAllByRole("button").map((b) => b.getAttribute("title"));
    expect(titles).toEqual(expect.arrayContaining(["WebMapServiceCatalogItem", "WebMapServiceCatalogGroup"]));
    expect(titles.every((t) => t?.includes("WebMapService"))).toBe(true);
  });

  it("says when nothing matches", async () => {
    render(<NewPage onCreate={() => {}} />);
    await userEvent.type(screen.getByLabelText("Filter types"), "zzzz");
    expect(screen.getByText("No types match “zzzz”.")).toBeInTheDocument();
  });

  it("creates the chosen type", async () => {
    const onCreate = vi.fn();
    render(<NewPage onCreate={onCreate} />);
    await userEvent.click(screen.getByTitle("WebMapServiceCatalogItem"));
    expect(onCreate).toHaveBeenCalledWith("wms");
  });
});
