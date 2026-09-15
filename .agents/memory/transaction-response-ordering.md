---
name: Transaction response ordering
description: Concurrency rule for API mutations that write through a database transaction.
---

Never send the HTTP success response from inside a database transaction. Return the created or updated value from the transaction, await the commit, and only then serialize the response.

**Why:** Clients can receive a response before the transaction commits, then immediately read the row and observe missing or stale data. That makes otherwise-correct concurrency tests flaky and can confuse real clients.

**How to apply:** For any Express handler using `db.transaction`, keep early error responses explicit but move successful `res.json` calls after the transaction promise resolves.