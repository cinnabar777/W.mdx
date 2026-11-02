package com.wmdx.markdownapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import org.json.JSONTokener
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.text.Normalizer
import java.util.UUID
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

data class MdzipSession(
    val sessionDir: File,
    val entryPoint: String,
    val manifest: JSONObject,
    var markdownContent: String,
    var sourceUri: Uri?,
    val pendingAudioDeletions: MutableSet<String> = linkedSetOf(),
    val pendingVideoDeletions: MutableSet<String> = linkedSetOf(),
    val originalArchivePaths: MutableMap<String, String> = linkedMapOf(),
    val originalDirectoryPaths: MutableMap<String, String> = linkedMapOf()
)

internal data class MdzipArchiveContents(
    val entryPoint: String,
    val manifest: JSONObject,
    val markdownContent: String,
    val originalArchivePaths: MutableMap<String, String>,
    val originalDirectoryPaths: MutableMap<String, String>
)

object MdzipManager {
    const val MIME_TYPE = "application/vnd.mdzip"
    private const val MANIFEST_NAME = "manifest.json"
    private const val DEFAULT_ENTRY_POINT = "index.md"
    private const val SPEC_VERSION = "1.2.1"
    private const val MAX_ENTRIES = 4096
    private const val MAX_ENTRY_BYTES = 256L * 1024L * 1024L
    private const val MAX_TOTAL_BYTES = 512L * 1024L * 1024L
    private const val MAX_ARCHIVE_BYTES = MAX_TOTAL_BYTES + 16L * 1024L * 1024L
    private const val MAX_COMPRESSION_RATIO = 1000.0
    private const val MAX_AUDIO_BYTES = 256L * 1024L * 1024L
    private const val MAX_VIDEO_BYTES = 256L * 1024L * 1024L
    private const val MAX_ATTACHMENT_BYTES = 256L * 1024L * 1024L
    private const val ASSET_BASE_URL = "https://appassets.androidplatform.net/mdzip-assets"
    private val RESERVED_PATH_CHARACTERS = setOf(':', '*', '?', '"', '<', '>', '|')
    private val SEMVER_PATTERN = Regex(
        """^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"""
    )
    private val SUPPORTED_AUDIO_EXTENSIONS =
        setOf("mp3", "aac", "m4a", "wav", "flac", "opus", "ogg", "oga")
    private val SUPPORTED_VIDEO_EXTENSIONS =
        setOf("mp4", "m4v", "webm", "3gp", "mov", "mkv", "avi", "mpeg", "mpg", "ogv", "wmv")

    fun isMdzipFileName(fileName: String): Boolean =
        fileName.endsWith(".mdz", ignoreCase = true)

    fun normalizeDuplicateMdzipFileName(fileName: String): String? {
        val match = Regex(
            "^(.*)\\.mdz\\s*\\((\\d+)\\)$",
            RegexOption.IGNORE_CASE
        ).matchEntire(fileName) ?: return null
        val baseName = match.groupValues[1].trimEnd()
        if (baseName.isBlank()) return null
        return "$baseName (${match.groupValues[2]}).mdz"
    }

    fun open(context: Context, uri: Uri): MdzipSession {
        val parent = File(context.cacheDir, "mdzip_sessions")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Could not create the temporary MDZip workspace.")
        }
        val sessionDir = File(parent, "session_${UUID.randomUUID()}")
        if (!sessionDir.mkdirs()) {
            throw IOException("Could not create the temporary MDZip workspace.")
        }

