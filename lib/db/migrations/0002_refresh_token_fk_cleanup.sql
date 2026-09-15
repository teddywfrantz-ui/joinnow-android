ALTER TABLE "auth_refresh_tokens"
  DROP CONSTRAINT IF EXISTS "auth_refresh_tokens_user_id_fkey";

ALTER TABLE "auth_refresh_tokens"
  ADD CONSTRAINT "auth_refresh_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;