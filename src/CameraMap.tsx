// A Leaflet map for picking Terria camera views. Each camera is drawn as a
// rectangle; "Use map view" sets it to the area shown on the map.
//
// Terria accepts a camera as a bounding box { west, south, east, north } in
// degrees, which is what this produces. West may be greater than east for a
// box that crosses the antimeridian.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { WORLD, toBounds, viewRect, type Rect } from "./camera";

export type { Rect } from "./camera";

const TILE_SIZE = 256;
const ZOOM_SNAP = 0.25;
/** The world as Web Mercator tiles show it. */
const WORLD_BOUNDS = L.latLngBounds([-85.0511, -180], [85.0511, 180]);

export interface MapCamera {
  key: string;
  label: string;
  color: string;
  /** The camera's box, or null if it isn't set or isn't a box. */
  rect: Rect | null;
  onSet: (rect: Rect) => void;
}

export function CameraMap({ cameras }: { cameras: MapCamera[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  // Only the first render's cameras pick the starting view.
  const startRect = useRef(cameras.find((c) => c.rect)?.rect ?? WORLD);

  useEffect(() => {
    // One world only: no repeated tiles, and no panning past its edges.
    const m = L.map(container.current!, { zoomSnap: ZOOM_SNAP, maxBounds: WORLD_BOUNDS, maxBoundsViscosity: 1 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      noWrap: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    // Never zoom out so far that the world is narrower than the map.
    const fitWorld = () => m.setMinZoom(Math.max(0, Math.ceil(Math.log2(m.getSize().x / TILE_SIZE) / ZOOM_SNAP) * ZOOM_SNAP));
    fitWorld();
    m.on("resize", fitWorld);
    m.fitBounds(toBounds(startRect.current));
    map.current = m;
    layers.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    for (const c of cameras) {
      if (!c.rect) continue;
      // A box crossing the antimeridian is drawn in two parts, one at each edge of the world.
      const { west, east } = c.rect;
      const parts = east < west ? [{ ...c.rect, east: 180 }, { ...c.rect, west: -180 }] : [c.rect];
      for (const part of parts) {
        L.rectangle(toBounds(part), { color: c.color, weight: 2, fillOpacity: 0.08 }).bindTooltip(c.label).addTo(group);
      }
    }
  }, [cameras]);

  return (
    <div className="camera-map">
      <div ref={container} className="camera-map-canvas" role="application" aria-label="Map for choosing camera views" />
      <div className="camera-map-actions">
        {cameras.map((c) => (
          <div key={c.key} className="input-row">
            <span className="camera-swatch" style={{ borderColor: c.color }} aria-hidden="true" />
            <span className="camera-label">{c.label}</span>
            <button type="button" className="btn small" onClick={() => map.current && c.onSet(viewRect(map.current))}>
              Use map view
            </button>
            <button
              type="button"
              className="btn small"
              disabled={!c.rect}
              onClick={() => c.rect && map.current?.fitBounds(toBounds(c.rect))}
            >
              Zoom to
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
