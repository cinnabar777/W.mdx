package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

class TextPackManagerTest {
    @Test
    fun opensTheAttachedTextBundleExampleUsingItsPopulatedTextMarkdownEntry() {
        val sessionDir = temporaryDirectory()
        val archiveFile = File.createTempFile("textpack-example-roundtrip-", ".textpack")
        try {
            val input = javaClass.getResourceAsStream("/example.textpack")
            assertNotNull("The TextBundle v2 example fixture is missing.", input)

            val markdownPath = input!!.use {
                TextPackManager.extractArchive(it, sessionDir)
            }
            val markdown = File(sessionDir, markdownPath).readText(Charsets.UTF_8)
            val session = TextPackSession(sessionDir, markdown, null, markdownPath)

            assertEquals("text.markdown", markdownPath)
            assertTrue(markdown.contains("# Textbundle Example"))
            assertTrue(markdown.contains("![](assets/textbundle.png)"))
            assertTrue(File(sessionDir, "text.md").readText(Charsets.UTF_8).isBlank())
            assertNotNull(TextPackManager.resolveAssetFile(session, "assets/textbundle.png"))
            assertEquals(
                "https://appassets.androidplatform.net/textpack-assets/" +
                    "${sessionDir.name}/assets/textbundle.png",
                TextPackManager.previewAssetUrl(session, "assets/textbundle.png")
            )

            TextPackManager.writeSessionArchive(sessionDir, markdownPath, archiveFile)
            ZipFile(archiveFile).use { saved ->
                assertNotNull(saved.getEntry("text.markdown"))
                assertNull(saved.getEntry("text.md"))
                assertNotNull(saved.getEntry("assets/textbundle.png"))
            }
        } finally {
            archiveFile.delete()
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun preservesNestedAssetPathsDuringExtractionAndArchiveWriting() {
        val sessionDir = temporaryDirectory()
        val archiveFile = File.createTempFile("textpack-test-", ".textpack")
        val nestedImage = byteArrayOf(1, 2, 3, 4)
        try {
            val input = zip(
                "info.json" to """{"version":2,"type":"net.daringfireball.markdown"}""".toByteArray(),
                "text.markdown" to "![Nested](assets/illustrations/cover.png)".toByteArray(),
                "assets/illustrations/cover.png" to nestedImage
            )
            val markdownPath = TextPackManager.extractArchive(ByteArrayInputStream(input), sessionDir)
            assertEquals("text.markdown", markdownPath)
            assertTrue(File(sessionDir, "assets/illustrations/cover.png").isFile)
            assertFalse(File(sessionDir, "assets/cover.png").exists())

            TextPackManager.writeSessionArchive(sessionDir, markdownPath, archiveFile)
            TextPackManager.verifyStagedArchive(archiveFile, markdownPath)
            ZipFile(archiveFile).use { saved ->
                assertNotNull(saved.getEntry("assets/illustrations/cover.png"))
                assertNull(saved.getEntry("assets/cover.png"))
                assertNotNull(saved.getEntry("text.markdown"))
            }
        } finally {
            archiveFile.delete()
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun insertsImagesWithTheirOriginalNamesAndUniqueCollisionSuffixes() {
        val sessionDir = temporaryDirectory()
        val session = TextPackSession(sessionDir, "", null)
        try {
            val firstPath = TextPackManager.addAssetImage(
                session,
                ByteArrayInputStream(byteArrayOf(10, 20)),
                "Photos/Beach Sunset.png",
                "image/png"
            )
            val secondPath = TextPackManager.addAssetImage(
                session,
                ByteArrayInputStream(byteArrayOf(30, 40)),
                "Photos/Beach Sunset.png",
                "image/png"
            )

            assertEquals("assets/Beach%20Sunset.png", firstPath)
            assertEquals("assets/Beach%20Sunset-2.png", secondPath)
            assertTrue(TextPackManager.resolveAssetFile(session, firstPath)!!.isFile)
            assertTrue(TextPackManager.resolveAssetFile(session, secondPath)!!.isFile)
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun rejectsTraversalPathsAndArchivesWithTraversalEntries() {
        listOf("../outside.png", "/outside.png", "assets/../../outside.png", "C:/outside.png")
            .forEach { path ->
                try {
                    TextPackManager.safeArchivePath(path)
                    throw AssertionError("Expected unsafe archive path to be rejected: $path")
                } catch (_: IOException) {
                    // Expected: archive entries must remain within the package.
                }
            }

        val sessionDir = temporaryDirectory()
        try {
            val maliciousZip = zip("../outside.png" to byteArrayOf(1, 2, 3))
            try {
                TextPackManager.extractArchive(ByteArrayInputStream(maliciousZip), sessionDir)
                throw AssertionError("Expected traversal entry to be rejected.")
            } catch (_: IOException) {
                // Expected: unsafe entries must not be extracted.
            }
            assertFalse(File(sessionDir.parentFile, "outside.png").exists())
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun refusesToGuessBetweenMultiplePopulatedTextDocuments() {
        val sessionDir = temporaryDirectory()
        try {
            val input = zip(
                "text.md" to "# One".toByteArray(),
                "text.markdown" to "# Two".toByteArray()
            )
            try {
                TextPackManager.extractArchive(ByteArrayInputStream(input), sessionDir)
                throw AssertionError("Expected ambiguous text documents to be rejected.")
            } catch (error: IOException) {
                assertTrue(error.message.orEmpty().contains("ambiguous"))
            }
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    private fun temporaryDirectory(): File =
        Files.createTempDirectory("textpack-test-").toFile()

    private fun zip(vararg entries: Pair<String, ByteArray>): ByteArray {
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            entries.forEach { (path, bytes) ->
                zip.putNextEntry(ZipEntry(path))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        return output.toByteArray()
    }
}
