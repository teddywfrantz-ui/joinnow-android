CREATE TABLE IF NOT EXISTS "meetup_invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "meetup_id" integer NOT NULL,
  "inviter_id" integer NOT NULL,
  "invitee_id" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "meetup_invitations_meetup_id_fkey"
    FOREIGN KEY ("meetup_id") REFERENCES "meetups"("id"),
  CONSTRAINT "meetup_invitations_inviter_id_fkey"
    FOREIGN KEY ("inviter_id") REFERENCES "users"("id"),
  CONSTRAINT "meetup_invitations_invitee_id_fkey"
    FOREIGN KEY ("invitee_id") REFERENCES "users"("id"),
  CONSTRAINT "meetup_invitations_meetup_invitee_uidx"
    UNIQUE ("meetup_id", "invitee_id")
);

CREATE INDEX IF NOT EXISTS "meetup_invitations_meetup_idx"
  ON "meetup_invitations" ("meetup_id");

CREATE INDEX IF NOT EXISTS "meetup_invitations_invitee_status_idx"
  ON "meetup_invitations" ("invitee_id", "status");