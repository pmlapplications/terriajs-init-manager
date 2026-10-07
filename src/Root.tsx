// Login gate and page switching. Nothing but the login form renders until the
// server confirms a session; the API enforces the same rule.
//
// Routes: #/item/<type> edits a catalog item of that type (#/ is the WMS
// editor), #/users manages users.

import { useEffect, useRef, useState } from "react";
import { currentUser, logout, UNAUTHORIZED_EVENT, type User } from "./api";
import App from "./App";
import { clearDraft, hasDraft } from "./drafts";
import { LoginPage } from "./LoginPage";
import { itemTypes, loadModel, shortModelName, type CatalogModel } from "./terria/catalog-ui";
import { UsersPage } from "./UsersPage";
import "./App.css";

type Route = { page: "item"; type: string } | { page: "users" };

function currentRoute(): Route {
  if (location.hash === "#/users") return { page: "users" };
  const type = /^#\/item\/([\w-]+)$/.exec(location.hash)?.[1];
  return { page: "item", type: type ?? "wms" };
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

const modelName = (type: string) => shortModelName(itemTypes.find((t) => t.type === type)?.model ?? type);

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
    location.hash = `#/item/${type}`;
  };

  return (
    <>
      <nav className="page-nav" aria-label="Pages">
        <CreateNewMenu onCreate={createNew} />
        <a href={`#/item/${editingType}`} aria-current={route.page === "item" ? "page" : undefined}>
          {modelName(editingType)} editor
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
      {route.page === "users" ? <UsersPage currentUser={user} /> : <ItemEditor type={route.type} generation={generation} />}
    </>
  );
}

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
        <ul className="nav-menu-list" aria-label="Catalog item types">
          {itemTypes.map((t) => (
            <li key={t.type}>
              <button
                type="button"
                title={t.model}
                onClick={() => {
                  setOpen(false);
                  onCreate(t.type);
                }}
              >
                <span>{shortModelName(t.model)}</span>
                <code>{t.type}</code>
              </button>
            </li>
          ))}
        </ul>
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
