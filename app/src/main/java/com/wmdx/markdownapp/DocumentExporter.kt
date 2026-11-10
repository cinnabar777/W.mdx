package com.wmdx.markdownapp

import android.content.Context
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.preference.PreferenceManager
import java.io.File

object DocumentExporter {

    fun generateCleanHtml(context: Context, editorData: String, documentTitle: String): Pair<String, String?> {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val includeToc = prefs.getBoolean("pref_export_include_toc", true)
        val tocLevels = prefs.getInt("pref_export_toc_levels", 3)
        val includeCss = prefs.getBoolean("pref_export_include_css", true)
        val cssPlacement = prefs.getString("pref_export_css_placement", "head") ?: "head"

        val cssContent = if (includeCss) buildExportCss(context) else ""
        return HtmlExportDocumentBuilder.build(
            editorHtml = editorData,
            documentTitle = documentTitle,
            includeToc = includeToc,
            tocLevels = tocLevels,
            includeCss = includeCss,
            cssPlacement = cssPlacement,
            cssContent = cssContent
        )
    }

    fun exportToMht(
        context: Context,
        htmlContent: String,
        targetUri: Uri,
        onComplete: (Boolean, String?) -> Unit
    ) {
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        handler.post {
            try {
                val tempMhtFile = File(context.cacheDir, "temp_export_${System.currentTimeMillis()}.mht")
                val webView = WebView(context)
                webView.settings.apply {
                    javaScriptEnabled = false
                    domStorageEnabled = true
                    allowFileAccess = true
                }

                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        handler.postDelayed({
                            try {
                                view?.saveWebArchive(tempMhtFile.absolutePath, false, ValueCallback { savedPath ->
                                    webView.destroy()
                                    if (savedPath != null && tempMhtFile.exists()) {
                                        try {
                                            context.contentResolver.openOutputStream(targetUri, "rwt")?.use { out ->
                                                tempMhtFile.inputStream().use { input ->
                                                    input.copyTo(out)
                                                }
                                            }
                                            tempMhtFile.delete()
                                            onComplete(true, null)
                                        } catch (e: Exception) {
                                            onComplete(false, "Failed to write MHT to destination: ${e.localizedMessage}")
                                        }
                                    } else {
                                        onComplete(false, "WebView failed to generate MHT archive")
                                    }
                                })
                            } catch (e: Exception) {
                                webView.destroy()
                                onComplete(false, "MHT Save Error: ${e.localizedMessage}")
                            }
                        }, 200)
                    }
                }

                val baseUrl = "https://appassets.androidplatform.net/assets/www/"
                webView.loadDataWithBaseURL(baseUrl, htmlContent, "text/html", "UTF-8", null)
            } catch (e: Exception) {
                onComplete(false, "MHT Initialization Error: ${e.localizedMessage}")
            }
        }
    }

    private fun buildExportCss(context: Context): String {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val isLight = prefs.getString("pref_app_theme", "amoled") == "light"

        val bgColor = if (isLight) "#FFFFFF" else "#000000"
        val textColor = if (isLight) "#111111" else "#FFFFFF"
        val linkColor = prefs.getString("pref_link_color", if (isLight) "#0288D1" else "#29B6F6") ?: "#29B6F6"
        val codeColor = prefs.getString("pref_code_color", if (isLight) "#D81B60" else "#FF80AB") ?: "#FF80AB"
        val codeBgColor = prefs.getString("pref_code_bg_color", if (isLight) "#F1F3F4" else "#212121") ?: "#212121"
        val codeBlockColor = prefs.getString("pref_code_block_color", if (isLight) "#212121" else "#E0E0E0") ?: "#E0E0E0"
        val codeBlockBgColor = prefs.getString("pref_code_block_bg_color", if (isLight) "#F5F5F5" else "#121212") ?: "#121212"

        return """
            body {
                background-color: $bgColor;
                color: $textColor;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 16px;
                line-height: 1.6;
                padding: 24px;
                max-width: 860px;
                margin: 0 auto;
            }
            a { color: $linkColor; text-decoration: underline; }
            code { color: $codeColor; background-color: $codeBgColor; padding: 3px 6px; border-radius: 4px; font-family: monospace; }
            pre { color: $codeBlockColor; background-color: $codeBlockBgColor; padding: 16px; border-radius: 6px; overflow-x: auto; font-family: monospace; }
            blockquote { border-left: 4px solid #444444; margin-left: 0; padding-left: 16px; color: #888888; font-style: italic; }
            table { border-collapse: collapse; width: 100%; margin: 16px 0; }
            th, td { border: 1px solid #444444; padding: 8px 12px; text-align: left; }
            th { background-color: rgba(255, 255, 255, 0.1); font-weight: bold; }
            img { max-width: 100%; height: auto; border-radius: 4px; }
            .toc-container { background: rgba(255, 255, 255, 0.05); border: 1px solid #444444; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
            .toc-title { margin-top: 0; font-size: 18px; border-bottom: 1px solid #444444; padding-bottom: 8px; }
            .toc-list { list-style: none; padding-left: 0; margin: 0; }
            .toc-item { padding: 4px 0; }
            .toc-link { color: $linkColor; text-decoration: none; font-weight: 500; }
            .toc-link:hover { text-decoration: underline; }
        """.trimIndent()
    }

}
