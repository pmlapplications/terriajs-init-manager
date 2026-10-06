// UI configuration for WebMapServiceCatalogItem: widgets, allowed values and
// ranges that the docs only state in prose, plus how traits are grouped.
//
// Specs are keyed by "<TraitsClass>.<trait>". Strict dropdowns ("select") are
// used only where the docs list the valid values; "combo" offers suggestions
// but accepts any text.

import generated from "./generated/wms-traits.json";
import type { TraitDef, TraitsFile } from "./traits";

export const wmsTraits = generated as TraitsFile;

export interface Option {
  value: string | number;
  label?: string;
}

export type Widget =
  | "text"
  | "textarea"
  | "url"
  | "color"
  | "datetime"
  | "duration"
  | "select"
  | "combo"
  | "json"
  | "wmsLayers"
  | "wmsStyles";

export interface FieldSpec {
  widget?: Widget;
  options?: Option[];
  min?: number;
  max?: number;
  /** Value must be strictly greater than `min`. */
  exclusiveMin?: boolean;
  integer?: boolean;
  /** For `any` traits: the JSON must be an object of key/value pairs. */
  jsonObject?: boolean;
  /** For `string[]` traits: widget used for each entry. */
  itemWidget?: Widget;
  pattern?: { regex: RegExp; message: string };
  placeholder?: string;
  required?: boolean;
}

const opts = (...values: (string | number)[]): Option[] => values.map((value) => ({ value }));

const LONGITUDE: FieldSpec = { min: -180, max: 180 };
const LATITUDE: FieldSpec = { min: -90, max: 90 };
const NON_NEGATIVE: FieldSpec = { min: 0 };
const NON_NEGATIVE_INT: FieldSpec = { min: 0, integer: true };
const JSON_OBJECT: FieldSpec = { widget: "json", jsonObject: true };
const DURATION: FieldSpec = { widget: "duration", options: opts("0d", "1h", "1d", "1w") };

// Varnish-style duration, e.g. "1d", "10000s".
export const DURATION_RE = /^\d+(\.\d+)?(ms|s|m|h|d|w|y)$/;

export const SUPPORTED_CRS = ["EPSG:3857", "EPSG:900913", "EPSG:4326", "CRS:84", "EPSG:4283"];

