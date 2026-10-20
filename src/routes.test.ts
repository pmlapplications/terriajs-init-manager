import { describe, expect, it } from "vitest";
import { bulkEditHash, parseBulkEditHash } from "./routes";

describe("bulk edit hash", () => {
  it("round-trips a type and ids", () => {
    const ids = ["0b6f1c2e-1111-4222-8333-944455556666", "1c7a2d3f-1111-4222-8333-944455556666"];
    expect(parseBulkEditHash(bulkEditHash("wms-group", ids))).toEqual({ type: "wms-group", ids });
  });

  it("ignores other hashes", () => {
    expect(parseBulkEditHash("#/item/wms")).toBeNull();
    expect(parseBulkEditHash("#/bulk/wms/")).toBeNull();
  });
});
