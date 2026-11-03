package com.wmdx.markdownapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

private const val DEFAULT_TEXT_PACK_MARKDOWN_ENTRY = "text.md"

data class TextPackSession(
    val sessionDir: File,
    var markdownContent: String,
    var sourceUri: Uri?,
    val markdownEntryPath: String = DEFAULT_TEXT_PACK_MARKDOWN_ENTRY
)

object TextPackManager {
    private const val MAX_ENTRIES = 4096
    private const val MAX_ENTRY_BYTES = 256L * 1024L * 1024L
    private const val MAX_TOTAL_BYTES = 512L * 1024L * 1024L
    private const val MAX_ASSET_BYTES = 256L * 1024L * 1024L
    private const val MARKDOWN_TYPE = "net.daringfireball.markdown"
    private const val PREVIEW_ASSET_BASE_URL =
        "https://appassets.androidplatform.net/textpack-assets"

    fun isTextPackFile(context: Context, uri: Uri, fileName: String): Boolean {
        if (fileName.endsWith(".textpack", ignoreCase = true) || fileName.endsWith(".textpack.zip", ignoreCase = true)) {
            return true
        }
        return try {
            context.contentResolver.openInputStream(uri)?.use { inputStream ->
                ZipInputStream(inputStream).use { zip ->
                    var foundTextEntry = false
                    var foundInfoEntry = false
                    while (true) {
                        val entry = zip.nextEntry ?: break
                        if (!entry.isDirectory) {
                            val path = runCatching {
                                safeArchivePath(entry.name)
                            }.getOrNull()
                            if (path != null && '/' !in path) {
                                if (isTextDocumentPath(path)) foundTextEntry = true
                                if (path.equals("info.json", ignoreCase = true)) foundInfoEntry = true
                            }
                        }
                        zip.closeEntry()
                    }
                    foundTextEntry && foundInfoEntry
                }
            } ?: false
        } catch (e: Exception) {
            false
        }
    }

    fun openTextPack(context: Context, uri: Uri): TextPackSession {
        val sessionDir = createSessionDirectory(context)
        try {
            val inputStream = context.contentResolver.openInputStream(uri)
                ?: throw IOException("Could not read the selected TextPack.")
            val markdownEntryPath = inputStream.use { extractArchive(it, sessionDir) }
            ensureInfoFile(sessionDir)
            val markdownFile = resolveSessionFile(sessionDir, markdownEntryPath)
            return TextPackSession(
                sessionDir = sessionDir,
                markdownContent = markdownFile.readText(Charsets.UTF_8),
                sourceUri = uri,
                markdownEntryPath = markdownEntryPath
            )
        } catch (error: Exception) {
            sessionDir.deleteRecursively()
            if (error is IOException) throw error
            throw IOException("Could not open the TextPack.", error)
        }
    }

    fun createTextPackSession(context: Context): TextPackSession {
        val sessionDir = createSessionDirectory(context)
        return try {
            resolveSessionFile(sessionDir, DEFAULT_TEXT_PACK_MARKDOWN_ENTRY)
                .writeText("", Charsets.UTF_8)
            ensureInfoFile(sessionDir)
            TextPackSession(sessionDir, "", null, DEFAULT_TEXT_PACK_MARKDOWN_ENTRY)
        } catch (error: Exception) {
            sessionDir.deleteRecursively()
            if (error is IOException) throw error
            throw IOException("Could not create a TextPack workspace.", error)
        }
    }

