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
    const m = L.map(container.current!, { worldCopyJump: true, zoomSnap: 0.25 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
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
      L.rectangle(toBounds(c.rect), { color: c.color, weight: 2, fillOpacity: 0.08 }).bindTooltip(c.label).addTo(group);
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
