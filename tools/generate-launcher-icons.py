#!/usr/bin/env python3
"""Generate the shared Android launcher icons using Python 3 and ImageMagick.

Normal use: python3 tools/generate-launcher-icons.py
Import the supplied two-color SVG once with: --import-svg path/to/logo.svg
The committed artwork contains only the logo, never a circular backplate.
"""

import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artwork" / "wmdx-mark.svg"
RES = ROOT / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
THEMES = {"": ("#171717", "#E5E5E5"), "night-": ("#E5E5E5", "#171717")}

# Android displays the middle 72dp of a 108dp adaptive layer. A 54dp-wide
# logo is 75% of that displayed icon, and its corners fit the 66dp safe circle.
ADAPTIVE_DP = 108
MARK_DP = 54
LEGACY_DP = 48


def magick(*args):
    subprocess.run(["magick", *map(str, args)], check=True)


def import_mark(path):
    root = ET.parse(path).getroot()
    marks = [p for p in root if p.tag.endswith("path") and p.get("fill") == "#181818"]
    if len(marks) != 1 or root.get("viewBox") != "0 0 1024 1024":
        raise ValueError("Expected the supplied 1024px two-color Wmdx SVG")
    # Exclude the complementary light path: it includes the entire background.
    mark = ET.Element("svg", {
        "xmlns": "http://www.w3.org/2000/svg",
        "viewBox": "0 0 1024 1024",
        "width": "1024",
        "height": "1024",
    })
    ET.SubElement(mark, "path", {
        "d": marks[0].get("d"),
        "fill": "#171717",
        "fill-rule": "evenodd",
    })
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(mark).write(SOURCE, encoding="utf-8", xml_declaration=True)


def generate():
    if not shutil.which("magick"):
        raise RuntimeError("ImageMagick's magick command is required")
    if not SOURCE.is_file():
        raise FileNotFoundError("Import the supplied SVG with --import-svg first")
    with tempfile.TemporaryDirectory(prefix="wmdx-icons-") as temporary:
        temp = Path(temporary)
        mark = temp / "mark.png"
        magick("-background", "none", "-density", "384", SOURCE,
               "-trim", "+repage", mark)
        for theme, (ink, background) in THEMES.items():
            for density, scale in DENSITIES.items():
                size = round(ADAPTIVE_DP * scale)
                foreground = RES / f"drawable-{theme}{density}" / "ic_launcher_foreground.png"
                foreground.parent.mkdir(parents=True, exist_ok=True)
                magick(mark, "-channel", "RGB", "-fill", ink, "-colorize", "100",
                       "+channel", "-resize", f"{round(MARK_DP * scale)}x",
                       "-gravity", "center", "-background", "none",
                       "-extent", f"{size}x{size}", "-depth", "8",
                       "-define", "png:color-type=4", foreground)

                # Standalone raster fallback for APK inspectors and older icon
                # consumers. Match the visible adaptive icon, not its 108dp layer.
                size = round(LEGACY_DP * scale)
                supersampled = size * 4
                legacy = temp / f"{theme}{density}.png"
                magick("-size", f"{supersampled}x{supersampled}", f"xc:{background}",
                       "(", mark, "-channel", "RGB", "-fill", ink, "-colorize", "100",
                       "+channel", "-resize", f"{round(supersampled * .75)}x", ")",
                       "-gravity", "center", "-compose", "Over", "-composite",
                       "(", "-size", f"{supersampled}x{supersampled}", "xc:none",
                       "-fill", "white", "-draw",
                       f"circle {supersampled / 2},{supersampled / 2} {supersampled / 2},0", ")",
                       "-alpha", "off", "-compose", "CopyOpacity", "-composite",
                       "-resize", f"{size}x{size}", "-depth", "8",
                       "-define", "png:color-type=4", legacy)
                directory = RES / f"mipmap-{theme}{density}"
                directory.mkdir(parents=True, exist_ok=True)
                for name in ("ic_launcher.png", "ic_launcher_round.png"):
                    shutil.copyfile(legacy, directory / name)
    print("Generated day/night adaptive layers and standalone APK icons at all five densities.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-svg", type=Path)
    args = parser.parse_args()
    if args.import_svg:
        import_mark(args.import_svg)
    generate()
