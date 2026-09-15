# JoinNow production release checklist

## Required environment

- `DATABASE_URL`
- `SESSION_SECRET`
- `JWT_SECRET` (recommended; `SESSION_SECRET` remains a server-only fallback for compatibility)
- `CORS_ORIGINS` with the exact browser origins allowed to call the API
- `VITE_GOOGLE_MAPS_API_KEY` for the web build

Never put database credentials, signing secrets, or provider keys in frontend source or client storage.

## Database migrations

Run migrations from the database package before starting a release:

```sh
pnpm --filter @workspace/db migrate
```

The migration runner records applied filenames in `_app_migrations`, runs each migration in a transaction, and stops on the first failure. It intentionally does not delete duplicate participant rows; resolve those rows and rerun the migration if the unique index reports duplicates.

Do not use `push-force` against production. Keep a backup/snapshot before applying a production migration and verify that the migration completed before deploying the server.

## Server release checks

1. Run `pnpm typecheck`.
2. Run the API unit and integration tests.
3. Run the database migration command against a disposable database or a restored backup.
4. Start the API and confirm `/api/healthz` returns `{ "status": "ok" }`.
5. Verify login, logout, refresh-token rotation, push-token registration, Meet chat, Group chat, and a WebSocket reconnect.
6. Confirm a request from an unlisted `Origin` receives a 403 and that production does not expose test-token routes.

Production startup does not run demo seed data. Development seeding can be disabled with `DISABLE_STARTUP_SEED=true`.

## Operational expectations

- Keep database backups with a documented retention period and perform a restore drill before a major release.
- Alert on repeated health-check failures, migration failures, 5xx spikes, authentication failures, rate-limit responses, and WebSocket disconnect spikes.
- Treat notification delivery as best-effort; user actions must not depend on push delivery succeeding.