---
name: Table selection focus
description: Preserves independent selected cells across tables while targeting table toolbar actions to the most recent tap.
---

Keep selected-cell state per table. Multiple tables may retain their own selected cells at the same time; tapping another cell moves the active selection within that table.

**Why:** The user clarified that multiple table cells can remain selected across multiple tables, so a single global action target must not be overwritten by an unrelated table redraw.

**How to apply:** Update the shared table-toolbar target only after an actual cell selection. When widgets are recreated, rebind only the table that was most recently tapped; do not let another table's mount or redraw steal focus.
