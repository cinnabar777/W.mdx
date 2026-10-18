package com.wmdx.markdownapp

object WindowPolicy {
    fun matches(launcherRequest: Boolean, requestedUri: String?, launcherTask: Boolean,
                currentUri: String?, taskId: Int, excludedTask: Int): Boolean {
        if (taskId == excludedTask) return false
        return if (launcherRequest) launcherTask
        else !requestedUri.isNullOrEmpty() && requestedUri == currentUri
    }
}
