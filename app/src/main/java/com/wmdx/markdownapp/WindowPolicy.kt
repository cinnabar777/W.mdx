package com.wmdx.markdownapp

import java.security.MessageDigest
import java.net.URI
import java.net.URLDecoder
import java.util.Locale

object WindowPolicy {
    fun matches(launcherRequest: Boolean, requestedUri: String?, launcherTask: Boolean,
                currentUri: String?, taskId: Int, excludedTask: Int,
                openTabUris: Set<String> = emptySet()): Boolean {
        if (taskId == excludedTask) return false
        return if (launcherRequest) launcherTask
        else !requestedUri.isNullOrEmpty() &&
            (sameDocumentUri(requestedUri, currentUri) ||
                openTabUris.any { sameDocumentUri(requestedUri, it) })
    }

    /**
     * Android's DocumentsUI can expose the same SAF document as either
     * content://authority/document/id or
     * content://authority/tree/tree-id/document/id. Match those views by
     * provider and document ID, while leaving non-SAF URIs exact.
     */
    fun uriIdentity(uriString: String?): String? {
        if (uriString.isNullOrBlank()) return null
        val colon = uriString.indexOf(':')
        val scheme = uriString.takeIf { colon > 0 }?.substring(0, colon)
        val normalized = if (scheme != null && URI_SCHEME.matches(scheme)) {
            scheme.lowercase(Locale.ROOT) + uriString.substring(colon)
        } else {
            uriString
        }
        val parsed = runCatching { URI(normalized) }.getOrNull() ?: return normalized
        if (!parsed.scheme.equals("content", ignoreCase = true)) return normalized
        val authority = parsed.rawAuthority?.lowercase(Locale.ROOT) ?: return normalized
        val pathSegments = parsed.rawPath.orEmpty().split('/').filter { it.isNotEmpty() }
        val documentIndex = pathSegments.indexOfLast { it == "document" }
        if (documentIndex < 0) return normalized
        val encodedDocumentId = pathSegments.getOrNull(documentIndex + 1) ?: return normalized
        val documentId = runCatching {
            URLDecoder.decode(encodedDocumentId.replace("+", "%2B"), "UTF-8")
        }.getOrNull() ?: return normalized
        return "saf-document:$authority:$documentId"
    }

    fun sameDocumentUri(left: String?, right: String?): Boolean {
        val leftIdentity = uriIdentity(left) ?: return false
        return leftIdentity == uriIdentity(right)
    }

    fun resolveDocumentUri(
        restoringActivity: Boolean,
        hasRegisteredState: Boolean,
        registeredUri: String?,
        incomingUri: String?
    ): String? =
        if (restoringActivity && hasRegisteredState) registeredUri else incomingUri

    fun fingerprintUri(uriStr: String?): String {
        if (uriStr.isNullOrEmpty()) return "none"
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(uriStr.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }.take(8)
    }

    private val URI_SCHEME = Regex("[A-Za-z][A-Za-z0-9+.-]*")
}
