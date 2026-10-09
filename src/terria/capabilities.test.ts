import { describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "../test/fetch";
import { capabilitiesUrl, fetchCapabilities, parseCapabilities, unionBbox } from "./capabilities";

const WMS_130 = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink">
  <Service><Title>Ocean colour</Title></Service>
  <Capability>
    <Layer>
      <Title>Root</Title>
      <CRS>EPSG:4326</CRS>
      <CRS>EPSG:3857</CRS>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>-180</westBoundLongitude><eastBoundLongitude>180</eastBoundLongitude>
        <southBoundLatitude>-90</southBoundLatitude><northBoundLatitude>90</northBoundLatitude>
      </EX_GeographicBoundingBox>
      <Style>
        <Name>default</Name><Title>Default</Title>
        <LegendURL><OnlineResource xlink:href="https://example.com/legend.png"/></LegendURL>
      </Style>
      <Layer>
        <Name>chl</Name>
        <Title>Chlorophyll</Title>
        <Abstract>Chlorophyll-a concentration</Abstract>
        <CRS>EPSG:4326</CRS>
        <Style><Name>log</Name></Style>
        <Dimension name="time" units="ISO8601" default="2024-01-01">2024-01-01/2024-12-31/P1D</Dimension>
      </Layer>
      <Layer>
        <Title>Folder</Title>
        <Layer>
          <Name>sst</Name>
          <EX_GeographicBoundingBox>
            <westBoundLongitude>-20</westBoundLongitude><eastBoundLongitude>10</eastBoundLongitude>
            <southBoundLatitude>40</southBoundLatitude><northBoundLatitude>65</northBoundLatitude>
          </EX_GeographicBoundingBox>
        </Layer>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

const WMS_111 = `<?xml version="1.0"?>
<WMT_MS_Capabilities version="1.1.1">
  <Service><Title>Old server</Title></Service>
  <Capability>
    <Layer>
      <SRS>EPSG:4326 EPSG:900913</SRS>
      <LatLonBoundingBox minx="-10" miny="50" maxx="2" maxy="60"/>
      <Layer><Name>roads</Name><Title>Roads</Title></Layer>
    </Layer>
  </Capability>
</WMT_MS_Capabilities>`;

describe("parseCapabilities", () => {
  it("reads WMS 1.3.0 layers with inherited styles, CRS and extents", () => {
    const caps = parseCapabilities(WMS_130);
    expect(caps.version).toBe("1.3.0");
    expect(caps.title).toBe("Ocean colour");
    expect(caps.layers.map((l) => l.name)).toEqual(["chl", "sst"]);

    const [chl, sst] = caps.layers;
    expect(chl).toEqual({
      name: "chl",
      title: "Chlorophyll",
      abstract: "Chlorophyll-a concentration",
      styles: [
        { name: "default", title: "Default", legendUrl: "https://example.com/legend.png" },
        { name: "log", title: undefined, legendUrl: undefined },
      ],
      crs: ["EPSG:4326", "EPSG:3857"],
      bbox: { west: -180, south: -90, east: 180, north: 90 },
      dimensions: [{ name: "time", units: "ISO8601", default: "2024-01-01", values: "2024-01-01/2024-12-31/P1D" }],
    });
    expect(sst.bbox).toEqual({ west: -20, south: 40, east: 10, north: 65 });
    expect(sst.styles.map((s) => s.name)).toEqual(["default"]);
    expect(sst.title).toBeUndefined();
  });

  it("reads WMS 1.1.1 with space-separated SRS and LatLonBoundingBox", () => {
    const caps = parseCapabilities(WMS_111);
    expect(caps.version).toBe("1.1.1");
    expect(caps.layers).toEqual([
      { name: "roads", title: "Roads", abstract: undefined, styles: [], crs: ["EPSG:4326", "EPSG:900913"], bbox: { west: -10, south: 50, east: 2, north: 60 }, dimensions: [] },
    ]);
  });

  it("handles a document with no layers", () => {
    expect(parseCapabilities('<WMS_Capabilities version="1.3.0"/>').layers).toEqual([]);
  });

  it.each([
    ["<not xml", "Response is not valid XML"],
    ["<ServiceExceptionReport><ServiceException>Bad request</ServiceException></ServiceExceptionReport>", "Service exception: Bad request"],
    ["<html><body>Login</body></html>", "Not a WMS capabilities document (root element <html>)"],
  ])("rejects %j", (xml, message) => {
    expect(() => parseCapabilities(xml)).toThrow(message);
  });
});

describe("capabilitiesUrl", () => {
  it("replaces the request parameters, keeping others", () => {
    const url = new URL(capabilitiesUrl("https://example.com/wms?map=ocean&SERVICE=WFS&Request=GetMap&version=1.1.1"));
    expect(url.origin + url.pathname).toBe("https://example.com/wms");
    expect(Object.fromEntries(url.searchParams)).toEqual({ map: "ocean", service: "WMS", request: "GetCapabilities", version: "1.3.0" });
  });

  it("resolves relative URLs against the page", () => {
    expect(capabilitiesUrl("/geoserver/wms")).toBe(`${location.origin}/geoserver/wms?service=WMS&request=GetCapabilities&version=1.3.0`);
  });
});

describe("fetchCapabilities", () => {
  it("fetches and parses", async () => {
    const { calls } = mockFetch({ "GET https://example.com/wms": () => new Response(WMS_111) });
    const caps = await fetchCapabilities("https://example.com/wms");
    expect(caps.layers[0].name).toBe("roads");
    expect(calls[0].url).toContain("request=GetCapabilities");
  });

  it("explains HTTP errors", async () => {
    mockFetch({ "GET https://example.com/wms": () => json({}, 500) });
    await expect(fetchCapabilities("https://example.com/wms")).rejects.toThrow("Server responded 500");
  });

  it("explains network (often CORS) failures", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(fetchCapabilities("https://example.com/wms")).rejects.toThrow(/CORS/);
  });

  it("passes aborts through", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    await expect(fetchCapabilities("https://example.com/wms")).rejects.toThrow("aborted");
  });
});

describe("unionBbox", () => {
  const layer = (bbox?: { west: number; south: number; east: number; north: number }) => ({ name: "", styles: [], crs: [], dimensions: [], bbox });

  it("covers every layer's box", () => {
    expect(unionBbox([layer({ west: 0, south: 0, east: 10, north: 10 }), layer(), layer({ west: -5, south: 2, east: 3, north: 20 })])).toEqual({
      west: -5,
      south: 0,
      east: 10,
      north: 20,
    });
  });

  it("is undefined without boxes", () => {
    expect(unionBbox([layer()])).toBeUndefined();
    expect(unionBbox([])).toBeUndefined();
  });
});
