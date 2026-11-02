package com.wmdx.markdownapp

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import java.io.IOException
import java.io.InputStream
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.util.Locale

internal data class MarkdownDocumentLocation(
    val treeUri: Uri,
    val rootDocumentId: String,
    val parentDocumentIds: List<String>
)

internal object MarkdownAssetManager {
    const val LOCATION_ASSETS = "assets"
    const val LOCATION_SAME_FOLDER = "same-folder"
    private const val MAX_IMAGE_BYTES = 256L * 1024L * 1024L
    private const val MAX_PATH_SEARCH_DOCUMENTS = 10_000
    private const val MAX_PATH_SEARCH_DEPTH = 64
    private const val PREVIEW_ASSET_BASE_URL =
        "https://appassets.androidplatform.net/markdown-assets"

    private data class ChildDocument(
        val documentId: String,
        val displayName: String,
        val mimeType: String
    )

    fun locateDocument(
        context: Context,
        documentUri: Uri,
        requireWrite: Boolean
    ): MarkdownDocumentLocation? {
        val resolver = context.contentResolver
        val documentId = runCatching {
            if (DocumentsContract.isDocumentUri(context, documentUri)) {
                DocumentsContract.getDocumentId(documentUri)
            } else {
                null
            }
        }.getOrNull() ?: return null

        var bestLocation: MarkdownDocumentLocation? = null
        for (permission in resolver.persistedUriPermissions) {
            if (
                !permission.isReadPermission ||
                (requireWrite && !permission.isWritePermission) ||
                !DocumentsContract.isTreeUri(permission.uri) ||
                permission.uri.authority != documentUri.authority
            ) {
                continue
            }

            val scopedDocumentUri = runCatching {
                DocumentsContract.buildDocumentUriUsingTree(permission.uri, documentId)
            }.getOrNull() ?: continue
            val rootDocumentId = runCatching {
                DocumentsContract.getTreeDocumentId(permission.uri)
            }.getOrNull() ?: continue
            val pathFromTreeRoot = findPathFromTreeRoot(
                context,
                permission.uri,
                scopedDocumentUri,
                rootDocumentId,
                documentId
            ) ?: continue
            val parentIds = pathFromTreeRoot.dropLast(1)
            if (parentIds.isEmpty()) continue
            val candidate = MarkdownDocumentLocation(permission.uri, rootDocumentId, parentIds)
            if (
                bestLocation == null ||
                candidate.parentDocumentIds.size > bestLocation.parentDocumentIds.size
            ) {
                bestLocation = candidate
            }
        }
        return bestLocation
    }

    /**
     * Some document providers return an incomplete path for a tree-scoped URI.
     * Use the provider path when it proves the document is beneath the granted
     * tree; otherwise walk that tree to verify membership and recover parents.
     */
    private fun findPathFromTreeRoot(
        context: Context,
        treeUri: Uri,
        documentUri: Uri,
        rootDocumentId: String,
        documentId: String
    ): List<String>? {
        val providerPath = runCatching {
            DocumentsContract.findDocumentPath(context.contentResolver, documentUri)?.path
        }.getOrNull()
        val verifiedProviderPath = providerPath?.let { path ->
            val rootIndex = path.indexOf(rootDocumentId)
            path.takeIf {
                rootIndex >= 0 &&
                    rootIndex < path.lastIndex &&
                    path.lastOrNull() == documentId
            }?.subList(rootIndex, path.size)
        }
        if (verifiedProviderPath != null) return verifiedProviderPath

        return findPathByTreeTraversal(context, treeUri, rootDocumentId, documentId)
    }

    private fun findPathByTreeTraversal(
        context: Context,
        treeUri: Uri,
        rootDocumentId: String,
        targetDocumentId: String
    ): List<String>? {
        val parents = HashMap<String, String?>()
        val depths = HashMap<String, Int>()
        val pending = java.util.ArrayDeque<String>()
        parents[rootDocumentId] = null
        depths[rootDocumentId] = 0
        pending.addLast(rootDocumentId)

        while (pending.isNotEmpty() && parents.size <= MAX_PATH_SEARCH_DOCUMENTS) {
            val parentId = pending.removeFirst()
            val parentDepth = depths[parentId] ?: continue
            if (parentDepth >= MAX_PATH_SEARCH_DEPTH) continue
            for (child in runCatching {
                listChildren(context, treeUri, parentId)
            }.getOrDefault(emptyList())) {
                if (parents.size > MAX_PATH_SEARCH_DOCUMENTS) return null
                if (child.documentId == targetDocumentId) {
                    val path = mutableListOf(targetDocumentId)
                    var currentParent: String? = parentId
                    while (currentParent != null) {
                        path.add(currentParent)
                        currentParent = parents[currentParent]
                    }
                    return path.asReversed()
                }
                if (
                    child.mimeType == DocumentsContract.Document.MIME_TYPE_DIR &&
                    child.documentId !in parents
                ) {
                    parents[child.documentId] = parentId
                    depths[child.documentId] = parentDepth + 1
                    pending.addLast(child.documentId)
                }
            }
        }
        return null
    }

