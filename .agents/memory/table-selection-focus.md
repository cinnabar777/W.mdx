---
name: Table selection focus
description: Preserves independent selected cells across tables while targeting table toolbar actions to the most recent tap.
---

Keep selected-cell state per table, but show the highlight only for the table whose cell was tapped most recently. Clear the active highlight when a pointer moves into regular editor text; tapping a cell in another table makes that table active.

**Why:** The user clarified that cell selection can move independently within multiple tables, but the visible highlight should not remain on a table after focus moves to text or another cell.

**How to apply:** Store selection data per table. Update the shared toolbar target only after an actual cell tap, refresh highlights when that active target changes, and do not let another table's mount or redraw steal focus.
