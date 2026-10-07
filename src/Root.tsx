// Login gate and page switching. Nothing but the login form renders until the
// server confirms a session; the API enforces the same rule.

import { useEffect, useState } from "react";
import { currentUser, logout, UNAUTHORIZED_EVENT, type User } from "./api";
import App from "./App";
import { LoginPage } from "./LoginPage";
import { UsersPage } from "./UsersPage";
import "./App.css";

const PAGES = [
  { hash: "#/", title: "WMS editor" },
  { hash: "#/users", title: "Users" },
] as const;

type PageHash = (typeof PAGES)[number]["hash"];

const currentPage = (): PageHash => PAGES.find((p) => p.hash === location.hash)?.hash ?? "#/";

function useHashPage() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const onChange = () => setPage(currentPage());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return page;
}

export default function Root() {
  // undefined while the session is being checked.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const page = useHashPage();

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

  return (
    <>
      <nav className="page-nav" aria-label="Pages">
        {PAGES.map((p) => (
          <a key={p.hash} href={p.hash} aria-current={page === p.hash ? "page" : undefined}>
            {p.title}
          </a>
        ))}
        <span className="whoami" title={user.email}>
          {user.firstName} {user.lastName}
        </span>
        <button type="button" className="btn small" onClick={signOut}>
          Log out
        </button>
      </nav>
      {page === "#/users" ? <UsersPage currentUser={user} /> : <App />}
    </>
  );
}
