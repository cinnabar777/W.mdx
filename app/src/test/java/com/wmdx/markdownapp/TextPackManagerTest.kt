package com.wmdx.markdownapp

import java.io.IOException
import java.text.Normalizer
import org.junit.Assert.assertEquals
import org.junit.Test

class TextPackManagerTest {
    @Test
    fun manifestEntryPointTakesPrecedenceOverIndex() {
        assertEquals(
            "docs/chapter-one.md",
            TextPackManager.resolveMdzipEntryPoint(
                setOf("index.md", "docs/chapter-one.md"),
                "docs/chapter-one.md"
            )
        )
    }

    @Test
    fun entryPointDiscoveryPrefersRootIndex() {
        assertEquals(
            "index.md",
            TextPackManager.resolveMdzipEntryPoint(
                setOf("index.md", "notes.md", "images/cover.png"),
                null
            )
        )
    }

    @Test
    fun entryPointDiscoveryUsesTheOnlyRootMarkdownFile() {
        assertEquals(
            "START.MD",
            TextPackManager.resolveMdzipEntryPoint(
                setOf("README.md", "START.MD", "docs/chapter.md"),
                null
            )
        )
    }

    @Test
    fun entryPointDiscoveryUsesTheOnlySupportMarkdownFileWhenNecessary() {
        assertEquals(
            "README.md",
            TextPackManager.resolveMdzipEntryPoint(setOf("README.md"), null)
        )
    }

    @Test
    fun declaredEntryPointAllowsOptionalDotPrefixAndNfcMatching() {
        val composedPath = Normalizer.normalize("café.md", Normalizer.Form.NFC)
        val decomposedPath = Normalizer.normalize("café.md", Normalizer.Form.NFD)
        assertEquals(
            composedPath,
            TextPackManager.resolveMdzipEntryPoint(setOf(composedPath), "./$decomposedPath")
        )
    }

    @Test(expected = IOException::class)
    fun ambiguousRootMarkdownFilesDoNotSelectArbitrarily() {
        TextPackManager.resolveMdzipEntryPoint(
            setOf("one.md", "two.markdown"),
            null
        )
    }

    @Test(expected = IOException::class)
    fun nestedMarkdownWithoutEntryPointIsNotSelectedArbitrarily() {
        TextPackManager.resolveMdzipEntryPoint(
            setOf("docs/one.md", "docs/two.md"),
            null
        )
    }

    @Test(expected = IOException::class)
    fun invalidManifestEntryPointIsRejected() {
        TextPackManager.resolveMdzipEntryPoint(
            setOf("index.md"),
            "../outside.md"
        )
    }
}
