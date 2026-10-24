---
name: Color picker alpha
description: Expected alpha behavior when selecting colors in the shared app picker.
---

Tapping the hue or saturation/value selection area changes the color while preserving its current alpha. Do not automatically make a fully transparent color opaque.

**Why:** The user clarified that the selected color must retain its existing opacity, including values set to `00`.

**How to apply:** Keep RGB selection and opacity independent when changing the shared Android color picker or any settings that use it.
