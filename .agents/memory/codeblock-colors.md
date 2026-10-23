---
name: Code-block colors
description: User-defined separation of code text background from the full block and header controls.
---

Add a separate code-text background color that covers only the code text, as shown in the user's screenshot. Keep the existing code-block background as the full-area background; changing one must not replace or conflate the other.

**Why:** the current full code-block background does not provide the contrasting background behind the text that the user wants.

**How to apply:** implement and label the text-only fill separately from the full code-block surface; confirm how borders for the code header and copy button should be controlled.
