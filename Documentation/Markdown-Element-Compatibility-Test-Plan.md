# Markdown element conversion and editor test plan

This is the element-level gate for CommonMark, GFM, Obsidian, Wmdx, HTML, and MHTML conversion. Each case isolates one feature, checks the exact exported syntax, imports that output, verifies the resulting Wmdx meaning, and exports again to each applicable Markdown flavor. Full-document fixtures are diagnostic until these element cases pass or have an explicit, documented loss.

## Required test sequence

For every case:

1. Start with the smallest valid source containing only that feature (plus a target heading or resource when the feature needs one).
2. Import from its declared source flavor, or use Wmdx source directly.
3. Export to CommonMark, GFM, and Obsidian where the target has a representation.
4. Assert the exact output spelling and every warning.
5. Re-import each output and compare rendered semantics to the source. Also assert round-trip source structure where the target can represent it.
6. For HTML, convert the single element to HTML and back. For MHTML, use an archive fixture with a separate MIME root and one related resource.
7. Mark unsupported forms `lossy` only when the output warning and observed loss are both asserted. Never count “returned text” as a pass.
8. Run the same element through the view and editing matrix below. Passing conversion alone never marks an item complete.

`same` means the rendered structure, text, targets, and supported state match. `lossy` means the target format has no equivalent and a specific warning explains the measured difference. A failing, untested, or unexplained result is `pending`.

## Mandatory view and interaction gate

Every supported element must pass in all four editor configurations. These are distinct test targets, not interchangeable snapshots:

| View ID | Configuration |
| --- | --- |
| VIEW-1 | WYSIWYG with Markdown syntax hidden |
| VIEW-2 | WYSIWYG with syntax exposed at the caret |
| VIEW-3 | WYSIWYG with the active line or block's syntax exposed |
| VIEW-4 | Source/Code view, with literal Markdown and no rendered document widgets |

For each feature case and every applicable view, test the following behaviors with browser automation against the real editor:

- **Render and layout:** element appearance, syntax visibility, nesting and indentation, line wrapping, block width, text alignment, clipping, and surrounding content position.
- **Caret placement and movement:** tap/click at the start, middle, end, syntax boundary, and wrapped continuation; arrow keys; Home/End; selection across the element; enter and leave the element; switch views with and without a selection.
- **Editing:** insert, replace, and delete text at syntax and content boundaries; exercise toolbar actions and relevant keyboard shortcuts; verify undo/redo; confirm a no-op cursor visit never mutates source.
- **Scroll and keyboard:** vertical scroll, element-local horizontal scroll where applicable, cursor placement while scrolled, keyboard open/close, and scroll restoration after changing view. A table scrolls as one table and must not widen or displace the surrounding document.
- **Stability:** compare source bytes, selection/caret offsets, nesting, list numbering, and element/block bounds before and after cursor movement, keyboard dismissal, edits, and view switches. Define a measurable geometry tolerance for each browser fixture; do not rely on screenshots or visual inspection alone.

Use a context matrix as well as the view matrix. Test a block element at the document root, in a list item or continuation, inside a blockquote, inside a callout, and nested where the syntax allows. Test inline elements in a paragraph, list item, quote/callout body, and table cell where allowed. Code spans and fenced blocks are negative cases: syntax inside them must stay literal rather than becoming a nested Markdown element. Mark structurally invalid placements `N/A` with the Markdown rule that excludes them; do not silently omit them.

### Required list interaction matrix

Lists have enough interacting states to require their own generated fixture family; a single nested-list example is not adequate. For every list type, combine applicable marker styles and nesting with each valid host context and all four view IDs:

