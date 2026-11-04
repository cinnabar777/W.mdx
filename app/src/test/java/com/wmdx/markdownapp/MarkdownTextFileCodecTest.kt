package com.wmdx.markdownapp

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class MarkdownTextFileCodecTest {
    @Test
    fun preservesGfmMarkdownThroughDirectFileOpenSaveAndReopen() {
        val sourceMarkdown =
            "\uFEFF- [ ] Open task\r\n" +
                "- [x] Finished task\r\n" +
                "\r\n" +
                "Single: ~removed~. Double: ~~also removed~~. Literal: ~~~not struck~~~.\r\n" +
                "Links: www.example.com, https://example.com/path, person@example.com.\r\n"
        val loaded = MarkdownTextFileCodec.read(
            ByteArrayInputStream(sourceMarkdown.toByteArray(Charsets.UTF_8))
        )

        assertEquals(sourceMarkdown, loaded.markdown)
        assertTrue(loaded.hadBom)
        assertTrue(loaded.hadCrlf)

        // The editor snapshot uses LF and may omit the source BOM.
        val editorSnapshot = loaded.markdown
            .removePrefix("\uFEFF")
            .replace("\r\n", "\n")
            .replace("Open task", "Updated task")
        val preparedForSave = MarkdownTextFileCodec.prepareForSave(
            editorSnapshot,
            hadBom = loaded.hadBom,
            hadCrlf = loaded.hadCrlf
        )
        val expectedMarkdown = sourceMarkdown.replace("Open task", "Updated task")
        assertEquals(expectedMarkdown, preparedForSave)

        val output = ByteArrayOutputStream()
        MarkdownTextFileCodec.write(output, preparedForSave)
        assertArrayEquals(
            expectedMarkdown.toByteArray(Charsets.UTF_8),
            output.toByteArray()
        )

        val reopened = MarkdownTextFileCodec.read(ByteArrayInputStream(output.toByteArray()))
        assertEquals(expectedMarkdown, reopened.markdown)
        assertTrue(reopened.hadBom)
        assertTrue(reopened.hadCrlf)
    }

    @Test
    fun ordinaryMarkdownWithoutBomOrCrlfRemainsUnchanged() {
        val markdown = "- [ ] Task\n~~struck~~\nhttps://example.com\n"
        val loaded = MarkdownTextFileCodec.read(
            ByteArrayInputStream(markdown.toByteArray(Charsets.UTF_8))
        )

        assertFalse(loaded.hadBom)
        assertFalse(loaded.hadCrlf)
        assertEquals(
            markdown,
            MarkdownTextFileCodec.prepareForSave(
                loaded.markdown,
                hadBom = loaded.hadBom,
                hadCrlf = loaded.hadCrlf
            )
        )
    }
}
