import { pathKey, traitKind, type Path, type TraitDef } from "../terria/traits";
import type { CatalogModel } from "../terria/catalog-ui";

/** DOM id of the input for a trait path, used to scroll to issues. */
export const fieldId = (path: Path) => `f-${pathKey(path)}`;

/** True if the trait (or anything inside it) matches the search text. */
export function traitMatches(model: CatalogModel, trait: TraitDef, filter: string, depth = 0): boolean {
  if (!filter) return true;
  const f = filter.toLowerCase();
  if (trait.name.toLowerCase().includes(f) || trait.description.toLowerCase().includes(f)) return true;
  const kind = traitKind(trait.type);
  if (depth < 4 && (kind.kind === "object" || kind.kind === "objectArray")) {
    return model.classTraits(kind.className).some((t) => traitMatches(model, t, filter, depth + 1));
  }
  return false;
}
