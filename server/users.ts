// Users and login sessions.

import { createHash, randomBytes } from "node:crypto";
import { PG_UNIQUE_VIOLATION, pgErrorCode, pool } from "./db.ts";
import { ApiError } from "./errors.ts";
import { DUMMY_HASH, MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "./passwords.ts";

export const SESSION_HOURS = 12;

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
}

const USER_COLUMNS = "u.id, u.email, u.first_name, u.last_name, u.created_at";

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  createdAt: row.created_at.toISOString(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// scrypt is deliberately slow; cap input so huge passwords can't tie up the server.
const MAX_PASSWORD_LENGTH = 1024;

function requiredString(body: Record<string, unknown>, key: string, label: string): string {
  const v = body[key];
  if (typeof v !== "string" || !v.trim()) throw new ApiError(400, `${label} is required`);
  return v.trim();
}

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export function parseNewUser(body: unknown): NewUser {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const email = requiredString(b, "email", "Email");
  if (!EMAIL.test(email)) throw new ApiError(400, "Email address is not valid");
  const password = typeof b.password === "string" ? b.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) throw new ApiError(400, "Password is too long");
  return {
    email,
    firstName: requiredString(b, "firstName", "First name"),
    lastName: requiredString(b, "lastName", "Last name"),
    password,
  };
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await pool.query<UserRow>(`select ${USER_COLUMNS} from app_user u order by lower(u.last_name), lower(u.first_name)`);
  return rows.map(toUser);
}

export async function createUser(user: NewUser, createdBy: string | null): Promise<User> {
  try {
    const { rows } = await pool.query<UserRow>(
      `insert into app_user as u (email, first_name, last_name, password_hash, created_by)
       values ($1, $2, $3, $4, $5)
       returning ${USER_COLUMNS}`,
      [user.email, user.firstName, user.lastName, await hashPassword(user.password), createdBy],
    );
    return toUser(rows[0]);
  } catch (e) {
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) throw new ApiError(409, `A user with email ${user.email} already exists`);
    throw e;
  }
}

/** Deletes a user and ends their sessions. Users cannot delete themselves, so someone can always log in. */
export async function deleteUser(id: string, currentUserId: string): Promise<void> {
  if (id === currentUserId) throw new ApiError(400, "You cannot delete your own account");
  if (!UUID.test(id)) throw new ApiError(404, "No such user");
  const { rowCount } = await pool.query("delete from app_user where id = $1", [id]);
  if (!rowCount) throw new ApiError(404, "No such user");
}

const hashToken = (token: string) => createHash("sha256").update(token).digest();

/** Checks credentials and starts a session. The returned token goes in the session cookie. */
export async function login(email: unknown, password: unknown): Promise<{ token: string; user: User }> {
  const fail = () => new ApiError(401, "Incorrect email or password");
  if (typeof email !== "string" || typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) throw fail();

  const { rows } = await pool.query<UserRow & { password_hash: string }>(
    `select ${USER_COLUMNS}, u.password_hash from app_user u where lower(u.email) = lower($1)`,
    [email.trim()],
  );
  const ok = await verifyPassword(password, rows[0]?.password_hash ?? DUMMY_HASH);
  if (!rows[0] || !ok) throw fail();

  const token = randomBytes(32).toString("base64url");
  await pool.query("delete from app_session where expires_at < now()");
  await pool.query(
    `insert into app_session (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(hours => $3))`,
    [hashToken(token), rows[0].id, SESSION_HOURS],
  );
  return { token, user: toUser(rows[0]) };
}

/** The user a session token belongs to, or null if it is unknown or expired. */
export async function sessionUser(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const { rows } = await pool.query<UserRow>(
    `select ${USER_COLUMNS} from app_session s join app_user u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await pool.query("delete from app_session where token_hash = $1", [hashToken(token)]);
}
