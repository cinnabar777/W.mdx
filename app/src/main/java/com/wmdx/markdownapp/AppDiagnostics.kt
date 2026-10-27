package com.wmdx.markdownapp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.PixelCopy
import android.view.KeyEvent
import android.webkit.WebView
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Device-local, bounded capture of app interaction and WebView layout diagnostics. */
object AppDiagnostics {
    private const val PREFS = "diagnostic_report"
    private const val TRACE_NAME = "navigation_trace_v5.ndjson"
    private const val MAX_TRACE_BYTES = 32L * 1024L * 1024L
    private const val KEEP_TRACE_BYTES = 24L * 1024L * 1024L
    private const val MAX_BATCH_CHARS = 256 * 1024
    private const val MAX_BATCH_RECORDS = 100
    private const val MAX_SNAPSHOTS = 12
    private val lock = Any()
    private var lastSnapshotRequestMs = 0L

    private fun traceFile(context: Context) = File(context.filesDir, TRACE_NAME)
    private fun snapshotDirectory(context: Context) = File(context.filesDir, "navigation_snapshots")

    fun startNavigationCapture(context: Context) {
        if (!BuildConfig.DEBUG) return
        synchronized(lock) {
            val trace = traceFile(context)
            trace.parentFile?.mkdirs()
            trace.writeText("")
            snapshotDirectory(context).deleteRecursively()
            snapshotDirectory(context).mkdirs()
            lastSnapshotRequestMs = 0L
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean("capture_active", true)
                .putBoolean("capture_opt_in", true)
                .putString("capture_session", "${System.currentTimeMillis()}-${SystemClock.elapsedRealtime()}")
                .apply()
            appendRecordLocked(context, JSONObject()
                .put("kind", "native_capture_started")
                .put("elapsedMs", SystemClock.elapsedRealtime())
                .put("androidSdk", Build.VERSION.SDK_INT))
        }
    }

    fun stopNavigationCapture(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean("capture_active", false)
            .putBoolean("capture_opt_in", false)
            .apply()
    }

