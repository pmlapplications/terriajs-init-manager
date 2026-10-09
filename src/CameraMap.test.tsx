import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CameraMap, type MapCamera } from "./CameraMap";

describe("CameraMap", () => {
  beforeEach(() => {
    // jsdom doesn't lay out; give the map a size so Leaflet can fit bounds.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
  });

  const cameras = (onSet = vi.fn()): MapCamera[] => [
    { key: "home", label: "Home", color: "#00f", rect: { west: -10, south: 40, east: 10, north: 60 }, onSet },
    { key: "initial", label: "Initial", color: "#f00", rect: null, onSet },
  ];

  it("draws a row per camera, with Zoom to only for set cameras", () => {
    render(<CameraMap cameras={cameras()} />);
    expect(screen.getByRole("application", { name: "Map for choosing camera views" })).toBeInTheDocument();
    const zoom = screen.getAllByRole("button", { name: "Zoom to" });
    expect(zoom[0]).toBeEnabled();
    expect(zoom[1]).toBeDisabled();
    expect(document.querySelectorAll(".leaflet-interactive")).toHaveLength(1);
  });

  it("sets a camera to the area shown, starting on the first set camera", async () => {
    const onSet = vi.fn();
    render(<CameraMap cameras={cameras(onSet)} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Use map view" })[1]);
    const rect = onSet.mock.calls[0][0];
    // The map fits the home box, so the view contains it.
    expect(rect.west).toBeLessThanOrEqual(-10);
    expect(rect.east).toBeGreaterThanOrEqual(10);
    expect(rect.south).toBeLessThanOrEqual(40);
    expect(rect.north).toBeGreaterThanOrEqual(60);
    await userEvent.click(screen.getAllByRole("button", { name: "Zoom to" })[0]);
  });

  it("redraws boxes when cameras change and cleans up on unmount", () => {
    const { rerender, unmount } = render(<CameraMap cameras={cameras()} />);
    rerender(<CameraMap cameras={cameras().map((c) => ({ ...c, rect: { west: 0, south: 0, east: 1, north: 1 } }))} />);
    expect(document.querySelectorAll(".leaflet-interactive")).toHaveLength(2);
    unmount();
    expect(document.querySelector(".leaflet-container")).toBeNull();
  });
});