- Bullet markers `-`, `*`, and `+`; decimal `.` and `)`; Wmdx alphabetic/Roman markers; checked and unchecked tasks.
- Flat, two-level, and deeper nesting; mixed ordered/unordered children; continuing numbering; a child with its own nested list.
- One-line item; soft-wrapped line; hard break; continuation paragraph; blank-separated paragraph; empty item; list followed by a normal paragraph.
- Root, blockquote, nested blockquote, callout, and nested callout. A fenced code block containing list-looking source is a literal-preservation negative case, not a rendered list context. A block list inside a table cell is `N/A` unless the HTML import case explicitly contains one.
- Place the caret on the marker, first text character, middle of wrapped text, end of wrapped text, continuation paragraph, and child item. Repeat with the keyboard visible and after it closes; indent/outdent through Tab, Shift+Tab, and toolbar actions; insert/delete an item and undo/redo.

Each list assertion must verify that the item's marker, text, wrapped lines, continuation paragraph, and descendants remain one logical item; the visual hanging indent stays stable; numbering and nesting remain correct; and visiting a wrapped line does not rewrite or shift a character. Re-run after switching between all view IDs.

### Automated browser coverage recorded so far

| Suite | Coverage exercised | Result | Remaining list work |
| --- | --- | --- | --- |
| `web/browser-tests/unified-layout.cjs` list interaction slice | Root mixed list, quoted list, callout list, and list-looking fenced code; WYSIWYG hidden/caret/line/block exposure plus Source/Code; cursor entry and movement from first to wrapped text; text edit/undo; keyboard-size resize; exact source preservation | **Passes in Chromium.** | Add all marker families and nesting permutations to each context, selection/indent/outdent operations, explicit scroll restoration checks, and Android-device acceptance. |
| `web/browser-tests/editor-interaction-regressions.cjs` | Mobile-touch Source table single-paint, caret placement, edit/undo; wrapped root, nested-quote, and callout list taps in hidden/caret/block syntax exposure; selection stays in the tapped item; source bytes, hanging indent, wrap rows, and alignment survive simulated keyboard close; nested quote/callout borders continue through list and fenced-code lines; callout icon/title alignment remains stable on tap | **Passes in Chromium mobile emulation.** This added coverage found that code/table layout classification skipped host quote/callout context and rendered callout titles lacked the shared row class; both are now fixed. | Add deeper marker/nesting permutations, source editing of these contexts, fold/collapse interactions, scroll restoration, and Android-WebView/device acceptance. |
| `app/src/androidTest/.../EditorWebViewInteractionTest.kt` | Real Android WebView touch at wrapped rows in root, nested quote, and callout lists across hidden/caret/block syntax exposure; caret/source integrity and wrapped-row alignment before and after WebView height changes | **Test added; emulator execution pending.** The current workflow does not launch an Android WebView, and Playwright mobile emulation does not substitute for the Android engine. | Replace the workflow with the provided emulator-enabled file, then fix any Android-engine failures before treating list interactions as verified on Android. |

These browser results are a first slice, not the full required list matrix or Android-device acceptance. Earlier tests missed the reported defects because static CSS assertions and desktop/mouse interactions did not verify touch caret placement in nested contexts, per-line host styling around code/table blocks, or post-tap callout geometry. Do not infer that every marker, nesting/context combination, or device behavior works from these passing cases.

### Feature-to-view coverage status

The master inventory is the row list below. For every row, its `Element gate` status is only the Markdown/HTML conversion result; a separate view-interaction result must be recorded for VIEW-1 through VIEW-4 and each applicable context. Until that second result exists, the feature remains incomplete, even if export/import passes.

## Master inventory

The rows below are a starter feature-family inventory drawn from the current Wmdx Markdown cheat sheet, conversion code, HTML renderer, and MHTML path. They are not an exhaustive list of every upstream syntax case. Individual variants in one row must each receive an isolated assertion; the row is not complete after only its simplest example passes. The 652-case CommonMark baseline is tracked separately in `CommonMark-0.31.2-Validation-Plan.md`.

