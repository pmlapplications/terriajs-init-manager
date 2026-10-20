// Landing page: every stored catalog item and group, paged, sorted and filtered on the
// server. The table state is kept for the browser tab, so going to the editor
// and back returns to the same page. Members no init file uses can be deleted
// from here, one at a time or by selecting rows on the current page; selected
// rows of one type can be edited together in the bulk editor.

import { useEffect, useState } from "react";
import { confirmDialog } from "./dialogs";
import { loadRecord, saveRecord } from "./drafts";
import { deleteConfig, listMembers, type MemberListEntry, type MemberListPage, type MemberListQuery, type MemberSortKey } from "./api";
import { Icon } from "./Icon";
import { bulkEditHash } from "./routes";
import { groupTypes, itemTypes, typeLabel, type ItemType, type MemberKind } from "./terria/catalog-ui";

interface TableState {
  q: string;
  kind: "" | MemberKind; // "" for items and groups
  type: string; // "" for all types
  published: "" | "true" | "false";
  /** Only members in no group and no init file. */
  orphaned: boolean;
  sort: MemberSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

const DEFAULT_STATE: TableState = {
  q: "",
  kind: "",
  type: "",
  published: "",
  orphaned: false,
  sort: "updatedAt",
  dir: "desc",
  page: 1,
  pageSize: 25,
};
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

/** Members an init file uses can't be deleted. */
const canDelete = (m: MemberListEntry) => m.initFileCount === 0;

const usedByMessage = (m: MemberListEntry) =>
  `Used by ${m.initFileCount} init file${m.initFileCount === 1 ? "" : "s"}; remove it from ${m.initFileCount === 1 ? "that file" : "them"} to delete it`;

/** "2 items and 1 group". */
function countOf(members: MemberListEntry[]) {
  const groups = members.filter((m) => m.kind === "group").length;
  const items = members.length - groups;
  const parts = [];
  if (items) parts.push(`${items} item${items === 1 ? "" : "s"}`);
  if (groups) parts.push(`${groups} group${groups === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

const NO_ROWS: ReadonlySet<string> = new Set();

// The bulk delete confirmation names this many rows, then counts the rest.
const MAX_NAMES_LISTED = 10;

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
  draft = null,
  onOpen,
  onDuplicate,
}: {
  /** The editor form last worked on, if it holds a draft; offered as "Continue Editing". */
  draft?: { type: string; href: string } | null;
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
  const [message, setMessage] = useState<string | null>(null);
  // Bumped to reload the current page, e.g. after a delete.
  const [reload, setReload] = useState(0);
  // Ids of the rows ticked, kept with the table state they were ticked in: a
  // selection only applies to the rows it was made on.
  const [selection, setSelection] = useState<{ state: TableState; ids: ReadonlySet<string> }>({ state, ids: NO_ROWS });
  const selected = selection.state === state ? selection.ids : NO_ROWS;
  const setSelected = (ids: ReadonlySet<string>) => setSelection({ state, ids });
  const [deleting, setDeleting] = useState(false);
  // Rows a bulk delete couldn't delete, with the reason; kept when the page reloads.
  const [failures, setFailures] = useState<string[]>([]);

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
      orphaned: state.orphaned || undefined,
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
  }, [state, reload]);

  const loading = settled !== state;

  const sortBy = (key: MemberSortKey) =>
    refine(
      state.sort === key
        ? { dir: state.dir === "asc" ? "desc" : "asc" }
        : { sort: key, dir: DESCENDING_FIRST.has(key) ? "desc" : "asc" },
    );

  const filtered = state.q !== "" || state.kind !== "" || state.type !== "" || state.published !== "" || state.orphaned;
  const clearFilters = () => {
    setSearch("");
    refine({ q: "", kind: "", type: "", published: "", orphaned: false });
  };

  const remove = async (member: MemberListEntry) => {
    const kept =
      member.kind === "group" && member.memberCount
        ? ` Its ${member.memberCount} member${member.memberCount === 1 ? " is" : "s are"} kept.`
        : "";
    const ok = await confirmDialog({
      title: `Delete this ${member.kind}?`,
      message: `Delete the ${member.kind} “${member.name}”? It is also removed from any groups it is in.${kept}`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setMessage(null);
    setFailures([]);
    try {
      await deleteConfig(member.kind, member.type, member.id);
      // An editor draft loaded from it can only be saved as a new config now.
      if (loadRecord(member.type)?.id === member.id) saveRecord(member.type, null);
      setMessage(`Deleted “${member.name}”`);
      setReload((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const rows = result?.items ?? [];
  const selectedRows = rows.filter((m) => selected.has(m.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const selectedDeletable = selectedRows.filter(canDelete);
  const selectedTypes = new Set(selectedRows.map((m) => m.type));
  const [editType] = selectedTypes.size === 1 ? selectedTypes : [];

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const removeSelected = async () => {
    const targets = selectedDeletable;
    if (!targets.length) return;
    const names = targets.slice(0, MAX_NAMES_LISTED).map((m) => `“${m.name}”`);
    if (targets.length > MAX_NAMES_LISTED) names.push(`and ${targets.length - MAX_NAMES_LISTED} more`);
    const skipped = selectedRows.length - targets.length;
    const skipNote = skipped ? ` ${skipped} selected ${skipped === 1 ? "row is" : "rows are"} used by init files, so ${skipped === 1 ? "is" : "are"} kept.` : "";
    const ok = await confirmDialog({
      title: `Delete ${countOf(targets)}?`,
      message: `Delete ${names.join(", ")}? They are also removed from any groups they are in. Members of deleted groups are kept.${skipNote}`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setMessage(null);
    setFailures([]);
    setDeleting(true);
    const failed: string[] = [];
    const deleted: MemberListEntry[] = [];
    for (const member of targets) {
      try {
        await deleteConfig(member.kind, member.type, member.id);
        if (loadRecord(member.type)?.id === member.id) saveRecord(member.type, null);
        deleted.push(member);
      } catch (e) {
        failed.push(`“${member.name}”: ${(e as Error).message}`);
      }
    }
    setDeleting(false);
    setSelected(NO_ROWS);
    if (deleted.length) setMessage(`Deleted ${countOf(deleted)}`);
    setFailures(failed);
    setReload((r) => r + 1);
  };

  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const first = total ? (state.page - 1) * state.pageSize + 1 : 0;
  const last = Math.min(total, state.page * state.pageSize);
  const goTo = (page: number) => setState((s) => ({ ...s, page: Math.min(Math.max(1, page), pageCount) }));

  return (
    <main className="page wide-page">
      <section className="section">
        <div className="preview-head">
          <h2>Catalogue Groups and Items</h2>
          <div className="actions">
            {draft && (
              <a className="btn" href={draft.href}>
                Continue Editing <b>{typeLabel(draft.type)}</b> form
              </a>
            )}
            <a className="btn primary" href="#/new">
              Create New
            </a>
          </div>
        </div>

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
          <label className="toggle" title="Items and groups that are in no group and no init file">
            <input type="checkbox" checked={state.orphaned} onChange={(e) => refine({ orphaned: e.target.checked })} /> Orphaned only
          </label>
          {filtered && (
            <button type="button" className="btn small" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {selectedRows.length > 0 && (
          <div className="selection-bar" role="region" aria-label="Selected rows">
            <span>{selectedRows.length} selected</span>
            <button
              type="button"
              className="btn small"
              disabled={!editType || deleting}
              title={editType ? `Set traits on the selected ${typeLabel(editType)} ${selectedRows[0].kind}s together` : "Select rows of one type to edit them together"}
              onClick={() => (location.hash = bulkEditHash(editType!, selectedRows.map((m) => m.id)))}
            >
              Edit selected
            </button>
            <button
              type="button"
              className="btn small danger"
              disabled={!selectedDeletable.length || deleting}
              title={selectedDeletable.length ? undefined : "The selected rows are used by init files, so can't be deleted"}
              onClick={removeSelected}
            >
              {deleting ? "Deleting…" : selectedDeletable.length < selectedRows.length && selectedDeletable.length ? `Delete ${selectedDeletable.length} deletable` : "Delete selected"}
            </button>
            <button type="button" className="btn small" disabled={deleting} onClick={() => setSelected(NO_ROWS)}>
              Clear selection
            </button>
          </div>
        )}

        {message && <p className="save-message ok">{message}</p>}
        {error && <p className="issues-inline error">{error}</p>}
        {failures.length > 0 && (
          <div className="issues-inline error">
            Could not delete:
            <ul>
              {failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {!result && !error && <p className="hint">Loading…</p>}

        {result && (
          <>
            <div className={`table-wrap${loading ? " loading" : ""}`} aria-busy={loading}>
              <table className="table catalog-table">
                <thead>
                  <tr>
                    <th className="select-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all rows on this page"
                        title="Select or deselect every row on this page"
                        disabled={!rows.length || deleting}
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedRows.length > 0 && !allSelected;
                        }}
                        onChange={() => setSelected(allSelected ? NO_ROWS : new Set(rows.map((m) => m.id)))}
                      />
                    </th>
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
                    <tr key={item.id} className={selected.has(item.id) ? "selected" : undefined}>
                      <td className="select-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.name}`}
                          disabled={deleting}
                          checked={selected.has(item.id)}
                          onChange={(e) => toggle(item.id, e.target.checked)}
                        />
                      </td>
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
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={!canDelete(item)}
                          title={canDelete(item) ? `Delete this ${item.kind}` : usedByMessage(item)}
                          aria-label={`Delete ${item.name}`}
                          onClick={() => remove(item)}
                        >
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {result.items.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length + 2} className="hint empty-row">
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
