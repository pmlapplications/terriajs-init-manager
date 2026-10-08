// Landing page: every stored catalog item and group, paged, sorted and filtered on the
// server. The table state is kept for the browser tab, so going to the editor
// and back returns to the same page.

import { useEffect, useState } from "react";
import { listMembers, type MemberListEntry, type MemberListPage, type MemberListQuery, type MemberSortKey } from "./api";
import { Icon } from "./Icon";
import { groupTypes, itemTypes, typeLabel, type ItemType, type MemberKind } from "./terria/catalog-ui";

interface TableState {
  q: string;
  kind: "" | MemberKind; // "" for items and groups
  type: string; // "" for all types
  published: "" | "true" | "false";
  sort: MemberSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

const DEFAULT_STATE: TableState = { q: "", kind: "", type: "", published: "", sort: "updatedAt", dir: "desc", page: 1, pageSize: 25 };
const PAGE_SIZES = [10, 25, 50, 100];
const STATE_KEY = "tlm.catalog.table";
const SEARCH_DELAY_MS = 250;

const COLUMNS: { key: MemberSortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "terriaId", label: "Terria id" },
  { key: "url", label: "URL" },
  { key: "isPublished", label: "Published" },
  { key: "version", label: "Version" },
  { key: "updatedAt", label: "Updated" },
  { key: "updatedBy", label: "Updated by" },
];

// Columns that read best largest/newest first when first clicked.
const DESCENDING_FIRST = new Set<MemberSortKey>(["updatedAt", "version", "isPublished"]);

const byLabel = (types: ItemType[]) => [...types].sort((a, b) => typeLabel(a.type).localeCompare(typeLabel(b.type)));
const typeOptions = { item: byLabel(itemTypes), group: byLabel(groupTypes) };

function loadState(): TableState {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_STATE;
  }
}

function storeState(state: TableState) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable; the table just starts fresh next time.
  }
}