| Case | Exportable element and required isolated variants | Current evidence | Conversion gate only |
| --- | --- | --- | --- |
| TXT-01 | Plain paragraph; adjacent paragraphs; soft source newline; hard break by two spaces; hard break by backslash | `markdown-element-compatibility.test.cjs` | Pass: core paragraph, soft-break, and two-space hard-break flavor pairs; backslash variant pending |
| HDG-01 | ATX heading levels 1–6; Setext levels 1–2; Wmdx decimal levels 1–6; heading inline formatting; list-like text such as `5. Chapter` without unnecessary escapes; duplicate heading IDs; encoded, slug, and absolute same-document links | Element suite; `markdown-conversion.test.cjs`; `markdown-escape-audit.test.cjs`; `HtmlExportDocumentBuilderTest.kt` | Pass: Setext and heading links; numeric heading escape micro-cases pass; level-by-level, duplicate, and encoded variants pending |
| HR-01 | Thematic breaks using `---`, `***`, and `___`; underscore rule versus underline; Setext underline versus rule | Element suite; `markdown-conversion.test.cjs` | Pass: `---` and `***`; `___` and collision variants pending |
| EMP-01 | Bold with `**` and `__`; italic with `*` and `_`; combined bold-italic; punctuation/escape boundaries | Element suite; CommonMark corpus | Pass: asterisk forms and combined emphasis; underscore and escape variants pending |
| STR-01 | GFM/Obsidian `~~strike~~`; CommonMark `<del>` fallback; literal tildes and code-span tildes | Element suite; `markdown-conversion.test.cjs` | Pass: semantic strike across all nine flavor pairs; remaining literal/escape boundaries pending |
| CODE-01 | Inline code with one and multiple backticks; fenced code with backticks and tildes; language info string; literal Markdown/HTML inside code | Element suite; CommonMark corpus | Pass: single/multiple backtick spans and backtick/tilde fences; language/info and HTML-literal assertions pending |
| UDL-01 | Wmdx underline: solid `_text_`, dotted `_₀text_`, dashed `_₁text_`, double `_₂text_`, wavy `_₃text_`; HTML `<u>`/`<ins>` fallback | Element suite | Pass: five style outputs and loss warnings; HTML tag import now maps `<ins>` to underline |
| HIL-01 | Wmdx highlighter slots 1–4: `==text==`, `==₀text==`, `==₁text==`, `==₂text==`; Obsidian plain highlight | Element suite | Pass: all four slots report color loss where required; semantic HTML round-trip pending for every colored slot |
| PEN-01 | Wmdx pen slots 1–4: `=text=`, `=₀text=`, `=₁text=`, `=₂text=`; plain-text fallback and warning per target | Element suite | Pass: all four slots report style loss; per-slot fallback assertions pending |
| SUB-01 | Wmdx single-tilde subscript; semantic HTML `<sub>` import/export; literal tilde protection in CommonMark/GFM/Obsidian | Element suite | Pass: portable HTML syntax and re-import in each flavor; literal boundary variants pending |
| SUP-01 | Wmdx paired-caret superscript; semantic HTML `<sup>` import/export; literal caret protection | Element suite | Pass: portable HTML syntax and re-import in each flavor; literal boundary variants pending |
| BRK-01 | Blockquote line; multi-line quote; multi-paragraph quote; nested quote; empty quoted line; formatted text inside quote | Element suite; CommonMark corpus | Pass: multi-paragraph nested quote; standalone/formatted/empty-line variants pending |
| LST-01 | Unordered `-`, `*`, `+`; ordered decimal `.` and `)`; nested and mixed lists; Wmdx alphabetic/Roman markers; continuation paragraphs and blank separators | Element suite; `markdown-conversion.test.cjs`; `markdown-indent.test.cjs` | Pass: nested mixed, alternate bullet and `)` markers; Wmdx alphabetic/Roman and continuation variants pending |
| TSK-01 | Checked and unchecked GFM/Obsidian tasks; nested task; task continuation; CommonMark disabled HTML checkbox fallback and warning | Element suite | Pass: checked/unchecked state and CommonMark warning/fallback; nested and continuation variants pending |
| CAL-01 | Wmdx and Obsidian callout types/title/body; expanded, collapsed, nested; GFM `note`, `tip`, `important`, `warning`, `caution`; unsupported type fallback | Element suite; `markdown-conversion.test.cjs` | Pass: collapsed warning callout and target-specific loss; expanded/nested/type matrix pending |
| TBL-01 | Pipe table with/without outside pipes; left/center/right alignment; escaped cell pipe; inline emphasis/link/code; empty cell; malformed row warning; CommonMark loss warning | Element suite | Pass: three alignments and CommonMark warning; remaining cell variants pending |
| LNK-01 | Inline external and relative links; spaces/escaping; empty label; formatted label; optional title; autolink URL/email; reference link/definition; unresolved reference | Element suite; CommonMark corpus | Pass: external/relative/title and reference-link round trips; autolinks and edge cases pending |
| LNK-02 | Wmdx resource link fields (target/title/size/alignment); Obsidian file wikilink, alias, heading link, encoded fragment, duplicate heading; MHTML absolute same-page URL versus external URL | Element suite; `markdown-compatibility-matrix.test.cjs` | Pass: file/heading wikilinks and MHTML absolute-versus-external links in all four output profiles; duplicate and resource metadata variants pending |
| IMG-01 | Markdown image alt text; Wmdx caption, pixel/percent width, alignment; data URI; local attachment path; Obsidian image embed; missing-resource warning | Element suite; `html-export.test.cjs`; `markdown-compatibility-matrix.test.cjs` | Pass: embedded image bytes round-trip through all three flavor HTML exports and reimports; captions, percent, embeds and missing-resource variants pending |
| AUD-01 | Audio extensions and embedded bytes; Wmdx width/alignment metadata; semantic `<audio>`; Obsidian audio embed; unsupported size/alignment warning | Element suite; `markdown-compatibility-matrix.test.cjs` | Pass: standalone MHTML audio bytes round-trip through CommonMark, GFM, and Obsidian HTML and back to identical Wmdx; metadata, extension, and Obsidian embed variants pending |
| VID-01 | Video extensions, poster/dimensions; Wmdx alignment; semantic `<video>`; Obsidian video embed; unsupported metadata warning | Element suite; `markdown-compatibility-matrix.test.cjs` | Pass: standalone MHTML video bytes round-trip through CommonMark, GFM, and Obsidian HTML and back to identical Wmdx; poster, dimensions, extension, and Obsidian embed variants pending |
| ATT-01 | Downloadable attachment; Wmdx attachment marker; width/alignment; PDF/ZIP and safe data URI; Obsidian embed; unsupported metadata warning | Element suite; `html-export.test.cjs`; `markdown-compatibility-matrix.test.cjs` | Pass: PDF attachment marker and safe data bytes round-trip through all three flavor HTML exports and reimports; ZIP, MIME safety, and metadata variants pending |
| EMB-01 | Whole-document local embed with/without alias; copied and linked resource; MDZip asset; unsupported Obsidian heading/block transclusion warning | Obsidian fixtures, embedded-content tests | Pending isolated embed round trips |
| FNT-01 | Reference footnote, repeated reference, case-insensitive label, multi-line definition/continuation, links in definition; Obsidian inline footnote; CommonMark warning | Element suite; `markdown-compatibility-matrix.test.cjs` | Pass: reference and definition output, CommonMark warning; repeated/inline/continuation variants pending |
| YAML-01 | YAML frontmatter: exact bytes, CRLF, empty value, nested property; warning for non-Obsidian target | Element suite | Pass: nested frontmatter preserved per profile; CRLF/empty-value variants pending |
| ESC-01 | Escaped punctuation only where the target parser requires it; literal CommonMark/GFM/Obsidian/Wmdx markers; source punctuation resembling links, lists, headings, tables, HTML, entities, or code; paired delimiters and markers inside code | CommonMark corpus; `markdown-escape-audit.test.cjs`; `Markdown-Escape-Minimality-Validation.md` | Pass: focused HTML-text/context cases with a remove-one-escape semantic check; `markdownText` contexts and all other escape-producing helpers remain pending |
| CMT-01 | Obsidian `%%` comment and HTML comment; preservation/omission behavior and warnings | Element suite; `markdown-conversion.test.cjs` | Pass: Obsidian comment warning and literal export; HTML comment cases pending |
| MTH-01 | Inline and display math delimiters, equation environments; literal byte preservation and explicit “not integrated” status | `markdown-conversion.test.cjs` | Pass: existing literal-delimiter checks; additional forms pending |
| HTML-01 | Inline `<strong>`, `<b>`, `<em>`, `<i>`, `<del>`, `<s>`, `<strike>`, `<sub>`, `<sup>`, `<mark>`, `<u>`, `<ins>`, `<code>`, `<br>` | Element suite; `markdown-conversion.test.cjs` | Pass: each listed inline tag plus `<br>` through all Markdown targets |
| HTML-02 | HTML link/title/download; image/alt/dimensions; audio/video; figure/caption; safe/unsafe data URI | `markdown-conversion.test.cjs`, `html-export.test.cjs`, `markdown-compatibility-matrix.test.cjs` | Pass: standalone image, audio, video, and PDF attachment resources round-trip through all three flavor HTML exports and reimports; per-item links, nested media sources, and metadata variants pending |
| HTML-03 | HTML headings, paragraphs, lists/tasks, nested/list paragraphs, blockquotes, tables, cell spans, details/summary, alignment | `markdown-conversion.test.cjs`, `markdown-compatibility-matrix.test.cjs` | Existing combined tests; per-item round trips pending |
| HTML-04 | Inline CSS, unsupported tags, comments, scripts, event handlers, iframe/object/embed; each expected warning or omission | `markdown-conversion.test.cjs`, `html-export.test.cjs` | Existing security tests; per-item warning assertions pending |
| TOC-01 | HTML export heading IDs; generated TOC links; duplicate headings; URL-encoded links; WebView-absolutized same-page URLs; external link with same fragment; import/export to all flavors | `HtmlExportDocumentBuilderTest.kt`, element suite, `markdown-conversion.test.cjs` | Pass: profile-specific TOC links, absolute same-page and external link handling; Android archive/device round trip pending |
| MHT-01 | MHTML root selection; Content-Base, Content-Location, Content-ID, MIME start; one resource each for image/audio/video/attachment; size bound; import to selected global flavor | `MhtmlArchiveImporterTest.kt`, `markdown-compatibility-matrix.test.cjs` | Pass: image/audio/video/PDF resource bytes round-trip through all three Markdown flavors and semantic HTML; helper converts TOC into selected profile; broader archive/device variants pending |
| EXP-01 | Complete HTML output wrapper: title, CSS placement/head/file, TOC option/levels, all supported media, active-content sanitization | `HtmlExportDocumentBuilderTest.kt`, `html-export.test.cjs` | Existing wrapper tests; option-by-option element matrix pending |

## Progress and stop condition

This feature inventory is not complete. The CommonMark reference corpus has 652 individually named cases; all 575 parser-comparable cases now pass Wmdx round-trip semantics, including the 10 nested-emphasis cases that previously failed. Raw HTML examples 613–632, 23 selected HTML interoperability cases, and angle-bracket link cases 201, 491, 494, 524, and 536 now have individual CommonMark/GFM/Obsidian round-trip checks; 29 raw-HTML semantic TODOs remain. GFM/Obsidian all-pairs conversion, most HTML/MHTML per-case conversions, and the full per-view interaction matrix remain open. The first list interaction slice does not certify every marker/context combination. Some older tests cover multiple items together, and whole-document diagnostics do not replace isolated or combination cases. Add browser interaction fixtures alongside `web/test/markdown-element-compatibility.test.cjs` and the HTML/MHTML suites. Do not call an item or full-document compatibility complete until its conversion result, escape minimality, and all applicable view/context interaction results are recorded, and each `lossy` result has an asserted warning and documented reason.

Only after the individual and combination matrices pass should the four supplied full-document MDZip fixtures be used as the final cross-flavor and HTML/MHTML integration gate.
