import { useEffect, useState, type FormEvent } from "react";
import { createUser, deleteUser, listUsers, type NewUser, type User } from "./api";

const MIN_PASSWORD_LENGTH = 10; // matches server/passwords.ts

const EMPTY: NewUser & { confirm: string } = { email: "", firstName: "", lastName: "", password: "", confirm: "" };

export function UsersPage({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e: Error) => setError(e.message));
  }, []);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setMessage(null);
    if (form.password !== form.confirm) {
      setFormError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { confirm: _confirm, ...user } = form;
      void _confirm;
      const created = await createUser(user);
      setUsers((prev) => [...(prev ?? []), created].sort(byName));
      setForm(EMPTY);
      setMessage(`Created ${created.firstName} ${created.lastName}`);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (user: User) => {
    if (!confirm(`Delete ${user.firstName} ${user.lastName} (${user.email})? They will be logged out.`)) return;
    setError(null);
    setMessage(null);
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? null);
      setMessage(`Deleted ${user.firstName} ${user.lastName}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="page">
      {message && <p className="save-message ok">{message}</p>}

      <section className="section">
        <h2>Users</h2>
        {error && <p className="issues-inline error">{error}</p>}
        {!users && !error && <p className="hint">Loading…</p>}
        {users && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.firstName} {u.lastName}
                    </td>
                    <td>{u.email}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      {u.id === currentUser.id ? (
                        <span className="hint">You</span>
                      ) : (
                        <button type="button" className="btn small danger" onClick={() => remove(u)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Add a user</h2>
        <form className="user-form" onSubmit={create}>
          <label className="form-row">
            <span>First name</span>
            <input className="input" required autoComplete="off" value={form.firstName} onChange={set("firstName")} />
          </label>
          <label className="form-row">
            <span>Last name</span>
            <input className="input" required autoComplete="off" value={form.lastName} onChange={set("lastName")} />
          </label>
          <label className="form-row wide">
            <span>Email</span>
            <input className="input" type="email" required autoComplete="off" value={form.email} onChange={set("email")} />
          </label>
          <label className="form-row">
            <span>Password</span>
            <input
              className="input"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
            />
          </label>
          <label className="form-row">
            <span>Repeat password</span>
            <input
              className="input"
              type="password"
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
            />
          </label>
          <p className="hint wide">At least {MIN_PASSWORD_LENGTH} characters.</p>
          {formError && <p className="issues-inline error wide">{formError}</p>}
          <div className="wide">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

const byName = (a: User, b: User) =>
  a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" }) ||
  a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" });
