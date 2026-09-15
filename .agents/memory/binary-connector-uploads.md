---
name: Binary connector uploads
description: How to avoid silent truncation when uploading binary assets through an authenticated connector.
---

Read binary files directly with Node filesystem APIs inside the same impure function that performs the connector upload. Do not pass large base64 strings through durable shell callback output.

**Why:** Durable shell output may be capped below its requested maximum without preserving a usable full base64 payload. The API can accept the resulting truncated file, making the upload appear successful until another tool tries to parse it.

**How to apply:** For binary GitHub uploads, read the workspace file as a Buffer inside the impure function, encode it there, upload it there, and verify the remote size equals the local byte length.