package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Test

class MarkdownAssetManagerTest {
    @Test
    fun sharedAssetsFolderIsReferencedFromNestedMarkdownFolders() {
        assertEquals(
            "../../assets/diagram.png",
            MarkdownAssetManager.relativeMarkdownPath(
                fromDirectoryIds = listOf("root", "notes", "drafts"),
                targetDirectoryIds = listOf("root", "assets"),
                targetDirectoryNames = listOf("assets"),
                fileName = "diagram.png"
            )
        )
    }

    @Test
    fun markdownAtTreeRootUsesSharedAssetsFolderDirectly() {
        assertEquals(
            "assets/diagram.png",
            MarkdownAssetManager.relativeMarkdownPath(
                fromDirectoryIds = listOf("root"),
                targetDirectoryIds = listOf("root", "assets"),
                targetDirectoryNames = listOf("assets"),
                fileName = "diagram.png"
            )
        )
    }

    @Test
    fun sameFolderStorageUsesOnlyTheImageFileName() {
        assertEquals(
            "diagram.png",
            MarkdownAssetManager.relativeMarkdownPath(
                fromDirectoryIds = listOf("root", "notes"),
                targetDirectoryIds = listOf("root", "notes"),
                targetDirectoryNames = emptyList(),
                fileName = "diagram.png"
            )
        )
    }
}
