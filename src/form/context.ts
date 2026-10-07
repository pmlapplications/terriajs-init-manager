import { createContext, useContext } from "react";
import type { Capabilities } from "../terria/capabilities";
import type { CatalogModel } from "../terria/catalog-ui";
import type { JsonObject, Path } from "../terria/traits";
import type { Issue } from "../terria/validate";

export interface EditorContextValue {
  model: CatalogModel;
  item: JsonObject;
  update: (path: Path, value: unknown) => void;
  issuesAt: (path: string) => Issue[];
  /** Issues at `prefix` or any path nested inside it. */
  issuesUnder: (prefix: string) => Issue[];
  /** Report (or clear with null) text a field holds that is not yet a valid value. */
  setDraftError: (path: string, message: string | null) => void;
  capabilities: Capabilities | null;
  filter: string;
  onlySet: boolean;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used inside EditorContext");
  return ctx;
}
