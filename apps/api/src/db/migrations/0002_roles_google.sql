ALTER TABLE users
  ADD COLUMN role        text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  ADD COLUMN comped      boolean NOT NULL DEFAULT false,
  ADD COLUMN google_sub  text UNIQUE,
  ADD COLUMN name        text,
  ADD COLUMN avatar_url  text;

CREATE TABLE oauth_states (
  state_hash  text PRIMARY KEY,
  redirect    text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
