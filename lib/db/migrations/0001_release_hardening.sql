-- Release hardening migration.
-- This migration intentionally fails on duplicate participant rows instead of
-- deleting user data implicitly. Resolve duplicates and rerun if it fails.
CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "token" text NOT NULL UNIQUE,
  "platform" text NOT NULL DEFAULT 'android',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "auth_refresh_tokens" (
  "token_hash" text PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "auth_refresh_tokens_user_idx"
  ON "auth_refresh_tokens" ("user_id");

CREATE INDEX IF NOT EXISTS "auth_refresh_tokens_active_idx"
  ON "auth_refresh_tokens" ("token_hash", "expires_at")
  WHERE "revoked_at" IS NULL;

CREATE INDEX IF NOT EXISTS "push_tokens_user_idx" ON "push_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "meet_history_user_joined_at_idx"
  ON "meet_history" ("user_id", "joined_at");
CREATE INDEX IF NOT EXISTS "meet_history_meetup_idx"
  ON "meet_history" ("meetup_id");
CREATE INDEX IF NOT EXISTS "meetup_participants_meetup_idx"
  ON "meetup_participants" ("meetup_id");
CREATE INDEX IF NOT EXISTS "meetup_participants_user_idx"
  ON "meetup_participants" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meetup_participants_meetup_user_uidx"
  ON "meetup_participants" ("meetup_id", "user_id");