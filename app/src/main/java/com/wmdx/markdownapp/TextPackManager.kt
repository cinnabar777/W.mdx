package com.wmdx.markdownapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

enum class TextPackFormat {
    MDZIP
}

data class TextPackSession(
    val sessionDir: File,
    var markdownContent: String,
    var sourceUri: Uri?,
    var format: TextPackFormat = TextPackFormat.MDZIP,
    var entryPointPath: String = "index.md",
    var documentPath: String = entryPointPath,
    var manifest: JSONObject? = null
)

object TextPackManager {
    private const val MDZIP_EXTENSION = ".mdz"
    private const val MDZIP_SPEC_NAME = "mdzip-spec"
    private const val MDZIP_SPEC_VERSION = "1.2.1"
    private const val MAX_ARCHIVE_ENTRIES = 50_000
    private const val MAX_ARCHIVE_BYTES = 2L * 1024L * 1024L * 1024L
    private const val MAX_ENTRY_BYTES = 1024L * 1024L * 1024L
    private const val MAX_MARKDOWN_BYTES = 64L * 1024L * 1024L
    private const val MAX_MANIFEST_BYTES = 1024L * 1024L
    private val supportMarkdownNames = setOf(
        "readme.md",
        "readme.markdown",
        "agents.md",
        "agents.markdown",
        "license.md",
        "license.markdown",
        "changelog.md",
        "changelog.markdown",
        "contributing.md",
        "contributing.markdown"
    )

    @Suppress("UNUSED_PARAMETER")
    fun isTextPackFile(context: Context, uri: Uri, fileName: String): Boolean =
        fileName.endsWith(MDZIP_EXTENSION, ignoreCase = true)

    fun isUnsupportedLegacyTextPackArchive(context: Context, uri: Uri, fileName: String): Boolean {
        val lowerName = fileName.lowercase(java.util.Locale.ROOT)
        if (
            lowerName.endsWith(".mdx.zip") ||
            lowerName.endsWith(".textpack") ||
            lowerName.endsWith(".textpack.zip")
        ) return true
        if (!lowerName.endsWith(".mdx")) return false
        return runCatching {
            context.contentResolver.openInputStream(uri)?.use { input ->
                val signature = IntArray(4) { input.read() }
                signature[0] == 0x50 &&
                    signature[1] == 0x4b &&
                    signature[2] in setOf(0x03, 0x05, 0x07) &&
                    signature[3] in setOf(0x04, 0x06, 0x08)
            } ?: false
        }.getOrDefault(false)
    }

    fun openTextPack(context: Context, uri: Uri, fileName: String): TextPackSession {
        if (!fileName.endsWith(MDZIP_EXTENSION, ignoreCase = true)) {
            throw IOException("Only MDZip .mdz packages are supported.")
        }
        val sessionDir = newSessionDirectory(context)
        try {
            val extractedFiles = extractArchive(context, uri, sessionDir)
            return openMdzipSession(sessionDir, uri, extractedFiles)
        } catch (error: Exception) {
            sessionDir.deleteRecursively()
            throw error
        }
    }

    fun createMdzipSession(
        context: Context,
        markdownContent: String,
        title: String
    ): TextPackSession {
        val sessionDir = newSessionDirectory(context)
        try {
            createDefaultContentDirectories(sessionDir)

            val entryPointPath = availableEntryPointPath(sessionDir)
            val entryPoint = resolveArchiveFile(sessionDir, entryPointPath)
                ?: throw IOException("Could not create the MDZip entry point.")
            entryPoint.parentFile?.mkdirs()
            entryPoint.writeText(markdownContent, Charsets.UTF_8)
            val manifest = newMdzipManifest(entryPointPath, title)
            writeManifest(sessionDir, manifest)

            return TextPackSession(
                sessionDir = sessionDir,
                markdownContent = markdownContent,
                sourceUri = null,
                entryPointPath = entryPointPath,
                documentPath = entryPointPath,
                manifest = manifest
            )
        } catch (error: Exception) {
            sessionDir.deleteRecursively()
            throw error
        }
    }

