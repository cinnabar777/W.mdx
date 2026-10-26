---
name: Toolbar icon editor
description: User requirements for keeping toolbar icon discovery and customization complete and accessible.
---

Keep the key settings roomy and scrollable. Near the top, provide an icon-selection row that opens a separate, dismissible popup containing built-in search, the full icon list, Paste SVG, and Choose file. Do not put the search field or import buttons in the settings header or inline with the color controls. The selected toolbar key itself is the live preview; do not duplicate it in the header. When previewing a future gesture action, show the action and its assigned icon together as one pairing (for example, “Swipe up” beside its icon), not as separate action/icon areas or as an app icon.

**Why:** The user clarified that the future UI pairs an action label with that action's icon, and that the earlier split “Action chip” / “Action icon” layout was misleading.

**How to apply:** Keep colors, reset, and the compact Preserve icon colors control in the scrollable key settings. Put icon search/import in its own popup with clear close, backdrop, and Escape behavior. Keep toolbar group actions draggable, reorderable within their group, and available in the holding area when hidden. If a whole group is hidden, keep its contained actions visible with the group in the editor. Avoid adding a separate teal selected-state color; the toolbar key should use its configured active or background color, otherwise remain transparent.
