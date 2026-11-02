package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.util.zip.ZipEntry
import java.util.zip.ZipFile

class MdzipManagerTest {
    @Test
    fun acceptsSafeArchivePaths() {
        assertEquals("docs/notes.md", MdzipManager.safeArchivePath("docs/notes.md"))
        assertEquals("audio/voice 1.mp3", MdzipManager.safeArchivePath("audio/voice 1.mp3"))
    }

    @Test
    fun rejectsArchiveTraversalAndAbsolutePaths() {
        listOf("../outside.md", "docs/../../outside.md", "/index.md", "audio\\voice.mp3")
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
            assertEquals("../attachments/reference (2).pdf", secondLink)
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
    fun identifiesImageAttachmentsForPackagePreviews() {
        assertTrue(MdzipManager.isSupportedImageFileName("attachments/textbundle.png"))
        assertTrue(MdzipManager.isSupportedImageFileName("attachments/photo.webp"))
        assertFalse(MdzipManager.isSupportedImageFileName("attachments/reference.pdf"))
    }
}
