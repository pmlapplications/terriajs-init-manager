// Editor for one Terria init file
// (https://docs.terria.io/guide/customizing/initialization-files/).
//
// The catalog is chosen from stored groups and the workbench from items inside
// them; everything else is the init file's `config`. The common keys have form
// fields, cameras can be set from a map, and anything else (stories, extra
// base maps, keys this page doesn't know) is edited as JSON so it round-trips.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  deleteInitFile,
  exportInitFile,
  initFileDownloadUrl,
  listMembers,
  loadInitFile,
  saveInitFile,
  type InitFileInput,
  setInitFileOutput,
  type InitFile,
  type InitFileOutput,
  type MemberRef,
  type OutputTarget,
} from "./api";
import { CameraMap, type MapCamera, type Rect } from "./CameraMap";
import { confirmDialog } from "./dialogs";
import { SLUG, asRect, baseMapIds, cameraMode, rectProblem, slugify, withKey, without, type CameraMode } from "./init-file";
import { MemberList, MemberSearch } from "./MembersPanel";
import { groupTypes, itemTypes, typeLabel } from "./terria/catalog-ui";
import { isPlainObject, type JsonObject } from "./terria/traits";

/** Top-level keys with their own fields below; the rest go in "Other keys". */
const KNOWN_KEYS = [
  "homeCamera",
  "initialCamera",
  "viewerMode",
  "showSplitter",
  "splitPosition",
  "corsDomains",
  "previewedItemId",
  "baseMaps",
  "settings",
  "stories",
];

const VIEWER_MODES = [
  { value: "3d", label: "3D with terrain (3d)" },
  { value: "3dSmooth", label: "3D smooth, no terrain (3dSmooth)" },
  { value: "2d", label: "2D (2d)" },
];


const HOME_COLOR = "#0b6bcb";
const INITIAL_COLOR = "#d9480f";

interface Draft {
  slug: string;
  name: string;
  description: string;
  config: JsonObject;
  catalog: MemberRef[];
  workbench: MemberRef[];
}

const EMPTY_DRAFT: Draft = { slug: "", name: "", description: "", config: {}, catalog: [], workbench: [] };

const toInput = (d: Draft): InitFileInput => ({
  slug: d.slug.trim(),
  name: d.name.trim(),
  description: d.description.trim() || null,
  config: d.config,
  catalog: d.catalog.map((m) => m.id),
  workbench: d.workbench.map((m) => m.id),
});

