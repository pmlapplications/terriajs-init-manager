// Bounding boxes for Terria cameras, and converting them to and from Leaflet
// (used by CameraMap.tsx).

import L from "leaflet";

export interface Rect {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const WORLD: Rect = { west: -180, south: -90, east: 180, north: 90 };

const round = (n: number) => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function wrapLongitude(lon: number) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

/** The area shown on the map, as a Terria bounding box. */
export function viewRect(map: Pick<L.Map, "getBounds">): Rect {
  const b = map.getBounds();
  const span = b.getEast() - b.getWest();
  return {
    west: round(span >= 360 ? -180 : wrapLongitude(b.getWest())),
    south: round(clamp(b.getSouth(), -90, 90)),
    east: round(span >= 360 ? 180 : wrapLongitude(b.getEast())),
    north: round(clamp(b.getNorth(), -90, 90)),
  };
}

/** Leaflet bounds for a box, unwrapped eastwards if it crosses the antimeridian. */
export const toBounds = (r: Rect) => L.latLngBounds([r.south, r.west], [r.north, r.east < r.west ? r.east + 360 : r.east]);
