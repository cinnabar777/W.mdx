package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HtmlExportDocumentBuilderTest {
    @Test
    fun preservesInlineWhitespaceAndStructuredBodyWhenWrappingHtml() {
        val body = """
            <h1>Guide</h1>
            <p>Start with <strong>bold</strong> and a <a href="https://example.test">link</a>.</p>
            <ul><li>First</li><li>Second</li></ul>
            <table><tr><th>Name</th><th>Count</th></tr><tr><td>Item</td><td>3</td></tr></table>
        """.trimIndent()

        val (html, cssFile) = HtmlExportDocumentBuilder.build(
            editorHtml = body,
            documentTitle = "Guide",
            includeToc = true,
            tocLevels = 3,
            includeCss = true,
            cssPlacement = "head",
            cssContent = "body { color: #111; }"
        )

        assertTrue(html.contains("<p>Start with <strong>bold</strong> and a <a href=\"https://example.test\">link</a>.</p>"))
        assertTrue(html.contains("<table><tr><th>Name</th><th>Count</th></tr><tr><td>Item</td><td>3</td></tr></table>"))
        assertTrue(html.contains("""<h1 id="heading-1">Guide</h1>"""))
        assertTrue(html.contains("""<a href="#heading-1" class="toc-link">Guide</a>"""))
        assertEquals(null, cssFile)
    }

    @Test
    fun retainsTheCompleteBodyAndEscapesTheDocumentTitle() {
        val body = "<p>Opening marker.</p>" +
            "<p>Body content.</p>".repeat(1_000) +
            "<h2>Final heading</h2><p>Tail marker survives.</p>"

        val (html, _) = HtmlExportDocumentBuilder.build(
            editorHtml = body,
            documentTitle = """Notes </title><script>alert("x")</script>""",
            includeToc = false,
            tocLevels = 3,
            includeCss = false,
            cssPlacement = "head",
            cssContent = ""
        )

        assertTrue(
            html.contains("""<h2 id="heading-1">Final heading</h2><p>Tail marker survives.</p>""")
        )
        assertTrue(html.contains("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"))
        assertFalse(html.contains("<title>Notes </title><script>"))
        assertTrue(html.length > 6_000)
    }

    @Test
    fun returnsSeparateStylesheetOnlyWhenConfigured() {
        val css = "body { color: #111; }"
        val (html, separateCss) = HtmlExportDocumentBuilder.build(
            editorHtml = "<p>Text</p>",
            documentTitle = "Notes",
            includeToc = false,
            tocLevels = 3,
            includeCss = true,
            cssPlacement = "file",
            cssContent = css
        )

        assertTrue(html.contains("""<link rel="stylesheet" href="styles.css">"""))
        assertEquals(css, separateCss)
    }
}
