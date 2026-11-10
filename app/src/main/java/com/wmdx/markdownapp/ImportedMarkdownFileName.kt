package com.wmdx.markdownapp

internal object ImportedMarkdownFileName {
    private val htmlExtension = Regex("""\.(?:html?|mht|mhtml)$""", RegexOption.IGNORE_CASE)

    fun fromHtmlSource(sourceFileName: String?): String {
        val name = sourceFileName
            .orEmpty()
            .substringAfterLast('/')
            .substringAfterLast('\\')
            .trim()
        val markdownBase = if (htmlExtension.containsMatchIn(name)) {
            name.replace(htmlExtension, "")
        } else {
            name.substringBeforeLast('.', name)
        }.trim().trim('.')

        return "${markdownBase.ifBlank { "Imported" }}.md"
    }
}
