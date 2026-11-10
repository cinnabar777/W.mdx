package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets

class MhtmlArchiveImporterTest {
    @Test
    fun multipartStartSelectsTheRootHtmlPartAndTopLevelContentBaseResolvesResources() {
        val archive = """
            MIME-Version: 1.0
            Content-Type: multipart/related; boundary="root"; start="<main@archive>"
            Content-Base: https://example.test/archive/

            --root
            Content-Type: text/html; charset=UTF-8
            Content-ID: <secondary@archive>
            Content-Location: secondary.html

            <p>Secondary body</p>
            --root
            Content-Type: image/png
            Content-Transfer-Encoding: base64
            Content-ID: <picture@archive>
            Content-Location: images/pixel.png

            AQID
            --root
            Content-Type: text/html; charset=UTF-8
            Content-ID: <main@archive>
            Content-Location: page.html

            <h1>Main body</h1><img src="images/pixel.png">
            --root--
        """.trimIndent().replace("\n", "\r\n")
        val result = MhtmlArchiveImporter.parse(
            ByteArrayInputStream(archive.toByteArray(StandardCharsets.ISO_8859_1))
        )

        assertTrue(result.html.contains("Main body"))
        assertFalse(result.html.contains("Secondary body"))
        assertEquals(
            "data:image/png;base64,AQID",
            result.embeddedResources["https://example.test/archive/images/pixel.png"]
        )
    }

    @Test
    fun extractsQuotedPrintableHtmlAndBase64ResourcesWithLocationAndCidAliases() {
        val archive = """
            MIME-Version: 1.0
            Snapshot-Content-Location: https://example.test/docs/page.html
            Content-Type: multipart/related;
             boundary="wmdx-boundary";
             type="text/html"

            --wmdx-boundary
            Content-Type: text/html; charset=UTF-8
            Content-Transfer-Encoding: quoted-printable
            Content-Location: https://example.test/docs/page.html

            <h1>Caf=C3=A9</h1><img src=3D"images/pixel.png"><img src=3D"cid:logo">
            --wmdx-boundary
            Content-Type: image/png
            Content-Transfer-Encoding: base64
            Content-Location: images/pixel.png
            Content-ID: <logo>

            AQIDBA==
            --wmdx-boundary--
        """.trimIndent().replace("\n", "\r\n")

        val result = MhtmlArchiveImporter.parse(
            ByteArrayInputStream(archive.toByteArray(StandardCharsets.ISO_8859_1))
        )
        val expectedDataUri = "data:image/png;base64,AQIDBA=="

        assertTrue(result.html.contains("<h1>Café</h1>"))
        assertEquals(
            expectedDataUri,
            result.embeddedResources["images/pixel.png"]
        )
        assertEquals(
            expectedDataUri,
            result.embeddedResources["https://example.test/docs/images/pixel.png"]
        )
        assertEquals(expectedDataUri, result.embeddedResources["cid:logo"])
    }

    @Test
    fun readsAnHtmlMimePartAndRejectsOversizedOrMalformedArchives() {
        val htmlOnly = (
            "MIME-Version: 1.0\r\n" +
                "Content-Type: text/html; charset=UTF-8\r\n\r\n" +
                "<p>Plain HTML archive</p>"
            ).toByteArray(StandardCharsets.UTF_8)
        assertEquals(
            "<p>Plain HTML archive</p>",
            MhtmlArchiveImporter.parse(ByteArrayInputStream(htmlOnly)).html
        )

        val oversized = runCatching {
            MhtmlArchiveImporter.parse(
                ByteArrayInputStream(ByteArray(8)),
                maxBytes = 4
            )
        }.exceptionOrNull()
        assertTrue(oversized is IllegalArgumentException)
        assertTrue(oversized?.message.orEmpty().contains("exceeds"))

        val malformed = runCatching {
            MhtmlArchiveImporter.parse(
                ByteArrayInputStream("not MIME".toByteArray(StandardCharsets.UTF_8))
            )
        }.exceptionOrNull()
        assertTrue(malformed is IllegalArgumentException)
    }
}
