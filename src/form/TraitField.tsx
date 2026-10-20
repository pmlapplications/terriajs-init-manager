import { useState, type ReactNode } from "react";
import { getIn, humanize, isPlainObject, pathKey, traitKind, type JsonObject, type Path, type TraitDef } from "../terria/traits";
import { fieldId, traitMatches } from "./paths";
import type { FieldSpec } from "../terria/catalog-ui";
import type { Issue } from "../terria/validate";
import { useEditor } from "./context";
import { BooleanInput, ColorInput, JsonInput, NumberInput, SelectInput, TextArea, TextInput } from "./inputs";
import { RectangleFromCapabilities, WmsLayersInput, WmsStylesInput } from "./wmsInputs";

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 160 || text.includes("\n");
  return (
    <div className={`desc${open || !long ? " open" : ""}`}>
      <span>{text}</span>
      {long && (
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={i.level}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

const isSet = (v: unknown) => v !== undefined;

/** One trait: label, input for its type, description and any issues. */
export function TraitField({ className, trait, path }: { className: string; trait: TraitDef; path: Path }) {
  const { model, item, update, issuesAt, setDraftError, filter, onlySet, fieldNote } = useEditor();
  const key = pathKey(path);
  const value = getIn(item, path);
  const spec = model.specFor(className, trait);
  const kind = traitKind(trait.type);
  const issues = issuesAt(key);
  const onDraftError = (m: string | null) => setDraftError(key, m);

  if (!traitMatches(model, trait, filter)) return null;
  if (onlySet && !isSet(value)) return null;

  const set = (v: unknown) => update(path, v);
  const id = fieldId(path);
  const invalid = issues.some((i) => i.level === "error");
  const typeLabel = trait.type === "any" ? (spec.jsonObject ? "JSON object" : "JSON") : trait.type;

  if (kind.kind === "object") {
    return (
      <ObjectField className={kind.className} trait={trait} path={path} value={value} issues={issues} typeLabel={typeLabel} />
    );
  }
  if (kind.kind === "objectArray") {
    return <ObjectArrayField className={kind.className} trait={trait} path={path} value={value} issues={issues} />;
  }

  let input: ReactNode;
  switch (kind.kind) {
    case "boolean":
      input = (
        <BooleanInput
          id={id}
          value={typeof value === "boolean" ? value : undefined}
          onChange={set}
          defaultValue={trait.default as boolean | undefined}
        />
      );
      break;
    case "number":
      input =
        spec.widget === "select" ? (
          <SelectInput
            id={id}
            value={value as number | undefined}
            onChange={set}
            options={spec.options ?? []}
            numeric
            invalid={invalid}
            defaultValue={trait.default as number | undefined}
          />
        ) : (
          <NumberInput
            id={id}
            value={typeof value === "number" ? value : undefined}
            onChange={set}
            invalid={invalid}
            placeholder={numberHint(trait, spec)}
            onDraftError={onDraftError}
          />
        );
      break;
    case "any":
      input = <JsonInput id={id} value={value} onChange={set} invalid={invalid} onDraftError={onDraftError} />;
      break;
    case "stringArray":
      input = <StringListInput path={path} value={value} spec={spec} />;
      break;
    default:
      input = <StringInput id={id} trait={trait} spec={spec} value={value} onChange={set} invalid={invalid} />;
  }

  return (
    <div className={`field${isSet(value) ? " is-set" : ""}`}>
      <FieldLabel
        htmlFor={id}
        trait={trait}
        typeLabel={typeLabel}
        required={spec.required}
        onClear={isSet(value) ? () => set(undefined) : undefined}
        note={fieldNote?.(path)}
      />
      {input}
      <IssueList issues={issues} />
      <Description text={trait.description} />
    </div>
  );
}

function numberHint(trait: TraitDef, spec: FieldSpec): string {
  const parts: string[] = [];
  if (trait.default !== undefined) parts.push(`default ${trait.default}`);
  if (spec.min !== undefined && spec.max !== undefined) parts.push(`${spec.min} to ${spec.max}`);
  else if (spec.min !== undefined) parts.push(spec.exclusiveMin ? `> ${spec.min}` : `≥ ${spec.min}`);
  if (spec.integer) parts.push("whole number");
  return parts.join(" · ");
}

function FieldLabel({
  htmlFor,
  trait,
  typeLabel,
  required,
  onClear,
  note,
}: {
  htmlFor?: string;
  trait: TraitDef;
  typeLabel: string;
  required?: boolean;
  onClear?: () => void;
  note?: ReactNode;
}) {
  return (
    <div className="label-row">
      <label htmlFor={htmlFor}>
        {humanize(trait.name)}
        {required && <span className="req" title="Required">*</span>}
      </label>
      <code className="trait-name">{trait.name}</code>
      <span className="type">{typeLabel}</span>
      {trait.default !== undefined && typeof trait.default !== "boolean" && (
        <span className="default">default {String(trait.default)}</span>
      )}
      {onClear && (
        <button type="button" className="link clear" onClick={onClear} title="Remove this trait from the JSON">
          clear
        </button>
      )}
      {note}
    </div>
  );
}

function StringInput({
  id,
  trait,
  spec,
  value,
  onChange,
  invalid,
}: {
  id: string;
  trait: TraitDef;
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid: boolean;
}) {
  const v = typeof value === "string" ? value : value === undefined ? undefined : String(value);
  const placeholder = spec.placeholder ?? (typeof trait.default === "string" ? `default ${trait.default}` : undefined);
  switch (spec.widget) {
    case "select":
      return (
        <SelectInput
          id={id}
          value={v}
          onChange={onChange}
          options={spec.options ?? []}
          invalid={invalid}
          defaultValue={trait.default as string | undefined}
        />
      );
    case "textarea":
      return <TextArea id={id} value={v} onChange={onChange} invalid={invalid} placeholder={placeholder} />;
    case "color":
      return <ColorInput id={id} value={v} onChange={onChange} invalid={invalid} />;
    case "url":
      return <TextInput id={id} type="url" value={v} onChange={onChange} invalid={invalid} placeholder={placeholder ?? "https://"} />;
    case "datetime":
      return (
        <TextInput id={id} value={v} onChange={onChange} invalid={invalid} placeholder={placeholder ?? "2024-01-31T12:00:00Z"} />
      );
    case "duration":
    case "combo":
      return <TextInput id={id} value={v} onChange={onChange} invalid={invalid} placeholder={placeholder} suggestions={spec.options} />;
    case "wmsLayers":
      return <WmsLayersInput id={id} value={v} onChange={onChange} invalid={invalid} />;
    case "wmsStyles":
      return <WmsStylesInput id={id} value={v} onChange={onChange} invalid={invalid} />;
    default:
      return <TextInput id={id} value={v} onChange={onChange} invalid={invalid} placeholder={placeholder} />;
  }
}

function StringListInput({ path, value, spec }: { path: Path; value: unknown; spec: FieldSpec }) {
  const { update, issuesAt } = useEditor();
  const list = Array.isArray(value) ? (value as unknown[]) : [];
  const setList = (next: unknown[]) => update(path, next.length ? next : undefined);
  return (
    <div className="string-list" id={fieldId(path)}>
      {list.map((entry, i) => {
        const itemPath = [...path, i];
        const invalid = issuesAt(pathKey(itemPath)).length > 0;
        const v = typeof entry === "string" ? entry : String(entry);
        const onChange = (next: string | undefined) => setList(list.map((e, j) => (j === i ? (next ?? "") : e)));
        return (
          <div className="input-row" key={i}>
            {spec.itemWidget === "color" ? (
              <ColorInput id={fieldId(itemPath)} value={v} onChange={onChange} invalid={invalid} />
            ) : (
              <TextInput id={fieldId(itemPath)} value={v} onChange={onChange} invalid={invalid} />
            )}
            <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        );
      })}
      {list.map((_, i) => (
        <IssueList key={`i${i}`} issues={issuesAt(pathKey([...path, i]))} />
      ))}
      <button type="button" className="btn small" onClick={() => setList([...list, ""])}>
        + Add value
      </button>
    </div>
  );
}

/** Fields of a nested traits class. */
export function ClassFields({ className, path }: { className: string; path: Path }) {
  const { model } = useEditor();
  return (
    <>
      {model.classTraits(className).map((t) => (
        <TraitField key={t.name} className={className} trait={t} path={[...path, t.name]} />
      ))}
    </>
  );
}

const countSet = (v: unknown) => (isPlainObject(v) ? Object.keys(v).length : 0);

function ObjectField({
  className,
  trait,
  path,
  value,
  issues,
  typeLabel,
}: {
  className: string;
  trait: TraitDef;
  path: Path;
  value: unknown;
  issues: Issue[];
  typeLabel: string;
}) {
  const { update, filter, issuesUnder, fieldNote } = useEditor();
  const [open, setOpen] = useState(false);
  const n = countSet(value);
  const nestedErrors = issuesUnder(pathKey(path)).filter((i) => i.level === "error" && i.path !== pathKey(path)).length;
  const expanded = open || !!filter;
  return (
    <fieldset className={`field group${n ? " is-set" : ""}`} id={fieldId(path)}>
      <legend>
        <button type="button" className="disclosure" aria-expanded={expanded} onClick={() => setOpen(!open)}>
          {humanize(trait.name)}
        </button>
        <code className="trait-name">{trait.name}</code>
        <span className="type">{typeLabel}</span>
        {n > 0 && <span className="count">{n} set</span>}
        {nestedErrors > 0 && !expanded && <span className="badge error">{nestedErrors}</span>}
        {n > 0 && (
          <button type="button" className="link clear" onClick={() => update(path, undefined)}>
            clear
          </button>
        )}
        {fieldNote?.(path)}
      </legend>
      <IssueList issues={issues} />
      <Description text={trait.description} />
      {expanded && (
        <div className="nested">
          {extraActions(trait.name, path)}
          <ClassFields className={className} path={path} />
        </div>
      )}
    </fieldset>
  );
}

function ObjectArrayField({
  className,
  trait,
  path,
  value,
  issues,
}: {
  className: string;
  trait: TraitDef;
  path: Path;
  value: unknown;
  issues: Issue[];
}) {
  const { update, issuesUnder, filter, fieldNote } = useEditor();
  const list = Array.isArray(value) ? value : [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const setList = (next: unknown[]) => update(path, next.length ? next : undefined);
  const move = (i: number, d: number) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setList(next);
    setOpenIndex(i + d);
  };

  return (
    <fieldset className={`field group${list.length ? " is-set" : ""}`} id={fieldId(path)}>
      <legend>
        <span className="legend-title">{humanize(trait.name)}</span>
        <code className="trait-name">{trait.name}</code>
        <span className="type">{trait.type}</span>
        {list.length > 0 && <span className="count">{list.length}</span>}
        {fieldNote?.(path)}
      </legend>
      <IssueList issues={issues} />
      <Description text={trait.description} />
      <div className="cards">
        {list.map((entry, i) => {
          const entryPath = [...path, i];
          const open = openIndex === i || !!filter;
          const errors = issuesUnder(pathKey(entryPath)).filter((i) => i.level === "error").length;
          return (
            <div className="card" key={i} id={fieldId(entryPath)}>
              <div className="card-head">
                <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpenIndex(open ? null : i)}>
                  {cardTitle(entry, i)}
                </button>
                {errors > 0 && <span className="badge error">{errors}</span>}
                <span className="spacer" />
                <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
              {open && (
                <div className="nested">
                  <ClassFields className={className} path={entryPath} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          setList([...list, {}]);
          setOpenIndex(list.length);
        }}
      >
        + Add {className.replace(/Traits$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}
      </button>
    </fieldset>
  );
}

function cardTitle(entry: unknown, i: number): string {
  if (isPlainObject(entry)) {
    for (const k of ["name", "title", "layerName", "id", "url", "key"]) {
      const v = (entry as JsonObject)[k];
      if (typeof v === "string" && v) return v;
    }
  }
  return `Item ${i + 1}`;
}

/** Trait-specific helpers shown inside an object field. */
function extraActions(traitName: string, path: Path): ReactNode {
  if (path.length === 1 && traitName === "rectangle") return <RectangleFromCapabilities />;
  return null;
}
