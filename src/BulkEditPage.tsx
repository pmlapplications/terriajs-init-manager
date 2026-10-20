// Sets the same traits on several stored configs of one type. The form starts
// empty and leaves out traits that must be unique; each trait filled in
// replaces that trait's whole value on every selected config when applied, and
// other traits are left as they are. Each field links to the values the
// selected configs have now.

import { useCallback, useEffect, useMemo, useState } from "react";
import { bulkUpdateConfigs, loadConfig, UNIQUE_TRAITS, type ItemConfig } from "./api";
import { confirmDialog } from "./dialogs";
import { EditorContext, type EditorContextValue } from "./form/context";
import { traitMatches } from "./form/paths";
import { TraitField } from "./form/TraitField";
import { kindOf, loadModel, orderLikeForm, typeLabel, type CatalogModel } from "./terria/catalog-ui";
import { setIn, type JsonObject, type Path } from "./terria/traits";
import { validateItem, type Issue } from "./terria/validate";

export function BulkEditPage({ type, ids }: { type: string; ids: string[] }) {
  const [model, setModel] = useState<CatalogModel | null>(null);
  const [configs, setConfigs] = useState<ItemConfig[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadConfigs = useCallback(() => {
    const kind = kindOf(type);
    return Promise.all(ids.map((id) => loadConfig(kind, type, id))).then(setConfigs);
  }, [type, ids]);

  useEffect(() => {
    let live = true;
    Promise.all([loadModel(type), reloadConfigs()]).then(
      ([m]) => live && setModel(m),
      (e: Error) => live && setLoadError(e.message),
    );
    return () => {
      live = false;
    };
  }, [type, reloadConfigs]);

  if (loadError) return <p className="issues-inline error page-message">{loadError}</p>;
  if (!model || !configs) return <p className="hint page-message">Loading…</p>;
  return <BulkEditor model={model} configs={configs} onApplied={reloadConfigs} />;
}

function BulkEditor({ model, configs, onApplied }: { model: CatalogModel; configs: ItemConfig[]; onApplied: () => Promise<void> }) {
  const [changes, setChanges] = useState<JsonObject>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(model.sections[0].id);
  const [viewing, setViewing] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ level: "ok" | "error"; text: string } | null>(null);

  const noun = `${typeLabel(model.type)} ${model.kind}${configs.length === 1 ? "" : "s"}`;
  const traits = model.rootTraits.filter((t) => !UNIQUE_TRAITS.includes(t.name));
  const sections = model.sections
    .map((s) => ({ ...s, traits: s.traits.filter((name) => traits.some((t) => t.name === name)) }))
    .filter((s) => s.traits.length > 0);

  const update = useCallback(
    (path: Path, value: unknown) => setChanges((prev) => orderLikeForm(model, (setIn(prev, path, value) as JsonObject | undefined) ?? {})),
    [model],
  );

  const setDraftError = useCallback((path: string, text: string | null) => {
    setDraftErrors((prev) => {
      if ((prev[path] ?? null) === text) return prev;
      const next = { ...prev };
      if (text === null) delete next[path];
      else next[path] = text;
      return next;
    });
  }, []);

  // Traits left empty aren't changed, so only issues with traits being set count.
  const issues = useMemo<Issue[]>(
    () => [
      ...Object.entries(draftErrors).map(([path, text]) => ({ path, level: "error" as const, message: text })),
      ...validateItem(model, changes).filter((i) => changes[i.path.split(".")[0]] !== undefined),
    ],
    [model, changes, draftErrors],
  );
  const errorCount = issues.filter((i) => i.level === "error").length;
  const changed = Object.keys(changes);

  const ctx: EditorContextValue = useMemo(
    () => ({
      model,
      item: changes,
      update,
      issuesAt: (p) => issues.filter((i) => i.path === p),
      issuesUnder: (prefix) => issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`)),
      setDraftError,
      capabilities: null,
      filter: filter.trim(),
      onlySet: false,
      fieldNote: (path) => {
        if (path.length !== 1) return null;
        const name = String(path[0]);
        const count = configs.filter((c) => c.item[name] !== undefined).length;
        if (!count) return <span className="bulk-note hint">not set on any</span>;
        return (
          <button
            type="button"
            className="link bulk-note"
            aria-label={`Current values of ${name}: set on ${count} of ${configs.length}`}
            onClick={() => setViewing(name)}
          >
            set on {count} of {configs.length}
          </button>
        );
      },
    }),
    [model, changes, update, issues, setDraftError, filter, configs],
  );

  const apply = async () => {
    const ok = await confirmDialog({
      title: `Update ${configs.length} ${noun}?`,
      message: `Set ${changed.join(", ")} on ${configs.length} ${noun}? Each one's current value for ${changed.length === 1 ? "this trait" : "these traits"} is replaced; other traits are kept.`,
      confirmLabel: "Apply",
    });
    if (!ok) return;
    setApplying(true);
    setMessage(null);
    try {
      await bulkUpdateConfigs(model.kind, model.type, configs.map((c) => c.id), changes);
      await onApplied();
      setChanges({});
      setDraftErrors({});
      setMessage({ level: "ok", text: `Updated ${configs.length} ${noun}` });
    } catch (e) {
      setMessage({ level: "error", text: (e as Error).message });
    } finally {
      setApplying(false);
    }
  };

  const searching = filter.trim() !== "";
  const visibleSections = searching ? sections : sections.filter((s) => s.id === active);
  const viewingTrait = viewing === null ? null : traits.find((t) => t.name === viewing);

  return (
    <EditorContext.Provider value={ctx}>
      <div className="app bulk-editor">
        <header className="topbar">
          <div className="brand">
            <h1>
              Edit {configs.length} {noun}
            </h1>
            <span title={configs.map((c) => c.name).join("\n")}>{configs.map((c) => c.name).join(", ")}</span>
          </div>
          <div className="actions">
            {message && <span className={`save-message ${message.level}`}>{message.text}</span>}
            <a className="btn" href="#/">
              Back to catalogue
            </a>
            <button
              type="button"
              className="btn primary"
              disabled={applying || !changed.length || errorCount > 0}
              title={!changed.length ? "Fill in the traits to set first" : errorCount ? "Fix errors before applying" : undefined}
              onClick={apply}
            >
              {applying ? "Applying…" : `Apply to ${configs.length} ${noun}`}
            </button>
          </div>
        </header>

        <div className="layout">
          <nav className="sidebar" aria-label="Sections">
            <input
              className="input search"
              type="search"
              placeholder={`Search ${traits.length} traits…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select className="input section-select" value={active} onChange={(e) => setActive(e.target.value)} aria-label="Section">
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <ul className="section-list">
              {sections.map((s) => {
                const set = s.traits.filter((t) => changes[t] !== undefined).length;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={!searching && active === s.id ? "active" : undefined}
                      onClick={() => {
                        setFilter("");
                        setActive(s.id);
                      }}
                    >
                      <span>{s.title}</span>
                      <span className="badge">{set ? `${set}/${s.traits.length}` : s.traits.length}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <main className="form">
            <p className="hint bulk-intro">
              Fill in only the traits to change. Each one replaces that trait's whole value on every selected {model.kind}; traits left
              empty are kept as they are. {UNIQUE_TRAITS.join(" and ")} must be unique, so aren't shown.
            </p>
            {visibleSections.map((s) => {
              const shown = s.traits.filter((name) => traitMatches(model, traits.find((t) => t.name === name)!, filter.trim()));
              if (searching && !shown.length) return null;
              return (
                <section key={s.id} className="section">
                  <h2>{s.title}</h2>
                  {s.traits.map((name) => (
                    <TraitField key={name} className={model.rootClass} trait={traits.find((t) => t.name === name)!} path={[name]} />
                  ))}
                </section>
              );
            })}
            {searching && !sections.some((s) => s.traits.some((name) => traitMatches(model, traits.find((t) => t.name === name)!, filter.trim()))) && (
              <p className="hint">No traits match “{filter}”.</p>
            )}
          </main>

          <aside className="preview">
            <div className="preview-head">
              <strong>Changes</strong>
            </div>
            {errorCount > 0 && <p className="issues-inline error">Fix {errorCount} error{errorCount > 1 ? "s" : ""} before applying.</p>}
            {changed.length ? <pre className="code-block">{JSON.stringify(changes, null, 2)}</pre> : <p className="hint">No traits set yet.</p>}
          </aside>
        </div>

        {viewingTrait && <ValuesDialog trait={viewingTrait.name} configs={configs} onClose={() => setViewing(null)} />}
      </div>
    </EditorContext.Provider>
  );
}

/** Each selected config's current value for one trait. */
function ValuesDialog({ trait, configs, onClose }: { trait: string; configs: ItemConfig[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="values-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="values-title">
          Current values of <code>{trait}</code>
        </h2>
        <table className="table values-table">
          <tbody>
            {configs.map((c) => {
              const value = c.item[trait];
              return (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td>
                    {value === undefined ? (
                      <span className="hint">not set</span>
                    ) : typeof value === "string" ? (
                      value
                    ) : (
                      <pre className="code-block">{JSON.stringify(value, null, 2)}</pre>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="modal-actions">
          <button type="button" className="btn" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
