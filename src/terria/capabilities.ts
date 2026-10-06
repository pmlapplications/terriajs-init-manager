// Minimal WMS GetCapabilities reader (1.1.1 and 1.3.0) for prefilling
// layer, style and CRS choices. Follows the WMS rules for inheriting styles,
// CRS and bounding boxes from parent layers.

export interface CapStyle {
  name: string;
  title?: string;
  legendUrl?: string;
}

export interface CapDimension {
  name: string;
  units?: string;
  default?: string;
  values?: string;
}

export interface CapLayer {
  name: string;
  title?: string;
  abstract?: string;
  styles: CapStyle[];
  crs: string[];
  bbox?: { west: number; south: number; east: number; north: number };
  dimensions: CapDimension[];
}

export interface Capabilities {
  version: string;
  title?: string;
  layers: CapLayer[];
}

const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);
const kidText = (el: Element, name: string) => kids(el, name)[0]?.textContent?.trim() || undefined;

export function capabilitiesUrl(serviceUrl: string): string {
  const url = new URL(serviceUrl, window.location.href);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(service|request|version)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.set("service", "WMS");
  url.searchParams.set("request", "GetCapabilities");
  url.searchParams.set("version", "1.3.0");
  return url.toString();
}

export async function fetchCapabilities(serviceUrl: string, signal?: AbortSignal): Promise<Capabilities> {
  let res: Response;
  try {
    res = await fetch(capabilitiesUrl(serviceUrl), { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Request failed. The server may be unreachable or may not allow cross-origin (CORS) requests.");
  }
  if (!res.ok) throw new Error(`Server responded ${res.status} ${res.statusText}`);
  return parseCapabilities(await res.text());
}

export function parseCapabilities(xml: string): Capabilities {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Response is not valid XML");
  if (root.localName === "ServiceExceptionReport") {
    throw new Error(`Service exception: ${root.textContent?.trim().slice(0, 200)}`);
  }
  if (!/WMS_Capabilities|WMT_MS_Capabilities/.test(root.localName)) {
    throw new Error(`Not a WMS capabilities document (root element <${root.localName}>)`);
  }

  const capability = kids(root, "Capability")[0];
  const layers: CapLayer[] = [];
  const top = capability ? kids(capability, "Layer") : [];
  const walk = (el: Element, inherited: Pick<CapLayer, "styles" | "crs" | "bbox">) => {
    const styles = [...inherited.styles, ...kids(el, "Style").map(readStyle)];
    // WMS 1.1.1 may list several space-separated codes in one <SRS>.
    const own = [...kids(el, "CRS"), ...kids(el, "SRS")].flatMap((c) => (c.textContent ?? "").trim().split(/\s+/));
    const crs = [...new Set([...inherited.crs, ...own.filter(Boolean)])];
    const bbox = readBbox(el) ?? inherited.bbox;
    const name = kidText(el, "Name");
    if (name) {
      layers.push({
        name,
        title: kidText(el, "Title"),
        abstract: kidText(el, "Abstract"),
        styles,
        crs,
        bbox,
        dimensions: kids(el, "Dimension").map((d) => ({
          name: d.getAttribute("name") ?? "",
          units: d.getAttribute("units") ?? undefined,
          default: d.getAttribute("default") ?? undefined,
          values: d.textContent?.trim() || undefined,
        })),
      });
    }
    for (const child of kids(el, "Layer")) walk(child, { styles, crs, bbox });
  };
  for (const el of top) walk(el, { styles: [], crs: [] });

  return {
    version: root.getAttribute("version") ?? "",
    title: kidText(kids(root, "Service")[0] ?? root, "Title"),
    layers,
  };
}

function readStyle(el: Element): CapStyle {
  const online = kids(el, "LegendURL")[0]?.getElementsByTagNameNS("*", "OnlineResource")[0];
  return {
    name: kidText(el, "Name") ?? "",
    title: kidText(el, "Title"),
    legendUrl: online?.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? online?.getAttribute("xlink:href") ?? undefined,
  };
}

function readBbox(el: Element): CapLayer["bbox"] {
  const ex = kids(el, "EX_GeographicBoundingBox")[0];
  if (ex) {
    const n = (name: string) => Number(kidText(ex, name));
    return { west: n("westBoundLongitude"), south: n("southBoundLatitude"), east: n("eastBoundLongitude"), north: n("northBoundLatitude") };
  }
  const ll = kids(el, "LatLonBoundingBox")[0];
  if (ll) {
    const n = (name: string) => Number(ll.getAttribute(name));
    return { west: n("minx"), south: n("miny"), east: n("maxx"), north: n("maxy") };
  }
  return undefined;
}

/** Union of the bounding boxes of the given layers. */
export function unionBbox(layers: CapLayer[]): CapLayer["bbox"] {
  const boxes = layers.map((l) => l.bbox).filter((b): b is NonNullable<CapLayer["bbox"]> => !!b);
  if (!boxes.length) return undefined;
  return {
    west: Math.min(...boxes.map((b) => b.west)),
    south: Math.min(...boxes.map((b) => b.south)),
    east: Math.max(...boxes.map((b) => b.east)),
    north: Math.max(...boxes.map((b) => b.north)),
  };
}