    fun addAssetImage(session: TextPackSession, imageInputStream: InputStream, originalFileName: String?): String {
        val extension = originalFileName
            ?.substringAfterLast('/', "")
            ?.substringAfterLast('\\', "")
            ?.substringAfterLast('.', "")
            ?.takeIf { it.matches(Regex("[A-Za-z0-9]{1,10}")) }
            ?: "png"
        val assetName = "img_${UUID.randomUUID()}.$extension"
        val archivePath = "${contentDirectoryName(session.sessionDir, "images")}/$assetName"
        val targetFile = resolveArchiveFile(session.sessionDir, archivePath)
            ?: throw IOException("The image path is not safe.")
        targetFile.parentFile?.mkdirs()
        FileOutputStream(targetFile).use { out ->
            imageInputStream.copyTo(out)
        }
        return relativeMarkdownPath(session.documentPath, archivePath)
    }

    fun addAssetMedia(
        session: TextPackSession,
        mediaInputStream: InputStream,
        originalFileName: String?,
        mediaType: String,
        fallbackExtension: String
    ): String {
        val directory = when (mediaType.lowercase(java.util.Locale.ROOT)) {
            "audio" -> "audio"
            "video" -> "video"
            else -> throw IOException("Only audio and video assets are supported.")
        }
        val originalExtension = originalFileName
            ?.substringAfterLast('/', "")
            ?.substringAfterLast('\\', "")
            ?.substringAfterLast('.', "")
            ?.takeIf { it.matches(Regex("[A-Za-z0-9]{1,10}")) }
        val extension = (originalExtension ?: fallbackExtension)
            .takeIf { it.matches(Regex("[A-Za-z0-9]{1,10}")) }
            ?: if (directory == "audio") "m4a" else "mp4"
        val directoryPath = contentDirectoryName(session.sessionDir, directory)
        val originalName = originalFileName
            ?.substringAfterLast('/')
            ?.substringAfterLast('\\')
            ?.trim()
            .orEmpty()
        val rawStem = originalName.substringBeforeLast('.', originalName)
        val safeStem = rawStem
            .replace(Regex("[^\\p{L}\\p{N} _().-]"), "_")
            .trim(' ', '.', '_')
            .take(120)
            .ifBlank { if (directory == "audio") "Audio" else "Video" }
        val safeExtension = extension.lowercase(java.util.Locale.ROOT)
        val targetDirectory = resolveArchiveFile(session.sessionDir, directoryPath)
            ?: throw IOException("The $directory directory is not safe.")
        var assetName = "$safeStem.$safeExtension"
        var suffix = 2
        while (File(targetDirectory, assetName).exists()) {
            assetName = "$safeStem ($suffix).$safeExtension"
            suffix++
        }
        val archivePath = "$directoryPath/$assetName"
        val targetFile = resolveArchiveFile(session.sessionDir, archivePath)
            ?: throw IOException("The $directory asset path is not safe.")
        targetFile.parentFile?.mkdirs()
        FileOutputStream(targetFile).use { out ->
            mediaInputStream.copyTo(out)
        }
        return relativeMarkdownPath(session.documentPath, archivePath)
            .split('/')
            .joinToString("/") { segment ->
                when {
                    segment == "." || segment == ".." -> segment
                    segment.matches(Regex("[A-Za-z0-9._~-]+")) -> segment
                    else -> Uri.encode(segment)
                }
            }
    }

