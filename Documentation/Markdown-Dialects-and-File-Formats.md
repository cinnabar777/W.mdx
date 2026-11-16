# Markdown Dialects, Settings, and File Formats

This guide explains how the editor combines Markdown dialects, which syntax preferences control recognition and authoring, and how conversion and file operations work. For syntax examples, see the [Wmdx Markdown Cheat Sheet](Markdown.md). The [native syntax design](Wmdx-Syntax-Design.md) records Wmdx-specific decisions and remaining acceptance work; the [Markdown compatibility matrix](Markdown-Compatibility-Matrix.md) tracks executable coverage and known gaps; the [element conversion and editor test plan](Markdown-Element-Compatibility-Test-Plan.md) defines the required per-element conversion, view, editing, caret, context, and scroll gates.

## One document, two editor surfaces

Wmdx keeps one Markdown source and parses CommonMark core syntax, selected GFM extensions, selected Obsidian conventions, and Wmdx additions. These are syntax families in one editor, not separate document modes.

| Editor surface | Behavior |
| --- | --- |
| Rendered Markdown editor | One shared block/layout pipeline. A syntax-exposure setting controls whether syntax stays hidden, appears around the caret, or expands to the active line/block. WYSIWYG and Live Preview are exposure presets, not separate renderers. |
| Source/Code editor | Non-Markdown text files open in Source/Code automatically; Markdown files use the selected Markdown view. The editor provides filename-based highlighting for Markdown, JavaScript/TypeScript/JSX/TSX, JSON, YAML, Python, SQL, Java, Rust, C/C++, Go, PHP, HTML/XML/SVG, and CSS. A Menu action can override the language per document; unknown extensions default to plain text. All source characters remain visible; Markdown blocks, media, and tables are not rendered as document widgets. Callout bodies are never folded. |

JSON files are not reformatted when opened. In Source/Code, **Menu → Format JSON** validates the document before re-indenting it with two spaces. Formatting changes whitespace only: property order, duplicate keys, and the original spelling of scalar values are preserved. Invalid JSON is left untouched and reports the approximate error line and column; the edit can be undone.

Source-editor appearance and token colors are separate from rendered Document Appearance settings. In the interim, the app still exposes the Rendered syntax exposure and Source/Code language highlighting are configured separately; Source token colors do not change Document Appearance.

Source pipe tables stay literal and editable. A nested Source editor scrolls the whole table as a unit by default, keeping columns aligned without shifting surrounding text or widening the app's document viewport. Separate settings control horizontal scrolling in Source and rendered views; the Table toolbar can toggle the setting for the current view, with an optional user-assigned shortcut.

## What the syntax toggles do

Settings are app-wide, not stored in each document. **Markdown & Dialects** provides a primary Wmdx, CommonMark, GFM, or Obsidian profile. The profile sets default syntax recognition and authoring choices for supported features. Fresh installs and **Reset All** start with CommonMark; Wmdx-only syntax, GFM/Obsidian extensions, callouts, and footnotes are disabled by default. Existing saved choices are preserved; changing the profile does not rewrite source or replace an explicitly saved choice.

Turning a feature or spelling off does not rewrite or delete source. It only changes recognition/rendering and authoring behavior. Import and export conversion remain separate actions.

## Official dialect references

Use these primary sources when defining compatibility fixtures. A link to a specification is a reference for implementation and testing; it does not by itself mean every feature is implemented in Wmdx.

