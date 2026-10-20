import { describe, expect, it, vi } from "vitest";
import type { MemberRef } from "./api";
import {
  clearDraft,
  hasDraft,
  hasUnsavedChanges,
  isUnsaved,
  loadDraft,
  loadDraftMembers,
  loadRecord,
  saveDraft,
  saveDraftMembers,
  saveRecord,
  saveSnapshot,
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

describe("unsaved changes", () => {
  it("treats an empty form as having nothing to lose", () => {
    expect(isUnsaved("wms", {}, [])).toBe(false);
    expect(hasUnsavedChanges("wms")).toBe(false);
  });

  it("treats a form that was never saved as unsaved", () => {
    expect(isUnsaved("wms", { name: "A" }, [])).toBe(true);
  });

  it("compares with the form as last loaded or saved, ignoring key order", () => {
    saveSnapshot("group", { name: "A", info: [{ name: "x", content: "y" }] }, [member]);
    expect(isUnsaved("group", { info: [{ content: "y", name: "x" }], name: "A" }, [member])).toBe(false);
    expect(isUnsaved("group", { name: "B", info: [{ name: "x", content: "y" }] }, [member])).toBe(true);
    expect(isUnsaved("group", { name: "A", info: [{ name: "x", content: "y" }] }, [])).toBe(true);
  });

  it("checks the draft kept in the browser, and forgets the snapshot with it", () => {
    saveDraft("wms", { name: "A" });
    saveSnapshot("wms", { name: "A" });
    expect(hasUnsavedChanges("wms")).toBe(false);
    saveDraft("wms", { name: "A", opacity: 0.5 });
    expect(hasUnsavedChanges("wms")).toBe(true);
    saveSnapshot("wms", null);
    saveDraft("wms", { name: "A" });
    expect(hasUnsavedChanges("wms")).toBe(true);
    saveSnapshot("wms", { name: "A" });
    clearDraft("wms");
    saveDraft("wms", { name: "A" });
    expect(hasUnsavedChanges("wms")).toBe(true);
  });
});