    /**
     * Removes an embedded media asset only when no Markdown document in this
     * MDZip still references it. The active document's unsaved text is supplied
     * by the editor so cleanup does not depend on the last save.
     */
    fun removeUnreferencedMediaAsset(
        session: TextPackSession,
        mediaUrl: String,
        updatedDocumentMarkdown: String
    ): Boolean {
        val availablePaths = session.sessionDir.walkTopDown()
            .filter { it.isFile }
            .map { it.relativeTo(session.sessionDir).invariantSeparatorsPath }
            .map { java.text.Normalizer.normalize(it, java.text.Normalizer.Form.NFC) }
            .toList()
        val targetPath = resolveMdzipAssetPath(session.documentPath, mediaUrl, availablePaths)
            ?: return false
        val assetFolder = targetPath.substringBefore('/')
        if (!assetFolder.equals("audio", ignoreCase = true) &&
            !assetFolder.equals("video", ignoreCase = true)
        ) {
            return false
        }
        val targetFile = resolveArchiveFile(session.sessionDir, targetPath)
            ?: return false
        if (!targetFile.isFile) return false

        val currentDocumentPath = java.text.Normalizer.normalize(
            session.documentPath,
            java.text.Normalizer.Form.NFC
        )
        val documentPaths = availablePaths.filter(::isMarkdownPath)
        if (currentDocumentPath !in documentPaths) return false
        val markdownLinkPattern = Regex(
            """\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)"""
        )
        for (documentPath in documentPaths) {
            val markdown = if (documentPath == currentDocumentPath) {
                updatedDocumentMarkdown
            } else {
                val documentFile = resolveArchiveFile(session.sessionDir, documentPath) ?: return false
                runCatching { documentFile.readText(Charsets.UTF_8) }.getOrNull() ?: return false
            }
            for (match in markdownLinkPattern.findAll(markdown)) {
                val reference = match.groups[1]?.value ?: match.groups[2]?.value ?: continue
                if (resolveMdzipAssetPath(documentPath, reference, availablePaths) == targetPath) {
                    return false
                }
            }
        }
        return targetFile.delete()
    }

    fun saveTextPack(
        context: Context,
        session: TextPackSession,
        markdownContent: String,
        targetUri: Uri,
        title: String = ""
    ): TextPackSession {
        if (session.format != TextPackFormat.MDZIP) {
            throw IOException("Only MDZip .mdz packages are supported.")
        }
        writeMdzipDocument(session.sessionDir, session.documentPath, markdownContent)
        val manifest = session.manifest ?: readManifest(session.sessionDir)
            ?: newMdzipManifest(session.entryPointPath, title)
        if (manifest.optString("mode") != "project") {
            ensureProducerManifest(manifest, session.entryPointPath, title)
            writeManifest(session.sessionDir, manifest)
        }
        session.manifest = manifest

        writeMdzipArchiveSafely(
            session.sessionDir,
            openExistingArchive = { context.contentResolver.openInputStream(targetUri) },
            openDestination = {
                context.contentResolver.openOutputStream(targetUri, "rwt")
            }
        )

        session.sourceUri = targetUri
        session.markdownContent = markdownContent
        return session
    }

    fun markdownDocumentPaths(session: TextPackSession): List<String> =
        session.sessionDir.walkTopDown()
            .filter { it.isFile && isMarkdownPath(it.name) }
            .mapNotNull { file ->
                val sessionRoot = session.sessionDir.absolutePath
                    .trimEnd(File.separatorChar) + File.separator
                val relativePath = file.absolutePath
                    .removePrefix(sessionRoot)
                    .replace(File.separatorChar, '/')
                validateArchivePath(relativePath)
            }
            .sorted()
            .toList()

    fun selectMarkdownDocument(session: TextPackSession, documentPath: String): String {
        val availablePaths = markdownDocumentPaths(session).toSet()
        val normalizedPath = resolveMdzipDocumentPath(documentPath, availablePaths)
            ?: throw IOException("This Markdown document is not in the package.")
        val markdownFile = resolveArchiveFile(session.sessionDir, normalizedPath)
            ?: throw IOException("The Markdown document path is invalid.")
        if (markdownFile.length() > MAX_MARKDOWN_BYTES) {
            throw IOException("The Markdown document is too large to open.")
        }
        session.documentPath = normalizedPath
        session.markdownContent = markdownFile.readText(Charsets.UTF_8)
        return session.markdownContent
    }

    fun resolveProjectLink(session: TextPackSession, linkTarget: String): String? {
        if (session.manifest?.optString("mode") != "project") return null
        val availablePaths = markdownDocumentPaths(session).toSet()
        return resolveMdzipLinkPath(session.documentPath, linkTarget, availablePaths)
    }

