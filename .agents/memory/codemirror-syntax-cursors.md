---
name: CodeMirror syntax cursors
description: Lezer cursor mutability and efficient editor syntax-state checks
---

Lezer `syntaxTree().iterate({enter})` supplies a mutable `TreeCursor` that is reused as traversal advances. Do not retain cursor objects from callbacks; copy needed positions and names immediately, or use `resolveInner` for a syntax node. For frequently refreshed toolbar state, resolve near the caret and scan only the relevant line instead of traversing the whole document.

**Why:** Retaining a cursor reference changes its apparent range after the callback, producing incorrect formatting boundaries. Repeated whole-document scans on every cursor movement can also make editing feel slower.

**How to apply:** When building decorations or toolbar state from a syntax tree, keep only stable primitive positions and scope repeated queries to the current selection or line.
