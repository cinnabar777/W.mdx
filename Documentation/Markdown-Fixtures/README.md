# Markdown Compatibility Fixture Packs

These four documents were supplied as Markdown comparison tests. Their original attribution and intentionally hard-wrapped examples are retained; only broken local media references, clearly malformed example links, and missing package assets were repaired. New prose is kept on single physical lines so it does not introduce soft breaks.

Each folder contains one ready-to-open `.mdz` archive, its Markdown entry document, and the local resources used by its image, embed, and attachment examples. Open the archive in W.mdx, then test Source, Live Preview, and WYSIWYG before exporting to HTML or MHTML and importing the result again.

| Fixture | Starting dialect | Main coverage |
| --- | --- | --- |
| `CommonMark/CommonMark-Compatibility-Test.mdz` | CommonMark 0.31.2 with separately labeled extensions | CommonMark structures, GFM tables and tasks, raw HTML, math, diagrams, local image variants, and attachment embeds |
| `GFM/GitHub-Flavored-Markdown-Test.mdz` | GitHub Flavored Markdown | GitHub headings, emphasis, Unicode, lists, task lists, tables, code, blockquotes, remote links, and offline media |
| `Obsidian/Markdown-Reference-Test.mdz` | Obsidian-flavored Markdown | Wikitext links and embeds, callouts, footnotes, tags, formatting, media, and local note targets |
| `Markdown-Syntax/Markdown-Syntax-Test.mdz` | CommonMark syntax guide | Paragraphs, line breaks, lists, blockquotes, code, links, and packaged media |

## Strict conversion procedure

For each entry document, record the starting profile, convert to each of the other two profiles, compare the entire source line by line, and convert each result back to the starting profile. Compare the round-tripped source with the original and distinguish syntax normalization from changed meaning; every unsupported extension or intentional loss must be listed with its warning and reason. Also compare rendered HTML, not just source text, because different Markdown spellings can be semantically equivalent.

Then export the same document to standalone HTML and MHTML, reimport it, verify the generated table-of-contents links resolve to their headings, and compare all content including the final section and every local media/attachment. The parent-relative and root-relative examples in the CommonMark pack remain deliberate portability probes rather than broken package assets.

Run `node Documentation/Markdown-Fixtures/audit_roundtrips.mjs` to print complete line-by-line diffs, conversion warnings, and a rendered-HTML meaning comparison for every cross-flavor round trip. Pass `CommonMark`, `GFM`, `Obsidian`, or `Markdown-Syntax` to inspect one fixture. A zero exit code means only that the audit ran; any printed difference still needs classification and resolution before that route can be marked compatible.

The packages can be regenerated with `python3 Documentation/Markdown-Fixtures/build_mdz.py` and checked without rewriting them with `python3 Documentation/Markdown-Fixtures/build_mdz.py --check`. The builder includes the original file plus every resource in its fixture folder and validates relative Markdown, HTML, and Obsidian links before writing each archive.

The Markdific CommonMark compatibility pack retains its CC BY 4.0 attribution in the document. The GFM test retains its original project attribution. The Markdown reference and classic syntax guide are preserved with the contents supplied in the ZIP.