export function InitFileEditor({ id }: { id: string | null }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [record, setRecord] = useState<{ id: string; version: number } | null>(null);
  // The input as last loaded or saved, to tell whether there are unsaved changes.
  const [savedInput, setSavedInput] = useState(() => JSON.stringify(toInput(EMPTY_DRAFT)));
  // Bumped on load so JSON boxes, which keep their own text, start over.
  const [generation, setGeneration] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(id !== null);
  const [slugEdited, setSlugEdited] = useState(id !== null);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ level: "ok" | "error"; text: string } | null>(null);
  const [exported, setExported] = useState<JsonObject | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Copies in the server's public config folder, as of the last load, save or toggle.
  const [outputs, setOutputs] = useState<Pick<InitFile, "published" | "test">>({ published: null, test: null });
  const [outputBusy, setOutputBusy] = useState<OutputTarget | null>(null);

  useEffect(() => {
    if (id === null) return;
    let live = true;
    loadInitFile(id).then(
      (file) => {
        if (!live) return;
        const loaded: Draft = {
          slug: file.slug,
          name: file.name,
          description: file.description ?? "",
          config: file.config,
          catalog: file.catalog,
          workbench: file.workbench,
        };
        setDraft(loaded);
        setRecord({ id: file.id, version: file.version });
        setOutputs({ published: file.published, test: file.test });
        setSavedInput(JSON.stringify(toInput(loaded)));
        setGeneration((g) => g + 1);
        setLoading(false);
      },
      (e: Error) => {
        if (!live) return;
        setLoadError(e.message);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  const input = toInput(draft);
  const dirty = JSON.stringify(input) !== savedInput;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const { config } = draft;
  const set = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const setKey = (key: string, value: unknown) => setDraft((d) => ({ ...d, config: withKey(d.config, key, value) }));
  /** Sets a key of an object-valued top-level key, dropping the object when it empties. */
  const setSub = (key: "baseMaps" | "settings", sub: string, value: unknown) =>
    setDraft((d) => {
      const obj = withKey(isPlainObject(d.config[key]) ? d.config[key] : {}, sub, value);
      return { ...d, config: withKey(d.config, key, Object.keys(obj).length ? obj : undefined) };
    });
  const jsonError = (key: string) => (error: string | null) =>
    setJsonErrors((errors) => (error ? { ...errors, [key]: error } : without(errors, [key])));

  const baseMaps = isPlainObject(config.baseMaps) ? config.baseMaps : {};
  const settings = isPlainObject(config.settings) ? config.settings : {};
  const homeRect = asRect(config.homeCamera);
  const initialRect = asRect(config.initialCamera);

  const cameras: MapCamera[] = [
    { key: "home", label: "Home camera", color: HOME_COLOR, rect: homeRect, onSet: (r) => setKey("homeCamera", r) },
    { key: "initial", label: "Initial camera", color: INITIAL_COLOR, rect: initialRect, onSet: (r) => setKey("initialCamera", r) },
  ];

  const problems: string[] = [];
  if (!input.name) problems.push("Name is required.");
  if (!SLUG.test(input.slug)) problems.push("File name must start with a letter or digit and use only letters, digits, “.”, “_” and “-”.");
  if (config.homeCamera === undefined) problems.push("Set a home camera (it is required by Terria).");
  for (const [key, rect] of [["Home camera", homeRect], ["Initial camera", initialRect]] as const) {
    const problem = rect && rectProblem(rect);
    if (problem) problems.push(`${key}: ${problem}.`);
  }
  const split = config.splitPosition;
  if (split !== undefined && (typeof split !== "number" || split < 0 || split > 1)) problems.push("Split position must be between 0 and 1.");
  for (const [key, error] of Object.entries(jsonErrors)) problems.push(`${key}: ${error}`);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveInitFile(input, record ?? undefined);
      const savedDraft = { ...draft, catalog: saved.catalog, workbench: saved.workbench };
      setDraft(savedDraft);
      setRecord({ id: saved.id, version: saved.version });
      setOutputs({ published: saved.published, test: saved.test });
      setSavedInput(JSON.stringify(toInput(savedDraft)));
      setMessage({ level: "ok", text: `Saved version ${saved.version}` });
      if (exported) showExport(saved.id);
      if (!record) history.replaceState(null, "", `#/init-files/${saved.id}`);
    } catch (e) {
      setMessage({ level: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const removed = outputs.test ? ` Its test copy (${outputs.test.path}) is removed;` : "";
    if (!record) return;
    const ok = await confirmDialog({
      title: "Delete this init file?",
      message: `Delete the init file “${draft.name}” (${draft.slug}.json)?${removed} its catalog groups and items are kept.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteInitFile(record.id);
      location.hash = "#/init-files";
    } catch (e) {
      setMessage({ level: "error", text: (e as Error).message });
    }
  };

  const setOutput = async (target: OutputTarget, on: boolean) => {
    if (!record) return;
    const current = outputs[target];
    if (
      !on &&
      target === "published" &&
      !(await confirmDialog({
        title: "Unpublish this init file?",
        message: `Unpublish “${draft.name}”? ${current?.path} is deleted, so maps loading it will stop working.`,
        confirmLabel: "Unpublish",
        danger: true,
      }))
    ) {
      return;
    }
    setOutputBusy(target);
    setMessage(null);
    try {
      const file = await setInitFileOutput(record.id, target, on);
      setOutputs({ published: file.published, test: file.test });
    } catch (e) {
      setMessage({ level: "error", text: (e as Error).message });
    } finally {
      setOutputBusy(null);
    }
  };

  const showExport = (fileId: string) => {
    setExportError(null);
    exportInitFile(fileId).then(setExported, (e: Error) => setExportError(e.message));
  };

  if (loading) return <p className="hint page-message">Loading…</p>;
  if (loadError) return <p className="issues-inline error page-message">{loadError}</p>;

  const catalogIds = draft.catalog.map((m) => m.id);
  const workbenchIds = draft.workbench.map((m) => m.terriaId ?? m.id);

  return (
    <main className="page wide-page init-editor">
      <div className="init-head">
        <div>
          <h2>{record ? draft.name || "Untitled init file" : "New init file"}</h2>
          <span className="hint">
            {input.slug ? <code>{input.slug}.json</code> : "No file name yet"}
            {dirty && " · Unsaved changes"}
          </span>
        </div>
        <div className="actions">
          {message && <span className={`save-message ${message.level}`}>{message.text}</span>}
          {record && (
            <>
              <a className="btn" href={initFileDownloadUrl(record.id)} download title="Download the last saved version">
                Download JSON
              </a>
              <button
                type="button"
                className="btn danger"
                disabled={outputs.published !== null}
                title={outputs.published ? "Published init files can't be deleted; unpublish it first" : undefined}
                onClick={remove}
              >
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={saving || problems.length > 0}
            title={problems.length ? "Fix the problems listed before saving" : undefined}
            onClick={save}
          >
            {saving ? "Saving…" : record ? "Save" : "Save new"}
          </button>
        </div>
      </div>

      {record && (
        <div className="init-outputs">
          <OutputRow
            label="Status"
            onLabel="Published"
            offLabel="Not published"
            output={outputs.published}
            currentVersion={record.version}
            busy={outputBusy === "published"}
            onChange={(on) => setOutput("published", on)}
            turnOn={`Publish to /config/${draft.slug}.json`}
            turnOff="Unpublish"
            offHint="Publishing writes the last saved version where maps can load it."
          />
          <OutputRow
            label="Test mode"
            onLabel="On"
            offLabel="Off"
            output={outputs.test}
            currentVersion={record.version}
            busy={outputBusy === "test"}
            onChange={(on) => setOutput("test", on)}
            turnOn="Turn on"
            turnOff="Turn off"
            offHint={`A test copy at /config/test/${record.id}.json, updated every time you save.`}
          />
        </div>
      )}

      {problems.length > 0 && (
        <ul className="issues init-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <section className="section">
        <h2>Details</h2>
        <div className="init-grid">
          <Row label="Name" hint="Shown in this app only.">
            <input
              className="input"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value, ...(slugEdited ? {} : { slug: slugify(e.target.value) }) })}
            />
          </Row>
          <Row label="File name" hint="Terria loads it as <file name>.json, e.g. from the init/ folder of the map.">
            <input
              className="input"
              value={draft.slug}
              spellCheck={false}
              aria-invalid={draft.slug !== "" && !SLUG.test(input.slug)}
              onChange={(e) => {
                setSlugEdited(true);
                set({ slug: e.target.value });
              }}
            />
          </Row>
          <Row label="Notes" hint="For editors of this file; not exported." wide>
            <textarea className="input textarea" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </Row>
        </div>
      </section>

      <section className="section">
        <h2>
          Catalog <span className="badge">{draft.catalog.length}</span>
        </h2>
        <p className="hint">
          The top level of the data catalog, in order. Pick from saved groups; each brings its members with it. Only published groups and
          members are exported.
        </p>
        <div className="members-panel">
          <div>
            <h3>In the catalog</h3>
            <MemberList
              members={draft.catalog}
              onChange={(catalog) => set({ catalog })}
              empty="No groups yet. Search for groups to add."
            />
          </div>
          <div>
            <h3>Add groups</h3>
            <MemberSearch
              query={{ kind: "group" }}
              typeChoices={groupTypes.map((t) => t.type).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))}
              added={draft.catalog}
              onAdd={(added) => set({ catalog: [...draft.catalog, ...added] })}
              label="Search groups to add to the catalog"
              empty="No groups saved yet."
            />
          </div>
        </div>
      </section>

      <section className="section">
        <h2>
          Workbench <span className="badge">{draft.workbench.length}</span>
        </h2>
        <p className="hint">Items added to the map when it loads (workbench), chosen from the items inside the catalog groups above.</p>
        <div className="members-panel">
          <div>
            <h3>On the workbench</h3>
            <MemberList
              members={draft.workbench}
              onChange={(workbench) => set({ workbench })}
              empty="Nothing is added to the map on load."
              badge={(m) => <WorkbenchCheck item={m} catalogIds={catalogIds} />}
            />
          </div>
          <div>
            <h3>Add items</h3>
            {draft.catalog.length === 0 ? (
              <p className="hint">Add groups to the catalog first.</p>
            ) : (
              <MemberSearch
                query={{ kind: "item", within: catalogIds }}
                typeChoices={itemTypes.map((t) => t.type).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))}
                added={draft.workbench}
                onAdd={(added) => set({ workbench: [...draft.workbench, ...added] })}
                label="Search items in the catalog groups"
                empty="The catalog groups don't contain any items."
              />
            )}
          </div>
        </div>
        <div className="init-grid">
          <Row label="Previewed item id" hint="previewedItemId: the catalog member shown in the data preview when the catalog opens.">
            <TextField
              value={config.previewedItemId}
              onChange={(v) => setKey("previewedItemId", v)}
              suggestions={workbenchIds}
            />
          </Row>
        </div>
      </section>

      <section className="section">
        <h2>Map view</h2>
        <p className="hint">
          Pan and zoom the map, then use its view as a camera. Terria shows the whole box, centred, looking straight down. For a tilted 3D
          view, choose “Other camera (JSON)” and give position/direction/up, positionHeading or lookAt.
        </p>
        <CameraMap key={generation} cameras={cameras} />
        <div className="init-grid">
          <CameraField
            key={`home-${generation}`}
            name="homeCamera"
            label="Home camera"
            hint="Where the home button goes. Required."
            color={HOME_COLOR}
            value={config.homeCamera}
            onChange={(v) => setKey("homeCamera", v)}
            onJsonError={jsonError("Home camera")}
          />
          <CameraField
            key={`initial-${generation}`}
            name="initialCamera"
            label="Initial camera"
            hint="Where the map opens. Unset opens at the home camera."
            color={INITIAL_COLOR}
            value={config.initialCamera}
            onChange={(v) => setKey("initialCamera", v)}
            onJsonError={jsonError("Initial camera")}
            optional
          />
          <Row label="Viewer mode" hint="viewerMode. Terria's default is 3d.">
            <select className="input" value={typeof config.viewerMode === "string" ? config.viewerMode : ""} onChange={(e) => setKey("viewerMode", e.target.value || undefined)}>
              <option value="">Default</option>
              {VIEWER_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              {typeof config.viewerMode === "string" && !VIEWER_MODES.some((m) => m.value === config.viewerMode) && (
                <option value={config.viewerMode}>{config.viewerMode}</option>
              )}
            </select>
          </Row>
          <Row label="Show splitter" hint="showSplitter. Terria's default is no.">
            <BooleanField value={config.showSplitter} onChange={(v) => setKey("showSplitter", v)} />
          </Row>
          <Row label="Split position" hint="splitPosition, from 0 (left) to 1 (right). Terria's default is 0.5.">
            <NumberField value={config.splitPosition} onChange={(v) => setKey("splitPosition", v)} min={0} max={1} step={0.05} />
          </Row>
        </div>
      </section>

      <section className="section">
        <h2>Base maps</h2>
        <div className="init-grid">
          <Row label="Default base map" hint="baseMaps.defaultBaseMapId: shown when the map first loads.">
            <TextField value={baseMaps.defaultBaseMapId} onChange={(v) => setSub("baseMaps", "defaultBaseMapId", v)} suggestions={baseMapIds(baseMaps)} />
          </Row>
          <Row label="Preview base map" hint="baseMaps.previewBaseMapId: used in the data preview.">
            <TextField value={baseMaps.previewBaseMapId} onChange={(v) => setSub("baseMaps", "previewBaseMapId", v)} suggestions={baseMapIds(baseMaps)} />
          </Row>
          <Row label="Enabled base maps" hint="baseMaps.enabledBaseMaps: one id per line, in the order shown in settings. Empty enables them all." wide>
            <LinesField value={baseMaps.enabledBaseMaps} onChange={(v) => setSub("baseMaps", "enabledBaseMaps", v)} />
          </Row>
          <Row
            label="Extra base maps"
            hint={`baseMaps.items: an array of { "item": <catalog item or "//id">, "image": "<preview image URL>" }, added to Terria's defaults.`}
            wide
          >
            <JsonField
              key={`basemaps-${generation}`}
              value={baseMaps.items}
              onChange={(v) => setSub("baseMaps", "items", v)}
              onError={jsonError("Extra base maps")}
              expect="array"
              rows={6}
            />
          </Row>
        </div>
      </section>

      <section className="section">
        <h2>Settings</h2>
        <div className="init-grid">
          <Row label="Use native resolution" hint="settings.useNativeResolution. Default no.">
            <BooleanField value={settings.useNativeResolution} onChange={(v) => setSub("settings", "useNativeResolution", v)} />
          </Row>
          <Row label="Always show timeline" hint="settings.alwaysShowTimeline. Default no.">
            <BooleanField value={settings.alwaysShowTimeline} onChange={(v) => setSub("settings", "alwaysShowTimeline", v)} />
          </Row>
          <Row label="Terrain hides underground features" hint="settings.depthTestAgainstTerrainEnabled. Default no.">
            <BooleanField value={settings.depthTestAgainstTerrainEnabled} onChange={(v) => setSub("settings", "depthTestAgainstTerrainEnabled", v)} />
          </Row>
          <Row label="Shorten share URLs" hint="settings.shortenShareUrls.">
            <BooleanField value={settings.shortenShareUrls} onChange={(v) => setSub("settings", "shortenShareUrls", v)} />
          </Row>
          <Row label="Base maximum screen space error" hint="settings.baseMaximumScreenSpaceError: higher is faster but blurrier. Default 2.">
            <NumberField value={settings.baseMaximumScreenSpaceError} onChange={(v) => setSub("settings", "baseMaximumScreenSpaceError", v)} min={0} step={0.5} />
          </Row>
          <Row label="Terrain split direction" hint="settings.terrainSplitDirection.">
            <select
              className="input"
              value={typeof settings.terrainSplitDirection === "number" ? String(settings.terrainSplitDirection) : ""}
              onChange={(e) => setSub("settings", "terrainSplitDirection", e.target.value === "" ? undefined : Number(e.target.value))}
            >
              <option value="">Default (both sides)</option>
              <option value="-1">Left (-1)</option>
              <option value="0">Both (0)</option>
              <option value="1">Right (1)</option>
            </select>
          </Row>
        </div>
      </section>

      <section className="section">
        <h2>Other</h2>
        <div className="init-grid">
          <Row label="CORS domains" hint="corsDomains: hosts that support CORS, so Terria doesn't proxy them. One per line." wide>
            <LinesField value={config.corsDomains} onChange={(v) => setKey("corsDomains", v)} />
          </Row>
          <Row label="Stories" hint="stories: an array of { id, title, text, shareData }, usually exported from Terria's story builder." wide>
            <JsonField key={`stories-${generation}`} value={config.stories} onChange={(v) => setKey("stories", v)} onError={jsonError("Stories")} expect="array" rows={6} />
          </Row>
          <Row label="Other keys" hint="Any other top-level keys, as a JSON object. They are exported as they are." wide>
            <JsonField
              key={`other-${generation}`}
              value={Object.keys(without(config, KNOWN_KEYS)).length ? without(config, KNOWN_KEYS) : undefined}
              onChange={(v) =>
                setDraft((d) => ({ ...d, config: { ...Object.fromEntries(KNOWN_KEYS.filter((k) => k in d.config).map((k) => [k, d.config[k]])), ...(v as JsonObject | undefined) } }))
              }
              onError={jsonError("Other keys")}
              expect="object"
              rows={4}
              check={(v) => {
                const clash = Object.keys(v as JsonObject).filter((k) => KNOWN_KEYS.includes(k) || k === "catalog" || k === "workbench");
                return clash.length ? `set ${clash.join(", ")} with ${clash.length === 1 ? "its own field" : "their own fields"}` : null;
              }}
            />
          </Row>
        </div>
      </section>

      <section className="section">
        <div className="preview-head">
          <h2>Exported JSON</h2>
          <button type="button" className="btn small" disabled={!record} onClick={() => record && showExport(record.id)}>
            {exported ? "Refresh" : "Show"}
          </button>
        </div>
        <p className="hint">
          {record
            ? `The last saved version${dirty ? " (save to include your changes)" : ""}, as Terria will load it. Unpublished groups and items are left out.`
            : "Save the init file to see its JSON."}
        </p>
        {exportError && <p className="issues-inline error">{exportError}</p>}
        {exported && <pre className="code-block">{JSON.stringify(exported, null, 2)}</pre>}
      </section>
    </main>
  );
}

/** Published or test state of an init file, with a button to toggle it. */
function OutputRow(props: {
  label: string;
  onLabel: string;
  offLabel: string;
  output: InitFileOutput | null;
  currentVersion: number;
  busy: boolean;
  onChange: (on: boolean) => void;
  turnOn: string;
  turnOff: string;
  offHint: string;
}) {
  const { output } = props;
  const stale = output !== null && output.version !== props.currentVersion;
  return (
    <div className="init-output">
      <span className="init-output-label">{props.label}</span>
      <span className={`status ${output ? (stale ? "warning" : "ok") : ""}`}>{output ? props.onLabel : props.offLabel}</span>
      <span className="hint">
        {output ? (
          <>
            <a className="link" href={output.path} target="_blank" rel="noreferrer">
              {new URL(output.path, location.href).href}
            </a>{" "}
            · version {output.version}, {new Date(output.writtenAt).toLocaleString()}
            {output.writtenBy && ` by ${output.writtenBy}`}
            {stale && ` · out of date (now version ${props.currentVersion})`}
          </>
        ) : (
          props.offHint
        )}
      </span>
      <span className="init-output-actions">
        {output && stale && (
          <button type="button" className="btn small" disabled={props.busy} onClick={() => props.onChange(true)}>
            Update
          </button>
        )}
        <button type="button" className={`btn small${output ? "" : " primary"}`} disabled={props.busy} onClick={() => props.onChange(!output)}>
          {props.busy ? "Working…" : output ? props.turnOff : props.turnOn}
        </button>
      </span>
    </div>
  );
}

/** Warns when a workbench item is no longer inside the catalog groups. */
function WorkbenchCheck({ item, catalogIds }: { item: MemberRef; catalogIds: string[] }) {
  const [inside, setInside] = useState<boolean | null>(null);
  const key = catalogIds.join(",");
  useEffect(() => {
    const abort = new AbortController();
    listMembers({ within: key.split(",").filter(Boolean), kind: "item", types: [item.type], q: item.name, pageSize: 200 }, abort.signal).then(
      (page) => setInside(page.items.some((m) => m.id === item.id)),
      () => {},
    );
    return () => abort.abort();
  }, [item.id, item.type, item.name, key]);
  return inside === false ? <span className="badge error">Not in the catalog</span> : null;
}

function Row({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`form-row${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

function TextField({ value, onChange, suggestions }: { value: unknown; onChange: (v: string | undefined) => void; suggestions?: string[] }) {
  const listId = useId();
  return (
    <>
      <input
        className="input"
        value={typeof value === "string" ? value : ""}
        spellCheck={false}
        list={suggestions?.length ? listId : undefined}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

function NumberField({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: unknown;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      className="input number"
      type="number"
      value={typeof value === "number" ? value : ""}
      min={min}
      max={max}
      step={step ?? "any"}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

/** Unset, yes or no, so an unset value leaves Terria's default. */
function BooleanField({ value, onChange }: { value: unknown; onChange: (v: boolean | undefined) => void }) {
  return (
    <select
      className="input"
      value={value === true ? "true" : value === false ? "false" : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")}
    >
      <option value="">Default</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
  );
}

/** A list of strings, one per line. */
function LinesField({ value, onChange }: { value: unknown; onChange: (v: string[] | undefined) => void }) {
  const [text, setText] = useState(() => (Array.isArray(value) ? value.join("\n") : ""));
  return (
    <textarea
      className="input textarea code"
      rows={3}
      value={text}
      spellCheck={false}
      onChange={(e) => {
        setText(e.target.value);
        const lines = e.target.value
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        onChange(lines.length ? lines : undefined);
      }}
    />
  );
}

/**
 * JSON text, parsed on every change. It keeps its own text, so give it a new
 * key when the value is replaced from outside (e.g. on load).
 */
function JsonField({
  value,
  onChange,
  onError,
  expect,
  rows,
  check,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  onError: (error: string | null) => void;
  expect: "array" | "object";
  rows: number;
  /** Further validation of the parsed value; returns an error message. */
  check?: (v: unknown) => string | null;
}) {
  const [text, setText] = useState(() => (value === undefined ? "" : JSON.stringify(value, null, 2)));
  const [error, setError] = useState<string | null>(null);

  // Don't leave an error behind when the box goes away.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(() => () => onErrorRef.current(null), []);

  const report = (e: string | null) => {
    setError(e);
    onError(e);
  };

  return (
    <>
      <textarea
        className="input textarea code"
        rows={rows}
        value={text}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        placeholder={expect === "array" ? "[ ]" : "{ }"}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) {
            report(null);
            onChange(undefined);
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(e.target.value);
          } catch (err) {
            report(`not valid JSON (${(err as Error).message})`);
            return;
          }
          const isRightType = expect === "array" ? Array.isArray(parsed) : isPlainObject(parsed);
          const problem = isRightType ? (check?.(parsed) ?? null) : `must be a JSON ${expect}`;
          report(problem);
          if (!problem) onChange(parsed);
        }}
      />
      {error && <small className="issues-inline error">{error}</small>}
    </>
  );
}

/** One camera: a bounding box (also set from the map), focus on the workbench, or JSON. */
function CameraField({
  name,
  label,
  hint,
  color,
  value,
  onChange,
  onJsonError,
  optional,
}: {
  name: string;
  label: string;
  hint: string;
  color: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onJsonError: (error: string | null) => void;
  /** The initial camera may be unset or focus on the workbench items. */
  optional?: boolean;
}) {
  // A required camera with no value shows the (empty) bounding box.
  const modeFor = (v: unknown): CameraMode => (cameraMode(v) === "unset" && !optional ? "rect" : cameraMode(v));
  const [mode, setMode] = useState<CameraMode>(() => modeFor(value));
  // The value this field last sent. Any other new value came from outside (the
  // map), so the mode follows it.
  const [sent, setSent] = useState(value);
  if (value !== sent) {
    setSent(value);
    setMode(modeFor(value));
  }
  const send = (v: unknown) => {
    setSent(v);
    onChange(v);
  };
  const rect = asRect(value);

  const choose = (next: CameraMode) => {
    setMode(next);
    if (next === "unset") send(undefined);
    else if (next === "focus") send({ focusWorkbenchItems: true });
    else if (next === "rect" && !rect) send(undefined);
    // "json" keeps the current value to edit.
  };

  const setSide = (side: keyof Rect, n: number | undefined) => {
    const next = { ...(rect ?? { west: -180, south: -90, east: 180, north: 90 }) };
    if (n !== undefined) next[side] = n;
    send(next);
  };

  return (
    <fieldset className="form-row wide camera-field">
      <legend>
        <span className="camera-swatch" style={{ borderColor: color }} aria-hidden="true" /> {label} <code className="hint">{name}</code>
      </legend>
      <select className="input" aria-label={`${label} type`} value={mode} onChange={(e) => choose(e.target.value as CameraMode)}>
        {optional && <option value="unset">Not set</option>}
        <option value="rect">Bounding box</option>
        {optional && <option value="focus">Focus on the workbench items</option>}
        <option value="json">Other camera (JSON)</option>
      </select>
      {mode === "rect" && (
        <div className="rect-inputs">
          {(["west", "south", "east", "north"] as const).map((side) => (
            <label key={side}>
              <span className="hint">{side}</span>
              <NumberField value={rect?.[side]} onChange={(n) => setSide(side, n)} min={side === "south" || side === "north" ? -90 : -180} max={side === "south" || side === "north" ? 90 : 180} />
            </label>
          ))}
          {!rect && <small className="hint">Use the map above, or type the four sides.</small>}
        </div>
      )}
      {mode === "json" && <JsonField value={value} onChange={send} onError={onJsonError} expect="object" rows={6} />}
      <small className="hint">{hint}</small>
    </fieldset>
  );
}
