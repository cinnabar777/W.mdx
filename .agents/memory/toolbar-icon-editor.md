---
name: Toolbar icon editor
description: User requirements for keeping toolbar icon discovery and customization complete and accessible.
---

Keep the key settings roomy and scrollable. Near the top, provide an icon-selection row that opens a separate, dismissible popup containing built-in search, the full icon list, Paste SVG, and Choose file. Do not put the search field or import buttons in the settings header or inline with the color controls. The selected toolbar key itself is the live preview; do not duplicate it in the header. When previewing a future gesture action, show the action and its assigned icon together as one pairing (for example, “Swipe up” beside its icon), not as separate action/icon areas or as an app icon.

Treat a folder as a toolbar key that contains assigned popup keys. The holding area is shared and flat: when a folder is moved there, release its popup keys individually; never render the folder as a nested tray group. Keep popup keys assigned to their existing folder when restored. Hide an empty folder from the layout, but preserve its saved definition; only an explicit user delete may remove a user-created key or folder. Deleting a custom folder should release its contents individually rather than deleting them.

**Why:** The user specified that toolbar groups are folder keys, their popup items are locked to their current folder, and moving a folder to the holding area releases the items instead of preserving a nested group there. Empty folders are hidden, not deleted.

**How to apply:** Keep colors, reset, and the compact Preserve icon colors control in the scrollable key settings. Put icon search/import in its own popup with clear close, backdrop, and Escape behavior. Keep popup keys draggable within their assigned folder and into the shared flat holding area. Avoid adding a separate teal selected-state color; the toolbar key should use its configured active or background color, otherwise remain transparent.
