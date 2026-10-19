package com.wmdx.markdownapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** One routing point. The editor never launches another editor while loading a file. */
class DocumentDispatchActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val launcher = intent.action == Intent.ACTION_MAIN && intent.hasCategory(Intent.CATEGORY_LAUNCHER)
            val uri: Uri? = if (intent.action == Intent.ACTION_SEND) {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                    ?: intent.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
            } else intent.data ?: intent.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
            AppDiagnostics.record(this, if (launcher) "launcher_request" else "external_file_request")
            if ((launcher && WindowRegistry.focus(this, launcher = true)) ||
                (uri != null && WindowRegistry.focus(this, uri))) return
            val target = Intent(this, MainActivity::class.java).apply {
                action = if (launcher) Intent.ACTION_MAIN else Intent.ACTION_VIEW
                putExtra("launcher_window", launcher)
                if (uri != null) setDataAndType(uri, intent.type ?: "text/plain")
                if (intent.action == Intent.ACTION_SEND && uri == null) {
                    putExtra("shared_text", intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: "")
                }
                clipData = intent.clipData
                addFlags(intent.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION))
                // Identity is checked above using the CURRENT URI, not Android's stale
                // base intent. A new task is intentional only when no match exists.
                addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT or Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
            }
            startActivity(target)
        } catch (error: Exception) {
            AppDiagnostics.record(this, "dispatch_error", error.javaClass.simpleName)
            ThemedToast.show(this, "Could not open this file", android.widget.Toast.LENGTH_LONG)
        } finally {
            finish()
        }
    }
}
