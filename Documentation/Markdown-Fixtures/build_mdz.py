#!/usr/bin/env python3
"""Build and validate the portable Markdown compatibility fixture archives."""

from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent
PACKAGES = (
    ("CommonMark", "CommonMark-Compatibility-Test.md", "CommonMark Compatibility Test"),
    ("GFM", "GitHub-Flavored-Markdown-Test.md", "GitHub Flavored Markdown Test"),
    ("Obsidian", "Markdown-Reference-Test.md", "Obsidian Markdown Reference Test"),
    ("Markdown-Syntax", "Markdown-Syntax-Test.md", "Markdown Syntax Test"),
)
INTENTIONAL_EXTERNAL_PATHS = ("../", "/")


def remove_fenced_code(source: str) -> str:
    lines = source.splitlines()
    output: list[str] = []
    fence_char = ""
    fence_size = 0
    for line in lines:
        match = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if not fence_char and match:
            fence_char = match.group(1)[0]
            fence_size = len(match.group(1))
            output.append("")
            continue
        if fence_char:
            if re.match(rf"^ {{0,3}}{re.escape(fence_char)}{{{fence_size},}}[ \t]*$", line):
                fence_char = ""
                fence_size = 0
            output.append("")
            continue
        output.append(line)
    return "\n".join(output)


def remove_inline_code(source: str) -> str:
    return re.sub(r"(`+).*?\1", "", source)


def local_reference_targets(source: str) -> list[str]:
    text = remove_inline_code(remove_fenced_code(source))
    targets: list[str] = []

    for match in re.finditer(r"!?\[[^\]\n]*\]\(([^)\n]+)\)", text):
        destination = match.group(1).strip().split()[0].strip("<>")
        targets.append(destination)

    for match in re.finditer(r"(?<![<\w])(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]", text, re.I):
        targets.append(html.unescape(match.group(1).strip()))

    visible_text = re.sub(r"<[^>]*>", "", text)
    for match in re.finditer(r"!?\[\[([^\]\n]+)\]\]", visible_text):
        target = match.group(1).split("|", 1)[0].strip()
        if target.startswith("#"):
            continue
        targets.append(target)

    return targets


def is_external_or_intentional(target: str) -> bool:
    decoded = urllib.parse.unquote(html.unescape(target)).strip()
    return (
        not decoded
        or decoded.startswith("#")
        or decoded.startswith("//")
        or decoded.startswith(INTENTIONAL_EXTERNAL_PATHS)
        or bool(re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", decoded))
    )


def resolve_local_target(folder: Path, target: str) -> Path | None:
    decoded = urllib.parse.unquote(html.unescape(target)).strip()
    decoded = decoded.split("#", 1)[0].split("^", 1)[0]
    if is_external_or_intentional(decoded):
        return None
    candidate = (folder / decoded).resolve()
    if candidate.is_file():
        return candidate
    if not Path(decoded).suffix:
        markdown_candidate = (folder / f"{decoded}.md").resolve()
        if markdown_candidate.is_file():
            return markdown_candidate
    return candidate


def build_package(folder_name: str, entry_name: str, title: str, check_only: bool = False) -> None:
    folder = ROOT / folder_name
    entry = folder / entry_name
    if not entry.is_file():
        raise SystemExit(f"Missing fixture entry document: {entry}")

    missing: list[str] = []
    for target in local_reference_targets(entry.read_text(encoding="utf-8")):
        resolved = resolve_local_target(folder, target)
        if resolved is not None and not resolved.is_file():
            missing.append(target)
    if missing:
        raise SystemExit(f"{folder_name} has unresolved local references: {', '.join(missing)}")

    output = folder / f"{entry.stem}.mdz"
    manifest = (
        '{\n'
        '  "spec": {"name": "mdzip-spec", "version": "1.2.1"},\n'
        f'  "title": {json.dumps(title, ensure_ascii=False)},\n'
        '  "mode": "document",\n'
        f'  "entryPoint": {json.dumps(entry_name, ensure_ascii=False)}\n'
        '}\n'
    )
    files = sorted(
        path for path in folder.rglob("*")
        if path.is_file() and path != output and path.name != "manifest.json"
    )
    if entry not in files:
        raise SystemExit(f"The MDZip entry point was not included: {entry}")

    expected_entries = ["manifest.json"] + [
        path.relative_to(folder).as_posix() for path in files
    ]
    if check_only:
        if not output.is_file():
            raise SystemExit(f"Missing built MDZip fixture: {output}")
        with ZipFile(output, "r") as archive:
            damaged = archive.testzip()
            if damaged:
                raise SystemExit(f"{output.name} has a damaged ZIP entry: {damaged}")
            if archive.namelist() != expected_entries:
                raise SystemExit(f"{output.name} does not match the current fixture files")
            if archive.read("manifest.json").decode("utf-8") != manifest:
                raise SystemExit(f"{output.name} has an outdated MDZip manifest")
            for path in files:
                archive_path = path.relative_to(folder).as_posix()
                if archive.read(archive_path) != path.read_bytes():
                    raise SystemExit(f"{output.name} has a stale entry: {archive_path}")
        print(f"{output.relative_to(ROOT)}: archive and every packaged file verified")
        return

    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=8) as archive:
        archive.writestr("manifest.json", manifest)
        for path in files:
            archive.write(path, path.relative_to(folder).as_posix())
    print(f"{output.relative_to(ROOT)}: {len(files) + 1} files, {output.stat().st_size} bytes")


def main() -> None:
    check_only = "--check" in sys.argv[1:]
    for package in PACKAGES:
        build_package(*package, check_only=check_only)


if __name__ == "__main__":
    main()