export function CatalogPage({
  onOpen,
  onDuplicate,
}: {
  onOpen: (member: MemberListEntry) => void;
  onDuplicate: (member: MemberListEntry) => void;
}) {
  const [state, setState] = useState(loadState);
  // The search box updates immediately; `state.q` follows after a pause in typing.
  const [search, setSearch] = useState(state.q);
  const [result, setResult] = useState<MemberListPage | null>(null);
  // The table state the last response (or error) was for; anything else is still loading.
  const [settled, setSettled] = useState<TableState | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Changes filters or sorting and goes back to the first page. */
  const refine = (changes: Partial<TableState>) => setState((s) => ({ ...s, ...changes, page: 1 }));

  useEffect(() => {
    if (search === state.q) return;
    const timer = setTimeout(() => setState((s) => ({ ...s, q: search, page: 1 })), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, state.q]);

  useEffect(() => {
    storeState(state);
    const query: MemberListQuery = {
      q: state.q,
      kind: state.kind || undefined,
      types: state.type ? [state.type] : undefined,
      published: state.published === "" ? undefined : state.published === "true",
      sort: state.sort,
      dir: state.dir,
      page: state.page,
      pageSize: state.pageSize,
    };
    const abort = new AbortController();
    listMembers(query, abort.signal).then(
      (page) => {
        setResult(page);
        setError(null);
        setSettled(state);
        // Past the end, e.g. after items were deleted elsewhere.
        const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
        if (state.page > lastPage) setState((s) => ({ ...s, page: lastPage }));
      },
      (e: Error) => {
        if (abort.signal.aborted) return;
        setError(e.message);
        setSettled(state);
      },
    );
    return () => abort.abort();
  }, [state]);

  const loading = settled !== state;

  const sortBy = (key: MemberSortKey) =>
    refine(
      state.sort === key
        ? { dir: state.dir === "asc" ? "desc" : "asc" }
        : { sort: key, dir: DESCENDING_FIRST.has(key) ? "desc" : "asc" },
    );

  const filtered = state.q !== "" || state.kind !== "" || state.type !== "" || state.published !== "";
  const clearFilters = () => {
    setSearch("");
    refine({ q: "", kind: "", type: "", published: "" });
  };

  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const first = total ? (state.page - 1) * state.pageSize + 1 : 0;
  const last = Math.min(total, state.page * state.pageSize);
  const goTo = (page: number) => setState((s) => ({ ...s, page: Math.min(Math.max(1, page), pageCount) }));

  return (
    <main className="page wide-page">
      <section className="section">
        <h2>Catalog items and groups</h2>

        <div className="table-filters">
          <input
            className="input"
            type="search"
            placeholder="Search name, id, URL or description…"
            aria-label="Search catalog items and groups"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input"
            aria-label="Kind"
            value={state.kind}
            onChange={(e) => {
              const kind = e.target.value as TableState["kind"];
              // Drop a type filter that the new kind excludes.
              const keepType = !kind || typeOptions[kind].some((t) => t.type === state.type);
              refine({ kind, type: keepType ? state.type : "" });
            }}
          >
            <option value="">Items and groups</option>
            <option value="item">Items only</option>
            <option value="group">Groups only</option>
          </select>
          <select className="input" aria-label="Type" value={state.type} onChange={(e) => refine({ type: e.target.value })}>
            <option value="">All types</option>
            {(["item", "group"] as const)
              .filter((kind) => !state.kind || state.kind === kind)
              .map((kind) => (
                <optgroup key={kind} label={kind === "item" ? "Items" : "Groups"}>
                  {typeOptions[kind].map((t) => (
                    <option key={t.type} value={t.type}>
                      {typeLabel(t.type)} ({t.type})
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          <select
            className="input"
            aria-label="Published"
            value={state.published}
            onChange={(e) => refine({ published: e.target.value as TableState["published"] })}
          >
            <option value="">Published and unpublished</option>
            <option value="true">Published only</option>
            <option value="false">Unpublished only</option>
          </select>
          {filtered && (
            <button type="button" className="btn small" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {error && <p className="issues-inline error">{error}</p>}
        {!result && !error && <p className="hint">Loading…</p>}

        {result && (
          <>
            <div className={`table-wrap${loading ? " loading" : ""}`} aria-busy={loading}>
              <table className="table catalog-table">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => {
                      const active = state.sort === c.key;
                      return (
                        <th key={c.key} aria-sort={active ? (state.dir === "asc" ? "ascending" : "descending") : undefined}>
                          <button type="button" className="sort-button" onClick={() => sortBy(c.key)}>
                            {c.label}
                            <span className="sort-indicator" aria-hidden="true">
                              {active ? (state.dir === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button type="button" className="link" title="Open in the editor" onClick={() => onOpen(item)}>
                          {item.name}
                        </button>
                        {item.description && <div className="hint row-description">{item.description}</div>}
                      </td>
                      <td>
                        <code>{item.type}</code>
                        {item.memberCount !== null && (
                          <div className="hint">
                            {item.memberCount} member{item.memberCount === 1 ? "" : "s"}
                          </div>
                        )}
                      </td>
                      <td>{item.terriaId && <code>{item.terriaId}</code>}</td>
                      <td className="url-cell">{item.url}</td>
                      <td>{item.isPublished ? "Yes" : "No"}</td>
                      <td>{item.version}</td>
                      <td title={new Date(item.updatedAt).toLocaleString()}>{new Date(item.updatedAt).toLocaleDateString()}</td>
                      <td>{item.updatedBy}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Duplicate: open a copy in the editor to save as a new config"
                          aria-label={`Duplicate ${item.name}`}
                          onClick={() => onDuplicate(item)}
                        >
                          <Icon name="copy" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {result.items.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="hint empty-row">
                        {filtered ? "Nothing matches these filters." : "No catalog items or groups saved yet. Use Create New to add one."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span className="hint">
                {total ? `${first}–${last} of ${total}` : "No results"}
              </span>
              <label className="page-size">
                Rows per page{" "}
                <select
                  className="input"
                  value={state.pageSize}
                  onChange={(e) => refine({ pageSize: Number(e.target.value) })}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="actions">
                <button type="button" className="btn small" disabled={state.page <= 1} onClick={() => goTo(1)} aria-label="First page">
                  «
                </button>
                <button type="button" className="btn small" disabled={state.page <= 1} onClick={() => goTo(state.page - 1)} aria-label="Previous page">
                  ‹
                </button>
                <span>
                  Page {state.page} of {pageCount}
                </span>
                <button type="button" className="btn small" disabled={state.page >= pageCount} onClick={() => goTo(state.page + 1)} aria-label="Next page">
                  ›
                </button>
                <button type="button" className="btn small" disabled={state.page >= pageCount} onClick={() => goTo(pageCount)} aria-label="Last page">
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
