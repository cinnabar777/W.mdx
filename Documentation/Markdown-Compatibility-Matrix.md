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
| CommonMark 0.31.2 → Wmdx → CommonMark | 575 non-raw-HTML upstream examples are checked for parser families and rendered meaning across conversion. The 652-example corpus is pinned; 77 HTML-interoperability cases are classified separately. | `web/test/commonmark-spec.test.cjs` | **Verified for the 575 non-HTML examples.** This is not a claim that raw HTML is fully interoperable. |
| Inline raw HTML during explicit Markdown conversion | `<strong>`, `<b>`, `<em>`, and `<i>` map to native Wmdx emphasis; inline code, comments, and script/style/pre blocks remain literal. Separate HTML-document import supports a larger semantic element set. | `web/test/markdown-conversion.test.cjs` | **Partial.** This conversion path does not make raw HTML render natively when an unconverted Markdown file is opened; block HTML in Markdown still needs semantic conversion and conformance fixtures. |
| GFM 0.29 → Wmdx → GFM | 21 upstream extension examples cover tables, task lists, strikethrough, and autolinks through import/export; rendered fixture checks compare WYSIWYG meaning. | `web/test/gfm-spec-extensions.test.cjs`, `web/test/dialect-rendering-fixtures.test.cjs` | **Verified for the pinned extension fixtures.** GFM raw-HTML tag filtering is explicitly excluded by policy. |
| Obsidian → Wmdx → Obsidian | Curated examples cover wikilinks, heading links, highlights, image embeds, callouts, tasks, and footnotes; conversion tests cover additional warning and preservation cases. | `web/test/dialect-rendering-fixtures.test.cjs`, `web/test/markdown-conversion.test.cjs` | **Partial, curated coverage.** Obsidian's full app-specific syntax and plugin ecosystem are not fully represented by an upstream conformance corpus. |
| Shared core across all nine profile pairs | CommonMark, GFM, and Obsidian shared headings, emphasis, links, code, lists, and quotes are imported, converted to each target profile, re-imported, and compared by rendered meaning. | `web/test/markdown-compatibility-matrix.test.cjs` | **Verified for this shared-core fixture.** Dialect-specific features still use their separate rows and warning rules. |
| HTML → Wmdx → CommonMark → HTML | Semantic HTML fixture covers headings, emphasis, links, lists, and blockquotes, with output compared using the CommonMark renderer. | `web/test/markdown-compatibility-matrix.test.cjs` | **Verified for this semantic fixture.** HTML import separately checks active-element omission and warnings. |
| HTML → Wmdx → GFM | Full-document fixture covers a checked task, table, and a final heading after content beyond 6,000 characters. | `web/test/markdown-compatibility-matrix.test.cjs`, `web/test/markdown-conversion.test.cjs` | **Verified for this fixture and supported HTML structures.** Not a complete HTML-to-Markdown specification. |
| HTML document export | Converts the active profile into semantic HTML (not CodeMirror editor DOM); covers headings, inline styles, tasks, GFM tables, callouts, Markdown/Wmdx/Obsidian footnotes, images, audio/video, safe attachment data links, long documents, and sanitizes active scripts/handlers. | `web/src/htmlExport.mjs`, `web/test/html-export.test.cjs`, `app/src/test/java/com/wmdx/markdownapp/HtmlExportDocumentBuilderTest.kt` | **Verified for these renderer and wrapper cases.** Android document-provider asset reads and separate-CSS behavior still need device acceptance. |
| HTML file → new Markdown document | Explicit HTML conversion creates a new unsaved `.md` document instead of leaving Markdown text attached to the HTML file; browser tests verify the replacement boundary and complete semantic export bridge. | `web/browser-tests/unified-layout.cjs`, `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`, `app/src/main/java/com/wmdx/markdownapp/ImportedMarkdownFileName.kt` | **Verified at the browser/native-bridge boundary.** Android file-picker/provider interaction still needs device acceptance. |
| MHTML → Wmdx | Multipart parsing covers quoted-printable HTML, Base64 resources, Content-Location, Content-ID, the declared MIME `start` root, Content-Base, and a 16 MiB archive bound; related resources become data URLs before semantic HTML conversion. | `app/src/test/java/com/wmdx/markdownapp/MhtmlArchiveImporterTest.kt`, `web/test/markdown-compatibility-matrix.test.cjs`, `web/browser-tests/unified-layout.cjs` | **Verified for these parser and conversion cases.** CSS-driven layout and Android provider behavior still need device acceptance. |
| MHTML export | Uses Android WebView's `saveWebArchive` after building the HTML document. | `app/src/main/java/com/wmdx/markdownapp/DocumentExporter.kt` | **Not end-to-end verified.** Creating and reopening a real archive must be checked on Android; the JVM suite cannot validate WebView's archive writer. |
| Clipboard HTML / Markdown → selected profile | Conservative source detection, HTML semantic conversion, loss fallback, and dialect conversion have focused unit tests. | `web/test/markdown-paste.test.cjs` | **Verified for tested cases.** Device-specific clipboard HTML availability still requires Android acceptance testing. |

Run the web gate from `web/` with:

```sh
node --test test/markdown-compatibility-matrix.test.cjs \
  test/commonmark-spec.test.cjs \
  test/gfm-spec-extensions.test.cjs \
  test/dialect-rendering-fixtures.test.cjs \
  test/markdown-conversion.test.cjs \
  test/html-export.test.cjs \
  test/markdown-paste.test.cjs
```

Run the HTML wrapper tests through the Android unit-test task:

```sh
./gradlew testDebugUnitTest
```

## Known exclusions and next gates

- CommonMark raw HTML interoperability remains separate from native Markdown
  parsing. The corpus classifies those examples, but only selected examples are
  currently checked through the HTML importer.
- GFM tag filtering for raw HTML is excluded; it must not be confused with
  support for ordinary Markdown features or safe HTML import.
- The Obsidian fixture set is intentionally curated, not a claim of complete
  Obsidian compatibility. Plugin-defined syntax, transclusion behavior, and
  other app-only features need explicit support decisions and fixtures.
- The web export bridge now renders semantic HTML from the full Markdown source
  independently of editor mode, and browser tests verify it does not export
  CodeMirror markup. Android document-provider asset reads, separate CSS, and
  WebView MHTML capture/reopen still need device acceptance.
- MHTML import now honors the MIME `start` root and `Content-Base`; broader
  real-world archive samples and CSS-dependent layouts still need fixtures.
- LaTeX, AsciiMath, Typst, and a WYSIWYG equation editor are not integrated.
  Treat math as unsupported unless a future implementation adds a parser,
  renderer, editing behavior, and import/export fixtures.

Do not mark a row fully compatible just because import and export return text.
The acceptance test must compare rendered meaning, verify the entire document
including its tail, and record any warning or intentional loss.
