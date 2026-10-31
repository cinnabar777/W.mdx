package com.wmdx.markdownapp

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.OutputStream
import java.text.Normalizer
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TextPackManagerTest {
    @Test
    fun importedAudioAndVideoSurviveSavingAndReopeningTheMdzip() {
        val sourceSessionDir = java.nio.file.Files.createTempDirectory("mdzip-media-source").toFile()
        val reopenedSessionDir = java.nio.file.Files.createTempDirectory("mdzip-media-reopened").toFile()
        val audioBytes = byteArrayOf(0, 1, 2, 3, 4, 5, 0x7f, 0x80.toByte(), 0xff.toByte())
        val videoBytes = byteArrayOf(9, 8, 7, 6, 5, 4, 3, 2, 1)

        try {
            val session = TextPackSession(
                sessionDir = sourceSessionDir,
                markdownContent = "",
                sourceUri = null
            )
            val audioPath = TextPackManager.addAssetMedia(
                session,
                ByteArrayInputStream(audioBytes),
                "voice note.ogg",
                "audio",
                "ogg"
            )
            val videoPath = TextPackManager.addAssetMedia(
                session,
                ByteArrayInputStream(videoBytes),
                "clip.webm",
                "video",
                "webm"
            )
            assertTrue("the source media name is retained", audioPath.contains("voice%20note.ogg"))
            assertTrue("the video source name is retained", videoPath.endsWith("clip.webm"))
            val markdown = "[Voice](<$audioPath>)\n\n[Clip](<$videoPath>)\n"
            TextPackManager.writeMdzipDocument(sourceSessionDir, "index.md", markdown)
            File(sourceSessionDir, "manifest.json").writeText(
                """{"spec":{"name":"mdzip-spec","version":"1.2.1"},"mode":"document","entryPoint":"index.md"}""",
                Charsets.UTF_8
            )

            val savedArchive = ByteArrayOutputStream().also { output ->
                TextPackManager.writeMdzipArchive(sourceSessionDir, output)
            }.toByteArray()
            TextPackManager.extractArchive(ByteArrayInputStream(savedArchive), reopenedSessionDir)

            val reopenedSession = TextPackSession(
                sessionDir = reopenedSessionDir,
                markdownContent = File(reopenedSessionDir, "index.md").readText(Charsets.UTF_8),
                sourceUri = null
            )
            assertEquals(markdown, reopenedSession.markdownContent)
            assertArrayEquals(
                audioBytes,
                TextPackManager.resolveAssetFile(reopenedSession, audioPath)!!.readBytes()
            )
            assertArrayEquals(
                videoBytes,
                TextPackManager.resolveAssetFile(reopenedSession, videoPath)!!.readBytes()
            )
        } finally {
            sourceSessionDir.deleteRecursively()
            reopenedSessionDir.deleteRecursively()
        }
    }

    @Test
    fun removingMediaDeletesOnlyWhenNoMarkdownDocumentReferencesTheAsset() {
        val sessionDir = java.nio.file.Files.createTempDirectory("mdzip-media-cleanup").toFile()
        try {
            val session = TextPackSession(
                sessionDir = sessionDir,
                markdownContent = "",
                sourceUri = null
            )
            TextPackManager.writeMdzipDocument(sessionDir, "index.md", "")
            val assetPath = TextPackManager.addAssetMedia(
                session,
                ByteArrayInputStream(byteArrayOf(1, 2, 3)),
                "voice note.mp3",
                "audio",
                "mp3"
            )
            val otherDocumentReference = assetPath.replaceFirst("audio/", "../audio/")
            TextPackManager.writeMdzipDocument(
                sessionDir,
                "docs/other.md",
                "[Shared](<$otherDocumentReference>)"
            )
            val assetFile = TextPackManager.resolveAssetFile(session, assetPath)!!

            assertFalse(
                "an asset referenced by another document must be kept",
                TextPackManager.removeUnreferencedMediaAsset(session, assetPath, "")
            )
            assertTrue(assetFile.exists())

            TextPackManager.writeMdzipDocument(sessionDir, "docs/other.md", "No media here.")
            assertTrue(TextPackManager.removeUnreferencedMediaAsset(session, assetPath, ""))
            assertFalse(assetFile.exists())
        } finally {
            sessionDir.deleteRecursively()
        }
    }

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
    fun writeMdzipDocumentRejectsTraversalWithoutTouchingFilesOutsideSession() {
        val rootDir = java.nio.file.Files.createTempDirectory("mdzip-path-safety").toFile()
        val sessionDir = File(rootDir, "sessions/session").apply { mkdirs() }
        val existingOutsideFile = File(rootDir, "sessions/outside.md").apply {
            writeText("Keep this file unchanged.\n", Charsets.UTF_8)
        }
        val missingOutsideFile = File(rootDir, "sessions/not-created.md")
        val originalOutsideContents = existingOutsideFile.readBytes()

        try {
            assertThrows(IOException::class.java) {
                TextPackManager.writeMdzipDocument(
                    sessionDir,
                    "../outside.md",
                    "# Overwrite outside session\n"
                )
            }
            assertThrows(IOException::class.java) {
                TextPackManager.writeMdzipDocument(
                    sessionDir,
                    "nested/../../not-created.md",
                    "# Create outside session\n"
                )
            }

            assertArrayEquals(originalOutsideContents, existingOutsideFile.readBytes())
            assertFalse("A traversal target must not be created.", missingOutsideFile.exists())
            assertFalse("Rejected paths must not create parent directories.", File(sessionDir, "nested").exists())
        } finally {
            rootDir.deleteRecursively()
        }
    }

    @Test
    fun failedMdzipSaveRestoresExistingArchiveAfterOutputFailure() {
        val sessionDir = java.nio.file.Files.createTempDirectory("mdzip-save-session").toFile()
        val priorDocument = "# Last saved version\n".toByteArray(Charsets.UTF_8)
        val priorArchive = createArchive(mapOf("index.md" to priorDocument))
        var destinationContents = priorArchive
        var destinationOpenCount = 0
        val failureAfterBytes = 64

        try {
            TextPackManager.writeMdzipDocument(
                sessionDir,
                "index.md",
                "# Unsaved replacement\n".repeat(100)
            )

            TextPackManager.writeMdzipArchiveSafely(
                sessionDir,
                openExistingArchive = { ByteArrayInputStream(destinationContents) },
                openDestination = {
                    destinationOpenCount++
                    destinationContents = byteArrayOf()
                    val shouldFail = destinationOpenCount == 1
                    object : OutputStream() {
                        private val written = ByteArrayOutputStream()

                        override fun write(value: Int) {
                            if (shouldFail && written.size() >= failureAfterBytes) {
                                throw IOException("Simulated destination write failure.")
                            }
                            written.write(value)
                            destinationContents = written.toByteArray()
                        }

                        override fun write(bytes: ByteArray, offset: Int, length: Int) {
                            for (index in offset until offset + length) {
                                write(bytes[index].toInt())
                            }
                        }
                    }
                }
            )
            throw AssertionError("Expected the simulated output failure.")
        } catch (error: IOException) {
            assertEquals("Simulated destination write failure.", error.message)
        } finally {
            sessionDir.deleteRecursively()
        }

        assertEquals("The destination should be reopened once for restoration.", 2, destinationOpenCount)
        assertArrayEquals(priorArchive, destinationContents)

        val extracted = java.nio.file.Files.createTempDirectory("mdzip-save-verify").toFile()
        try {
            TextPackManager.extractArchive(ByteArrayInputStream(destinationContents), extracted)
            assertArrayEquals(priorDocument, File(extracted, "index.md").readBytes())
        } finally {
            extracted.deleteRecursively()
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
    fun encodedUnicodeProjectLinkOpensTheExactArchiveEntry() {
        val sessionDir = java.nio.file.Files.createTempDirectory("mdzip-unicode-link").toFile()
        val decomposedName = Normalizer.normalize("café.md", Normalizer.Form.NFD)
        val archivePath = "docs/café.md"
        val expectedMarkdown = "# Unicode document\n\nOpened the exact ZIP entry.\n"
        val guideMarkdown = "# Guide\n"
        val manifest = """{"spec":{"name":"mdzip-spec","version":"1.2.1"},"mode":"project","entryPoint":"docs/guide.md"}"""
        val session = TextPackSession(
            sessionDir = sessionDir,
            markdownContent = guideMarkdown,
            sourceUri = null,
            documentPath = "docs/guide.md"
        )

        try {
            val archive = createArchive(
                mapOf(
                    "manifest.json" to manifest.toByteArray(Charsets.UTF_8),
                    "docs/guide.md" to guideMarkdown.toByteArray(Charsets.UTF_8),
                    "docs/$decomposedName" to expectedMarkdown.toByteArray(Charsets.UTF_8)
                )
            )
            val extractedPaths = TextPackManager.extractArchive(
                ByteArrayInputStream(archive),
                sessionDir
            )
            val encodedComposedName = java.net.URLEncoder
                .encode("café.md", Charsets.UTF_8.name())
                .replace("+", "%20")

            val resolvedPath = TextPackManager.resolveMdzipLinkPath(
                session.documentPath,
                encodedComposedName,
                extractedPaths
            )

            assertTrue(archivePath in extractedPaths)
            assertEquals(archivePath, resolvedPath)
            assertEquals(
                expectedMarkdown,
                TextPackManager.selectMarkdownDocument(session, resolvedPath!!)
            )
            assertEquals(archivePath, session.documentPath)
        } finally {
            sessionDir.deleteRecursively()
        }
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
