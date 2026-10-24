---
name: Branch-tip comparisons
description: Compare actual Jules and Replit branch state before proposing a port.
---

When checking whether Jules changes are missing from the current Replit branch, inspect both branch tips and their unique commits. A three-dot diff (`A...B`) compares the merge base to one side; it does not report the difference between the current contents of both branches.

**Why:** Jules and Replit can diverge substantially. A merge-base diff once made code already present on the Replit tip appear missing, leading to an incorrect diagnosis.

**How to apply:** Use `git show <branch>:<file>` or a two-tip comparison for relevant code, and inspect `git log A..B` to identify unique commits before claiming a change needs to be ported.