    internal fun extractArchive(inputStream: InputStream, sessionDir: File): String {
        if (!sessionDir.exists() && !sessionDir.mkdirs()) {
            throw IOException("Could not create the temporary TextPack workspace.")
        }

        val seenPaths = HashSet<String>()
        var entryCount = 0
        var totalBytes = 0L
        ZipInputStream(inputStream).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                entryCount += 1
                if (entryCount > MAX_ENTRIES) {
                    throw IOException("The TextPack contains too many files.")
                }

                val isDirectory = entry.isDirectory ||
                    entry.name.endsWith("/") ||
                    entry.name.endsWith("\\")
                val rawPath = if (isDirectory) entry.name.trimEnd('/', '\\') else entry.name
                val archivePath = safeArchivePath(rawPath)
                val duplicateKey = Normalizer.normalize(archivePath, Normalizer.Form.NFC)
                if (!seenPaths.add(duplicateKey)) {
                    throw IOException("The TextPack contains duplicate archive paths.")
                }

                val target = resolveSessionFile(sessionDir, archivePath)
                if (isDirectory) {
                    if (!target.exists() && !target.mkdirs()) {
                        throw IOException("Could not unpack the TextPack.")
                    }
                } else {
                    target.parentFile?.let { parent ->
                        if (!parent.exists() && !parent.mkdirs()) {
                            throw IOException("Could not unpack the TextPack.")
                        }
                    }
                    var entryBytes = 0L
                    FileOutputStream(target).use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val read = zip.read(buffer)
                            if (read < 0) break
                            entryBytes += read
                            totalBytes += read
                            if (entryBytes > MAX_ENTRY_BYTES || totalBytes > MAX_TOTAL_BYTES) {
                                throw IOException("The TextPack is too large to open.")
                            }
                            output.write(buffer, 0, read)
                        }
                    }
                }
                zip.closeEntry()
            }
        }

        if (entryCount == 0) {
            throw IOException("The selected file is not a valid TextPack ZIP archive.")
        }
        return selectMarkdownEntry(sessionDir)
    }

    internal fun selectMarkdownEntry(sessionDir: File): String {
        val entries = sessionDir.walkTopDown()
            .filter { it.isFile }
            .map { file -> relativePath(sessionDir, file) to file }
            .filter { (path, _) ->
                isTextDocumentPath(path) && !path.startsWith("assets/", ignoreCase = true)
            }
            .toList()
        val rootEntries = entries.filter { (path, _) -> '/' !in path }
        val candidates = if (rootEntries.isNotEmpty()) rootEntries else entries
        if (candidates.isEmpty()) {
            throw IOException("The TextPack does not contain a text.* document.")
        }

        val populatedEntries = candidates.filter { (_, file) ->
            containsNonWhitespaceText(file)
        }
        if (populatedEntries.size == 1) return populatedEntries.single().first
        if (populatedEntries.size > 1) {
            throw IOException(
                "The TextPack contains multiple non-empty text.* documents, so its document is ambiguous."
            )
        }

        return candidates.firstOrNull { (path, _) ->
            path.equals(DEFAULT_TEXT_PACK_MARKDOWN_ENTRY, ignoreCase = true)
        }?.first ?: candidates.minBy { it.first }.first
    }

    fun addAssetImage(
        session: TextPackSession,
        imageInputStream: InputStream,
        originalFileName: String?,
        mimeType: String? = null
    ): String = addAssetFileWithName(
        session,
        imageInputStream,
        safeImageFileName(originalFileName, mimeType)
    )

    fun addAssetFile(
        session: TextPackSession,
        inputStream: InputStream,
        originalFileName: String?
    ): String = addAssetFileWithName(
        session,
        inputStream,
        safeAssetFileName(originalFileName)
    )

    private fun addAssetFileWithName(
        session: TextPackSession,
        inputStream: InputStream,
        safeName: String
    ): String = synchronized(session) {
        val assetsDir = resolveSessionFile(session.sessionDir, "assets")
        if (!assetsDir.exists() && !assetsDir.mkdirs()) {
            throw IOException("Could not create the TextPack assets folder.")
        }

        val assetName = uniqueAssetName(assetsDir, safeName)
        val assetPath = "assets/$assetName"
        val targetFile = resolveSessionFile(session.sessionDir, assetPath)
        var bytesCopied = 0L
        try {
            inputStream.use { source ->
                FileOutputStream(targetFile).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        bytesCopied += read
                        if (bytesCopied > MAX_ASSET_BYTES) {
                            throw IOException("This file is too large to add to the TextPack.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }
            if (bytesCopied == 0L) {
                throw IOException("The selected file is empty.")
            }
        } catch (error: Exception) {
            targetFile.delete()
            if (error is IOException) throw error
            throw IOException("Could not add the file to the TextPack.", error)
        }

        encodeArchivePath(assetPath)
    }

    fun saveTextPack(context: Context, session: TextPackSession, markdownContent: String, targetUri: Uri) {
        synchronized(session) {
            val markdownEntryPath = safeArchivePath(session.markdownEntryPath)
            if (!isTextDocumentPath(markdownEntryPath)) {
                throw IOException("The TextPack document path must use the text.* name.")
            }
            val markdownFile = resolveSessionFile(session.sessionDir, markdownEntryPath)
            markdownFile.parentFile?.let { parent ->
                if (!parent.exists() && !parent.mkdirs()) {
                    throw IOException("Could not write the TextPack document.")
                }
            }
            markdownFile.writeText(markdownContent, Charsets.UTF_8)
            ensureInfoFile(session.sessionDir)

            val stagedArchive = File.createTempFile("textpack-save-", ".textpack", context.cacheDir)
            try {
                writeSessionArchive(session.sessionDir, markdownEntryPath, stagedArchive)
                verifyStagedArchive(stagedArchive, markdownEntryPath)

                val output = context.contentResolver.openOutputStream(targetUri, "rwt")
                    ?: throw IOException("Could not open the TextPack for writing.")
                output.use { outputStream ->
                    val copiedBytes = FileInputStream(stagedArchive).use { it.copyTo(outputStream) }
                    if (copiedBytes != stagedArchive.length()) {
                        throw IOException("The complete TextPack could not be written.")
                    }
                    outputStream.flush()
                }
            } finally {
                stagedArchive.delete()
            }

            session.sourceUri = targetUri
            session.markdownContent = markdownContent
        }
    }

    internal fun resolveAssetFile(session: TextPackSession, markdownReference: String): File? {
        val archivePath = assetArchivePath(markdownReference) ?: return null
        return runCatching { resolveSessionFile(session.sessionDir, archivePath) }
            .getOrNull()
            ?.takeIf { it.isFile }
    }

    internal fun previewAssetUrl(session: TextPackSession, markdownReference: String): String? {
        val archivePath = assetArchivePath(markdownReference) ?: return null
        if (resolveAssetFile(session, markdownReference) == null) return null
        val encodedSession = encodeUriSegment(session.sessionDir.name)
        return "$PREVIEW_ASSET_BASE_URL/$encodedSession/${encodeArchivePath(archivePath)}"
    }

    internal fun safeArchivePath(rawPath: String): String {
        val normalized = rawPath.replace('\\', '/')
        if (
            normalized.isBlank() ||
            normalized.startsWith("/") ||
            Regex("^[A-Za-z]:").containsMatchIn(normalized)
        ) {
            throw IOException("The TextPack contains an unsafe archive path.")
        }
        val segments = normalized.split('/').filter { it.isNotEmpty() && it != "." }
        if (
            segments.isEmpty() ||
            segments.any { segment ->
                segment == ".." || segment.any { Character.isISOControl(it) }
            }
        ) {
            throw IOException("The TextPack contains an unsafe archive path.")
        }
        return segments.joinToString("/")
    }

    internal fun writeSessionArchive(sessionDir: File, markdownEntryPath: String, archiveFile: File) {
        val selectedMarkdownPath = safeArchivePath(markdownEntryPath)
        val root = sessionDir.canonicalFile
        val files = sessionDir.walkTopDown()
            .filter { it.isFile }
            .map { file -> relativePath(sessionDir, file) to file }
            .filter { (path, _) ->
                !isRootTextDocumentPath(path) || path == selectedMarkdownPath
            }
            .sortedBy { it.first }

        ZipOutputStream(FileOutputStream(archiveFile)).use { zip ->
            for ((relative, file) in files) {
                val path = safeArchivePath(relative)
                val canonicalFile = file.canonicalFile
                if (!canonicalFile.path.startsWith(root.path + File.separator)) {
                    throw IOException("A TextPack file resolves outside its workspace.")
                }
                zip.putNextEntry(ZipEntry(path))
                FileInputStream(file).use { it.copyTo(zip) }
                zip.closeEntry()
            }
            zip.finish()
        }
    }

    internal fun verifyStagedArchive(archiveFile: File, markdownEntryPath: String) {
        ZipFile(archiveFile).use { zip ->
            if (zip.getEntry("info.json") == null) {
                throw IOException("The saved TextPack is missing info.json.")
            }
            if (zip.getEntry(safeArchivePath(markdownEntryPath)) == null) {
                throw IOException("The saved TextPack is missing its text.* document.")
            }
        }
    }

    private fun createSessionDirectory(context: Context): File {
        val parent = File(context.cacheDir, "textpack_sessions")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Could not create the temporary TextPack workspace.")
        }
        val sessionDir = File(parent, "session_${UUID.randomUUID()}")
        if (!sessionDir.mkdirs()) {
            throw IOException("Could not create the temporary TextPack workspace.")
        }
        return sessionDir
    }

    private fun ensureInfoFile(sessionDir: File) {
        val infoFile = resolveSessionFile(sessionDir, "info.json")
        if (!infoFile.exists()) {
            val metadata = JSONObject()
                .put("version", 2)
                .put("type", MARKDOWN_TYPE)
                .put("transient", false)
            infoFile.writeText(metadata.toString(2), Charsets.UTF_8)
            return
        }

        val metadata = try {
            JSONObject(infoFile.readText(Charsets.UTF_8))
        } catch (error: Exception) {
            throw IOException("The TextPack info.json file is invalid.", error)
        }
        val version = metadata.optInt("version", 2)
        if (version !in 1..2) {
            throw IOException("This TextPack uses an unsupported format version.")
        }
        if (!metadata.has("version")) metadata.put("version", 2)
        if (version >= 2 && !metadata.has("type")) metadata.put("type", MARKDOWN_TYPE)
        infoFile.writeText(metadata.toString(2), Charsets.UTF_8)
    }

    private fun imageExtensionForMimeType(mimeType: String?): String? =
        when (mimeType?.substringBefore(';')?.trim()?.lowercase()) {
            "image/jpeg", "image/jpg" -> "jpg"
            "image/png" -> "png"
            "image/gif" -> "gif"
            "image/webp" -> "webp"
            "image/svg+xml" -> "svg"
            "image/bmp" -> "bmp"
            "image/heic" -> "heic"
            "image/heif" -> "heif"
            "image/tiff" -> "tif"
            "image/avif" -> "avif"
            else -> null
        }

    private fun containsNonWhitespaceText(file: File): Boolean =
        file.inputStream().bufferedReader(Charsets.UTF_8).use { reader ->
            var char = reader.read()
            while (char >= 0) {
                if (!Character.isWhitespace(char.toChar())) return@use true
                char = reader.read()
            }
            false
        }

    internal fun safeAssetFileName(
        originalFileName: String?,
        fallbackName: String = "asset"
    ): String {
        var baseName = originalFileName
            ?.replace('\\', '/')
            ?.substringAfterLast('/')
            ?.filterNot { Character.isISOControl(it) || it == '/' || it == '\\' }
            ?.trim()
            .orEmpty()
        if (baseName.isBlank() || baseName == "." || baseName == "..") baseName = fallbackName

        if (baseName.length > 180) {
            val extensionStart = baseName.lastIndexOf('.').takeIf { it > 0 } ?: baseName.length
            val extension = baseName.substring(extensionStart)
            baseName = baseName.substring(0, (180 - extension.length).coerceAtLeast(1)) + extension
        }
        return baseName
    }

    internal fun safeImageFileName(originalFileName: String?, mimeType: String?): String {
        var baseName = safeAssetFileName(originalFileName, "image")
        if (baseName.lastIndexOf('.') <= 0) {
            imageExtensionForMimeType(mimeType)?.let { baseName = "$baseName.$it" }
        }
        if (baseName.length > 180) {
            val extensionStart = baseName.lastIndexOf('.').takeIf { it > 0 } ?: baseName.length
            val extension = baseName.substring(extensionStart)
            baseName = baseName.substring(0, (180 - extension.length).coerceAtLeast(1)) + extension
        }
        return baseName
    }

    private fun uniqueAssetName(assetsDir: File, baseName: String): String {
        if (!File(assetsDir, baseName).exists()) return baseName
        val extensionIndex = baseName.lastIndexOf('.').takeIf { it > 0 } ?: baseName.length
        val stem = baseName.substring(0, extensionIndex)
        val extension = baseName.substring(extensionIndex)
        var suffix = 2
        while (File(assetsDir, "$stem-$suffix$extension").exists()) suffix += 1
        return "$stem-$suffix$extension"
    }

    private fun assetArchivePath(markdownReference: String): String? {
        val path = markdownReference.trim().substringBefore('#').substringBefore('?')
        if (
            path.isBlank() ||
            path.startsWith("//") ||
            Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(path)
        ) {
            return null
        }
        val decoded = try {
            URLDecoder.decode(path.replace("+", "%2B"), StandardCharsets.UTF_8.name())
        } catch (_: IllegalArgumentException) {
            return null
        }
        val safePath = runCatching { safeArchivePath(decoded) }.getOrNull() ?: return null
        return safePath.takeIf { it.startsWith("assets/") && it.length > "assets/".length }
    }

    private fun resolveSessionFile(sessionDir: File, archivePath: String): File {
        val safePath = safeArchivePath(archivePath)
        val root = sessionDir.canonicalFile
        val target = File(root, safePath).canonicalFile
        if (!target.path.startsWith(root.path + File.separator)) {
            throw IOException("The TextPack path resolves outside its workspace.")
        }
        return target
    }

    private fun relativePath(root: File, file: File): String =
        root.toPath().relativize(file.toPath()).toString().replace(File.separatorChar, '/')

    private fun isTextDocumentPath(path: String): Boolean {
        val name = path.substringAfterLast('/')
        return name.startsWith("text.", ignoreCase = true) && name.length > "text.".length
    }

    private fun isRootTextDocumentPath(path: String): Boolean =
        '/' !in path && isTextDocumentPath(path)

    private fun encodeArchivePath(path: String): String =
        path.split('/').joinToString("/") { encodeUriSegment(it) }

    private fun encodeUriSegment(segment: String): String =
        URLEncoder.encode(segment, StandardCharsets.UTF_8.name())
            .replace("+", "%20")
            .replace("%7E", "~")

}
