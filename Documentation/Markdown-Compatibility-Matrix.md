# Markdown compatibility matrix

This is the working, evidence-backed compatibility gate for opening, importing,
rendering, and exporting Markdown dialects. “Verified” means the named fixtures
and operations pass; it does **not** mean every feature in a dialect's entire
ecosystem is supported. Unsupported or untested cases must stay visible here
instead of being described as fully compatible.

The implementation targets Wmdx as its editable internal Markdown form. A
conversion that cannot preserve meaning should report a warning and retain the
original clipboard text rather than silently dropping content.

## Executable matrix

| Input and route | Verified scope | Evidence | Status / boundary |
| --- | --- | --- | --- |
| CommonMark 0.31.2 → Wmdx → CommonMark | 575 non-raw-HTML upstream examples are checked for parser families and rendered meaning across conversion. All 77 HTML-interoperability cases are separately run through import; unsupported fragments are preserved with warnings and active elements are omitted with warnings. Their rendered meaning is not compared. | `web/test/commonmark-spec.test.cjs` | **Verified for the 575 non-HTML examples; raw HTML is crash-tested only, not conformant.** |
| Inline HTML in Markdown rendered views | `<strong>/<b>`, `<em>/<i>`, `<del>/<s>/<strike>`, `<sub>`, `<sup>`, `<mark>`, `<code>`, and `<u>/<ins>` receive semantic styling in Live/WYSIWYG; Source retains literal tags. | `web/test/markdown-formatting.test.cjs`, `web/browser-tests/unified-layout.cjs` | **Verified for these inline tags.** Raw HTML links, images, breaks, CSS-specific styling, and HTML blocks are not yet styled as rendered objects in the editor. |
| Raw HTML during explicit Markdown conversion | Inline links, emphasis/strike/sub/sup/highlight/underline/code tags, `<img>`, `<br>`, `<audio>`, and `<video>` map to Wmdx syntax. Top-level HTML blocks convert through the semantic HTML importer, including tables; code fences remain literal. The pinned 77-case CommonMark HTML corpus completes without runtime errors. | `web/test/markdown-conversion.test.cjs`, `web/test/commonmark-spec.test.cjs` | **Partial.** Nested HTML blocks inside lists/quotes, retained unsupported tags, and full CommonMark/GFM HTML conformance still need fixtures. |
| GFM 0.29 → Wmdx → GFM | 21 upstream extension examples cover tables, task lists, strikethrough, and autolinks through import/export; rendered fixture checks compare WYSIWYG meaning. | `web/test/gfm-spec-extensions.test.cjs`, `web/test/dialect-rendering-fixtures.test.cjs` | **Verified for the pinned extension fixtures.** This is not complete GFM core conformance. |
| GFM raw-HTML tagfilter in HTML export | The nine GFM-disallowed raw tag names are escaped in semantic HTML export; code fences stay literal code. | `web/test/html-export.test.cjs` | **Verified for the tagfilter list.** This does not establish complete raw-HTML parity in editor views. |
| Obsidian → Wmdx → Obsidian | Curated examples cover wikilinks, heading links, highlights, image/audio/video/PDF embeds, callouts, tasks, and footnotes; conversion tests cover additional warning and preservation cases. | `web/test/dialect-rendering-fixtures.test.cjs`, `web/test/markdown-conversion.test.cjs` | **Partial, curated coverage.** Obsidian's full app-specific syntax and plugin ecosystem are not fully represented by an upstream conformance corpus. |
| Shared core across all nine profile pairs | CommonMark, GFM, and Obsidian shared headings, emphasis, links, code, lists, and quotes are imported, converted to each target profile, re-imported, and compared by rendered meaning. | `web/test/markdown-compatibility-matrix.test.cjs` | **Verified for this shared-core fixture.** Dialect-specific features still use their separate rows and warning rules. |
| Markdown element-by-element conversion gate | A master inventory and one-feature cases check exact Markdown spellings, all nine source/target flavor pairs for shared structures, re-imported rendered meaning, and explicit warnings for known losses. The linked plan separately requires all four editor configurations, editing, caret, scrolling, and valid nesting contexts for every item. | `Documentation/Markdown-Element-Compatibility-Test-Plan.md`, `web/test/markdown-element-compatibility.test.cjs`, `web/browser-tests/unified-layout.cjs` | **First conversion slice passes; first list interaction slice passes, full interaction gate remains pending.** The plan identifies remaining feature, marker, context, and mode combinations. |
| Full user-supplied fixture source round trips | The four complete files are converted through both alternate profiles and back; the audit prints line-level diffs, conversion warnings, and a semantic rendered-HTML comparison. Current changed/deleted/added line operations are CommonMark 73/73, GFM 2/2, Obsidian 141/123, and classic syntax 10/10 for their two routes. | `Documentation/Markdown-Fixtures/audit_roundtrips.mjs` | **Diagnostic, not a compatibility pass.** Rendered meaning matches both CommonMark routes, both GFM routes, and both classic-syntax routes. Obsidian callouts still downgrade to blockquotes in CommonMark; GFM maps `info` to `note`, so those Obsidian routes remain incomplete. |
| Shared Markdown → semantic HTML → all target flavors | Each source flavor runs through Wmdx and semantic HTML, then exports to CommonMark, GFM, and Obsidian; rendered output is compared against the reference semantics. | `web/test/markdown-compatibility-matrix.test.cjs` | **Verified for shared-core content.** This does not certify all dialect extensions. |
| GFM → HTML → GFM / CommonMark | Task state, strike, and left/right table alignment survive the HTML round trip. CommonMark export converts task markers to disabled HTML checkboxes and warns that pipe tables are GFM-only. | `web/test/markdown-compatibility-matrix.test.cjs` | **Verified for these structures.** |
| Obsidian → HTML → Obsidian | Wmdx-exported HTML preserves app metadata for wikilinks and callouts; highlight and footnote references/definitions are restored. The footnote body regression (`Definition.` becoming an ordered-list number) is covered. | `web/test/markdown-compatibility-matrix.test.cjs` | **Verified for the named fixture.** Arbitrary third-party HTML cannot identify an original Obsidian wikilink or custom callout unless it carries equivalent metadata. |
| HTML → Wmdx → CommonMark → HTML | Semantic HTML fixture covers headings, emphasis, links, lists, and blockquotes, with output compared using the CommonMark renderer. | `web/test/markdown-compatibility-matrix.test.cjs` | **Verified for this semantic fixture.** HTML import separately checks active-element omission and warnings. |
| HTML → Wmdx → GFM | Full-document fixture covers a checked task, table, and a final heading after content beyond 6,000 characters. | `web/test/markdown-compatibility-matrix.test.cjs`, `web/test/markdown-conversion.test.cjs` | **Verified for this fixture and supported HTML structures.** Not a complete HTML-to-Markdown specification. |
| HTML/MHTML generated table of contents → selected Markdown flavor | Heading IDs created for exported HTML are resolved back to heading text on import; same-document absolute URLs are matched against the archive base, while unrelated external URLs remain external. CommonMark/GFM receive slug links, CommonMark gets explicit anchors, Obsidian receives heading wikilinks, and the MHTML import bridge exports directly into the selected profile. | `web/test/markdown-conversion.test.cjs`, `web/test/markdown-compatibility-matrix.test.cjs`, `app/src/test/java/com/wmdx/markdownapp/HtmlExportDocumentBuilderTest.kt` | **Unit-verified for the isolated TOC element.** Real archive/device verification remains pending. |
| HTML document export | Converts the active profile into semantic HTML (not CodeMirror editor DOM); covers headings, inline styles, tasks, GFM tables, callouts, Markdown/Wmdx/Obsidian footnotes, images, audio/video, safe attachment data links, long documents, and sanitizes active scripts/handlers. | `web/src/htmlExport.mjs`, `web/test/html-export.test.cjs`, `app/src/test/java/com/wmdx/markdownapp/HtmlExportDocumentBuilderTest.kt` | **Verified for these renderer and wrapper cases.** Android document-provider asset reads and separate-CSS behavior still need device acceptance. |
| HTML file → new Markdown document | Explicit HTML conversion creates a new unsaved `.md` document instead of leaving Markdown text attached to the HTML file; browser tests verify the replacement boundary and complete semantic export bridge. | `web/browser-tests/unified-layout.cjs`, `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`, `app/src/main/java/com/wmdx/markdownapp/ImportedMarkdownFileName.kt` | **Verified at the browser/native-bridge boundary.** Android file-picker/provider interaction still needs device acceptance. |
| MHTML → Wmdx → each Markdown flavor | Multipart parsing covers quoted-printable HTML, Base64 resources, Content-Location, Content-ID, the declared MIME `start` root, Content-Base, and a 16 MiB archive bound. Embedded images, audio, video, and PDF bytes remain available through all three Markdown export profiles. | `app/src/test/java/com/wmdx/markdownapp/MhtmlArchiveImporterTest.kt`, `web/test/markdown-compatibility-matrix.test.cjs`, `web/browser-tests/unified-layout.cjs` | **Synthetic archive/resource fixtures pass; user confirmed a real archive reopens.** TOC link repair is regression-covered in source, with final Android-device verification pending. |
| MHTML export | Uses Android WebView's `saveWebArchive` after building the HTML document. | `app/src/main/java/com/wmdx/markdownapp/DocumentExporter.kt` | **User confirmed real export and reopen.** Generated TOC links were incorrect and are now covered by source regression tests; verify the repaired APK on device. |
| Downloaded dialect fixtures → MDZip | Four user-provided sources are packaged with locally referenced image, audio, video, PDF, and other attachments; archive checks compare every entry byte-for-byte with its source file and validate local references. | `Documentation/Markdown-Fixtures/build_mdz.py`, `web/test/markdown-fixture-packages.test.cjs` | **Archive integrity and packaged references verified.** Full flavor-by-flavor semantic and source-line round trips remain a separate open gate. |
| Clipboard HTML / Markdown → selected profile | Conservative source detection, HTML semantic conversion, loss fallback, and dialect conversion have focused unit tests. | `web/test/markdown-paste.test.cjs` | **Verified for tested cases.** Device-specific clipboard HTML availability still requires Android acceptance testing. |

