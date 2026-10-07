import { useCallback, useEffect, useMemo, useState } from "react";
import { listWmsConfigs, loadWmsConfig, saveWmsConfig, type WmsConfig, type WmsConfigSummary } from "./api";
import { EditorContext, type EditorContextValue } from "./form/context";
import { fieldId, traitMatches } from "./form/paths";
import { TraitField } from "./form/TraitField";
import { CapabilitiesPanel } from "./form/wmsInputs";
import type { Capabilities } from "./terria/capabilities";
import { isPlainObject, setIn, type JsonObject, type Path } from "./terria/traits";
import { validateItem, type Issue } from "./terria/validate";
import { orderLikeForm, ROOT_CLASS, rootTraits, sections, totalTraitCount, wmsTraits } from "./terria/wms-ui";
import "./App.css";

const STORAGE_KEY = "tlm.wms.draft";
const RECORD_KEY = "tlm.wms.record";

/** The database config the draft was loaded from or last saved to. */
type SavedRecord = Pick<WmsConfig, "id" | "version" | "name">;

function loadStored<T>(key: string, accept: (v: unknown) => v is T, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return accept(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode etc.); the draft just won't persist.
  }
}

const loadDraft = () => orderLikeForm(loadStored<JsonObject>(STORAGE_KEY, isPlainObject, {}));
const loadRecord = () =>
  loadStored<SavedRecord | null>(
    RECORD_KEY,
    (v): v is SavedRecord => isPlainObject(v) && typeof v.id === "string" && typeof v.version === "number",
    null,
  );

const toTerriaJson = (item: JsonObject) => ({ type: "wms", ...item });

const sectionOf = (rootKey: string) => sections.find((s) => s.traits.includes(rootKey))?.id ?? "other";