    fun resolveAssetFile(session: TextPackSession, relativePath: String): File? =
        resolveArchiveFile(session.sessionDir, relativePath)

    internal fun resolveMdzipEntryPoint(
        archivePaths: Set<String>,
        declaredEntryPoint: String?
    ): String {
        val normalizedPaths = archivePaths.map { java.text.Normalizer.normalize(it, java.text.Normalizer.Form.NFC) }
            .toSet()
        if (declaredEntryPoint != null) {
            if (declaredEntryPoint.endsWith('/')) {
                throw IOException("The MDZip manifest entryPoint cannot name a directory.")
            }
            val withoutOptionalDotPrefix = declaredEntryPoint.removePrefix("./")
            val path = validateArchivePath(withoutOptionalDotPrefix)
                ?: throw IOException("The MDZip manifest has an invalid entryPoint.")
            if (!isMarkdownPath(path) || path !in normalizedPaths) {
                throw IOException("The MDZip manifest entryPoint does not identify a Markdown file.")
            }
            return path
        }

        if ("index.md" in normalizedPaths) return "index.md"

        val rootMarkdownFiles = normalizedPaths
            .filter { !it.contains('/') && isMarkdownPath(it) }
        val contentFiles = rootMarkdownFiles.filterNot {
            it.lowercase(java.util.Locale.ROOT) in supportMarkdownNames
        }
        if (contentFiles.size == 1) return contentFiles.single()
        if (contentFiles.isEmpty() && rootMarkdownFiles.size == 1) return rootMarkdownFiles.single()
        throw IOException(
            if (contentFiles.isEmpty()) {
                "This MDZip package does not contain an unambiguous root-level Markdown entry point."
            } else {
                "This MDZip package has multiple possible entry points. Add a manifest entryPoint or root index.md."
            }
        )
    }

    internal fun resolveMdzipProjectEntryPoint(
        archivePaths: Set<String>,
        declaredEntryPoint: String?
    ): String {
        if (declaredEntryPoint != null) {
            return resolveMdzipEntryPoint(archivePaths, declaredEntryPoint)
        }
        val normalizedPaths = archivePaths.map {
            java.text.Normalizer.normalize(it, java.text.Normalizer.Form.NFC)
        }.toSet()
        if ("index.md" in normalizedPaths) return "index.md"
        return normalizedPaths.filter(::isMarkdownPath).sorted().firstOrNull()
            ?: throw IOException("This MDZip project does not contain a Markdown document.")
    }

    internal fun resolveMdzipDocumentPath(
        documentPath: String,
        availablePaths: Set<String>
    ): String? {
        val normalizedPaths = availablePaths.map {
            java.text.Normalizer.normalize(it, java.text.Normalizer.Form.NFC)
        }.toSet()
        val safePath = validateArchivePath(documentPath)
            ?: return null
        return safePath.takeIf { it in normalizedPaths && isMarkdownPath(it) }
    }

    internal fun resolveMdzipLinkPath(
        currentDocumentPath: String,
        linkTarget: String,
        availablePaths: Set<String>
    ): String? {
        val targetWithoutSuffix = linkTarget.trim()
            .substringBefore('#')
            .substringBefore('?')
        if (
            targetWithoutSuffix.isBlank() ||
            targetWithoutSuffix.startsWith('/') ||
            targetWithoutSuffix.startsWith('\\') ||
            Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(targetWithoutSuffix) ||
            targetWithoutSuffix.startsWith("//")
        ) {
            return null
        }
        val decodedTarget = runCatching {
            java.net.URLDecoder.decode(
                targetWithoutSuffix.replace("+", "%2B"),
                Charsets.UTF_8.name()
            )
        }.getOrNull() ?: return null
        if (decodedTarget.contains('\\') || decodedTarget.contains('\u0000')) return null

        val segments = currentDocumentPath.substringBeforeLast('/', "")
            .split('/')
            .filter { it.isNotBlank() }
            .toMutableList()
        for (segment in decodedTarget.split('/')) {
            when (segment) {
                "", "." -> Unit
                ".." -> if (segments.isEmpty()) return null else segments.removeAt(segments.lastIndex)
                else -> segments.add(segment)
            }
        }
        if (segments.isEmpty()) return null
        val resolved = java.text.Normalizer.normalize(segments.joinToString("/"), java.text.Normalizer.Form.NFC)
        resolveMdzipDocumentPath(resolved, availablePaths)?.let { return it }
        if (resolved.substringAfterLast('/').contains('.')) return null
        return listOf("$resolved.md", "$resolved.markdown")
            .firstNotNullOfOrNull { resolveMdzipDocumentPath(it, availablePaths) }
    }

