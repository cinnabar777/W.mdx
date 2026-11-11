# Markdown element conversion and editor test plan

This is the element-level gate for CommonMark, GFM, Obsidian, Wmdx, HTML, and MHTML conversion. Each case isolates one feature, checks the exact exported syntax, imports that output, verifies the resulting Wmdx meaning, and exports again to each applicable Markdown flavor. Full-document fixtures are diagnostic until these element cases pass or have an explicit, documented loss.

## Current handoff (2026-11-11)

Work from branch `main-clean-textpack-wmds`, now at `888604b` (`Hand off full compatibility effort`), descended from `7b45c5e` and `cbaad3d` (`Fix Android WebView test assertion arguments`). The handoff commit updates documentation only. Recent commits corrected the app warm-up target and timeout handling, restored the emulator's two-core configuration, added KVM/install diagnostics, and fixed JUnit assertion argument order. The user confirms the incoming session can modify the workflow and install the Android SDK; do not treat either as a blocker.

The incoming session owns the complete remaining app and compatibility effort, not only the Android geometry issue: fix and extend the view/interaction tests, complete the CommonMark/GFM/Obsidian/HTML/MHTML conversion matrix and import/export checks, then run the full-document MDZip fixtures as the final gate. Use the available Android SDK and workflow to verify device behavior, keep the test plan current, and continue beyond any single passing APK or CI run.

