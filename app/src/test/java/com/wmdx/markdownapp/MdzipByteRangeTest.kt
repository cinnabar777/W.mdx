package com.wmdx.markdownapp

import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MdzipByteRangeTest {
    @Test
    fun parsesSuffixRangeAsBytesFromTheEndOfTheFile() {
        val range = parseMdzipByteRange("bytes=-19007", 1_745_574)

        assertEquals(MdzipByteRange(1_726_567, 1_745_573), range)
        assertEquals(19_007L, range?.length ?: -1L)
    }

    @Test
    fun clampsSuffixRangesLongerThanTheFileToTheWholeFile() {
        assertEquals(
            MdzipByteRange(0, 99),
            parseMdzipByteRange("bytes=-200", 100)
        )
    }

    @Test
    fun parsesOpenEndedAndBoundedRanges() {
        assertEquals(
            MdzipByteRange(50, 99),
            parseMdzipByteRange("bytes=50-", 100)
        )
        assertEquals(
            MdzipByteRange(10, 19),
            parseMdzipByteRange("bytes=10-19", 100)
        )
        assertEquals(
            MdzipByteRange(90, 99),
            parseMdzipByteRange("bytes=90-150", 100)
        )
    }

    @Test
    fun servesAacM4aWavFlacAndOggAudioAsWholeFilesAndRetainsMp3RangeSupport() {
        assertTrue(shouldServeMdzipAudioAsWholeFile("aac", "bytes=0-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("m4a", "bytes=1703936-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("wav", "bytes=0-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("M4A", "bytes=-19007"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("m4a", null))
        assertTrue(shouldServeMdzipAudioAsWholeFile("flac", "bytes=65536-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("FLAC", null))
        assertTrue(shouldServeMdzipAudioAsWholeFile("opus", "bytes=0-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("OPUS", null))
        assertTrue(shouldServeMdzipAudioAsWholeFile("ogg", "bytes=0-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("oga", "bytes=0-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("mp3", null))
        assertFalse(shouldServeMdzipAudioAsWholeFile("mp3", "bytes=100-200"))
    }

    @Test
    fun servesPackagedVideoWholeOnInitialRequestAndSupportsRequestedRanges() {
        assertTrue(shouldServeMdzipAssetAsWholeFile(true, "mp4", null))
        assertFalse(shouldServeMdzipAssetAsWholeFile(true, "mp4", "bytes=0-"))
        assertFalse(shouldServeMdzipAssetAsWholeFile(true, "mp4", "bytes=1048576-"))
        assertFalse(shouldServeMdzipAssetAsWholeFile(false, "mp3", "bytes=100-200"))
    }

    @Test
    fun rejectsInvalidOrUnsatisfiableRanges() {
        listOf(
            "bytes=-0",
            "bytes=-",
            "bytes=100-",
            "bytes=20-10",
            "bytes=0-1,3-4",
            "items=0-1"
        ).forEach { header ->
            assertNull(header, parseMdzipByteRange(header, 100))
        }
        assertNull(parseMdzipByteRange("bytes=0-1", 0))
    }

    @Test
    fun rangeStreamBoundsReadSkipAndAvailableToTheRequestedBytes() {
        val file = File.createTempFile("mdzip-range-", ".bin")
        try {
            file.writeBytes(ByteArray(10) { it.toByte() })
            var stats: MdzipByteRangeStreamStats? = null
            openMdzipByteRangeStream(file, 3, 4) { stats = it }.use { stream ->
                assertEquals(4, stream.available())
                assertEquals(2L, stream.skip(2))
                assertEquals(2, stream.available())
                assertEquals(5, stream.read())
                assertEquals(1, stream.available())
                assertEquals(1L, stream.skip(10))
                assertEquals(0, stream.available())
                assertEquals(-1, stream.read())
                assertEquals(0, stream.read(ByteArray(1), 0, 0))
            }
            assertEquals(
                MdzipByteRangeStreamStats(
                    expectedBytes = 4,
                    readBytes = 1,
                    skippedBytes = 3,
                    sourceEndedEarly = false
                ),
                stats
            )
            assertEquals(true, stats?.complete)
        } finally {
            file.delete()
        }
    }

    @Test
    fun rangeStreamReportsTheExactBytesReturnedToTheCaller() {
        val file = File.createTempFile("mdzip-range-", ".bin")
        try {
            val source = ByteArray(10) { it.toByte() }
            file.writeBytes(source)
            var stats: MdzipByteRangeStreamStats? = null
            val actual = ByteArrayOutputStream()
            openMdzipByteRangeStream(file, 3, 4) { stats = it }.use { stream ->
                val buffer = ByteArray(8)
                while (true) {
                    val count = stream.read(buffer)
                    if (count < 0) break
                    actual.write(buffer, 0, count)
                }
            }

            assertEquals(listOf<Byte>(3, 4, 5, 6), actual.toByteArray().toList())
            assertEquals(
                MdzipByteRangeStreamStats(
                    expectedBytes = 4,
                    readBytes = 4,
                    skippedBytes = 0,
                    sourceEndedEarly = false
                ),
                stats
            )
            assertEquals(true, stats?.complete)
        } finally {
            file.delete()
        }
    }

    @Test
    fun videoRangeStreamAppliesTheOffsetOnceAndStopsAtTheRangeEnd() {
        val file = File.createTempFile("mdzip-range-", ".bin")
        try {
            val source = ByteArray(10) { it.toByte() }
            file.writeBytes(source)
            var stats: MdzipByteRangeStreamStats? = null
            val actual = ByteArrayOutputStream()
            openMdzipVideoByteRangeStream(file, 3, 4) { stats = it }.use { stream ->
                assertEquals(3L, stream.skip(3))
                val buffer = ByteArray(8)
                val count = stream.read(buffer)
                assertEquals(4, count)
                actual.write(buffer, 0, count)
                assertEquals(-1, stream.read())
            }

            assertEquals(source.copyOfRange(3, 7).toList(), actual.toByteArray().toList())
            assertEquals(
                MdzipByteRangeStreamStats(
                    expectedBytes = 7,
                    readBytes = 4,
                    skippedBytes = 3,
                    sourceEndedEarly = false
                ),
                stats
            )
            assertEquals(true, stats?.complete)
        } finally {
            file.delete()
        }
    }

    @Test
    fun rangeStreamReportsAnIncompleteReadAndPrematureSourceEnd() {
        val file = File.createTempFile("mdzip-range-", ".bin")
        try {
            file.writeBytes(byteArrayOf(1, 2, 3))
            var stats: MdzipByteRangeStreamStats? = null
            openMdzipByteRangeStream(file, 0, 5) { stats = it }.use { stream ->
                assertEquals(1, stream.read())
                assertEquals(2, stream.read())
                assertEquals(3, stream.read())
                assertEquals(-1, stream.read())
            }

            assertEquals(
                MdzipByteRangeStreamStats(
                    expectedBytes = 5,
                    readBytes = 3,
                    skippedBytes = 0,
                    sourceEndedEarly = true
                ),
                stats
            )
            assertEquals(false, stats?.complete)
        } finally {
            file.delete()
        }
    }

    @Test
    fun rangeStreamDistinguishesAnEarlyCloseFromSourceEnd() {
        val file = File.createTempFile("mdzip-range-", ".bin")
        try {
            file.writeBytes(byteArrayOf(1, 2, 3, 4, 5))
            var stats: MdzipByteRangeStreamStats? = null
            openMdzipByteRangeStream(file, 0, 5) { stats = it }.use { stream ->
                assertEquals(1, stream.read())
                assertEquals(2, stream.read())
            }

            assertEquals(
                MdzipByteRangeStreamStats(
                    expectedBytes = 5,
                    readBytes = 2,
                    skippedBytes = 0,
                    sourceEndedEarly = false
                ),
                stats
            )
            assertEquals(false, stats?.complete)
        } finally {
            file.delete()
        }
    }
}
