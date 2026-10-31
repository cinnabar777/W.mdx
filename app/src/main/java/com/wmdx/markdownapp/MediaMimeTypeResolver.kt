package com.wmdx.markdownapp

internal object MediaMimeTypeResolver {
    fun validatedHint(mimeType: String?, expectedMediaType: String?): String? {
        val expected = expectedMediaType?.lowercase(java.util.Locale.ROOT)
            ?.takeIf { it == "audio" || it == "video" }
            ?: return null
        val normalized = mimeType
            ?.substringBefore(';')
            ?.trim()
            ?.lowercase(java.util.Locale.ROOT)
            ?: return null
        if (normalized == "application/octet-stream") return normalized
        if (!normalized.startsWith("$expected/")) return null
        return normalized.takeIf {
            Regex("^(audio|video)/[a-z0-9][a-z0-9.+_-]*$").matches(it)
        }
    }

    fun knownMimeType(extension: String, expectedMediaType: String?): String? =
        when (extension.lowercase(java.util.Locale.ROOT)) {
            "3gp" -> if (expectedMediaType == "audio") "audio/3gpp" else "video/3gpp"
            "aac" -> "audio/aac"
            "avi" -> "video/x-msvideo"
            "flac" -> "audio/flac"
            "m4a" -> "audio/mp4"
            "m4v" -> "video/mp4"
            "mkv" -> "video/x-matroska"
            "mov" -> "video/quicktime"
            "mp3" -> "audio/mpeg"
            "mp4" -> if (expectedMediaType == "audio") "audio/mp4" else "video/mp4"
            "oga", "ogg", "opus" -> "audio/ogg"
            "ogv" -> "video/ogg"
            "wav" -> "audio/wav"
            "webm" -> if (expectedMediaType == "audio") "audio/webm" else "video/webm"
            "wmv" -> "video/x-ms-wmv"
            else -> null
        }

    fun archiveAssetMimeType(
        extension: String,
        mimeHint: String?,
        expectedMediaType: String?
    ): String? =
        knownMimeType(extension, expectedMediaType)
            ?: validatedHint(mimeHint, expectedMediaType)

    fun mdzipImportMimeType(
        originalFileName: String?,
        providerMimeType: String?,
        expectedMediaType: String
    ): String? {
        val extension = originalFileName
            ?.substringAfterLast('.', "")
            ?.lowercase(java.util.Locale.ROOT)
            ?.takeIf { it.matches(Regex("[a-z0-9]{1,10}")) }
        return extension?.let { knownMimeType(it, expectedMediaType) }
            ?: validatedHint(providerMimeType, expectedMediaType)
    }
}
