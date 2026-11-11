package com.wmdx.markdownapp

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.URI
import java.nio.charset.Charset
import java.nio.charset.StandardCharsets
import java.util.Base64

internal data class MhtmlArchive(
    val html: String,
    val baseLocation: String?,
    /** URL / Content-ID aliases mapped to self-contained data URLs. */
    val embeddedResources: Map<String, String>
)

/**
 * Extracts the HTML root and related parts from a multipart/related MHTML file.
 * The returned HTML is still passed through the app's semantic HTML importer;
 * this class does not execute archive content.
 */
internal object MhtmlArchiveImporter {
    const val MAX_ARCHIVE_BYTES = 16L * 1024L * 1024L

    private data class MimePart(
        val headers: Map<String, String>,
        val body: ByteArray
    )

    fun isMhtmlFileName(fileName: String): Boolean =
        fileName.endsWith(".mht", ignoreCase = true) ||
            fileName.endsWith(".mhtml", ignoreCase = true)

    fun parse(input: InputStream, maxBytes: Long = MAX_ARCHIVE_BYTES): MhtmlArchive {
        val bytes = readBounded(input, maxBytes)
        val raw = String(bytes, StandardCharsets.ISO_8859_1)
        val (topHeaderText, topBody) = splitHeadersAndBody(raw)
        val topHeaders = parseHeaders(topHeaderText)
        val topContentType = topHeaders["content-type"].orEmpty()
        val boundary = parameter(topContentType, "boundary")

        if (boundary.isNullOrBlank()) {
            if (mediaType(topContentType) == "text/html") {
                return MhtmlArchive(
                    html = decodeText(
                        topBody.toByteArray(StandardCharsets.ISO_8859_1),
                        topContentType
                    ),
                    baseLocation = topHeaders["content-location"],
                    embeddedResources = emptyMap()
                )
            }
            throw IllegalArgumentException("The MHTML archive has no multipart boundary.")
        }

        val parts = splitParts(topBody, boundary)
            .mapNotNull(::parsePart)
        val startContentId = parameter(topContentType, "start")
            ?.trim()
            ?.removePrefix("<")
            ?.removeSuffix(">")
        val htmlPart = if (startContentId.isNullOrBlank()) {
            parts.firstOrNull {
                mediaType(it.headers["content-type"].orEmpty()) == "text/html"
            }
        } else {
            parts.firstOrNull {
                mediaType(it.headers["content-type"].orEmpty()) == "text/html" &&
                    it.headers["content-id"]
                        ?.trim()
                        ?.removePrefix("<")
                        ?.removeSuffix(">")
                        ?.equals(startContentId, ignoreCase = true) == true
            }
        } ?: throw IllegalArgumentException(
            if (startContentId.isNullOrBlank()) {
                "The MHTML archive contains no HTML document part."
            } else {
                "The MHTML archive's root HTML part could not be found."
            }
        )
        val htmlLocation = htmlPart.headers["content-location"]
            ?: topHeaders["snapshot-content-location"]
            ?: topHeaders["content-location"]
        val baseLocation = htmlPart.headers["content-base"]
            ?: topHeaders["content-base"]
            ?: htmlLocation
        val html = decodeText(
            htmlPart.body,
            htmlPart.headers["content-type"].orEmpty()
        )
        val resources = linkedMapOf<String, String>()

        for (part in parts) {
            if (part === htmlPart) continue
            val location = part.headers["content-location"]
            val contentId = part.headers["content-id"]
                ?.trim()
                ?.removePrefix("<")
                ?.removeSuffix(">")
            if (location.isNullOrBlank() && contentId.isNullOrBlank()) continue

            val contentType = mediaType(
                part.headers["content-type"].orEmpty()
            ).ifBlank { "application/octet-stream" }
            val dataUrl = "data:$contentType;base64," +
                Base64.getEncoder().encodeToString(part.body)
            if (!location.isNullOrBlank()) {
                addLocationAliases(resources, location, baseLocation, dataUrl)
            }
            if (!contentId.isNullOrBlank()) {
                resources.putIfAbsent("cid:$contentId", dataUrl)
                resources.putIfAbsent(contentId, dataUrl)
            }
        }

        return MhtmlArchive(
            html = html,
            baseLocation = baseLocation,
            embeddedResources = resources
        )
    }

