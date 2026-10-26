---
name: Toolbar icon editor
description: User requirements for keeping toolbar icon discovery and customization complete and accessible.
---

Keep the key settings roomy and scrollable. Near the top, provide an icon-selection row that opens a separate, dismissible popup containing built-in search, the full icon list, Paste SVG, and Choose file. Do not put the search field or import buttons in the settings header or inline with the color controls. The selected toolbar key itself is the live preview; do not duplicate it in the header. Reserve visible placeholders for a future action chip and its icon.

**Why:** The user asked to restore the spacious layout after the inline icon grid crowded settings, and specifically said the picker must open as a popup that can be dismissed without closing key settings.

**How to apply:** Keep colors, reset, and the compact Preserve icon colors control in the scrollable key settings. Put icon search/import in its own popup with clear close, backdrop, and Escape behavior. Avoid adding a separate teal selected-state color; the toolbar key should use its configured active or background color, otherwise remain transparent.
