# CommonMark 0.31.2 Case-by-Case Validation

This plan defines the upstream conformance baseline for W.mdx. The CommonMark specification examples are independent micro-cases; passing an aggregate test or rendering a full sample document does not count as individual coverage.

## Upstream sources and provenance

- [CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/)
- [CommonMark specification repository](https://github.com/commonmark/commonmark-spec), including the source `spec.txt` and the upstream `test/spec_tests.py` runner. The runner supports selecting one example by number and dumping the examples as JSON.
- [Official JavaScript reference implementation](https://github.com/commonmark/commonmark.js), pinned in `web/package.json` as `commonmark@0.31.2`.
- [Official C reference implementation](https://github.com/commonmark/cmark), maintained by the CommonMark organization.

The checked-in `web/test/fixtures/commonmark-0.31.2.json` contains the 652 numbered examples from the 0.31.2 specification and is attributed in `web/test/fixtures/COMMONMARK-LICENSE.md`. `web/test/commonmark-spec.test.cjs` names the cases `CM-EX-001` through `CM-EX-652`, carries each upstream section and source-line range in the test name, and checks the pinned JavaScript reference renderer against every fixture result.

## Spec example inventory

| CommonMark section | Examples | Count |
| --- | --- | ---: |
| Tabs | 1–11 | 11 |
| Backslash escapes | 12–24 | 13 |
| Entity and numeric character references | 25–41 | 17 |
| Precedence | 42 | 1 |
| Thematic breaks | 43–61 | 19 |
| ATX headings | 62–79 | 18 |
| Setext headings | 80–106 | 27 |
| Indented code blocks | 107–118 | 12 |
| Fenced code blocks | 119–147 | 29 |
| HTML blocks | 148–191 | 44 |
| Link reference definitions | 192–218 | 27 |
| Paragraphs | 219–226 | 8 |
| Blank lines | 227 | 1 |
| Block quotes | 228–252 | 25 |
| List items | 253–300 | 48 |
| Lists | 301–326 | 26 |
| Inlines | 327 | 1 |
| Code spans | 328–349 | 22 |
| Emphasis and strong emphasis | 350–481 | 132 |
| Links | 482–571 | 90 |
| Images | 572–593 | 22 |
| Autolinks | 594–612 | 19 |
| Raw HTML | 613–632 | 20 |
| Hard line breaks | 633–647 | 15 |
| Soft line breaks | 648–649 | 2 |
| Textual content | 650–652 | 3 |
| **Total** | **1–652** | **652** |

## Status meanings

- **Pass:** the case has an assertion against the relevant reference behavior and the assertion passes.
- **Known gap:** the individual case is locked to its current output and the test confirms that its semantics still differ from the reference. This is not conformance.
- **Pending:** the case is identified, but its required assertion has not been implemented or run.
- **N/A:** the behavior is structurally impossible for that case, with the Markdown rule recorded.
- **Lossy:** the target dialect cannot represent the source feature, and a test asserts both the exact loss and a user-visible warning.

Do not convert a Known gap or Pending case into Pass merely because import/export returned a string, the document opened, or a test did not throw.

## Current coverage snapshot

| Gate | Case count | Current result |
| --- | ---: | --- |
| Pinned reference renderer versus fixture HTML | 652 | 652 individual checks pass |
| Wmdx parser node families for CommonMark core examples | 575 | 575 individual checks pass |
| CommonMark → Wmdx → CommonMark rendered semantics | 575 | 565 pass; 10 Known gaps listed below |
| Raw HTML conversion smoke checks | 77 | 77 individual no-crash checks pass; this is not semantic compatibility |
| Raw HTML semantic parity, preservation, and security-loss assertions | 77 | 77 individual TODO gates |
| GFM and Obsidian round trips for every CommonMark example | 652 per target | Pending |
| HTML and MHTML import/export for every applicable feature case | Per-case matrix | Pending |
| Four editor configurations, editing, caret, scrolling, and host contexts | Per feature/context | Tracked separately in `Markdown-Element-Compatibility-Test-Plan.md`; not complete |

The 10 CommonMark round-trip gaps are examples **373, 389, 407, 408, 425, 426, 461, 463, 465, and 468**, all in “Emphasis and strong emphasis.” They use nested emphasis/strong-emphasis whose nesting is flattened during Wmdx normalization. The individual tests assert the current known-gap output so the cases cannot disappear from reporting; each remains non-conformant until its semantics match the upstream renderer.

## Required case gates

For every relevant `CM-EX` example, run and record independent case results for:

1. **Reference validation:** the pinned CommonMark JavaScript parser and renderer produce the fixture HTML for that numbered example.
2. **Wmdx parsing:** expected block/inline semantics appear in the Wmdx parser. Raw HTML examples are a separate interoperability and security gate.
3. **CommonMark round trip:** import the source, export to CommonMark, and compare reference-rendered structure, text, destinations, nesting, and line-break semantics.
4. **Dialect conversion:** convert the source through GFM and Obsidian and back, in both directions for every supported pair. Compare the restored rendering to the source reference and assert exact target syntax and warnings. Do not infer all-pairs support from a CommonMark-only round trip.
5. **HTML and MHTML:** separately test Markdown → HTML → original Markdown and Markdown → MHTML → original Markdown for every applicable feature. Verify generated TOC links as same-document anchors, imported link flavor, embedded resources, and each loss/security warning.
6. **Editor behavior:** exercise every applicable item in WYSIWYG with syntax hidden, WYSIWYG with caret syntax, WYSIWYG with active-line/block syntax, and Source/Code. Test caret entry and movement, edits, undo/redo, scrolling, keyboard resize, selection, view switching, and exact source stability.
7. **Composition and context:** run each feature alone, then in valid combinations and host contexts such as root, list, blockquote, callout, table cell, and code. Code is also a negative case: Markdown-looking syntax inside code stays literal. Invalid placements are recorded as N/A with the rule that excludes them.

The CommonMark examples are the base corpus, not a substitute for dialect-specific fixtures. Add separate micro-cases for GFM extensions, Obsidian extensions, Wmdx extensions, HTML-only constructs, MHTML resources, and application settings. Combination tests supplement, and never replace, the isolated feature cases.

## Running and extending the checks

Run `node --test test/commonmark-spec.test.cjs` from `web/` for the individual upstream gates. Test names contain the example number, section, and source-line range so a failure points to the exact upstream case. When the upstream spec version changes, update the fixture, provenance, reference implementation version, section inventory, and case results together; never silently regenerate expected output from the Wmdx renderer.
