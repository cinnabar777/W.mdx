package com.wmdx.markdownapp

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.net.Uri
import org.json.JSONArray
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
        prefs(activity).edit()
            .putString("tabs_${activity.taskId}", normalizedUris.toString())
            .apply()
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
        val task = manager.appTasks.firstOrNull {
            val info = it.taskInfo
            @Suppress("DEPRECATION")
            val taskId = info.id
            val matched = WindowPolicy.matches(
                launcherRequest = launcher,
                requestedUri = normalizedUri,
                launcherTask = info.baseIntent.getBooleanExtra("launcher_window", false),
                currentUri = current(context, taskId)?.normalizeScheme()?.toString(),
                taskId = taskId,
                excludedTask = excludeTask,
                openTabUris = openTabUris(context, taskId)
            )
            if (matched) matchedTaskId = taskId
            matched
        }
        AppDiagnostics.record(context, "window_route_lookup",
            "requested=${WindowPolicy.fingerprintUri(normalizedUri)} count=${manager.appTasks.size} match=${matchedTaskId ?: "none"}")
        if (task == null) return false
        val taskId = matchedTaskId
        if (normalizedUri != null && taskId != null) {
            prefs(context).edit()
                .putString("pending_focus_$taskId", normalizedUri)
                .apply()
        }
        task.moveToFront()
        if (normalizedUri != null && taskId != null) {
            val activity = liveActivities[taskId]?.get()
            if (activity != null) {
                activity.requestExistingDocumentFocus(normalizedUri)
                prefs(context).edit().remove("pending_focus_$taskId").apply()
            }
        }
        AppDiagnostics.record(context, "focus_existing_window")
        return true
    }
}
