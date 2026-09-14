---
name: GitHub sync fallback
description: What to do when both command-line Git authentication and connector API requests fail.
---

Preserve the local commit and verify the connector's authorized repository before retrying; a stale local origin may point at a different owner/repository.

**Why:** Command-line Git can lack valid repository authentication while an attached GitHub connector exists, and the connector account may expose a renamed or different repository than the local remote.

**How to apply:** After verifying the intended commit exists locally, try the normal push once, inspect the connector's repository list if it returns 404, and push through the authorized Git Data API only to the confirmed target. If neither path works, direct the user to authenticate and push from the Git pane.