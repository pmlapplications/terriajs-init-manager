-- Users of the layer manager and their login sessions.

set search_path = terria, public;

create table app_user (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  first_name    text not null,
  last_name     text not null,
  -- scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>, see server/passwords.ts
  password_hash text not null,
  created_at    timestamptz not null default now(),
  created_by    text,
  updated_at    timestamptz not null default now(),

  constraint email_is_trimmed check (email = btrim(email) and email <> '')
);

-- Emails are compared case-insensitively.
create unique index app_user_email_idx on app_user (lower(email));

create trigger app_user_touch before update on app_user
  for each row execute function touch_row();

-- Only a SHA-256 of the session token is stored, so a database leak does not
-- leak usable sessions.
create table app_session (
  token_hash   bytea primary key,
  user_id      uuid not null references app_user (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index app_session_user_idx on app_session (user_id);
create index app_session_expires_idx on app_session (expires_at);
