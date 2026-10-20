// Hash routes shared between pages; Root.tsx parses the rest.

/** The bulk editor for these configs of one type. */
export const bulkEditHash = (type: string, ids: string[]) => `#/bulk/${type}/${ids.join(",")}`;

/** The type and ids of a bulk editor hash, or null for any other hash. */
export function parseBulkEditHash(hash: string): { type: string; ids: string[] } | null {
  const match = /^#\/bulk\/([\w-]+)\/([\w,-]+)$/.exec(hash);
  return match ? { type: match[1], ids: match[2].split(",").filter(Boolean) } : null;
}
