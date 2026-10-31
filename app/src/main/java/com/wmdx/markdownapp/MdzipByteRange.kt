package com.wmdx.markdownapp

import java.io.File
import java.io.FileInputStream
import java.io.FilterInputStream
import java.io.InputStream

internal data class MdzipByteRange(
    val start: Long,
    val endInclusive: Long
) {
    val length: Long
        get() = endInclusive - start + 1
}

internal fun parseMdzipByteRange(header: String, fileLength: Long): MdzipByteRange? {
    if (fileLength <= 0) return null
    val match = Regex("^bytes=(\\d*)-(\\d*)$", RegexOption.IGNORE_CASE)
        .matchEntire(header.trim()) ?: return null
    val rawStart = match.groupValues[1]
    val rawEnd = match.groupValues[2]
    if (rawStart.isEmpty() && rawEnd.isEmpty()) return null

    val start: Long
    val end: Long
    if (rawStart.isEmpty()) {
        val suffixLength = rawEnd.toLongOrNull()?.takeIf { it > 0 } ?: return null
        start = (fileLength - suffixLength).coerceAtLeast(0)
        end = fileLength - 1
    } else {
        start = rawStart.toLongOrNull() ?: return null
        end = if (rawEnd.isEmpty()) {
            fileLength - 1
        } else {
            (rawEnd.toLongOrNull() ?: return null).coerceAtMost(fileLength - 1)
        }
    }

    if (start >= fileLength || end < start) return null
    return MdzipByteRange(start, end)
}

internal fun shouldServeMdzipAudioAsWholeFile(
    extension: String,
    rangeHeader: String?
): Boolean =
    rangeHeader == null ||
        extension.equals("m4a", ignoreCase = true)

internal fun openMdzipByteRangeStream(
    file: File,
    start: Long,
    length: Long
): InputStream {
    require(start >= 0 && length >= 0)
    val stream = FileInputStream(file)
    stream.channel.position(start)
    return object : FilterInputStream(stream) {
        private var remaining = length

        override fun available(): Int =
            minOf(super.available().toLong(), remaining, Int.MAX_VALUE.toLong()).toInt()

        override fun skip(count: Long): Long {
            if (count <= 0 || remaining <= 0) return 0
            val skipped = super.skip(minOf(count, remaining))
            if (skipped > 0) remaining -= skipped
            return skipped
        }

        override fun read(): Int {
            if (remaining <= 0) return -1
            val value = super.read()
            if (value >= 0) remaining -= 1
            return value
        }

        override fun read(buffer: ByteArray, offset: Int, requestedLength: Int): Int {
            if (requestedLength == 0) return 0
            if (remaining <= 0) return -1
            val boundedLength = minOf(requestedLength.toLong(), remaining).toInt()
            val count = super.read(buffer, offset, boundedLength)
            if (count > 0) remaining -= count
            return count
        }
    }
}