Run the web gate from `web/` with:

```sh
node --test test/markdown-compatibility-matrix.test.cjs \
  test/markdown-element-compatibility.test.cjs \
  test/commonmark-spec.test.cjs \
  test/gfm-spec-extensions.test.cjs \
  test/dialect-rendering-fixtures.test.cjs \
  test/markdown-conversion.test.cjs \
  test/markdown-fixture-packages.test.cjs \
  test/html-export.test.cjs \
  test/markdown-paste.test.cjs
```

Run the HTML wrapper tests through the Android unit-test task:

```sh
./gradlew testDebugUnitTest
```

## Known exclusions and next gates

- CommonMark raw HTML interoperability remains separate from native Markdown
  parsing. All 77 upstream HTML cases now complete explicit conversion without
  crashes, but only selected examples have semantic conversion assertions.
- GFM's nine-tag raw-HTML tagfilter is applied during HTML export. Raw HTML is
  still not fully rendered or converted identically in every editor view.
- The Obsidian fixture set is intentionally curated, not a claim of complete
  Obsidian compatibility. Plugin-defined syntax, transclusion behavior, and
  other app-only features need explicit support decisions and fixtures.
- The web export bridge now renders semantic HTML from the full Markdown source
  independently of editor mode, and browser tests verify it does not export
  CodeMirror markup. Android document-provider asset reads, separate CSS, and
  post-fix MHTML TOC-link behavior still need device acceptance.
- MHTML import now honors the MIME `start` root and `Content-Base`; broader
  real-world archive samples and CSS-dependent layouts still need fixtures.
- HTML/MHTML conversions preserve tested semantic content and related media
  bytes, but source-only distinctions can change: CommonMark has no native task
  list, CommonMark pipe tables are not standard, and arbitrary HTML does not
  carry Obsidian wikilink/callout identity unless the app adds metadata. Known
  losses are reported where the converter can identify them. HTML link tooltip
  titles and custom CSS have no general Wmdx equivalent.
- LaTeX, AsciiMath, Typst, and a WYSIWYG equation editor are not integrated.
  Treat math as unsupported unless a future implementation adds a parser,
  renderer, editing behavior, and import/export fixtures.

Do not mark a row fully compatible just because import and export return text.
The acceptance test must compare rendered meaning, verify the entire document
including its tail, and record any warning or intentional loss.
