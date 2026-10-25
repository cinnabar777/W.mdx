# Wmdx launcher artwork

`wmdx-mark.svg` preserves the logo path from the user-supplied SVG, with its
background removed. It is the source for both debug and release icon assets.

To regenerate the committed Android PNGs:

```sh
python3 tools/generate-launcher-icons.py
```

Requires Python 3 and ImageMagick 7. Generation is a development operation;
Android builds do not need either tool.

The adaptive foreground is transparent, with the complete logo centered at
54dp wide on a 108dp layer. Android displays the central 72dp, so the logo
occupies 75% of the displayed icon and stays inside its 66dp safe circle.
The background fills Android's mask, not a smaller circular badge.

Both the default and `night` configurations must provide `anydpi-v26` adaptive
XML for the regular and round launcher icons. Android matches night mode before
density: otherwise the night-specific legacy PNGs override the default
adaptive XML and the launcher can wrap the legacy circle in another background.

Light uses a dark mark on `#E5E5E5`; dark uses a light mark on `#171717`.
Standalone fallback PNGs use the same visible scale and colors for APK
inspectors. A monochrome themed-icon layer is intentionally not supplied:
it allows launchers to replace these colors with a system accent.

Android launchers still control the final mask, shadows, caching, and any
user-enabled icon-pack treatment. Day/night resource switching may require
the launcher to refresh its cached icons.
