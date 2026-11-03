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

    @Test
    fun filesystemPathMapsToSegmentsInsideApprovedTreeOnly() {
        assertEquals(
            listOf("notes", "drafts", "document.md"),
            MarkdownAssetManager.relativeFilesystemSegments(
                "/storage/emulated/0/Documents",
                "/storage/emulated/0/Documents/notes/drafts/document.md"
            )
        )
        assertEquals(
            null,
            MarkdownAssetManager.relativeFilesystemSegments(
                "/storage/emulated/0/Documents",
                "/storage/emulated/0/Documents-backup/document.md"
            )
        )
        assertEquals(
            null,
            MarkdownAssetManager.relativeFilesystemSegments(
                "/storage/emulated/0/Documents",
                "/storage/emulated/0/Download/document.md"
            )
        )
    }

    @Test
    fun recognizesAudioAndVideoAssetMimeTypes() {
        assertEquals("audio/mpeg", MarkdownAssetManager.mimeTypeForExtension("mp3"))
        assertEquals("audio/mp4", MarkdownAssetManager.mimeTypeForExtension("m4a"))
        assertEquals("video/webm", MarkdownAssetManager.mimeTypeForExtension("webm"))
        assertEquals("video/x-matroska", MarkdownAssetManager.mimeTypeForExtension("mkv"))
    }
}
