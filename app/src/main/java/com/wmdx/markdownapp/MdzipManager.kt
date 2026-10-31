package com.wmdx.markdownapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.text.Normalizer
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

data class MdzipSession(
    val sessionDir: File,
    val entryPoint: String,
    val manifest: JSONObject,
    var markdownContent: String,
    var sourceUri: Uri?
)

object MdzipManager {
    const val MIME_TYPE = "application/vnd.mdzip"
    private const val MANIFEST_NAME = "manifest.json"
    private const val DEFAULT_ENTRY_POINT = "index.md"
    private const val MAX_ENTRIES = 4096
    private const val MAX_ENTRY_BYTES = 256L * 1024L * 1024L
    private const val MAX_TOTAL_BYTES = 512L * 1024L * 1024L
    private const val MAX_AUDIO_BYTES = 256L * 1024L * 1024L
    private const val ASSET_BASE_URL = "https://appassets.androidplatform.net/mdzip-assets"

    fun isMdzipFileName(fileName: String): Boolean =
        fileName.endsWith(".mdz", ignoreCase = true)

    fun open(context: Context, uri: Uri): MdzipSession {
        val parent = File(context.cacheDir, "mdzip_sessions")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Could not create the temporary MDZip workspace.")
        }
        val sessionDir = File(parent, "session_${UUID.randomUUID()}")
        if (!sessionDir.mkdirs()) {
            throw IOException("Could not create the temporary MDZip workspace.")
        }

        try {
            val input = context.contentResolver.openInputStream(uri)
                ?: throw IOException("Could not read the selected MDZip file.")
            val seenFiles = HashSet<String>()
            var totalBytes = 0L
            var entryCount = 0
            input.use { source ->
                ZipInputStream(source).use { zip ->
                    while (true) {
                        val entry = zip.nextEntry ?: break
                        entryCount += 1
                        if (entryCount > MAX_ENTRIES) {
                            throw IOException("The MDZip package contains too many files.")
                        }

                        val rawName = entry.name
                        val isDirectory = entry.isDirectory || rawName.endsWith("/")
                        val path = safeArchivePath(
                            if (isDirectory) rawName.removeSuffix("/") else rawName
                        )
                        if (!isDirectory) {
                            val duplicateKey = Normalizer.normalize(path, Normalizer.Form.NFC)
                            if (!seenFiles.add(duplicateKey)) {
                                throw IOException("The MDZip package has duplicate file paths.")
                            }
                            val target = resolveArchiveFile(sessionDir, path)
                            target.parentFile?.let { parentDir ->
                                if (!parentDir.exists() && !parentDir.mkdirs()) {
                                    throw IOException("Could not unpack the MDZip package.")
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
                                        throw IOException("The MDZip package is too large to open.")
                                    }
                                    output.write(buffer, 0, read)
                                }
                            }
                        }
                        zip.closeEntry()
                    }
                }
            }

