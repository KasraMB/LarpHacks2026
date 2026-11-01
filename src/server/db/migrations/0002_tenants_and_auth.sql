-- Existing unowned data remains inaccessible to signed-in users.
CREATE TABLE auth_user (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false, image text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_session (
  id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text, user_agent text, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE INDEX auth_session_user ON auth_session(user_id);
CREATE TABLE auth_account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token text, refresh_token text, id_token text,
  access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_account_provider_account UNIQUE(provider_id,account_id)
);
CREATE INDEX auth_account_user ON auth_account(user_id);
CREATE TABLE auth_verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
DROP INDEX identity_singleton;
ALTER TABLE identities ADD COLUMN owner_user_id text REFERENCES auth_user(id);
CREATE UNIQUE INDEX identity_owner_user ON identities(owner_user_id);
CREATE UNIQUE INDEX identity_unowned_singleton ON identities(singleton) WHERE owner_user_id IS NULL;
ALTER TABLE interests ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','private'));
UPDATE interests SET payload=payload || jsonb_build_object('visibility','private','ownerUserId',NULL);
CREATE TABLE auth_rate_limit (
  id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, last_request bigint NOT NULL
);
