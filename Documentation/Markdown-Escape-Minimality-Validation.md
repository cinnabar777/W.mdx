# Markdown Escape Minimality Validation

This is a living regression inventory for every Markdown backslash emitted by the serializers listed here. It is not a claim that all dialect behavior is complete. Each escape has a case ID, the helper that produced it, its target parser or renderer, and a reason. The tests scan every backslash in each fixture—including backslashes that are literal content before ordinary letters, not only backslashes before punctuation.

An escape is correct only when it protects meaning the target parser would otherwise change. A literal backslash is content and may itself need encoding; that does not justify doubling it when one backslash is sufficient. An escape that preserves rendering but adds hidden syntax is still an output defect.

## Test rule

For each fixture:

1. Assert the exact expected parsed or rendered meaning using the actual target parser/renderer. CommonMark cases use the pinned `commonmark@0.31.2` reference renderer; GFM table cases use the GFM renderer; Wmdx and Obsidian cases use their application parsers.
2. Enumerate **every emitted backslash** in the exact serialized string. The assertion reports the case ID, helper, target, offset, following character, and the reason that character is escaped or retained as data.
3. Remove each backslash individually and rerun the semantic assertion. Each remaining backslash must be necessary in that fixture.
4. For a delimiter made from multiple characters, test the whole spelling and each escape independently. If protecting one character already disables the syntax, escaping the rest of the delimiter is redundant.
5. Keep a negative case beside positive escape cases: syntax that the target does not recognize must not acquire backslashes merely because it looks special in another dialect or context.

The executable cases live in `web/test/markdown-escape-audit.test.cjs`. `web/src/markdownEscaping.js` centralizes minimal literal-field encoding; custom field grammars pass their own set of characters that consume escapes.

## Current case inventory

| Case IDs | Producer / target | What the test proves |
| --- | --- | --- |
| ESC-TXT-01/02 | `markdownText` through HTML import and CommonMark export | Plain punctuation stays bare; literal emphasis, code, entity-like text, links, and HTML-looking text retain their source meaning. |
| ESC-BLK-01, ESC-HDG-01, ESC-LST-01, ESC-QUO-01 | `markdownText` in paragraph, heading, list, and quote contexts | `5. Item` is escaped only where it would start an ordered list; heading numbers remain unescaped; quote/list markers are protected only in their ambiguous block context. |
| ESC-BLK-02, ESC-REF-01, ESC-HTML-01 | `markdownText` block syntax | Thematic rules, Setext underlines, reference definitions, and HTML declarations remain literal when the test context requires it. |
| ESC-SLASH-01 | `markdownText` backslash-run serializer | Literal backslash runs adjacent to paired delimiters survive; a backslash before an ordinary letter is not doubled without need. |
| ESC-SLASH-RUN-1..4 | `escapeMarkdownField` / CommonMark renderer | Runs of one through four literal backslashes are tested before an ordinary letter, punctuation, a pipe, a line ending, and end-of-input. |
| ESC-CODE-SPAN-01 | HTML `<code>` import / CommonMark renderer | Code content containing one or more backticks and edge spaces uses a sufficiently long backtick fence and padding; backslash-escaping a backtick inside a code span is forbidden. |
| ESC-TBL-01 | `markdownText` table-cell mode / GFM renderer | A literal pipe cannot become a table boundary, while the same prose pipe outside a cell stays bare. |
| ESC-WMDX-RESOURCE-01 | `escapeField` / `parseWmdxResourceSyntax` | A pipe escape protects the Wmdx field boundary; literal path backslashes remain data and are not doubled before ordinary letters. |
| ESC-IMAGE-ALT-01 | `formatMarkdownImage` / `parseMarkdownImage` | Image alt text preserves literal backslashes and a closing bracket; URL encoding is kept separate from Markdown backslash escaping. |
| ESC-AUDIO-LABEL-01, ESC-VIDEO-LABEL-01, ESC-ATTACHMENT-LABEL-01 | Media link formatters and parsers | Audio, video, and attachment labels preserve their literal data and closing-bracket boundary independently. |
| ESC-FOOTNOTE-INLINE-01 | `formatObsidianInlineFootnote` / `parseFootnotes` | The inline footnote body retains literal backslash data and protects its closing bracket. |
| ESC-WMDX-SUBSCRIPT-01, ESC-WMDX-HIGHLIGHT-01, ESC-WMDX-PEN-01, ESC-WMDX-SUPERSCRIPT-01 | CommonMark import collision handling, then Wmdx-to-CommonMark export | Only the opening delimiter needed to disable Wmdx-only syntax is escaped; redundant closing-delimiter escapes fail the deletion check. |
| ESC-WMDX-STRIKE-LITERAL-01 | CommonMark import collision handling | A literal `~~` sequence is preserved with only the necessary opening protection. |
| ESC-WMDX-WIKILINK-01, ESC-WMDX-IMAGE-EMBED-01 | Wmdx/Obsidian link and image parsers | Literal bracket strings do not become wikilinks or embeds; the embed marker is protected without redundantly escaping its brackets. |
| ESC-WMDX-CALLOUT-01 | `escapeForeignCalloutMarkers` / editor callout layout parser | A CommonMark quote containing `[!note]` stays an ordinary quote rather than activating Obsidian callout layout. |
| ESC-WMDX-EQUALS-RUN-01 | CommonMark import | A bare `===` run, which is not a Wmdx delimiter, receives no unnecessary escape. |
| ESC-CM-UNDERSCORE-EMPHASIS-01 | CommonMark import/export | CommonMark `_emphasis_` and `__strong__` are normalized to asterisk emphasis rather than escaped into literal underscores or confused with Wmdx underline. |
| ESC-LINK-COMMONMARK-01, ESC-LINK-REFERENCE-01 | CommonMark inline/reference link formatters and renderer | Link-label brackets and destination parentheses are checked against actual link semantics, including a literal backslash in the label. |
| ESC-LINK-OBSIDIAN-01 | Obsidian link formatter/parser | A target pipe is escaped because it separates target from alias; alias brackets that the Wmdx parser accepts stay bare. |
| ESC-LINK-HTML-IMPORT-01 | `markdownLinkDestination` / CommonMark renderer | Balanced destination parentheses remain bare; literal backslash path data is retained. |
| ESC-LINK-HTML-UNBALANCED-OPEN-01, ESC-LINK-HTML-UNBALANCED-CLOSE-01 | `markdownLinkDestination` / CommonMark renderer | Unmatched parentheses are escaped because removing the backslash changes the link destination or terminates the link early. |

