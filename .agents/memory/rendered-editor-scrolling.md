---
name: Rendered-editor scrolling
description: Known mobile scrolling behavior and guardrails for investigating it.
---

The user reports that the Markdown cheat sheet jumps more than larger ordinary documents, especially in WYSIWYG; Live Preview is better and Source mode does not show the same problem. The user suspects repeated styled lists, tables, and code blocks contribute.

**Why:** Recent diagnostics showed large content-height corrections alongside CodeMirror virtual spacer (`.cm-gap`) mutations, while measured code-header heights had no change. A global infinite viewport margin was tried in the past and replaced with a finite margin.

**How to apply:** Do not assume images or code-header height alone explain the jumps. Compare rendered modes and preserve the existing behavior of tables and Source mode when testing scoped virtualization changes.
