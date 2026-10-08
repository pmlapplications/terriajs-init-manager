// Login gate and page switching. Nothing but the login form renders until the
// server confirms a session; the API enforces the same rule.
//
// Routes: #/ lists all stored catalog items and groups, #/item/<type> and
// #/group/<type> edit a catalog item or group of that type, #/users manages users.

import { useEffect, useRef, useState } from "react";
import { currentUser, loadConfig, logout, UNAUTHORIZED_EVENT, type MemberListEntry, type User } from "./api";
import App from "./App";
import { CatalogPage } from "./CatalogPage";
import { clearDraft, hasDraft, loadRecord, saveDraft, saveDraftMembers, saveRecord } from "./drafts";
import { LoginPage } from "./LoginPage";
import { groupTypes, itemTypes, kindOf, loadModel, typeLabel, type CatalogModel, type ItemType } from "./terria/catalog-ui";
import { UsersPage } from "./UsersPage";
import "./App.css";

type Route = { page: "catalog" } | { page: "item"; type: string } | { page: "users" };

function currentRoute(): Route {
  if (location.hash === "#/users") return { page: "users" };
  const type = /^#\/(?:item|group)\/([\w-]+)$/.exec(location.hash)?.[1];
  return type ? { page: "item", type } : { page: "catalog" };
}

function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

const editorHash = (type: string) => `#/${kindOf(type)}/${type}`;

export default function Root() {
  // undefined while the session is being checked.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  // The item type last edited, so the editor link survives a visit to Users.
  const [editingType, setEditingType] = useState(route.page === "item" ? route.type : "wms");
  if (route.page === "item" && route.type !== editingType) setEditingType(route.type);
  // Bumped by "Create New" to remount the editor with a cleared draft.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    currentUser()
      .then(setUser)
      .catch((e: Error) => setError(`Could not reach the server: ${e.message}`));
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (error) return <p className="issues-inline error page-message">{error}</p>;
  if (user === undefined) return <p className="hint page-message">Loading…</p>;
  if (user === null) return <LoginPage onLogin={setUser} />;

  const signOut = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  };

  const createNew = (type: string) => {
    if (!hasDraft(type) || confirm(`Clear the current ${type} form and start a new item? Cancel opens the form as it is.`)) {
      clearDraft(type);
      setGeneration((g) => g + 1);
    }
    location.hash = editorHash(type);
  };

  const openMember = async (entry: MemberListEntry) => {
    const type = entry.type;
    if (hasDraft(type) && loadRecord(type)?.id !== entry.id && !confirm(`Replace the current ${type} form with “${entry.name}”?`)) return;
    try {
      const config = await loadConfig(entry.kind, type, entry.id);
      saveDraft(type, config.item);
      saveDraftMembers(type, config.members ?? []);
      saveRecord(type, { id: config.id, version: config.version, name: config.name });
      setGeneration((g) => g + 1);
      location.hash = editorHash(type);
    } catch (e) {
      alert(`Could not open “${entry.name}”: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <nav className="page-nav" aria-label="Pages">
        <a href="#/" aria-current={route.page === "catalog" ? "page" : undefined}>
          Catalog items
        </a>
        <CreateNewMenu onCreate={createNew} />
        <a href={editorHash(editingType)} aria-current={route.page === "item" ? "page" : undefined}>
          {typeLabel(editingType)} editor
        </a>
        <a href="#/users" aria-current={route.page === "users" ? "page" : undefined}>
          Users
        </a>
        <span className="whoami" title={user.email}>
          {user.firstName} {user.lastName}
        </span>
        <button type="button" className="btn small" onClick={signOut}>
          Log out
        </button>
      </nav>
      {route.page === "users" ? (
        <UsersPage currentUser={user} />
      ) : route.page === "catalog" ? (
        <CatalogPage onOpen={openMember} />
      ) : (
        <ItemEditor type={route.type} generation={generation} />
      )}
    </>
  );
}

// The plain group, whose members are picked here, comes first.
const menuSections: { title: string; types: ItemType[] }[] = [
  { title: "Items", types: itemTypes },
  { title: "Groups", types: [...groupTypes].sort((a, b) => Number(b.type === "group") - Number(a.type === "group")) },
];

function CreateNewMenu({ onCreate }: { onCreate: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-menu" ref={ref}>
      <button type="button" className="nav-menu-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Create New <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="nav-menu-list">
          {menuSections.map(({ title, types }) => (
            <section key={title}>
              <h3>{title}</h3>
              <ul aria-label={title}>
                {types.map((t) => (
                  <li key={t.type}>
                    <button
                      type="button"
                      title={t.model}
                      onClick={() => {
                        setOpen(false);
                        onCreate(t.type);
                      }}
                    >
                      <span>{typeLabel(t.type)}</span>
                      <code>{t.type}</code>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemEditor({ type, generation }: { type: string; generation: number }) {
  const [loaded, setLoaded] = useState<{ type: string; model?: CatalogModel; error?: string } | null>(null);

  useEffect(() => {
    let live = true;
    loadModel(type).then(
      (model) => live && setLoaded({ type, model }),
      (e: Error) => live && setLoaded({ type, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [type]);

  if (loaded?.type !== type) return <p className="hint page-message">Loading…</p>;
  if (!loaded.model) return <p className="issues-inline error page-message">{loaded.error}</p>;
  return <App key={`${type}:${generation}`} model={loaded.model} />;
}
