package com.wmdx.markdownapp

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.net.Uri

/** Current document identity is independent of a task's original intent (Save As). */
object WindowRegistry {
    private fun prefs(context: Context) = context.getSharedPreferences("document_windows", Context.MODE_PRIVATE)
    fun current(context: Context, taskId: Int): Uri? =
        prefs(context).getString("uri_$taskId", null)?.takeIf { it.isNotEmpty() }?.let(Uri::parse)
    fun hasState(context: Context, taskId: Int) = prefs(context).contains("uri_$taskId")

    fun register(activity: Activity, uri: Uri?) {
        prefs(activity).edit().apply {
            putString("uri_${activity.taskId}", uri?.normalizeScheme()?.toString() ?: "")
        }.apply()
    }

    fun unregister(activity: Activity) {
        prefs(activity).edit().remove("uri_${activity.taskId}").apply()
    }

    fun focus(context: Context, uri: Uri? = null, launcher: Boolean = false, excludeTask: Int = -1): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        var matchedTaskId: Int? = null
        val task = manager.appTasks.firstOrNull {
            val info = it.taskInfo
            @Suppress("DEPRECATION")
            val taskId = info.id
            val matched = WindowPolicy.matches(launcher, uri?.normalizeScheme()?.toString(),
                info.baseIntent.getBooleanExtra("launcher_window", false),
                current(context, taskId)?.normalizeScheme()?.toString(), taskId, excludeTask)
            if (matched) matchedTaskId = taskId
            matched
        }
        AppDiagnostics.record(context, "window_route_lookup",
            "requested=${WindowPolicy.fingerprintUri(uri?.normalizeScheme()?.toString())} count=${manager.appTasks.size} match=${matchedTaskId ?: "none"}")
        if (task == null) return false
        task.moveToFront()
        AppDiagnostics.record(context, "focus_existing_window")
        return true
    }
}
