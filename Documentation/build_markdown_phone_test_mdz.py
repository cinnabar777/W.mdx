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
    ROOT / "Markdown-Phone-Test-Checklist.md",
    ROOT / "Markdown-Phone-Test-Image.png",
)
REQUIRED_ASSET_PATHS = {
    "attachments/phone-test-attachment.pdf",
    "attachments/phone-test-data.zip",
    "attachments/phone-test-notes.txt",
    "audio/phone-test-chime.wav",
    "media/phone-test-fern.png",
    "media/phone-test-lake.jpg",
    "video/phone-test-portrait.mp4",
}
REQUIRED_REFERENCED_PATHS = REQUIRED_ASSET_PATHS | {
    "Markdown-Phone-Test-Embed.md",
    "Markdown-Phone-Test-Checklist.md",
    "Markdown-Phone-Test-Image.png",
}

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
    asset_paths = {path.relative_to(ASSETS).as_posix() for path in assets}
    missing_assets = sorted(REQUIRED_ASSET_PATHS - asset_paths)
    if missing_assets:
        raise SystemExit(f"Missing required test asset(s): {', '.join(missing_assets)}")
    source_paths = {path.relative_to(ROOT).as_posix() for path in SOURCE_FILES}
    missing_packaged_references = sorted(
        REQUIRED_REFERENCED_PATHS - source_paths - asset_paths
    )
    if missing_packaged_references:
        raise SystemExit(
            "Required fixture references are not packaged: "
            + ", ".join(missing_packaged_references)
        )
    fixture_text = (ROOT / ENTRY_POINT).read_text(encoding="utf-8")
    unreferenced_required_paths = sorted(
        path for path in REQUIRED_REFERENCED_PATHS if path not in fixture_text
    )
    if unreferenced_required_paths:
        raise SystemExit(
            "Required packaged fixture references are missing from the entry document: "
            + ", ".join(unreferenced_required_paths)
        )

    with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=8) as archive:
        archive.writestr("manifest.json", json.dumps(MANIFEST, indent=2) + "\n")
        for path in SOURCE_FILES:
            archive.write(path, path.relative_to(ROOT).as_posix())
        for path in assets:
            archive.write(path, path.relative_to(ASSETS).as_posix())

    print(f"Built {OUTPUT.name} with {len(SOURCE_FILES) + len(assets) + 1} files")


if __name__ == "__main__":
    build()