Latest verification is [GitHub Actions run 43030976067](https://github.com/cinnabar777/W.mdx/actions/runs/43030976067): web unit tests, browser layout tests, Android build/unit tests, and Debug APK upload passed. Android instrumentation installed and launched successfully and executed one test, but the job failed on a real geometry assertion: `touchWrappedListsKeepsCaretAndIndentAcrossWebViewResize` reported `root/hidden after cursor entry wrapped row 1 shifted from the item text`, with row starts `[59.2083, 64, 64, 64, 64, 64]` and a `<3px` alignment tolerance. This now reproduces the cursor-entry list-wrap defect instead of failing before the test body. The run's Debug APK is artifact `13861555462` (6,713,340 bytes, not expired); Android diagnostics are artifact `13860449022` (100,683 bytes, not expired).

**Next:** investigate the first root/hidden geometry mismatch in `EditorWebViewInteractionTest.kt` (`listGeometry` / `assertRowsAlign`, failure at test line 79 and assertion helper line 791). The Android geometry diagnostic now includes line/prefix/anchor rectangles, inline and computed gutter values, padding, text indent, font, and white-space; the `<3px` assertion is unchanged. Use the API 35 run to inspect those values before changing rendering code. Once root/hidden alignment is fixed, rerun instrumentation to expose later list contexts and the existing source-table caret/edit/undo and callout-title caret geometry assertions. Record each executed test count and result; a passed build or uploaded APK is not an interaction pass.

After the Android slice, continue the conversion matrix in this document rather than treating it as finished: GFM↔Obsidian, many per-element HTML/MHTML round trips, the complete feature/context/view matrix, and the four full-document MDZip integration fixtures remain open. Preserve the CommonMark corpus results and explicit loss/warning rules below.

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

Every supported element must pass in all five editor configurations. These are distinct test targets, not interchangeable snapshots:

| View ID | Configuration |
| --- | --- |
| VIEW-1 | WYSIWYG with Markdown syntax hidden |
| VIEW-2 | WYSIWYG with syntax exposed at the caret |
| VIEW-3 | WYSIWYG with the active line's syntax exposed |
| VIEW-4 | WYSIWYG with the active block's syntax exposed |
| VIEW-5 | Source/Code view, with literal Markdown and no rendered document widgets |

For each feature case and every applicable view, test the following behaviors with browser automation against the real editor:

- **Render and layout:** element appearance, syntax visibility, nesting and indentation, line wrapping, block width, text alignment, clipping, and surrounding content position.
- **Caret placement and movement:** tap/click at the start, middle, end, syntax boundary, and wrapped continuation; arrow keys; Home/End; selection across the element; enter and leave the element; switch views with and without a selection.
- **Editing:** insert, replace, and delete text at syntax and content boundaries; exercise toolbar actions and relevant keyboard shortcuts; verify undo/redo; confirm a no-op cursor visit never mutates source.
- **Scroll and keyboard:** vertical scroll, element-local horizontal scroll where applicable, cursor placement while scrolled, keyboard open/close, and scroll restoration after changing view. A table scrolls as one table and must not widen or displace the surrounding document.
- **Stability:** compare source bytes, selection/caret offsets, nesting, list numbering, and element/block bounds before and after cursor movement, keyboard dismissal, edits, and view switches. Define a measurable geometry tolerance for each browser fixture; do not rely on screenshots or visual inspection alone.

Use a context matrix as well as the view matrix. Test a block element at the document root, in a list item or continuation, inside a blockquote, inside a callout, and nested where the syntax allows. Test inline elements in a paragraph, list item, quote/callout body, and table cell where allowed. Code spans and fenced blocks are negative cases: syntax inside them must stay literal rather than becoming a nested Markdown element. Mark structurally invalid placements `N/A` with the Markdown rule that excludes them; do not silently omit them.

### Required list interaction matrix

Lists have enough interacting states to require their own generated fixture family; a single nested-list example is not adequate. For every list type, combine applicable marker styles and nesting with each valid host context and all five view IDs:

- Bullet markers `-`, `*`, and `+`; decimal `.` and `)`; Wmdx alphabetic/Roman markers; checked and unchecked tasks.
- Flat, two-level, and deeper nesting; mixed ordered/unordered children; continuing numbering; a child with its own nested list.
- One-line item; soft-wrapped line; hard break; continuation paragraph; blank-separated paragraph; empty item; list followed by a normal paragraph.
- Root, blockquote, nested blockquote, callout, and nested callout. A fenced code block containing list-looking source is a literal-preservation negative case, not a rendered list context. A block list inside a table cell is `N/A` unless the HTML import case explicitly contains one.
- Place the caret on the marker, first text character, middle of wrapped text, end of wrapped text, continuation paragraph, and child item. Repeat with the keyboard visible and after it closes; indent/outdent through Tab, Shift+Tab, and toolbar actions; insert/delete an item and undo/redo.

Each list assertion must verify that the item's marker, text, wrapped lines, continuation paragraph, and descendants remain one logical item; the visual hanging indent stays stable; numbering and nesting remain correct; and visiting a wrapped line does not rewrite or shift a character. Re-run after switching between all view IDs.

### Required real-user workflow suites

These are behavior tests, separate from conversion checks and source-code assertions. Use actual taps/clicks, keyboard input, Enter/Backspace, and visible menu/button actions. JavaScript may seed a fixture and inspect exact state, but must not stand in for the user action being tested. After each action, assert the resulting Markdown, selection/caret, rendered state, and persisted setting where applicable. Keep high-risk feature workflows independently reported so an earlier list or geometry failure cannot prevent table, callout, or color tests from executing.

Run each workflow in every applicable `VIEW-1` through `VIEW-5` configuration and in the CommonMark, GFM, Obsidian, and Wmdx profiles that support that syntax. For unsupported profile/feature pairs, assert literal preservation or the documented warning; do not silently skip them. Use exhaustive coverage for the high-risk workflows below and pairwise coverage for lower-risk profile/context combinations.

#### Color picker and preference reset

- Open the picker from a real setting. Verify the current-color swatch and old/new previews match the effective default or saved override, including translucent defaults and the active light/dark theme.
- Change the hue and saturation/value field from a translucent or dark starting color. Verify the picked color becomes visibly opaque, the preview changes to the chosen color, and the actual setting target updates after confirmation. Then adjust alpha explicitly and verify the chosen transparency is preserved.
- Enter valid RGB and RGBA hex values, press the keyboard Enter action, and assert the preview reflects the parsed value; confirm with OK and verify the setting's real preview/rendering changes. Verify Cancel leaves the setting unchanged, and invalid or incomplete input cannot silently replace it.
- Verify reset affordances start inactive at the effective default, become active after changing the setting, actually restore the stored default when pressed, and return inactive afterward. Cover representative color, text, numeric, and boolean preferences so this shared behavior cannot regress by setting type.

#### Tables

- In Source/Code view, tap into a cell after preceding document content, type and replace text, delete text, press Enter, and use undo/redo. Assert the correct source offset changes and the surrounding document remains byte-for-byte intact. Repeat after switching from a rendered view.
- In rendered views, enter and edit cells using real taps and keyboard input; test cell-to-cell movement, row/column insertion and deletion, alignment, clear-formatting, copy/paste, Escape/cancel, and every exposed table menu action. Assert the Markdown and rendered table after each operation.
- Cover empty and ordinary cells, escaped and literal pipes, emphasis, code, links, images, and other supported inline content. Explicitly mark block-level content that the active table syntax cannot contain as `N/A`; verify supported HTML-imported cell content separately.
- Repeat applicable cases in all five views, dialect profiles, and valid nesting contexts. Verify view switches, save/reopen, and undo/redo preserve cell contents, alignment, and table boundaries.

The Word Processor table context menu currently exposes nine structural actions; exercise each by opening the real menu with a long press and tapping its visible button. Do not call `window.wmdxTableActions.run()` as a substitute:

| Action ID | Visible action | Required result |
| --- | --- | --- |
| `insertRowBelow` | Add Row Below | One row is added after the active row; prior cells stay unchanged |
| `insertColumnRight` | Add Column Right | One column is added after the active column; prior cells and alignments stay unchanged |
| `deleteRow` | Delete Row | The active row is removed; other rows stay unchanged |
| `deleteColumn` | Delete Column | The active column is removed; other columns and alignments stay unchanged |
| `mergeLeft` | Merge Left | Adjacent cells become one visible span and both contents remain |
| `mergeRight` | Merge Right | Adjacent cells become one visible span and both contents remain |
| `mergeUp` | Merge Up | Adjacent cells become one visible span and both contents remain |
| `mergeDown` | Merge Down | Adjacent cells become one visible span and both contents remain |
| `splitCell` | Split Cell | The span is removed and table structure remains valid |

Also test the toolbar's `Insert Table` action and each action's enabled/disabled boundary (for example, deleting the last row or column and merging past an edge). Each action case must assert the exact resulting Markdown, rendered cell text/count/spans, and the same result after reopening the table.

All 26 table preference keys in `preferences_styling_tables.xml` need an effect test and a reset test. Change each through its actual Settings control, verify the reset control becomes active, verify the rendered table or menu reflects the selected value, reset it, and verify the default appearance and inactive reset state return:

| Setting group | Preference keys |
| --- | --- |
| Scrolling | `pref_table_scroll_wysiwyg_enabled`, `pref_table_scroll_source_enabled` |
| Typography | `pref_table_inherit_body_typography`, `pref_table_font_family`, `pref_font_file_table`, `pref_table_font_weight`, `pref_table_font_size`, `pref_table_letter_spacing`, `pref_table_hyphenate`, `pref_table_line_height` |
| Margins | `pref_table_margin_left`, `pref_table_margin_right` |
| Borders | `pref_table_border_style`, `pref_table_border_thickness`, `pref_table_border_color` |
| Header | `pref_table_header_bg_color`, `pref_table_header_text_color`, `pref_table_header_font_weight` |
| Cells | `pref_table_cell_bg_color`, `pref_table_cell_text_color`, `pref_table_cell_padding` |
| Action menu | `pref_table_menu_bg_color`, `pref_table_menu_action_bg_color`, `pref_table_menu_text_color`, `pref_table_menu_disabled_color`, `pref_table_menu_pressed_bg_color` |

For cell editing, use actual keyboard input—not `textContent` assignment—and cover insertion, selection/replacement, Backspace/Delete, Enter within a cell, Tab/Shift+Tab navigation, Escape cancellation, undo/redo, and paste. After each action, verify the focused cell, child editor value, parent Markdown, rendered cell, and reopened value. Run these cases independently so one failure does not skip the rest. Cover supported inline cell contents (plain/empty text, escaped pipes, emphasis, code, links, images, and Wmdx resources); test unsupported block content as an explicit literal-preservation or `N/A` case.

#### Callouts and other block widgets

- For every supported callout type, edit the title and body, press Enter/Backspace at ordinary text and block boundaries, toggle folded state, invoke insertion/menu actions, and undo/redo. Test empty/custom titles and body content containing paragraphs, lists, code, and nested callouts.
- Exercise lists, task lists, blockquotes, and callouts at root and in every valid parent/child combination. Tap marker, title, body, continuation, and nested child; insert, replace, delete, indent/outdent, check/uncheck, and exit empty items with Enter. Assert the block remains in the intended parent and that invalid nesting stays literal or reports the documented warning.
- Repeat these edits across view switches and syntax exposure settings. Assert exact Markdown, numbering/fold state, caret location, nesting, and visible rendering; a cursor-only pass does not count as an edit pass.

#### Cost-conscious validation

Batch related behavior tests before running Android compilation or building an APK. Run fast web tests first, then one focused Android compile/device run for the completed batch; do not rebuild an APK for each assertion or small test adjustment. A test is not marked passed until its test body ran and its behavior assertions passed on the target device.

### Automated browser coverage recorded so far

| Suite | Coverage exercised | Result | Remaining list work |
| --- | --- | --- | --- |
| `web/browser-tests/table-workflow-matrix.cjs` | 128 real-browser cases: 9 visible table menu actions × GFM/Obsidian/Wmdx × hidden/caret/line/block syntax exposure; multi-word cell replacement, Return, Tab/Shift+Tab, clipboard paste, Delete, Escape cancellation, exact Markdown/rendering, undo/redo; Source-view phrase replacement and undo/redo in all four profiles; CommonMark literal-table behavior in all four exposure settings | **128 passed in Chromium** after rebuilding the WebView assets. | Add the 26 table-setting effect/reset workflows, table-action boundaries and toolbar insertion, rich inline cell content, save/reopen, and Android-device acceptance. |
| `web/browser-tests/unified-layout.cjs` list interaction slice | Root mixed list, quoted list, callout list, and list-looking fenced code; WYSIWYG hidden/caret/line/block exposure plus Source/Code; cursor entry and movement from first to wrapped text; text edit/undo; keyboard-size resize; exact source preservation | **Passes in Chromium.** | Add all marker families and nesting permutations to each context, selection/indent/outdent operations, explicit scroll restoration checks, and Android-device acceptance. |
| `web/browser-tests/editor-interaction-regressions.cjs` | Mobile-touch Source table caret/edit/undo with exact insertion at the tapped offset; rendered WYSIWYG table overlay opacity, tapped caret, typing at the tapped offset, and cancel; wrapped root, actual nested ordered→bullet child, nested-quote, and callout list taps in hidden/caret/block syntax exposure; each tap is followed by exact-offset typing and undo; Source/Code nested-list tap, edit, and undo preserve the exact caret offset and source; each list state's wrapped rows stay aligned with item text before and after first cursor entry (allowing the expected horizontal shift when syntax appears); nested quote/callout borders continue through list and fenced-code lines; callout title tap preserves caret and icon/title row geometry | **Passes in Chromium mobile emulation.** The rendered-cell test reproduced text painted twice: the selected cell's `rgba(0, 120, 212, 0.2)` background was copied to the editor overlay, leaving the original text visible underneath. The overlay now composites cell/ancestor backgrounds to an opaque color. | Expand to deeper marker/nesting permutations, fold/collapse interactions, scroll restoration, and Android-WebView/device acceptance. |
| `app/src/androidTest/.../EditorWebViewInteractionTest.kt` | Real Android WebView touch at wrapped rows in root, nested ordered→bullet child, nested quote, and callout lists across hidden/caret/block syntax exposure; every list tap is followed by insertion at the exact caret and toolbar undo; each state's wrapped rows align under the item text before and after cursor entry; Source/Code nested-list caret and exact text insertion; rendered table overlay opacity and tapped caret; source-view table after preceding text, with parent caret mapped to the tapped child-editor offset and text inserted there; callout icon/title geometry and caret placement before and after entry/resize; source integrity and wrapping before and after WebView height changes | **Not yet executed on Android.** Run 43020615029 passed web tests, Android unit tests, and APK upload, but the launcher warm-up returned `Status: timeout` after about 23 seconds; its diagnostics show Android system-service ANRs and high CPU pressure, not a conclusive app exception. Run 43022811862 then failed during `installDebug installDebugAndroidTest` with exit status 1, before warm-up or interaction tests; the artifact did not contain Gradle's failure output, so the install cause remains unknown. Android WebView interactions now run only when selected in the `Focused Interaction Tests` workflow; that job retains KVM checks and uploads diagnostics. | Run the API 35 suite when validating native WebView behavior; do not count any interaction as passed until its test body completes. |

These browser results are a first slice, not complete table-preference coverage, the full required list matrix, or Android-device acceptance. The table workflow's 128 Chromium cases passed, but its 26 Settings effect/reset tests and richer cell-content cases remain open; Android behavior is not established by the browser run. Earlier test gaps included nesting only quotes rather than lists, checking only rendered-table input on Android, and not asserting callout geometry after title caret entry. Browser and Android tap helpers scroll targets into view before measuring and tapping them. Do not infer that every marker, nesting/context combination, setting, or device behavior works from these passing cases.

JSDOM fixtures must wait on bounded DOM conditions for expected list-item counts and rendered table, callout, and task widgets before asserting. Fixed 5–20 ms sleeps caused false failures when parsing or decoration ran later under load; keep each wait finite so genuinely missing output still fails.

### Feature-to-view coverage status

The master inventory is the row list below. For every row, its `Element gate` status is only the Markdown/HTML conversion result; a separate view-interaction result must be recorded for VIEW-1 through VIEW-5 and each applicable context. Until that second result exists, the feature remains incomplete, even if export/import passes.

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
| TBL-01 | Pipe table with/without outside pipes; left/center/right alignment; escaped cell pipe; inline emphasis/link/code; empty cell; malformed row warning; CommonMark raw-HTML fallback | Element suite; `markdown-conversion.test.cjs` | Pass: three alignments and root, blockquote, and list-contained tables preserve cells through CommonMark raw-HTML round trips; nested output is parsed by the `commonmark` 0.31.2 reference parser and checked for correct block nesting; remaining cell variants pending |
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

This feature inventory is not complete. The CommonMark reference corpus has 652 individually named cases; all 575 parser-comparable cases now pass Wmdx round trips and CommonMark → Wmdx → GFM/Obsidian → Wmdx → CommonMark semantic checks, including the 10 nested-emphasis cases that previously failed. Raw HTML examples 613–632, 28 selected HTML interoperability cases (including empty-anchor examples 21 and 31 and headerless tables 148, 149, 160, and 191), and angle-bracket link cases 201, 491, 494, 524, and 536 have individual CommonMark/GFM/Obsidian round-trip checks; 24 raw-HTML semantic cases remain pending. Empty anchors stay as raw HTML with a preservation warning rather than becoming Markdown links with invented visible text. Headerless HTML tables stay raw because pipe tables invent a header row; GFM pipe tables now use raw HTML when exported to strict CommonMark. GFM ↔ Obsidian conversion, most HTML/MHTML per-case conversions, and the full per-view interaction matrix remain open. Runs 43017002927 and 43020615029 passed web tests, Android unit tests, and Debug APK upload but did not execute Android interaction tests: both launcher warm-ups returned `Status: timeout`; run 43020615029 also showed system-service ANRs and high API 35 CPU pressure. Run 43022811862 failed during APK installation, before interaction tests, and its diagnostics omitted Gradle's failure output. Run 43028651815 reached instrumentation but failed due to reversed JUnit assertion arguments; commit `cbaad3d` corrected those calls. The next run, 43030976067, then installed and launched successfully, passed web/browser/unit/build/APK steps, and executed one Android test; it failed the root/hidden wrapped-list row alignment assertion after cursor entry (row starts 59.2083 versus 64, tolerance under 3 px). The APK and diagnostics artifacts are listed in the current handoff section above. The recent Android test is still only a first slice and does not certify every marker/context combination. Some older tests cover multiple items together, and whole-document diagnostics do not replace isolated or combination cases. Add browser interaction fixtures alongside `web/test/markdown-element-compatibility.test.cjs` and the HTML/MHTML suites. Do not call an item or full-document compatibility complete until its conversion result, escape minimality, and all applicable view/context interaction results are recorded, and each `lossy` result has an asserted warning and documented reason.

Run 43028651815 passed APK installation and started Android instrumentation. Its single test failure was traced to four `org.junit.Assert.assertEquals` calls using `expected, actual, message`; JUnit requires `message, expected, actual`. The assertion order was corrected in `cbaad3d`, and run 43030976067 confirmed the test body now executes. Its subsequent row-alignment failure is a separate, actionable interaction defect described above.

Only after the individual and combination matrices pass should the four supplied full-document MDZip fixtures be used as the final cross-flavor and HTML/MHTML integration gate.