    private fun readBounded(input: InputStream, maxBytes: Long): ByteArray {
        require(maxBytes > 0) { "The MHTML size limit must be positive." }
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0L
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > maxBytes) {
                throw IllegalArgumentException(
                    "The MHTML archive exceeds the ${maxBytes / (1024 * 1024)} MB import limit."
                )
            }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }

    private fun splitHeadersAndBody(source: String): Pair<String, String> {
        val crlf = source.indexOf("\r\n\r\n")
        if (crlf >= 0) return source.substring(0, crlf) to source.substring(crlf + 4)
        val lf = source.indexOf("\n\n")
        if (lf >= 0) return source.substring(0, lf) to source.substring(lf + 2)
        throw IllegalArgumentException("The MHTML archive has malformed MIME headers.")
    }

    private fun splitParts(body: String, boundary: String): List<String> {
        val delimiter = Regex(
            pattern = """(?m)^--${Regex.escape(boundary)}(--)?[ \t]*\r?$"""
        )
        val matches = delimiter.findAll(body).toList()
        if (matches.isEmpty()) {
            throw IllegalArgumentException("The MHTML archive boundary was not found.")
        }
        return matches.mapIndexedNotNull { index, match ->
            if (match.groupValues[1] == "--") return@mapIndexedNotNull null
            val start = skipLineBreak(body, match.range.last + 1)
            val end = matches.getOrNull(index + 1)?.range?.first ?: body.length
            if (start >= end) null else body.substring(start, end).trimEnd('\r', '\n')
        }
    }

    private fun skipLineBreak(value: String, start: Int): Int = when {
        value.startsWith("\r\n", start) -> start + 2
        value.startsWith("\n", start) -> start + 1
        else -> start
    }

    private fun parsePart(rawPart: String): MimePart? {
        val (headerText, bodyText) = splitHeadersAndBody(rawPart)
        val headers = parseHeaders(headerText)
        val encodedBody = bodyText.toByteArray(StandardCharsets.ISO_8859_1)
        val decodedBody = when (headers["content-transfer-encoding"]
            ?.trim()
            ?.lowercase()) {
            "base64" -> decodeBase64(encodedBody)
            "quoted-printable" -> decodeQuotedPrintable(encodedBody)
            else -> encodedBody
        }
        return MimePart(headers = headers, body = decodedBody)
    }

    private fun parseHeaders(source: String): Map<String, String> {
        val unfolded = mutableListOf<String>()
        for (line in source.split(Regex("\r?\n"))) {
            if (line.startsWith(" ") || line.startsWith("\t")) {
                if (unfolded.isNotEmpty()) {
                    unfolded[unfolded.lastIndex] =
                        unfolded.last() + " " + line.trim()
                }
            } else {
                unfolded.add(line)
            }
        }

        val headers = linkedMapOf<String, String>()
        for (line in unfolded) {
            val colon = line.indexOf(':')
            if (colon <= 0) continue
            val name = line.substring(0, colon).trim().lowercase()
            val value = line.substring(colon + 1).trim()
            headers.putIfAbsent(name, value)
        }
        return headers
    }

    private fun parameter(contentType: String, name: String): String? {
        val expression = Regex(
            """(?:^|;)\s*${Regex.escape(name)}\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]+))""",
            RegexOption.IGNORE_CASE
        )
        val match = expression.find(contentType) ?: return null
        return (match.groupValues[1].ifBlank { match.groupValues[2] })
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    }

    private fun mediaType(contentType: String): String =
        contentType.substringBefore(';').trim().lowercase()

    private fun decodeText(bytes: ByteArray, contentType: String): String {
        val charsetName = parameter(contentType, "charset")
        val charset = runCatching {
            charsetName?.let(Charset::forName)
        }.getOrNull() ?: StandardCharsets.UTF_8
        return String(bytes, charset)
    }

    private fun decodeBase64(bytes: ByteArray): ByteArray =
        try {
            Base64.getMimeDecoder().decode(bytes)
        } catch (error: IllegalArgumentException) {
            throw IllegalArgumentException("The MHTML archive contains invalid Base64 data.", error)
        }

    private fun decodeQuotedPrintable(bytes: ByteArray): ByteArray {
        val output = ByteArrayOutputStream(bytes.size)
        var index = 0
        while (index < bytes.size) {
            if (bytes[index] != '='.code.toByte() || index + 1 >= bytes.size) {
                output.write(bytes[index].toInt() and 0xff)
                index++
                continue
            }
            if (bytes[index + 1] == '\n'.code.toByte()) {
                index += 2
                continue
            }
            if (index + 2 < bytes.size &&
                bytes[index + 1] == '\r'.code.toByte() &&
                bytes[index + 2] == '\n'.code.toByte()) {
                index += 3
                continue
            }
            if (index + 2 < bytes.size) {
                val high = bytes[index + 1].toInt().toChar().digitToIntOrNull(16)
                val low = bytes[index + 2].toInt().toChar().digitToIntOrNull(16)
                if (high != null && low != null) {
                    output.write((high shl 4) or low)
                    index += 3
                    continue
                }
            }
            output.write(bytes[index].toInt() and 0xff)
            index++
        }
        return output.toByteArray()
    }

    private fun addLocationAliases(
        resources: MutableMap<String, String>,
        location: String,
        baseLocation: String?,
        dataUrl: String
    ) {
        resources.putIfAbsent(location, dataUrl)
        if (baseLocation.isNullOrBlank()) return
        val resolved = runCatching {
            URI(baseLocation).resolve(location).toString()
        }.getOrNull()
        if (!resolved.isNullOrBlank()) resources.putIfAbsent(resolved, dataUrl)
    }
}
