// UI configuration for Terria catalog items: widgets, allowed values and
// ranges that the docs only state in prose, plus how traits are grouped.
//
// Specs are keyed by "<TraitsClass>.<trait>". Nested classes (LegendTraits,
// RectangleTraits, ...) are shared by every type, so their specs apply
// everywhere. Root traits common to many types are in COMMON_ROOT. Strict
// dropdowns ("select") are used only where the docs list the valid values;
// "combo" offers suggestions but accepts any text.

import groupTypeIndex from "./generated/groups.json";
import itemTypeIndex from "./generated/index.json";
import { isPlainObject, traitKind, type JsonObject, type TraitDef, type TraitsFile } from "./traits";

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

// Root traits shared by many catalog types. Each applies only where the trait
// has the given type, since a few names mean different things in different
// types (WMS `styles` is text, table `styles` is a list of objects).
const COMMON_ROOT: Record<string, [type: string, spec: FieldSpec]> = {
  name: ["string", { required: true }],
  dimensions: ["any", JSON_OBJECT],
  parameters: ["any", JSON_OBJECT],
  getFeatureInfoParameters: ["any", JSON_OBJECT],
  workbenchControlFlags: ["any", JSON_OBJECT],
  diffItemProperties: ["any", JSON_OBJECT],
  maxRefreshIntervals: ["number", { min: 1, integer: true }],
  description: ["string", { widget: "textarea" }],
  shortReport: ["string", { widget: "textarea" }],
  chartDisclaimer: ["string", { widget: "textarea" }],
  scaleWorkbenchInfo: ["string", { widget: "textarea" }],
  chartType: ["string", { widget: "combo", options: opts("momentLines", "momentPoints") }],
  chartGlyphStyle: [
    "string",
    { widget: "select", options: opts("circle", "cross", "diamond", "square", "star", "triangle", "wye") },
  ],
  firstDiffDate: ["string", { widget: "datetime" }],
  secondDiffDate: ["string", { widget: "datetime" }],
  fromContinuous: ["string", { widget: "select", options: opts("nearest", "next", "previous") }],
  multiplierDefaultDeltaStep: ["number", NON_NEGATIVE],
  getCapabilitiesCacheDuration: ["string", DURATION],
  cacheDuration: ["string", DURATION],
  leafletUpdateInterval: ["number", NON_NEGATIVE],
  minimumLevel: ["number", NON_NEGATIVE_INT],
  maximumLevel: ["number", NON_NEGATIVE_INT],
  tileWidth: ["number", { min: 1, integer: true }],
  tileHeight: ["number", { min: 1, integer: true }],
  maximumShownFeatureInfos: ["number", NON_NEGATIVE_INT],
  preferredViewerMode: [
    "string",
    {
      widget: "select",
      options: [
        { value: "2d", label: "2d (Leaflet)" },
        { value: "3d", label: "3d (Cesium, terrain)" },
        { value: "3dsmooth", label: "3dsmooth (Cesium, no terrain)" },
      ],
    },
  ],
  maxScaleDenominator: ["number", { min: 0, exclusiveMin: true }],
  minScaleDenominator: ["number", { min: 0, exclusiveMin: true }],
  opacity: ["number", { min: 0, max: 1 }],
  splitDirection: [
    "number",
    {
      widget: "select",
      options: [
        { value: -1, label: "Left (-1)" },
        { value: 0, label: "Both sides (0)" },
        { value: 1, label: "Right (1)" },
      ],
    },
  ],
  currentTime: ["string", { widget: "datetime" }],
  startTime: ["string", { widget: "datetime" }],
  stopTime: ["string", { widget: "datetime" }],
  initialTimeSource: ["string", { widget: "select", options: opts("start", "stop", "now", "none") }],
  dateFormat: [
    "string",
    { widget: "combo", options: opts("yyyy", "mmm yyyy", "yyyy-mm-dd", "dd/mm/yyyy", "yyyy-mm-dd HH:MM") },
  ],
};

