package com.wmdx.markdownapp

import org.xml.sax.Attributes
import org.xml.sax.helpers.DefaultHandler
import java.io.File
import java.io.StringReader
import javax.xml.parsers.SAXParserFactory
import org.xml.sax.InputSource

internal data class DeviceFontOption(val label: String, val value: String)

internal object DeviceFontCatalog {
    private val builtInOptions = listOf(
        DeviceFontOption("Default / Inherit", "default"),
        DeviceFontOption("Sans-Serif", "sans-serif"),
        DeviceFontOption("Serif", "serif"),
        DeviceFontOption("Monospace", "monospace"),
        DeviceFontOption("Cursive", "cursive"),
        DeviceFontOption("System UI", "system-ui")
    )

    private val installedFamilyNames: List<String> by lazy {
        listOf(
            "/system/etc/fonts.xml",
            "/product/etc/fonts_customization.xml",
            "/system/etc/fonts_customization.xml",
            "/vendor/etc/fonts_customization.xml"
        ).flatMap { path ->
            runCatching {
                val file = File(path)
                if (file.isFile) parseFamilyNames(file.readText()) else emptyList()
            }.getOrDefault(emptyList())
        }.distinct()
    }

    fun options(): List<DeviceFontOption> {
        val known = builtInOptions.mapTo(mutableSetOf()) { it.value }
        return builtInOptions + installedFamilyNames
            .filter { it.isNotBlank() && known.add(it) }
            .map { DeviceFontOption(it, it) }
    }

    internal fun parseFamilyNames(xml: String): List<String> {
        val names = linkedSetOf<String>()
        val factory = SAXParserFactory.newInstance().apply {
            isNamespaceAware = false
            runCatching {
                setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            }
            runCatching {
                setFeature("http://xml.org/sax/features/external-general-entities", false)
            }
            runCatching {
                setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            }
        }
        factory.newSAXParser().parse(
            InputSource(StringReader(xml)),
            object : DefaultHandler() {
                override fun startElement(
                    uri: String?,
                    localName: String?,
                    qName: String?,
                    attributes: Attributes?
                ) {
                    val tag = localName?.takeIf { it.isNotEmpty() } ?: qName
                    if (tag != "family" && tag != "alias") return
                    val name = attributes?.getValue("name")?.trim()
                    if (!name.isNullOrEmpty()) names.add(name)
                }
            }
        )
        return names.toList()
    }
}
