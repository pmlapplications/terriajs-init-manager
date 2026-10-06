import { classTraits, DURATION_RE, ROOT_CLASS, specFor, type FieldSpec, type Widget } from "./wms-ui";
import { isPlainObject, pathKey, traitKind, type JsonObject, type Path, type TraitDef } from "./traits";

export interface Issue {
  path: string;
  level: "error" | "warning";
  message: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg)(\?|#|$)/i;

export function isCssColor(v: string): boolean {
  if (typeof CSS !== "undefined" && CSS.supports) return CSS.supports("color", v);
  return /^(#[0-9a-f]{3,8}|rgba?\(.+\)|hsla?\(.+\)|[a-z]+)$/i.test(v);
}

/** Problem with a string value for the given widget, or null. */
export function checkStringWidget(value: string, widget: Widget | undefined): Issue["message"] | null {
  switch (widget) {
    case "url": {
      if (/\s/.test(value)) return "URLs cannot contain spaces";
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
        try {
          const { protocol } = new URL(value);
          if (!["http:", "https:", "data:"].includes(protocol)) return `Unsupported protocol "${protocol}"`;
        } catch {
          return "Not a valid URL";
        }
      }
      return null;
    }
    case "color":
      return isCssColor(value) ? null : "Not a CSS colour (e.g. #00ffff, cyan, rgba(0,255,255,1))";
    case "datetime":
      return ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : "Expected an ISO 8601 date/time, e.g. 2024-01-31 or 2024-01-31T12:00:00Z";
    case "duration":
      return DURATION_RE.test(value) ? null : "Expected a duration such as 30s, 12h, 1d or 1w";
    default:
      return null;
  }
}

export function checkNumber(value: number, spec: FieldSpec): string | null {
  if (!Number.isFinite(value)) return "Expected a number";
  if (spec.integer && !Number.isInteger(value)) return "Expected a whole number";
  if (spec.min !== undefined) {
    if (spec.exclusiveMin ? value <= spec.min : value < spec.min) {
      return spec.exclusiveMin ? `Must be greater than ${spec.min}` : `Must be at least ${spec.min}`;
    }
  }
  if (spec.max !== undefined && value > spec.max) return `Must be at most ${spec.max}`;
  return null;
}

function validateValue(value: unknown, trait: TraitDef, spec: FieldSpec, path: Path, out: Issue[]) {
  const key = pathKey(path);
  const err = (message: string, level: Issue["level"] = "error") => out.push({ path: key, level, message });
  const kind = traitKind(trait.type);

  switch (kind.kind) {
    case "string": {
      if (typeof value !== "string") return err(`Expected text, got ${typeName(value)}`);
      if (spec.widget === "select" && value !== "" && !spec.options?.some((o) => o.value === value)) {
        return err(`"${value}" is not one of: ${spec.options?.map((o) => o.value).join(", ")}`);
      }
      const problem = checkStringWidget(value, spec.widget);
      if (problem) return err(problem);
      if (spec.pattern && value !== "" && !spec.pattern.regex.test(value)) err(spec.pattern.message, "warning");
      return;
    }
    case "number": {
      if (typeof value !== "number") return err(`Expected a number, got ${typeName(value)}`);
      if (spec.widget === "select" && !spec.options?.some((o) => o.value === value)) {
        return err(`${value} is not one of: ${spec.options?.map((o) => o.value).join(", ")}`);
      }
      const problem = checkNumber(value, spec);
      if (problem) err(problem);
      return;
    }
    case "boolean":
      if (typeof value !== "boolean") err(`Expected true or false, got ${typeName(value)}`);
      return;
    case "any":
      if (spec.jsonObject && !isPlainObject(value)) err(`Expected a JSON object, got ${typeName(value)}`);
      return;
    case "stringArray":
      if (!Array.isArray(value)) return err(`Expected a list of text values, got ${typeName(value)}`);
      value.forEach((v, i) => {
        const itemKey = pathKey([...path, i]);
        if (typeof v !== "string") return out.push({ path: itemKey, level: "error", message: "Expected text" });
        const problem = checkStringWidget(v, spec.itemWidget);
        if (problem) out.push({ path: itemKey, level: "error", message: problem });
      });
      return;
    case "object":
      if (!isPlainObject(value)) return err(`Expected an object, got ${typeName(value)}`);
      return validateObject(value, kind.className, path, out);
    case "objectArray":
      if (!Array.isArray(value)) return err(`Expected a list, got ${typeName(value)}`);
      value.forEach((v, i) => {
        if (!isPlainObject(v)) out.push({ path: pathKey([...path, i]), level: "error", message: "Expected an object" });
        else validateObject(v, kind.className, [...path, i], out);
      });
  }
}

function validateObject(obj: JsonObject, className: string, path: Path, out: Issue[]) {
  const traits = classTraits(className);
  for (const [key, value] of Object.entries(obj)) {
    if (className === ROOT_CLASS && key === "type") {
      if (value !== "wms") out.push({ path: key, level: "error", message: `type must be "wms", got ${JSON.stringify(value)}` });
      continue;
    }
    const trait = traits.find((t) => t.name === key);
    if (!trait) {
      out.push({ path: pathKey([...path, key]), level: "warning", message: `"${key}" is not a ${className} trait` });
      continue;
    }
    if (value === null) continue; // Terria uses null to clear a value from a lower stratum.
    validateValue(value, trait, specFor(className, trait), [...path, key], out);
  }
  for (const trait of traits) {
    const v = obj[trait.name];
    if (specFor(className, trait).required && (v === undefined || v === "")) {
      out.push({ path: pathKey([...path, trait.name]), level: "error", message: "Required" });
    }
  }
}

const typeName = (v: unknown) => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a list";
  if (typeof v === "object") return "an object";
  const shown = JSON.stringify(v);
  return `${typeof v} ${shown.length > 40 ? shown.slice(0, 40) + "…" : shown}`;
};

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
const csv = (v: unknown) => (typeof v === "string" ? v.split(",").map((s) => s.trim()) : []);

