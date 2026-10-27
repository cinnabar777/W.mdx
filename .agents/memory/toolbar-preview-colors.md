---
name: Toolbar preview colors
description: User's requirements for toolbar key active-state colors and SVG icon tinting.
---

Toolbar active or selected states must not add an independent global icon-accent color. Keep the key's configured icon color; use its per-key active background when set, otherwise inherit the global active-key background color (defaulting to the theme's normal hover color). The preview must match the live toolbar. Tinting an SVG must preserve outline-only fills (`fill="none"`) so icons do not become heavy solid shapes.

**Why:** The user rejected an extra cyan icon tint that hid chosen colors, then explicitly requested a global selected/active key color. That setting is a background fallback, not a separate icon color. Custom SVGs also previously rendered too bold.

**How to apply:** When changing toolbar active states, keep the icon color unchanged and apply per-key active background over the global background fallback. Verify the same active appearance in the settings preview and live toolbar, and keep outlined SVGs outlined after sanitization.