    fun isNavigationCaptureActive(context: Context): Boolean {
        if (!BuildConfig.DEBUG) return false
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).let { prefs ->
            prefs.getBoolean("capture_active", false) &&
                prefs.getBoolean("capture_opt_in", false)
        }
    }

    @Synchronized fun record(context: Context, event: String, detail: String = "") {
        if (!BuildConfig.DEBUG) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lines = (prefs.getString("events", "") ?: "").lineSequence().filter { it.isNotEmpty() }.toList()
        val task = (context as? Activity)?.taskId ?: -1
        val elapsed = SystemClock.elapsedRealtime()
        val entry = "$elapsed task=$task $event ${detail.take(160)}"
        prefs.edit().putString("events", (lines.takeLast(199) + entry).joinToString("\n")).apply()
        if (isNavigationCaptureActive(context)) {
            appendRecord(context, JSONObject()
                .put("kind", "native_lifecycle")
                .put("elapsedMs", elapsed)
                .put("taskId", task)
                .put("event", event)
                .put("detail", detail.take(300)))
        }
    }

    fun recordNavigationTrace(context: Context, jsonRecord: String) {
        if (!isNavigationCaptureActive(context)) return
        if (jsonRecord.isBlank() || jsonRecord.length > 16 * 1024) return
        try {
            val record = JSONObject(jsonRecord)
            appendRecord(context, record)
        } catch (_: Exception) {
            appendRecord(context, JSONObject()
                .put("kind", "trace_parse_error")
                .put("elapsedMs", SystemClock.elapsedRealtime())
                .put("payloadLength", jsonRecord.length))
        }
    }

    fun recordNavigationTraceBatch(context: Context, jsonBatch: String) {
        if (!isNavigationCaptureActive(context)) return
        if (jsonBatch.isBlank() || jsonBatch.length > MAX_BATCH_CHARS) {
            appendRecord(context, JSONObject()
                .put("kind", "trace_batch_rejected")
                .put("elapsedMs", SystemClock.elapsedRealtime())
                .put("payloadLength", jsonBatch.length))
            return
        }
        try {
            val records = JSONArray(jsonBatch)
            val bounded = JSONArray()
            for (index in 0 until minOf(records.length(), MAX_BATCH_RECORDS)) {
                val value = records.optJSONObject(index) ?: continue
                value.put("nativeElapsedMs", SystemClock.elapsedRealtime())
                bounded.put(value)
            }
            appendRecords(context, bounded)
            if (records.length() > MAX_BATCH_RECORDS) {
                appendRecord(context, JSONObject()
                    .put("kind", "trace_batch_record_limit")
                    .put("elapsedMs", SystemClock.elapsedRealtime())
                    .put("received", records.length())
                    .put("stored", bounded.length()))
            }
        } catch (_: Exception) {
            appendRecord(context, JSONObject()
                .put("kind", "trace_batch_parse_error")
                .put("elapsedMs", SystemClock.elapsedRealtime())
                .put("payloadLength", jsonBatch.length))
        }
    }

    fun recordNativeKeyEvent(context: Context, event: KeyEvent, dispatchHandled: Boolean) {
        if (!isNavigationCaptureActive(context)) return
        appendRecord(context, JSONObject()
            .put("kind", "native_key_dispatch")
            .put("elapsedMs", SystemClock.elapsedRealtime())
            .put("eventTimeMs", event.eventTime)
            .put("downTimeMs", event.downTime)
            .put("action", if (event.action == KeyEvent.ACTION_DOWN) "down" else "up")
            .put("keyCode", event.keyCode)
            .put("keyName", KeyEvent.keyCodeToString(event.keyCode))
            .put("repeatCount", event.repeatCount)
            .put("metaState", event.metaState)
            .put("source", event.source)
            .put("deviceId", event.deviceId)
            .put("flags", event.flags)
            .put("dispatchHandled", dispatchHandled))
    }

    fun captureWindowSnapshot(activity: Activity, webView: WebView, reason: String) {
        if (!isNavigationCaptureActive(activity)) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val now = SystemClock.elapsedRealtime()
        synchronized(lock) {
            if (now - lastSnapshotRequestMs < 300L) return
            lastSnapshotRequestMs = now
        }
        activity.runOnUiThread {
            val decor = activity.window.decorView
            val width = decor.width
            val height = decor.height
            val webViewRect = android.graphics.Rect()
            val webViewVisible = webView.getGlobalVisibleRect(webViewRect)
            if (width <= 0 || height <= 0) {
                appendRecord(activity, JSONObject()
                    .put("kind", "window_snapshot_unavailable")
                    .put("elapsedMs", SystemClock.elapsedRealtime())
                    .put("reason", reason.take(100))
                    .put("width", width)
                    .put("height", height))
                return@runOnUiThread
            }

            val bitmap = try {
                Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            } catch (_: Exception) {
                return@runOnUiThread
            }
            try {
                PixelCopy.request(activity.window, bitmap, { result ->
                    try {
                        if (result == PixelCopy.SUCCESS) {
                            val directory = snapshotDirectory(activity)
                            directory.mkdirs()
                            val safeReason = reason.replace(Regex("[^A-Za-z0-9_-]"), "_").take(48)
                            val file = File(directory, "${SystemClock.elapsedRealtime()}-$safeReason.jpg")
                            FileOutputStream(file).use { output ->
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 78, output)
                            }
                            trimSnapshots(directory)
                            val pixels = samplePixels(bitmap)
                            appendRecord(activity, JSONObject()
                                .put("kind", "window_snapshot_saved")
                                .put("elapsedMs", SystemClock.elapsedRealtime())
                                .put("reason", reason.take(100))
                                .put("file", file.name)
                                .put("width", width)
                                .put("height", height)
                                .put("webViewWidth", webView.width)
                                .put("webViewHeight", webView.height)
                                .put("webViewContentHeight", webView.contentHeight)
                                .put("webViewScrollY", webView.scrollY)
                                .put("webViewVisible", webView.isShown && webViewVisible)
                                .put("webViewRect", JSONObject()
                                    .put("left", webViewRect.left)
                                    .put("top", webViewRect.top)
                                    .put("right", webViewRect.right)
                                    .put("bottom", webViewRect.bottom))
                                .put("imeInsetBottom", decor.rootWindowInsets?.systemWindowInsetBottom ?: 0)
                                .put("nearBlackRatio", pixels.first)
                                .put("averageLuma", pixels.second))
                        } else {
                            appendRecord(activity, JSONObject()
                                .put("kind", "window_snapshot_failed")
                                .put("elapsedMs", SystemClock.elapsedRealtime())
                                .put("reason", reason.take(100))
                                .put("pixelCopyResult", result)
                                .put("width", width)
                                .put("height", height)
                                .put("webViewWidth", webView.width)
                                .put("webViewHeight", webView.height)
                                .put("webViewContentHeight", webView.contentHeight)
                                .put("webViewScrollY", webView.scrollY)
                                .put("webViewVisible", webView.isShown && webViewVisible))
                        }
                    } catch (_: Exception) {
                        appendRecord(activity, JSONObject()
                            .put("kind", "window_snapshot_error")
                            .put("elapsedMs", SystemClock.elapsedRealtime())
                            .put("reason", reason.take(100)))
                    } finally {
                        bitmap.recycle()
                    }
                }, Handler(Looper.getMainLooper()))
            } catch (_: Exception) {
                bitmap.recycle()
                appendRecord(activity, JSONObject()
                    .put("kind", "window_snapshot_request_error")
                    .put("elapsedMs", SystemClock.elapsedRealtime())
                    .put("reason", reason.take(100)))
            }
        }
    }

    fun report(context: Context): String {
        if (!BuildConfig.DEBUG) return "Diagnostics are available in debug builds only."
        val webview = if (Build.VERSION.SDK_INT >= 26) {
            android.webkit.WebView.getCurrentWebViewPackage()?.versionName
        } else "unknown"
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val trace = traceFile(context)
        var recordCount = 0
        var keyCount = 0
        var pointerCount = 0
        var scrollCount = 0
        var selectionCount = 0
        trace.takeIf { it.exists() }?.forEachLine { line ->
            recordCount++
            try {
                when (JSONObject(line).optString("kind")) {
                    "key_down", "key_up", "key_result" -> keyCount++
                    "pointerdown", "pointermove", "pointerup", "pointercancel",
                    "touchstart", "touchmove", "touchend", "touchcancel" -> pointerCount++
                    "scroll", "scroll_idle", "wheel" -> scrollCount++
                    "selectionchange" -> selectionCount++
                }
            } catch (_: Exception) {
                // Keep counting the raw line even if a single record is malformed.
            }
        }
        val snapshots = snapshotDirectory(context).listFiles()?.filter { it.extension == "jpg" }.orEmpty()
        val session = prefs.getString("capture_session", "unknown") ?: "unknown"
        val captureState = if (isNavigationCaptureActive(context)) "active" else "stopped"
        return "Wmdx Android diagnostics (routing-v5)\n" +
            "Android SDK: ${Build.VERSION.SDK_INT}\nWebView: $webview\nSession: $session\n" +
            "Detailed editor capture: $captureState. Start capture, return to the editor, reproduce the issue, then stop and share it.\n" +
            "Full event records: $recordCount (keys/results=$keyCount, pointer/touch=$pointerCount, scroll/wheel=$scrollCount, selections=$selectionCount)\n" +
            "App-window snapshots: ${snapshots.size}\n" +
            "The full local capture contains timestamped input events, caret/selection and rendered-row geometry, scroll/viewport state, DOM changes, lifecycle/errors, and app-window snapshots. It is not uploaded automatically.\n" +
            "Share the capture archive after the test. Native lifecycle summary:\n" +
            (prefs.getString("events", "") ?: "")
    }

    fun show(context: Context) {
        if (!BuildConfig.DEBUG) return
        val summary = report(context)
        val captureActive = isNavigationCaptureActive(context)
        android.app.AlertDialog.Builder(context)
            .setTitle("Diagnostic capture")
            .setMessage(summary)
            .setPositiveButton("Share full capture") { _, _ -> shareCapture(context, summary) }
            .setNeutralButton("Copy summary") { _, _ ->
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager)
                    .setPrimaryClip(android.content.ClipData.newPlainText("Diagnostic summary", summary))
            }
            .setNegativeButton(if (captureActive) "Stop capture" else "Start capture") { _, _ ->
                if (captureActive) stopNavigationCapture(context)
                else startNavigationCapture(context)
            }
            .show()
    }

    private fun shareCapture(context: Context, summary: String) {
        if (!BuildConfig.DEBUG) return
        val exports = File(context.cacheDir, "diagnostic_exports").apply { mkdirs() }
        val archive = File(exports, "wmdx-diagnostics-${SystemClock.elapsedRealtime()}.zip")
        Thread {
            try {
                ZipOutputStream(BufferedOutputStream(FileOutputStream(archive))).use { zip ->
                    val trace = traceFile(context)
                    if (trace.exists()) addFile(zip, trace, "navigation_trace.ndjson")
                    val lifecycle = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getString("events", "").orEmpty()
                    zip.putNextEntry(ZipEntry("native_lifecycle.txt"))
                    zip.write(lifecycle.toByteArray(Charsets.UTF_8))
                    zip.closeEntry()
                    snapshotDirectory(context).listFiles()?.filter { it.extension == "jpg" }?.sortedBy { it.name }?.forEach { file ->
                        addFile(zip, file, "snapshots/${file.name}")
                    }
                    zip.putNextEntry(ZipEntry("report.txt"))
                    zip.write(summary.toByteArray(Charsets.UTF_8))
                    zip.closeEntry()
                }
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.diagnostics.provider",
                    archive
                )
                val share = Intent(Intent.ACTION_SEND).apply {
                    type = "application/zip"
                    putExtra(Intent.EXTRA_SUBJECT, "Wmdx Android diagnostics")
                    putExtra(Intent.EXTRA_TEXT, "Wmdx diagnostics capture. The archive contains the complete local event trace and app-window snapshots.")
                    putExtra(Intent.EXTRA_STREAM, uri)
                    clipData = android.content.ClipData.newUri(context.contentResolver, "Wmdx diagnostics", uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                (context as? Activity)?.runOnUiThread {
                    context.startActivity(Intent.createChooser(share, "Share diagnostic capture"))
                } ?: run {
                    share.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(Intent.createChooser(share, "Share diagnostic capture"))
                }
            } catch (error: Exception) {
                (context as? Activity)?.runOnUiThread {
                    android.app.AlertDialog.Builder(context)
                        .setTitle("Could not export diagnostics")
                        .setMessage(error.message ?: "The diagnostic archive could not be created.")
                        .setPositiveButton("OK", null)
                        .show()
                }
            }
        }
        .apply { isDaemon = true }
        .start()
    }

    private fun addFile(zip: ZipOutputStream, file: File, entryName: String) {
        zip.putNextEntry(ZipEntry(entryName))
        FileInputStream(file).use { input ->
            val buffer = ByteArray(16 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count <= 0) break
                zip.write(buffer, 0, count)
            }
        }
        zip.closeEntry()
    }

    private fun appendRecords(context: Context, records: JSONArray) {
        synchronized(lock) {
            val file = traceFile(context)
            file.parentFile?.mkdirs()
            FileOutputStream(file, true).bufferedWriter(Charsets.UTF_8).use { writer ->
                for (index in 0 until records.length()) {
                    writer.append(records.getJSONObject(index).toString())
                    writer.newLine()
                }
            }
            trimTraceIfNeeded(file)
        }
    }

    private fun appendRecord(context: Context, record: JSONObject) {
        synchronized(lock) { appendRecordLocked(context, record) }
    }

    private fun appendRecordLocked(context: Context, record: JSONObject) {
        val file = traceFile(context)
        file.parentFile?.mkdirs()
        FileOutputStream(file, true).bufferedWriter(Charsets.UTF_8).use { writer ->
            writer.append(record.toString())
            writer.newLine()
        }
        trimTraceIfNeeded(file)
    }

    private fun trimTraceIfNeeded(file: File) {
        if (file.length() <= MAX_TRACE_BYTES) return
        val originalLength = file.length()
        val temp = File(file.parentFile, "${file.name}.trim")
        RandomAccessFile(file, "r").use { input ->
            input.seek((originalLength - KEEP_TRACE_BYTES).coerceAtLeast(0L))
            while (input.filePointer < originalLength && input.read() != '\n'.code) {
                // Advance to the next complete JSONL record.
            }
            FileOutputStream(temp).use { output ->
                val buffer = ByteArray(32 * 1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count <= 0) break
                    output.write(buffer, 0, count)
                }
            }
        }
        if (temp.renameTo(file)) {
            FileOutputStream(file, true).bufferedWriter(Charsets.UTF_8).use { writer ->
                writer.append(JSONObject()
                    .put("kind", "trace_truncated_oldest_records")
                    .put("elapsedMs", SystemClock.elapsedRealtime())
                    .put("originalBytes", originalLength)
                    .put("retainedBytes", file.length())
                    .toString())
                writer.newLine()
            }
        } else {
            temp.delete()
        }
    }

    private fun trimSnapshots(directory: File) {
        val files = directory.listFiles()?.filter { it.extension == "jpg" }?.sortedBy { it.name }.orEmpty()
        files.take((files.size - MAX_SNAPSHOTS).coerceAtLeast(0)).forEach { it.delete() }
    }

    private fun samplePixels(bitmap: Bitmap): Pair<Double, Double> {
        val strideX = (bitmap.width / 80).coerceAtLeast(1)
        val strideY = (bitmap.height / 80).coerceAtLeast(1)
        var count = 0
        var black = 0
        var lumaTotal = 0.0
        var y = 0
        while (y < bitmap.height) {
            var x = 0
            while (x < bitmap.width) {
                val color = bitmap.getPixel(x, y)
                val red = android.graphics.Color.red(color)
                val green = android.graphics.Color.green(color)
                val blue = android.graphics.Color.blue(color)
                val luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
                if (luma < 16.0) black++
                lumaTotal += luma
                count++
                x += strideX
            }
            y += strideY
        }
        if (count == 0) return 0.0 to 0.0
        return (black.toDouble() / count) to (lumaTotal / count)
    }
}
