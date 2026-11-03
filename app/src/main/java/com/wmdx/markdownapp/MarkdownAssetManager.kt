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
    private const val MAX_ASSET_BYTES = 256L * 1024L * 1024L
    private const val MAX_PATH_SEARCH_DOCUMENTS = 10_000
    private const val MAX_PATH_SEARCH_DEPTH = 64
    private const val MAX_FALLBACK_IDENTITY_CHECK_BYTES = 16L * 1024L * 1024L
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
        }.getOrNull()
        val displayName = queryDisplayName(context, documentUri)
            ?: documentUri.lastPathSegment
            ?: return null
        val permissions = resolver.persistedUriPermissions.filter { permission ->
            permission.isReadPermission &&
                (!requireWrite || permission.isWritePermission) &&
                DocumentsContract.isTreeUri(permission.uri)
        }
        if (permissions.isEmpty()) return null

        val exactMatches = mutableListOf<MarkdownDocumentLocation>()
        for (permission in permissions) {
            val rootDocumentId = runCatching {
                DocumentsContract.getTreeDocumentId(permission.uri)
            }.getOrNull() ?: continue

            if (
                documentId != null &&
                permission.uri.authority == documentUri.authority
            ) {
                val scopedDocumentUri = runCatching {
                    DocumentsContract.buildDocumentUriUsingTree(permission.uri, documentId)
                }.getOrNull()
                val path = scopedDocumentUri?.let {
                    findPathFromTreeRoot(
                        context,
                        permission.uri,
                        it,
                        rootDocumentId,
                        documentId
                    )
                }
                if (path != null) {
                    val parentIds = path.dropLast(1)
                    if (parentIds.isNotEmpty()) {
                        exactMatches += MarkdownDocumentLocation(
                            permission.uri,
                            rootDocumentId,
                            parentIds
                        )
                    }
                }
            }
        }

        val exactMatch = exactMatches.maxByOrNull { it.parentDocumentIds.size }
        if (exactMatch != null) {
            AppDiagnostics.record(
                context,
                "markdown_asset_location_resolved",
                "strategy=document_id trees=${permissions.size}"
            )
            return exactMatch
        }

        val filesystemPath = queryFilesystemPath(context, documentUri, displayName)
        if (filesystemPath != null) {
            val filesystemMatches = permissions.mapNotNull { permission ->
                val rootDocumentId = runCatching {
                    DocumentsContract.getTreeDocumentId(permission.uri)
                }.getOrNull() ?: return@mapNotNull null
                val pathIds = findPathByFilesystemLocation(
                    context,
                    permission.uri,
                    rootDocumentId,
                    filesystemPath,
                    displayName
                ) ?: return@mapNotNull null
                val candidateDocumentId = pathIds.lastOrNull() ?: return@mapNotNull null
                val candidateUri = runCatching {
                    DocumentsContract.buildDocumentUriUsingTree(
                        permission.uri,
                        candidateDocumentId
                    )
                }.getOrNull() ?: return@mapNotNull null
                if (!hasSameContent(context, documentUri, candidateUri)) {
                    return@mapNotNull null
                }
                MarkdownDocumentLocation(
                    permission.uri,
                    rootDocumentId,
                    pathIds.dropLast(1)
                )
            }.distinctBy { location ->
                location.treeUri.toString() to location.parentDocumentIds
            }
            if (filesystemMatches.size == 1) {
                AppDiagnostics.record(
                    context,
                    "markdown_asset_location_resolved",
                    "strategy=filesystem_path trees=${permissions.size}"
                )
                return filesystemMatches.single()
            }
        }

        val nameMatches = mutableListOf<Pair<String, MarkdownDocumentLocation>>()
        for (permission in permissions) {
            val rootDocumentId = runCatching {
                DocumentsContract.getTreeDocumentId(permission.uri)
            }.getOrNull() ?: continue
            for (path in findPathsByDisplayNameInTree(
                context,
                permission.uri,
                rootDocumentId,
                displayName
            )) {
                val targetDocumentId = path.lastOrNull() ?: continue
                val parentIds = path.dropLast(1)
                if (parentIds.isNotEmpty()) {
                    nameMatches += targetDocumentId to MarkdownDocumentLocation(
                        permission.uri,
                        rootDocumentId,
                        parentIds
                    )
                }
            }
        }

        // Some file pickers return a provider URI that cannot be resolved by
        // document ID in the approved tree. Require both a unique name and
        // identical content; never guess between duplicate basenames.
        val verifiedNameMatches = nameMatches.filter { (targetId, location) ->
            val candidateUri = runCatching {
                DocumentsContract.buildDocumentUriUsingTree(location.treeUri, targetId)
            }.getOrNull() ?: return@filter false
            hasSameContent(context, documentUri, candidateUri)
        }
        val uniqueNameMatches = verifiedNameMatches.distinctBy { (targetId, location) ->
            location.treeUri.authority to targetId
        }
        if (uniqueNameMatches.size == 1) {
            AppDiagnostics.record(
                context,
                "markdown_asset_location_resolved",
                "strategy=unique_name_and_content trees=${permissions.size}"
            )
            return uniqueNameMatches.single().second
        }

        AppDiagnostics.record(
            context,
            "markdown_asset_location_unresolved",
            "sourceDocumentUri=${documentId != null} trees=${permissions.size} verifiedNameMatches=${uniqueNameMatches.size}"
        )
        return null
    }

    private fun hasSameContent(context: Context, firstUri: Uri, secondUri: Uri): Boolean {
        val firstStream = runCatching {
            context.contentResolver.openInputStream(firstUri)
        }.getOrNull() ?: return false
        val secondStream = runCatching {
            context.contentResolver.openInputStream(secondUri)
        }.getOrNull() ?: run {
            runCatching { firstStream.close() }
            return false
        }
        firstStream.use { first ->
            secondStream.use { second ->
                val firstBuffer = ByteArray(DEFAULT_BUFFER_SIZE)
                val secondBuffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var bytesCompared = 0L
                while (bytesCompared <= MAX_FALLBACK_IDENTITY_CHECK_BYTES) {
                    val firstCount = readChunk(first, firstBuffer)
                    val secondCount = readChunk(second, secondBuffer)
                    if (firstCount != secondCount) return false
                    if (firstCount == 0) return true
                    for (index in 0 until firstCount) {
                        if (firstBuffer[index] != secondBuffer[index]) return false
                    }
                    bytesCompared += firstCount
                    if (bytesCompared > MAX_FALLBACK_IDENTITY_CHECK_BYTES) return false
                }
            }
        }
        return false
    }

    private fun readChunk(input: InputStream, buffer: ByteArray): Int {
        var count = 0
        while (count < buffer.size) {
            val read = input.read(buffer, count, buffer.size - count)
            if (read < 0) break
            if (read == 0) {
                val nextByte = input.read()
                if (nextByte < 0) break
                buffer[count++] = nextByte.toByte()
            } else {
                count += read
            }
        }
        return count
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

    private fun findPathsByDisplayNameInTree(
        context: Context,
        treeUri: Uri,
        rootDocumentId: String,
        targetDisplayName: String
    ): List<List<String>> {
        val parents = HashMap<String, String?>()
        val depths = HashMap<String, Int>()
        val pending = java.util.ArrayDeque<String>()
        val matches = mutableListOf<List<String>>()
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
                if (parents.size > MAX_PATH_SEARCH_DOCUMENTS) return matches
                if (
                    child.mimeType != DocumentsContract.Document.MIME_TYPE_DIR &&
                    child.displayName == targetDisplayName
                ) {
                    val path = mutableListOf(child.documentId)
                    var currentParent: String? = parentId
                    while (currentParent != null) {
                        path.add(currentParent)
                        currentParent = parents[currentParent]
                    }
                    matches += path.asReversed()
                    if (matches.size > 1) return matches
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
        return matches
    }

    private fun findPathByFilesystemLocation(
        context: Context,
        treeUri: Uri,
        rootDocumentId: String,
        filesystemPath: String,
        displayName: String
    ): List<String>? {
        if (treeUri.authority != "com.android.externalstorage.documents") return null
        val rootPath = externalStorageTreeRootPath(rootDocumentId) ?: return null
        val segments = relativeFilesystemSegments(rootPath, filesystemPath) ?: return null
        if (segments.isEmpty() || segments.last() != displayName) return null

        val pathIds = mutableListOf(rootDocumentId)
        var parentDocumentId = rootDocumentId
        for ((index, segment) in segments.withIndex()) {
            val child = listChildren(context, treeUri, parentDocumentId)
                .singleOrNull { it.displayName == segment }
                ?: return null
            val isLastSegment = index == segments.lastIndex
            if (
                (isLastSegment && child.mimeType == DocumentsContract.Document.MIME_TYPE_DIR) ||
                (!isLastSegment && child.mimeType != DocumentsContract.Document.MIME_TYPE_DIR)
            ) {
                return null
            }
            pathIds += child.documentId
            parentDocumentId = child.documentId
        }
        return pathIds
    }

    private fun externalStorageTreeRootPath(rootDocumentId: String): String? {
        val separator = rootDocumentId.indexOf(':')
        if (separator <= 0) return null
        val volumeId = rootDocumentId.substring(0, separator)
        val volumeRoot = externalStorageVolumeRoot(volumeId) ?: return null
        val rootSegments = rootDocumentId.substring(separator + 1)
            .split('/')
            .filter(String::isNotEmpty)
        if (rootSegments.any { it == "." || it == ".." || it.any(Character::isISOControl) }) {
            return null
        }
        val rootPath = rootSegments.fold(volumeRoot) { parent, segment ->
            java.io.File(parent, segment)
        }
        return runCatching { rootPath.canonicalPath }.getOrNull()
    }

    private fun externalStorageVolumeRoot(volumeId: String): java.io.File? {
        if (!volumeId.matches(Regex("^[A-Za-z0-9_-]+$"))) return null
        return when {
            volumeId.equals("primary", ignoreCase = true) ||
                volumeId.equals("external_primary", ignoreCase = true) ->
                android.os.Environment.getExternalStorageDirectory()
            volumeId.equals("external", ignoreCase = true) -> null
            else -> java.io.File("/storage", volumeId)
        }
    }

    internal fun relativeFilesystemSegments(
        treeRootPath: String,
        documentPath: String
    ): List<String>? {
        val rootPath = runCatching { java.io.File(treeRootPath).canonicalPath }.getOrNull()
            ?: return null
        val sourcePath = runCatching { java.io.File(documentPath).canonicalPath }.getOrNull()
            ?: return null
        val rootPrefix = if (rootPath.endsWith(java.io.File.separator)) {
            rootPath
        } else {
            rootPath + java.io.File.separator
        }
        if (!sourcePath.startsWith(rootPrefix)) return null
        val relativePath = sourcePath.substring(rootPrefix.length)
        return relativePath.split(java.io.File.separatorChar)
            .takeIf { segments ->
                segments.isNotEmpty() &&
                    segments.none { segment ->
                        segment.isBlank() ||
                            segment == "." ||
                            segment == ".." ||
                            segment.any(Character::isISOControl)
                    }
            }
    }

    private fun queryFilesystemPath(
        context: Context,
        uri: Uri,
        displayName: String
    ): String? {
        if (uri.scheme.equals("file", ignoreCase = true)) {
            return uri.path?.takeIf(String::isNotBlank)
        }

        val dataPath = queryStringColumn(
            context,
            uri,
            android.provider.MediaStore.MediaColumns.DATA
        )?.takeIf(String::isNotBlank)
        if (dataPath != null) {
            return dataPath.takeIf { java.io.File(it).name == displayName }
        }
        if (uri.authority != "media") return null

        val relativePath = queryStringColumn(
            context,
            uri,
            android.provider.MediaStore.MediaColumns.RELATIVE_PATH
        ) ?: return null
        val volumeName = queryStringColumn(
            context,
            uri,
            android.provider.MediaStore.MediaColumns.VOLUME_NAME
        ) ?: return null
        if (
            displayName.isBlank() ||
            displayName.contains('/') ||
            displayName.contains('\\') ||
            displayName == "." ||
            displayName == ".."
        ) {
            return null
        }
        val volumeRoot = externalStorageVolumeRoot(volumeName) ?: return null
        val relativeSegments = relativePath.split('/')
            .filter(String::isNotEmpty)
        if (relativeSegments.any { it == "." || it == ".." || it.any(Character::isISOControl) }) {
            return null
        }
        val parent = relativeSegments.fold(volumeRoot) { directory, segment ->
            java.io.File(directory, segment)
        }
        return java.io.File(parent, displayName).path
    }

    private fun queryStringColumn(context: Context, uri: Uri, columnName: String): String? =
        runCatching {
            context.contentResolver.query(uri, arrayOf(columnName), null, null, null)
                ?.use { cursor ->
                    val columnIndex = cursor.getColumnIndex(columnName)
                    if (columnIndex >= 0 && cursor.moveToFirst()) {
                        cursor.getString(columnIndex)
                    } else {
                        null
                    }
                }
        }.getOrNull()

    fun addImage(
        context: Context,
        location: MarkdownDocumentLocation,
        input: InputStream,
        originalFileName: String?,
        mimeType: String?,
        storageLocation: String
    ): String = addAsset(
        context,
        location,
        input,
        TextPackManager.safeImageFileName(originalFileName, mimeType),
        mimeType,
        storageLocation
    )

    fun addAsset(
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

        val safeName = TextPackManager.safeAssetFileName(originalFileName)
        val existingNames = listChildren(
            context,
            location.treeUri,
            DocumentsContract.getDocumentId(targetDirectoryUri)
        ).map { canonicalName(it.displayName) }.toHashSet()
        val targetName = uniqueName(safeName, existingNames)
        val targetMimeType = mimeType
            ?.takeIf { it.isNotBlank() && it != "application/octet-stream" }
            ?: assetMimeTypeForExtension(targetName.substringAfterLast('.', ""))
        val fileDescription = if (targetMimeType.startsWith("image/")) "image" else "asset"
        val targetUri = DocumentsContract.createDocument(
            resolver,
            targetDirectoryUri,
            targetMimeType,
            targetName
        ) ?: throw IOException("Could not create the $fileDescription in the Markdown folder.")

        var bytesCopied = 0L
        try {
            val output = resolver.openOutputStream(targetUri, "w")
                ?: throw IOException("Could not write the selected asset.")
            input.use { source ->
                output.use { destination ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        bytesCopied += read
                        if (bytesCopied > MAX_ASSET_BYTES) {
                            throw IOException("This selected file is too large to save as a Markdown asset.")
                        }
                        destination.write(buffer, 0, read)
                    }
                    destination.flush()
                }
            }
            if (bytesCopied == 0L) throw IOException("The selected file is empty.")
        } catch (error: Exception) {
            runCatching { DocumentsContract.deleteDocument(resolver, targetUri) }
            if (error is IOException) throw error
            throw IOException("Could not save the selected Markdown asset.", error)
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

    private fun queryDisplayName(context: Context, uri: Uri): String? {
        val cursor = runCatching {
            context.contentResolver.query(
                uri,
                arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null
            )
        }.getOrNull() ?: return null
        return cursor.use { results ->
            val nameIndex = results.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (nameIndex >= 0 && results.moveToFirst()) results.getString(nameIndex) else null
        }
    }

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
            "mp3" -> "audio/mpeg"
            "aac" -> "audio/aac"
            "m4a" -> "audio/mp4"
            "wav" -> "audio/wav"
            "flac" -> "audio/flac"
            "opus" -> "audio/opus"
            "ogg", "oga" -> "audio/ogg"
            "mp4", "m4v" -> "video/mp4"
            "webm" -> "video/webm"
            "3gp" -> "video/3gpp"
            "mov" -> "video/quicktime"
            "mkv" -> "video/x-matroska"
            "avi" -> "video/x-msvideo"
            "mpeg", "mpg" -> "video/mpeg"
            "ogv" -> "video/ogg"
            "wmv" -> "video/x-ms-wmv"
            else -> "application/octet-stream"
        }

    private fun assetMimeTypeForExtension(extension: String): String =
        android.webkit.MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(extension.lowercase(Locale.ROOT))
            ?: mimeTypeForExtension(extension)
}