- [CommonMark project](https://commonmark.org/)
- [CommonMark specification 0.31.2](https://spec.commonmark.org/0.31.2/)
- [CommonMark reference implementations and validation test suite](https://github.com/commonmark)
- [GitHub Flavored Markdown specification](https://github.github.com/gfm/)
- [Obsidian Flavored Markdown](https://obsidian.md/help/obsidian-flavored-markdown)

## Reference implementations and libraries

Use these projects as references for the behavior and tests they already solved. A passing test in another editor does not prove Wmdx compatibility. Check the relevant code, tests, license, runtime requirements, and bundle/APK cost before considering code reuse. The pinned CommonMark 0.31.2 specification and reference suite remain authoritative for CommonMark behavior.

### Editor behavior and Android interaction

- [MarkText for Android](https://github.com/Renakoni/marktext-android) (MIT) adapts the Muya live-preview editor for Android. Its tests cover caret following, IME visibility, selection lifecycle, source mode, table commands, document-provider I/O, and imported images. Consult it for mobile cursor, keyboard, table, and attachment workflows; its Vue/Capacitor/Muya architecture is not a drop-in replacement for Wmdx's CodeMirror/WebView editor.
- [Hyphen](https://github.com/DenserMeerkat/hyphen) (Apache-2.0) is a Compose Multiplatform Markdown-native WYSIWYG editor. Its block, selection, history, clipboard, and Markdown serializer code/tests are useful references for editor state and undo; the Compose implementation is not directly reusable in the WebView editor.
- [Compose Rich Editor](https://github.com/MohamedRejeb/compose-rich-editor) (Apache-2.0) calculates first-line and continuation-line indents from a list prefix and indent level. Use it as a reference for stable wrapped-list alignment, not as a dependency for the current CodeMirror renderer.
- [MarkdownEditText](https://github.com/YahiaAngelo/MarkdownEditText) (Apache-2.0) uses Android text spans, including a measured `LeadingMarginSpan` for ordered-list markers, plus custom movement/selection handling. It is useful for native Android editing behavior, not WYSIWYG WebView layout.
- [TinyMCE](https://github.com/tinymce/tinymce) (GPL version 2 or later in `LICENSE.md`; GitHub repository metadata says `NOASSERTION`) is a web rich-text editor. Use it to study toolbar, selection, tables, clipboard, and HTML import/export behavior. It is not a Markdown parser or a drop-in CodeMirror/WebView component; copying code requires confirming Wmdx distribution compatibility with its GPL terms or using suitable commercial terms.
- [CKEditor 5 list editing](https://github.com/cinnabar777/ckeditor5/blob/master/packages/ckeditor5-list/src/list/listediting.ts) separates list type, indent, and item identity in its model. Use this as a design reference for semantic list state. GitHub reports no repository-wide SPDX license for this fork, so do not copy code until its applicable license is verified.
- [Markor](https://github.com/gsantner/markor) is an Android text editor with Markdown syntax highlighting and a Flexmark-based converter. Use it to study source editing, file/paste workflows, and parser configuration; it is not a rendered WYSIWYG editor. GitHub reports no repository-wide SPDX license, so do not copy code until licensing is verified.

Screened 2026-11-16 as implementation/behavior references; these are not conformance oracles. Recheck licenses/notices before copying any code.

- [Acode CanvasView](https://github.com/Acode-Foundation/canvas-view) (MIT; notices also cover CodeMirror-derived MIT code and AOSP `OverScroller` under Apache-2.0) draws a CodeMirror 6 state with a custom WebGL2/WebGPU view and Android-style scrolling. Study viewport, touch, and scroll behavior only; it is not a Markdown renderer and would be a major view architecture change.
- [XCoder](https://github.com/carsaimz/xcoder) (MIT; Acode-derived, with original attribution retained) is an offline-first Android CodeMirror 6 code editor with language modules, workspace, and editor tests. Useful for code-view and file-workflow comparisons, not Markdown flavor compatibility.
- [Pilcrow](https://github.com/kleokl7/pilcrow) (MIT) is a recent Android CodeMirror 6 Markdown editor with formatted/source surfaces, Obsidian-style syntax, and tables/properties that switch to source editing when tapped. Useful for touch and view-transition behavior; its small/new repository history means each behavior still needs independent validation.
- [Lynx Studio](https://github.com/SiriusXofc/lynx-studio) (MIT) is a mobile-first CodeMirror 6 code editor emphasizing gestures, compact tabs, line wrapping, diagnostics, and an extra symbol row. Use it for Android keyboard/touch workflow ideas, not Markdown parsing.
- [OpenObsidian](https://github.com/Anon5T4R/OpenObsidian) (GPL-3.0-or-later) is an independent Electron/React/CodeMirror 6 Obsidian-inspired app with WikiLinks/embeds, split/edit/reading views, Mermaid, KaTeX, and highlights; its README links a separate Android app. It is a useful feature and UI reference, not the official Obsidian specification. Treat code as GPL-only unless Wmdx licensing is confirmed compatible.
- [Moyo / padmd](https://github.com/gnitgintoay/padmd) (MIT) is a local-first, tablet-oriented CodeMirror 6 Markdown editor with folder import and heading navigation. Its README says image attachments, relative resource paths, and HTML export are still planned, so use it for touch/file-workflow ideas rather than import/export compatibility evidence.
- [QingCode Mobile IDE](https://github.com/what-can-I-say-91/QingCode-Mobile-IDE) (MIT) is an offline Android CodeMirror 6 code editor with language tooling, Pyodide, and Termux integrations. Its README lists a 753 KB vendored CodeMirror bundle; use only for language-module/offline-packaging comparisons, not as a dependency recommendation.
- [Neo MD](https://github.com/myxiaolizi/neomd) (MIT) combines Tiptap 3, CodeMirror 6, and markdown-it, and documents Obsidian-vault migration with tests. Useful to study asset-path migration, conversion reports, and multi-view workflows; it is not a CommonMark or Obsidian conformance oracle.
- [4notes-app](https://github.com/4kauanmota/4notes-app) describes a CodeMirror 6 visual Markdown editor with tables, list renumbering, checklists, and formatting inside lists. No repository license file or declared license was visible in the reviewed page; use as a behavior reference only and do not copy code unless licensing is clarified.

### Parsing, rendering, conversion, and features

- [Turndown](https://github.com/mixmark-io/turndown) (MIT) converts standard CommonMark-rendered HTML to Markdown before Wmdx import; version 7.2.5 pulls in `@mixmark-io/domino` (BSD-2-Clause). The app uses it only for HTML composed of CommonMark core-renderer elements and leaves Wmdx-specific/custom HTML on the existing importer. Treat its output as an adapter to validate against the pinned corpus, not proof of full HTML or dialect compatibility.
- [remark-gfm](https://github.com/remarkjs/remark-gfm) (MIT) is a JavaScript GFM plugin covering tables, task lists, footnotes, strikethrough, and autolink literals. Evaluate it as a web-side parser/conversion comparison for demonstrated GFM gaps; it does not provide Wmdx rendering or editor interactions.
- [Markwon](https://github.com/noties/Markwon) (Apache-2.0) renders Markdown to Android-native `Spanned` text without a WebView and has extension examples for HTML, images, tables, tasks, and code highlighting. Its README references CommonMark 0.28, so it is a rendering reference, not an oracle for the app's CommonMark 0.31.2 gate.
- [flexmark-java](https://github.com/vsch/flexmark-java) (BSD-2-Clause) provides a Markdown AST/parser and HTML↔Markdown conversion modules. Its repository description references CommonMark 0.28; compare it against the pinned corpus and target features before considering it for conversion. A Java dependency would also need justification in the current JavaScript/WebView pipeline.
- [obsidian-html](https://github.com/krissrex/obsidian-html) (MIT) exports Obsidian vault Markdown and linked resources to static HTML. Use it to inspect Obsidian HTML export conventions and resource handling; it is a Python vault exporter, not a general HTML-to-Markdown importer or Android runtime component.
- [Obsidian Linter](https://github.com/platers/obsidian-linter) (MIT) has configurable, independently applied formatting rules. Use its rule catalog and conflict notes when designing Markdown lint settings; linting must remain separate from beautifying and must not silently rewrite documents.
- [Mermaid](https://github.com/mermaid-js/mermaid) (MIT) renders text-based diagrams. If added, give it explicit Document Appearance controls, retain editable fenced source when rendering is off or unsupported, and measure bundle size before selecting a runtime build.

### Reuse rule

Prefer these references to inventing behavior, but do not transplant whole editors or parsers. For each proposed dependency, record the exact feature it solves, license compatibility, supported CommonMark/GFM/Obsidian behavior, Android/WebView compatibility, size impact, and the focused test that demonstrates a Wmdx gap is closed.

## Math and equation editing: not integrated

The current codebase has no integrated math parser, renderer, or equation editor. LaTeX, AsciiMath, and Typst are candidate math notations or toolchains; a WYSIWYG equation editor is a separate authoring interface. None is currently promised by a Wmdx, CommonMark, GFM, or Obsidian profile.

Treat math as a separate compatibility item rather than assuming Markdown flavor support includes it. Future evaluation should decide which inline and block forms to support, how source stays editable, and how rendering, clipboard/HTML conversion, export, accessibility, and round-tripping behave. Possible plugin boundaries to investigate are a CodeMirror extension for source/selection-aware editing, a math renderer, and an equation-authoring UI; no specific plugin has been selected or integrated.

## Compatibility completion gate

Parser support alone is not proof of full dialect compatibility. Track each flavor and syntax feature across recognition/rendering, editing round-trip, document conversion, clipboard paste, Markdown export, HTML import, and HTML/MHTML export. Test every element in WYSIWYG, caret-exposed syntax, active-line/block-exposed syntax, and Source/Code, including cursor movement, edits, scrolling, view switches, and valid nested contexts. Mark an item verified only when its conversion and applicable editor-interaction fixtures pass or report a documented loss. Unsupported or untested syntax must remain visibly identified as unverified; do not infer complete parity from a successful build or from another flavor's tests. The current evidence and explicit boundaries are maintained in the [compatibility matrix](Markdown-Compatibility-Matrix.md) and its [element-level test plan](Markdown-Element-Compatibility-Test-Plan.md).

| Feature | Syntax families and relevant controls |
| --- | --- |
| GFM extensions | The central **GFM Extensions** switch controls parser recognition of pipe tables, task markers, double-tilde strikethrough, and bare-URL autolinks. It defaults off for CommonMark and on for Wmdx, GFM, and Obsidian profiles; it can be overridden independently. |
| Links | CommonMark inline/automatic links, Markdown reference links, Obsidian `[[wikilinks]]`, and Wmdx four-field resource links have separate flavor switches. The preferred-link setting controls what the Link action inserts. |
| Headings | CommonMark/GFM/Obsidian ATX (`#`) and Setext (`===` / `---`) headings, plus Wmdx decimal headings (`.1`–`.6`). |
| Lists | Standard Markdown lists, Wmdx bullet and ordered-marker styles, and standalone Wmdx tasks. GFM/Obsidian task-list recognition has its own switch. |
| Block quotes | Shared Markdown `>` syntax with one feature switch. |
| Callouts | Wmdx `±type`, `±type-`, `±type+`; Obsidian `> [!type]` and fold markers. GitHub alerts overlap with the Obsidian spelling for `note`, `tip`, `important`, `warning`, and `caution`; other alert-like blockquotes remain ordinary quotes on GFM import. |
| Footnotes | Markdown reference footnotes (`[^label]`), Wmdx numbered footnotes, and Obsidian inline footnotes (`^[text]`) have syntax controls. |
| Underline | **Use Wmdx syntax** recognizes Wmdx underline forms. When disabled, HTML `<u>...</u>` is the compatibility form. |
| Wmdx subscript | **Wmdx Subscript Syntax** independently controls single-tilde `~text~`. It defaults on for Wmdx and off for CommonMark, GFM, and Obsidian profiles, so single tildes stay literal in standard-only profiles. |
| Wmdx superscript | **Wmdx Superscript Syntax** controls paired-caret `^text^`. It defaults on for Wmdx and off for CommonMark, GFM, and Obsidian profiles; export converts it to semantic HTML where Markdown has no native equivalent. |
| Highlight and pen | **Wmdx Highlight and Pen Syntax** under **Document Appearance → Markers and Pens** controls Wmdx color-slot highlights and pen marks. It defaults on only for Wmdx. **Obsidian Highlight Syntax** separately enables plain `==text==` highlights for Obsidian. |
| Tables and inline formatting | GFM pipe tables, task markers, double-tilde strikethrough, and bare-URL autolinks are parsed when GFM Extensions is enabled. Wmdx paired-caret `^text^` superscript is described in the cheat sheet. |

The Wmdx extensions include resource links and embeds, decimal headings, additional list markers, native tasks, callouts, footnotes, subscript, superscript, underline styles, highlight/pen color slots, and media/attachment metadata. Wmdx-only syntax is controlled by its feature preferences; syntax shared with a target profile follows that profile's behavior. The cheat sheet gives the exact source spelling.

## Convert, paste, and export

The editor has explicit conversion actions in the toolbar's Menu group. They operate on the currently open document or clipboard; they are not a file picker. Each conversion previews the result and reports known losses before applying it. The preview display is limited to the first 6,000 converted characters for phone-sized screens; conversion, replacement, and export still use the complete document. A browser regression test checks content beyond that preview limit.

| Action | Source and result |
| --- | --- |
| Convert from Markdown dialect | Choose CommonMark, GFM, Obsidian, or HTML for the current document; review the Wmdx preview, then explicitly replace the document. Open or paste the source into the editor first. |
| Paste from Markdown dialect | Choose CommonMark, GFM, Obsidian, or HTML for clipboard text; review the preview, then insert converted Wmdx at the current selection. |
| Regular paste | When enabled in Markdown & Dialects, safely recognized Markdown or rich HTML is converted to the primary profile. Ambiguous plain text and conversions that report losses are left unchanged. |
| Export Markdown dialect | Choose CommonMark, GFM, or Obsidian; review the converted text and warnings, then save a separate `.md` copy with Android's Save As dialog. |
| HTML / MHTML export | A semantic renderer converts the active Markdown profile to HTML; it does not export CodeMirror's editor DOM. HTML and MHTML remain separate actions from Markdown-dialect export. |
| Open MHTML | `.mht` and `.mhtml` files are parsed as bounded MIME archives; the HTML part and related image/media parts are converted into a new, unsaved Markdown document. |
| Open/save Markdown or MDZip | Opens and saves source or packages it with its related assets; file operations do not silently convert syntax. |

## Primary flavor and paste behavior

The Markdown & Dialects page is the centralized place to select a primary profile and enable automatic paste conversion. Feature-specific syntax settings remain available under Document Appearance and override profile defaults when the user has saved a choice there. Profiles select authoring defaults as well as which Wmdx-specific, GFM, and Obsidian spellings are recognized by the corresponding feature controls.

Regular paste inspects plain text and, on Android, the clipboard's HTML representation. Clearly recognized CommonMark/GFM/Obsidian content is converted through the app's Wmdx conversion rules to the selected profile. HTML is parsed semantically rather than rendered as active content. If conversion reports losses, fails, or the text does not look like Markdown, regular paste keeps the plain-text representation. The explicit **Paste from Markdown dialect** action remains available when the user wants to choose a source format and review warnings. HTML clipboard conversion is bounded to 200,000 characters.

Automatic conversion uses heuristic flavor detection, so it is intentionally conservative rather than a full dialect validator. Clipboard HTML is available only when the source app publishes that representation. The Android clipboard path and the profile-specific paste cases are covered by browser/unit tests; device-specific clipboard providers still need acceptance testing.

HTML conversion is semantic, not a browser snapshot. It maps supported headings, paragraphs, lists/tasks, quotes, code, tables, links, images, audio/video, attachments, details, and alignment where possible. Scripts and active embedded content are omitted; multi-paragraph list items, rich table-cell inline content, and HTML table spans are preserved where Wmdx has equivalent syntax. Inline CSS, HTML comments, and unsupported structures produce warnings or are not retained.

HTML export is semantic as well: it renders the complete Markdown source rather than copying the editor's presentation DOM, preserves supported callout folding and footnotes, sanitizes active scripts and event handlers, and embeds local images, media, and safe document attachments when the Android bridge can read them (8 MiB per file). Separate-CSS export falls back to inline styles when the selected file provider cannot create a sibling stylesheet. MHTML import is limited to 16 MiB and resolves MIME `start`, `Content-Base`, `Content-Location`, and `Content-ID` into the HTML root and data-URL resources; CSS-driven layout and provider-specific media behavior remain acceptance-test items.

MHTML export uses Android WebView's archive writer after generating the HTML document. The JVM tests cover the MIME importer and HTML document builder, but cannot verify that WebView creates a standards-compatible archive or that each Android document provider saves all related resources. Treat actual MHTML export and reopen as device verification still required.

## Conversion rules and known limits

Conversion is deliberately explicit and conservative:

- Parser-recognized ATX headings and simple top-level Setext headings become Wmdx decimal headings. Setext headings inside lists or blockquotes, and headings with explicit hard breaks, retain their Markdown spelling so their enclosing structure and line-break semantics are not changed.
- Markdown emphasis written with underscores becomes asterisk emphasis on import, avoiding a collision with Wmdx underscore-underlining. Underscore thematic breaks normalize to `---`.
- Standard-dialect single-tilde text is escaped on import so it remains literal rather than becoming Wmdx subscript. CommonMark double-tilde text is also escaped because CommonMark does not define strikethrough; GFM and Obsidian double-tilde strikethrough remains semantic.
- Standard Markdown links stay in their original syntax, preserving empty labels, titles, nested formatting, and CommonMark edge cases. Obsidian wikilinks become Wmdx resource links.
- Supported image/audio/video or attachment embeds become Wmdx embedded resources. Note transclusions are retained with a warning because Wmdx does not embed another Markdown document.
- GFM alerts and Obsidian callouts become Wmdx callouts. Obsidian folding markers are retained in Wmdx.
- Obsidian comments are left in their original spelling and warned about because Wmdx has no matching native comment syntax.
- Wmdx alphabetic/Roman ordered markers export as decimal markers with a warning.
- Wmdx tasks export as GFM/Obsidian task items. CommonMark tasks require inline HTML checkboxes and are warned because task lists are not part of CommonMark.
- Wmdx callout type/color/fold styling falls back to a standard block quote in CommonMark and unsupported GFM alerts; GFM's supported alert types use alert syntax. The warning identifies lost styling or fold state.
- Wmdx colored underline/highlight slots lose their custom style/color when the target has no equivalent. Wmdx pen marks have no portable Markdown equivalent and are exported as plain text with a warning.
- Wmdx subscript imports from semantic HTML `<sub>` and exports to `<sub>` in CommonMark, GFM, and Obsidian documents.
- Wmdx audio/video embeds export as semantic HTML media elements; other embedded resources export as attachment links. Obsidian exports supported embeds with `![[...]]` where its syntax retains the resource details.
- Wmdx superscript imports from semantic HTML `<sup>` and exports to `<sup>` in CommonMark, GFM, and Obsidian documents.
- Wmdx strikethrough exports as CommonMark `<del>` and stays `~~text~~` in GFM and Obsidian.
- Explicit Markdown-dialect conversion maps inline raw HTML emphasis (`<strong>`, `<b>`, `<em>`, `<i>`), strike, subscript, superscript, and highlight to Wmdx syntax where supported. This is not full raw-HTML rendering: unconverted Markdown containing HTML blocks, links, or other tags can still differ from a standards-compliant browser renderer and remains an open compatibility gate.
- GFM pipe tables are preserved in CommonMark output with a warning. Pipe tables are not defined by CommonMark, so a strict CommonMark renderer may show the source as text instead of a table.
- YAML frontmatter is preserved verbatim and is not interpreted as Wmdx metadata; importing it warns that properties remain unparsed, and exporting to CommonMark/GFM warns that those formats do not standardize frontmatter.
- Obsidian heading/block transclusion, plugin syntax, math, Mermaid, semantic tags, and full vault resolution are not supported.

The pinned CommonMark 0.31.2 corpus contains 652 examples. All 575 non-HTML examples are imported, exported, and compared for rendered semantics using the official reference renderer. All 21 non-HTML GFM 0.29 extension examples are compared with upstream expected HTML semantics in WYSIWYG, with source preservation checked. Seven curated Obsidian WYSIWYG fixtures cover wikilinks, heading links, highlights, image embeds, callouts, tasks, and footnotes. Raw HTML cases are excluded by the no-active-HTML policy; the GFM and Obsidian fixtures do not certify full dialect conformance. These checks do **not** certify complete CommonMark, GFM, Obsidian, or HTML conformance.

The linter checks common structural errors such as unclosed code fences, unresolved references/footnotes, malformed Wmdx resource fields, table row widths, empty callouts, active HTML, and Obsidian transclusion. It also reports known Wmdx-only syntax for non-Wmdx targets and GFM-only task, strike, and table syntax for CommonMark. Code-fenced examples are excluded from syntax warnings. A clean lint result is not proof that a document is valid in every target renderer.

## Rendering HTML Embedded in Markdown

CommonMark defines raw HTML blocks and inline raw HTML, so this belongs to the CommonMark renderer. This work covers HTML inside Markdown documents, not standalone HTML or MHTML import/export. Markdown remains the saved source; rendered HTML is a view.

### Resource Audit

- **Existing Wmdx stack (preferred):** Wmdx already includes the CommonMark 0.31.2 JavaScript parser/renderer and DOMPurify. Reuse those rather than introducing a second Markdown parser. The parser supplies CommonMark semantics; DOMPurify supplies the browser safety boundary. Neither by itself maps rendered elements back to CodeMirror source positions.
- **usememos/editor (MIT; closest design reference):** https://github.com/usememos/editor documents a sanitizer callback that receives an off-page DocumentFragment, can decline rendering so the raw source remains visible, and reveals HTML source while the caret is in the HTML region. Its editor uses a different block model, so it is a pattern and test reference rather than a drop-in Wmdx dependency.
- **markdown-it (MIT):** https://github.com/markdown-it/markdown-it supports CommonMark and configurable raw HTML, but would add a second parser beside the one already used by Wmdx.
- **Markor (Apache-2.0):** https://github.com/gsantner/markor is an Android editor and useful behavior reference, not a CodeMirror/WebView renderer to drop in.
- **Marky (MIT):** https://github.com/metafates/marky is a Rust Markdown-to-HTML site generator with math and Mermaid support, not an interactive source-preserving editor.
- **obsidian-html (GPL-3.0):** https://github.com/obsidian-html/obsidian-html converts Obsidian vaults to Markdown/HTML; it is not an embedded editor renderer and its GPL code must not be incorporated into Wmdx.
- **OpenObsidian (GPL-3.0-or-later):** https://github.com/Anon5T4R/OpenObsidian is an Electron/CodeMirror application that may inform behavior, but its code is not compatible with Wmdx's proprietary license without separate permission.
- **CKEditor 5:** https://ckeditor.com/docs/ckeditor5/latest/features/html/general-html-support.html and https://ckeditor.com/docs/ckeditor5/latest/getting-started/licensing/license-and-legal.html document general HTML support and HTML embedding. CKEditor is a rich-text editor framework, not a Markdown raw-HTML renderer; its open-source distribution is GPL-2+ and commercial use requires the appropriate commercial license, so it is not a direct dependency for this proprietary project.
- **codemirror-for-writers:** https://github.com/dwaynemcyrus/codemirror-for-writers describes hybrid CodeMirror editing, but GitHub reports no repository license. Do not reuse its code unless a license is added or permission is obtained.
- **@latentic/live-markdown:** https://github.com/getlatentic/live-markdown is MIT-licensed and useful as a CodeMirror live-rendering reference; its documentation does not establish raw-HTML support, so it is not the solution to this gap.

### Implementation Boundary

Use the existing CommonMark parser to identify and render CommonMark raw-HTML nodes, then sanitize before attaching any rendered DOM. Keep the original Markdown unchanged, preserve source offsets, and reveal raw syntax when the caret enters the HTML span or block. Source view continues to show literal source. Never execute scripts, event handlers, or unsafe URLs; if a sanitizer rejects content, preserve and expose the source instead of silently deleting it. Support ordinary safe HTML through a documented allowlist, and do not claim arbitrary custom or active HTML is fully rendered. Whole-document HTML/MHTML conversion remains a later phase.
