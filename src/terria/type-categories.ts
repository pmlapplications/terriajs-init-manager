// How catalog types are grouped on the Create New page, and which icon each
// type gets (drawn by TypeIcon).

import { kindOf } from "./catalog-ui";

export type IconName =
  | "folder"
  | "folderServer"
  | "globe"
  | "map"
  | "image"
  | "shapes"
  | "route"
  | "rss"
  | "clock"
  | "table"
  | "activity"
  | "cube"
  | "mountain"
  | "layers"
  | "stub";

export type Category = "groups" | "imagery" | "vector" | "tables" | "3d" | "other";

export const CATEGORIES: { id: Category; title: string; description: string }[] = [
  { id: "groups", title: "Groups", description: "Folders in the catalog, either picked by hand or loaded from a server" },
  { id: "imagery", title: "Imagery & map services", description: "Map tiles and rendered images" },
  { id: "vector", title: "Vector features", description: "Points, lines and polygons" },
  { id: "tables", title: "Tables & charts", description: "Tabular data, time series and sensors" },
  { id: "3d", title: "3D & terrain", description: "Models, 3D tiles and elevation" },
  { id: "other", title: "Other", description: "" },
];

// Item types by category and icon. Types not listed fall back to "other"/"layers".
const ITEM_TYPES: Record<string, [Category, IconName]> = {
  wms: ["imagery", "globe"],
  wmts: ["imagery", "globe"],
  tms: ["imagery", "globe"],
  "url-template-imagery": ["imagery", "globe"],
  "esri-mapServer": ["imagery", "globe"],
  "esri-imageServer": ["imagery", "globe"],
  carto: ["imagery", "globe"],
  "carto-v3": ["imagery", "globe"],
  "bing-maps": ["imagery", "map"],
  "open-street-map": ["imagery", "map"],
  "ion-imagery": ["imagery", "map"],
  "mapbox-map": ["imagery", "map"],
  "mapbox-style": ["imagery", "map"],
  cog: ["imagery", "image"],

  wfs: ["vector", "shapes"],
  "esri-featureServer": ["vector", "shapes"],
  mvt: ["vector", "shapes"],
  geojson: ["vector", "shapes"],
  kml: ["vector", "shapes"],
  shp: ["vector", "shapes"],
  gpx: ["vector", "route"],
  gtfs: ["vector", "route"],
  georss: ["vector", "rss"],
  czml: ["vector", "clock"],

  csv: ["tables", "table"],
  "api-table": ["tables", "table"],
  "sdmx-json": ["tables", "table"],
  "socrata-map-item": ["tables", "table"],
  "opendatasoft-item": ["tables", "table"],
  sos: ["tables", "activity"],
  "senaps-locations": ["tables", "activity"],

  "3d-tiles": ["3d", "cube"],
  gltf: ["3d", "cube"],
  i3s: ["3d", "cube"],
  assimp: ["3d", "cube"],
  "cesium-terrain": ["3d", "mountain"],
  "arcgis-terrain": ["3d", "mountain"],

  composite: ["other", "layers"],
  stub: ["other", "stub"],
};

export function categoryOf(type: string): Category {
  if (kindOf(type) === "group") return "groups";
  return ITEM_TYPES[type]?.[0] ?? "other";
}

export function iconFor(type: string): IconName {
  if (kindOf(type) === "group") return type === "group" ? "folder" : "folderServer";
  return ITEM_TYPES[type]?.[1] ?? "layers";
}