The helper fails if a fixture omits its case ID, producer, target, or case rationale. Its failure message includes a per-character reason such as “protects a literal pipe boundary,” “encodes a literal backslash,” or “preserves a literal backslash before an ordinary character.”

## Findings this audit has already corrected

- A backslash before an ordinary filename/word character was doubled even though both the CommonMark and Wmdx resource parsers preserve a single backslash there.
- Paired Wmdx-only `~`, `=`, and `^` delimiters escaped both opening and closing markers. Escaping the opening marker alone is sufficient to prevent the pair from activating; the closing escape was redundant.
- Obsidian image import escaped both `!` and an opening bracket. The import now protects the embed marker, not every character in the token.
- Literal `===` was escaped despite not forming an active Wmdx construct.
- Balanced parentheses in an HTML link destination were escaped even though CommonMark accepts them. Only unmatched parentheses require protection.
- Angle brackets in HTML link destinations were backslash-escaped even though the target renderer produced the same URL without those escapes. They are now percent-encoded instead.
- Backticks inside imported HTML `<code>` content were backslash-escaped even though Markdown code spans do not process backslash escapes. HTML code now selects a longer fence and adds padding only when needed; both HTML import routes are checked against CommonMark-rendered code text.
- Wmdx resource fields, media labels, image alt text, link labels, and inline footnotes now use minimal backslash-run serialization appropriate to their parser. Wmdx resource fields treat `|` as a field separator; CommonMark link fields use CommonMark punctuation rules.

These are regression findings, not evidence that every conversion path is
finished.

## Remaining audit queue

The following work is still required before escape minimality can be called complete:

- Reconcile every backslash-emitting branch in `markdownConversion.mjs` against its target parser, including nested HTML, code/raw-HTML/math protection, reference labels, block contexts, and every Wmdx delimiter overlap.
- Expand link-destination cases to schemes, angle brackets, titles, percent encodings, URL query/fragment punctuation, and unmatched parentheses in combinations.
- Add escaped/unescaped pairs for image URLs and every media URL/layout title; current media tests focus on labels and rely on percent-encoding tests for their URL paths.
- Cover every footnote flavor and definition/reference form, not only Obsidian inline footnotes.
- Inventory any remaining serializer in media, embeds, paste conversion, HTML/MHTML conversion, and Markdown flavor export that emits a backslash.
- Apply the same remove-one-escape audit across the complete upstream CommonMark/GFM fixtures and the full Obsidian/Wmdx conversion matrix. Current source/output helper cases do not certify every corpus example.
- Pair the text conversion assertions with the all-view interaction matrix: Source/Code, WYSIWYG, and both exposed-syntax settings, including caret movement, edits/undo, scrolling, and nested contexts.
- Add a separate, conservative Markdown style check for test fixtures and documentation. Evaluate the user-referenced [Obsidian Linter](https://github.com/platers/obsidian-linter) rules in check-only mode first; do not let formatting rules rewrite source wrapping, soft breaks, list structure, or escape semantics. Style linting is a hygiene gate, not a dialect conformance test. Code-file beautification is a separate future task.

Do not mark a path covered merely because the serializer has a unit test or the import/export operation returns text. The target parser must agree on meaning, and every emitted backslash must have an independently justified role.

## Completion criteria

This gate is complete only after the code search inventory is reconciled with all escape-producing helpers, every target-specific and context-specific backslash has a semantic reason and a deletion test, all supported dialect round trips preserve meaning or explicitly report loss, and the full view interaction matrix passes. Keep completed, failing, unsupported, and pending cases distinct in `Markdown-Compatibility-Matrix.md`.
