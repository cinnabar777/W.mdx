package com.wmdx.markdownapp

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
    fun servesM4aAsAWholeFileAndRetainsMp3RangeSupport() {
        assertTrue(shouldServeMdzipAudioAsWholeFile("m4a", "bytes=1703936-"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("M4A", "bytes=-19007"))
        assertTrue(shouldServeMdzipAudioAsWholeFile("m4a", null))
        assertTrue(shouldServeMdzipAudioAsWholeFile("mp3", null))
        assertFalse(shouldServeMdzipAudioAsWholeFile("mp3", "bytes=100-200"))
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
            openMdzipByteRangeStream(file, 3, 4).use { stream ->
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
        } finally {
            file.delete()
        }
    }
}
