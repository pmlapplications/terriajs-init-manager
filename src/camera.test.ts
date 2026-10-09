import L from "leaflet";
import { describe, expect, it } from "vitest";
import { toBounds, viewRect, wrapLongitude } from "./camera";

describe("wrapLongitude", () => {
  it.each([
    [0, 0],
    [190, -170],
    [-190, 170],
    [540, 180],
    [-180, -180],
  ])("%s -> %s", (lon, wrapped) => {
    expect(wrapLongitude(lon)).toBe(wrapped);
  });
});

describe("viewRect", () => {
  const view = (south: number, west: number, north: number, east: number) => viewRect({ getBounds: () => L.latLngBounds([south, west], [north, east]) });

  it("rounds to 4 decimal places", () => {
    expect(view(40.123456, -10.000049, 60, 10)).toEqual({ west: -10, south: 40.1235, east: 10, north: 60 });
  });

  it("wraps longitudes after panning round the world", () => {
    expect(view(0, 170, 10, 200)).toEqual({ west: 170, south: 0, east: -160, north: 10 });
  });

  it("covers the whole world when zoomed right out", () => {
    expect(view(-100, -300, 100, 300)).toEqual({ west: -180, south: -90, east: 180, north: 90 });
  });
});

describe("toBounds", () => {
  it("unwraps boxes crossing the antimeridian", () => {
    const b = toBounds({ west: 170, south: 0, east: -170, north: 10 });
    expect([b.getWest(), b.getEast()]).toEqual([170, 190]);
    expect(toBounds({ west: -10, south: 0, east: 10, north: 5 }).getEast()).toBe(10);
  });
});
