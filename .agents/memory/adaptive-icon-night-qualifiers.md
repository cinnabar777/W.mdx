---
name: Adaptive icon night qualifiers
description: Keep night-mode raster fallbacks from overriding Android adaptive launcher icons.
---

When an app supplies night-qualified legacy launcher PNGs, also supply matching
night-qualified `anydpi-v26` adaptive icons. Android matches the night
configuration before density; a night PNG can otherwise beat a day-only
adaptive XML, leaving the launcher to place a legacy round icon inside its own
mask.

**Why:** The user's screenshot showed a circular inner badge and a separate
light outer mask even though the adaptive foreground itself had no badge. The
packaged release resource table confirmed night PNGs but no night adaptive XML.

**How to apply:** For each launcher resource, verify default and night
configurations both resolve to an adaptive XML and that both use the same
foreground/background resource IDs. Test the packaged resource table, not only
the source XML.
