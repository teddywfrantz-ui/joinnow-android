---
name: Server-only auth secrets
description: Security constraint for signing JoinNow sessions and JWT access/refresh tokens.
---

JWT and session signing must use a private server-only secret and fail startup when one is unavailable. Never fall back to public deployment identifiers or static strings.

**Why:** Public or predictable signing keys let attackers forge identities and bypass API and meetup-chat authorization.

**How to apply:** Any authentication or realtime authorization change must keep signing secrets server-only, validate access-token type where access is required, and reject startup rather than silently weakening security.