---
name: Footnote insertion
description: User-defined WYSIWYG behavior for adding footnotes.
---

In true WYSIWYG mode, the footnote toolbar must open a popup where the user enters the footnote text. On completion, the editor inserts a standard Markdown reference such as `[^1]` at the cursor and appends its definition such as `[^1]: note text` after existing footnotes at the end of the document, using the next unused number. Cancel makes no changes.

**Why:** the user specified that entering footnote code directly is not suitable in true WYSIWYG mode.

**How to apply:** preserve the popup-based authoring flow when implementing or changing footnote insertion; confirm syntax, numbering, and note placement with the user rather than guessing.
