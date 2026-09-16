CREATE TABLE IF NOT EXISTS "oauth_accounts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "oauth_accounts_provider_account_unique"
    UNIQUE ("provider", "provider_account_id"),
  CONSTRAINT "oauth_accounts_user_provider_unique"
    UNIQUE ("user_id", "provider")
);