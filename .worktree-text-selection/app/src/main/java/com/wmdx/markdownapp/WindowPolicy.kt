package com.wmdx.markdownapp

import java.security.MessageDigest

object WindowPolicy {
    fun matches(launcherRequest: Boolean, requestedUri: String?, launcherTask: Boolean,
                currentUri: String?, taskId: Int, excludedTask: Int): Boolean {
        if (taskId == excludedTask) return false
        return if (launcherRequest) launcherTask
        else !requestedUri.isNullOrEmpty() && requestedUri == currentUri
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
}