    private fun extractArchive(
        context: Context,
        uri: Uri,
        sessionDir: File
    ): Set<String> {
        val input = context.contentResolver.openInputStream(uri)
            ?: throw IOException("Could not read the selected Markdown package.")
        return input.use { inputStream ->
            extractArchive(inputStream, sessionDir)
        }
    }

    internal fun extractArchive(
        inputStream: InputStream,
        sessionDir: File
    ): Set<String> {
        val extractedFiles = linkedSetOf<String>()
        val seenEntries = hashMapOf<String, Boolean>()
        var entryCount = 0
        var totalBytes = 0L
        ZipInputStream(inputStream).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (++entryCount > MAX_ARCHIVE_ENTRIES) {
                    throw IOException("The package contains too many files.")
                }
                val archivePath = validateArchivePath(entry.name)
                    ?: throw IOException("The package contains an unsafe file path.")
                if (archivePath in seenEntries) {
                    throw IOException("The package contains a duplicate path: $archivePath")
                }
                seenEntries[archivePath] = entry.isDirectory
                val target = resolveArchiveFile(sessionDir, archivePath)
                    ?: throw IOException("The package contains an unsafe file path.")

                if (entry.isDirectory) {
                    if (entry.size > 0L || zip.read() != -1) {
                        throw IOException("A package directory entry contains file data.")
                    }
                    if (!target.exists() && !target.mkdirs()) {
                        throw IOException("Could not create a package folder.")
                    }
                } else {
                    target.parentFile?.let { parent ->
                        if (!parent.exists() && !parent.mkdirs()) {
                            throw IOException("Could not create a package folder.")
                        }
                    }
                    var entryBytes = 0L
                    FileOutputStream(target).use { out ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val count = zip.read(buffer)
                            if (count < 0) break
                            entryBytes += count
                            totalBytes += count
                            if (entryBytes > MAX_ENTRY_BYTES || totalBytes > MAX_ARCHIVE_BYTES) {
                                throw IOException("The package expands beyond the supported size.")
                            }
                            if (archivePath == "manifest.json" && entryBytes > MAX_MANIFEST_BYTES) {
                                throw IOException("The package manifest is too large.")
                            }
                            if (isMarkdownPath(archivePath) && entryBytes > MAX_MARKDOWN_BYTES) {
                                throw IOException("A Markdown file in this package is too large.")
                            }
                            out.write(buffer, 0, count)
                        }
                    }
                    extractedFiles.add(archivePath)
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
        for (path in seenEntries.keys) {
            var parentPath = path
            while (parentPath.contains('/')) {
                parentPath = parentPath.substringBeforeLast('/')
                if (seenEntries[parentPath] == false) {
                    throw IOException("The package contains a file where a folder is required.")
                }
            }
        }
        return extractedFiles
    }

    internal fun writeMdzipArchive(
        sessionDir: File,
        outputStream: OutputStream
    ) {
        ZipOutputStream(outputStream).use { zipOut ->
            compressFolder(sessionDir, sessionDir, zipOut)
            zipOut.flush()
        }
    }

