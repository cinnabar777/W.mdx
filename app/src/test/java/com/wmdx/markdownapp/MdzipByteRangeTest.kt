package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
}