export const specs: Record<string, FieldSpec> = {
  // --- WebMapServiceCatalogItemTraits -------------------------------------
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

// Catalog-entry fields that are not Terria traits but belong in the init file.
const ENTRY_TRAITS: TraitDef[] = [
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

// Shared layout; each type shows the traits it has. Traits not placed here
// go in a section of their own after "Basics".
const SECTION_LAYOUT: Section[] = [
  {
    id: "basics",
    title: "Basics",
    traits: ["id", "name", "url", "layers", "styles", "description", "nameInCatalog", "attribution", "dataCustodian", "shareKeys"],
  },
  {
    id: "requests",
    title: "Service requests",
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

export type MemberKind = "item" | "group";

export interface ItemType {
  /** Terria `type`, e.g. "wms". */
  type: string;
  /** Terria model class, e.g. "WebMapServiceCatalogItem". */
  model: string;
}

/** Catalog item types with generated traits, in docs order. */
export const itemTypes: ItemType[] = itemTypeIndex;

/** Catalog group types with generated traits, in docs order. */
export const groupTypes: ItemType[] = groupTypeIndex;

const groupTypeNames = new Set(groupTypes.map((t) => t.type));

export const kindOf = (type: string): MemberKind => (groupTypeNames.has(type) ? "group" : "item");

/** "WebMapServiceCatalogItem" -> "WebMapService"; "CatalogGroup" stays as it is. */
export const shortModelName = (model: string) => model.replace(/Catalog(Item|Group)$/, "") || model;

/** Display name for any type, e.g. "WebMapService" or "WebMapService group". */
export function typeLabel(type: string): string {
  if (type === "group") return "Group";
  const group = groupTypes.find((t) => t.type === type);
  if (group) return `${shortModelName(group.model)} group`;
  return shortModelName(itemTypes.find((t) => t.type === type)?.model ?? type);
}

/** Everything the editor needs to know about one catalog item type. */
export interface CatalogModel {
  type: string;
  kind: MemberKind;
  model: string;
  source: string;
  rootClass: string;
  /** All top-level trait definitions, including entry fields. */
  rootTraits: TraitDef[];
  sections: Section[];
  /** Number of traits across all classes, for display. */
  totalTraitCount: number;
  classTraits(className: string): TraitDef[];
  /** Spec for a trait: explicit entry, else inferred from its name. */
  specFor(className: string, trait: TraitDef): FieldSpec;
}

export function buildModel(file: TraitsFile): CatalogModel {
  const rootClass = file.root;
  const kind = kindOf(file.type);
  // A group's members are links to other rows, edited apart from the form.
  const rootTraits = [...ENTRY_TRAITS, ...file.classes[rootClass].filter((t) => !(kind === "group" && t.name === "members"))];
  const known = new Set(rootTraits.map((t) => t.name));
  const placed = new Set(SECTION_LAYOUT.flatMap((s) => s.traits));
  const layout = SECTION_LAYOUT.map((s) => ({ ...s, traits: s.traits.filter((t) => known.has(t)) })).filter((s) => s.traits.length);
  const specific = rootTraits.map((t) => t.name).filter((t) => !placed.has(t));
  const sections = specific.length
    ? [layout[0], { id: "specific", title: `${shortModelName(file.model)} options`, traits: specific }, ...layout.slice(1)]
    : layout;
  if (kind === "group") {
    const options = sections.find((s) => s.id === "specific");
    if (options) options.title = file.type === "group" ? "Group options" : `${typeLabel(file.type)} options`;
  }

  const classTraits = (className: string) => (className === rootClass ? rootTraits : (file.classes[className] ?? []));

  const specFor = (className: string, trait: TraitDef): FieldSpec => {
    let explicit = specs[`${className}.${trait.name}`];
    if (!explicit && className === rootClass) {
      const common = COMMON_ROOT[trait.name];
      if (common && common[0] === trait.type) explicit = common[1];
    }
    if (explicit?.widget || trait.type !== "string") return explicit ?? {};
    if (/(^url$|Url$)/.test(trait.name)) return { widget: "url", ...explicit };
    if (/(^color$|Color$)/.test(trait.name)) return { widget: "color", ...explicit };
    return explicit ?? {};
  };

  return {
    type: file.type,
    kind,
    model: file.model,
    source: file.source,
    rootClass,
    rootTraits,
    sections,
    totalTraitCount: ENTRY_TRAITS.length + Object.values(file.classes).reduce((n, t) => n + t.length, 0),
    classTraits,
    specFor,
  };
}

const traitFiles = import.meta.glob<TraitsFile>("./generated/*-traits.json", { import: "default" });
const models = new Map<string, Promise<CatalogModel>>();

/** Loads (once) the traits for a catalog item type. */
export function loadModel(type: string): Promise<CatalogModel> {
  let model = models.get(type);
  if (!model) {
    const load = traitFiles[`./generated/${type}-traits.json`];
    if (!load) return Promise.reject(new Error(`Unknown catalog type "${type}"`));
    model = load().then(buildModel);
    models.set(type, model);
  }
  return model;
}

/**
 * Reorder keys to match the form: section order at the root, docs order inside
 * nested traits. Keys the form doesn't know keep their relative order at the end.
 */
export function orderLikeForm(model: CatalogModel, item: JsonObject): JsonObject {
  const rootOrder = model.sections.flatMap((s) => s.traits);

  const orderObject = (obj: JsonObject, className: string): JsonObject => {
    const traits = model.classTraits(className);
    const names = className === model.rootClass ? rootOrder : traits.map((t) => t.name);
    const types = new Map(traits.map((t) => [t.name, t.type]));
    const out: JsonObject = {};
    for (const name of names) {
      if (Object.hasOwn(obj, name)) out[name] = orderChild(obj[name], types.get(name));
    }
    for (const [key, value] of Object.entries(obj)) {
      if (!Object.hasOwn(out, key)) out[key] = value;
    }
    return out;
  };

  const orderChild = (value: unknown, type: string | undefined): unknown => {
    if (type === undefined) return value;
    const kind = traitKind(type);
    if (kind.kind === "object" && isPlainObject(value)) return orderObject(value, kind.className);
    if (kind.kind === "objectArray" && Array.isArray(value)) {
      return value.map((v) => (isPlainObject(v) ? orderObject(v, kind.className) : v));
    }
    return value;
  };

  return orderObject(item, model.rootClass);
}
