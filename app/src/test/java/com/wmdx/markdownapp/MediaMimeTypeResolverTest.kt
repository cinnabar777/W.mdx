package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaMimeTypeResolverTest {
    @Test
    fun mdzipImportUsesTheSelectedFileExtensionOverAConflictingProviderMime() {
        assertEquals(
            "audio/mp4",
            MediaMimeTypeResolver.mdzipImportMimeType(
                "m4a.m4a",
                "audio/mpeg",
                "audio"
            )
        )
    }

    @Test
    fun archiveExtensionWinsOverAConflictingSavedMimeHint() {
        assertEquals(
            "audio/mp4",
            MediaMimeTypeResolver.archiveAssetMimeType(
                "m4a",
                "audio/mpeg",
                "audio"
            )
        )
        assertEquals(
            "audio/flac",
            MediaMimeTypeResolver.archiveAssetMimeType(
                "flac",
                "audio/mpeg",
                "audio"
            )
        )
    }

    @Test
    fun validMimeHintRemainsAvailableForUnknownArchiveExtensions() {
        assertEquals(
            "audio/x-custom",
            MediaMimeTypeResolver.archiveAssetMimeType(
                "custom",
                "audio/x-custom",
                "audio"
            )
        )
        assertNull(
            MediaMimeTypeResolver.archiveAssetMimeType(
                "custom",
                "video/x-custom",
                "audio"
            )
        )
    }
}
