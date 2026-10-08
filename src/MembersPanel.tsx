// A group's members: the ordered list in the group, and a searchable list of
// stored items and groups to add from, limited to the types the group type may
// contain (group_member_type in the database).

import { useEffect, useState } from "react";
import { listMembers, listMemberTypes, type MemberListPage, type MemberRef } from "./api";
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
  const [text, setText] = useState("");
  const [search, setSearch] = useState<Search>({ q: "", type: "", page: 1 });
  const [allowedTypes, setAllowedTypes] = useState<string[] | null>(null);
  const [result, setResult] = useState<MemberListPage | null>(null);
  const [settled, setSettled] = useState<Search | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (text === search.q) return;
    const timer = setTimeout(() => setSearch((s) => ({ ...s, q: text, page: 1 })), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, search.q]);

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

  useEffect(() => {
    const abort = new AbortController();
    listMembers(
      {
        q: search.q,
        memberOf: groupType,
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
  }, [search, groupType]);

  const inGroup = new Set(members.map((m) => m.id));
  const allowed = allowedTypes && new Set(allowedTypes);
  // Groups first, then items, each by label.
  const typeChoices = [...(allowedTypes ?? [])].sort(
    (a, b) => Number(kindOf(b) === "group") - Number(kindOf(a) === "group") || typeLabel(a).localeCompare(typeLabel(b)),
  );
  const add = (m: MemberRef) => onChange([...members, m]);
  const remove = (id: string) => onChange(members.filter((m) => m.id !== id));
  const move = (from: number, to: number) => {
    const next = [...members];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };

  const pageCount = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const addable = result?.items.filter((m) => !inGroup.has(m.id) && m.id !== groupId) ?? [];

  return (
    <div className="members-panel">
      <div>
        <h3>
          In this group <span className="badge">{members.length}</span>
        </h3>
        {members.length === 0 ? (
          <p className="hint">No members yet. Search for items or groups to add.</p>
        ) : (
          <ol className="member-list">
            {members.map((m, i) => (
              <li key={m.id}>
                <MemberLabel member={m} />
                {allowed && !allowed.has(m.type) && <span className="badge error">Not allowed here</span>}
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
        )}
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
        <div className="table-filters">
          <input
            className="input"
            type="search"
            placeholder="Search name, id, URL or description…"
            aria-label="Search items and groups to add"
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
              <p className="hint">{search.q ? `Nothing matches “${search.q}”.` : "Nothing of an allowed type saved yet."}</p>
            ) : (
              <ul className="member-list">
                {result.items.map((m) => {
                  const added = inGroup.has(m.id);
                  const self = m.id === groupId;
                  return (
                    <li key={m.id}>
                      <MemberLabel member={m} />
                      <button
                        type="button"
                        className="btn small"
                        disabled={added || self}
                        title={self ? "A group can't contain itself" : undefined}
                        onClick={() => add(toRef(m))}
                      >
                        {added ? "Added" : self ? "This group" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="pagination">
              <span className="hint">{result.total ? `${result.total} found` : ""}</span>
              {addable.length > 1 && (
                <button type="button" className="btn small" onClick={() => onChange([...members, ...addable.map(toRef)])}>
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
      </div>
    </div>
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
