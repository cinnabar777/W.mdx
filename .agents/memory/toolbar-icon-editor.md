---
name: Toolbar icon editor
description: User requirements for keeping toolbar icon discovery and customization complete and accessible.
---

Keep the key settings roomy and scrollable. Near the top, provide an icon-selection row that opens a separate, dismissible popup containing built-in search, the full icon list, Paste SVG, and Choose file. Do not put the search field or import buttons in the settings header or inline with the color controls. The selected toolbar key itself is the live preview; do not duplicate it in the header. When previewing a future gesture action, show the action and its assigned icon together as one pairing (for example, “Swipe up” beside its icon), not as separate action/icon areas or as an app icon.

Treat a folder as a toolbar key that contains popup keys, not as a permanent parent for those keys. The holding area is shared and flat: moving a folder there releases its popup keys individually, and a loose key can be placed wherever the user drops it; never automatically restore it to its former folder. Hide an empty folder from the layout, but do not silently delete a custom folder or its contents. Built-in keys cannot be deleted; custom keys and folders need explicit delete controls. Deleting a custom folder should release its contents individually rather than deleting them.

**Why:** The user specified that groups are keys/folders, the holding area is for freely arranging keys, and moving a folder there releases its contents instead of preserving a nested group. Reassigning a loose key to its former folder would defeat the purpose of a customizable toolbar. Empty folders are hidden, not silently deleted.

**How to apply:** Keep colors, reset, and the compact Preserve icon colors control in the scrollable key settings. Put icon search/import in its own popup with clear close, backdrop, and Escape behavior. Allow keys in the shared flat holding area to be placed where the user chooses, including another folder; retain built-in keys and require explicit deletion for custom keys/folders. Avoid adding a separate teal selected-state color; the toolbar key should use its configured active or background color, otherwise remain transparent.
