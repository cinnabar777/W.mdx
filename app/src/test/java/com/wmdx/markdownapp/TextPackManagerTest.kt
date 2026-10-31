package com.wmdx.markdownapp

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.text.Normalizer
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TextPackManagerTest {
    @Test
    fun projectArchiveRoundTripPreservesUntouchedEntriesWhenNestedMarkdownIsEdited() {
        val manifest = """
            {
              "spec": { "name": "mdzip-spec", "version": "1.2.1" },
              "mode": "project",
              "entryPoint": "docs/chapters/start.md",
              "projectMetadata": { "keepSpacing": true }
            }
        """.trimIndent().toByteArray(Charsets.UTF_8)
        val untouchedMarkdown = "## Reference\r\n\nKeep this exact text: café.\r\n"
            .toByteArray(Charsets.UTF_8)
        val otherMarkdown = "# Root notes\n\nDo not change this file.\n".toByteArray(Charsets.UTF_8)
        val binaryAsset = byteArrayOf(0, 1, 0x7f, 0x80.toByte(), 0xff.toByte(), 0x0a)
        val sourceArchive = createArchive(
            linkedMapOf(
                "manifest.json" to manifest,
                "docs/chapters/start.md" to "# Original\n".toByteArray(Charsets.UTF_8),
                "docs/reference.md" to untouchedMarkdown,
                "README.md" to otherMarkdown,
                "assets/sample.bin" to binaryAsset
            )
        )
        val initialSessionDir = java.nio.file.Files.createTempDirectory("mdzip-source").toFile()
        val reopenedSessionDir = java.nio.file.Files.createTempDirectory("mdzip-reopened").toFile()

        try {
            val extractedEntries = TextPackManager.extractArchive(
                ByteArrayInputStream(sourceArchive),
                initialSessionDir
            )
            assertTrue("manifest.json" in extractedEntries)
            assertTrue("docs/chapters/start.md" in extractedEntries)

            TextPackManager.writeMdzipDocument(
                initialSessionDir,
                "docs/chapters/start.md",
                "# Edited chapter\n\nOnly this document changed.\n"
            )
            val savedArchive = ByteArrayOutputStream().also { output ->
                TextPackManager.writeMdzipArchive(initialSessionDir, output)
            }.toByteArray()
            TextPackManager.extractArchive(ByteArrayInputStream(savedArchive), reopenedSessionDir)

            assertArrayEquals(manifest, File(reopenedSessionDir, "manifest.json").readBytes())
            assertArrayEquals(untouchedMarkdown, File(reopenedSessionDir, "docs/reference.md").readBytes())
            assertArrayEquals(otherMarkdown, File(reopenedSessionDir, "README.md").readBytes())
            assertArrayEquals(binaryAsset, File(reopenedSessionDir, "assets/sample.bin").readBytes())
            assertEquals(
                "# Edited chapter\n\nOnly this document changed.\n",
                File(reopenedSessionDir, "docs/chapters/start.md").readText(Charsets.UTF_8)
            )
        } finally {
            initialSessionDir.deleteRecursively()
            reopenedSessionDir.deleteRecursively()
        }
    }

    @Test
    fun manifestEntryPointTakesPrecedenceOverIndex() {
        assertEquals(
            "docs/chapter-one.md",
            TextPackManager.resolveMdzipEntryPoint(
                setOf("index.md", "docs/chapter-one.md"),
                "docs/chapter-one.md"
            )
        )
    }

    @Test
    fun entryPointDiscoveryPrefersRootIndex() {
        assertEquals(
            "index.md",
            TextPackManager.resolveMdzipEntryPoint(
                setOf("index.md", "notes.md", "images/cover.png"),
                null
            )
        )
    }

    @Test
    fun entryPointDiscoveryUsesTheOnlyRootMarkdownFile() {
        assertEquals(
            "START.MD",
            TextPackManager.resolveMdzipEntryPoint(
                setOf("README.md", "START.MD", "docs/chapter.md"),
                null
            )
        )
    }

    @Test
    fun entryPointDiscoveryUsesTheOnlySupportMarkdownFileWhenNecessary() {
        assertEquals(
            "README.md",
            TextPackManager.resolveMdzipEntryPoint(setOf("README.md"), null)
        )
    }

    @Test
    fun declaredEntryPointAllowsOptionalDotPrefixAndNfcMatching() {
        val composedPath = Normalizer.normalize("café.md", Normalizer.Form.NFC)
        val decomposedPath = Normalizer.normalize("café.md", Normalizer.Form.NFD)
        assertEquals(
            composedPath,
            TextPackManager.resolveMdzipEntryPoint(setOf(composedPath), "./$decomposedPath")
        )
    }

    @Test(expected = IOException::class)
    fun ambiguousRootMarkdownFilesDoNotSelectArbitrarily() {
        TextPackManager.resolveMdzipEntryPoint(
            setOf("one.md", "two.markdown"),
            null
        )
    }

    @Test(expected = IOException::class)
    fun nestedMarkdownWithoutEntryPointIsNotSelectedArbitrarily() {
        TextPackManager.resolveMdzipEntryPoint(
            setOf("docs/one.md", "docs/two.md"),
            null
        )
    }

    @Test(expected = IOException::class)
    fun invalidManifestEntryPointIsRejected() {
        TextPackManager.resolveMdzipEntryPoint(
            setOf("index.md"),
            "../outside.md"
        )
    }

    @Test
    fun projectEntryPointUsesDeclaredPathOrFirstMarkdownFile() {
        assertEquals(
            "docs/start.markdown",
            TextPackManager.resolveMdzipProjectEntryPoint(
                setOf("docs/start.markdown", "guide/intro.md", "images/cover.png"),
                null
            )
        )
        assertEquals(
            "guide/intro.md",
            TextPackManager.resolveMdzipProjectEntryPoint(
                setOf("index.md", "guide/intro.md"),
                "guide/intro.md"
            )
        )
    }

    @Test
    fun internalDocumentAndLinkPathsKeepTheirPackageFolders() {
        val available = setOf("index.md", "docs/intro.md", "docs/chapters/one.md")
        assertEquals(
            "docs/chapters/one.md",
            TextPackManager.resolveMdzipDocumentPath("docs/chapters/one.md", available)
        )
        assertEquals(
            "docs/chapters/one.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/intro.md",
                "chapters/one.md#section",
                available
            )
        )
        assertEquals(
            "index.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/intro.md",
                "../index.md?view=full",
                available
            )
        )
    }

    @Test
    fun nestedProjectLinksResolveFromTheCurrentlyOpenDocument() {
        val available = setOf(
            "index.md",
            "docs/guide.md",
            "docs/chapters/topic.md"
        )
        assertEquals(
            "docs/chapters/topic.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/guide.md",
                "chapters/topic.md#Deep%20Dive",
                available
            )
        )
        assertEquals(
            "docs/guide.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/chapters/topic.md",
                "../guide.md#Guide%20Details",
                available
            )
        )
        assertEquals(
            "index.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/chapters/topic.md",
                "../../index.md#Start",
                available
            )
        )
    }

    @Test
    fun internalLinkResolutionRejectsEscapesAndExternalTargets() {
        val available = setOf("index.md", "docs/intro.md", "docs/chapter one.md")
        assertEquals(
            "docs/chapter one.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/intro.md",
                "chapter%20one.md",
                available
            )
        )
        assertEquals(
            null,
            TextPackManager.resolveMdzipLinkPath(
                "index.md",
                "../../outside.md",
                available
            )
        )
        assertEquals(
            null,
            TextPackManager.resolveMdzipLinkPath(
                "index.md",
                "https://example.com/guide.md",
                available
            )
        )
    }

    private fun createArchive(entries: Map<String, ByteArray>): ByteArray {
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
