---
name: GitHub empty-repo uploads
description: Connector-specific requirement for building a complete repository tree through GitHub's Git Data API.
---

When uploading a complete source tree through the GitHub connector, initialize the empty repository with a first commit and branch before creating Git blobs and trees.

**Why:** GitHub returns `409 Git Repository is empty` for blob creation before the repository has an initial branch. The connector also enforces a 10-request-per-second limit.

**How to apply:** Create an initial file on the intended default branch, then build blobs and a tree based on that initial commit. Throttle blob requests below 10 per second and retry HTTP 429 responses.