package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.io.IOException

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
    fun acceptsMp3M4aFlacAndOpusButNotOggAudioFiles() {
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.mp3"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("VOICE.M4A"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.flac"))
        assertEquals(true, MdzipManager.isSupportedAudioFileName("voice.opus"))
        assertFalse(MdzipManager.isSupportedAudioFileName("voice.ogg"))
    }
}
