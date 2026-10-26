---
name: Branch-tip comparisons
description: Compare actual Jules and Replit branch state before proposing a port.
---

Use the existing `Replit` branch as the sole integration/build target. Do not create additional branches unless the user explicitly asks. Keep other refs as checkpoints rather than rewriting or deleting them.

When checking whether changes are missing from the current Replit branch, inspect both branch tips and their unique commits. A three-dot diff (`A...B`) compares the merge base to one side; it does not report the difference between the current contents of both branches.

**Why:** The user wants one branch to build and test, and branch proliferation makes it unclear which APK contains the current work. Jules and Replit can also diverge substantially; a merge-base diff once made code already present on the Replit tip appear missing.

**How to apply:** Before integrating, inventory local and remote refs, compare actual file contents and unique commits, then bring verified work onto existing `Replit`. Use `git show <branch>:<file>` or a two-tip comparison; do not create a new branch to stage the work.