/** Rules spanning more than one trait. */
function crossChecks(item: JsonObject, out: Issue[]) {
  const ordered = (lo: string, hi: string, loV: number | undefined, hiV: number | undefined, label: string) => {
    if (loV !== undefined && hiV !== undefined && loV > hiV) {
      out.push({ path: lo, level: "error", message: `${label}: ${lo} (${loV}) is greater than ${hi} (${hiV})` });
    }
  };
  ordered("colorScaleMinimum", "colorScaleMaximum", num(item.colorScaleMinimum), num(item.colorScaleMaximum), "Colour scale");
  ordered("minimumLevel", "maximumLevel", num(item.minimumLevel), num(item.maximumLevel), "Levels");
  ordered("minScaleDenominator", "maxScaleDenominator", num(item.minScaleDenominator), num(item.maxScaleDenominator), "Scale");

  const start = str(item.startTime);
  const stop = str(item.stopTime);
  if (start && stop && Date.parse(start) > Date.parse(stop)) {
    out.push({ path: "startTime", level: "error", message: "startTime is after stopTime" });
  }

  if (!str(item.layers)) {
    out.push({ path: "layers", level: "warning", message: "No layers set; Terria will try to choose from GetCapabilities" });
  }
  if (str(item.styles) && str(item.layers) && csv(item.styles).length !== csv(item.layers).length) {
    out.push({ path: "styles", level: "warning", message: "Number of styles should match the number of layers" });
  }

  if (isPlainObject(item.rectangle)) {
    const r = item.rectangle;
    const [s, n, w, e] = [num(r.south), num(r.north), num(r.west), num(r.east)];
    if (s !== undefined && n !== undefined && s > n) {
      out.push({ path: "rectangle.south", level: "error", message: "south is greater than north" });
    }
    if (w !== undefined && e !== undefined && w > e) {
      out.push({ path: "rectangle.west", level: "warning", message: "west is greater than east (crosses the antimeridian?)" });
    }
  }

  if (Array.isArray(item.legends)) {
    item.legends.forEach((legend, i) => {
      if (isPlainObject(legend) && str(legend.url) && !IMAGE_EXT_RE.test(legend.url as string) && !str(legend.urlMimeType)) {
        out.push({
          path: `legends.${i}.urlMimeType`,
          level: "warning",
          message: "Legend URL has no image extension; set urlMimeType or it will show as a link",
        });
      }
    });
  }

  if (item.isShowingDiff === true) {
    for (const key of ["firstDiffDate", "secondDiffDate", "diffStyleId"]) {
      if (!str(item[key])) out.push({ path: key, level: "warning", message: `${key} is needed when isShowingDiff is true` });
    }
  }
}

export function validateItem(item: JsonObject): Issue[] {
  const out: Issue[] = [];
  validateObject(item, ROOT_CLASS, [], out);
  crossChecks(item, out);
  return out;
}
