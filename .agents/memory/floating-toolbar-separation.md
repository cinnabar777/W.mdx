---
name: Floating toolbar separation
description: Product constraints for the editor's floating text-selection toolbar.
---

The floating selection toolbar has its own saved key layout and key settings, but reuses the bottom toolbar's renderer, action registry, and icon catalog. Its key width and end radius are floating-only settings; the remaining toolbar colors and labels follow the shared appearance settings. Its total width follows the number and width of keys and must stay within the visible viewport. In the shared settings page, keep the surface selector directly below collapsed global appearance controls, hide the floating-only category while those controls are collapsed, and show it near the bottom when expanded.

**Why:** the user explicitly wants the floating and bottom toolbars to be independently arranged while avoiding a duplicate action/icon implementation.

**How to apply:** preserve independent layouts when applying preferences or editing either toolbar. Keep action and icon behavior shared, use the floating-only width and radius settings, and clamp the selection toolbar and its popups to the visible viewport. Keep the surface selector out of the bottom dock, no-op when its active surface is tapped again, and preserve preview scroll position across real switches. Keep the settings WebView below the native appearance rows while the key editor opens; size its dialog to content up to a viewport-safe maximum. To replace Android's native selection menu without cancelling WebView text selection, return an empty `ActionMode` from both `startActionMode` overloads in the custom WebView; returning `null` cancels the selection action mode.
