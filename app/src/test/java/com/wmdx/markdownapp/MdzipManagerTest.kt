package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

class MdzipManagerTest {
    @Test
    fun acceptsSafeArchivePaths() {
        assertEquals("docs/notes.md", MdzipManager.safeArchivePath("docs/notes.md"))
        assertEquals("audio/voice 1.mp3", MdzipManager.safeArchivePath("audio/voice 1.mp3"))
        assertEquals("caf\u00e9.md", MdzipManager.safeArchivePath("cafe\u0301.md"))
    }

    @Test
    fun rejectsArchiveTraversalAndAbsolutePaths() {
        listOf(
            "../outside.md",
            "docs/../../outside.md",
            "/index.md",
            "audio\\voice.mp3",
            "folder//notes.md",
            "folder/",
            "bad:name.md",
            "bad?.md",
            "bad\u007f.md",
            "bad\u0001.md"
        )
            .forEach { path ->
                try {
                    MdzipManager.safeArchivePath(path)
                    throw AssertionError("Expected unsafe path to be rejected: $path")
                } catch (_: IOException) {
                    // Expected: archive entries must remain within the package.
                }
            }
    }

    @Test
    fun recognizesOnlyMdzPackageNames() {
        assertEquals(true, MdzipManager.isMdzipFileName("notes.mdz"))
        assertEquals(true, MdzipManager.isMdzipFileName("NOTES.MDZ"))
        assertFalse(MdzipManager.isMdzipFileName("notes.textpack"))
        assertFalse(MdzipManager.isMdzipFileName("notes.md"))
    }

    @Test
    fun normalizesProviderDuplicateSuffixesBeforeTheMdzExtension() {
        assertEquals(
            "untitled (1).mdz",
            MdzipManager.normalizeDuplicateMdzipFileName("untitled.mdz (1)")
        )
        assertEquals(
            "notes.with.dots (2).mdz",
            MdzipManager.normalizeDuplicateMdzipFileName("notes.with.dots.MDZ (2)")
        )
        assertEquals(null, MdzipManager.normalizeDuplicateMdzipFileName("untitled.mdz"))
        assertEquals(null, MdzipManager.normalizeDuplicateMdzipFileName("untitled.mdz backup"))
    }

