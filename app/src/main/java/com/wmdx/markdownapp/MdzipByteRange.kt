package com.wmdx.markdownapp

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