    internal fun writeMdzipArchiveSafely(
        sessionDir: File,
        openExistingArchive: () -> InputStream?,
        openDestination: () -> OutputStream?
    ) {
        val tempDirectory = sessionDir.absoluteFile.parentFile
            ?: throw IOException("Could not prepare a temporary Markdown package.")
        val stagedArchive = File.createTempFile("mdzip-save-", ".mdz", tempDirectory)
        var backupArchive: File? = null
        try {
            FileOutputStream(stagedArchive).use { output ->
                writeMdzipArchive(sessionDir, output)
            }

            val backup = File.createTempFile("mdzip-backup-", ".mdz", tempDirectory)
            backupArchive = backup
            val existingArchive = openExistingArchive()
            val hadExistingArchive = existingArchive != null
            existingArchive?.use { input ->
                FileOutputStream(backup).use { output ->
                    input.copyTo(output)
                }
            }

            try {
                val destination = openDestination()
                    ?: throw IOException("Could not open the Markdown package for writing.")
                destination.use { output ->
                    FileInputStream(stagedArchive).use { input ->
                        input.copyTo(output)
                    }
                }
            } catch (saveError: Exception) {
                if (hadExistingArchive) {
                    try {
                        val destination = openDestination()
                            ?: throw IOException("Could not restore the previous Markdown package.")
                        destination.use { output ->
                            FileInputStream(backup).use { input ->
                                input.copyTo(output)
                            }
                        }
                    } catch (restoreError: Exception) {
                        saveError.addSuppressed(restoreError)
                    }
                }
                throw saveError
            }
        } finally {
            stagedArchive.delete()
            backupArchive?.delete()
        }
    }

    internal fun writeMdzipDocument(sessionDir: File, documentPath: String, markdownContent: String) {
        val markdownFile = resolveArchiveFile(sessionDir, documentPath)
            ?: throw IOException("The MDZip document path is invalid.")
        markdownFile.parentFile?.mkdirs()
        markdownFile.writeText(markdownContent, Charsets.UTF_8)
    }

    private fun openMdzipSession(
        sessionDir: File,
        uri: Uri,
        extractedFiles: Set<String>
    ): TextPackSession {
        val manifest = readManifest(sessionDir)
        val spec = manifest?.let {
            if (!it.has("spec")) {
                null
            } else {
                it.optJSONObject("spec")
                    ?: throw IOException("The MDZip manifest spec field must be an object.")
            }
        }
        val specVersion = spec?.let {
            if (!it.has("version")) {
                null
            } else {
                it.opt("version") as? String
                    ?: throw IOException("The MDZip manifest spec version must be Semantic Versioning.")
            }
        }
        if (specVersion != null && !isSemanticVersion(specVersion)) {
            throw IOException("The MDZip manifest spec version must be Semantic Versioning.")
        }
        val mode = manifest?.let {
            if (!it.has("mode")) {
                null
            } else {
                it.opt("mode") as? String
                    ?: throw IOException("The MDZip manifest mode must be a string.")
            }
        }
        if (mode != null && mode !in setOf("document", "project")) {
            throw IOException("This MDZip package uses an unsupported mode: $mode")
        }
        val declaredEntryPoint = manifest?.let {
            if (!it.has("entryPoint")) {
                null
            } else {
                it.opt("entryPoint") as? String
                    ?: throw IOException("The MDZip manifest entryPoint must be a string.")
            }
        }
        val entryPointPath = if (mode == "project") {
            resolveMdzipProjectEntryPoint(extractedFiles, declaredEntryPoint)
        } else {
            resolveMdzipEntryPoint(extractedFiles, declaredEntryPoint)
        }
        val markdownFile = resolveArchiveFile(sessionDir, entryPointPath)
            ?: throw IOException("The MDZip entry point path is invalid.")
        if (markdownFile.length() > MAX_MARKDOWN_BYTES) {
            throw IOException("The Markdown document is too large to open.")
        }
        return TextPackSession(
            sessionDir = sessionDir,
            markdownContent = markdownFile.readText(Charsets.UTF_8),
            sourceUri = uri,
            entryPointPath = entryPointPath,
            documentPath = entryPointPath,
            manifest = manifest
        )
    }

