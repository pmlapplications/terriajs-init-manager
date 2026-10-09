import { describe, expect, it, vi } from "vitest";
import type { MemberRef } from "./api";
import {
  clearDraft,
  hasDraft,
  loadDraft,
  loadDraftMembers,
  loadRecord,
  saveDraft,
  saveDraftMembers,
  saveRecord,
} from "./drafts";

const member: MemberRef = { id: "m1", type: "wms", kind: "item", terriaId: null, name: "Layer" };

describe("drafts", () => {
  it("starts empty", () => {
    expect(loadDraft("wms")).toEqual({});
    expect(loadRecord("wms")).toBeNull();
    expect(loadDraftMembers("wms")).toEqual([]);
    expect(hasDraft("wms")).toBe(false);
  });

  it("keeps a draft, record and members per type", () => {
    saveDraft("wms", { name: "A" });
    saveRecord("wms", { id: "r1", version: 3, name: "A" });
    saveDraftMembers("group", [member]);
    expect(loadDraft("wms")).toEqual({ name: "A" });
    expect(loadRecord("wms")).toEqual({ id: "r1", version: 3, name: "A" });
    expect(loadDraft("csv")).toEqual({});
    expect(loadDraftMembers("group")).toEqual([member]);
    expect(hasDraft("wms")).toBe(true);
    expect(hasDraft("group")).toBe(true);
    expect(localStorage.getItem("tlm.wms.draft")).toBe('{"name":"A"}');
  });

  it("clears everything for a type", () => {
    saveDraft("wms", { name: "A" });
    saveRecord("wms", { id: "r1", version: 1, name: "A" });
    saveDraftMembers("wms", [member]);
    clearDraft("wms");
    expect(hasDraft("wms")).toBe(false);
    expect(loadRecord("wms")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("removes the stored members when the list empties, and the record when null", () => {
    saveDraftMembers("group", [member]);
    saveDraftMembers("group", []);
    saveRecord("group", { id: "r", version: 1, name: "G" });
    saveRecord("group", null);
    expect(localStorage.length).toBe(0);
  });

  it("ignores corrupt or wrongly shaped storage", () => {
    localStorage.setItem("tlm.wms.draft", "{not json");
    localStorage.setItem("tlm.wms.record", JSON.stringify({ id: 5, version: "1" }));
    localStorage.setItem("tlm.wms.members", JSON.stringify([{ id: "x" }]));
    expect(loadDraft("wms")).toEqual({});
    expect(loadRecord("wms")).toBeNull();
    expect(loadDraftMembers("wms")).toEqual([]);
    localStorage.setItem("tlm.csv.draft", "[1,2]");
    expect(loadDraft("csv")).toEqual({});
  });

  it("carries on when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => saveDraft("wms", { name: "A" })).not.toThrow();
    expect(loadDraft("wms")).toEqual({});
  });
});