export default function App() {
  const [item, setItem] = useState<JsonObject>(loadDraft);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [active, setActive] = useState(sections[0].id);
  const [filter, setFilter] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [record, setRecord] = useState<SavedRecord | null>(loadRecord);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ level: "ok" | "error"; text: string } | null>(null);

  useEffect(() => store(STORAGE_KEY, item), [item]);
  useEffect(() => store(RECORD_KEY, record), [record]);

  const update = useCallback((path: Path, value: unknown) => {
    setItem((prev) => orderLikeForm((setIn(prev, path, value) as JsonObject | undefined) ?? {}));
  }, []);

  const setDraftError = useCallback((path: string, message: string | null) => {
    setDraftErrors((prev) => {
      if ((prev[path] ?? null) === message) return prev;
      const next = { ...prev };
      if (message === null) delete next[path];
      else next[path] = message;
      return next;
    });
  }, []);

  const issues = useMemo<Issue[]>(
    () => [
      ...Object.entries(draftErrors).map(([path, message]) => ({ path, level: "error" as const, message })),
      ...validateItem(item),
    ],
    [item, draftErrors],
  );

  const byPath = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of issues) map.set(i.path, [...(map.get(i.path) ?? []), i]);
    return map;
  }, [issues]);

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.length - errorCount;

  const ctx: EditorContextValue = useMemo(
    () => ({
      item,
      update,
      issuesAt: (p) => byPath.get(p) ?? [],
      issuesUnder: (prefix) => issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`)),
      setDraftError,
      capabilities,
      filter: filter.trim(),
      onlySet,
    }),
    [item, update, byPath, issues, setDraftError, capabilities, filter, onlySet],
  );

  const json = JSON.stringify(toTerriaJson(item), null, 2);
  const searching = filter.trim() !== "";
  const visibleSections = searching ? sections : sections.filter((s) => s.id === active);

  const goTo = (issue: Issue) => {
    const root = issue.path.split(".")[0];
    setFilter("");
    setOnlySet(false);
    setActive(sectionOf(root));
    requestAnimationFrame(() => {
      const parts = issue.path.split(".");
      for (let n = parts.length; n > 0; n--) {
        const el = document.getElementById(fieldId(parts.slice(0, n)));
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus?.({ preventScroll: true });
          break;
        }
      }
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the JSON is still selectable in the preview.
    }
  };

  const download = () => {
    const base = String(item.id ?? item.name ?? "wms-item").replace(/[^\w.-]+/g, "-");
    const url = URL.createObjectURL(new Blob([json + "\n"], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${base}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const replaceItem = (next: JsonObject, nextRecord: SavedRecord | null) => {
    setItem(orderLikeForm(next));
    setRecord(nextRecord);
    setDraftErrors({});
    setCapabilities(null);
    setSaveMessage(null);
  };

  const reset = () => {
    if (Object.keys(item).length && !confirm("Clear all fields and start a new WMS item?")) return;
    replaceItem({}, null);
  };

  const save = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await saveWmsConfig(item, record ?? undefined);
      setRecord({ id: saved.id, version: saved.version, name: saved.name });
      setSaveMessage({ level: "ok", text: `Saved version ${saved.version}` });
    } catch (e) {
      setSaveMessage({ level: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <h1>Terria Layer Manager</h1>
            <span>
              {wmsTraits.model} · <code>"type": "wms"</code> ·{" "}
              <a href={wmsTraits.source} target="_blank" rel="noreferrer">
                docs
              </a>
            </span>
          </div>
          <div className="actions">
            <button type="button" className={`status ${errorCount ? "error" : warningCount ? "warning" : "ok"}`} onClick={() => setShowIssues(!showIssues)}>
              {errorCount || warningCount ? `${errorCount} errors · ${warningCount} warnings` : "Valid"}
            </button>
            {saveMessage && <span className={`save-message ${saveMessage.level}`}>{saveMessage.text}</span>}
            <button type="button" className="btn" onClick={() => setOpening(true)}>
              Open
            </button>
            <button type="button" className="btn" onClick={() => setImporting(true)}>
              Import JSON
            </button>
            <button type="button" className="btn" onClick={reset}>
              New
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={saving || errorCount > 0}
              title={errorCount ? "Fix errors before saving" : record ? `Update “${record.name}” in the database` : "Save as a new config in the database"}
              onClick={save}
            >
              {saving ? "Saving…" : record ? "Save" : "Save new"}
            </button>
          </div>
        </header>

        {showIssues && issues.length > 0 && (
          <div className="issue-panel">
            <ul>
              {issues.map((i, n) => (
                <li key={n} className={i.level}>
                  <button type="button" className="link" onClick={() => goTo(i)}>
                    <code>{i.path}</code>
                  </button>{" "}
                  {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="layout">
          <nav className="sidebar" aria-label="Sections">
            <input
              className="input search"
              type="search"
              placeholder={`Search ${totalTraitCount} traits…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="toggle">
              <input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} /> Only show set traits
            </label>
            <select className="input section-select" value={active} onChange={(e) => setActive(e.target.value)} aria-label="Section">
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <ul className="section-list">
              {sections.map((s) => {
                const set = s.traits.filter((t) => item[t] !== undefined).length;
                const errs = issues.filter((i) => i.level === "error" && s.traits.includes(i.path.split(".")[0])).length;
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
                      {errs > 0 && <span className="badge error">{errs}</span>}
                      <span className="badge">{set ? `${set}/${s.traits.length}` : s.traits.length}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <main className="form">
            {visibleSections.map((s) => {
              const traits = rootTraits.filter((t) => s.traits.includes(t.name));
              const shown = traits.filter((t) => traitMatches(t, filter.trim()) && (!onlySet || item[t.name] !== undefined));
              if (searching && shown.length === 0) return null;
              return (
                <section key={s.id} className="section">
                  <h2>{s.title}</h2>
                  {s.id === "basics" && !searching && (
                    <CapabilitiesPanel capabilities={capabilities} onLoaded={setCapabilities} />
                  )}
                  {s.traits.map((name) => {
                    const trait = rootTraits.find((t) => t.name === name)!;
                    return <TraitField key={name} className={ROOT_CLASS} trait={trait} path={[name]} />;
                  })}
                  {shown.length === 0 && <p className="hint">No traits set in this section.</p>}
                </section>
              );
            })}
            {searching && !sections.some((s) => rootTraits.some((t) => s.traits.includes(t.name) && traitMatches(t, filter.trim()))) && (
              <p className="hint">No traits match “{filter}”.</p>
            )}
          </main>

          <aside className="preview">
            <div className="preview-head">
              <strong>Catalog item JSON</strong>
              <div className="actions">
                <button type="button" className="btn small" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="btn small" onClick={download}>
                  Download
                </button>
              </div>
            </div>
            {errorCount > 0 && <p className="issues-inline error">Fix {errorCount} error{errorCount > 1 ? "s" : ""} before using this JSON.</p>}
            <pre className="code-block">{json}</pre>
          </aside>
        </div>

        {importing && (
          <ImportDialog
            onClose={() => setImporting(false)}
            onImport={(obj) => {
              replaceItem(obj, null);
              setImporting(false);
            }}
          />
        )}

        {opening && (
          <OpenDialog
            onClose={() => setOpening(false)}
            onOpen={(config) => {
              if (Object.keys(item).length && !confirm(`Replace the current form with “${config.name}”?`)) return;
              replaceItem(config.item, { id: config.id, version: config.version, name: config.name });
              setOpening(false);
            }}
          />
        )}
      </div>
    </EditorContext.Provider>
  );
}

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (item: JsonObject) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isPlainObject(parsed)) throw new Error("Expected a single catalog item object");
      if (parsed.type !== undefined && parsed.type !== "wms") {
        throw new Error(`This editor only handles "wms" items; got type ${JSON.stringify(parsed.type)}`);
      }
      const { type: _type, ...rest } = parsed;
      void _type;
      onImport(rest);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="import-title">Import catalog item JSON</h2>
        <p className="hint">Paste one WMS catalog item from an init file. This replaces the current form.</p>
        <textarea
          className="input textarea code"
          rows={14}
          autoFocus
          value={text}
          spellCheck={false}
          placeholder='{ "type": "wms", "name": "…", "url": "…", "layers": "…" }'
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="issues-inline error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!text.trim()} onClick={submit}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

function OpenDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (config: WmsConfig) => void }) {
  const [configs, setConfigs] = useState<WmsConfigSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    listWmsConfigs()
      .then(setConfigs)
      .catch((e: Error) => setError(e.message));
  }, []);

  const open = async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      onOpen(await loadWmsConfig(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="open-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="open-title">Open a saved WMS config</h2>
        {!configs && !error && <p className="hint">Loading…</p>}
        {configs?.length === 0 && <p className="hint">No WMS configs saved yet.</p>}
        {configs && configs.length > 0 && (
          <ul className="config-list">
            {configs.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={loadingId !== null} onClick={() => open(c.id)}>
                  <strong>{c.name}</strong>
                  <span className="hint">
                    {c.terriaId && <code>{c.terriaId}</code>} {c.url} · v{c.version} · {new Date(c.updatedAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="issues-inline error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
