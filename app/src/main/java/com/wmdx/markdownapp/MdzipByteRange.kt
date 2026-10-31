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

internal data class MdzipByteRangeStreamStats(
    val expectedBytes: Long,
    val readBytes: Long,
    val skippedBytes: Long,
    val sourceEndedEarly: Boolean
) {
    val complete: Boolean
        get() = readBytes + skippedBytes == expectedBytes
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
        extension.equals("m4a", ignoreCase = true) ||
        extension.equals("wav", ignoreCase = true) ||
        extension.equals("aac", ignoreCase = true) ||
        extension.equals("flac", ignoreCase = true) ||
        extension.equals("opus", ignoreCase = true) ||
        extension.equals("ogg", ignoreCase = true) ||
        extension.equals("oga", ignoreCase = true)

internal fun shouldServeMdzipAssetAsWholeFile(
    isVideoAsset: Boolean,
    extension: String,
    rangeHeader: String?
): Boolean =
    if (isVideoAsset) {
        rangeHeader == null
    } else {
        shouldServeMdzipAudioAsWholeFile(extension, rangeHeader)
    }

internal fun openMdzipByteRangeStream(
    file: File,
    start: Long,
    length: Long,
    onClose: (MdzipByteRangeStreamStats) -> Unit = {}
): InputStream {
    require(start >= 0 && length >= 0)
    val stream = FileInputStream(file)
    stream.channel.position(start)
    return object : FilterInputStream(stream) {
        private var remaining = length
        private var readBytes = 0L
        private var skippedBytes = 0L
        private var sourceEndedEarly = false
        private var closed = false

        override fun available(): Int =
            minOf(super.available().toLong(), remaining, Int.MAX_VALUE.toLong()).toInt()

        override fun skip(count: Long): Long {
            if (count <= 0 || remaining <= 0) return 0
            val skipped = super.skip(minOf(count, remaining))
            if (skipped > 0) {
                remaining -= skipped
                skippedBytes += skipped
            }
            return skipped
        }

        override fun read(): Int {
            if (remaining <= 0) return -1
            val value = super.read()
            if (value >= 0) {
                remaining -= 1
                readBytes += 1
            } else {
                sourceEndedEarly = true
            }
            return value
        }

        override fun read(buffer: ByteArray, offset: Int, requestedLength: Int): Int {
            if (requestedLength == 0) return 0
            if (remaining <= 0) return -1
            val boundedLength = minOf(requestedLength.toLong(), remaining).toInt()
            val count = super.read(buffer, offset, boundedLength)
            if (count > 0) {
                remaining -= count
                readBytes += count
            } else if (count < 0) {
                sourceEndedEarly = true
            }
            return count
        }

        override fun close() {
            if (closed) return
            closed = true
            try {
                super.close()
            } finally {
                runCatching {
                    onClose(
                        MdzipByteRangeStreamStats(
                            expectedBytes = length,
                            readBytes = readBytes,
                            skippedBytes = skippedBytes,
                            sourceEndedEarly = sourceEndedEarly
                        )
                    )
                }
            }
        }
    }
}

internal fun openMdzipVideoByteRangeStream(
    file: File,
    start: Long,
    length: Long,
    onClose: (MdzipByteRangeStreamStats) -> Unit = {}
): InputStream {
    val fileLength = file.length()
    require(start >= 0 && length > 0)
    require(start <= fileLength && length <= fileLength - start)

    // The intercepted-media reader applies the Range start with InputStream.skip().
    // Start at byte zero so the requested offset is applied exactly once.
    return openMdzipByteRangeStream(file, 0, start + length, onClose)
}
