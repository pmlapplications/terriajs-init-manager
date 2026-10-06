// Basic value inputs. Each one reports `undefined` when cleared, so the trait
// is left out of the generated JSON instead of being set to an empty value.

import { useEffect, useId, useRef, useState } from "react";
import { isCssColor } from "../terria/validate";
import type { Option } from "../terria/wms-ui";

interface InputProps<T> {
  id: string;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  invalid?: boolean;
  placeholder?: string;
}

export function TextInput({
  id,
  value,
  onChange,
  invalid,
  placeholder,
  suggestions,
  type = "text",
}: InputProps<string> & { suggestions?: Option[]; type?: string }) {
  const listId = useId();
  return (
    <>
      <input
        id={id}
        type={type}
        className="input"
        aria-invalid={invalid || undefined}
        value={value ?? ""}
        placeholder={placeholder}
        list={suggestions?.length ? listId : undefined}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </datalist>
      ) : null}
    </>
  );
}

export function TextArea({ id, value, onChange, invalid, placeholder, rows = 4 }: InputProps<string> & { rows?: number }) {
  return (
    <textarea
      id={id}
      className="input textarea"
      rows={rows}
      aria-invalid={invalid || undefined}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

/** Hex value for the native picker, when the text is a colour it can show. */
function toHex(value: string | undefined): string {
  if (!value || !isCssColor(value)) return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#000000";
  ctx.fillStyle = value;
  const normalised = String(ctx.fillStyle);
  if (/^#[0-9a-f]{6}$/i.test(normalised)) return normalised;
  // Translucent colours come back as rgba(r, g, b, a); the picker ignores alpha.
  const rgb = normalised.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return rgb ? "#" + rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : "#000000";
}

export function ColorInput(props: InputProps<string>) {
  const { id, value, onChange } = props;
  return (
    <div className="input-row">
      <input
        type="color"
        className="swatch"
        aria-label="Pick colour"
        value={toHex(value)}
        onChange={(e) => onChange(e.target.value)}
      />
      <TextInput {...props} id={id} placeholder={props.placeholder ?? "#00ffff, cyan, rgba(0,255,255,1)"} />
    </div>
  );
}

export function SelectInput({
  id,
  value,
  onChange,
  invalid,
  options,
  numeric,
  defaultValue,
}: InputProps<string | number> & { options: Option[]; numeric?: boolean; defaultValue?: string | number }) {
  const known = value === undefined || options.some((o) => o.value === value);
  return (
    <select
      id={id}
      className="input"
      aria-invalid={invalid || !known || undefined}
      value={value === undefined ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? undefined : numeric ? Number(raw) : raw);
      }}
    >
      <option value="">{defaultValue !== undefined ? `Not set (default: ${defaultValue})` : "Not set"}</option>
      {!known && <option value={String(value)}>{String(value)} (not allowed)</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label ?? String(o.value)}
        </option>
      ))}
    </select>
  );
}

export function BooleanInput({
  id,
  value,
  onChange,
  defaultValue,
}: InputProps<boolean> & { defaultValue?: boolean }) {
  const choices: { label: string; v: boolean | undefined }[] = [
    { label: defaultValue === undefined ? "Not set" : `Default (${defaultValue ? "yes" : "no"})`, v: undefined },
    { label: "Yes", v: true },
    { label: "No", v: false },
  ];
  return (
    <div className="segmented" role="radiogroup" id={id}>
      {choices.map((c) => (
        <button
          key={c.label}
          type="button"
          role="radio"
          aria-checked={value === c.v}
          className={value === c.v ? "on" : undefined}
          onClick={() => onChange(c.v)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Text kept as typed until it parses; parse errors are reported through
 * `onDraftError` rather than committed.
 */
function useDraft<T>(
  value: T | undefined,
  format: (v: T) => string,
  parse: (text: string) => { ok: true; value: T } | { ok: false; error: string },
  onChange: (v: T | undefined) => void,
  onDraftError: (message: string | null) => void,
) {
  const [text, setText] = useState(() => (value === undefined ? "" : format(value)));
  const [committed, setCommitted] = useState(value);

  // Adopt values set from outside (import, reset, capabilities).
  if (value !== committed) {
    setCommitted(value);
    setText(value === undefined ? "" : format(value));
  }

  // Clear any pending parse error when the field goes away.
  const reportRef = useRef(onDraftError);
  useEffect(() => {
    reportRef.current = onDraftError;
  });
  useEffect(() => () => reportRef.current(null), []);

  const change = (next: string) => {
    setText(next);
    if (next.trim() === "") {
      onDraftError(null);
      setCommitted(undefined);
      onChange(undefined);
      return;
    }
    const parsed = parse(next);
    if (parsed.ok) {
      onDraftError(null);
      setCommitted(parsed.value);
      onChange(parsed.value);
    } else {
      onDraftError(parsed.error);
    }
  };
  return [text, change] as const;
}

export function NumberInput({
  id,
  value,
  onChange,
  invalid,
  placeholder,
  onDraftError,
}: InputProps<number> & { onDraftError: (message: string | null) => void }) {
  const [text, change] = useDraft<number>(
    value,
    String,
    (t) => {
      const n = Number(t.trim());
      return t.trim() !== "" && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `"${t}" is not a number` };
    },
    onChange,
    onDraftError,
  );
  return (
    <input
      id={id}
      className="input number"
      inputMode="decimal"
      aria-invalid={invalid || undefined}
      value={text}
      placeholder={placeholder}
      onChange={(e) => change(e.target.value)}
    />
  );
}

export function JsonInput({
  id,
  value,
  onChange,
  invalid,
  placeholder,
  onDraftError,
}: InputProps<unknown> & { onDraftError: (message: string | null) => void }) {
  const [text, change] = useDraft<unknown>(
    value,
    (v) => JSON.stringify(v, null, 2),
    (t) => {
      try {
        return { ok: true, value: JSON.parse(t) };
      } catch (e) {
        return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
      }
    },
    onChange,
    onDraftError,
  );
  return (
    <textarea
      id={id}
      className="input textarea code"
      rows={Math.min(12, Math.max(3, text.split("\n").length))}
      aria-invalid={invalid || undefined}
      value={text}
      placeholder={placeholder ?? '{ "key": "value" }'}
      spellCheck={false}
      onChange={(e) => change(e.target.value)}
    />
  );
}
