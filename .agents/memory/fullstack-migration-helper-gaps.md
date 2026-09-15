---
name: Full-stack migration helper gaps
description: Checks needed after using the legacy full-stack copy helpers.
---

After running the full-stack backend and frontend copy helpers, explicitly verify that top-level route entry files and the legacy public asset directory were copied. The helpers may copy route subdirectories and client source while omitting those files.

**Why:** A migration appeared successful but lacked the main route registry and branded public assets, which would have removed most API behavior and visible product identity.

**How to apply:** Compare detected route entry points and the legacy public directory against the migrated artifacts before starting workflows.