        var stagedArchive: File? = null
        try {
            val sourceArchive = File.createTempFile("mdzip-source-", ".mdz", parent)
            stagedArchive = sourceArchive
            val input = context.contentResolver.openInputStream(uri)
                ?: throw IOException("Could not read the selected MDZip file.")
            var archiveBytes = 0L
            input.use { source ->
                FileOutputStream(sourceArchive).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        archiveBytes += read
                        if (archiveBytes > MAX_ARCHIVE_BYTES) {
                            throw IOException("The MDZip archive is too large to open.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }
            val contents = loadArchive(sourceArchive, sessionDir)
            return MdzipSession(
                sessionDir = sessionDir,
                entryPoint = contents.entryPoint,
                manifest = contents.manifest,
                markdownContent = contents.markdownContent,
                sourceUri = uri,
                originalArchivePaths = contents.originalArchivePaths,
                originalDirectoryPaths = contents.originalDirectoryPaths
            )
        } catch (error: Exception) {
            sessionDir.deleteRecursively()
            throw error
        } finally {
            stagedArchive?.delete()
        }
    }

    internal fun loadArchive(archiveFile: File, sessionDir: File): MdzipArchiveContents {
        val seenEntries = linkedMapOf<String, Boolean>()
        val originalArchivePaths = linkedMapOf<String, String>()
        val originalDirectoryPaths = linkedMapOf<String, String>()
        var totalBytes = 0L
        var entryCount = 0

        ZipFile(archiveFile, Charsets.UTF_8).use { archive ->
            val entries = archive.entries()
            while (entries.hasMoreElements()) {
                val entry = entries.nextElement()
                entryCount += 1
                if (entryCount > MAX_ENTRIES) {
                    throw IOException("The MDZip package contains too many files.")
                }
                if (entry.method != ZipEntry.STORED && entry.method != ZipEntry.DEFLATED) {
                    throw IOException("The MDZip package uses an unsupported ZIP compression method.")
                }

                val rawName = entry.name
                val isDirectory = entry.isDirectory || rawName.endsWith("/")
                if (isDirectory && entry.size != 0L) {
                    throw IOException("The MDZip package contains a non-empty directory entry.")
                }
                val path = safeArchivePath(
                    if (isDirectory) rawName.removeSuffix("/") else rawName
                )
                registerArchiveEntry(path, isDirectory, seenEntries)
                if (isDirectory) {
                    originalDirectoryPaths[path] = rawName.removeSuffix("/")
                } else {
                    originalArchivePaths[path] = rawName
                }
                val target = resolveArchiveFile(sessionDir, path)
                if (isDirectory) {
                    if (!target.exists() && !target.mkdirs()) {
                        throw IOException("Could not unpack the MDZip package.")
                    }
                    if (!target.isDirectory) {
                        throw IOException("The MDZip package contains a file and directory path conflict.")
                    }
                    continue
                }

                val expectedBytes = entry.size
                val compressedBytes = entry.compressedSize
                if (
                    expectedBytes < 0L ||
                    compressedBytes < 0L ||
                    expectedBytes > MAX_ENTRY_BYTES ||
                    totalBytes + expectedBytes > MAX_TOTAL_BYTES
                ) {
                    throw IOException("The MDZip package is too large or has invalid entry sizes.")
                }
                if (
                    expectedBytes > 0L &&
                    (compressedBytes == 0L ||
                        expectedBytes.toDouble() / compressedBytes > MAX_COMPRESSION_RATIO)
                ) {
                    throw IOException("The MDZip package has an excessive compression ratio.")
                }
                totalBytes += expectedBytes

                target.parentFile?.let { parent ->
                    if (!parent.exists() && !parent.mkdirs()) {
                        throw IOException("Could not unpack the MDZip package.")
                    }
                    if (!parent.isDirectory) {
                        throw IOException("The MDZip package contains a file and directory path conflict.")
                    }
                }
                var entryBytes = 0L
                val checksum = CRC32()
                archive.getInputStream(entry).use { source ->
                    FileOutputStream(target).use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val read = source.read(buffer)
                            if (read < 0) break
                            entryBytes += read
                            if (entryBytes > MAX_ENTRY_BYTES || entryBytes > expectedBytes) {
                                throw IOException("The MDZip package is too large or has invalid entry data.")
                            }
                            checksum.update(buffer, 0, read)
                            output.write(buffer, 0, read)
                        }
                    }
                }
                if (entryBytes != expectedBytes || checksum.value != entry.crc) {
                    throw IOException("The MDZip package contains a damaged ZIP entry.")
                }
            }
        }

        val manifestFile = resolveArchiveFile(sessionDir, MANIFEST_NAME)
        if (manifestFile.exists() && !manifestFile.isFile) {
            throw IOException("The MDZip manifest path is not a file.")
        }
        val manifest = if (manifestFile.isFile) {
            parseManifest(manifestFile.readBytes())
        } else {
            JSONObject()
        }
        validateManifest(manifest)
        val entryPoint = resolveEntryPoint(sessionDir, manifest)
        val entryFile = resolveArchiveFile(sessionDir, entryPoint)
        if (!entryFile.isFile) {
            throw IOException("The MDZip entry-point file is missing.")
        }
        val markdownContent = decodeUtf8(
            entryFile.readBytes(),
            "The MDZip entry-point file is not valid UTF-8."
        ).removePrefix("\uFEFF")
        prepareManifestForSave(manifest, entryPoint)
        return MdzipArchiveContents(
            entryPoint,
            manifest,
            markdownContent,
            originalArchivePaths,
            originalDirectoryPaths
        )
    }

    private fun registerArchiveEntry(
        path: String,
        isDirectory: Boolean,
        seenEntries: MutableMap<String, Boolean>
    ) {
        if (seenEntries.containsKey(path)) {
            throw IOException("The MDZip package has duplicate paths after NFC normalization.")
        }
        var parent = path.substringBeforeLast('/', "")
        while (parent.isNotEmpty()) {
            if (seenEntries[parent] == false) {
                throw IOException("The MDZip package contains a file and directory path conflict.")
            }
            parent = parent.substringBeforeLast('/', "")
        }
        if (!isDirectory && seenEntries.keys.any { it.startsWith("$path/") }) {
            throw IOException("The MDZip package contains a file and directory path conflict.")
        }
        seenEntries[path] = isDirectory
    }

    private fun parseManifest(bytes: ByteArray): JSONObject {
        return try {
            val text = decodeUtf8(bytes, "The MDZip manifest is not valid UTF-8.")
                .removePrefix("\uFEFF")
            val tokener = JSONTokener(text)
            val value = tokener.nextValue()
            if (value !is JSONObject || tokener.nextClean() != '\u0000') {
                throw IOException("The MDZip manifest is invalid.")
            }
            value
        } catch (error: Exception) {
            if (error is IOException) throw error
            throw IOException("The MDZip manifest is invalid.", error)
        }
    }

