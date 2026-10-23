---
name: Footnote insertion
description: User-defined WYSIWYG behavior for adding footnotes.
---

In true WYSIWYG mode, the footnote toolbar must open a popup where the user enters the footnote text. On completion, the editor inserts the note text and its reference marker in their proper locations instead of only inserting raw syntax at the cursor.

**Why:** the user specified that entering footnote code directly is not suitable in true WYSIWYG mode.

**How to apply:** preserve the popup-based authoring flow when implementing or changing footnote insertion; confirm syntax, numbering, and note placement with the user rather than guessing.