    @Test
    fun acceptsMp3AacM4aWavFlacOpusOggAndOgaAudioFiles() {
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.mp3"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.aac"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("VOICE.M4A"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.wav"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.flac"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.opus"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.ogg"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.oga"))
    }

    @Test
    fun acceptsPlayableAndUnsupportedNoticeVideoFormatsAndRejectsOtherVideoFormats() {
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.MP4"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.M4V"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.WEBM"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.3GP"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.MOV"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.MKV"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.AVI"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.MPEG"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.MPG"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.OGV"))
        assertEquals(true, MdzipManager.isSupportedVideoFileName("phone clip.WMV"))
        assertFalse(MdzipManager.isSupportedVideoFileName("phone clip.mp3"))
        assertFalse(MdzipManager.isSupportedVideoFileName("phone clip.txt"))
    }

    @Test
    fun stagesVideosWithoutCompressionAndVerifiesTheArchive() {
        val sessionDir = File.createTempFile("mdzip-session-", ".tmp")
        assertTrue(sessionDir.delete())
        assertTrue(sessionDir.mkdirs())
        val archiveFile = File.createTempFile("mdzip-stage-", ".mdz")
        val videoBytes = byteArrayOf(0, 1, 2, 3, 4, 5)

        try {
            File(sessionDir, "index.md").writeText("# Video test")
            File(sessionDir, "manifest.json").writeText("""{"entryPoint":"index.md"}""")
            val videoFile = File(sessionDir, "video/clip.mkv")
            assertTrue(videoFile.parentFile?.mkdirs() == true)
            videoFile.writeBytes(videoBytes)
            val attachedVideo = File(sessionDir, "attachments/attached-clip.mp4")
            assertTrue(attachedVideo.parentFile?.mkdirs() == true)
            attachedVideo.writeBytes(videoBytes)

            MdzipManager.writeSessionArchive(sessionDir, emptySet(), archiveFile)
            MdzipManager.verifyStagedArchive(archiveFile)

            ZipFile(archiveFile).use { archive ->
                val videoEntry = archive.getEntry("video/clip.mkv")
                assertEquals(ZipEntry.STORED, videoEntry.method)
                assertEquals(ZipEntry.STORED, archive.getEntry("attachments/attached-clip.mp4").method)
                assertEquals(ZipEntry.DEFLATED, archive.getEntry("index.md").method)
                assertArrayEquals(
                    videoBytes,
                    archive.getInputStream(videoEntry).use { it.readBytes() }
                )
            }
        } finally {
            archiveFile.delete()
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun addsAnyAttachmentWithUniqueNamesAndResolvesRelativeLinks() {
        val sessionDir = File.createTempFile("mdzip-attachment-session-", ".tmp")
        assertTrue(sessionDir.delete())
        assertTrue(sessionDir.mkdirs())
        val bytes = "attachment bytes".toByteArray()
        try {
            val firstLink = MdzipManager.addAttachment(
                sessionDir,
                "docs/notes.md",
                ByteArrayInputStream(bytes),
                "reference.pdf"
            )
            val secondLink = MdzipManager.addAttachment(
                sessionDir,
                "docs/notes.md",
                ByteArrayInputStream(bytes),
                "reference.pdf"
            )

            assertEquals("../attachments/reference.pdf", firstLink)
            assertEquals("../attachments/reference%20%282%29.pdf", secondLink)
            assertEquals(
                "attachments/reference.pdf",
                MdzipManager.resolveAttachmentArchivePath("docs/notes.md", firstLink)
            )
            assertArrayEquals(
                bytes,
                File(sessionDir, "attachments/reference.pdf").readBytes()
            )
            assertEquals(
                null,
                MdzipManager.resolveAttachmentArchivePath("docs/notes.md", "../index.md")
            )
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun avoidsCaseInsensitiveAttachmentNameCollisionsWhilePreservingSourceName() {
        val sessionDir = File.createTempFile("mdzip-attachment-session-", ".tmp")
        assertTrue(sessionDir.delete())
        assertTrue(sessionDir.mkdirs())
        try {
            val existing = File(sessionDir, "attachments/Reference.PDF")
            assertTrue(existing.parentFile?.mkdirs() == true)
            existing.writeBytes(byteArrayOf(1))

            val link = MdzipManager.addAttachment(
                sessionDir,
                "index.md",
                ByteArrayInputStream(byteArrayOf(2)),
                "reference.pdf"
            )

            assertEquals("attachments/reference%20%282%29.pdf", link)
            assertTrue(File(sessionDir, "attachments/reference (2).pdf").isFile)
            assertTrue(existing.isFile)
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun identifiesImageAttachmentsForPackagePreviews() {
        assertTrue(MdzipManager.isSupportedImageFileName("attachments/textbundle.png"))
        assertTrue(MdzipManager.isSupportedImageFileName("attachments/photo.webp"))
        assertFalse(MdzipManager.isSupportedImageFileName("attachments/reference.pdf"))
    }

    @Test
    fun opensManifestlessArchivesAndFindsTheOnlyContentMarkdownFile() {
        val contents = loadArchiveContents(
            listOf(
                "README.md" to "Package notes",
                "docs/guide.md" to "Nested files are not entry-point candidates",
                "start.MARKDOWN" to "# Start"
            )
        )

        assertEquals("start.MARKDOWN", contents.entryPoint)
        assertEquals("# Start", contents.markdownContent)
        assertEquals("document", contents.manifest.getString("mode"))
        assertEquals("start.MARKDOWN", contents.manifest.getString("entryPoint"))
        assertEquals("1.2.1", contents.manifest.getJSONObject("spec").getString("version"))
    }

    @Test
    fun prefersExactRootIndexMarkdownAndIgnoresSupportFilesDuringDiscovery() {
        val contents = loadArchiveContents(
            listOf(
                "README.md" to "Readme",
                "LICENSE.markdown" to "License",
                "notes.md" to "Other content",
                "index.md" to "# Index"
            )
        )

        assertEquals("index.md", contents.entryPoint)
        assertEquals("# Index", contents.markdownContent)
    }

    @Test
    fun readsDeclaredMarkdownEntryPointWithOptionalDotSlashAndOptionalSpec() {
        val contents = loadArchiveContents(
            listOf(
                "manifest.json" to """{"entryPoint":"./docs/Start.MARKDOWN","custom":{"keep":true}}""",
                "docs/Start.MARKDOWN" to "# Start"
            )
        )

        assertEquals("docs/Start.MARKDOWN", contents.entryPoint)
        assertEquals("# Start", contents.markdownContent)
        assertTrue(contents.manifest.getJSONObject("custom").getBoolean("keep"))
        assertEquals(
            "docs/Start.MARKDOWN",
            contents.manifest.getString("entryPoint")
        )
    }

    @Test
    fun doesNotFallBackWhenDeclaredEntryPointIsInvalidOrMissing() {
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"entryPoint":"missing.md"}""",
                "index.md" to "# Valid fallback must not be used"
            )
        )
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"entryPoint":""}""",
                "index.md" to "# Valid fallback must not be used"
            )
        )
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"entryPoint":"index.txt"}""",
                "index.txt" to "Not Markdown",
                "index.md" to "# Valid fallback must not be used"
            )
        )
    }

    @Test
    fun rejectsUnsupportedOrMalformedManifestVersionsAndModes() {
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"spec":{"version":"2.0.0"},"entryPoint":"index.md"}""",
                "index.md" to "# New major"
            )
        )
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"spec":{"version":"1.2"},"entryPoint":"index.md"}""",
                "index.md" to "# Invalid SemVer"
            )
        )
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"mode":"Document","entryPoint":"index.md"}""",
                "index.md" to "# Mode values are case-sensitive"
            )
        )
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"mode":"project","entryPoint":"index.md"}""",
                "index.md" to "# Project mode is not supported here"
            )
        )
        assertArchiveRejected(
            listOf(
                "manifest.json" to """{"spec":null,"entryPoint":"index.md"}""",
                "index.md" to "# Invalid spec type"
            )
        )
    }

    @Test
    fun rejectsDuplicateNfcPathsAndFileDirectoryConflicts() {
        assertArchiveRejected(
            listOf(
                "index.md" to "# Index",
                "caf\u00e9.md" to "composed",
                "cafe\u0301.md" to "decomposed"
            )
        )
        assertArchiveRejected(
            listOf(
                "index.md" to "# Index",
                "docs" to "A file",
                "docs/notes.md" to "A child file"
            )
        )
    }

    @Test
    fun resolvesMarkdownLinksByStrictUtf8SegmentsAndNfc() {
        assertEquals(
            "images/caf\u00e9 +#.png",
            MdzipManager.resolveRelativeArchivePath(
                "docs/index.md",
                "../images/cafe%CC%81%20+%23.png?download=1#preview"
            )
        )
        assertEquals(
            "docs/index.md",
            MdzipManager.resolveRelativeArchivePath("docs/index.md", "#heading")
        )
        assertEquals(
            "docs/index.md",
            MdzipManager.resolveRelativeArchivePath("docs/index.md", "")
        )
        assertEquals(
            "images/cover.png",
            MdzipManager.resolveRelativeArchivePath(
                "docs/index.md",
                "../images/cover.png?download=1#section?part"
            )
        )
        assertEquals(
            "images/cover.png",
            MdzipManager.resolveRelativeArchivePath(
                "docs/index.md",
                "../images//cover.png"
            )
        )
        listOf(
            "../images/%2fescape.png",
            "../images/%5Cescape.png",
            "../images/%ZZ.png",
            "../images/%C3%28.png",
            "../../../outside.png",
            "../images/"
        ).forEach { link ->
            assertEquals(null, MdzipManager.resolveRelativeArchivePath("docs/index.md", link))
        }
    }

    @Test
    fun servesImagesAudioAndVideoFromArbitraryArchiveFolders() {
        val sessionDir = createSessionDirectory()
        try {
            val image = File(sessionDir, "images/cover photo.png")
            val audio = File(sessionDir, "media/Voice.MP3")
            val video = File(sessionDir, "clips/Walkthrough.MOV")
            listOf(image, audio, video).forEach { file ->
                assertTrue(file.parentFile?.mkdirs() == true)
                file.writeBytes(byteArrayOf(1, 2, 3))
            }
            val session = MdzipSession(
                sessionDir,
                "docs/index.md",
                org.json.JSONObject(),
                "",
                null
            )

            val imagePath = MdzipManager.resolveRelativeArchivePath(
                session.entryPoint,
                "../images/cover%20photo.png"
            )
            assertEquals("images/cover photo.png", imagePath)
            assertTrue(MdzipManager.assetArchiveFile(session, imagePath!!)?.isFile == true)
            assertTrue(MdzipManager.audioArchiveFile(session, "media/Voice.MP3")?.isFile == true)
            assertTrue(MdzipManager.videoArchiveFile(session, "clips/Walkthrough.MOV")?.isFile == true)
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun usesCentralDirectoryNameWhenLocalZipHeaderNameDiffers() {
        val archiveFile = File.createTempFile("mdzip-header-name-", ".mdz")
        try {
            writeZip(archiveFile, listOf("index.md" to "# Central name"))
            val bytes = archiveFile.readBytes()
            val localNameOffset = indexOfBytes(bytes, "index.md".toByteArray())
            assertTrue(localNameOffset >= 0)
            val localHeaderName = "wrong.md".toByteArray()
            assertEquals("index.md".length, localHeaderName.size)
            localHeaderName.copyInto(bytes, localNameOffset)
            archiveFile.writeBytes(bytes)

            val contents = loadArchiveContents(archiveFile)
            assertEquals("index.md", contents.entryPoint)
            assertEquals("# Central name", contents.markdownContent)
        } finally {
            archiveFile.delete()
        }
    }

    @Test
    fun preservesOriginalUnicodeEntryNamesAndExplicitDirectoryEntriesOnSave() {
        val decomposedName = "cafe\u0301.md"
        val archiveFile = File.createTempFile("mdzip-original-path-", ".mdz")
        val sessionDir = createSessionDirectory()
        val outputFile = File.createTempFile("mdzip-preserved-path-", ".mdz")
        try {
            writeZip(
                archiveFile,
                listOf(
                    "docs/" to "",
                    "docs/notes.md" to "Nested note",
                    decomposedName to "# Unicode path"
                )
            )
            val contents = MdzipManager.loadArchive(archiveFile, sessionDir)
            MdzipManager.writeSessionArchive(
                sessionDir,
                emptySet(),
                outputFile,
                contents.originalArchivePaths,
                contents.originalDirectoryPaths
            )

            ZipFile(outputFile, Charsets.UTF_8).use { archive ->
                assertTrue(archive.getEntry(decomposedName) != null)
                assertEquals(null, archive.getEntry("caf\u00e9.md"))
                assertTrue(archive.getEntry("docs/") != null)
                assertEquals(
                    "# Unicode path",
                    archive.getInputStream(archive.getEntry(decomposedName))
                        .use { String(it.readBytes(), Charsets.UTF_8) }
                )
            }
        } finally {
            archiveFile.delete()
            outputFile.delete()
            sessionDir.deleteRecursively()
        }
    }

    @Test
    fun preservesSourceFileNameCaseAndEncodesMarkdownLinkSpaces() {
        val sessionDir = createSessionDirectory()
        try {
            val audioLink = MdzipManager.addAudio(
                MdzipSession(
                    sessionDir,
                    "docs/index.md",
                    org.json.JSONObject(),
                    "",
                    null
                ),
                ByteArrayInputStream(byteArrayOf(1, 2, 3)),
                "Voice Track.MP3"
            )

            assertEquals("../audio/Voice%20Track.MP3", audioLink)
            assertTrue(File(sessionDir, "audio/Voice Track.MP3").isFile)
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    private fun loadArchiveContents(entries: List<Pair<String, String>>): MdzipArchiveContents {
        val archiveFile = File.createTempFile("mdzip-conformance-", ".mdz")
        try {
            writeZip(archiveFile, entries)
            return loadArchiveContents(archiveFile)
        } finally {
            archiveFile.delete()
        }
    }

    private fun loadArchiveContents(archiveFile: File): MdzipArchiveContents {
        val sessionDir = createSessionDirectory()
        try {
            return MdzipManager.loadArchive(archiveFile, sessionDir)
        } finally {
            sessionDir.deleteRecursively()
        }
    }

    private fun assertArchiveRejected(entries: List<Pair<String, String>>) {
        try {
            loadArchiveContents(entries)
            throw AssertionError("Expected the MDZip archive to be rejected.")
        } catch (_: IOException) {
            // Expected: malformed or unsupported archives must fail explicitly.
        }
    }

    private fun writeZip(archiveFile: File, entries: List<Pair<String, String>>) {
        ZipOutputStream(FileOutputStream(archiveFile)).use { zip ->
            entries.forEach { (name, content) ->
                zip.putNextEntry(ZipEntry(name))
                zip.write(content.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }
        }
    }

    private fun createSessionDirectory(): File {
        val directory = File.createTempFile("mdzip-test-session-", ".tmp")
        assertTrue(directory.delete())
        assertTrue(directory.mkdirs())
        return directory
    }

    private fun indexOfBytes(haystack: ByteArray, needle: ByteArray): Int {
        if (needle.isEmpty() || needle.size > haystack.size) return -1
        for (start in 0..haystack.size - needle.size) {
            if (needle.indices.all { haystack[start + it] == needle[it] }) return start
        }
        return -1
    }
}
