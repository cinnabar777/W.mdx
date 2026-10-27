---
name: Floating toolbar separation
description: Product constraints for the editor's floating text-selection toolbar.
---

The floating selection toolbar has its own saved key layout and key settings, but reuses the bottom toolbar's renderer, action registry, and icon catalog. Its key width and end radius are floating-only settings; the remaining toolbar colors and labels follow the shared appearance settings. Its total width follows the number and width of keys and must stay within the visible viewport. In the shared settings page, keep the surface selector directly below collapsed global appearance controls, hide the floating-only category while those controls are collapsed, and show it near the bottom when expanded.

The bottom-toolbar toggle uses a proportional open size: 34 px when the toolbar height is 48 dp, scaling with toolbar height. Its closed state has independent width and height preferences, grouped with toggle colors immediately before the floating-toolbar section. When the floating toolbar is disabled, both WebView action-mode overloads must delegate to `super` so Android's native text-selection toolbar is restored; when enabled, return an empty action mode to suppress Android's menu without cancelling selection.

**Why:** the user explicitly wants the floating and bottom toolbars to be independently arranged while avoiding a duplicate action/icon implementation.

**How to apply:** preserve independent layouts when applying preferences or editing either toolbar. Keep action and icon behavior shared, use the floating-only width and radius settings, and clamp the selection toolbar and its popups to the visible viewport. Keep the surface selector out of the bottom dock, no-op when its active surface is tapped again, and preserve preview scroll position across real switches. Keep the settings WebView below the native appearance rows while the key editor opens; reserve enough dialog height for one expanded section, then cap it to the available viewport. For mutually exclusive editor sections, close the previous section in the new summary's click handler before the browser opens the new section. Select the native or custom text-selection toolbar according to `pref_toolbar_floating_enabled`, and keep ordinary editor taps able to open the Android keyboard: request the IME only from a short tap in CodeMirror content, not from toolbar taps.

**Why:** the browser's later `toggle` event can briefly leave two sections open during the handoff, causing visible flicker.

**Why:** the user reported that tapping document text no longer opened the Android keyboard after the toolbar work; native builds alone cannot verify IME visibility.
