package com.wmdx.markdownapp

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.io.OutputStreamWriter

internal data class MarkdownTextFileReadResult(
    val markdown: String,
    val hadBom: Boolean,
    val hadCrlf: Boolean
)

internal object MarkdownTextFileCodec {
    fun read(input: InputStream): MarkdownTextFileReadResult {
        val markdown = BufferedReader(
            InputStreamReader(input, Charsets.UTF_8)
        ).readText()
        return MarkdownTextFileReadResult(
            markdown = markdown,
            hadBom = markdown.startsWith("\uFEFF"),
            hadCrlf = markdown.contains("\r\n")
        )
    }

    fun prepareForSave(
        markdown: String,
        hadBom: Boolean,
        hadCrlf: Boolean
    ): String {
        var prepared = markdown
        if (hadCrlf && !prepared.contains("\r\n") && prepared.contains("\n")) {
            prepared = prepared.replace("\r\n", "\n").replace("\n", "\r\n")
        }
        if (hadBom && !prepared.startsWith("\uFEFF")) {
            prepared = "\uFEFF$prepared"
        }
        return prepared
    }

    fun write(output: OutputStream, markdown: String) {
        val writer = OutputStreamWriter(output, Charsets.UTF_8)
        writer.write(markdown)
        writer.flush()
    }
}
