// Login gate and page switching. Nothing but the login form renders until the
// server confirms a session; the API enforces the same rule.
//
// Routes: #/ lists all stored catalog items and groups, #/new picks a type to
// create, #/item/<type> and #/group/<type> edit a catalog item or group of that
// type, #/init-files lists init files, #/init-files/new and #/init-files/<id>
// edit one, #/users manages users, and #/docs/<page> shows the documentation.

import { useEffect, useState } from "react";
import { currentUser, loadConfig, logout, UNAUTHORIZED_EVENT, type MemberListEntry, type User } from "./api";
import App from "./App";
import { CatalogPage } from "./CatalogPage";
import { DocsPage } from "./DocsPage";
import { clearDraft, hasDraft, loadRecord, saveDraft, saveDraftMembers, saveRecord } from "./drafts";
import { InitFileEditor } from "./InitFileEditor";
import { InitFilesPage } from "./InitFilesPage";
import { LoginPage } from "./LoginPage";
import { NewPage } from "./NewPage";
import { kindOf, loadModel, typeLabel, type CatalogModel } from "./terria/catalog-ui";
import { UsersPage } from "./UsersPage";
import "./App.css";

type Route =
  | { page: "catalog" }
  | { page: "new" }
  | { page: "item"; type: string }
  | { page: "initFiles" }
  // `visit` changes on every navigation, so each visit to "new" starts afresh.
  | { page: "initFile"; id: string | null; visit: number }
  | { page: "users" }
  // `visit` reloads the docs when the menu item is clicked while reading them.
  | { page: "docs"; path: string; visit: number };

let visits = 0;

function currentRoute(): Route {
  if (location.hash === "#/users") return { page: "users" };
  const docs = /^#\/docs(?:\/(.*))?$/.exec(location.hash);
  if (docs) return { page: "docs", path: docs[1] ?? "", visit: ++visits };
  if (location.hash === "#/new") return { page: "new" };
  if (location.hash === "#/init-files") return { page: "initFiles" };
  const initFile = /^#\/init-files\/([\w-]+)$/.exec(location.hash)?.[1];
  if (initFile) return { page: "initFile", id: initFile === "new" ? null : initFile, visit: ++visits };
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

  // Opens an unsaved copy in the editor; "Save new" then stores it as a new
  // config. The Terria id and share keys must be unique, so the copy has none.
  const duplicateMember = async (entry: MemberListEntry) => {
    const type = entry.type;
    if (hasDraft(type) && !confirm(`Replace the current ${type} form with a copy of “${entry.name}”?`)) return;
    try {
      const config = await loadConfig(entry.kind, type, entry.id);
      const { id: _id, shareKeys: _shareKeys, ...item } = config.item;
      saveDraft(type, { ...item, name: `Copy of ${config.name}` });
      saveDraftMembers(type, config.members ?? []);
      saveRecord(type, null);
      setGeneration((g) => g + 1);
      location.hash = editorHash(type);
    } catch (e) {
      alert(`Could not duplicate “${entry.name}”: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <nav className="page-nav" aria-label="Pages">
        <a href="#/" aria-current={route.page === "catalog" ? "page" : undefined}>
          Catalog items
        </a>
        <a href="#/new" aria-current={route.page === "new" ? "page" : undefined}>
          Create New
        </a>
        <a href={editorHash(editingType)} aria-current={route.page === "item" ? "page" : undefined}>
          {typeLabel(editingType)} editor
        </a>
        <a href="#/init-files" aria-current={route.page === "initFiles" || route.page === "initFile" ? "page" : undefined}>
          Init files
        </a>
        <a href="#/users" aria-current={route.page === "users" ? "page" : undefined}>
          Users
        </a>
        <a href="#/docs" aria-current={route.page === "docs" ? "page" : undefined}>
          Docs
        </a>
        <span className="whoami" title={user.email}>
          {user.firstName} {user.lastName}
        </span>
        <span className="app-version" title="TerriaJS Init Manager version">
          v{__APP_VERSION__}
        </span>
        <button type="button" className="btn small" onClick={signOut}>
          Log out
        </button>
      </nav>
      {route.page === "docs" ? (
        <DocsPage key={route.visit} page={route.path} />
      ) : route.page === "users" ? (
        <UsersPage currentUser={user} />
      ) : route.page === "catalog" ? (
        <CatalogPage onOpen={openMember} onDuplicate={duplicateMember} />
      ) : route.page === "new" ? (
        <NewPage onCreate={createNew} />
      ) : route.page === "initFiles" ? (
        <InitFilesPage />
      ) : route.page === "initFile" ? (
        <InitFileEditor key={route.id ?? `new-${route.visit}`} id={route.id} />
      ) : (
        <ItemEditor type={route.type} generation={generation} />
      )}
    </>
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
