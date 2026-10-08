// Create New: every item and group type as a grid of cards, by category.

import { Fragment, useState } from "react";
import { TypeIcon } from "./TypeIcon";
import { CATEGORIES, categoryOf } from "./terria/type-categories";
import { groupTypes, itemTypes, typeLabel, type ItemType } from "./terria/catalog-ui";

// The plain group, whose members are picked by hand, first; then by label.
const allTypes = [...groupTypes, ...itemTypes].sort(
  (a, b) => Number(b.type === "group") - Number(a.type === "group") || typeLabel(a.type).localeCompare(typeLabel(b.type)),
);

const matches = (t: ItemType, q: string) =>
  [t.type, t.model, typeLabel(t.type)].some((s) => s.toLowerCase().includes(q));

/** "ArcGisFeatureServer group" with line-break points between the words of the name. */
const breakable = (label: string) =>
  label.split(/(?<=[a-z0-9])(?=[A-Z])/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));

export function NewPage({ onCreate }: { onCreate: (type: string) => void }) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const shown = allTypes.filter((t) => matches(t, q));

  return (
    <main className="page wide-page">
      <div className="new-head">
        <h2>Create New</h2>
        <input
          className="input"
          type="search"
          placeholder={`Filter ${allTypes.length} types…`}
          aria-label="Filter types"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {CATEGORIES.map((c) => {
        const types = shown.filter((t) => categoryOf(t.type) === c.id);
        if (!types.length) return null;
        return (
          <section key={c.id} className={`type-category cat-${c.id}`} aria-labelledby={`cat-${c.id}`}>
            <h3 id={`cat-${c.id}`}>
              {c.title} {c.description && <span className="hint">{c.description}</span>}
            </h3>
            <ul className="type-grid">
              {types.map((t) => (
                <li key={t.type}>
                  <button type="button" className="type-card" title={t.model} onClick={() => onCreate(t.type)}>
                    <span className="type-card-icon">
                      <TypeIcon type={t.type} />
                    </span>
                    <span className="type-card-text">
                      <strong>{breakable(typeLabel(t.type))}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {shown.length === 0 && <p className="hint">No types match “{filter}”.</p>}
    </main>
  );
}
