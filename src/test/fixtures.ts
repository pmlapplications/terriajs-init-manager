// Sample API responses for frontend tests.

import type { InitFile, InitFileOutput, MemberListEntry, MemberRef, User } from "../api";

export const user = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  createdAt: "2026-01-02T03:04:05Z",
  ...overrides,
});

export const memberRef = (overrides: Partial<MemberRef> = {}): MemberRef => ({
  id: "m1",
  type: "wms",
  kind: "item",
  terriaId: null,
  name: "Layer",
  ...overrides,
});

export const memberEntry = (overrides: Partial<MemberListEntry> = {}): MemberListEntry => ({
  id: "m1",
  type: "wms",
  kind: "item",
  terriaId: "sst",
  name: "Sea surface temperature",
  url: "https://example.com/wms",
  description: null,
  isPublished: true,
  version: 1,
  updatedAt: "2026-01-02T03:04:05Z",
  updatedBy: "ada@example.com",
  memberCount: null,
  ...overrides,
});

export const output = (overrides: Partial<InitFileOutput> = {}): InitFileOutput => ({
  path: "/config/ocean.json",
  version: 1,
  writtenAt: "2026-01-02T03:04:05Z",
  writtenBy: "ada@example.com",
  ...overrides,
});

export const initFile = (overrides: Partial<InitFile> = {}): InitFile => ({
  id: "f1",
  slug: "ocean",
  name: "Ocean map",
  description: null,
  catalogCount: 0,
  version: 1,
  updatedAt: "2026-01-02T03:04:05Z",
  updatedBy: "ada@example.com",
  published: null,
  test: null,
  config: { homeCamera: { west: -10, south: 40, east: 10, north: 60 } },
  catalog: [],
  workbench: [],
  ...overrides,
});
