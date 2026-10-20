import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { listConfigs, loadConfig, saveConfig, type ItemConfig, type ItemConfigSummary, type MemberRef } from "./api";
import { confirmDialog } from "./dialogs";
import { EditorContext, type EditorContextValue } from "./form/context";
import { fieldId, traitMatches } from "./form/paths";
import { TraitField } from "./form/TraitField";
import { CapabilitiesPanel } from "./form/wmsInputs";
import type { Capabilities } from "./terria/capabilities";
import { isPlainObject, setIn, type JsonObject, type Path } from "./terria/traits";
import { loadDraft, loadDraftMembers, loadRecord, saveDraft, saveDraftMembers, saveRecord, type SavedRecord } from "./drafts";
import { MembersPanel } from "./MembersPanel";
import { validateItem, type Issue } from "./terria/validate";
import { orderLikeForm, type CatalogModel, type MemberKind } from "./terria/catalog-ui";
import "./App.css";

// Sidebar entry for a group's member list, shown after Basics.
const MEMBERS_SECTION = "members";

/** Editor for one catalog item or group type. Remount (change `key`) to switch type or reload the draft. */
export default function App({ model }: { model: CatalogModel }) {
  const { sections, rootTraits } = model;
  const isGroup = model.kind === "group";
  const [item, setItem] = useState<JsonObject>(() => orderLikeForm(model, loadDraft(model.type)));
  const [members, setMembers] = useState<MemberRef[]>(() => (isGroup ? loadDraftMembers(model.type) : []));
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [active, setActive] = useState(sections[0].id);
  const [filter, setFilter] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [record, setRecord] = useState<SavedRecord | null>(() => loadRecord(model.type));
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ level: "ok" | "error"; text: string } | null>(null);

  useEffect(() => saveDraft(model.type, item), [model.type, item]);
  useEffect(() => saveRecord(model.type, record), [model.type, record]);
  useEffect(() => saveDraftMembers(model.type, members), [model.type, members]);

  const update = useCallback(
    (path: Path, value: unknown) => {
      setItem((prev) => orderLikeForm(model, (setIn(prev, path, value) as JsonObject | undefined) ?? {}));
    },
    [model],
  );

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
      ...validateItem(model, item),
    ],
    [model, item, draftErrors],
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
      model,
      item,
      update,
      issuesAt: (p) => byPath.get(p) ?? [],
      issuesUnder: (prefix) => issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`)),
      setDraftError,
      capabilities,
      filter: filter.trim(),
      onlySet,
    }),
    [model, item, update, byPath, issues, setDraftError, capabilities, filter, onlySet],
  );

  // Members are shown by id; an exported init file has them in full.
  const memberIds = members.map((m) => m.terriaId ?? m.id);
  const json = JSON.stringify({ type: model.type, ...item, ...(memberIds.length ? { members: memberIds } : {}) }, null, 2);
  const searching = filter.trim() !== "";
  const showingMembers = isGroup && !searching && active === MEMBERS_SECTION;
  const visibleSections = searching ? sections : sections.filter((s) => s.id === active);

  const goTo = (issue: Issue) => {
    const root = issue.path.split(".")[0];
    setFilter("");
    setOnlySet(false);
    setActive(sections.find((s) => s.traits.includes(root))?.id ?? sections[0].id);
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
    const base = String(item.id ?? item.name ?? `${model.type}-item`).replace(/[^\w.-]+/g, "-");
    const url = URL.createObjectURL(new Blob([json + "\n"], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${base}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const replaceItem = (next: JsonObject, nextRecord: SavedRecord | null, nextMembers: MemberRef[] = []) => {
    setItem(orderLikeForm(model, next));
    setMembers(isGroup ? nextMembers : []);
    setRecord(nextRecord);
    setDraftErrors({});
    setCapabilities(null);
    setSaveMessage(null);
  };

  const reset = async () => {
    if (
      (Object.keys(item).length || members.length) &&
      !(await confirmDialog({
        title: `Start a new ${model.kind}?`,
        message: `Clear all fields and start a new ${model.type} ${model.kind}?`,
        confirmLabel: "Clear form",
        danger: true,
      }))
    ) {
      return;
    }
    replaceItem({}, null);
  };

  const save = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await saveConfig(model.kind, model.type, item, isGroup ? members.map((m) => m.id) : undefined, record ?? undefined);
      setRecord({ id: saved.id, version: saved.version, name: saved.name });
      if (isGroup && saved.members) setMembers(saved.members);
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
            <h1>{model.model} Editor</h1>
            <span>
              <code>"type": "{model.type}"</code> ·{" "}
              <a href={model.source} target="_blank" rel="noreferrer">
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
              placeholder={`Search ${model.totalTraitCount} traits…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="toggle">
              <input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} /> Only show set traits
            </label>
            <select className="input section-select" value={active} onChange={(e) => setActive(e.target.value)} aria-label="Section">
              {sections.map((s, i) => (
                <Fragment key={s.id}>
                  <option value={s.id}>{s.title}</option>
                  {i === 0 && isGroup && <option value={MEMBERS_SECTION}>Members ({members.length})</option>}
                </Fragment>
              ))}
            </select>
            <ul className="section-list">
              {sections.map((s, i) => {
                const set = s.traits.filter((t) => item[t] !== undefined).length;
                const errs = issues.filter((i) => i.level === "error" && s.traits.includes(i.path.split(".")[0])).length;
                return (
                  <Fragment key={s.id}>
                    <li>
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
                    {i === 0 && isGroup && (
                      <li>
                        <button
                          type="button"
                          className={showingMembers ? "active" : undefined}
                          onClick={() => {
                            setFilter("");
                            setActive(MEMBERS_SECTION);
                          }}
                        >
                          <span>Members</span>
                          <span className="badge">{members.length}</span>
                        </button>
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ul>
          </nav>

          <main className="form">
            {showingMembers && (
              <section className="section">
                <h2>Members</h2>
                <MembersPanel groupType={model.type} members={members} onChange={setMembers} groupId={record?.id ?? null} />
              </section>
            )}
            {visibleSections.map((s) => {
              const traits = rootTraits.filter((t) => s.traits.includes(t.name));
              const shown = traits.filter((t) => traitMatches(model, t, filter.trim()) && (!onlySet || item[t.name] !== undefined));
              if (searching && shown.length === 0) return null;
              return (
                <section key={s.id} className="section">
                  <h2>{s.title}</h2>
                  {s.id === "basics" && model.type === "wms" && !searching && (
                    <CapabilitiesPanel capabilities={capabilities} onLoaded={setCapabilities} />
                  )}
                  {s.traits.map((name) => {
                    const trait = rootTraits.find((t) => t.name === name)!;
                    return <TraitField key={name} className={model.rootClass} trait={trait} path={[name]} />;
                  })}
                  {shown.length === 0 && <p className="hint">No traits set in this section.</p>}
                </section>
              );
            })}
            {searching && !sections.some((s) => rootTraits.some((t) => s.traits.includes(t.name) && traitMatches(model, t, filter.trim()))) && (
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
            {memberIds.length > 0 && <p className="hint">Members are listed by id here; init files exported from the database include them in full.</p>}
            <pre className="code-block">{json}</pre>
          </aside>
        </div>

        {importing && (
          <ImportDialog
            type={model.type}
            kind={model.kind}
            onClose={() => setImporting(false)}
            onImport={(obj) => {
              replaceItem(obj, null);
              setImporting(false);
            }}
          />
        )}

        {opening && (
          <OpenDialog
            type={model.type}
            kind={model.kind}
            onClose={() => setOpening(false)}
            onOpen={async (config) => {
              if (
                (Object.keys(item).length || members.length) &&
                !(await confirmDialog({ title: "Replace the form?", message: `Replace the current form with “${config.name}”?`, confirmLabel: "Replace" }))
              ) {
                return;
              }
              replaceItem(config.item, { id: config.id, version: config.version, name: config.name }, config.members);
              setOpening(false);
            }}
          />
        )}
      </div>
    </EditorContext.Provider>
  );
}

function ImportDialog({
  type,
  kind,
  onClose,
  onImport,
}: {
  type: string;
  kind: MemberKind;
  onClose: () => void;
  onImport: (item: JsonObject) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isPlainObject(parsed)) throw new Error("Expected a single catalog item object");
      if (parsed.type !== undefined && parsed.type !== type) {
        throw new Error(`This editor only handles "${type}" items; got type ${JSON.stringify(parsed.type)}`);
      }
      // Inline members can't be matched to stored rows; they're picked in the Members section.
      const { type: _type, members: _members, ...rest } = parsed;
      void [_type, _members];
      onImport(rest);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="import-title">Import catalog {kind} JSON</h2>
        <p className="hint">
          Paste one <code>{type}</code> catalog {kind} from an init file. This replaces the current form.
          {kind === "group" && " Its members aren't imported."}
        </p>
        <textarea
          className="input textarea code"
          rows={14}
          autoFocus
          value={text}
          spellCheck={false}
          placeholder={`{ "type": "${type}", "name": "…", "url": "…" }`}
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

function OpenDialog({
  type,
  kind,
  onClose,
  onOpen,
}: {
  type: string;
  kind: MemberKind;
  onClose: () => void;
  onOpen: (config: ItemConfig) => void;
}) {
  const [configs, setConfigs] = useState<ItemConfigSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    listConfigs(kind, type)
      .then(setConfigs)
      .catch((e: Error) => setError(e.message));
  }, [kind, type]);

  const open = async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      onOpen(await loadConfig(kind, type, id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="open-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="open-title">
          Open a saved <code>{type}</code> config
        </h2>
        {!configs && !error && <p className="hint">Loading…</p>}
        {configs?.length === 0 && <p className="hint">
            No <code>{type}</code> configs saved yet.
          </p>}
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