    fun addImage(
        context: Context,
        location: MarkdownDocumentLocation,
        input: InputStream,
        originalFileName: String?,
        mimeType: String?,
        storageLocation: String
    ): String {
        val resolver = context.contentResolver
        val targetDirectoryIds: List<String>
        val targetDirectoryNames: List<String>
        val targetDirectoryUri: Uri

        if (storageLocation == LOCATION_SAME_FOLDER) {
            val parentDocumentId = location.parentDocumentIds.last()
            targetDirectoryIds = location.parentDocumentIds
            targetDirectoryNames = emptyList()
            targetDirectoryUri = buildDocumentUri(location, parentDocumentId)
        } else {
            val rootUri = buildDocumentUri(location, location.rootDocumentId)
            val assetsDirectory = findChild(context, location.treeUri, location.rootDocumentId, "assets")
            targetDirectoryUri = when {
                assetsDirectory == null -> DocumentsContract.createDocument(
                    resolver,
                    rootUri,
                    DocumentsContract.Document.MIME_TYPE_DIR,
                    "assets"
                ) ?: throw IOException("Could not create the shared assets folder.")
                assetsDirectory.mimeType == DocumentsContract.Document.MIME_TYPE_DIR ->
                    buildDocumentUri(location, assetsDirectory.documentId)
                else -> throw IOException("A file named assets already exists in this folder.")
            }
            val assetsDocumentId = DocumentsContract.getDocumentId(targetDirectoryUri)
            targetDirectoryIds = listOf(location.rootDocumentId, assetsDocumentId)
            targetDirectoryNames = listOf("assets")
        }

        val safeName = TextPackManager.safeImageFileName(originalFileName, mimeType)
        val existingNames = listChildren(
            context,
            location.treeUri,
            DocumentsContract.getDocumentId(targetDirectoryUri)
        ).map { canonicalName(it.displayName) }.toHashSet()
        val targetName = uniqueName(safeName, existingNames)
        val targetMimeType = mimeType?.takeIf { it.startsWith("image/") }
            ?: mimeTypeForExtension(targetName.substringAfterLast('.', ""))
        val targetUri = DocumentsContract.createDocument(
            resolver,
            targetDirectoryUri,
            targetMimeType,
            targetName
        ) ?: throw IOException("Could not create the image file in the Markdown folder.")

        var bytesCopied = 0L
        try {
            val output = resolver.openOutputStream(targetUri, "w")
                ?: throw IOException("Could not write the image file.")
            input.use { source ->
                output.use { destination ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        bytesCopied += read
                        if (bytesCopied > MAX_IMAGE_BYTES) {
                            throw IOException("This image is too large to save as a Markdown asset.")
                        }
                        destination.write(buffer, 0, read)
                    }
                    destination.flush()
                }
            }
            if (bytesCopied == 0L) throw IOException("The selected image file is empty.")
        } catch (error: Exception) {
            runCatching { DocumentsContract.deleteDocument(resolver, targetUri) }
            if (error is IOException) throw error
            throw IOException("Could not save the Markdown image file.", error)
        }

