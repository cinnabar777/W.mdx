package com.wmdx.markdownapp

import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FilterInputStream
import java.io.InputStream

internal class ArchiveAssetResponsePlan private constructor(
    val contentType: String,
    val statusCode: Int,
    val reasonPhrase: String,
    val responseHeaders: Map<String, String>,
    private val rangeStart: Long? = null,
    private val responseLength: Long
) {
    fun openBody(file: File): InputStream {
        if (statusCode == 416) return ByteArrayInputStream(ByteArray(0))

        val stream = FileInputStream(file)
        val start = rangeStart
        if (start == null) return stream
        stream.channel.position(start)
        return object : FilterInputStream(stream) {
            private var remaining = responseLength

            override fun read(): Int {
                if (remaining <= 0L) return -1
                val value = super.read()
                if (value >= 0) remaining--
                return value
            }

            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                if (remaining <= 0L) return -1
                val count = super.read(buffer, offset, minOf(length.toLong(), remaining).toInt())
                if (count > 0) remaining -= count
                return count
            }
        }
    }

    companion object {
        private val rangePattern = Regex("bytes=(\\d*)-(\\d*)")

        fun create(file: File, contentType: String, rangeHeader: String?): ArchiveAssetResponsePlan {
            val fileLength = file.length()
            val match = rangeHeader?.let(rangePattern::matchEntire)
            if (match == null || fileLength <= 0L) {
                return ArchiveAssetResponsePlan(
                    contentType = contentType,
                    statusCode = 200,
                    reasonPhrase = "OK",
                    responseHeaders = mapOf(
                        "Accept-Ranges" to "bytes",
                        "Content-Length" to fileLength.toString()
                    ),
                    responseLength = fileLength
                )
            }

            val requestedStart = match.groupValues[1].toLongOrNull()
            val requestedEnd = match.groupValues[2].toLongOrNull()
            if (requestedStart == null && requestedEnd == null) {
                return notSatisfiable(fileLength)
            }

            val start = if (requestedStart == null) {
                (fileLength - requestedEnd!!).coerceAtLeast(0L)
            } else {
                requestedStart
            }
            val end = if (requestedStart == null || requestedEnd == null) {
                fileLength - 1L
            } else {
                requestedEnd
            }.coerceAtMost(fileLength - 1L)
            if (start >= fileLength || end < start) return notSatisfiable(fileLength)

            val length = end - start + 1L
            return ArchiveAssetResponsePlan(
                contentType = contentType,
                statusCode = 206,
                reasonPhrase = "Partial Content",
                responseHeaders = mapOf(
                    "Accept-Ranges" to "bytes",
                    "Content-Length" to length.toString(),
                    "Content-Range" to "bytes $start-$end/$fileLength"
                ),
                rangeStart = start,
                responseLength = length
            )
        }

        private fun notSatisfiable(fileLength: Long) = ArchiveAssetResponsePlan(
            contentType = "application/octet-stream",
            statusCode = 416,
            reasonPhrase = "Range Not Satisfiable",
            responseHeaders = mapOf(
                "Accept-Ranges" to "bytes",
                "Content-Range" to "bytes */$fileLength",
                "Content-Length" to "0"
            ),
            responseLength = 0L
        )
    }
}
