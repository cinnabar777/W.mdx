---
name: GitHub workflow write permissions
description: Distinguish restricted workflow-file updates from missing Git objects when pushing through this project's GitHub App.
---

The project's GitHub App connection can create blobs and update ordinary files,
but a Git Data tree containing changes to `.github/workflows/` is rejected with
HTTP 404. The same tree update excluding those workflow changes succeeds.
Existing workflows can still be dispatched.

**Why:** A controlled comparison verified that the repository, base tree, and
new blobs were accessible; only including workflow-file changes caused the
failure. Do not waste retries treating this as a missing repository or blob.

**How to apply:** If actual workflow changes are required, resolve the workflow
write permission first. If only an additional build verification is needed,
placing that verification in the shared build entry point can preserve the
existing workflow triggers and avoid modifying workflow files.
