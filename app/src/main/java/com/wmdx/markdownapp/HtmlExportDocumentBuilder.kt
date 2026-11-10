package com.wmdx.markdownapp

/**
 * Builds the standalone HTML document around the editor's rendered HTML.
 *
 * This stays free of Android dependencies so the export contract can be
 * exercised by local JVM tests.
 */
internal object HtmlExportDocumentBuilder {
    fun build(
        editorHtml: String,
        documentTitle: String,
        includeToc: Boolean,
        tocLevels: Int,
        includeCss: Boolean,
        cssPlacement: String,
        cssContent: String
    ): Pair<String, String?> {
        val (processedBodyHtml, tocHtml) =
            processHeadingsAndToc(editorHtml, includeToc, tocLevels)
        val styleTag = when {
            !includeCss -> ""
            cssPlacement == "file" -> """    <link rel="stylesheet" href="styles.css">"""
            else -> "    <style>\n${cssContent.prependIndent("        ")}\n    </style>"
        }
        val toc = if (includeToc && tocHtml.isNotEmpty()) {
            tocHtml.prependIndent("    ") + "\n"
        } else {
            ""
        }

        // Do not pretty-print or trim editorHtml. Whitespace around inline
        // elements is document content, not formatting; changing it can turn
        // "alpha <strong>beta</strong> gamma" into "alphabeta gamma".
        val html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${escapeHtml(documentTitle)}</title>
            $styleTag
            </head>
            <body>
            $toc$processedBodyHtml
            </body>
            </html>
        """.trimIndent()

        val separateCss = if (includeCss && cssPlacement == "file") cssContent else null
        return Pair(html, separateCss)
    }

    private fun processHeadingsAndToc(
        html: String,
        includeToc: Boolean,
        maxLevel: Int
    ): Pair<String, String> {
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
            val plainTitle = decodeHtmlEntities(
                innerHtml.replace(Regex("""<[^>]*>"""), "").trim()
            )

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

        if (!includeToc || tocItems.isEmpty()) return Pair(processedHtml, "")

        val tocHtml = buildString {
            append("<nav class=\"toc-container\">\n")
            append("  <h2 class=\"toc-title\">Table of Contents</h2>\n")
            append("  <ul class=\"toc-list\">\n")
            for (index in tocItems.indices) {
                val (level, title) = tocItems[index]
                val anchorId = tocAnchors[index]
                val indentPx = (level - 1) * 16
                append(
                    """    <li class="toc-item level-$level" style="margin-left: ${indentPx}px;"><a href="#$anchorId" class="toc-link">${escapeHtml(title)}</a></li>"""
                ).append("\n")
            }
            append("  </ul>\n</nav>")
        }
        return Pair(processedHtml, tocHtml)
    }

    private fun decodeHtmlEntities(value: String): String =
        Regex("&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|#39|nbsp);")
            .replace(value) { match ->
                when (val entity = match.groupValues[1]) {
                    "amp" -> "&"
                    "lt" -> "<"
                    "gt" -> ">"
                    "quot" -> "\""
                    "apos", "#39" -> "'"
                    "nbsp" -> "\u00a0"
                    else -> {
                        val codePoint = if (entity.startsWith("#x", ignoreCase = true)) {
                            entity.drop(2).toIntOrNull(16)
                        } else {
                            entity.drop(1).toIntOrNull()
                        }
                        codePoint?.let { String(Character.toChars(it)) } ?: match.value
                    }
                }
            }

    private fun escapeHtml(value: String): String =
        value.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;")
}