    private fun readManifest(sessionDir: File): JSONObject? {
        val manifestFile = File(sessionDir, "manifest.json")
        if (!manifestFile.isFile) return null
        if (manifestFile.length() > MAX_MANIFEST_BYTES) {
            throw IOException("The package manifest is too large.")
        }
        return try {
            JSONObject(manifestFile.readText(Charsets.UTF_8))
        } catch (error: Exception) {
            throw IOException("The MDZip manifest is not valid JSON.", error)
        }
    }

    private fun newMdzipManifest(entryPointPath: String, title: String): JSONObject =
        JSONObject()
            .put(
                "spec",
                JSONObject()
                    .put("name", MDZIP_SPEC_NAME)
                    .put("version", MDZIP_SPEC_VERSION)
            )
            .put("mode", "document")
            .put("entryPoint", entryPointPath)
            .put("title", title)

    private fun ensureProducerManifest(manifest: JSONObject, entryPointPath: String, title: String) {
        val spec = manifest.optJSONObject("spec") ?: JSONObject()
        if ((spec.opt("name") as? String).isNullOrBlank()) spec.put("name", MDZIP_SPEC_NAME)
        val specVersion = spec.opt("version") as? String
        if (specVersion == null || !isSemanticVersion(specVersion)) {
            spec.put("version", MDZIP_SPEC_VERSION)
        }
        manifest.put("spec", spec)
        if (!manifest.has("mode") || manifest.isNull("mode")) manifest.put("mode", "document")
        manifest.put("entryPoint", entryPointPath)
        if ((manifest.opt("title") as? String).isNullOrBlank() && title.isNotBlank()) {
            manifest.put("title", title)
        }
    }

    private fun isSemanticVersion(version: String): Boolean =
        Regex(
            "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
                "(?:-(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?" +
                "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"
        ).matches(version)

    private fun writeManifest(sessionDir: File, manifest: JSONObject) {
        File(sessionDir, "manifest.json").writeText(manifest.toString(2) + "\n", Charsets.UTF_8)
    }

    private fun createDefaultContentDirectories(sessionDir: File) {
        val existingNames = sessionDir.listFiles()
            ?.map { it.name.lowercase(java.util.Locale.ROOT) }
            ?.toMutableSet()
            ?: mutableSetOf()
        listOf("docs", "images", "audio", "video", "attachments").forEach { directory ->
            if (directory.lowercase(java.util.Locale.ROOT) !in existingNames) {
                File(sessionDir, directory).mkdirs()
                existingNames.add(directory.lowercase(java.util.Locale.ROOT))
            }
        }
    }

    private fun contentDirectoryName(sessionDir: File, preferredName: String): String {
        val existing = sessionDir.listFiles()
            ?.firstOrNull { it.name.equals(preferredName, ignoreCase = true) }
        if (existing != null) {
            if (!existing.isDirectory) {
                throw IOException("The package already contains a file named $preferredName.")
            }
            return existing.name
        }
        return preferredName
    }

    private fun resolveMdzipAssetPath(
        documentPath: String,
        linkTarget: String,
        availablePaths: List<String>
    ): String? {
        val rawTarget = linkTarget.trim().substringBefore('#').substringBefore('?')
        if (
            rawTarget.isEmpty() ||
            rawTarget.startsWith('/') ||
            rawTarget.startsWith("//") ||
            rawTarget.contains('\\') ||
            rawTarget.contains('\u0000') ||
            Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(rawTarget)
        ) {
            return null
        }
        val decodedTarget = runCatching {
            java.net.URLDecoder.decode(
                rawTarget.replace("+", "%2B"),
                Charsets.UTF_8.name()
            )
        }.getOrNull() ?: return null
        if (decodedTarget.contains('\\') || decodedTarget.contains('\u0000')) return null

        val segments = mutableListOf<String>()
        val documentDirectory = documentPath.substringBeforeLast('/', "")
        val combined = if (documentDirectory.isEmpty()) {
            decodedTarget
        } else {
            "$documentDirectory/$decodedTarget"
        }
        for (segment in combined.split('/')) {
            when (segment) {
                "", "." -> Unit
                ".." -> {
                    if (segments.isEmpty()) return null
                    segments.removeAt(segments.lastIndex)
                }
                else -> segments.add(segment)
            }
        }
        if (segments.isEmpty()) return null
        val normalized = java.text.Normalizer.normalize(
            segments.joinToString("/"),
            java.text.Normalizer.Form.NFC
        )
        return normalized.takeIf { it in availablePaths }
    }

