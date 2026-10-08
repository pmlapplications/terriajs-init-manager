// A group's members: the ordered list in the group, and a searchable list of
// stored items and groups to add from, limited to the types the group type may
// contain (group_member_type in the database).
//
// MemberList and MemberSearch are also used on their own, e.g. for an init
// file's catalog and workbench.

import { useEffect, useState, type ReactNode } from "react";
import { listMembers, listMemberTypes, type MemberListPage, type MemberListQuery, type MemberRef } from "./api";
import { kindOf, typeLabel } from "./terria/catalog-ui";

const PAGE_SIZE = 15;
const SEARCH_DELAY_MS = 250;

interface Search {
  q: string;
  type: string; // "" for every allowed type
  page: number;
}

export function MembersPanel({
  groupType,
  members,
  onChange,
  groupId,
}: {
  groupType: string;
  members: MemberRef[];
  onChange: (members: MemberRef[]) => void;
  /** Database id of the group being edited, so it isn't offered as its own member. */
  groupId: string | null;
}) {
  const [allowedTypes, setAllowedTypes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listMemberTypes(groupType).then(
      (types) => live && setAllowedTypes(types),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [groupType]);

  const allowed = allowedTypes && new Set(allowedTypes);
  // Groups first, then items, each by label.
  const typeChoices = [...(allowedTypes ?? [])].sort(
    (a, b) => Number(kindOf(b) === "group") - Number(kindOf(a) === "group") || typeLabel(a).localeCompare(typeLabel(b)),
  );

  return (
    <div className="members-panel">
      <div>
        <h3>
          In this group <span className="badge">{members.length}</span>
        </h3>
        <MemberList
          members={members}
          onChange={onChange}
          empty="No members yet. Search for items or groups to add."
          badge={(m) => allowed && !allowed.has(m.type) && <span className="badge error">Not allowed here</span>}
        />
        {members.length > 1 && <p className="hint">Terria shows members in this order unless the group sets sortMembersBy.</p>}
        {allowed && members.some((m) => !allowed.has(m.type)) && (
          <p className="issues-inline error">Remove the members marked “Not allowed here” before saving.</p>
        )}
      </div>

      <div>
        <h3>Add members</h3>
        {allowedTypes && (
          <p className="hint">
            {allowedTypes.length === 0
              ? `A ${typeLabel(groupType)} can't contain other catalog members.`
              : groupType === "group"
                ? "A group can contain any item or group."
                : `A ${typeLabel(groupType)} can contain: ${typeChoices.map(typeLabel).join(", ")}.`}
          </p>
        )}
        {error && <p className="issues-inline error">{error}</p>}
        <MemberSearch
          query={{ memberOf: groupType }}
          typeChoices={typeChoices}
          added={members}
          onAdd={(added) => onChange([...members, ...added])}
          exclude={groupId ? { id: groupId, label: "This group", reason: "A group can't contain itself" } : undefined}
          label="Search items and groups to add"
          empty="Nothing of an allowed type saved yet."
        />
      </div>
    </div>
  );
}

/** An ordered list of members with move and remove buttons. */
export function MemberList({
  members,
  onChange,
  empty,
  badge,
}: {
  members: MemberRef[];
  onChange: (members: MemberRef[]) => void;
  /** Shown when the list is empty. */
  empty: string;
  /** Extra marker shown after a member's name. */
  badge?: (member: MemberRef) => ReactNode;
}) {
  const remove = (id: string) => onChange(members.filter((m) => m.id !== id));
  const move = (from: number, to: number) => {
    const next = [...members];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };

  if (members.length === 0) return <p className="hint">{empty}</p>;
  return (
    <ol className="member-list">
      {members.map((m, i) => (
        <li key={m.id}>
          <MemberLabel member={m} />
          {badge?.(m)}
          <span className="member-actions">
            <button type="button" className="btn small" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${m.name} up`}>
              ↑
            </button>
            <button
              type="button"
              className="btn small"
              disabled={i === members.length - 1}
              onClick={() => move(i, i + 1)}
              aria-label={`Move ${m.name} down`}
            >
              ↓
            </button>
            <button type="button" className="btn small danger" onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`}>
              Remove
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A paged search of stored items and groups, each with an Add button. */
export function MemberSearch({
  query,
  typeChoices,
  added,
  onAdd,
  exclude,
  label,
  empty,
}: {
  /** Fixed filters, e.g. { kind: "group" } or { memberOf: "wms-group" }. */
  query: Pick<MemberListQuery, "kind" | "memberOf" | "within">;
  /** Types offered in the type filter; it is hidden for one type or fewer. */
  typeChoices: string[];
  /** Members already chosen, shown as "Added". */
  added: MemberRef[];
  onAdd: (members: MemberRef[]) => void;
  /** A member that can't be added, e.g. the group being edited. */
  exclude?: { id: string; label: string; reason: string };
  label: string;
  /** Shown when there is nothing to list and no search text. */
  empty: string;
}) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState<Search>({ q: "", type: "", page: 1 });
  const [result, setResult] = useState<MemberListPage | null>(null);
  const [settled, setSettled] = useState<Search | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { kind, memberOf } = query;
  // Compared as a string so a new array with the same ids doesn't refetch.
  const within = query.within?.join(",");

  useEffect(() => {
    if (text === search.q) return;
    const timer = setTimeout(() => setSearch((s) => ({ ...s, q: text, page: 1 })), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, search.q]);

  useEffect(() => {
    const abort = new AbortController();
    listMembers(
      {
        q: search.q,
        kind,
        memberOf,
        within: within === undefined ? undefined : within.split(",").filter(Boolean),
        types: search.type ? [search.type] : undefined,
        sort: "name",
        dir: "asc",
        page: search.page,
        pageSize: PAGE_SIZE,
      },
      abort.signal,
    ).then(
      (page) => {
        setResult(page);
        setError(null);
        setSettled(search);
      },
      (e: Error) => {
        if (abort.signal.aborted) return;
        setError(e.message);
        setSettled(search);
      },
    );
    return () => abort.abort();
  }, [search, kind, memberOf, within]);

  const chosen = new Set(added.map((m) => m.id));
  const pageCount = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const addable = result?.items.filter((m) => !chosen.has(m.id) && m.id !== exclude?.id) ?? [];

  return (
    <>
      <div className="table-filters">
        <input
          className="input"
          type="search"
          placeholder="Search name, id, URL or description…"
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {typeChoices.length > 1 && (
          <select
            className="input"
            aria-label="Type"
            value={search.type}
            onChange={(e) => setSearch((s) => ({ ...s, type: e.target.value, page: 1 }))}
          >
            <option value="">All allowed types</option>
            {typeChoices.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)} ({t})
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="issues-inline error">{error}</p>}
      {!result && !error && <p className="hint">Loading…</p>}
      {result && (
        <div className={settled !== search ? "loading" : undefined} aria-busy={settled !== search}>
          {result.items.length === 0 ? (
            <p className="hint">{search.q ? `Nothing matches “${search.q}”.` : empty}</p>
          ) : (
            <ul className="member-list">
              {result.items.map((m) => {
                const isAdded = chosen.has(m.id);
                const excluded = m.id === exclude?.id;
                return (
                  <li key={m.id}>
                    <MemberLabel member={m} />
                    <button
                      type="button"
                      className="btn small"
                      disabled={isAdded || excluded}
                      title={excluded ? exclude.reason : undefined}
                      onClick={() => onAdd([toRef(m)])}
                    >
                      {isAdded ? "Added" : excluded ? exclude.label : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="pagination">
            <span className="hint">{result.total ? `${result.total} found` : ""}</span>
            {addable.length > 1 && (
              <button type="button" className="btn small" onClick={() => onAdd(addable.map(toRef))}>
                Add all {addable.length} shown
              </button>
            )}
            <div className="actions">
              <button
                type="button"
                className="btn small"
                disabled={search.page <= 1}
                onClick={() => setSearch((s) => ({ ...s, page: s.page - 1 }))}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span>
                {search.page} / {pageCount}
              </span>
              <button
                type="button"
                className="btn small"
                disabled={search.page >= pageCount}
                onClick={() => setSearch((s) => ({ ...s, page: s.page + 1 }))}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const toRef = ({ id, type, kind, terriaId, name }: MemberRef): MemberRef => ({ id, type, kind, terriaId, name });

function MemberLabel({ member }: { member: MemberRef }) {
  return (
    <span className="member-label">
      <strong>{member.name}</strong>
      <span className="hint">
        {typeLabel(member.type)} <code>{member.type}</code>
        {member.terriaId && (
          <>
            {" "}
            · <code>{member.terriaId}</code>
          </>
        )}
      </span>
    </span>
  );
}
