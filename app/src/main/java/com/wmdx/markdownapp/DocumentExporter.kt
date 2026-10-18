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

        val (processedBodyHtml, tocHtml) = processHeadingsAndToc(editorData, includeToc, tocLevels)

        val formattedBodyHtml = formatHtmlPayload(processedBodyHtml)

        val cssContent = if (includeCss) buildExportCss(context) else ""

        val styleTag = when {
            !includeCss -> ""
            cssPlacement == "file" -> "    <link rel=\"stylesheet\" href=\"styles.css\">"
            else -> "    <style>\n${cssContent.prependIndent("        ")}\n    </style>"
        }

        val htmlContent = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeXml(documentTitle)}</title>
$styleTag
</head>
<body>
${if (includeToc && tocHtml.isNotEmpty()) tocHtml.prependIndent("    ") + "\n" else ""}${formattedBodyHtml.prependIndent("    ")}
</body>
</html>
""".trim()

        val separateCss = if (includeCss && cssPlacement == "file") cssContent else null
        return Pair(htmlContent, separateCss)
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

    private fun processHeadingsAndToc(html: String, includeToc: Boolean, maxLevel: Int): Pair<String, String> {
        val headingRegex = Regex("""<h([1-6])([^>]*)>(.*?)</h\1>""", RegexOption.IGNORE_CASE)
        var headingIndex = 0
        val tocItems = mutableListOf<Pair<Int, String>>()
        val tocAnchors = mutableListOf<String>()

        val processedHtml = headingRegex.replace(html) { match ->
            headingIndex++
            val level = match.groupValues[1].toIntOrNull() ?: 1
            val attrs = match.groupValues[2]
            val innerHtml = match.groupValues[3]
            val anchorId = "heading-$headingIndex"
            val plainTitle = innerHtml.replace(Regex("""<[^>]*>"""), "").trim()

            if (level <= maxLevel) {
                tocItems.add(Pair(level, plainTitle))
                tocAnchors.add(anchorId)
            }

            val newAttrs = if (attrs.contains("id=", ignoreCase = true)) {
                attrs
            } else {
                """ id="$anchorId"$attrs"""
            }

            "<h$level$newAttrs>$innerHtml</h$level>"
        }

        if (!includeToc || tocItems.isEmpty()) {
            return Pair(processedHtml, "")
        }

        val sb = StringBuilder()
        sb.append("<nav class=\"toc-container\">\n")
        sb.append("  <h2 class=\"toc-title\">Table of Contents</h2>\n")
        sb.append("  <ul class=\"toc-list\">\n")

        for (i in tocItems.indices) {
            val (level, title) = tocItems[i]
            val anchorId = tocAnchors[i]
            val indentPx = (level - 1) * 16
            sb.append("""    <li class="toc-item level-$level" style="margin-left: ${indentPx}px;"><a href="#$anchorId" class="toc-link">$title</a></li>""").append("\n")
        }

        sb.append("  </ul>\n</nav>")
        return Pair(processedHtml, sb.toString())
    }

    private fun formatHtmlPayload(html: String): String {
        val sb = StringBuilder()
        var indentLevel = 0
        fun indent() = "  ".repeat(indentLevel)

        val tokenRegex = Regex("""(<[^>]+>|[^<]+)""")
        val matches = tokenRegex.findAll(html).map { it.value.trim() }.filter { it.isNotEmpty() }.toList()

        val blockTags = setOf("p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "table", "thead", "tbody", "tr", "th", "td", "div", "nav", "section", "hr", "header", "footer")

        for (token in matches) {
            if (token.startsWith("<")) {
                val isClosing = token.startsWith("</")
                val isSelfClosing = token.endsWith("/>") || token.equals("<hr>", ignoreCase = true) || token.equals("<br>", ignoreCase = true)
                val tagName = token.replace(Regex("""[</>]"""), "").split(" ").firstOrNull()?.lowercase() ?: ""

                if (isClosing) {
                    if (blockTags.contains(tagName) && indentLevel > 0) {
                        indentLevel--
                        sb.append("\n").append(indent())
                    }
                    sb.append(token)
                } else {
                    if (blockTags.contains(tagName)) {
                        sb.append("\n").append(indent())
                    }
                    sb.append(token)
                    if (!isSelfClosing && blockTags.contains(tagName)) {
                        indentLevel++
                    }
                }
            } else {
                sb.append(token)
            }
        }

        return sb.toString().trim()
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

    private fun escapeXml(string: String): String {
        return string.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&apos;")
    }
}