export const specs: Record<string, FieldSpec> = {
  // --- WebMapServiceCatalogItemTraits -------------------------------------
  "WebMapServiceCatalogItemTraits.name": { required: true },
  "WebMapServiceCatalogItemTraits.url": { widget: "url", required: true, placeholder: "https://example.org/geoserver/wms" },
  "WebMapServiceCatalogItemTraits.layers": { widget: "wmsLayers" },
  "WebMapServiceCatalogItemTraits.styles": { widget: "wmsStyles" },
  "WebMapServiceCatalogItemTraits.crs": {
    widget: "select",
    options: [
      { value: "EPSG:3857", label: "EPSG:3857 (Web Mercator)" },
      { value: "EPSG:900913", label: "EPSG:900913 (Web Mercator)" },
      { value: "EPSG:4326", label: "EPSG:4326 (WGS 84)" },
      { value: "CRS:84", label: "CRS:84 (WGS 84)" },
      { value: "EPSG:4283", label: "EPSG:4283 (GDA94)" },
    ],
  },
  "WebMapServiceCatalogItemTraits.dimensions": JSON_OBJECT,
  "WebMapServiceCatalogItemTraits.parameters": JSON_OBJECT,
  "WebMapServiceCatalogItemTraits.getFeatureInfoParameters": JSON_OBJECT,
  "WebMapServiceCatalogItemTraits.workbenchControlFlags": JSON_OBJECT,
  "WebMapServiceCatalogItemTraits.diffItemProperties": JSON_OBJECT,
  "WebMapServiceCatalogItemTraits.maxRefreshIntervals": { min: 1, integer: true },
  "WebMapServiceCatalogItemTraits.description": { widget: "textarea" },
  "WebMapServiceCatalogItemTraits.shortReport": { widget: "textarea" },
  "WebMapServiceCatalogItemTraits.chartDisclaimer": { widget: "textarea" },
  "WebMapServiceCatalogItemTraits.scaleWorkbenchInfo": { widget: "textarea" },
  "WebMapServiceCatalogItemTraits.chartType": { widget: "combo", options: opts("momentLines", "momentPoints") },
  "WebMapServiceCatalogItemTraits.chartGlyphStyle": {
    widget: "select",
    options: opts("circle", "cross", "diamond", "square", "star", "triangle", "wye"),
  },
  "WebMapServiceCatalogItemTraits.firstDiffDate": { widget: "datetime" },
  "WebMapServiceCatalogItemTraits.secondDiffDate": { widget: "datetime" },
  "WebMapServiceCatalogItemTraits.fromContinuous": { widget: "select", options: opts("nearest", "next", "previous") },
  "WebMapServiceCatalogItemTraits.multiplierDefaultDeltaStep": NON_NEGATIVE,
  "WebMapServiceCatalogItemTraits.getCapabilitiesCacheDuration": DURATION,
  "WebMapServiceCatalogItemTraits.cacheDuration": DURATION,
  "WebMapServiceCatalogItemTraits.leafletUpdateInterval": NON_NEGATIVE,
  "WebMapServiceCatalogItemTraits.minimumLevel": NON_NEGATIVE_INT,
  "WebMapServiceCatalogItemTraits.maximumLevel": NON_NEGATIVE_INT,
  "WebMapServiceCatalogItemTraits.tileWidth": { min: 1, integer: true },
  "WebMapServiceCatalogItemTraits.tileHeight": { min: 1, integer: true },
  "WebMapServiceCatalogItemTraits.maximumShownFeatureInfos": NON_NEGATIVE_INT,
  "WebMapServiceCatalogItemTraits.preferredViewerMode": {
    widget: "select",
    options: [
      { value: "2d", label: "2d (Leaflet)" },
      { value: "3d", label: "3d (Cesium, terrain)" },
      { value: "3dsmooth", label: "3dsmooth (Cesium, no terrain)" },
    ],
  },
  "WebMapServiceCatalogItemTraits.maxScaleDenominator": { min: 0, exclusiveMin: true },
  "WebMapServiceCatalogItemTraits.minScaleDenominator": { min: 0, exclusiveMin: true },
  "WebMapServiceCatalogItemTraits.opacity": { min: 0, max: 1 },
  "WebMapServiceCatalogItemTraits.splitDirection": {
    widget: "select",
    options: [
      { value: -1, label: "Left (-1)" },
      { value: 0, label: "Both sides (0)" },
      { value: 1, label: "Right (1)" },
    ],
  },
  "WebMapServiceCatalogItemTraits.currentTime": { widget: "datetime" },
  "WebMapServiceCatalogItemTraits.startTime": { widget: "datetime" },
  "WebMapServiceCatalogItemTraits.stopTime": { widget: "datetime" },
  "WebMapServiceCatalogItemTraits.initialTimeSource": { widget: "select", options: opts("start", "stop", "now", "none") },
  "WebMapServiceCatalogItemTraits.dateFormat": {
    widget: "combo",
    options: opts("yyyy", "mmm yyyy", "yyyy-mm-dd", "dd/mm/yyyy", "yyyy-mm-dd HH:MM"),
  },

  // --- Nested classes -----------------------------------------------------
  "GetFeatureInfoFormat.type": { widget: "select", options: opts("json", "xml", "html", "text", "csv") },
  "GetFeatureInfoFormat.format": {
    widget: "combo",
    options: opts("application/json", "text/xml", "text/html", "text/plain", "text/csv", "application/vnd.ogc.gml"),
  },

  "WebMapServiceAvailableStyleTraits.abstract": { widget: "textarea" },

  "LegendTraits.imageScaling": { min: 0, exclusiveMin: true },
  "LegendTraits.urlMimeType": { widget: "combo", options: opts("image/png", "image/jpeg", "image/gif", "image/svg+xml") },
  "LegendItemTraits.maxMultipleTitlesShowed": { pattern: { regex: /^\d+$/, message: "Should be a whole number, e.g. 10" } },
  "LegendItemTraits.outlineWidth": NON_NEGATIVE,
  "LegendItemTraits.outlineStyle": {
    widget: "select",
    options: opts("dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"),
  },
  "LegendItemTraits.multipleColors": { itemWidget: "color" },
  "LegendItemTraits.marker": { widget: "combo", options: opts("circle", "square", "triangle", "star", "marker") },
  "LegendItemTraits.imageHeight": NON_NEGATIVE,
  "LegendItemTraits.imageWidth": NON_NEGATIVE,

  "InfoSectionTraits.content": { widget: "textarea" },
  "InfoSectionTraits.contentAsObject": JSON_OBJECT,
  "ShortReportTraits.content": { widget: "textarea" },

  "DataUrlTraits.type": {
    widget: "select",
    options: [
      { value: "wfs", label: "wfs: WFS base URL" },
      { value: "wcs", label: "wcs: WCS base URL" },
      { value: "wfs-complete", label: "wfs-complete: ready-to-use WFS download link" },
      { value: "wcs-complete", label: "wcs-complete: ready-to-use WCS download link" },
      { value: "direct", label: "direct: direct URL to dataset (default)" },
      { value: "none", label: "none: hide data URL" },
    ],
  },

  "DimensionOptionTraits.value": { widget: "json" },

  "WebCoverageServiceParameterTraits.outputCrs": {
    widget: "combo",
    options: opts("EPSG:4326", "EPSG:3857"),
    pattern: { regex: /^EPSG:\d+$/, message: 'Expected EPSG format, e.g. "EPSG:4326"' },
  },
  "WebCoverageServiceParameterTraits.outputFormat": { widget: "combo", options: opts("image/geotiff") },

  "TileErrorHandlingTraits.thresholdBeforeDisablingItem": NON_NEGATIVE_INT,

  "RectangleTraits.west": LONGITUDE,
  "RectangleTraits.east": LONGITUDE,
  "RectangleTraits.south": LATITUDE,
  "RectangleTraits.north": LATITUDE,
  "CameraTraits.west": LONGITUDE,
  "CameraTraits.east": LONGITUDE,
  "CameraTraits.south": LATITUDE,
  "CameraTraits.north": LATITUDE,

  "LookAtTraits.targetLongitude": LONGITUDE,
  "LookAtTraits.targetLatitude": LATITUDE,
  "LookAtTraits.heading": { min: 0, max: 360 },
  "LookAtTraits.pitch": { min: -90, max: 90 },
  "LookAtTraits.range": NON_NEGATIVE,

  "InitialMessageTraits.content": { widget: "textarea" },
  "InitialMessageTraits.width": NON_NEGATIVE,
  "InitialMessageTraits.height": NON_NEGATIVE,
  "InitialMessageTraits.toastVisibleDuration": NON_NEGATIVE,

  "FeatureInfoTemplateTraits.template": { widget: "textarea" },
  "FeatureInfoTemplateTraits.partials": JSON_OBJECT,
  "FeatureInfoTemplateTraits.formats": JSON_OBJECT,

  "TimeFilterCoordinates.latitude": LATITUDE,
  "TimeFilterCoordinates.longitude": LONGITUDE,
  "TileCoordinates.x": NON_NEGATIVE_INT,
  "TileCoordinates.y": NON_NEGATIVE_INT,
  "TileCoordinates.level": NON_NEGATIVE_INT,
};

