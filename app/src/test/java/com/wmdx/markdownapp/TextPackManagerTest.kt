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

    @Test
    fun projectEntryPointUsesDeclaredPathOrFirstMarkdownFile() {
        assertEquals(
            "docs/start.markdown",
            TextPackManager.resolveMdzipProjectEntryPoint(
                setOf("docs/start.markdown", "guide/intro.md", "images/cover.png"),
                null
            )
        )
        assertEquals(
            "guide/intro.md",
            TextPackManager.resolveMdzipProjectEntryPoint(
                setOf("index.md", "guide/intro.md"),
                "guide/intro.md"
            )
        )
    }

    @Test
    fun internalDocumentAndLinkPathsKeepTheirPackageFolders() {
        val available = setOf("index.md", "docs/intro.md", "docs/chapters/one.md")
        assertEquals(
            "docs/chapters/one.md",
            TextPackManager.resolveMdzipDocumentPath("docs/chapters/one.md", available)
        )
        assertEquals(
            "docs/chapters/one.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/intro.md",
                "chapters/one.md#section",
                available
            )
        )
        assertEquals(
            "index.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/intro.md",
                "../index.md?view=full",
                available
            )
        )
    }

    @Test
    fun internalLinkResolutionRejectsEscapesAndExternalTargets() {
        val available = setOf("index.md", "docs/intro.md", "docs/chapter one.md")
        assertEquals(
            "docs/chapter one.md",
            TextPackManager.resolveMdzipLinkPath(
                "docs/intro.md",
                "chapter%20one.md",
                available
            )
        )
        assertEquals(
            null,
            TextPackManager.resolveMdzipLinkPath(
                "index.md",
                "../../outside.md",
                available
            )
        )
        assertEquals(
            null,
            TextPackManager.resolveMdzipLinkPath(
                "index.md",
                "https://example.com/guide.md",
                available
            )
        )
    }
}
