// Inputs that use the server's GetCapabilities response to offer real
// layer, style and extent values.

import { useEffect, useId, useRef, useState } from "react";
import { fetchCapabilities, unionBbox, type Capabilities, type CapLayer } from "../terria/capabilities";
import { useEditor } from "./context";
import { TextInput } from "./inputs";

const splitCsv = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()) : []);

function selectedLayers(item: Record<string, unknown>, caps: Capabilities | null): CapLayer[] {
  const names = splitCsv(typeof item.layers === "string" ? item.layers : undefined);
  return names.map((n) => caps?.layers.find((l) => l.name === n)).filter((l): l is CapLayer => !!l);
}

interface Props {
  id: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  invalid?: boolean;
}

export function WmsLayersInput({ id, value, onChange, invalid }: Props) {
  const { capabilities } = useEditor();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const layers = splitCsv(value).filter(Boolean);
  const write = (next: string[]) => onChange(next.length ? next.join(",") : undefined);
  const add = () => {
    const names = splitCsv(draft).filter((n) => n && !layers.includes(n));
    if (names.length) write([...layers, ...names]);
    setDraft("");
  };

  return (
    <div className="layers-input">
      {layers.length > 0 && (
        <ul className="chips">
          {layers.map((name) => {
            const known = capabilities?.layers.find((l) => l.name === name);
            const missing = capabilities && !known;
            return (
              <li key={name} className={missing ? "chip warn" : "chip"} title={missing ? "Not in the server's capabilities" : known?.abstract}>
                <span>{name}</span>
                {known?.title && known.title !== name && <small>{known.title}</small>}
                <button type="button" aria-label={`Remove ${name}`} onClick={() => write(layers.filter((l) => l !== name))}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="input-row">
        <input
          id={id}
          className="input"
          list={listId}
          aria-invalid={invalid || undefined}
          value={draft}
          spellCheck={false}
          placeholder={capabilities ? `Search ${capabilities.layers.length} layers…` : "Layer name (comma separated for several)"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" disabled={!draft.trim()} onClick={add}>
          Add
        </button>
      </div>
      {capabilities && (
        <datalist id={listId}>
          {capabilities.layers
            .filter((l) => !layers.includes(l.name))
            .map((l) => (
              <option key={l.name} value={l.name}>
                {l.title}
              </option>
            ))}
        </datalist>
      )}
    </div>
  );
}

export function WmsStylesInput({ id, value, onChange, invalid }: Props) {
  const { item, capabilities } = useEditor();
  const layers = splitCsv(typeof item.layers === "string" ? item.layers : undefined).filter(Boolean);

  if (layers.length === 0) {
    return <TextInput id={id} value={value} onChange={onChange} invalid={invalid} placeholder="Comma separated, one per layer" />;
  }

  const styles = splitCsv(value);
  const write = (i: number, style: string) => {
    const next = layers.map((_, j) => (j === i ? style : (styles[j] ?? "")));
    onChange(next.some(Boolean) ? next.join(",") : undefined);
  };

  return (
    <div className="styles-input" id={id}>
      {layers.map((layer, i) => {
        const options = capabilities?.layers.find((l) => l.name === layer)?.styles ?? [];
        const current = styles[i] ?? "";
        return (
          <div className="style-row" key={layer}>
            <span className="style-layer" title={layer}>
              {layer}
            </span>
            {options.length ? (
              <select className="input" aria-invalid={invalid || undefined} value={current} onChange={(e) => write(i, e.target.value)}>
                <option value="">Server default</option>
                {current && !options.some((o) => o.name === current) && <option value={current}>{current} (not on server)</option>}
                {options.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.title && o.title !== o.name ? `${o.name} (${o.title})` : o.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                aria-invalid={invalid || undefined}
                value={current}
                placeholder="Server default"
                onChange={(e) => write(i, e.target.value.replace(/,/g, ""))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RectangleFromCapabilities() {
  const { item, update, capabilities } = useEditor();
  const bbox = unionBbox(selectedLayers(item, capabilities));
  if (!capabilities) return null;
  return (
    <div className="helper">
      <button type="button" className="btn small" disabled={!bbox} onClick={() => bbox && update(["rectangle"], { ...bbox })}>
        Use extent of selected layers
      </button>
      {bbox ? (
        <small>
          W {bbox.west} · S {bbox.south} · E {bbox.east} · N {bbox.north}
        </small>
      ) : (
        <small>Select layers known to the server first.</small>
      )}
    </div>
  );
}

/** Loads GetCapabilities from the item's URL to populate the inputs above. */
export function CapabilitiesPanel({
  capabilities,
  onLoaded,
}: {
  capabilities: Capabilities | null;
  onLoaded: (caps: Capabilities | null) => void;
}) {
  const { item, update } = useEditor();
  const [state, setState] = useState<{ status: "idle" | "loading" | "error"; message?: string }>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);
  const source = (typeof item.getCapabilitiesUrl === "string" && item.getCapabilitiesUrl) || (typeof item.url === "string" && item.url) || "";

  useEffect(() => () => abort.current?.abort(), []);

  const load = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: "loading" });
    try {
      const caps = await fetchCapabilities(source, controller.signal);
      onLoaded(caps);
      setState({ status: "idle" });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      onLoaded(null);
      setState({ status: "error", message: (e as Error).message });
    }
  };

  const layers = selectedLayers(item, capabilities);
  const first = layers[0];

  return (
    <div className="caps-panel">
      <div className="caps-head">
        <div>
          <strong>Server capabilities</strong>
          <small>
            {capabilities
              ? `${capabilities.title ?? "WMS"} · version ${capabilities.version} · ${capabilities.layers.length} layers`
              : "Load GetCapabilities to choose layers and styles from the server."}
          </small>
        </div>
        <button type="button" className="btn" disabled={!source || state.status === "loading"} onClick={load}>
          {state.status === "loading" ? "Loading…" : capabilities ? "Reload" : "Load from server"}
        </button>
      </div>
      {!source && <p className="hint">Enter the service URL first.</p>}
      {state.status === "error" && <p className="issues-inline error">{state.message}</p>}
      {first && (
        <div className="helper">
          {!item.name && first.title && (
            <button type="button" className="btn small" onClick={() => update(["name"], first.title)}>
              Use “{first.title}” as name
            </button>
          )}
          {!item.description && first.abstract && (
            <button type="button" className="btn small" onClick={() => update(["description"], first.abstract)}>
              Use layer abstract as description
            </button>
          )}
        </div>
      )}
    </div>
  );
}