/** Spec for a trait: explicit entry, else inferred from its name. */
export function specFor(className: string, trait: TraitDef): FieldSpec {
  const explicit = specs[`${className}.${trait.name}`];
  if (explicit?.widget || trait.type !== "string") return explicit ?? {};
  if (/(^url$|Url$)/.test(trait.name)) return { widget: "url", ...explicit };
  if (/(^color$|Color$)/.test(trait.name)) return { widget: "color", ...explicit };
  return explicit ?? {};
}

// Catalog-entry fields that are not WMS traits but belong in the init file.
export const ENTRY_TRAITS: TraitDef[] = [
  {
    name: "id",
    type: "string",
    description:
      "Unique id of this catalog member. Used in share links and the init file workbench. If omitted, the database id is used on export.",
  },
  {
    name: "shareKeys",
    type: "string[]",
    description: "Previous ids or paths of this member (e.g. \"Root Group/Marine/SST\"), so old share links still resolve.",
  },
];

export interface Section {
  id: string;
  title: string;
  traits: string[];
}

const SECTION_LAYOUT: Section[] = [
  {
    id: "basics",
    title: "Basics",
    traits: ["id", "name", "url", "layers", "styles", "description", "nameInCatalog", "attribution", "dataCustodian", "shareKeys"],
  },
  {
    id: "wms",
    title: "WMS requests",
    traits: [
      "crs", "useWmsVersion130", "parameters", "dimensions", "getCapabilitiesUrl", "getCapabilitiesCacheDuration",
      "maxRefreshIntervals", "isGeoServer", "isEsri", "isThredds", "isNcWMS", "supportsGetLegendGraphic",
      "supportsGetTimeseries", "supportsColorScaleRange", "colorScaleMinimum", "colorScaleMaximum",
    ],
  },
  {
    id: "stylesDims",
    title: "Styles & dimensions",
    traits: ["availableStyles", "availableDimensions", "disableDimensionSelectors", "modelDimensions"],
  },
  {
    id: "display",
    title: "Display & workbench",
    traits: [
      "opacity", "disableOpacityControl", "show", "keepOnTop", "supportsReordering", "splitDirection", "disableSplitter",
      "preferredViewerMode", "clipToRectangle", "isOpenInWorkbench", "workbenchControlFlags", "shareable",
      "disableExport", "disablePreview",
    ],
  },
  { id: "legends", title: "Legends", traits: ["legends", "legendBackgroundColor", "hideLegendInWorkbench"] },
  { id: "extent", title: "Extent & zoom", traits: ["rectangle", "idealZoom", "disableZoomTo", "zoomOnAddToWorkbench"] },
  {
    id: "tiles",
    title: "Tiles & scale",
    traits: [
      "minimumLevel", "maximumLevel", "tileWidth", "tileHeight", "leafletUpdateInterval", "tileErrorHandlingOptions",
      "maxScaleDenominator", "minScaleDenominator", "hideLayerAfterMinScaleDenominator", "scaleWorkbenchInfo",
    ],
  },
  {
    id: "featureInfo",
    title: "Feature info",
    traits: [
      "allowFeaturePicking", "getFeatureInfoFormat", "getFeatureInfoUrl", "getFeatureInfoParameters", "featureInfoTemplate",
      "showStringIfPropertyValueIsNull", "maximumShownFeatureInfos", "timeFilterPropertyName", "timeFilterCoordinates",
    ],
  },
  {
    id: "info",
    title: "Info & metadata",
    traits: [
      "info", "infoSectionOrder", "hideDefaultDescription", "metadataUrls", "dataUrls", "shortReport",
      "shortReportSections", "initialMessage", "isExperiencingIssues", "hideSource", "disableAboutData",
    ],
  },
  {
    id: "time",
    title: "Time & charts",
    traits: [
      "currentTime", "initialTimeSource", "startTime", "stopTime", "multiplier", "multiplierDefaultDeltaStep", "isPaused",
      "fromContinuous", "dateFormat", "timeLabel", "disableDateTimeSelector", "showInChartPanel", "chartType",
      "chartDisclaimer", "chartColor", "chartGlyphStyle",
    ],
  },
  {
    id: "diff",
    title: "Difference images",
    traits: ["availableDiffStyles", "isShowingDiff", "firstDiffDate", "secondDiffDate", "diffStyleId", "diffItemProperties"],
  },
  { id: "wcs", title: "WCS clip & ship", traits: ["linkedWcsUrl", "linkedWcsCoverage", "linkedWcsParameters"] },
  { id: "network", title: "Network & caching", traits: ["forceProxy", "cacheDuration"] },
];

export const ROOT_CLASS = wmsTraits.root;

/** All top-level trait definitions, including entry fields. */
export const rootTraits: TraitDef[] = [...ENTRY_TRAITS, ...wmsTraits.classes[ROOT_CLASS]];

/** Sections with any traits not placed above collected under "Other". */
export const sections: Section[] = (() => {
  const placed = new Set(SECTION_LAYOUT.flatMap((s) => s.traits));
  const known = new Set(rootTraits.map((t) => t.name));
  const layout = SECTION_LAYOUT.map((s) => ({ ...s, traits: s.traits.filter((t) => known.has(t)) }));
  const other = rootTraits.map((t) => t.name).filter((t) => !placed.has(t));
  return other.length ? [...layout, { id: "other", title: "Other", traits: other }] : layout;
})();

/** Number of traits across all classes, for display. */
export const totalTraitCount = ENTRY_TRAITS.length + Object.values(wmsTraits.classes).reduce((n, t) => n + t.length, 0);

export function classTraits(className: string): TraitDef[] {
  return className === ROOT_CLASS ? rootTraits : (wmsTraits.classes[className] ?? []);
}
