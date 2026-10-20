package com.wmdx.markdownapp

import android.content.Context
import android.os.Build
import android.os.SystemClock
import org.json.JSONObject

/** Bounded metadata only: no full document text, filenames, paths, or URI strings. */
object AppDiagnostics {
    fun show(context: Context) {
        val text = report(context)
        android.app.AlertDialog.Builder(context).setTitle("Diagnostic report")
            .setMessage(text)
            .setPositiveButton("Copy") { _, _ ->
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager)
                    .setPrimaryClip(android.content.ClipData.newPlainText("Diagnostic report", text))
            }
            .setNeutralButton("Share") { _, _ ->
                val share = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(android.content.Intent.EXTRA_TEXT, text)
                }
                context.startActivity(android.content.Intent.createChooser(share, "Share diagnostic report"))
            }
            .setNegativeButton("Close", null).show()
    }
    @Synchronized fun record(context: Context, event: String, detail: String = "") {
        val prefs = context.getSharedPreferences("diagnostic_report", Context.MODE_PRIVATE)
        val lines = (prefs.getString("events", "") ?: "").lineSequence().filter { it.isNotEmpty() }.toList()
        val task = (context as? android.app.Activity)?.taskId ?: -1
        val entry = "${SystemClock.elapsedRealtime()} task=$task $event ${detail.take(80)}"
        prefs.edit().putString("events", (lines.takeLast(99) + entry).joinToString("\n")).apply()
    }

    @Synchronized fun recordNavigationTrace(context: Context, jsonRecord: String) {
        if (jsonRecord.isBlank() || jsonRecord.length > 8192) return
        try {
            val json = JSONObject(jsonRecord)
            val kind = json.optString("kind", "")
            if (kind != "arrow" && kind != "arrow_press" &&
                kind != "tap" && kind != "scroll" && kind != "selection") return

            val prefs = context.getSharedPreferences("diagnostic_report", Context.MODE_PRIVATE)
            val existing = (prefs.getString("nav_traces", "") ?: "")
                .lineSequence()
                .filter { it.isNotBlank() }
                .mapNotNull { line ->
                    try {
                        JSONObject(line) to line
                    } catch (_: Exception) {
                        null
                    }
                }
                .toList()
            val entries = existing + (json to jsonRecord)

            val keep = BooleanArray(entries.size)
            var keptInput = 0
            var keptScroll = 0
            for (index in entries.indices.reversed()) {
                val isScroll = entries[index].first.optString("kind") == "scroll"
                if (isScroll && keptScroll < 8) {
                    keep[index] = true
                    keptScroll++
                } else if (!isScroll && keptInput < 16) {
                    keep[index] = true
                    keptInput++
                }
            }

            val retained = entries
                .filterIndexed { index, _ -> keep[index] }
                .joinToString("\n") { it.second }
            prefs.edit().putString("nav_traces", retained).apply()
        } catch (_: Exception) {
            // Ignore malformed trace payloads.
        }
    }

    fun report(context: Context): String {
        val webview = if (Build.VERSION.SDK_INT >= 26) android.webkit.WebView.getCurrentWebViewPackage()?.versionName else "unknown"
        val prefs = context.getSharedPreferences("diagnostic_report", Context.MODE_PRIVATE)
        val events = prefs.getString("events", "") ?: ""
        val navTraces = prefs.getString("nav_traces", "") ?: ""

        val navSection = if (navTraces.isNotBlank()) {
            "\n\nNavigation trace (up to 24; latest 16 non-scroll + latest 8 scroll):\n$navTraces"
        } else ""

        return "Wmdx Android diagnostics (routing-v4)\nAndroid SDK: ${Build.VERSION.SDK_INT}\nWebView: $webview\n" +
            "Times are milliseconds since boot. Includes selection line previews (up to 160 chars) and scroll/caret geometry. No full file content or paths recorded.\n\n" +
            events + navSection
    }
}