        val actualName = queryDisplayName(context, targetUri) ?: targetName
        return relativeMarkdownPath(
            fromDirectoryIds = location.parentDocumentIds,
            targetDirectoryIds = targetDirectoryIds,
            targetDirectoryNames = targetDirectoryNames,
            fileName = actualName
        ).split('/').joinToString("/") { Uri.encode(it) }
    }

    fun resolveImageUri(
        context: Context,
        location: MarkdownDocumentLocation,
        markdownReference: String
    ): Uri? {
        val segments = decodeRelativePath(markdownReference) ?: return null
        val directoryStack = location.parentDocumentIds.toMutableList()
        val fileSegments = segments.filter { it.isNotEmpty() && it != "." }
        if (fileSegments.isEmpty()) return null

        for ((index, segment) in fileSegments.withIndex()) {
            if (segment == "..") {
                if (directoryStack.size <= 1) return null
                directoryStack.removeAt(directoryStack.lastIndex)
                continue
            }
            if (segment.any { Character.isISOControl(it) } || segment == ".") return null
            val parentDocumentId = directoryStack.lastOrNull() ?: return null
            val child = findChild(context, location.treeUri, parentDocumentId, segment)
                ?: return null
            val isLastSegment = index == fileSegments.lastIndex
            if (isLastSegment) {
                if (child.mimeType == DocumentsContract.Document.MIME_TYPE_DIR) return null
                return buildDocumentUri(location, child.documentId)
            }
            if (child.mimeType != DocumentsContract.Document.MIME_TYPE_DIR) return null
            directoryStack.add(child.documentId)
        }
        return null
    }

    fun previewAssetUrl(
        context: Context,
        location: MarkdownDocumentLocation,
        sessionId: String,
        markdownReference: String
    ): String? {
        val imageUri = resolveImageUri(context, location, markdownReference) ?: return null
        val documentId = runCatching {
            DocumentsContract.getDocumentId(imageUri)
        }.getOrNull() ?: return null
        return "$PREVIEW_ASSET_BASE_URL/${Uri.encode(sessionId)}/${Uri.encode(documentId)}"
    }

    fun documentUriForPreviewId(
        context: Context,
        location: MarkdownDocumentLocation,
        documentId: String
    ): Uri? {
        val imageUri = runCatching { buildDocumentUri(location, documentId) }.getOrNull()
            ?: return null
        val pathIds = runCatching {
            DocumentsContract.findDocumentPath(context.contentResolver, imageUri)?.path.orEmpty()
        }.getOrNull().orEmpty()
        if (
            pathIds.lastOrNull() != documentId ||
            location.rootDocumentId !in pathIds.dropLast(1)
        ) {
            return null
        }
        val mimeType = runCatching { context.contentResolver.getType(imageUri) }.getOrNull()
        if (mimeType == DocumentsContract.Document.MIME_TYPE_DIR) return null
        return imageUri
    }

    internal fun relativeMarkdownPath(
        fromDirectoryIds: List<String>,
        targetDirectoryIds: List<String>,
        targetDirectoryNames: List<String>,
        fileName: String
    ): String {
        var commonPrefixLength = 0
        while (
            commonPrefixLength < fromDirectoryIds.size &&
            commonPrefixLength < targetDirectoryIds.size &&
            fromDirectoryIds[commonPrefixLength] == targetDirectoryIds[commonPrefixLength]
        ) {
            commonPrefixLength += 1
        }
        val upwardSegments = List(fromDirectoryIds.size - commonPrefixLength) { ".." }
        val downwardStart = (commonPrefixLength - 1).coerceAtLeast(0)
        val downwardSegments = targetDirectoryNames.drop(downwardStart)
        return (upwardSegments + downwardSegments + fileName).joinToString("/")
    }

    private fun decodeRelativePath(reference: String): List<String>? {
        val rawPath = reference.trim()
            .removePrefix("<")
            .removeSuffix(">")
            .substringBefore('#')
            .substringBefore('?')
        if (
            rawPath.isBlank() ||
            rawPath.startsWith("/") ||
            rawPath.startsWith("//") ||
            Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(rawPath)
        ) {
            return null
        }
        val decoded = try {
            URLDecoder.decode(rawPath.replace("+", "%2B"), StandardCharsets.UTF_8.name())
        } catch (_: IllegalArgumentException) {
            return null
        }
        return decoded.replace('\\', '/').split('/')
            .takeIf { parts -> parts.none { it.any { char -> Character.isISOControl(char) } } }
    }

    private fun uniqueName(baseName: String, existingNames: Set<String>): String {
        if (canonicalName(baseName) !in existingNames) return baseName
        val extensionIndex = baseName.lastIndexOf('.').takeIf { it > 0 } ?: baseName.length
        val stem = baseName.substring(0, extensionIndex)
        val extension = baseName.substring(extensionIndex)
        var suffix = 2
        while (canonicalName("$stem-$suffix$extension") in existingNames) suffix += 1
        return "$stem-$suffix$extension"
    }

    private fun canonicalName(name: String): String =
        Normalizer.normalize(name, Normalizer.Form.NFC).lowercase(Locale.ROOT)

    private fun findChild(
        context: Context,
        treeUri: Uri,
        parentDocumentId: String,
        displayName: String
    ): ChildDocument? = listChildren(context, treeUri, parentDocumentId)
        .firstOrNull { it.displayName == displayName }

    private fun listChildren(
        context: Context,
        treeUri: Uri,
        parentDocumentId: String
    ): List<ChildDocument> {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        val cursor = context.contentResolver.query(childrenUri, projection, null, null, null)
            ?: throw IOException("Could not read files in the Markdown folder.")
        return cursor.use { results ->
            val idIndex = results.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameIndex = results.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeIndex = results.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
            if (idIndex < 0 || nameIndex < 0 || mimeIndex < 0) {
                throw IOException("The Markdown folder does not expose its file list.")
            }
            buildList {
                while (results.moveToNext()) {
                    add(
                        ChildDocument(
                            documentId = results.getString(idIndex),
                            displayName = results.getString(nameIndex),
                            mimeType = results.getString(mimeIndex)
                        )
                    )
                }
            }
        }
    }

    private fun buildDocumentUri(location: MarkdownDocumentLocation, documentId: String): Uri =
        DocumentsContract.buildDocumentUriUsingTree(location.treeUri, documentId)

    internal fun mimeTypeForExtension(extension: String): String =
        when (extension.lowercase(Locale.ROOT)) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "svg" -> "image/svg+xml"
            "bmp" -> "image/bmp"
            "heic" -> "image/heic"
            "heif" -> "image/heif"
            "tif", "tiff" -> "image/tiff"
            "avif" -> "image/avif"
            else -> "application/octet-stream"
        }
}
