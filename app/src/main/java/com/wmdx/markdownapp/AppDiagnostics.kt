package com.wmdx.markdownapp

import android.content.Context
import android.os.Build
import android.os.SystemClock

/** Bounded metadata only: no document text, filenames, paths, or URI strings. */
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

    fun report(context: Context): String {
        val webview = if (Build.VERSION.SDK_INT >= 26) android.webkit.WebView.getCurrentWebViewPackage()?.versionName else "unknown"
        return "Wmdx Android diagnostics (routing-v1)\nAndroid SDK: ${Build.VERSION.SDK_INT}\nWebView: $webview\n" +
            "Times are milliseconds since boot. No document content or file identifiers recorded.\n\n" +
            context.getSharedPreferences("diagnostic_report", Context.MODE_PRIVATE).getString("events", "")
    }
}
