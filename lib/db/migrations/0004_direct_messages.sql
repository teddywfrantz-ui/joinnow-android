CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "sender_id" integer NOT NULL REFERENCES "users"("id"),
  "recipient_id" integer NOT NULL REFERENCES "users"("id"),
  "content" text NOT NULL,
  "meetup_id" integer REFERENCES "meetups"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "direct_messages_conversation_idx"
  ON "direct_messages" ("sender_id", "recipient_id", "created_at");

CREATE INDEX IF NOT EXISTS "direct_messages_recipient_idx"
  ON "direct_messages" ("recipient_id", "created_at");