            val manifestFile = resolveArchiveFile(sessionDir, MANIFEST_NAME)
            if (!manifestFile.isFile) {
                throw IOException("This MDZip package is missing its root manifest.json.")
            }
            val manifest = runCatching { JSONObject(manifestFile.readText(Charsets.UTF_8)) }
                .getOrElse { throw IOException("The MDZip manifest is invalid.", it) }
            validateManifest(manifest)
            val entryPoint = resolveEntryPoint(sessionDir, manifest)
            val entryFile = resolveArchiveFile(sessionDir, entryPoint)
            if (!entryFile.isFile) {
                throw IOException("The MDZip entry-point file is missing.")
            }
            return MdzipSession(
                sessionDir = sessionDir,
                entryPoint = entryPoint,
                manifest = manifest,
                markdownContent = entryFile.readText(Charsets.UTF_8),
                sourceUri = uri
            )
        } catch (error: Exception) {
            sessionDir.deleteRecursively()
            throw error
        }
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
            put("spec", JSONObject().put("name", "mdzip-spec").put("version", "1.2.1"))
            put("title", titleFromFileName(targetName))
            put("mode", "document")
            put("entryPoint", DEFAULT_ENTRY_POINT)
        }
        resolveArchiveFile(sessionDir, DEFAULT_ENTRY_POINT).writeText(markdown, Charsets.UTF_8)
        resolveArchiveFile(sessionDir, MANIFEST_NAME).writeText(manifest.toString(2), Charsets.UTF_8)
        return MdzipSession(sessionDir, DEFAULT_ENTRY_POINT, manifest, markdown, null)
    }

    fun save(context: Context, session: MdzipSession, markdown: String, targetUri: Uri) {
        val entryFile = resolveArchiveFile(session.sessionDir, session.entryPoint)
        entryFile.parentFile?.let { parent ->
            if (!parent.exists() && !parent.mkdirs()) {
                throw IOException("Could not write the MDZip entry-point file.")
            }
        }
        entryFile.writeText(markdown, Charsets.UTF_8)
        resolveArchiveFile(session.sessionDir, MANIFEST_NAME)
            .writeText(session.manifest.toString(2), Charsets.UTF_8)

        val output = context.contentResolver.openOutputStream(targetUri, "rwt")
            ?: throw IOException("Could not open the selected file for writing.")
        output.use { stream ->
            ZipOutputStream(stream).use { zip ->
                val files = session.sessionDir.walkTopDown()
                    .filter { it.isFile }
                    .sortedBy { session.sessionDir.toPath().relativize(it.toPath()).toString() }
                for (file in files) {
                    val name = session.sessionDir.toPath()
                        .relativize(file.toPath())
                        .toString()
                        .replace(File.separatorChar, '/')
                    val path = safeArchivePath(name)
                    zip.putNextEntry(ZipEntry(path))
                    FileInputStream(file).use { it.copyTo(zip) }
                    zip.closeEntry()
                }
                zip.finish()
            }
        }
        session.markdownContent = markdown
        session.sourceUri = targetUri
    }

    fun addMp3(session: MdzipSession, input: InputStream, originalName: String): String {
        val basename = originalName.substringAfterLast('/').substringAfterLast('\\')
        if (!basename.endsWith(".mp3", ignoreCase = true)) {
            throw IOException("Only MP3 audio is supported in this first MDZip pass.")
        }
        val cleanName = sanitizeAudioFileName(basename)
        val stem = cleanName.dropLast(4).ifBlank { "audio" }
        val candidateName = uniqueAudioName(session.sessionDir, stem)
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
                        throw IOException("This MP3 is too large to add to the MDZip package.")
                    }
                    output.write(buffer, 0, read)
                }
            }
        }
        return relativeMarkdownPath(session.entryPoint, archivePath)
    }

    fun replaceMp3(session: MdzipSession, markdownLink: String, input: InputStream) {
        val target = resolveAudioFile(session, markdownLink)
            ?: throw IOException("The linked MP3 is no longer in this MDZip package.")
        val temporary = File.createTempFile("mdzip-audio-replacement-", ".mp3", target.parentFile)
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
                            throw IOException("This MP3 is too large to add to the MDZip package.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
            }
            if (bytesCopied == 0L) throw IOException("The selected MP3 is empty.")
            if (!temporary.renameTo(target)) {
                throw IOException("Could not replace the MP3 inside the MDZip package.")
            }
        } finally {
            temporary.delete()
        }
    }

    fun resolveAudioArchivePath(session: MdzipSession, markdownLink: String): String? {
        val target = markdownLink.trim().removePrefix("<").removeSuffix(">")
        if (target.isBlank() || target.startsWith("/") || target.startsWith("//")) return null
        if (target.contains("://") || target.startsWith("data:", ignoreCase = true)) return null
        val pathOnly = target.substringBefore('#').substringBefore('?')
        val decoded = Uri.decode(pathOnly)
        val parts = ArrayList<String>()
        val base = session.entryPoint.substringBeforeLast('/', "")
        if (base.isNotEmpty()) parts.addAll(base.split('/'))
        for (part in decoded.split('/')) {
            when (part) {
                "", "." -> Unit
                ".." -> if (parts.isEmpty()) return null else parts.removeAt(parts.lastIndex)
                else -> parts.add(part)
            }
        }
        if (parts.isEmpty()) return null
        val archivePath = runCatching { safeArchivePath(parts.joinToString("/")) }.getOrNull()
            ?: return null
        if (!archivePath.startsWith("audio/", ignoreCase = true) ||
            !archivePath.endsWith(".mp3", ignoreCase = true)
        ) return null
        return archivePath
    }

    fun resolveAudioFile(session: MdzipSession, markdownLink: String): File? {
        val archivePath = resolveAudioArchivePath(session, markdownLink) ?: return null
        return audioArchiveFile(session, archivePath)
    }

    fun audioArchiveFile(session: MdzipSession, archivePath: String): File? {
        val safePath = runCatching { safeArchivePath(archivePath) }.getOrNull() ?: return null
        if (!safePath.startsWith("audio/", ignoreCase = true) ||
            !safePath.endsWith(".mp3", ignoreCase = true)
        ) return null
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
        val file = resolveAudioFile(session, markdownLink) ?: return false
        return file.delete()
    }

    internal fun safeArchivePath(rawPath: String): String {
        if (rawPath.isBlank() || rawPath.startsWith("/") || rawPath.contains('\\') ||
            rawPath.contains('\u0000')
        ) {
            throw IOException("The MDZip package contains an unsafe file path.")
        }
        val parts = rawPath.split('/')
        if (parts.any { it.isEmpty() || it == "." || it == ".." || it.matches(Regex("^[A-Za-z]:.*")) }) {
            throw IOException("The MDZip package contains an unsafe file path.")
        }
        if (parts.any { it.any { character -> character.code < 0x20 } }) {
            throw IOException("The MDZip package contains an unsafe file path.")
        }
        return parts.joinToString("/")
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
        val spec = manifest.optJSONObject("spec")
            ?: throw IOException("The MDZip manifest is missing its spec declaration.")
        if (spec.optString("name") != "mdzip-spec") {
            throw IOException("This package does not identify itself as an MDZip archive.")
        }
        val mode = manifest.optString("mode", "document").lowercase()
        if (mode != "document") {
            throw IOException("This first MDZip version supports document packages, not project packages.")
        }
    }

    private fun resolveEntryPoint(root: File, manifest: JSONObject): String {
        val declared = manifest.optString("entryPoint").trim()
        if (declared.isNotEmpty()) return safeArchivePath(declared)
        val defaultEntry = resolveArchiveFile(root, DEFAULT_ENTRY_POINT)
        if (defaultEntry.isFile) return DEFAULT_ENTRY_POINT
        val rootMarkdownFiles = root.listFiles()
            ?.filter { it.isFile && it.extension.equals("md", ignoreCase = true) }
            .orEmpty()
        if (rootMarkdownFiles.size == 1) {
            return safeArchivePath(rootMarkdownFiles.single().name)
        }
        throw IOException("The MDZip package does not identify a Markdown entry point.")
    }

    private fun sanitizeAudioFileName(name: String): String {
        val stem = name.dropLast(4)
            .replace(Regex("[^\\p{L}\\p{N} ._()\\-]"), "_")
            .trim()
            .trim('.')
            .ifBlank { "audio" }
        return "$stem.mp3"
    }

    private fun uniqueAudioName(root: File, stem: String): String {
        var suffix = 1
        while (suffix < 10000) {
            val numberedStem = if (suffix == 1) stem else "$stem ($suffix)"
            val candidate = "audio/$numberedStem.mp3"
            if (!resolveArchiveFile(root, candidate).exists()) {
                return "$numberedStem.mp3"
            }
            suffix += 1
        }
        throw IOException("Could not assign a unique name to the MP3.")
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
            .joinToString("/")
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
