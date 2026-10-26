---
name: Toolbar preview colors
description: User's requirements for toolbar key active-state colors and SVG icon tinting.
---

Toolbar key active or selected states must not add an independent global icon-accent color. The preview should use each key's configured icon and background colors. Tinting an SVG must preserve outline-only fills (`fill="none"`) so icons do not become heavy solid shapes.

**Why:** The user repeatedly called out an extra cyan active tint that hid chosen key colors, and custom icons rendered too bold in the chooser and toolbar.

**How to apply:** When changing toolbar active states or custom SVG handling, keep the selected key's colors visible and verify that outlined SVGs stay outlined after sanitization.
