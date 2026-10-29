package com.wmdx.markdownapp

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import org.json.JSONArray
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap

/** Current document identity is independent of a task's original intent (Save As). */
object WindowRegistry {
    private fun prefs(context: Context) = context.getSharedPreferences("document_windows", Context.MODE_PRIVATE)
    private val liveActivities = ConcurrentHashMap<Int, WeakReference<MainActivity>>()

    fun current(context: Context, taskId: Int): Uri? =
        prefs(context).getString("uri_$taskId", null)?.takeIf { it.isNotEmpty() }?.let(Uri::parse)
    fun hasState(context: Context, taskId: Int) = prefs(context).contains("uri_$taskId")

    fun registerActivity(activity: MainActivity) {
        liveActivities[activity.taskId] = WeakReference(activity)
    }

    fun unregisterActivity(activity: MainActivity) {
        liveActivities.computeIfPresent(activity.taskId) { _, reference ->
            if (reference.get() === activity) null else reference
        }
    }

    fun register(activity: Activity, uri: Uri?) {
        (activity as? MainActivity)?.let(::registerActivity)
        prefs(activity).edit().apply {
            putString("uri_${activity.taskId}", uri?.normalizeScheme()?.toString() ?: "")
        }.apply()
    }

    fun registerOpenTabUris(activity: Activity, urisJson: String) {
        val input = runCatching { JSONArray(urisJson) }.getOrNull() ?: return
        val normalizedUris = JSONArray()
        for (index in 0 until input.length()) {
            val uriString = input.optString(index).takeIf { it.isNotBlank() } ?: continue
            val normalized = runCatching {
                Uri.parse(uriString).normalizeScheme().toString()
            }.getOrNull() ?: continue
            normalizedUris.put(normalized)
        }
        val identityHashes = (0 until minOf(normalizedUris.length(), 16))
            .map { index ->
                WindowPolicy.fingerprintUri(
                    WindowPolicy.uriIdentity(normalizedUris.optString(index))
                )
            }
            .joinToString(",")
        val omittedCount = (normalizedUris.length() - 16).coerceAtLeast(0)
        prefs(activity).edit()
            .putString("tabs_${activity.taskId}", normalizedUris.toString())
            .apply()
        AppDiagnostics.record(
            activity,
            "window_tabs_registered",
            "task=${activity.taskId} count=${normalizedUris.length()} identities=$identityHashes${if (omittedCount > 0) ",more=$omittedCount" else ""}"
        )
    }

    private fun openTabUris(context: Context, taskId: Int): Set<String> {
        val encoded = prefs(context).getString("tabs_$taskId", "[]") ?: "[]"
        val array = runCatching { JSONArray(encoded) }.getOrNull() ?: return emptySet()
        val uris = mutableSetOf<String>()
        for (index in 0 until array.length()) {
            array.optString(index).takeIf { it.isNotBlank() }?.let(uris::add)
        }
        return uris
    }

    private fun physicalFileIdentity(context: Context, uriString: String?): String? {
        if (uriString.isNullOrBlank()) return null
        val uri = runCatching { Uri.parse(uriString) }.getOrNull() ?: return null
        val descriptor = when {
            uri.scheme.equals("content", ignoreCase = true) ->
                runCatching { context.contentResolver.openFileDescriptor(uri, "r") }.getOrNull()
            uri.scheme.equals("file", ignoreCase = true) -> runCatching {
                ParcelFileDescriptor.open(
                    File(uri.path ?: return null),
                    ParcelFileDescriptor.MODE_READ_ONLY
                )
            }.getOrNull()
            else -> return null
        } ?: return null

        return runCatching {
            descriptor.use { parcelFile ->
                val stat = Os.fstat(parcelFile.fileDescriptor)
                val fileType = stat.st_mode and OsConstants.S_IFMT
                if (fileType != OsConstants.S_IFREG) null
                else "${stat.st_dev}:${stat.st_ino}"
            }
        }.getOrNull()
    }

    fun consumePendingFocusUri(activity: Activity, taskId: Int): Uri? {
        val key = "pending_focus_$taskId"
        val uriString = prefs(activity).getString(key, null) ?: return null
        prefs(activity).edit().remove(key).apply()
        return runCatching { Uri.parse(uriString).normalizeScheme() }.getOrNull()
    }