    private fun availableEntryPointPath(sessionDir: File): String {
        val existingNames = sessionDir.listFiles()
            ?.map { it.name.lowercase(java.util.Locale.ROOT) }
            ?.toSet()
            .orEmpty()
        if ("index.md" !in existingNames) return "index.md"
        var suffix = 1
        while (true) {
            val candidate = if (suffix == 1) "wmdx-entry.md" else "wmdx-entry-$suffix.md"
            if (candidate.lowercase(java.util.Locale.ROOT) !in existingNames) return candidate
            suffix++
        }
    }

    private fun newSessionDirectory(context: Context): File {
        val parent = File(context.cacheDir, "textpack_sessions")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Could not create a temporary package workspace.")
        }
        val sessionDir = File(parent, "session_${UUID.randomUUID()}")
        if (!sessionDir.mkdirs()) {
            throw IOException("Could not create a temporary package workspace.")
        }
        return sessionDir
    }

    private fun isMarkdownPath(path: String): Boolean =
        path.endsWith(".md", ignoreCase = true) ||
            path.endsWith(".markdown", ignoreCase = true)

    private fun validateArchivePath(rawPath: String): String? {
        if (rawPath.isBlank() || rawPath.contains('\u0000')) return null
        if (rawPath.contains('\\')) return null
        val path = if (rawPath.endsWith('/')) rawPath.dropLast(1) else rawPath
        if (path.isBlank() || path.startsWith('/') || Regex("^[A-Za-z]:").containsMatchIn(path)) return null
        val segments = path.split('/')
        if (segments.any { it.isBlank() || it == "." || it == ".." }) return null
        if (segments.any { segment -> segment.any { it.code < 0x20 || it.code == 0x7f } }) return null
        if (segments.any { segment -> segment.any { it in ":*?\"<>|" } }) return null
        return java.text.Normalizer.normalize(path, java.text.Normalizer.Form.NFC)
    }

    private fun resolveArchiveFile(root: File, relativePath: String): File? {
        val safePath = validateArchivePath(relativePath) ?: return null
        val rootPath = root.canonicalFile.toPath()
        val target = File(root, safePath).canonicalFile
        return target.takeIf { it.toPath().startsWith(rootPath) }
    }

    private fun relativeMarkdownPath(entryPointPath: String, assetPath: String): String {
        val entryParent = entryPointPath.substringBeforeLast('/', "")
            .split('/')
            .filter { it.isNotBlank() }
        val targetSegments = assetPath.split('/').filter { it.isNotBlank() }
        var common = 0
        while (
            common < entryParent.size &&
            common < targetSegments.size &&
            entryParent[common] == targetSegments[common]
        ) {
            common++
        }
        return (List(entryParent.size - common) { ".." } + targetSegments.drop(common))
            .joinToString("/")
    }

    private fun compressFolder(rootFolder: File, currentFolder: File, zipOut: ZipOutputStream) {
        val files = currentFolder.listFiles()?.sortedBy { it.name } ?: return
        if (currentFolder != rootFolder && files.isEmpty()) {
            val directoryPath = rootFolder.toPath().relativize(currentFolder.toPath())
                .toString().replace('\\', '/') + "/"
            zipOut.putNextEntry(ZipEntry(directoryPath))
            zipOut.closeEntry()
            return
        }
        for (file in files) {
            if (file.isDirectory) {
                compressFolder(rootFolder, file, zipOut)
            } else {
                val relativePath = rootFolder.toPath().relativize(file.toPath())
                    .toString().replace('\\', '/')
                val zipEntry = ZipEntry(relativePath)
                zipOut.putNextEntry(zipEntry)
                FileInputStream(file).use { input ->
                    input.copyTo(zipOut)
                }
                zipOut.closeEntry()
            }
        }
    }
}
