#!/usr/bin/env python3
"""Build the offline Markdown phone-test MDZip package from its source files."""

from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "Markdown-Phone-Test-Assets"
OUTPUT = ROOT / "Markdown-Phone-Test.mdz"
ENTRY_POINT = "Markdown-Phone-Test.md"
SOURCE_FILES = (
    ROOT / ENTRY_POINT,
    ROOT / "Markdown-Phone-Test-Embed.md",
)

MANIFEST = {
    "spec": {"name": "mdzip-spec", "version": "1.2.1"},
    "title": "Markdown Phone Rendering Test",
    "mode": "document",
    "entryPoint": ENTRY_POINT,
}


def build() -> None:
    missing_sources = [str(path) for path in SOURCE_FILES if not path.is_file()]
    assets = sorted(path for path in ASSETS.rglob("*") if path.is_file())
    if missing_sources:
        raise SystemExit(f"Missing MDZip source file(s): {', '.join(missing_sources)}")
    if not assets:
        raise SystemExit(f"No packaged media files found under {ASSETS}")

    with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=8) as archive:
        archive.writestr("manifest.json", json.dumps(MANIFEST, indent=2) + "\n")
        for path in SOURCE_FILES:
            archive.write(path, path.relative_to(ROOT).as_posix())
        for path in assets:
            archive.write(path, path.relative_to(ASSETS).as_posix())

    print(f"Built {OUTPUT.name} with {len(SOURCE_FILES) + len(assets) + 1} files")


if __name__ == "__main__":
    build()