    fun unregister(activity: Activity) {
        (activity as? MainActivity)?.let(::unregisterActivity)
        prefs(activity).edit()
            .remove("uri_${activity.taskId}")
            .remove("tabs_${activity.taskId}")
            .remove("pending_focus_${activity.taskId}")
            .apply()
    }

    fun focus(context: Context, uri: Uri? = null, launcher: Boolean = false, excludeTask: Int = -1): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val normalizedUri = uri?.normalizeScheme()?.toString()
        var matchedTaskId: Int? = null
        var matchedBy = "none"
        var matchedFocusUri: String? = null
        val physicalIdentities = mutableMapOf<String, String?>()
        fun physicalIdentity(uriString: String?): String? {
            if (uriString.isNullOrBlank()) return null
            if (!physicalIdentities.containsKey(uriString)) {
                physicalIdentities[uriString] = physicalFileIdentity(context, uriString)
            }
            return physicalIdentities[uriString]
        }
        fun sameDocument(left: String?, right: String?): Boolean {
            if (WindowPolicy.sameDocumentUri(left, right)) return true
            val leftIdentity = physicalIdentity(left) ?: return false
            return leftIdentity == physicalIdentity(right)
        }

        val task = manager.appTasks.firstOrNull {
            val info = it.taskInfo
            @Suppress("DEPRECATION")
            val taskId = info.id
            val currentUri = current(context, taskId)?.normalizeScheme()?.toString()
            val tabUris = openTabUris(context, taskId)
            val excluded = taskId == excludeTask
            val matchingTabUri = if (excluded) null else normalizedUri?.let { requested ->
                tabUris.firstOrNull { tabUri -> sameDocument(requested, tabUri) }
            }
            val currentMatches = !excluded && sameDocument(normalizedUri, currentUri)
            val matchedByUri = WindowPolicy.matches(
                launcherRequest = launcher,
                requestedUri = normalizedUri,
                launcherTask = info.baseIntent.getBooleanExtra("launcher_window", false),
                currentUri = currentUri,
                taskId = taskId,
                excludedTask = excludeTask,
                openTabUris = tabUris
            )
            val matched = matchedByUri ||
                (!launcher && !excluded && normalizedUri != null &&
                    (currentMatches || matchingTabUri != null))
            if (matched) {
                matchedTaskId = taskId
                matchedFocusUri = matchingTabUri ?: currentUri
                matchedBy = when {
                    launcher -> "launcher"
                    matchingTabUri != null && normalizedUri == matchingTabUri -> "tab"
                    matchingTabUri != null &&
                        WindowPolicy.sameDocumentUri(normalizedUri, matchingTabUri) -> "tab_document_identity"
                    matchingTabUri != null -> "tab_file_identity"
                    currentMatches && normalizedUri == currentUri -> "current"
                    currentMatches && WindowPolicy.sameDocumentUri(normalizedUri, currentUri) ->
                        "current_document_identity"
                    currentMatches -> "current_file_identity"
                    else -> "other"
                }
            }
            matched
        }
        val physicalCandidateHashes = physicalIdentities.values
            .filterNotNull()
            .distinct()
            .take(12)
            .joinToString(",") { WindowPolicy.fingerprintUri(it) }
        val requestedPhysicalIdentity = normalizedUri?.let { physicalIdentities[it] }
        AppDiagnostics.record(context, "window_route_lookup",
            "requested=${WindowPolicy.fingerprintUri(normalizedUri)} identity=${WindowPolicy.fingerprintUri(WindowPolicy.uriIdentity(normalizedUri))} fileIdentity=${WindowPolicy.fingerprintUri(requestedPhysicalIdentity)} candidates=$physicalCandidateHashes count=${manager.appTasks.size} match=${matchedTaskId ?: "none"} via=$matchedBy")
        if (task == null) return false
        val taskId = matchedTaskId
        val targetUri = matchedFocusUri
        if (targetUri != null && taskId != null) {
            prefs(context).edit()
                .putString("pending_focus_$taskId", targetUri)
                .apply()
        }
        task.moveToFront()
        if (targetUri != null && taskId != null) {
            val activity = liveActivities[taskId]?.get()
            if (activity != null) {
                activity.requestExistingDocumentFocus(targetUri)
                prefs(context).edit().remove("pending_focus_$taskId").apply()
            }
        }
        AppDiagnostics.record(context, "focus_existing_window")
        return true
    }
}