    private fun decodeUtf8(bytes: ByteArray, errorMessage: String): String =
        try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString()
        } catch (error: Exception) {
            throw IOException(errorMessage, error)
        }

    fun create(context: Context, markdown: String, targetName: String): MdzipSession {
        val parent = File(context.cacheDir, "mdzip_sessions")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Could not create the temporary MDZip workspace.")
        }
        val sessionDir = File(parent, "session_${UUID.randomUUID()}")
        if (!sessionDir.mkdirs()) {
            throw IOException("Could not create the temporary MDZip workspace.")
        }

        val manifest = JSONObject().apply {
            put("spec", JSONObject().put("name", "mdzip-spec").put("version", SPEC_VERSION))
            put("title", titleFromFileName(targetName))
            put("mode", "document")
            put("entryPoint", DEFAULT_ENTRY_POINT)
        }
        resolveArchiveFile(sessionDir, DEFAULT_ENTRY_POINT).writeText(markdown, Charsets.UTF_8)
        resolveArchiveFile(sessionDir, MANIFEST_NAME).writeText(manifest.toString(2), Charsets.UTF_8)
        return MdzipSession(sessionDir, DEFAULT_ENTRY_POINT, manifest, markdown, null)
    }

    fun save(context: Context, session: MdzipSession, markdown: String, targetUri: Uri) {
        synchronized(session) {
            val entryFile = resolveArchiveFile(session.sessionDir, session.entryPoint)
            entryFile.parentFile?.let { parent ->
                if (!parent.exists() && !parent.mkdirs()) {
                    throw IOException("Could not write the MDZip entry-point file.")
                }
            }
            entryFile.writeText(markdown, Charsets.UTF_8)
            resolveArchiveFile(session.sessionDir, MANIFEST_NAME)
                .writeText(session.manifest.toString(2), Charsets.UTF_8)

            val pendingDeletions = session.pendingAudioDeletions + session.pendingVideoDeletions
            val stagedArchive = File.createTempFile("mdzip-save-", ".mdz", context.cacheDir)
            try {
                writeSessionArchive(
                    session.sessionDir,
                    pendingDeletions,
                    stagedArchive,
                    session.originalArchivePaths,
                    session.originalDirectoryPaths
                )
                verifyStagedArchive(stagedArchive)

                val output = context.contentResolver.openOutputStream(targetUri, "rwt")
                    ?: throw IOException("Could not open the selected file for writing.")
                output.use { stream ->
                    val copiedBytes = FileInputStream(stagedArchive).use { it.copyTo(stream) }
                    if (copiedBytes != stagedArchive.length()) {
                        throw IOException("The complete MDZip package could not be written.")
                    }
                    stream.flush()
                }
            } finally {
                stagedArchive.delete()
            }
            session.markdownContent = markdown
            session.sourceUri = targetUri
        }
    }

    internal fun writeSessionArchive(
        sessionDir: File,
        pendingDeletions: Set<String>,
        archiveFile: File,
        originalArchivePaths: Map<String, String> = emptyMap(),
        originalDirectoryPaths: Map<String, String> = emptyMap()
    ) {
        ZipOutputStream(BufferedOutputStream(FileOutputStream(archiveFile))).use { zip ->
            for ((normalizedPath, storedPath) in originalDirectoryPaths.toSortedMap()) {
                if (safeArchivePath(storedPath) != normalizedPath) {
                    throw IOException("An original MDZip directory path could not be preserved.")
                }
                zip.putNextEntry(ZipEntry("$storedPath/"))
                zip.closeEntry()
            }
            val files = sessionDir.walkTopDown()
                .filter { it.isFile }
                .filter { file ->
                    val name = sessionDir.toPath()
                        .relativize(file.toPath())
                        .toString()
                        .replace(File.separatorChar, '/')
                    name !in pendingDeletions
                }
                .sortedBy { sessionDir.toPath().relativize(it.toPath()).toString() }
            for (file in files) {
                val relativeName = sessionDir.toPath()
                    .relativize(file.toPath())
                    .toString()
                    .replace(File.separatorChar, '/')
                val normalizedPath = safeArchivePath(relativeName)
                if (normalizedPath in originalDirectoryPaths) {
                    throw IOException("The MDZip package contains a file and directory path conflict.")
                }
                val path = originalArchivePaths[normalizedPath] ?: normalizedPath
                if (safeArchivePath(path) != normalizedPath) {
                    throw IOException("An original MDZip file path could not be preserved.")
                }
                val entry = ZipEntry(path)
                if (
                    path.startsWith("video/") ||
                    (path.startsWith("attachments/") &&
                        (isSupportedVideoFileName(path) || isSupportedAudioFileName(path)))
                ) {
                    val size = file.length()
                    val crc = CRC32()
                    FileInputStream(file).use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            crc.update(buffer, 0, read)
                        }
                    }
                    entry.method = ZipEntry.STORED
                    entry.size = size
                    entry.compressedSize = size
                    entry.crc = crc.value
                }
                zip.putNextEntry(entry)
                FileInputStream(file).use { it.copyTo(zip) }
                zip.closeEntry()
            }
            zip.finish()
        }
    }

    internal fun verifyStagedArchive(archiveFile: File) {
        ZipFile(archiveFile).use { archive ->
            if (archive.size() == 0) {
                throw IOException("The staged MDZip archive is empty.")
            }
        }
    }

    fun isSupportedAudioFileName(fileName: String): Boolean {
        val basename = fileName.substringAfterLast('/').substringAfterLast('\\')
        val extension = basename.substringAfterLast('.', "").lowercase()
        return extension in SUPPORTED_AUDIO_EXTENSIONS
    }

    fun isSupportedVideoFileName(fileName: String): Boolean {
        val basename = fileName.substringAfterLast('/').substringAfterLast('\\')
        val extension = basename.substringAfterLast('.', "").lowercase()
        return extension in SUPPORTED_VIDEO_EXTENSIONS
    }

    fun addAudio(session: MdzipSession, input: InputStream, originalName: String): String {
        val basename = originalName.substringAfterLast('/').substringAfterLast('\\')
        if (!isSupportedAudioFileName(basename)) {
            throw IOException("Choose an MP3, AAC, M4A, WAV, FLAC, Opus, OGG, or OGA audio file.")
        }
        val cleanName = sanitizeAudioFileName(basename)
        val extension = cleanName.substringAfterLast('.', "")
        val stem = cleanName.removeSuffix(".$extension").ifBlank { "audio" }
        val candidateName = uniqueAudioName(
            session.sessionDir,
            stem,
            extension,
            session.originalArchivePaths,
            session.originalDirectoryPaths
        )
        val archivePath = "audio/$candidateName"
        val target = resolveArchiveFile(session.sessionDir, archivePath)
        target.parentFile?.let {
            if (!it.exists() && !it.mkdirs()) throw IOException("Could not create the audio folder.")
        }

        var bytesCopied = 0L
        input.use { source ->
            FileOutputStream(target).use { output ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = source.read(buffer)
                    if (read < 0) break
                    bytesCopied += read
                    if (bytesCopied > MAX_AUDIO_BYTES) {
                        target.delete()
                        throw IOException("This audio file is too large to add to the MDZip package.")
                    }
                    output.write(buffer, 0, read)
                }
            }
        }
        return relativeMarkdownPath(session.entryPoint, archivePath)
    }

    fun addVideo(session: MdzipSession, input: InputStream, originalName: String): String {
        val basename = originalName.substringAfterLast('/').substringAfterLast('\\')
        if (!isSupportedVideoFileName(basename)) {
            throw IOException("Choose an MP4, M4V, WebM, 3GP, MOV, MKV, AVI, MPEG, MPG, OGV, or WMV video file.")
        }
        val cleanName = sanitizeVideoFileName(basename)
        val extension = cleanName.substringAfterLast('.', "")
        val stem = cleanName.removeSuffix(".$extension").ifBlank { "video" }
        val candidateName = uniqueVideoName(
            session.sessionDir,
            stem,
            extension,
            session.originalArchivePaths,
            session.originalDirectoryPaths
        )
        val archivePath = "video/$candidateName"
        val target = resolveArchiveFile(session.sessionDir, archivePath)
        target.parentFile?.let {
            if (!it.exists() && !it.mkdirs()) throw IOException("Could not create the video folder.")
        }

        var bytesCopied = 0L
        input.use { source ->
            FileOutputStream(target).use { output ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = source.read(buffer)
                    if (read < 0) break
                    bytesCopied += read
                    if (bytesCopied > MAX_VIDEO_BYTES) {
                        target.delete()
                        throw IOException("This video file is too large to add to the MDZip package.")
                    }
                    output.write(buffer, 0, read)
                }
            }
        }
        if (bytesCopied == 0L) {
            target.delete()
            throw IOException("The selected video file is empty.")
        }
        return relativeMarkdownPath(session.entryPoint, archivePath)
    }

    fun addAttachment(session: MdzipSession, input: InputStream, originalName: String): String {
        return addAttachment(
            session.sessionDir,
            session.entryPoint,
            input,
            originalName,
            session.originalArchivePaths,
            session.originalDirectoryPaths
        )
    }

    internal fun addAttachment(
        sessionDir: File,
        entryPoint: String,
        input: InputStream,
        originalName: String,
        originalArchivePaths: Map<String, String> = emptyMap(),
        originalDirectoryPaths: Map<String, String> = emptyMap()
    ): String {
        val basename = originalName.substringAfterLast('/').substringAfterLast('\\')
        if (basename.isEmpty()) throw IOException("The selected file has no name.")
        val cleanName = sanitizeAttachmentFileName(basename)
        val candidateName = uniqueAttachmentName(
            sessionDir,
            cleanName,
            originalArchivePaths,
            originalDirectoryPaths
        )
        val archivePath = "attachments/$candidateName"
        val target = resolveArchiveFile(sessionDir, archivePath)
        val parent = target.parentFile
            ?: throw IOException("Could not create the attachments folder.")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Could not create the attachments folder.")
        }

        val currentBytes = sessionDir.walkTopDown()
            .filter { it.isFile }
            .sumOf { it.length() }
        val temporary = File.createTempFile(".attachment-", ".tmp", parent)
        try {
            var bytesCopied = 0L
            input.use { source ->
                FileOutputStream(temporary).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        bytesCopied += read
                        if (
                            bytesCopied > MAX_ATTACHMENT_BYTES ||
                            currentBytes + bytesCopied > MAX_TOTAL_BYTES
                        ) {
                            throw IOException("This file is too large to add to the MDZip package.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }
            if (bytesCopied == 0L) throw IOException("The selected file is empty.")
            if (!temporary.renameTo(target)) {
                throw IOException("Could not add the file to the MDZip package.")
            }
        } finally {
            temporary.delete()
        }
        return relativeMarkdownPath(entryPoint, archivePath)
    }

    fun replaceAudio(
        session: MdzipSession,
        markdownLink: String,
        input: InputStream,
        originalName: String
    ) {
        val target = resolveAudioFile(session, markdownLink)
            ?: throw IOException("The linked audio is no longer in this MDZip package.")
        val extension = originalName.substringAfterLast('.').lowercase()
        if (!isSupportedAudioFileName(originalName) || extension != target.extension.lowercase()) {
            throw IOException("Replacement audio must use the same supported format as the linked file.")
        }
        val temporary = File.createTempFile(
            "mdzip-audio-replacement-",
            ".$extension",
            target.parentFile
        )
        try {
            var bytesCopied = 0L
            input.use { source ->
                FileOutputStream(temporary).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        bytesCopied += read
                        if (bytesCopied > MAX_AUDIO_BYTES) {
                            throw IOException("This audio file is too large to add to the MDZip package.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }
            if (bytesCopied == 0L) throw IOException("The selected audio file is empty.")
            if (!temporary.renameTo(target)) {
                throw IOException("Could not replace the audio file inside the MDZip package.")
            }
        } finally {
            temporary.delete()
        }
    }

    fun resolveAudioArchivePath(session: MdzipSession, markdownLink: String): String? {
        val archivePath = resolveRelativeArchivePath(session.entryPoint, markdownLink) ?: return null
        return archivePath.takeIf { isSupportedAudioFileName(it) }
    }

    fun resolveAttachmentArchivePath(session: MdzipSession, markdownLink: String): String? {
        return resolveAttachmentArchivePath(session.entryPoint, markdownLink)
    }

    internal fun resolveAttachmentArchivePath(entryPoint: String, markdownLink: String): String? {
        val archivePath = resolveRelativeArchivePath(entryPoint, markdownLink) ?: return null
        return archivePath.takeIf { it.startsWith("attachments/") }
    }

    fun resolveAttachmentFile(session: MdzipSession, markdownLink: String): File? {
        val archivePath = resolveAttachmentArchivePath(session.entryPoint, markdownLink) ?: return null
        return attachmentArchiveFile(session, archivePath)
    }

    fun attachmentArchiveFile(session: MdzipSession, archivePath: String): File? {
        val safePath = runCatching { safeArchivePath(archivePath) }.getOrNull() ?: return null
        if (!safePath.startsWith("attachments/")) return null
        return runCatching { resolveArchiveFile(session.sessionDir, safePath) }
            .getOrNull()
            ?.takeIf { it.isFile }
    }

    fun assetArchiveFile(session: MdzipSession, archivePath: String): File? {
        val safePath = runCatching { safeArchivePath(archivePath) }.getOrNull() ?: return null
        return runCatching { resolveArchiveFile(session.sessionDir, safePath) }
            .getOrNull()
            ?.takeIf { it.isFile }
    }

    fun isSupportedImageFileName(fileName: String): Boolean =
        fileName.substringAfterLast('.', "").lowercase() in setOf(
            "avif",
            "bmp",
            "gif",
            "heic",
            "heif",
            "jpeg",
            "jpg",
            "png",
            "svg",
            "tif",
            "tiff",
            "webp"
        )

    fun attachmentUrl(session: MdzipSession, markdownLink: String): String? {
        val archivePath = resolveRelativeArchivePath(session.entryPoint, markdownLink) ?: return null
        if (!isSupportedImageFileName(archivePath)) return null
        if (assetArchiveFile(session, archivePath) == null) return null
        return "$ASSET_BASE_URL/${session.sessionDir.name}/${Uri.encode(archivePath, "/")}"
    }

    fun resolveAudioFile(session: MdzipSession, markdownLink: String): File? {
        val archivePath = resolveAudioArchivePath(session, markdownLink) ?: return null
        return audioArchiveFile(session, archivePath)
    }

    fun audioArchiveFile(session: MdzipSession, archivePath: String): File? {
        val safePath = runCatching { safeArchivePath(archivePath) }.getOrNull() ?: return null
        if (!isSupportedAudioFileName(safePath)) return null
        return runCatching { resolveArchiveFile(session.sessionDir, safePath) }
            .getOrNull()
            ?.takeIf { it.isFile }
    }

    fun audioUrl(session: MdzipSession, markdownLink: String): String? {
        val archivePath = resolveAudioArchivePath(session, markdownLink) ?: return null
        if (audioArchiveFile(session, archivePath) == null) return null
        return "$ASSET_BASE_URL/${session.sessionDir.name}/${Uri.encode(archivePath, "/")}"
    }

    fun removeAudio(session: MdzipSession, markdownLink: String): Boolean {
        val archivePath = resolveAudioArchivePath(session, markdownLink) ?: return false
        synchronized(session) {
            if (audioArchiveFile(session, archivePath) == null) return false
            session.pendingAudioDeletions.add(archivePath)
            return true
        }
    }

    fun syncAudioReferences(
        session: MdzipSession,
        previousLinks: Collection<String>,
        currentLinks: Collection<String>
    ) {
        val previousPaths = previousLinks.mapNotNull { resolveAudioArchivePath(session, it) }.toSet()
        val currentPaths = currentLinks.mapNotNull { resolveAudioArchivePath(session, it) }.toSet()
        synchronized(session) {
            for (path in previousPaths - currentPaths) {
                if (audioArchiveFile(session, path) != null) {
                    session.pendingAudioDeletions.add(path)
                }
            }
            session.pendingAudioDeletions.removeAll(currentPaths)
        }
    }

    fun resolveVideoArchivePath(session: MdzipSession, markdownLink: String): String? {
        val archivePath = resolveRelativeArchivePath(session.entryPoint, markdownLink) ?: return null
        return archivePath.takeIf { isSupportedVideoFileName(it) }
    }

    fun videoArchiveFile(session: MdzipSession, archivePath: String): File? {
        val safePath = runCatching { safeArchivePath(archivePath) }.getOrNull() ?: return null
        if (!isSupportedVideoFileName(safePath)) return null
        return runCatching { resolveArchiveFile(session.sessionDir, safePath) }
            .getOrNull()
            ?.takeIf { it.isFile }
    }

    fun videoUrl(session: MdzipSession, markdownLink: String): String? {
        val archivePath = resolveVideoArchivePath(session, markdownLink) ?: return null
        if (videoArchiveFile(session, archivePath) == null) return null
        return "$ASSET_BASE_URL/${session.sessionDir.name}/${Uri.encode(archivePath, "/")}"
    }

    fun syncVideoReferences(
        session: MdzipSession,
        previousLinks: Collection<String>,
        currentLinks: Collection<String>
    ) {
        val previousPaths = previousLinks.mapNotNull { resolveVideoArchivePath(session, it) }.toSet()
        val currentPaths = currentLinks.mapNotNull { resolveVideoArchivePath(session, it) }.toSet()
        synchronized(session) {
            for (path in previousPaths - currentPaths) {
                if (videoArchiveFile(session, path) != null) {
                    session.pendingVideoDeletions.add(path)
                }
            }
            session.pendingVideoDeletions.removeAll(currentPaths)
        }
    }

    internal fun safeArchivePath(rawPath: String): String {
        val normalizedPath = Normalizer.normalize(rawPath, Normalizer.Form.NFC)
        if (
            normalizedPath.isEmpty() ||
            normalizedPath.startsWith("/") ||
            normalizedPath.endsWith("/") ||
            normalizedPath.contains('\\')
        ) {
            throw IOException("The MDZip package contains an unsafe file path.")
        }
        val parts = normalizedPath.split('/')
        if (parts.any { it.isEmpty() || it == "." || it == ".." }) {
            throw IOException("The MDZip package contains an unsafe file path.")
        }
        if (parts.any { part ->
                part.any { character ->
                    character.code < 0x20 ||
                        character.code == 0x7f ||
                        character in RESERVED_PATH_CHARACTERS
                }
            }
        ) {
            throw IOException("The MDZip package contains an unsafe file path.")
        }
        return parts.joinToString("/")
    }

    internal fun resolveRelativeArchivePath(entryPoint: String, markdownLink: String): String? {
        val target = markdownLink.trim().removePrefix("<").removeSuffix(">")
        if (target.startsWith("/") || target.contains('\\')) return null
        if (Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(target)) return null

        val safeEntryPoint = runCatching { safeArchivePath(entryPoint) }.getOrNull() ?: return null
        if (target.isEmpty()) return safeEntryPoint
        val pathBeforeFragment = target.substringBefore('#')
        val pathOnly = pathBeforeFragment.substringBefore('?')
        if (pathOnly.isEmpty()) return safeEntryPoint
        if (pathOnly.endsWith("/")) return null

        val parts = safeEntryPoint.substringBeforeLast('/', "")
            .split('/')
            .filter { it.isNotEmpty() }
            .toMutableList()
        for (encodedPart in pathOnly.split('/')) {
            val part = decodeLinkPathSegment(encodedPart) ?: return null
            when (part) {
                "", "." -> Unit
                ".." -> if (parts.isEmpty()) return null else parts.removeAt(parts.lastIndex)
                else -> parts.add(part)
            }
        }
        if (parts.isEmpty()) return null
        return runCatching { safeArchivePath(parts.joinToString("/")) }.getOrNull()
    }

    private fun decodeLinkPathSegment(encodedSegment: String): String? {
        val decoded = StringBuilder()
        var index = 0
        while (index < encodedSegment.length) {
            if (encodedSegment[index] != '%') {
                decoded.append(encodedSegment[index])
                index += 1
                continue
            }

            val bytes = ByteArrayOutputStream()
            while (index < encodedSegment.length && encodedSegment[index] == '%') {
                if (index + 2 >= encodedSegment.length) return null
                val high = encodedSegment[index + 1].digitToIntOrNull(16) ?: return null
                val low = encodedSegment[index + 2].digitToIntOrNull(16) ?: return null
                bytes.write((high shl 4) or low)
                index += 3
            }
            val percentDecoded = runCatching {
                decodeUtf8(bytes.toByteArray(), "The MDZip link contains invalid UTF-8.")
            }.getOrNull() ?: return null
            decoded.append(percentDecoded)
        }

        val normalized = Normalizer.normalize(decoded.toString(), Normalizer.Form.NFC)
        if (
            normalized.contains('/') ||
            normalized.contains('\\') ||
            normalized.any { it.code < 0x20 || it.code == 0x7f }
        ) {
            return null
        }
        return normalized
    }

    private fun resolveArchiveFile(root: File, relativePath: String): File {
        val safePath = safeArchivePath(relativePath)
        val rootPath = root.canonicalFile.toPath()
        val target = File(root, safePath).canonicalFile
        if (!target.toPath().startsWith(rootPath) || target == root.canonicalFile) {
            throw IOException("The MDZip package contains an unsafe file path.")
        }
        return target
    }

    private fun validateManifest(manifest: JSONObject) {
        val spec = if (manifest.has("spec")) {
            manifest.opt("spec") as? JSONObject
                ?: throw IOException("The MDZip manifest has an invalid spec declaration.")
        } else {
            null
        }
        if (spec?.has("version") == true) {
            val version = spec.opt("version") as? String
                ?: throw IOException("The MDZip manifest has an invalid spec.version value.")
            val match = SEMVER_PATTERN.matchEntire(version)
                ?: throw IOException("The MDZip manifest has an invalid spec.version value.")
            val prerelease = match.groupValues[4]
            if (
                prerelease.isNotEmpty() &&
                prerelease.split('.').any {
                    it.length > 1 && it.all { character -> character.isDigit() } &&
                        it.startsWith('0')
                }
            ) {
                throw IOException("The MDZip manifest has an invalid spec.version value.")
            }
            if (match.groupValues[1] != "0" && match.groupValues[1] != "1") {
                throw IOException(
                    "This app does not support MDZip specification major ${match.groupValues[1]}."
                )
            }
        }

        if (manifest.has("mode")) {
            val mode = manifest.opt("mode") as? String
                ?: throw IOException("The MDZip manifest has an invalid mode value.")
            when (mode) {
                "document" -> Unit
                "project" -> throw IOException(
                    "This app does not support MDZip project packages yet."
                )
                else -> throw IOException("This app does not recognize MDZip mode '$mode'.")
            }
        }
    }

    private fun resolveEntryPoint(root: File, manifest: JSONObject): String {
        if (manifest.has("entryPoint")) {
            val declared = manifest.opt("entryPoint") as? String
                ?: throw IOException("The MDZip manifest has an invalid entryPoint value.")
            if (declared.isEmpty()) {
                throw IOException("The MDZip manifest has an invalid entryPoint value.")
            }
            val withoutOptionalPrefix = if (declared.startsWith("./")) {
                declared.substring(2)
            } else {
                declared
            }
            val path = safeArchivePath(withoutOptionalPrefix)
            if (!isMarkdownFileName(path)) {
                throw IOException("The MDZip entryPoint must name a .md or .markdown file.")
            }
            if (!resolveArchiveFile(root, path).isFile) {
                throw IOException("The declared MDZip entry-point file is missing.")
            }
            return path
        }

        val rootMarkdownFiles = root.listFiles()
            ?.filter { it.isFile && isMarkdownFileName(it.name) }
            .orEmpty()
        rootMarkdownFiles.firstOrNull { it.name == DEFAULT_ENTRY_POINT }?.let {
            return safeArchivePath(it.name)
        }

        val contentFiles = rootMarkdownFiles.filterNot { isSupportMarkdownFile(it.name) }
        if (contentFiles.size == 1) return safeArchivePath(contentFiles.single().name)
        if (contentFiles.isEmpty() && rootMarkdownFiles.size == 1) {
            return safeArchivePath(rootMarkdownFiles.single().name)
        }
        throw IOException(
            "The MDZip archive has no unambiguous Markdown entry point. " +
                "It needs root index.md or exactly one root Markdown content file."
        )
    }

    private fun prepareManifestForSave(manifest: JSONObject, entryPoint: String) {
        val spec = manifest.optJSONObject("spec") ?: JSONObject().also {
            manifest.put("spec", it)
        }
        if (!spec.has("name")) spec.put("name", "mdzip-spec")
        if (!spec.has("version")) spec.put("version", SPEC_VERSION)
        if (!manifest.has("mode")) manifest.put("mode", "document")
        manifest.put("entryPoint", entryPoint)
    }

    private fun isMarkdownFileName(fileName: String): Boolean {
        val extension = fileName.substringAfterLast('.', "")
        return asciiEqualsIgnoreCase(extension, "md") ||
            asciiEqualsIgnoreCase(extension, "markdown")
    }

    private fun isSupportMarkdownFile(fileName: String): Boolean {
        val extensionSeparator = fileName.lastIndexOf('.')
        if (extensionSeparator < 0) return false
        val baseName = fileName.substring(0, extensionSeparator)
        val supportNames = setOf(
            "README",
            "AGENTS",
            "LICENSE",
            "CHANGELOG",
            "CONTRIBUTING"
        )
        return supportNames.any { asciiEqualsIgnoreCase(baseName, it) }
    }

    private fun asciiEqualsIgnoreCase(left: String, right: String): Boolean {
        if (left.length != right.length) return false
        return left.indices.all { index ->
            val leftCharacter = left[index].let {
                if (it in 'A'..'Z') it + ('a' - 'A') else it
            }
            val rightCharacter = right[index].let {
                if (it in 'A'..'Z') it + ('a' - 'A') else it
            }
            leftCharacter == rightCharacter
        }
    }

    private fun sanitizeAudioFileName(name: String): String {
        if (!isSupportedAudioFileName(name)) {
            throw IOException("Choose an MP3, AAC, M4A, WAV, FLAC, Opus, OGG, or OGA audio file.")
        }
        val extension = name.substringAfterLast('.', "")
        val stem = sanitizeArchiveNameSegment(name.substringBeforeLast('.', name), "audio")
        return "$stem.$extension"
    }

    private fun uniqueAudioName(
        root: File,
        stem: String,
        extension: String,
        originalArchivePaths: Map<String, String> = emptyMap(),
        originalDirectoryPaths: Map<String, String> = emptyMap()
    ): String {
        var suffix = 1
        while (suffix < 10000) {
            val numberedStem = if (suffix == 1) stem else "$stem ($suffix)"
            val candidate = "audio/$numberedStem.$extension"
            if (!archivePathExists(root, candidate, originalArchivePaths, originalDirectoryPaths)) {
                return "$numberedStem.$extension"
            }
            suffix += 1
        }
        throw IOException("Could not assign a unique name to the audio file.")
    }

    private fun sanitizeVideoFileName(name: String): String {
        if (!isSupportedVideoFileName(name)) {
            throw IOException("Choose an MP4, M4V, WebM, 3GP, MOV, MKV, AVI, MPEG, MPG, OGV, or WMV video file.")
        }
        val extension = name.substringAfterLast('.', "")
        val stem = sanitizeArchiveNameSegment(name.substringBeforeLast('.', name), "video")
        return "$stem.$extension"
    }

    private fun sanitizeAttachmentFileName(name: String): String =
        sanitizeArchiveNameSegment(name, "attachment")

    private fun sanitizeArchiveNameSegment(name: String, fallback: String): String {
        val cleaned = buildString(name.length) {
            for (character in name) {
                append(
                    if (
                        character.code < 0x20 ||
                        character.code == 0x7f ||
                        character in RESERVED_PATH_CHARACTERS ||
                        character == '/' ||
                        character == '\\'
                    ) {
                        '_'
                    } else {
                        character
                    }
                )
            }
        }
        return if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") fallback else cleaned
    }

    private fun uniqueAttachmentName(
        root: File,
        name: String,
        originalArchivePaths: Map<String, String> = emptyMap(),
        originalDirectoryPaths: Map<String, String> = emptyMap()
    ): String {
        val extension = name.substringAfterLast('.', "").takeIf {
            it.isNotEmpty() && name.lastIndexOf('.') > 0
        }
        val stem = if (extension == null) name else name.removeSuffix(".$extension")
        var suffix = 1
        while (suffix < 10000) {
            val numberedStem = if (suffix == 1) stem else "$stem ($suffix)"
            val candidateName = if (extension == null) numberedStem else "$numberedStem.$extension"
            if (
                !archivePathExists(
                    root,
                    "attachments/$candidateName",
                    originalArchivePaths,
                    originalDirectoryPaths
                )
            ) {
                return candidateName
            }
            suffix += 1
        }
        throw IOException("Could not assign a unique name to the attachment.")
    }

    private fun uniqueVideoName(
        root: File,
        stem: String,
        extension: String,
        originalArchivePaths: Map<String, String> = emptyMap(),
        originalDirectoryPaths: Map<String, String> = emptyMap()
    ): String {
        var suffix = 1
        while (suffix < 10000) {
            val numberedStem = if (suffix == 1) stem else "$stem ($suffix)"
            val candidate = "video/$numberedStem.$extension"
            if (!archivePathExists(root, candidate, originalArchivePaths, originalDirectoryPaths)) {
                return "$numberedStem.$extension"
            }
            suffix += 1
        }
        throw IOException("Could not assign a unique name to the video file.")
    }

    private fun archivePathExists(
        root: File,
        candidate: String,
        originalArchivePaths: Map<String, String>,
        originalDirectoryPaths: Map<String, String>
    ): Boolean {
        val normalized = safeArchivePath(candidate)
        if (
            normalized in originalArchivePaths ||
            normalized in originalDirectoryPaths ||
            resolveArchiveFile(root, normalized).exists()
        ) {
            return true
        }
        if (
            originalArchivePaths.keys.any { it.equals(normalized, ignoreCase = true) } ||
            originalDirectoryPaths.keys.any { it.equals(normalized, ignoreCase = true) }
        ) {
            return true
        }
        return root.walkTopDown()
            .drop(1)
            .any { file ->
                val existingPath = root.toPath()
                    .relativize(file.toPath())
                    .toString()
                    .replace(File.separatorChar, '/')
                runCatching { safeArchivePath(existingPath) }
                    .getOrNull()
                    ?.equals(normalized, ignoreCase = true) == true
            }
    }

    private fun relativeMarkdownPath(entryPoint: String, assetPath: String): String {
        val baseParts = entryPoint.substringBeforeLast('/', "").split('/')
            .filter { it.isNotEmpty() }
        val targetParts = assetPath.split('/').filter { it.isNotEmpty() }
        var common = 0
        while (
            common < baseParts.size &&
            common < targetParts.size &&
            baseParts[common] == targetParts[common]
        ) {
            common += 1
        }
        return (List(baseParts.size - common) { ".." } + targetParts.drop(common))
            .joinToString("/") { part ->
                if (part == "." || part == "..") part else encodeLinkPathSegment(part)
            }
    }

    private fun encodeLinkPathSegment(segment: String): String {
        val hexDigits = "0123456789ABCDEF"
        return buildString {
            for (byte in segment.toByteArray(Charsets.UTF_8)) {
                val value = byte.toInt() and 0xff
                val unreserved =
                    value in 'A'.code..'Z'.code ||
                        value in 'a'.code..'z'.code ||
                        value in '0'.code..'9'.code ||
                        value == '-'.code ||
                        value == '.'.code ||
                        value == '_'.code ||
                        value == '~'.code
                if (unreserved) {
                    append(value.toChar())
                } else {
                    append('%')
                    append(hexDigits[value ushr 4])
                    append(hexDigits[value and 0x0f])
                }
            }
        }
    }

    private fun titleFromFileName(fileName: String): String {
        val trimmed = fileName.trim()
        return if (trimmed.endsWith(".mdz", ignoreCase = true)) {
            trimmed.dropLast(4).ifBlank { "Untitled" }
        } else {
            trimmed.ifBlank { "Untitled" }
        }
    }
}
