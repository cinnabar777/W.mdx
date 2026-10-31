package com.wmdx.markdownapp

import java.nio.file.Files
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ArchiveAssetResponsePlanTest {
    @Test
    fun audioAndVideoByteRangesReturnOnlyTheRequestedPackagedBytes() {
        val mediaBytes = ByteArray(256) { it.toByte() }
        val mediaFile = Files.createTempFile("mdzip-media-range", ".bin").toFile()
        try {
            mediaFile.writeBytes(mediaBytes)
            listOf("audio/ogg", "video/webm").forEach { mimeType ->
                val response = ArchiveAssetResponsePlan.create(
                    mediaFile,
                    mimeType,
                    "bytes=37-91"
                )

                assertEquals(mimeType, response.contentType)
                assertEquals(206, response.statusCode)
                assertEquals("bytes 37-91/256", response.responseHeaders["Content-Range"])
                assertEquals("55", response.responseHeaders["Content-Length"])
                assertArrayEquals(
                    mediaBytes.copyOfRange(37, 92),
                    response.openBody(mediaFile).use { it.readBytes() }
                )
            }
        } finally {
            mediaFile.delete()
        }
    }

    @Test
    fun byteRangesSupportSuffixRequestsAndRejectOutOfBoundsRequests() {
        val mediaFile = Files.createTempFile("mdzip-media-suffix", ".bin").toFile()
        try {
            mediaFile.writeBytes(byteArrayOf(10, 11, 12, 13, 14))

            val suffixResponse = ArchiveAssetResponsePlan.create(
                mediaFile,
                "audio/ogg",
                "bytes=-2"
            )
            assertEquals(206, suffixResponse.statusCode)
            assertEquals("bytes 3-4/5", suffixResponse.responseHeaders["Content-Range"])
            assertArrayEquals(
                byteArrayOf(13, 14),
                suffixResponse.openBody(mediaFile).use { it.readBytes() }
            )

            val invalidResponse = ArchiveAssetResponsePlan.create(
                mediaFile,
                "video/webm",
                "bytes=5-"
            )
            assertEquals(416, invalidResponse.statusCode)
            assertEquals("bytes */5", invalidResponse.responseHeaders["Content-Range"])
            assertEquals(0, invalidResponse.openBody(mediaFile).use { it.readBytes().size })
        } finally {
            mediaFile.delete()
        }
    }

    @Test
    fun fullMediaResponsesExposeTheEntireFileWithoutAContentRange() {
        val mediaFile = Files.createTempFile("mdzip-media-full", ".bin").toFile()
        try {
            val bytes = byteArrayOf(0, 1, 2, 3)
            mediaFile.writeBytes(bytes)
            val response = ArchiveAssetResponsePlan.create(mediaFile, "audio/ogg", null)

            assertEquals(200, response.statusCode)
            assertEquals("4", response.responseHeaders["Content-Length"])
            assertNull(response.responseHeaders["Content-Range"])
            assertArrayEquals(bytes, response.openBody(mediaFile).use { it.readBytes() })
        } finally {
            mediaFile.delete()
        }
    }
}
