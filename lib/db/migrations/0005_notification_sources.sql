ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "source_id" integer;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_type_source_unique"
ON "notifications" ("user_id", "type", "source_id")
WHERE "source_id" IS NOT NULL;