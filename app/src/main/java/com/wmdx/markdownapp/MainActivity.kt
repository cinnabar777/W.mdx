package com.wmdx.markdownapp

import android.content.Context
import android.graphics.Color
import android.graphics.Matrix
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.util.LruCache
import android.view.Menu
import android.view.MenuItem
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.view.inputmethod.CursorAnchorInfo
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.ViewCompat
import androidx.preference.PreferenceManager
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.Future

private const val WMDX_TAB_SESSION_MIME = "application/vnd.wmdx.tabs-session+json"
private const val MAX_WMDX_TAB_SESSION_BYTES = 512 * 1024
private const val MAX_EMBEDDED_DOCUMENT_BYTES = 16L * 1024L * 1024L
private const val MAX_DOWNLOADED_IMAGE_BYTES = 32L * 1024L * 1024L
private const val EMBEDDED_MARKDOWN_READ_ACCESS_MESSAGE =
    "Could not load this embedded document. Check that it exists and grant read access to its folder in Settings > File & Folder Access, then reopen it. Read access is enough to display it; write access is only needed to save edits."

private sealed interface EmbeddedDocumentSourceContext {
    data class ExternalFile(val uri: Uri) : EmbeddedDocumentSourceContext
    data class MdzipFile(
        val session: MdzipSession,
        val markdownPath: String
    ) : EmbeddedDocumentSourceContext
}

private data class ResolvedEmbeddedDocument(
    val uri: Uri,
    val archiveSession: MdzipSession? = null,
    val archivePath: String? = null
)

class MainActivity : AppCompatActivity(), SharedPreferences.OnSharedPreferenceChangeListener {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var suppressImeUntilUserTouch = false
    private var imeHideGeneration = 0
    @Volatile private var lastKnownImeVisible = false
    private enum class DocumentFormat { MARKDOWN, TEXT_PACK, MDZIP }
    private enum class InsertAssetKind { AUDIO, VIDEO, ATTACHMENT }
    private var currentDocumentFormat = DocumentFormat.MARKDOWN

    private data class CachedFontData(val modifiedAt: Long, val length: Long, val dataUri: String)
    private data class DownloadedImage(
        val bytes: ByteArray,
        val fileName: String,
        val mimeType: String
    )
    private data class ImageStorageTarget(
        val sessionId: String,
        val format: DocumentFormat,
        val textPackSession: TextPackSession? = null,
        val mdzipSession: MdzipSession? = null,
        val markdownLocation: MarkdownDocumentLocation? = null,
        val markdownStorageLocation: String = MarkdownAssetManager.LOCATION_ASSETS
    )
    private data class LeftPanelDocumentEntry(
        val documentId: String,
        val name: String,
        val uri: Uri,
        val isDirectory: Boolean,
        val mimeType: String
    )
    private val fontDataUriCache = object : LruCache<String, CachedFontData>(8 * 1024) {
        override fun sizeOf(key: String, value: CachedFontData): Int =
            maxOf(1, value.dataUri.length / 1024)
    }

    private var currentFileUri: Uri? = null
        set(value) {
            field = value
            WindowRegistry.register(this, value)
        }
    private var currentFileName: String = "Untitled.md"
    @Volatile private var currentDocumentSessionId: String = java.util.UUID.randomUUID().toString()
    @Volatile private var isDirty: Boolean = false
    private var isEditorReady: Boolean = false
    private var currentEditorMode: String = "rich_text"
    @Volatile private var currentRevision: Long = 0
    @Volatile private var currentEmptyContentExplicitlyEdited: Boolean = false
    private var hasBom: Boolean = false
    private var hasCrlf: Boolean = false
    @Volatile private var latestMarkdownContent: String? = null
    private var pendingOpenUri: Uri? = null
    private var pendingOpenPermissionFlags: Int? = null
    private var pendingOpenSkipExistingWindowFocus = false
    private var pendingExistingDocumentFocusUri: Uri? = null
    private var pendingSessionOpenInNewWindow = false
    private var pendingDefaultSearchFolderPicker = false
    @Volatile private var isActivityResumed = false
    private var pendingSharedText: String? = null
    private var currentToast: Toast? = null
    private val leftPanelSearchExecutor = Executors.newSingleThreadExecutor()
    private val imageUrlDownloadExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var leftPanelSearchFuture: Future<*>? = null
    @Volatile private var currentTextPackSession: TextPackSession? = null
    @Volatile private var currentMdzipSession: MdzipSession? = null
    private var pendingRenameFallbackName: String? = null
    private var pendingCreateDocumentAsTextPack: Boolean? = null
    private var pendingCreateDocumentAsMdzip: Boolean? = null
    private var pendingCreateDocumentSessionId: String? = null
    private var pendingCreateNewDocumentFormat: DocumentFormat? = null
    private var pendingInsertAudioDocumentSessionId: String? = null
    private var pendingInsertVideoDocumentSessionId: String? = null
    private var pendingInsertAttachmentDocumentSessionId: String? = null
    private var pendingInsertEmbeddedDocumentSessionId: String? = null
    private var pendingReplaceMdzipAudioLink: String? = null
    private val embeddedMdzipSessionsLock = Any()
    private val embeddedMdzipSessions =
        java.util.LinkedHashMap<String, MdzipSession>(8, 0.75f, true)
    private var pendingWmdxTabSessionJson: String? = null
    private data class RenameAccessRequest(val uri: Uri, val targetName: String)
    private var pendingRenamePermissionRequest: RenameAccessRequest? = null
    private val documentHistoryStack = java.util.ArrayDeque<Uri>()
    private val documentForwardStack = java.util.ArrayDeque<Uri>()
    private val documentHistoryLock = Any()

    fun requestExistingDocumentFocus(uriString: String) {
        val uri = runCatching { Uri.parse(uriString).normalizeScheme() }.getOrNull() ?: return
        runOnUiThread {
            pendingExistingDocumentFocusUri = uri
            dispatchPendingExistingDocumentFocus()
        }
    }

    private fun dispatchPendingExistingDocumentFocus() {
        val uri = pendingExistingDocumentFocusUri ?: return
        if (!isActivityResumed || !isEditorReady || !::webView.isInitialized) return
        val escapedUri = JSONObjectWrapper.quote(uri.toString())
        webView.evaluateJavascript(
            "(window.leftPanelController?.focusDocumentUri?.($escapedUri) === true)"
        ) { focused ->
            AppDiagnostics.record(
                this,
                "window_focus_tab_result",
                "uri=${WindowPolicy.fingerprintUri(uri.toString())} focused=${focused == "true"}"
            )
            if (pendingExistingDocumentFocusUri == uri) {
                pendingExistingDocumentFocusUri = null
            }
        }
    }

    private fun documentHistoryStateJson(): String = synchronized(documentHistoryLock) {
        val back = JSONArray().apply {
            documentHistoryStack.forEach { put(it.toString()) }
        }
        val forward = JSONArray().apply {
            documentForwardStack.forEach { put(it.toString()) }
        }
        org.json.JSONObject()
            .put("back", back)
            .put("forward", forward)
            .toString()
    }

    private fun restoreDocumentHistoryState(historyStateJson: String?) {
        val state = runCatching {
            org.json.JSONObject(historyStateJson ?: "{}")
        }.getOrNull()
        synchronized(documentHistoryLock) {
            documentHistoryStack.clear()
            documentForwardStack.clear()
            if (state == null) return@synchronized
            val back = state.optJSONArray("back") ?: JSONArray()
            val forward = state.optJSONArray("forward") ?: JSONArray()
            for (index in 0 until back.length()) {
                back.optString(index).takeIf { it.isNotBlank() }?.let { value ->
                    runCatching { Uri.parse(value).normalizeScheme() }
                        .getOrNull()?.let(documentHistoryStack::addLast)
                }
            }
            for (index in 0 until forward.length()) {
                forward.optString(index).takeIf { it.isNotBlank() }?.let { value ->
                    runCatching { Uri.parse(value).normalizeScheme() }
                        .getOrNull()?.let(documentForwardStack::addLast)
                }
            }
        }
    }

    private fun canNavigateDocumentBack(): Boolean =
        synchronized(documentHistoryLock) { documentHistoryStack.isNotEmpty() }

    private fun canNavigateDocumentForward(): Boolean =
        synchronized(documentHistoryLock) { documentForwardStack.isNotEmpty() }

    private fun beginTabHistoryNavigation() {
        webView.evaluateJavascript(
            "window.leftPanelController?.onTabHistoryNavigationStarted?.();",
            null
        )
    }

    private fun showCustomToast(message: String) {
        runOnUiThread {
            ThemedToast.show(this, message)
        }
    }

    private val openDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val resultIntent = result.data
            val uri = resultIntent?.data
            if (
                result.resultCode == android.app.Activity.RESULT_OK &&
                uri != null
            ) {
                openFile(
                    uri,
                    forceReload = true,
                    permissionFlags = resultIntent?.flags ?: 0
                )
            }
        }

    private val openWmdxTabSessionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val openInNewWindow = pendingSessionOpenInNewWindow
            pendingSessionOpenInNewWindow = false
            val resultIntent = result.data
            val uri = resultIntent?.data
            if (result.resultCode == android.app.Activity.RESULT_OK && uri != null) {
                val permissionFlags = (resultIntent?.flags ?: 0) and (
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )
                if (!isWmdxTabSession(uri)) {
                    Toast.makeText(
                        this,
                        "Choose a .wmdx session file.",
                        Toast.LENGTH_LONG
                    ).show()
                } else if (openInNewWindow) {
                    persistDocumentUriPermission(uri, permissionFlags)
                    openWmdxTabSessionInNewWindow(uri, permissionFlags)
                } else {
                    openFile(uri, forceReload = true, permissionFlags = permissionFlags)
                }
            }
        }

    private val defaultSearchFolderLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            pendingDefaultSearchFolderPicker = false
            val uri = result.data?.data
            val readFlag = android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
            val granted = if (
                result.resultCode == android.app.Activity.RESULT_OK &&
                uri != null &&
                ((result.data?.flags ?: 0) and readFlag) != 0
            ) {
                runCatching {
                    contentResolver.takePersistableUriPermission(uri, readFlag)
                    authorizedLeftPanelTrees().any { it == uri }
                }.getOrDefault(false)
            } else {
                false
            }
            if (::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.leftPanelController?.onSearchFolderAccessResult?.($granted);",
                    null
                )
            }
        }

    private data class PendingToolbarKeySvgRequest(
        val surface: String,
        val itemId: String,
        val property: String
    )

    private var pendingToolbarKeySvgRequest: PendingToolbarKeySvgRequest? = null

    private val toolbarKeySvgPickerLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val request = pendingToolbarKeySvgRequest
            pendingToolbarKeySvgRequest = null
            if (uri != null && request != null) {
                val svg = runCatching {
                    contentResolver.openInputStream(uri)?.use { input ->
                        input.readBytes().toString(Charsets.UTF_8)
                    }
                }.getOrNull()
                if (svg != null) {
                    updateToolbarKeyPreferenceStyle(
                        request.surface,
                        request.itemId,
                        request.property,
                        svg
                    )
                }
            }
        }

    private val renameFolderLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            handleRenameFolderSelection(result.resultCode, result.data)
        }

    private val createDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
            handleCreateDocumentResult(uri)
        }

    private val createTextPackDocumentLauncher =
        registerForActivityResult(
            ActivityResultContracts.CreateDocument("application/vnd.wmdx.textpack")
        ) { uri ->
            handleCreateDocumentResult(uri)
        }

    private val createMdzipDocumentLauncher =
        registerForActivityResult(
            ActivityResultContracts.CreateDocument(MdzipManager.MIME_TYPE)
        ) { uri ->
            handleCreateDocumentResult(uri)
        }

    private val saveWmdxTabSessionLauncher =
        registerForActivityResult(
            ActivityResultContracts.CreateDocument(WMDX_TAB_SESSION_MIME)
        ) { uri ->
            val sessionJson = pendingWmdxTabSessionJson
            pendingWmdxTabSessionJson = null
            if (uri == null) return@registerForActivityResult
            if (sessionJson == null) return@registerForActivityResult
            var sessionUri: Uri = uri
            try {
                sessionUri = ensureDocumentExtension(uri, ".wmdx")
                writeWmdxTabSession(sessionUri, sessionJson, persistGrant = true)
                clearPendingWmdxTabSessionSave(sessionUri)
                val uriLiteral = JSONObjectWrapper.quote(sessionUri.toString())
                val sessionLiteral = JSONObjectWrapper.quote(sessionJson)
                webView.evaluateJavascript(
                    "window.leftPanelController?.onWmdxTabSessionSaved?.($uriLiteral, $sessionLiteral);",
                    null
                )
                ThemedToast.show(this, "Tab session saved.", Toast.LENGTH_SHORT)
            } catch (error: Exception) {
                val cause = error.localizedMessage ?: "Could not save the tab session."
                val cached = cachePendingWmdxTabSessionSave(sessionUri, sessionJson)
                val message = if (cached) {
                    "$cause A private recovery copy is being held until the session saves."
                } else {
                    "$cause The private recovery copy could not be stored."
                }
                val uriLiteral = JSONObjectWrapper.quote(sessionUri.toString())
                val messageLiteral = JSONObjectWrapper.quote(message)
                webView.evaluateJavascript(
                    "window.leftPanelController?.onWmdxTabSessionSaveFailed?.($uriLiteral, $messageLiteral);",
                    null
                )
            }
        }

    private val exportDocumentLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        uri?.let { saveExportToUri(it) }
    }

    private val pickImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { insertImageFromUri(it, embedBase64 = false) }
    }

    private val pickImageAsBase64Launcher =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            uri?.let { insertImageFromUri(it, embedBase64 = true) }
    }

    private val pickAudioLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val expectedSessionId = pendingInsertAudioDocumentSessionId
        pendingInsertAudioDocumentSessionId = null
        val replacementLink = pendingReplaceMdzipAudioLink
        pendingReplaceMdzipAudioLink = null
        if (uri != null && expectedSessionId == currentDocumentSessionId) {
            if (replacementLink != null) replaceAudioFromUri(uri, replacementLink)
            else promptForAssetTitle(uri, InsertAssetKind.AUDIO) { title ->
                if (expectedSessionId == currentDocumentSessionId) {
                    insertAudioFromUri(uri, title)
                } else {
                    ThemedToast.show(this, "The active document changed. The audio was not added.", Toast.LENGTH_LONG)
                }
            }
        } else if (uri != null) {
            ThemedToast.show(this, "The active document changed. The audio change was not applied.", Toast.LENGTH_LONG)
        }
    }

    private val pickVideoLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val expectedSessionId = pendingInsertVideoDocumentSessionId
        pendingInsertVideoDocumentSessionId = null
        if (uri != null && expectedSessionId == currentDocumentSessionId) {
            promptForAssetTitle(uri, InsertAssetKind.VIDEO) { title ->
                if (expectedSessionId == currentDocumentSessionId) {
                    insertVideoFromUri(uri, title)
                } else {
                    ThemedToast.show(this, "The active document changed. The video was not added.", Toast.LENGTH_LONG)
                }
            }
        } else if (uri != null) {
            ThemedToast.show(this, "The active document changed. The video was not added.", Toast.LENGTH_LONG)
        }
    }

    private val pickAttachmentLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val expectedSessionId = pendingInsertAttachmentDocumentSessionId
            pendingInsertAttachmentDocumentSessionId = null
            if (uri != null && expectedSessionId == currentDocumentSessionId) {
                promptForAssetTitle(uri, InsertAssetKind.ATTACHMENT) { title ->
                    if (expectedSessionId == currentDocumentSessionId) {
                        insertAttachmentFromUri(uri, title)
                    } else {
                        ThemedToast.show(this, "The active document changed. The attachment was not added.", Toast.LENGTH_LONG)
                    }
                }
            } else if (uri != null) {
                ThemedToast.show(this, "The active document changed. The attachment was not added.", Toast.LENGTH_LONG)
            }
        }

    private val pickEmbeddedDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val expectedSessionId = pendingInsertEmbeddedDocumentSessionId
            pendingInsertEmbeddedDocumentSessionId = null
            if (uri != null && expectedSessionId == currentDocumentSessionId) {
                insertEmbeddedDocumentFromUri(uri, expectedSessionId)
            } else if (uri != null) {
                ThemedToast.show(
                    this,
                    "The active document changed. The embedded document was not added.",
                    Toast.LENGTH_LONG
                )
            }
        }

    private val settingsLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (isEditorReady) {
            applyThemeAndFullscreenPreferences()
            refreshBottomToolbarFromPreferences()
            val captureActive = AppDiagnostics.isNavigationCaptureActive(this)
            webView.evaluateJavascript(
                "window.editorBridge?.setNavigationDiagnosticsEnabled?.($captureActive);",
                null
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowRegistry.registerActivity(this)
        val startupPreferences = PreferenceManager.getDefaultSharedPreferences(this)
        migrateFloatingToolbarHideDelayPreference(startupPreferences)
        if (!startupPreferences.getBoolean("pref_toolbar_default_corrected", false)) {
            val editor = startupPreferences.edit()
            if (!startupPreferences.contains("pref_toolbar_floating_enabled")) {
                editor.putBoolean("pref_toolbar_floating_enabled", true)
            }
            editor.putBoolean("pref_toolbar_default_corrected", true).apply()
        }
        setContentView(R.layout.activity_main)

        applySystemBarDimming()

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            lastKnownImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            insets
        }
        AppDiagnostics.record(
            this,
            "ime_webview_focus_configured",
            "focusable=${webView.isFocusable} touchFocusable=${webView.isFocusableInTouchMode}"
        )
        webView.setOnTouchListener { _, event ->
            if (
                event.actionMasked == MotionEvent.ACTION_DOWN &&
                suppressImeUntilUserTouch
            ) {
                suppressImeUntilUserTouch = false
                val generation = ++imeHideGeneration
                window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                        WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED
                )
                AppDiagnostics.record(
                    this@MainActivity,
                    "ime_user_touch_released_suppression",
                    "generation=${generation} viewFocused=${webView.isFocused} windowFocused=${window.decorView.hasWindowFocus()}"
                )
            }
            false
        }

        updateTitle()

        setupWebView()
        savedInstanceState?.getStringArrayList("document_history")?.forEach {
            documentHistoryStack.addLast(Uri.parse(it))
        }
        savedInstanceState?.getStringArrayList("document_forward_history")?.forEach {
            documentForwardStack.addLast(Uri.parse(it))
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                navigateCombinedHistory("back", finishWhenBackUnavailable = true)
            }
        })

        AppDiagnostics.record(this, "window_created")
        handleIntent(intent, isRestoration = savedInstanceState != null)
    }

    private fun migrateFloatingToolbarHideDelayPreference(preferences: SharedPreferences) {
        val tenthsKey = "pref_floating_toolbar_hide_delay_tenths"
        if (preferences.contains(tenthsKey)) return

        val secondsKey = "pref_floating_toolbar_hide_delay_seconds"
        val oldSeconds = if (preferences.contains(secondsKey)) {
            preferences.getInt(secondsKey, 1)
        } else {
            1
        }
        preferences.edit()
            .putInt(tenthsKey, oldSeconds.coerceIn(0, 5) * 10)
            .remove(secondsKey)
            .apply()
    }

    override fun onDestroy() {
        WindowRegistry.unregisterActivity(this)
        if (
            isFinishing &&
            !isChangingConfigurations &&
            !intent.getBooleanExtra("launcher_window", false) &&
            ::webView.isInitialized
        ) {
            webView.evaluateJavascript("window.leftPanelController?.onWindowClosing?.();", null)
        }
        leftPanelSearchFuture?.cancel(true)
        leftPanelSearchExecutor.shutdownNow()
        imageUrlDownloadExecutor.shutdownNow()
        if (isFinishing && !isChangingConfigurations) {
            WindowRegistry.unregister(this)
        }
        clearEmbeddedMdzipSessions()
        super.onDestroy()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        // All new opens go through DocumentDispatchActivity. A task brought to
        // the foreground must not replay its old URI or shared text.
        AppDiagnostics.record(this, "window_refocused")
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (isEditorReady && matchesConfiguredSaveShortcut(event)) {
            AppDiagnostics.recordNativeKeyEvent(this, event, true)
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                AppDiagnostics.record(
                    this,
                    "native_save_shortcut",
                    "format=${currentDocumentFormat.name.lowercase()} " +
                        "hasUri=${currentFileUri != null}"
                )
                handleSaveFile()
            }
            return true
        }

        val handled = super.dispatchKeyEvent(event)
        if (isEditorReady) {
            AppDiagnostics.recordNativeKeyEvent(this, event, handled)
        }
        return handled
    }

    private fun matchesConfiguredSaveShortcut(event: KeyEvent): Boolean {
        if (
            event.keyCode != KeyEvent.KEYCODE_S ||
            !(event.isCtrlPressed || event.isMetaPressed) ||
            event.isAltPressed ||
            event.isShiftPressed
        ) return false

        val shortcut = PreferenceManager.getDefaultSharedPreferences(this)
            .getString("pref_hotkey_save", "ctrl+s")
            ?.trim()
            ?.lowercase()

        return shortcut == "ctrl+s" || shortcut == "control+s"
    }

    override fun onSaveInstanceState(outState: Bundle) {
        synchronized(documentHistoryLock) {
            outState.putStringArrayList(
                "document_history",
                ArrayList(documentHistoryStack.map { it.toString() })
            )
            outState.putStringArrayList(
                "document_forward_history",
                ArrayList(documentForwardStack.map { it.toString() })
            )
        }
        super.onSaveInstanceState(outState)
    }

    private fun applySystemBarDimming() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val prefs = PreferenceManager.getDefaultSharedPreferences(this)
            val hideStatusBar = prefs.getBoolean("pref_hide_status_bar", false)
            val hideNavBar = prefs.getBoolean("pref_hide_nav_bar", false)

            window.statusBarColor = Color.BLACK
            window.navigationBarColor = Color.BLACK

            val insetsController = WindowCompat.getInsetsController(window, window.decorView)
            insetsController.isAppearanceLightStatusBars = false
            insetsController.isAppearanceLightNavigationBars = false

            if (hideStatusBar) {
                insetsController.hide(WindowInsetsCompat.Type.statusBars())
            } else {
                insetsController.show(WindowInsetsCompat.Type.statusBars())
            }

            if (hideNavBar) {
                insetsController.hide(WindowInsetsCompat.Type.navigationBars())
            } else {
                insetsController.show(WindowInsetsCompat.Type.navigationBars())
            }

            insetsController.systemBarsBehavior =
                if (hideStatusBar || hideNavBar) {
                    androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                } else {
                    androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
                }
        }
    }

    private fun handleIntent(intent: android.content.Intent?, isRestoration: Boolean = false) {
        if (intent == null) return

        intent.getStringExtra("open_wmdx_tab_session_uri")?.let { sessionUri ->
            pendingOpenUri = Uri.parse(sessionUri)
            pendingOpenSkipExistingWindowFocus = true
            pendingOpenPermissionFlags = intent.getIntExtra(
                "open_wmdx_tab_session_permission_flags",
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
        }

        if (intent.getBooleanExtra("is_new_document", false)) {
            currentFileUri = null
            currentFileName = getString(R.string.untitled_document)
            currentDocumentFormat = DocumentFormat.MARKDOWN
            isDirty = false
            updateTitle()
            if (isEditorReady) {
                webView.evaluateJavascript("window.editorBridge.setMarkdown('');", null)
                pendingOpenUri?.let { uri ->
                    pendingOpenUri = null
                    val permissionFlags = pendingOpenPermissionFlags
                    pendingOpenPermissionFlags = null
                    val skipExistingWindowFocus = pendingOpenSkipExistingWindowFocus
                    pendingOpenSkipExistingWindowFocus = false
                    openFile(
                        uri,
                        skipExistingWindowFocus = skipExistingWindowFocus,
                        permissionFlags = permissionFlags
                    )
                }
            }
            return
        }

        val routeChecked = intent.getBooleanExtra("window_route_checked", false)
        val registeredUri = if (WindowRegistry.hasState(this, taskId)) WindowRegistry.current(this, taskId) else null
        val resolvedUriString = WindowPolicy.resolveDocumentUri(
            restoringActivity = isRestoration,
            hasRegisteredState = WindowRegistry.hasState(this, taskId),
            registeredUri = registeredUri?.normalizeScheme()?.toString(),
            incomingUri = intent.data?.normalizeScheme()?.toString()
        )
        val data: Uri? = resolvedUriString?.let(Uri::parse)

        AppDiagnostics.record(this, "handle_intent_uri",
            "incoming=${WindowPolicy.fingerprintUri(intent.data?.normalizeScheme()?.toString())} registered=${WindowPolicy.fingerprintUri(registeredUri?.normalizeScheme()?.toString())} restoring=$isRestoration selected=${WindowPolicy.fingerprintUri(resolvedUriString)} skipFocus=$routeChecked")

        if (data != null) {
            if (currentFileUri == data) {
                return
            }

            WindowRegistry.register(this, data)
            if (isEditorReady) {
                openFile(
                    data,
                    skipExistingWindowFocus = routeChecked,
                    permissionFlags = intent.flags
                )
            } else {
                pendingOpenUri = data
                pendingOpenPermissionFlags = intent.flags
            }
            return
        }

        pendingSharedText = intent.getStringExtra("shared_text")
        WindowRegistry.register(this, null)
    }

    override fun onResume() {
        super.onResume()
        isActivityResumed = true
        WindowRegistry.consumePendingFocusUri(this, taskId)?.let {
            pendingExistingDocumentFocusUri = it
        }
        AppDiagnostics.record(this, "window_resumed")
        PreferenceManager.getDefaultSharedPreferences(this).registerOnSharedPreferenceChangeListener(this)
        if (::webView.isInitialized) {
            suppressImeUntilUserTouch = true
            val generation = ++imeHideGeneration
            window.setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING or
                    WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
            )
            webView.onResume()
            applyThemeAndFullscreenPreferences()
            refreshBottomToolbarFromPreferences()
            webView.post {
                hideImeWhileResumeIsSuppressed(generation)
                restoreImeResizeAfterResume(generation)
            }
            AppDiagnostics.record(
                this,
                "ime_resume_suppression_started",
                "generation=${generation} adjust=nothing viewFocused=${webView.isFocused} windowFocused=${window.decorView.hasWindowFocus()} imeVisible=${editorImeVisible()}"
            )
        }
        dispatchPendingExistingDocumentFocus()
    }

    override fun onPause() {
        isActivityResumed = false
        AppDiagnostics.record(this, "window_paused")
        super.onPause()
        PreferenceManager.getDefaultSharedPreferences(this).unregisterOnSharedPreferenceChangeListener(this)
        performAutoSaveOnLeave()
        if (::webView.isInitialized) {
            webView.onPause()
        }
    }

    override fun onSharedPreferenceChanged(sharedPreferences: SharedPreferences?, key: String?) {
        if (key == null || !key.startsWith("pref_")) return
        if (key == "pref_editor_mode") {
            val newMode = sharedPreferences?.getString("pref_editor_mode", "rich_text") ?: "rich_text"
            if (newMode != currentEditorMode) {
                if (isDirty) {
                    showUnsavedChangesDialog {
                        currentEditorMode = newMode
                        if (::webView.isInitialized) {
                            webView.evaluateJavascript("window.editorBridge.setEditorMode('$newMode');", null)
                        }
                    }
                } else {
                    currentEditorMode = newMode
                    if (::webView.isInitialized) {
                        webView.evaluateJavascript("window.editorBridge.setEditorMode('$newMode');", null)
                    }
                }
            }
            return
        }
        if (::webView.isInitialized) {
            applyThemeAndFullscreenPreferences()
            if (key == "pref_toolbar_bottom_config" ||
                key == "pref_toolbar_floating_config") {
                refreshBottomToolbarFromPreferences()
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        AppDiagnostics.record(this, "window_focus", hasFocus.toString())
        if (hasFocus && suppressImeUntilUserTouch && ::webView.isInitialized) {
            val generation = imeHideGeneration
            webView.post { hideImeWhileResumeIsSuppressed(generation) }
        }
    }

    private fun editorImeVisible(): Boolean {
        val visible = ViewCompat.getRootWindowInsets(webView)
            ?.isVisible(WindowInsetsCompat.Type.ime()) == true
        lastKnownImeVisible = visible
        return visible
    }

    private fun requestEditorKeyboard(refocusWebView: Boolean) {
        runOnUiThread {
            val visibleBefore = editorImeVisible()
            AppDiagnostics.record(
                this,
                "ime_show_requested",
                "suppressed=${suppressImeUntilUserTouch} generation=${imeHideGeneration} " +
                    "viewFocused=${webView.isFocused} windowFocused=${window.decorView.hasWindowFocus()} " +
                    "imeVisible=${visibleBefore} refocusWebView=${refocusWebView}"
            )
            suppressImeUntilUserTouch = false
            val generation = ++imeHideGeneration
            window.setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                    WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED
            )
            val touchFocusRequested =
                if (refocusWebView) webView.requestFocusFromTouch() else false
            val focusRequested =
                if (refocusWebView) touchFocusRequested || webView.requestFocus()
                else webView.isFocused
            val insetsController = ViewCompat.getWindowInsetsController(webView)
            insetsController?.show(WindowInsetsCompat.Type.ime())
            val showAccepted =
                (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
                    ?.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
            AppDiagnostics.record(
                this,
                "ime_show_dispatched",
                "generation=${generation} touchFocus=${touchFocusRequested} " +
                    "focusRequested=${focusRequested} viewFocused=${webView.isFocused} " +
                    "immAccepted=${showAccepted} touchFocusable=${webView.isFocusableInTouchMode} " +
                    "refocusWebView=${refocusWebView}"
            )
            webView.postDelayed({
                AppDiagnostics.record(
                    this,
                    "ime_show_observed",
                    "generation=${generation} viewFocused=${webView.isFocused} " +
                        "windowFocused=${window.decorView.hasWindowFocus()} " +
                        "imeVisible=${editorImeVisible()} refocusWebView=${refocusWebView}"
                )
            }, 350L)
        }
    }

    private fun hideImeWhileResumeIsSuppressed(generation: Int) {
        if (!suppressImeUntilUserTouch || generation != imeHideGeneration || !::webView.isInitialized) {
            return
        }
        val visibleBefore = editorImeVisible()
        ViewCompat.getWindowInsetsController(webView)
            ?.hide(WindowInsetsCompat.Type.ime())
        (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
            ?.hideSoftInputFromWindow(webView.windowToken, 0)
        AppDiagnostics.record(
            this,
            "ime_resume_hide_applied",
            "generation=${generation} visibleBefore=${visibleBefore} visibleAfter=${editorImeVisible()} viewFocused=${webView.isFocused}"
        )
    }

    private fun restoreImeResizeAfterResume(
        generation: Int,
        attempts: Int = 0,
        stableHiddenChecks: Int = 0
    ) {
        if (!suppressImeUntilUserTouch || generation != imeHideGeneration || !::webView.isInitialized) {
            return
        }
        if (editorImeVisible()) {
            if (attempts >= 12) {
                AppDiagnostics.record(
                    this,
                    "ime_resume_adjustment_still_suppressed",
                    "generation=${generation} imeVisible=true"
                )
                return
            }
            hideImeWhileResumeIsSuppressed(generation)
            webView.postDelayed({
                restoreImeResizeAfterResume(generation, attempts + 1, 0)
            }, 80L)
            return
        }
        if (stableHiddenChecks < 2) {
            webView.postDelayed({
                restoreImeResizeAfterResume(generation, attempts + 1, stableHiddenChecks + 1)
            }, 80L)
            return
        }
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
        )
        AppDiagnostics.record(
            this,
            "ime_resume_resize_restored",
            "generation=${generation} stableHiddenChecks=${stableHiddenChecks}"
        )
    }

    private fun performAutoSaveOnLeave() {
        if (!isDirty || currentFileUri == null) return
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val autoSaveEnabled = prefs.getBoolean("pref_auto_save_on_leave", true)
        if (autoSaveEnabled) {
            currentFileUri?.let { uri ->
                val cachedMarkdownContent = latestMarkdownContent
                if (cachedMarkdownContent != null) {
                    if (currentRevision == 0L) {
                        AppDiagnostics.record(this, "save_skipped_unmodified_session")
                        return
                    }
                    saveFileToUri(uri, cachedMarkdownText = cachedMarkdownContent)
                } else {
                    saveFileToUri(uri)
                }
            }
        }
    }

    private fun setupWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }

        webView.addJavascriptInterface(WebAppInterface(), "AndroidNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.path?.startsWith("/textpack-assets/") == true && request != null) {
                    return interceptTextPackAssetRequest(request)
                }
                if (url.path?.startsWith("/markdown-assets/") == true && request != null) {
                    return interceptMarkdownAssetRequest(request)
                }
                if (url.path?.startsWith("/mdzip-assets/") == true && request != null) {
                    return interceptMdzipAssetRequest(request)
                }
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                AppDiagnostics.record(this@MainActivity, "web_page_ready")
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: android.webkit.WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    AppDiagnostics.record(
                        this@MainActivity,
                        "web_main_frame_error",
                        "code=${error?.errorCode} description=${error?.description}"
                    )
                }
                super.onReceivedError(view, request, error)
            }

            override fun onRenderProcessGone(
                view: WebView?,
                detail: android.webkit.RenderProcessGoneDetail?
            ): Boolean {
                AppDiagnostics.record(
                    this@MainActivity,
                    "webview_render_process_gone",
                    "didCrash=${detail?.didCrash()} priority=${detail?.rendererPriorityAtExit()}"
                )
                return super.onRenderProcessGone(view, detail)
            }
        }

        webView.webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                if (consoleMessage?.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) {
                    AppDiagnostics.record(
                        this@MainActivity,
                        "web_console_error",
                        "line=${consoleMessage.lineNumber()} message=${consoleMessage.message()}"
                    )
                }
                return super.onConsoleMessage(consoleMessage)
            }

            override fun onJsPrompt(
                view: WebView?,
                url: String?,
                message: String?,
                defaultValue: String?,
                result: android.webkit.JsPromptResult?
            ): Boolean {
                val input = EditText(this@MainActivity)
                input.setText(defaultValue ?: "")
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(message ?: "Enter URL")
                    .setView(input)
                    .setPositiveButton("OK") { _, _ ->
                        result?.confirm(input.text.toString())
                    }
                    .setNegativeButton("Cancel") { _, _ ->
                        result?.cancel()
                    }
                    .setOnCancelListener {
                        result?.cancel()
                    }
                    .show()
                return true
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
    }

    private fun updateTitle() {
        val dirtyIndicator = if (isDirty) " *" else ""
        val titleText = "$currentFileName$dirtyIndicator"
        val escapedTitle = JSONObjectWrapper.quote(titleText)
        val escapedDocumentKey = JSONObjectWrapper.quote(currentDocumentHistoryKey())
        val escapedHistoryState = JSONObjectWrapper.quote(documentHistoryStateJson())
        val canGoBack = canNavigateDocumentBack()
        val canGoForward = canNavigateDocumentForward()
        webView.evaluateJavascript(
            "if (window.editorBridge) { window.editorBridge.setDocumentTitle($escapedTitle, $escapedDocumentKey); window.editorBridge.setDocumentHistoryState($canGoBack, $canGoForward); window.leftPanelController?.onDocumentHistoryStateChanged?.($escapedHistoryState); }",
            null
        )
    }

    private fun currentDocumentHistoryKey(): String {
        return currentFileUri?.toString() ?: "untitled:$taskId:$currentDocumentSessionId"
    }

    private fun persistDocumentUriPermission(uri: Uri, grantedFlags: Int? = null) {
        val readWriteFlags =
            android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        val flagsToPersist = (grantedFlags ?: readWriteFlags) and readWriteFlags
        if (flagsToPersist == 0) return

        try {
            contentResolver.takePersistableUriPermission(
                uri,
                flagsToPersist
            )
        } catch (_: Exception) {
            // Some providers grant access only for the current session.
        }
    }

    private fun hasWriteUriPermission(uri: Uri): Boolean {
        return checkUriPermission(
            uri,
            android.os.Process.myPid(),
            android.os.Process.myUid(),
            android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    private fun hasPersistedReadAccess(uri: Uri): Boolean {
        if (
            contentResolver.persistedUriPermissions.any {
                it.uri == uri && it.isReadPermission
            }
        ) {
            return true
        }
        val treeUri = leftPanelTreeForDocument(uri) ?: return false
        return contentResolver.persistedUriPermissions.any {
            it.uri == treeUri && it.isReadPermission
        }
    }

    private fun findPersistedFolderDocumentUri(documentUri: Uri): Uri? {
        for (permission in contentResolver.persistedUriPermissions) {
            if (
                !permission.isReadPermission ||
                !permission.isWritePermission ||
                !android.provider.DocumentsContract.isTreeUri(permission.uri)
            ) continue
            val candidate = runCatching {
                resolveRenameTargetInTree(permission.uri, documentUri)
            }.getOrNull() ?: continue
            if (hasWriteUriPermission(candidate)) {
                return candidate
            }
        }
        return null
    }

    private fun launchRenameFolderPicker(uri: Uri, targetName: String) {
        pendingRenamePermissionRequest = RenameAccessRequest(uri, targetName)
        val intent = android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PREFIX_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
            val initialFolder = runCatching {
                val path = android.provider.DocumentsContract.findDocumentPath(contentResolver, uri)
                val parentDocumentId = path?.path?.dropLast(1)?.lastOrNull()
                if (parentDocumentId.isNullOrBlank() || uri.authority.isNullOrBlank()) {
                    null
                } else {
                    android.provider.DocumentsContract.buildDocumentUri(
                        uri.authority!!,
                        parentDocumentId
                    )
                }
            }.getOrNull()
            if (initialFolder != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI, initialFolder)
            }
        }
        renameFolderLauncher.launch(intent)
    }

    private fun handleRenameFolderSelection(
        resultCode: Int,
        resultIntent: android.content.Intent?
    ) {
        val request = pendingRenamePermissionRequest ?: return
        pendingRenamePermissionRequest = null
        val selectedIntent = resultIntent
        if (resultCode != android.app.Activity.RESULT_OK || selectedIntent == null) {
            updateTitle()
            showRenameAccessOptions(request, "No folder access was selected.")
            return
        }
        val treeUri = selectedIntent.data
        if (treeUri == null) {
            updateTitle()
            showRenameAccessOptions(request, "No folder access was selected.")
            return
        }

        val grantedFlags = selectedIntent.flags
        val readWriteFlags =
            android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        val persistableFlags = grantedFlags and readWriteFlags
        if (persistableFlags != readWriteFlags) {
            showRenameAccessOptions(
                request,
                "Android did not grant write access to that folder."
            )
            return
        }
        persistDocumentUriPermission(treeUri, grantedFlags)
        val hasPersistedTreeWritePermission = contentResolver.persistedUriPermissions.any {
            it.uri == treeUri && it.isReadPermission && it.isWritePermission
        }
        if (!hasPersistedTreeWritePermission) {
            showRenameAccessOptions(
                request,
                "Android did not allow the folder permission to be saved for later."
            )
            return
        }

        val treeScopedDocumentUri = resolveRenameTargetInTree(treeUri, request.uri)
        if (treeScopedDocumentUri == null) {
            releasePersistedTreePermission(treeUri, persistableFlags)
            showRenameAccessOptions(
                request,
                "Select the folder that contains the currently open file. For files in a subfolder, choose that subfolder."
            )
            return
        }
        renameCurrentDocument(request.targetName, treeScopedDocumentUri)
    }

    private fun resolveRenameTargetInTree(treeUri: Uri, sourceUri: Uri): Uri? {
        val documentId = runCatching {
            if (
                sourceUri.authority == treeUri.authority &&
                android.provider.DocumentsContract.isDocumentUri(this, sourceUri)
            ) {
                android.provider.DocumentsContract.getDocumentId(sourceUri)
            } else {
                null
            }
        }.getOrNull()

        if (!documentId.isNullOrBlank()) {
            val scopedUri = runCatching {
                android.provider.DocumentsContract.buildDocumentUriUsingTree(
                    treeUri,
                    documentId
                )
            }.getOrNull() ?: return null
            val displayName = queryDocumentDisplayName(scopedUri)
            val treeDocumentId = runCatching {
                android.provider.DocumentsContract.getTreeDocumentId(treeUri)
            }.getOrNull()
            val pathIds = runCatching {
                android.provider.DocumentsContract.findDocumentPath(contentResolver, scopedUri)
                    ?.path
                    .orEmpty()
            }.getOrNull().orEmpty()
            val treeId = treeDocumentId?.takeIf { it.isNotBlank() }
            val isInSelectedTree = if (pathIds.isEmpty()) {
                displayName == currentFileName
            } else {
                pathIds.lastOrNull() == documentId &&
                    treeId != null &&
                    treeId in pathIds.dropLast(1)
            }
            return scopedUri.takeIf {
                isInSelectedTree &&
                    (displayName == null || displayName == currentFileName)
            }
        }

        return findDirectChildDocumentUri(treeUri, currentFileName)
    }

    private fun queryDocumentDisplayName(uri: Uri): String? {
        return runCatching {
            contentResolver.query(
                uri,
                arrayOf(android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME),
                null,
                null,
                null
            )?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(
                    android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME
                )
                if (nameIndex >= 0 && cursor.moveToFirst()) cursor.getString(nameIndex) else null
            }
        }.getOrNull()
    }

    private fun findDirectChildDocumentUri(treeUri: Uri, displayName: String): Uri? {
        val treeDocumentId = runCatching {
            android.provider.DocumentsContract.getTreeDocumentId(treeUri)
        }.getOrNull() ?: return null
        val childrenUri = runCatching {
            android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(
                treeUri,
                treeDocumentId
            )
        }.getOrNull() ?: return null

        return runCatching {
            contentResolver.query(
                childrenUri,
                arrayOf(
                    android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME
                ),
                null,
                null,
                null
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndex(
                    android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID
                )
                val nameIndex = cursor.getColumnIndex(
                    android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME
                )
                if (idIndex < 0 || nameIndex < 0) return@use null
                while (cursor.moveToNext()) {
                    if (cursor.getString(nameIndex) == displayName) {
                        return@use android.provider.DocumentsContract.buildDocumentUriUsingTree(
                            treeUri,
                            cursor.getString(idIndex)
                        )
                    }
                }
                null
            }
        }.getOrNull()
    }

    private fun releasePersistedTreePermission(uri: Uri, flags: Int) {
        if (flags == 0) return
        runCatching {
            contentResolver.releasePersistableUriPermission(uri, flags)
        }
    }

    private fun showRenameAccessOptions(
        request: RenameAccessRequest,
        message: String
    ) {
        updateTitle()
        val downloadsNote = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            " On Android 11 and later, Android blocks selecting the Downloads folder itself. Choose an allowed subfolder or save a copy."
        } else {
            ""
        }
        AlertDialog.Builder(this)
            .setTitle("Choose access for renaming")
            .setMessage(
                "$message Choose access to the containing folder, or save a copy if the provider does not support renaming.$downloadsNote"
            )
            .setPositiveButton("Choose Folder") { _, _ ->
                launchRenameFolderPicker(request.uri, request.targetName)
            }
            .setNegativeButton("Save As") { _, _ ->
                updateTitle()
                launchRenameSaveAs(request.targetName)
            }
            .setOnCancelListener { updateTitle() }
            .show()
    }

    private fun remapDocumentNavigationHistory(oldKey: String, newKey: String) {
        if (oldKey == newKey) return
        val escapedOldKey = JSONObjectWrapper.quote(oldKey)
        val escapedNewKey = JSONObjectWrapper.quote(newKey)
        webView.evaluateJavascript(
            "window.editorBridge?.remapDocumentHistory?.($escapedOldKey, $escapedNewKey);",
            null
        )
    }

    private fun replaceHistoryUri(oldUri: Uri, newUri: Uri) {
        fun replaceIn(stack: java.util.ArrayDeque<Uri>) {
            val entries = stack.map { if (it == oldUri) newUri else it }
            stack.clear()
            entries.forEach { stack.addLast(it) }
        }
        synchronized(documentHistoryLock) {
            replaceIn(documentHistoryStack)
            replaceIn(documentForwardStack)
        }
    }

    private fun saveCurrentStateBeforeSettings() {
        if (!isEditorReady) return
        webView.evaluateJavascript("window.editorBridge.getSelectionState();") { selectionJson ->
            val fileName = currentFileName
            if (fileName.isNotEmpty() && fileName != getString(R.string.untitled_document)) {
                val key = "doc_$fileName"
                val prefs = PreferenceManager.getDefaultSharedPreferences(this)
                prefs.edit().putString("cursor_sel_$key", selectionJson).apply()
            }
        }
    }

    private fun refreshBottomToolbarFromPreferences() {
        if (!isEditorReady || !::webView.isInitialized) return
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val bottomConfig = prefs.getString("pref_toolbar_bottom_config", null)
        val defaultFloatingConfig = ToolbarDefaults.floatingToolbarConfigJson(this)
        val floatingConfig = prefs.getString(
            "pref_toolbar_floating_config",
            defaultFloatingConfig
        ) ?: defaultFloatingConfig
        val escapedConfig = bottomConfig?.let { JSONObjectWrapper.quote(it) } ?: "null"
        val escapedFloatingConfig = floatingConfig?.let { JSONObjectWrapper.quote(it) } ?: "null"
        webView.evaluateJavascript(
            "window.editorBridge?.applyBottomToolbarConfig?.($escapedConfig);" +
                "window.editorBridge?.applyFloatingToolbarConfig?.($escapedFloatingConfig);",
            null
        )
    }

    private fun applyThemeAndFullscreenPreferences() {
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        PreferenceResetHelper.migratePersistedHeadingDefaults(prefs)
        applySystemBarDimming()

        val jsonObject = org.json.JSONObject()
        val allEntries = prefs.all
        for ((key, value) in allEntries) {
            jsonObject.put(key, value)
        }
        val escapedJson = JSONObjectWrapper.quote(jsonObject.toString())
        webView.evaluateJavascript("if (window.editorBridge && window.editorBridge.applyAllPreferences) { window.editorBridge.applyAllPreferences($escapedJson); }", null)

        val bodyFontFamily = prefs.getString("pref_body_font_family", "default") ?: "default"
        val headingFontFamily = prefs.getString("pref_heading_font_family", "default") ?: "default"
        val fontBodyData = if (bodyFontFamily == "default") {
            loadFontDataUri(prefs.getString("pref_font_file_body_path", null))
        } else {
            null
        }
        val fontHeadingData = if (headingFontFamily == "default") {
            loadFontDataUri(prefs.getString("pref_font_file_heading_path", null))
        } else {
            null
        }
        val fontHeadingLevelsData = (1..6).map { level ->
            loadFontDataUri(prefs.getString("pref_font_file_heading_${level}_path", null))
        }
        val escapedHeadingLevelsData = JSONObjectWrapper.quote(
            org.json.JSONArray(fontHeadingLevelsData).toString()
        )
        val fontBoldData = loadFontDataUri(prefs.getString("pref_font_file_bold_path", null))
        val fontItalicData = loadFontDataUri(prefs.getString("pref_font_file_italic_path", null))
        val fontCodeData = loadFontDataUri(prefs.getString("pref_font_file_code_path", null))
        val fontCalloutHeaderData = loadFontDataUri(prefs.getString("pref_font_file_callout_header_path", null))
        val fontTocData = loadFontDataUri(prefs.getString("pref_font_file_toc_path", null))
        val fontFootnoteData = if (
            prefs.getBoolean("pref_footnote_inherit_body_typography", true)
        ) {
            null
        } else {
            loadFontDataUri(prefs.getString("pref_font_file_footnote_path", null))
        }

        val bodyFontSize = prefs.getInt("pref_body_font_size", 16)
        val headingScalePercent = prefs.getInt("pref_heading_scale_percent", 100)
        val headingScale = headingScalePercent / 100.0
        val fontWeightBold = prefs.getInt("pref_font_weight_bold", 700)
        val fontWeightItalic = prefs.getInt("pref_font_weight_italic", 400)
        val fontWeightHeading = prefs.getInt("pref_font_weight_heading", 700)

        val boldColor = JSONObjectWrapper.quote(prefs.getString("pref_bold_color", "default"))
        val italicColor = JSONObjectWrapper.quote(prefs.getString("pref_italic_color", "default"))
        val linkColor = JSONObjectWrapper.quote(prefs.getString("pref_link_color", "default"))
        val codeColor = JSONObjectWrapper.quote(prefs.getString("pref_code_color", "default"))
        val codeBgColor = JSONObjectWrapper.quote(prefs.getString("pref_code_bg_color", "default"))
        val codeBlockColor = JSONObjectWrapper.quote(prefs.getString("pref_code_block_color", "default"))
        val codeBlockBgColor = JSONObjectWrapper.quote(prefs.getString("pref_code_block_bg_color", "default"))

        val escapedBodyFont = JSONObjectWrapper.quote(fontBodyData)
        val escapedHeadingFont = JSONObjectWrapper.quote(fontHeadingData)
        val escapedBoldFont = JSONObjectWrapper.quote(fontBoldData)
        val escapedItalicFont = JSONObjectWrapper.quote(fontItalicData)
        val escapedCodeFont = JSONObjectWrapper.quote(fontCodeData)
        val escapedCalloutHeaderFont = JSONObjectWrapper.quote(fontCalloutHeaderData)
        val escapedTocFont = JSONObjectWrapper.quote(fontTocData)
        val escapedFootnoteFont = JSONObjectWrapper.quote(fontFootnoteData)
        val escapedBodyFontFamily = JSONObjectWrapper.quote(bodyFontFamily)
        val escapedHeadingFontFamily = JSONObjectWrapper.quote(headingFontFamily)
        val fontOverrides = org.json.JSONObject()
        val fontFamilies = org.json.JSONObject()
        val fontFiles = org.json.JSONObject()
        val familyPreferenceKeys = mapOf(
            "bold" to "pref_bold_font_family",
            "italic" to "pref_italic_font_family",
            "code" to "pref_code_font_family",
            "codeBlock" to "pref_code_block_font_family",
            "blockquote" to "pref_blockquote_font_family",
            "callout" to "pref_callout_font_family",
            "list" to "pref_list_font_family",
            "table" to "pref_table_font_family",
            "toc" to "pref_toc_font_family",
            "leftPanel" to "pref_left_panel_font_family",
            "calloutHeader" to "pref_callout_header_font_family",
            "footnote" to "pref_footnote_font_family"
        )
        familyPreferenceKeys.forEach { (category, preferenceKey) ->
            var family = prefs.getString(preferenceKey, "default") ?: "default"
            val inherited = when (category) {
                "blockquote" -> prefs.getBoolean("pref_blockquote_inherit_body_typography", true)
                "callout" -> prefs.getBoolean("pref_callout_inherit_body_typography", true)
                "list" -> prefs.getBoolean("pref_list_inherit_body_typography", true)
                "table" -> prefs.getBoolean("pref_table_inherit_body_typography", true)
                "footnote" -> prefs.getBoolean("pref_footnote_inherit_body_typography", true)
                else -> false
            }
            if (inherited) family = if (category == "footnote") bodyFontFamily else "default"
            fontFamilies.put(category, family)
        }
        for (level in 1..6) {
            fontFamilies.put(
                "heading$level",
                prefs.getString("pref_heading_${level}_font_family", "default") ?: "default"
            )
        }
        val customFontFiles = mapOf(
            "blockquote" to Pair("pref_font_file_blockquote", !prefs.getBoolean("pref_blockquote_inherit_body_typography", true)),
            "callout" to Pair("pref_font_file_callout", !prefs.getBoolean("pref_callout_inherit_body_typography", true)),
            "codeBlock" to Pair("pref_font_file_code_block", true),
            "list" to Pair("pref_font_file_list", !prefs.getBoolean("pref_list_inherit_body_typography", true)),
            "table" to Pair("pref_font_file_table", !prefs.getBoolean("pref_table_inherit_body_typography", true)),
            "leftPanel" to Pair("pref_font_file_left_panel", true)
        )
        customFontFiles.forEach { (category, target) ->
            val data = if (target.second) {
                loadFontDataUri(prefs.getString("${target.first}_path", null))
            } else {
                null
            }
            fontFiles.put(category, data)
        }
        fontOverrides.put("families", fontFamilies)
        fontOverrides.put("files", fontFiles)
        val escapedFontOverrides = JSONObjectWrapper.quote(fontOverrides.toString())

        webView.evaluateJavascript(
            "if (window.editorBridge && window.editorBridge.setFontSettings) { window.editorBridge.setFontSettings($bodyFontSize, $headingScale, $boldColor, $italicColor, $linkColor, $codeColor, $codeBgColor, $codeBlockColor, $codeBlockBgColor, $escapedBodyFont, $escapedHeadingFont, $escapedBoldFont, $escapedItalicFont, $escapedCodeFont, $fontWeightBold, $fontWeightItalic, $fontWeightHeading, $escapedCalloutHeaderFont, $escapedHeadingLevelsData, $escapedTocFont, $escapedFootnoteFont, $escapedBodyFontFamily, $escapedHeadingFontFamily, $escapedFontOverrides); }",
            null
        )

        // Read and pass all custom hotkey preferences
        val hotkeys = mapOf(
            "new" to prefs.getString("pref_hotkey_new", "ctrl+n"),
            "history_back" to prefs.getString("pref_hotkey_history_back", "alt+left"),
            "history_forward" to prefs.getString("pref_hotkey_history_forward", "alt+right"),
            "open" to prefs.getString("pref_hotkey_open", "ctrl+o"),
            "save" to prefs.getString("pref_hotkey_save", "ctrl+s"),
            "save_as" to prefs.getString("pref_hotkey_save_as", "ctrl+shift+s"),
            "save_tabs" to prefs.getString("pref_hotkey_save_tabs", ""),
            "paste_as_plain_text" to prefs.getString("pref_hotkey_paste_as_plain_text", "ctrl+shift+v"),
            "attachment" to prefs.getString("pref_hotkey_attachment", "ctrl+shift+a"),
            "embed" to prefs.getString("pref_hotkey_embed", "ctrl+alt+e"),
            "save_as_textpack" to prefs.getString("pref_hotkey_save_as_textpack", "ctrl+shift+alt+s"),
            "save_as_mdzip" to prefs.getString("pref_hotkey_save_as_mdzip", "ctrl+shift+alt+m"),
            "export" to prefs.getString("pref_hotkey_export", "ctrl+shift+e"),
            "image" to prefs.getString("pref_hotkey_image", "ctrl+shift+i"),
            "settings" to prefs.getString("pref_hotkey_settings", "ctrl+,"),
            "open_with" to prefs.getString("pref_hotkey_open_with", "ctrl+shift+o"),
            "toggle_toolbar" to prefs.getString("pref_hotkey_toggle_toolbar", "ctrl+t"),
            "line_numbers" to prefs.getString("pref_hotkey_line_numbers", "ctrl+alt+l"),
            "line_wrap" to prefs.getString("pref_hotkey_line_wrap", "ctrl+alt+w"),
            "bold" to prefs.getString("pref_hotkey_bold", "ctrl+b"),
            "italic" to prefs.getString("pref_hotkey_italic", "ctrl+i"),
            "underline" to prefs.getString("pref_hotkey_underline", "ctrl+u"),
            "underlineSolid" to prefs.getString("pref_hotkey_underlineSolid", ""),
            "underlineDotted" to prefs.getString("pref_hotkey_underlineDotted", ""),
            "underlineDashed" to prefs.getString("pref_hotkey_underlineDashed", ""),
            "underlineDouble" to prefs.getString("pref_hotkey_underlineDouble", ""),
            "underlineWavy" to prefs.getString("pref_hotkey_underlineWavy", ""),
            "strikethrough" to prefs.getString("pref_hotkey_strikethrough", "ctrl+shift+x"),
            "code" to prefs.getString("pref_hotkey_code", "ctrl+e"),
            "clearFormatting" to prefs.getString("pref_hotkey_clearFormatting", "ctrl+\\"),
            "callout" to prefs.getString("pref_hotkey_callout", "ctrl+alt+q"),
            "link" to prefs.getString("pref_hotkey_link", ""),
            "footnote" to prefs.getString("pref_hotkey_footnote", "ctrl+shift+f"),
            "blockQuote" to prefs.getString("pref_hotkey_blockQuote", "ctrl+shift+q"),
            "codeBlock" to prefs.getString("pref_hotkey_codeBlock", "ctrl+shift+c"),
            "bulletedList" to prefs.getString("pref_hotkey_bulletedList", "ctrl+shift+8"),
            "numberedList" to prefs.getString("pref_hotkey_numberedList", "ctrl+shift+7"),
            "todoList" to prefs.getString("pref_hotkey_todoList", "ctrl+shift+l"),
            "cycleListType" to prefs.getString("pref_hotkey_cycleListType", "ctrl+alt+shift+l"),
            "undo" to prefs.getString("pref_hotkey_undo", "ctrl+z"),
            "redo" to prefs.getString("pref_hotkey_redo", "ctrl+y"),
            "indent" to prefs.getString("pref_hotkey_indent", "tab"),
            "outdent" to prefs.getString("pref_hotkey_outdent", "shift+tab"),
            "moveLineUp" to prefs.getString("pref_hotkey_moveLineUp", "ctrl+alt+up"),
            "moveLineDown" to prefs.getString("pref_hotkey_moveLineDown", "ctrl+alt+down"),
            "deleteLine" to prefs.getString("pref_hotkey_deleteLine", "ctrl+shift+k"),
            "horizontalLine" to prefs.getString("pref_hotkey_horizontalLine", "ctrl+shift+h"),
            "findAndReplace" to prefs.getString("pref_hotkey_findAndReplace", "ctrl+f"),
            "sourceEditing" to prefs.getString("pref_hotkey_sourceEditing", "ctrl+shift+u"),
            "autoHeading" to prefs.getString("pref_hotkey_auto_heading", ""),
            "heading_p" to prefs.getString("pref_hotkey_heading_p", "ctrl+alt+0"),
            "heading_1" to prefs.getString("pref_hotkey_heading_1", "ctrl+alt+1"),
            "heading_2" to prefs.getString("pref_hotkey_heading_2", "ctrl+alt+2"),
            "heading_3" to prefs.getString("pref_hotkey_heading_3", "ctrl+alt+3"),
            "heading_4" to prefs.getString("pref_hotkey_heading_4", "ctrl+alt+4"),
            "heading_5" to prefs.getString("pref_hotkey_heading_5", "ctrl+alt+5"),
            "heading_6" to prefs.getString("pref_hotkey_heading_6", "ctrl+alt+6"),
            "highlightCycle" to prefs.getString("pref_hotkey_highlight_yellow", "ctrl+alt+y"),
            "highlightYellow" to prefs.getString("pref_hotkey_marker_yellow", ""),
            "highlightGreen" to prefs.getString("pref_hotkey_marker_green", ""),
            "highlightPink" to prefs.getString("pref_hotkey_marker_pink", ""),
            "highlightBlue" to prefs.getString("pref_hotkey_marker_blue", ""),
            "penCycle" to prefs.getString("pref_hotkey_highlight_red_pen", "ctrl+alt+r"),
            "penRed" to prefs.getString("pref_hotkey_pen_red", ""),
            "penGreen" to prefs.getString("pref_hotkey_pen_green", ""),
            "penBlue" to prefs.getString("pref_hotkey_pen_blue", ""),
            "penPurple" to prefs.getString("pref_hotkey_pen_purple", "")
        )
        val hotkeysJson = org.json.JSONObject(hotkeys).toString()
        val escapedHotkeys = JSONObjectWrapper.quote(hotkeysJson)
        webView.evaluateJavascript("if (window.editorBridge && typeof window.editorBridge.setHotkeys === 'function') { window.editorBridge.setHotkeys($escapedHotkeys); }", null)
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        menu?.add(0, 0x4d44, 100, "Diagnostic report")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            0x4d44 -> {
                AppDiagnostics.show(this)
                true
            }
            R.id.action_new -> {
                handleNewFile()
                true
            }
            R.id.action_open -> {
                handleOpenFile()
                true
            }
            R.id.action_save -> {
                handleSaveFile()
                true
            }
            R.id.action_save_as -> {
                handleSaveAsFile()
                true
            }
            R.id.action_save_as_textpack -> {
                handleSaveAsTextPackFile()
                true
            }
            R.id.action_save_as_mdzip -> {
                handleSaveAsMdzipFile()
                true
            }
            R.id.action_export -> {
                handleExportDocument()
                true
            }
            R.id.action_insert_image -> {
                handleInsertImage()
                true
            }
            R.id.action_insert_audio -> {
                handleInsertAudio()
                true
            }
            R.id.action_settings -> {
                saveCurrentStateBeforeSettings()
                settingsLauncher.launch(android.content.Intent(this, SettingsActivity::class.java))
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun handleNewFile() {
        if (isDirty) {
            AlertDialog.Builder(this)
                .setTitle("Save current changes first?")
                .setMessage("Save the current document before creating another file.")
                .setPositiveButton("Save") { _, _ -> handleSaveFile() }
                .setNegativeButton(R.string.cancel, null)
                .show()
            return
        }
        requestNewDocument(DocumentFormat.MARKDOWN)
    }

    private fun requestNewDocument(format: DocumentFormat) {
        if (format != DocumentFormat.MARKDOWN && format != DocumentFormat.MDZIP) return
        pendingCreateNewDocumentFormat = format
        pendingCreateDocumentAsTextPack = null
        pendingCreateDocumentAsMdzip = null
        pendingCreateDocumentSessionId = null
        val suggestedName = if (format == DocumentFormat.MDZIP) "Untitled.mdz" else "Untitled.md"
        if (format == DocumentFormat.MDZIP) {
            createMdzipDocumentLauncher.launch(suggestedName)
        } else {
            createDocumentLauncher.launch(suggestedName)
        }
    }

    private fun createNewSavedDocument(uri: Uri, format: DocumentFormat) {
        var targetUri = uri
        try {
            val extension = if (format == DocumentFormat.MDZIP) ".mdz" else ".md"
            targetUri = ensureDocumentExtension(uri, extension)
            val fileName = getFileNameFromUri(targetUri)
            if (format == DocumentFormat.MDZIP) {
                val session = MdzipManager.create(this, "", fileName)
                try {
                    MdzipManager.save(this, session, "", targetUri)
                } finally {
                    session.sessionDir.deleteRecursively()
                }
            } else {
                val output = contentResolver.openOutputStream(targetUri, "wt")
                    ?: throw java.io.IOException("Could not create the selected Markdown file.")
                output.use { it.write(ByteArray(0)) }
            }
            persistDocumentUriPermission(targetUri)
            val uriLiteral = JSONObjectWrapper.quote(targetUri.toString())
            webView.evaluateJavascript(
                "window.leftPanelController?.openDocumentFromNative?.($uriLiteral) === true;"
            ) { opened ->
                if (opened != "true" && !isFinishing) {
                    openFile(
                        targetUri,
                        forceReload = true,
                        permissionFlags = android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )
                }
            }
        } catch (error: Exception) {
            runCatching { android.provider.DocumentsContract.deleteDocument(contentResolver, targetUri) }
            if (targetUri != uri) {
                runCatching { android.provider.DocumentsContract.deleteDocument(contentResolver, uri) }
            }
            AlertDialog.Builder(this)
                .setTitle("Could not create file")
                .setMessage(error.localizedMessage ?: "The file was not created.")
                .setPositiveButton(android.R.string.ok, null)
                .show()
        }
    }

    private fun ensureDocumentExtension(uri: Uri, extension: String): Uri {
        val name = getFileNameFromUri(uri)
        if (name.endsWith(extension, ignoreCase = true)) return uri
        val stem = if (name.startsWith(".")) {
            name
        } else {
            name.substringBeforeLast('.', name).ifBlank { name }
        }
        val renamed = android.provider.DocumentsContract.renameDocument(
            contentResolver,
            uri,
            "$stem$extension"
        )
        return renamed ?: throw java.io.IOException(
            "Could not add $extension to the file name. Choose a name ending in $extension."
        )
    }

    private fun createNewDocument() {
        synchronized(documentHistoryLock) {
            currentFileUri?.let { documentHistoryStack.push(it) }
            documentForwardStack.clear()
        }
        clearEmbeddedMdzipSessions()
        currentDocumentSessionId = java.util.UUID.randomUUID().toString()
        currentRevision = 0
        currentEmptyContentExplicitlyEdited = false
        currentTextPackSession = null
        currentMdzipSession = null
        currentDocumentFormat = DocumentFormat.MARKDOWN
        latestMarkdownContent = ""
        currentFileUri = null
        currentFileName = getString(R.string.untitled_document)
        isDirty = false
        updateTitle()
        webView.evaluateJavascript("window.editorBridge.setMarkdown('');", null)
    }

    private fun navigateBackOrFinish() {
        val previousUri = synchronized(documentHistoryLock) {
            if (documentHistoryStack.isEmpty()) {
                null
            } else {
                documentHistoryStack.pop().also {
                    currentFileUri?.let { current -> documentForwardStack.push(current) }
                }
            }
        }
        if (previousUri != null) {
            openFileFromHistory(previousUri)
            updateTitle()
        } else {
            finish()
        }
    }

    private fun navigateCombinedHistory(
        direction: String,
        finishWhenBackUnavailable: Boolean = false
    ) {
        val directionJson = JSONObjectWrapper.quote(direction)
        val script =
            "(window.editorBridge && typeof window.editorBridge.navigateInDocumentHistory === 'function') " +
                "? window.editorBridge.navigateInDocumentHistory($directionJson) : false"
        webView.evaluateJavascript(script) { handled ->
            if (handled == "true") return@evaluateJavascript

            when {
                direction == "back" && canNavigateDocumentBack() -> {
                    if (isDirty) {
                        showUnsavedChangesDialog { navigateBackOrFinish() }
                    } else {
                        navigateBackOrFinish()
                    }
                }
                direction == "forward" && canNavigateDocumentForward() -> {
                    if (isDirty) {
                        showUnsavedChangesDialog { navigateForwardDocument() }
                    } else {
                        navigateForwardDocument()
                    }
                }
                direction == "back" && finishWhenBackUnavailable -> {
                    if (isDirty) {
                        showUnsavedChangesDialog { finish() }
                    } else {
                        finish()
                    }
                }
            }
        }
    }

    private fun navigateForwardDocument() {
        val nextUri = synchronized(documentHistoryLock) {
            if (documentForwardStack.isEmpty()) {
                null
            } else {
                documentForwardStack.pop().also {
                    currentFileUri?.let { current -> documentHistoryStack.push(current) }
                }
            }
        } ?: return
        beginTabHistoryNavigation()
        openFile(nextUri, rememberHistory = false, skipExistingWindowFocus = true)
        updateTitle()
    }

    private fun openFileFromHistory(uri: Uri) {
        beginTabHistoryNavigation()
        openFile(uri, rememberHistory = false, skipExistingWindowFocus = true)
    }

    private fun createOpenDocumentIntent(initialUri: Uri? = null): android.content.Intent {
        val mimeTypes = arrayOf(
            "text/markdown",
            "text/plain",
            "application/zip",
            "application/x-zip-compressed",
            "*/*"
        )
        return android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(android.content.Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(android.content.Intent.EXTRA_MIME_TYPES, mimeTypes)
            addFlags(
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
            if (initialUri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI, initialUri)
            }
        }
    }

    private fun launchOpenDocumentPicker(initialUri: Uri? = null) {
        openDocumentLauncher.launch(createOpenDocumentIntent(initialUri))
    }

    private fun handleOpenFile() {
        if (isDirty) {
            showUnsavedChangesDialog { launchOpenDocumentPicker() }
        } else {
            launchOpenDocumentPicker()
        }
    }

    private fun openFile(
        uri: Uri,
        rememberHistory: Boolean = true,
        forceReload: Boolean = false,
        skipExistingWindowFocus: Boolean = false,
        permissionFlags: Int? = null
    ) {
        persistDocumentUriPermission(uri, permissionFlags)
        if (!isEditorReady) {
            pendingOpenUri = uri
            pendingOpenPermissionFlags = permissionFlags
            return
        }

        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        if (isWmdxTabSession(uri)) {
            restoreWmdxTabSession(uri)
            return
        }
        if (!forceReload && currentFileUri == uri && !isDirty) return
        if (!skipExistingWindowFocus && WindowRegistry.focus(this, uri)) return
        synchronized(documentHistoryLock) {
            if (rememberHistory && currentFileUri != null && currentFileUri != uri) {
                documentHistoryStack.push(currentFileUri)
                documentForwardStack.clear()
            }
        }

        AppDiagnostics.record(this, "native_read_start")
        val readStarted = android.os.SystemClock.elapsedRealtime()

        try {
            val fileName = getFileNameFromUri(uri)

            if (MdzipManager.isMdzipFileName(fileName)) {
                val session = MdzipManager.open(this, uri)
                val text = session.markdownContent
                hasBom = text.startsWith("\uFEFF")
                hasCrlf = text.contains("\r\n")
                val lines = text.lineSequence().count()
                val readMs = android.os.SystemClock.elapsedRealtime() - readStarted
                AppDiagnostics.record(this, "mdzip_read_done", "chars=${text.length} lines=$lines ms=$readMs")

                currentTextPackSession = null
                currentMdzipSession = session
                currentDocumentFormat = DocumentFormat.MDZIP
                clearEmbeddedMdzipSessions()
                currentDocumentSessionId = java.util.UUID.randomUUID().toString()
                currentRevision = 0
                currentEmptyContentExplicitlyEdited = false
                latestMarkdownContent = text
                currentFileUri = uri
                currentFileName = fileName
                isDirty = false
                updateTitle()

                prefs.edit().putString("last_opened_uri", uri.toString()).apply()

                val escaped = JSONObjectWrapper.quote(text)
                webView.evaluateJavascript("window.editorBridge.setMarkdown($escaped);") {
                    webView.post {
                        webView.requestFocus()
                        webView.requestLayout()
                        webView.invalidate()
                        webView.postInvalidate()
                    }
                }
            } else if (TextPackManager.isTextPackFile(this, uri, fileName)) {
                val session = TextPackManager.openTextPack(this, uri)
                val text = session.markdownContent
                hasBom = text.startsWith("\uFEFF")
                hasCrlf = text.contains("\r\n")
                val lines = text.lineSequence().count()
                val readMs = android.os.SystemClock.elapsedRealtime() - readStarted
                AppDiagnostics.record(this, "textpack_read_done", "chars=${text.length} lines=$lines ms=$readMs")

                currentTextPackSession = session
                currentMdzipSession = null
                currentDocumentFormat = DocumentFormat.TEXT_PACK
                clearEmbeddedMdzipSessions()
                currentDocumentSessionId = java.util.UUID.randomUUID().toString()
                currentRevision = 0
                currentEmptyContentExplicitlyEdited = false
                latestMarkdownContent = text
                currentFileUri = uri
                currentFileName = fileName
                isDirty = false
                updateTitle()

                prefs.edit().putString("last_opened_uri", uri.toString()).apply()

                val escaped = JSONObjectWrapper.quote(text)
                webView.evaluateJavascript("window.editorBridge.setMarkdown($escaped);") {
                    webView.post {
                        webView.requestFocus()
                        webView.requestLayout()
                        webView.invalidate()
                        webView.postInvalidate()
                    }
                }
            } else {
                currentTextPackSession = null
                currentMdzipSession = null
                currentDocumentFormat = DocumentFormat.MARKDOWN
                val inputStream = contentResolver.openInputStream(uri)
                    ?: throw java.io.FileNotFoundException("Could not read the selected file")
                inputStream.use {
                    val loadedMarkdown = MarkdownTextFileCodec.read(inputStream)
                    val content = loadedMarkdown.markdown
                    hasBom = loadedMarkdown.hadBom
                    hasCrlf = loadedMarkdown.hadCrlf
                    clearEmbeddedMdzipSessions()
                    currentDocumentSessionId = java.util.UUID.randomUUID().toString()
                    currentRevision = 0
                    currentEmptyContentExplicitlyEdited = false
                    latestMarkdownContent = content
                    val lines = content.lineSequence().count()
                    val readMs = android.os.SystemClock.elapsedRealtime() - readStarted
                    AppDiagnostics.record(this, "file_read_done", "chars=${content.length} lines=$lines ms=$readMs")

                    currentFileUri = uri
                    currentFileName = fileName
                    isDirty = false
                    updateTitle()

                    prefs.edit().putString("last_opened_uri", uri.toString()).apply()

                    val escaped = JSONObjectWrapper.quote(content)
                    webView.evaluateJavascript("window.editorBridge.setMarkdown($escaped);") {
                        webView.post {
                            webView.requestFocus()
                            webView.requestLayout()
                            webView.invalidate()
                            webView.postInvalidate()
                        }
                    }
                }
            }
        } catch (e: Exception) {
            webView.evaluateJavascript(
                "window.leftPanelController?.onTabHistoryNavigationCancelled?.();",
                null
            )
            WindowRegistry.register(this, currentFileUri)
            AppDiagnostics.record(this, "file_load_error", "category=${e.javaClass.simpleName}")
            ThemedToast.show(this, "Failed to open file: ${e.localizedMessage}", Toast.LENGTH_LONG)
        }
    }

    private fun restoreCursorAndScrollState() {
        val fileName = currentFileName
        if (fileName.isEmpty() || fileName == getString(R.string.untitled_document)) return
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val key = "cursor_scroll_${currentDocumentHistoryKey()}"
        val legacyKey = "cursor_scroll_doc_$fileName"
        val savedScroll = prefs.getInt(key, prefs.getInt(legacyKey, 0))
        if (!prefs.contains(key) && prefs.contains(legacyKey)) {
            prefs.edit().putInt(key, savedScroll).apply()
        }
        webView.evaluateJavascript("window.editorBridge.setScrollPosition($savedScroll);", null)
    }

    private fun sanitizeWmdxTabSession(rawJson: String): String? {
        if (rawJson.length > MAX_WMDX_TAB_SESSION_BYTES) return null
        return try {
            val source = org.json.JSONObject(rawJson)
            if (
                source.optString("format") != "wmdx-tabs-session" ||
                source.optInt("version") != 1
            ) return null
            val sourceTabs = source.optJSONArray("tabs") ?: return null
            if (sourceTabs.length() !in 0..200) return null

            val sourceGroups = source.optJSONArray("groups") ?: JSONArray()
            val groups = linkedMapOf<String, org.json.JSONObject>()
            for (index in 0 until minOf(sourceGroups.length(), 200)) {
                val group = sourceGroups.optJSONObject(index) ?: continue
                val id = group.optString("id").trim().take(128)
                if (id.isEmpty() || groups.containsKey(id)) continue
                val name = group.optString("name", "Group").trim().take(80)
                groups[id] = org.json.JSONObject()
                    .put("id", id)
                    .put("name", name.ifEmpty { "Group" })
                    .put("collapsed", group.optBoolean("collapsed", false))
            }

            val tabs = JSONArray()
            val ids = mutableSetOf<String>()
            val uris = mutableSetOf<String>()
            val usedGroups = mutableSetOf<String>()
            for (index in 0 until sourceTabs.length()) {
                val tab = sourceTabs.optJSONObject(index) ?: continue
                val id = tab.optString("id").trim().take(512)
                if (id.isEmpty() || !ids.add(id)) continue
                val uriValue = tab.opt("uri")
                val uriString = (uriValue as? String)?.takeIf { it.isNotBlank() }
                if (uriString == null || uriString.length > 8192) {
                    ids.remove(id)
                    continue
                }
                val scheme = runCatching { Uri.parse(uriString).scheme?.lowercase() }.getOrNull()
                if (scheme != "content" && scheme != "file") {
                    ids.remove(id)
                    continue
                }
                if (!uris.add(uriString)) {
                    ids.remove(id)
                    continue
                }
                val requestedGroupId = (tab.opt("groupId") as? String)
                    ?.takeIf { groups.containsKey(it) }
                if (requestedGroupId != null) usedGroups.add(requestedGroupId)
                val name = tab.optString("name", "Untitled").trim().take(240)
                val scrollTop = if (tab.isNull("scrollTop")) null else {
                    runCatching {
                        tab.getDouble("scrollTop").toLong().coerceIn(0L, 20000000L)
                    }.getOrNull()
                }
                tabs.put(
                    org.json.JSONObject()
                        .put("id", id)
                        .put("uri", uriString ?: JSONObject.NULL)
                        .put("name", name.ifEmpty { "Untitled" })
                        .put("pinned", tab.optBoolean("pinned", false))
                        .put("groupId", requestedGroupId ?: JSONObject.NULL)
                        .put("scrollTop", scrollTop ?: JSONObject.NULL)
                )
            }
            val groupsJson = JSONArray()
            groups.forEach { (id, group) ->
                if (id in usedGroups) groupsJson.put(group)
            }
            val activeTabId: Any = if (tabs.length() == 0) {
                org.json.JSONObject.NULL
            } else {
                source.optString("activeTabId")
                    .takeIf { it in ids }
                    ?: tabs.getJSONObject(0).getString("id")
            }
            val sanitized = org.json.JSONObject()
                .put("format", "wmdx-tabs-session")
                .put("version", 1)
                .put("activeTabId", activeTabId)
                .put("groups", groupsJson)
                .put("tabs", tabs)
                .toString()
            if (sanitized.toByteArray(Charsets.UTF_8).size > MAX_WMDX_TAB_SESSION_BYTES) {
                null
            } else {
                sanitized
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun pendingWmdxTabSessionCacheFile(uri: Uri): java.io.File {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(uri.toString().toByteArray(Charsets.UTF_8))
        val key = digest.joinToString("") { byte ->
            (byte.toInt() and 0xff).toString(16).padStart(2, '0')
        }
        return java.io.File(cacheDir, "pending-wmdx-session-$key.json")
    }

    private fun writeWmdxTabSession(
        uri: Uri,
        sessionJson: String,
        persistGrant: Boolean = false
    ) {
        val sanitized = sanitizeWmdxTabSession(sessionJson)
            ?: throw java.io.IOException("This is not a supported W.mdx tab session.")
        val output = contentResolver.openOutputStream(uri, "wt")
            ?: throw java.io.IOException("Could not open the selected session file for writing.")
        output.use { it.write(sanitized.toByteArray(Charsets.UTF_8)) }
        if (persistGrant) persistDocumentUriPermission(uri)
    }

    private fun cachePendingWmdxTabSessionSave(uri: Uri, sessionJson: String): Boolean {
        val sanitized = sanitizeWmdxTabSession(sessionJson) ?: return false
        val cacheFile = pendingWmdxTabSessionCacheFile(uri)
        return runCatching {
            val cachedValue = org.json.JSONObject()
                .put("uri", uri.toString())
                .put("session", sanitized)
                .toString()
            cacheFile.writeText(cachedValue)
            cacheFile.isFile
        }.getOrDefault(false)
    }

    private fun clearPendingWmdxTabSessionSave(uri: Uri): Boolean {
        val cacheFile = pendingWmdxTabSessionCacheFile(uri)
        return runCatching { !cacheFile.exists() || cacheFile.delete() || !cacheFile.exists() }
            .getOrDefault(false)
    }

    private fun hasCachedWmdxTabSessionSave(uriString: String): Boolean {
        val uri = runCatching { Uri.parse(uriString) }.getOrNull() ?: return false
        return runCatching { pendingWmdxTabSessionCacheFile(uri).isFile }.getOrDefault(false)
    }

    private fun isWmdxTabSession(uri: Uri): Boolean {
        val name = runCatching { getFileNameFromUri(uri) }.getOrNull().orEmpty()
        return name.endsWith(".wmdx", ignoreCase = true)
    }

    private fun readWmdxTabSession(uri: Uri): org.json.JSONObject {
        if (!isWmdxTabSession(uri)) return org.json.JSONObject().put("isSession", false)
        return runCatching {
            val input = contentResolver.openInputStream(uri)
                ?: throw java.io.FileNotFoundException("Could not open the tab session.")
            val output = java.io.ByteArrayOutputStream()
            input.use { stream ->
                val buffer = ByteArray(8192)
                var total = 0
                while (true) {
                    val count = stream.read(buffer)
                    if (count < 0) break
                    total += count
                    if (total > MAX_WMDX_TAB_SESSION_BYTES) {
                        throw java.io.IOException("The tab session file is too large.")
                    }
                    output.write(buffer, 0, count)
                }
            }
            val sessionJson = sanitizeWmdxTabSession(
                String(output.toByteArray(), Charsets.UTF_8)
            ) ?: throw java.io.IOException("This is not a supported W.mdx tab session.")
            org.json.JSONObject()
                .put("isSession", true)
                .put("ok", true)
                .put("session", org.json.JSONObject(sessionJson))
        }.getOrElse {
            org.json.JSONObject()
                .put("isSession", true)
                .put("ok", false)
                .put("error", it.localizedMessage ?: "Could not read the tab session.")
        }
    }

    private fun restoreWmdxTabSession(uri: Uri) {
        val result = readWmdxTabSession(uri)
        if (!result.optBoolean("ok")) {
            ThemedToast.show(
                this,
                result.optString("error", "Could not read the tab session."),
                Toast.LENGTH_LONG
            )
            return
        }
        val sessionJson = JSONObjectWrapper.quote(result.optJSONObject("session")?.toString())
        val uriJson = JSONObjectWrapper.quote(uri.toString())
        webView.evaluateJavascript(
            "window.leftPanelController?.restorePortableSession?.($sessionJson, $uriJson);",
            null
        )
    }

    private fun handleSaveFile() {
        val targetUri = currentFileUri
        AppDiagnostics.record(
            this,
            "save_action",
            "hasUri=${targetUri != null} format=${currentDocumentFormat.name.lowercase()} " +
                "mdzipSession=${currentMdzipSession != null} textPackSession=${currentTextPackSession != null}"
        )
        if (targetUri != null) {
            saveFileToUri(
                targetUri,
                requestedAsTextPack = currentDocumentFormat == DocumentFormat.TEXT_PACK,
                requestedAsMdzip = currentDocumentFormat == DocumentFormat.MDZIP
            )
            return
        }

        when (currentDocumentFormat) {
            DocumentFormat.MDZIP -> handleSaveAsMdzipFile()
            DocumentFormat.TEXT_PACK -> handleSaveAsTextPackFile()
            DocumentFormat.MARKDOWN -> handleSaveAsFile()
        }
    }

    private fun handleSaveAsFile() {
        launchCreateDocument(defaultMarkdownSaveAsName(), asTextPack = false)
    }

    private fun handleSaveAsTextPackFile() {
        launchCreateDocument(defaultTextPackSaveAsName(), asTextPack = true)
    }

    private fun handleSaveAsMdzipFile() {
        launchCreateDocument(defaultMdzipSaveAsName(), asTextPack = false, asMdzip = true)
    }

    private fun launchCreateDocument(
        fileName: String,
        asTextPack: Boolean?,
        asMdzip: Boolean? = null
    ) {
        pendingCreateDocumentAsTextPack = asTextPack
        pendingCreateDocumentAsMdzip = asMdzip
        pendingCreateDocumentSessionId = currentDocumentSessionId
        if (asTextPack == true) {
            createTextPackDocumentLauncher.launch(fileName)
        } else if (asMdzip == true) {
            createMdzipDocumentLauncher.launch(fileName)
        } else {
            createDocumentLauncher.launch(fileName)
        }
    }

    private fun handleCreateDocumentResult(uri: Uri?) {
        val newDocumentFormat = pendingCreateNewDocumentFormat
        pendingCreateNewDocumentFormat = null
        if (newDocumentFormat != null) {
            pendingCreateDocumentAsTextPack = null
            pendingCreateDocumentAsMdzip = null
            pendingCreateDocumentSessionId = null
            if (uri != null) createNewSavedDocument(uri, newDocumentFormat)
            return
        }
        if (uri != null) {
            pendingRenameFallbackName = null
            val saveAsTextPack = pendingCreateDocumentAsTextPack
            pendingCreateDocumentAsTextPack = null
            val saveAsMdzip = pendingCreateDocumentAsMdzip
            pendingCreateDocumentAsMdzip = null
            val expectedSessionId = pendingCreateDocumentSessionId
            pendingCreateDocumentSessionId = null
            if (expectedSessionId != null && expectedSessionId != currentDocumentSessionId) {
                ThemedToast.show(
                    this,
                    "The active document changed before Save As finished. Nothing was saved.",
                    Toast.LENGTH_LONG
                )
            } else {
                val targetUri = if (saveAsMdzip == true) {
                    normalizeDuplicateMdzipUri(uri)
                } else {
                    uri
                }
                saveFileToUri(
                    targetUri,
                    saveAsTextPack,
                    requestedAsMdzip = saveAsMdzip,
                    expectedDocumentSessionId = expectedSessionId
                )
            }
        } else if (pendingRenameFallbackName != null) {
            pendingCreateDocumentAsTextPack = null
            pendingCreateDocumentAsMdzip = null
            pendingCreateDocumentSessionId = null
            pendingRenameFallbackName = null
            updateTitle()
        } else {
            pendingCreateDocumentAsTextPack = null
            pendingCreateDocumentAsMdzip = null
            pendingCreateDocumentSessionId = null
        }
    }

    private fun normalizeDuplicateMdzipUri(uri: Uri): Uri {
        val correctedName =
            MdzipManager.normalizeDuplicateMdzipFileName(getFileNameFromUri(uri))
                ?: return uri
        val renamedUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            runCatching {
                android.provider.DocumentsContract.renameDocument(
                    contentResolver,
                    uri,
                    correctedName
                )
            }.getOrNull()
        } else {
            null
        }
        if (renamedUri != null) return renamedUri

        ThemedToast.show(
            this,
            "The storage provider could not correct the duplicate MDZip filename.",
            Toast.LENGTH_LONG
        )
        return uri
    }

    private fun defaultMarkdownSaveAsName(): String {
        val name = currentFileName.ifBlank { getString(R.string.untitled_document) }
        val lowerName = name.lowercase()
        val markdownName = when {
            lowerName.endsWith(".textpack.zip") ->
                name.dropLast(".textpack.zip".length) + ".md"
            lowerName.endsWith(".textpack") ->
                name.dropLast(".textpack".length) + ".md"
            lowerName.endsWith(".markdown") || lowerName.endsWith(".md") -> name
            else -> {
                val lastDot = name.lastIndexOf('.')
                val base = if (lastDot > 0) name.substring(0, lastDot) else name
                "$base.md"
            }
        }
        return markdownName
    }

    private fun defaultTextPackSaveAsName(): String {
        val name = currentFileName.ifBlank { getString(R.string.untitled_document) }
        val lowerName = name.lowercase()
        val base = when {
            lowerName.endsWith(".textpack.zip") ->
                name.dropLast(".textpack.zip".length)
            lowerName.endsWith(".textpack") ->
                name.dropLast(".textpack".length)
            else -> {
                val lastDot = name.lastIndexOf('.')
                if (lastDot > 0) name.substring(0, lastDot) else name
            }
        }
        return "$base.textpack"
    }

    private fun defaultMdzipSaveAsName(): String {
        val name = currentFileName.ifBlank { getString(R.string.untitled_document) }
        val lowerName = name.lowercase()
        val base = when {
            lowerName.endsWith(".textpack.zip") ->
                name.dropLast(".textpack.zip".length)
            lowerName.endsWith(".textpack") ->
                name.dropLast(".textpack".length)
            lowerName.endsWith(".mdz") ->
                name.dropLast(".mdz".length)
            lowerName.endsWith(".markdown") ->
                name.dropLast(".markdown".length)
            lowerName.endsWith(".md") ->
                name.dropLast(".md".length)
            else -> {
                val lastDot = name.lastIndexOf('.')
                if (lastDot > 0) name.substring(0, lastDot) else name
            }
        }
        return "${base.ifBlank { "Untitled" }}.mdz"
    }

    private fun renamedDocumentFileName(requestedName: String, originalName: String): String? {
        val sanitized = requestedName.trim()
            .replace('/', '_')
            .replace('\\', '_')
            .filterNot { it.isISOControl() }
            .trimEnd('.')
        if (sanitized.isBlank()) return null
        if (currentFileUri == null) return sanitized

        val extension = when {
            originalName.endsWith(".textpack.zip", ignoreCase = true) -> ".textpack.zip"
            originalName.endsWith(".textpack", ignoreCase = true) -> ".textpack"
            else -> {
                val dot = originalName.lastIndexOf('.')
                if (dot > 0) originalName.substring(dot) else ""
            }
        }
        if (extension.isEmpty()) return sanitized

        val typedExtension = sanitized.lastIndexOf('.').takeIf { it > 0 }
        val base = when {
            sanitized.endsWith(extension, ignoreCase = true) ->
                sanitized.dropLast(extension.length)
            typedExtension != null -> sanitized.substring(0, typedExtension)
            else -> sanitized
        }.trimEnd('.')
        if (base.isBlank()) return null
        return "$base$extension"
    }

    private fun offerSaveAsRenameFallback(targetName: String) {
        updateTitle()
        AlertDialog.Builder(this)
            .setTitle("Rename not supported")
            .setMessage(
                "This file location does not allow renaming. Save a copy under the new name instead? The original file will remain unchanged."
            )
            .setPositiveButton("Save As") { _, _ ->
                launchRenameSaveAs(targetName)
            }
            .setNegativeButton("Cancel") { _, _ ->
                pendingRenameFallbackName = null
                updateTitle()
            }
            .setOnCancelListener {
                pendingRenameFallbackName = null
                updateTitle()
            }
            .show()
    }

    private fun launchRenameSaveAs(targetName: String) {
        pendingRenameFallbackName = targetName
        pendingCreateDocumentAsTextPack = null
        pendingCreateDocumentSessionId = currentDocumentSessionId
        createDocumentLauncher.launch(targetName)
    }

    private fun offerRenamePermissionRecovery(uri: Uri, targetName: String) {
        showRenameAccessOptions(
            RenameAccessRequest(uri, targetName),
            "This storage provider needs permission before it will rename the file."
        )
    }

    private fun renameCurrentDocument(
        requestedName: String,
        renameUri: Uri? = null
    ) {
        val targetName = renamedDocumentFileName(requestedName, currentFileName)
        if (targetName == null) {
            updateTitle()
            ThemedToast.show(this, "Enter a valid document name", Toast.LENGTH_SHORT)
            return
        }
        if (targetName == currentFileName) {
            updateTitle()
            return
        }

        val oldUri = currentFileUri
        if (oldUri == null) {
            currentFileName = targetName
            updateTitle()
            ThemedToast.show(this, "Document name updated", Toast.LENGTH_SHORT)
            return
        }

        val renamedUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            runCatching {
                android.provider.DocumentsContract.renameDocument(
                    contentResolver,
                    renameUri ?: oldUri,
                    targetName
                )
            }.getOrNull()
        } else {
            null
        }

        if (renamedUri == null) {
            if (renameUri != null) {
                offerSaveAsRenameFallback(targetName)
                return
            }
            val persistedFolderUri = findPersistedFolderDocumentUri(oldUri)
            if (persistedFolderUri != null) {
                val renamedThroughFolder = runCatching {
                    android.provider.DocumentsContract.renameDocument(
                        contentResolver,
                        persistedFolderUri,
                        targetName
                    )
                }.getOrNull()
                if (renamedThroughFolder != null) {
                    completeDocumentRename(oldUri, renamedThroughFolder)
                    return
                }
            }
            if (oldUri.scheme == "content" || oldUri.scheme == "file") {
                offerRenamePermissionRecovery(oldUri, targetName)
            } else {
                offerSaveAsRenameFallback(targetName)
            }
            return
        }

        completeDocumentRename(oldUri, renamedUri)
    }

    private fun completeDocumentRename(oldUri: Uri, renamedUri: Uri) {
        val oldHistoryKey = oldUri.toString()
        replaceHistoryUri(oldUri, renamedUri)
        persistDocumentUriPermission(renamedUri)
        currentFileUri = renamedUri
        currentFileName = getFileNameFromUri(renamedUri)
        PreferenceManager.getDefaultSharedPreferences(this)
            .edit()
            .putString("last_opened_uri", renamedUri.toString())
            .apply()
        remapDocumentNavigationHistory(oldHistoryKey, renamedUri.toString())
        updateTitle()
        ThemedToast.show(this, "Document renamed", Toast.LENGTH_SHORT)
    }

    private fun handleExportDocument() {
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val format = prefs.getString("pref_export_format", "html") ?: "html"
        val baseName = if (currentFileName.contains(".")) currentFileName.substringBeforeLast(".") else currentFileName
        val defaultName = if (format == "mhtml") "$baseName.mht" else "$baseName.html"
        exportDocumentLauncher.launch(defaultName)
    }

    private fun saveExportToUri(targetUri: Uri) {
        val targetName = getFileNameFromUri(targetUri)
        val isMht = targetName.endsWith(".mht", ignoreCase = true) ||
                    targetName.endsWith(".mhtml", ignoreCase = true) ||
                    PreferenceManager.getDefaultSharedPreferences(this).getString("pref_export_format", "html") == "mhtml"

        webView.evaluateJavascript("document.querySelector('.cm-content')?.innerHTML || document.querySelector('.cm-editor')?.innerHTML || '';") { htmlResult ->
            val htmlPayload = JSONObjectWrapper.unquote(htmlResult)
            val (cleanHtml, _) = DocumentExporter.generateCleanHtml(this, htmlPayload, currentFileName)

            if (isMht) {
                ThemedToast.show(this, "Generating MHTML archive...", Toast.LENGTH_SHORT)
                DocumentExporter.exportToMht(this, cleanHtml, targetUri) { success, errorMsg ->
                    if (success) {
                        ThemedToast.show(this, "MHTML archive exported successfully!", Toast.LENGTH_SHORT)
                    } else {
                        ThemedToast.show(this, "Export failed: $errorMsg", Toast.LENGTH_LONG)
                    }
                }
            } else {
                try {
                    contentResolver.openOutputStream(targetUri, "rwt")?.use { out ->
                        val writer = OutputStreamWriter(out)
                        writer.write(cleanHtml)
                        writer.flush()
                    }
                    ThemedToast.show(this, "HTML document exported successfully!", Toast.LENGTH_SHORT)
                } catch (e: Exception) {
                    ThemedToast.show(this, "Export failed: ${e.localizedMessage}", Toast.LENGTH_LONG)
                }
            }
        }
    }

    private fun saveFileToUri(
        uri: Uri,
        requestedAsTextPack: Boolean? = null,
        requestedAsMdzip: Boolean? = null,
        cachedMarkdownText: String? = null,
        expectedDocumentSessionId: String? = null
    ) {
        val saveSessionId = expectedDocumentSessionId ?: currentDocumentSessionId
        if (saveSessionId != currentDocumentSessionId) {
            ThemedToast.show(
                this,
                "The active document changed before saving. Nothing was saved.",
                Toast.LENGTH_LONG
            )
            return
        }
        val oldDocumentKey = currentDocumentHistoryKey()
        val oldUriString = currentFileUri?.toString().orEmpty()
        val saveStarted = android.os.SystemClock.elapsedRealtime()
        val snapshotSource = if (cachedMarkdownText != null) "cached" else "webview"
        AppDiagnostics.record(this, "save_start", "source=$snapshotSource mode=$currentEditorMode rev=$currentRevision")
        val persistSnapshot: (String) -> Unit = persistSnapshot@{ snapshot ->
            if (saveSessionId != currentDocumentSessionId) {
                AppDiagnostics.record(this, "save_skipped_stale_document_session")
                ThemedToast.show(
                    this,
                    "The active document changed before saving. Nothing was saved.",
                    Toast.LENGTH_LONG
                )
                return@persistSnapshot
            }
            var markdownText = snapshot
            if (
                uri == currentFileUri &&
                isDirty &&
                markdownText.isEmpty() &&
                currentRevision == 0L &&
                !currentEmptyContentExplicitlyEdited
            ) {
                AppDiagnostics.record(this, "save_skipped_unconfirmed_empty_snapshot")
                ThemedToast.show(
                    this,
                    "The empty snapshot was not confirmed as an intentional edit. The file was left unchanged.",
                    Toast.LENGTH_LONG
                )
                return@persistSnapshot
            }
            AppDiagnostics.record(this, "snapshot_taken", "source=$snapshotSource mode=$currentEditorMode rev=$currentRevision chars=${markdownText.length}")

            markdownText = MarkdownTextFileCodec.prepareForSave(
                markdownText,
                hadBom = hasBom,
                hadCrlf = hasCrlf
            )

            try {
                val targetFileName = getFileNameFromUri(uri)
                val hasTextPackExtension =
                    targetFileName.endsWith(".textpack", ignoreCase = true) ||
                    targetFileName.endsWith(".textpack.zip", ignoreCase = true)
                val isMdzipTarget = when {
                    requestedAsMdzip != null -> requestedAsMdzip
                    requestedAsTextPack == true -> false
                    MdzipManager.isMdzipFileName(targetFileName) -> true
                    uri == currentFileUri && currentMdzipSession != null -> true
                    else -> false
                }
                val isTextPackTarget = requestedAsTextPack ?: (
                    !isMdzipTarget &&
                        (hasTextPackExtension ||
                            (uri == currentFileUri && currentTextPackSession != null))
                    )

                if (isMdzipTarget) {
                    if (currentTextPackSession != null && currentMdzipSession == null) {
                        throw java.io.IOException(
                            "Save as MDZip from TextPack is not supported yet. Open a Markdown document first."
                        )
                    }
                    val session = currentMdzipSession
                        ?: MdzipManager.create(this, markdownText, targetFileName)
                    currentMdzipSession = session
                    currentTextPackSession = null
                    MdzipManager.save(this, session, markdownText, uri)
                } else if (isTextPackTarget) {
                    val session = currentTextPackSession ?: if (
                        requestedAsTextPack == true && uri != currentFileUri
                    ) {
                        TextPackManager.createTextPackSession(this)
                    } else {
                        TextPackManager.openTextPack(this, uri)
                    }
                    currentTextPackSession = session
                    currentMdzipSession = null
                    TextPackManager.saveTextPack(this, session, markdownText, uri)
                } else {
                    val output = contentResolver.openOutputStream(uri, "rwt")
                        ?: throw java.io.IOException("Could not open document for writing")
                    output.use { outputStream ->
                        MarkdownTextFileCodec.write(outputStream, markdownText)
                    }
                    currentTextPackSession = null
                    currentMdzipSession = null
                }

                currentDocumentFormat = when {
                    isMdzipTarget -> DocumentFormat.MDZIP
                    isTextPackTarget -> DocumentFormat.TEXT_PACK
                    else -> DocumentFormat.MARKDOWN
                }
                persistDocumentUriPermission(uri)
                remapDocumentNavigationHistory(oldDocumentKey, uri.toString())
                currentFileUri = uri
                currentFileName = targetFileName
                latestMarkdownContent = markdownText
                isDirty = false
                currentRevision = 0
                currentEmptyContentExplicitlyEdited = false
                updateTitle()
                val escapedSavedUri = JSONObjectWrapper.quote(uri.toString())
                webView.evaluateJavascript(
                    "window.leftPanelController?.onNativeDocumentSaved?.($escapedSavedUri);",
                    null
                )
                val escapedOldUri = JSONObjectWrapper.quote(oldUriString)
                val escapedUri = JSONObjectWrapper.quote(uri.toString())
                val escapedName = JSONObjectWrapper.quote(targetFileName)
                val escapedSessionId = JSONObjectWrapper.quote(saveSessionId)
                webView.evaluateJavascript(
                    "window.leftPanelController?.onDocumentSavedAs?.($escapedOldUri, $escapedUri, $escapedName, $escapedSessionId);",
                    null
                )
                val saveMs = android.os.SystemClock.elapsedRealtime() - saveStarted
                AppDiagnostics.record(this, "save_done", "status=success mode=$currentEditorMode rev=$currentRevision chars=${markdownText.length} ms=$saveMs")
                ThemedToast.show(this, "File saved successfully", Toast.LENGTH_SHORT)
            } catch (e: Exception) {
                val saveMs = android.os.SystemClock.elapsedRealtime() - saveStarted
                AppDiagnostics.record(this, "save_done", "status=failure category=${e.javaClass.simpleName} ms=$saveMs")
                ThemedToast.show(this, "Failed to save file: ${e.localizedMessage}", Toast.LENGTH_LONG)
            }
        }
        if (cachedMarkdownText != null) {
            persistSnapshot(cachedMarkdownText)
        } else {
            webView.evaluateJavascript("window.editorBridge.getMarkdown();") { result ->
                persistSnapshot(JSONObjectWrapper.unquote(result))
            }
        }
    }

    private fun handleNewWindow() {
        val newWindowId = java.util.UUID.randomUUID().toString()
        val intent = android.content.Intent(this, MainActivity::class.java).apply {
            action = android.content.Intent.ACTION_MAIN
            data = Uri.parse("wmdx://window/$newWindowId")
            addFlags(
                android.content.Intent.FLAG_ACTIVITY_NEW_DOCUMENT or
                    android.content.Intent.FLAG_ACTIVITY_MULTIPLE_TASK or
                    android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            )
            putExtra("is_new_document", true)
        }
        try {
            startActivity(intent)
            AppDiagnostics.record(this, "new_window_requested")
        } catch (error: Exception) {
            AppDiagnostics.record(this, "new_window_failed", error.javaClass.simpleName)
            ThemedToast.show(this, "Could not open a new window", Toast.LENGTH_LONG)
        }
    }

    private fun openWmdxTabSessionInNewWindow(uri: Uri, permissionFlags: Int) {
        val newWindowId = java.util.UUID.randomUUID().toString()
        val intent = android.content.Intent(this, MainActivity::class.java).apply {
            action = android.content.Intent.ACTION_MAIN
            data = Uri.parse("wmdx://window/$newWindowId")
            clipData = android.content.ClipData.newRawUri("W.mdx session", uri)
            addFlags(
                android.content.Intent.FLAG_ACTIVITY_NEW_DOCUMENT or
                    android.content.Intent.FLAG_ACTIVITY_MULTIPLE_TASK or
                    android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                    permissionFlags
            )
            putExtra("is_new_document", true)
            putExtra("open_wmdx_tab_session_uri", uri.toString())
            putExtra("open_wmdx_tab_session_permission_flags", permissionFlags)
        }
        try {
            startActivity(intent)
        } catch (error: Exception) {
            AppDiagnostics.record(this, "open_session_new_window_failed", error.javaClass.simpleName)
            ThemedToast.show(this, "Could not open the session in a new window", Toast.LENGTH_LONG)
        }
    }

    private fun createOpenWmdxTabSessionIntent(): android.content.Intent {
        return android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(android.content.Intent.CATEGORY_OPENABLE)
            type = "*/*"
            addFlags(
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        }
    }

    private fun openDefaultDocumentsFolderPicker() {
        if (pendingDefaultSearchFolderPicker || authorizedLeftPanelTrees().isNotEmpty()) return
        pendingDefaultSearchFolderPicker = true
        val intent = android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            )
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                putExtra(
                    android.provider.DocumentsContract.EXTRA_INITIAL_URI,
                    android.provider.DocumentsContract.buildDocumentUri(
                        "com.android.externalstorage.documents",
                        "primary:Documents"
                    )
                )
            }
        }
        runCatching {
            defaultSearchFolderLauncher.launch(intent)
        }.onFailure { error ->
            pendingDefaultSearchFolderPicker = false
            AppDiagnostics.record(this, "search_documents_picker_failed", error.javaClass.simpleName)
            if (::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.leftPanelController?.onSearchFolderAccessResult?.(false);",
                    null
                )
            }
        }
    }

    private fun interceptTextPackAssetRequest(request: WebResourceRequest): WebResourceResponse {
        val segments = request.url.pathSegments
        val session = currentTextPackSession
        if (
            session == null ||
            segments.size < 4 ||
            segments[0] != "textpack-assets" ||
            segments[1] != session.sessionDir.name
        ) {
            return textPackAssetError(404, "Not Found")
        }

        val archivePath = request.url.encodedPath
            ?.split("/")
            ?.drop(3)
            ?.joinToString("/")
            .orEmpty()
        if (archivePath.isBlank()) return textPackAssetError(404, "Not Found")
        val file = TextPackManager.resolveAssetFile(session, archivePath)
            ?: return textPackAssetError(404, "Not Found")
        val mimeType = android.webkit.MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(file.extension.lowercase())
            ?: runCatching {
                FileInputStream(file).use { java.net.URLConnection.guessContentTypeFromStream(it) }
            }.getOrNull()
            ?: "application/octet-stream"
        val fileLength = file.length()
        val headers = mapOf(
            "Cache-Control" to "no-store",
            "Content-Length" to fileLength.toString(),
            "X-Content-Type-Options" to "nosniff"
        )
        val body = if (request.method.equals("HEAD", ignoreCase = true)) {
            ByteArrayInputStream(ByteArray(0))
        } else {
            FileInputStream(file)
        }
        return WebResourceResponse(mimeType, null, 200, "OK", headers, body)
    }

    private fun textPackAssetError(statusCode: Int, reasonPhrase: String): WebResourceResponse =
        WebResourceResponse(
            "text/plain",
            "UTF-8",
            statusCode,
            reasonPhrase,
            emptyMap(),
            ByteArrayInputStream(ByteArray(0))
        )

    private fun interceptMarkdownAssetRequest(request: WebResourceRequest): WebResourceResponse {
        val segments = request.url.pathSegments
        if (
            currentTextPackSession != null ||
            currentMdzipSession != null ||
            segments.size < 3 ||
            segments[0] != "markdown-assets" ||
            segments[1] != currentDocumentSessionId
        ) {
            return textPackAssetError(404, "Not Found")
        }

        val encodedDocumentId = request.url.encodedPath
            ?.split("/")
            ?.drop(3)
            ?.joinToString("/")
            .orEmpty()
        if (encodedDocumentId.isBlank()) return textPackAssetError(404, "Not Found")
        val documentId = Uri.decode(encodedDocumentId)
        val documentUri = currentFileUri ?: return textPackAssetError(404, "Not Found")
        val location = MarkdownAssetManager.locateDocument(
            this,
            documentUri,
            requireWrite = false
        ) ?: return textPackAssetError(404, "Not Found")
        val assetUri = MarkdownAssetManager.documentUriForPreviewId(this, location, documentId)
            ?: return textPackAssetError(404, "Not Found")
        val extension = getFileNameFromUri(assetUri).substringAfterLast('.', "")
        val declaredMimeType = contentResolver.getType(assetUri)
        val mimeType = declaredMimeType
            ?.takeIf { it.isNotBlank() && it != "application/octet-stream" }
            ?: android.webkit.MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(extension.lowercase())
            ?: MarkdownAssetManager.mimeTypeForExtension(extension)
        val body = if (request.method.equals("HEAD", ignoreCase = true)) {
            ByteArrayInputStream(ByteArray(0))
        } else {
            contentResolver.openInputStream(assetUri)
                ?: return textPackAssetError(404, "Not Found")
        }
        return WebResourceResponse(
            mimeType,
            null,
            200,
            "OK",
            mapOf(
                "Cache-Control" to "no-store",
                "X-Content-Type-Options" to "nosniff"
            ),
            body
        )
    }

    private fun mdzipSessionForAssetRequest(sessionDirName: String): MdzipSession? {
        currentMdzipSession
            ?.takeIf { it.sessionDir.name == sessionDirName }
            ?.let { return it }

        return synchronized(embeddedMdzipSessionsLock) {
            val entry = embeddedMdzipSessions.entries.firstOrNull {
                it.value.sessionDir.name == sessionDirName
            } ?: return@synchronized null
            embeddedMdzipSessions[entry.key]
        }
    }

    private fun interceptMdzipAssetRequest(request: WebResourceRequest): WebResourceResponse {
        val segments = request.url.pathSegments
        if (segments.size < 3 || segments[0] != "mdzip-assets") {
            return mdzipAssetError(404, "Not Found")
        }
        val session = mdzipSessionForAssetRequest(segments[1])
        if (session == null) {
            return mdzipAssetError(404, "Not Found")
        }

        val archivePath = segments.drop(2).joinToString("/")
        val isImageAsset = MdzipManager.isSupportedImageFileName(archivePath)
        val isVideoAsset = MdzipManager.isSupportedVideoFileName(archivePath)
        val isAudioAsset = MdzipManager.isSupportedAudioFileName(archivePath)
        val file = MdzipManager.assetArchiveFile(session, archivePath)
        if (file == null) {
            if (isVideoAsset) {
                val extension = archivePath.substringAfterLast('.').lowercase()
                recordMdzipVideoAsset(
                    extension,
                    404,
                    mdzipVideoMimeType(extension),
                    rangeHeader = request.requestHeaders.entries
                        .firstOrNull { it.key.equals("Range", ignoreCase = true) }
                        ?.value,
                    contentRange = null,
                    contentLength = 0,
                    method = request.method
                )
            } else if (isAudioAsset) {
                val extension = archivePath.substringAfterLast('.').lowercase()
                recordMdzipAudioAsset(
                    extension,
                    404,
                    mdzipAudioMimeType(extension),
                    rangeHeader = null,
                    contentRange = null,
                    contentLength = 0
                )
            }
            return mdzipAssetError(404, "Not Found")
        }

        if (isImageAsset) {
            val mimeType = android.webkit.MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension.lowercase())
                ?.takeIf { it.startsWith("image/") }
                ?: MarkdownAssetManager.mimeTypeForExtension(file.extension)
            if (!mimeType.startsWith("image/")) return mdzipAssetError(404, "Not Found")
            val headers = mapOf(
                "Cache-Control" to "no-store",
                "Content-Length" to file.length().toString(),
                "X-Content-Type-Options" to "nosniff"
            )
            val body = if (request.method.equals("HEAD", ignoreCase = true)) {
                ByteArrayInputStream(ByteArray(0))
            } else {
                FileInputStream(file)
            }
            return WebResourceResponse(mimeType, null, 200, "OK", headers, body)
        }

        if (!isVideoAsset && !isAudioAsset) {
            return mdzipAssetError(404, "Not Found")
        }
        val extension = file.extension.lowercase()
        val mimeType = if (isVideoAsset) mdzipVideoMimeType(extension) else mdzipAudioMimeType(extension)
        val fileLength = file.length()
        val range = request.requestHeaders.entries
            .firstOrNull { it.key.equals("Range", ignoreCase = true) }
            ?.value
        val headers = mutableMapOf(
            "Accept-Ranges" to "bytes",
            "Cache-Control" to "no-store"
        )
        if (extension in setOf("aac", "m4a", "wav", "flac", "opus", "ogg", "oga")) {
            headers.remove("Accept-Ranges")
        }

        if (shouldServeMdzipAssetAsWholeFile(isVideoAsset, extension, range)) {
            if (isVideoAsset) {
                recordMdzipVideoAsset(
                    extension,
                    200,
                    mimeType,
                    rangeHeader = range,
                    contentRange = null,
                    contentLength = fileLength,
                    method = request.method
                )
            } else {
                recordMdzipAudioAsset(
                    extension,
                    200,
                    mimeType,
                    rangeHeader = range,
                    contentRange = null,
                    contentLength = fileLength
                )
            }
            headers["Content-Length"] = fileLength.toString()
            val body = if (request.method.equals("HEAD", ignoreCase = true)) {
                ByteArrayInputStream(ByteArray(0))
            } else if (isVideoAsset) {
                openMdzipVideoStream(file, 0, fileLength, 200, range)
            } else {
                openMdzipByteRangeStream(file, 0, fileLength)
            }
            return WebResourceResponse(mimeType, null, 200, "OK", headers, body)
        }

        val rangeHeader = range
            ?: return mdzipRangeError(
                fileLength, mimeType, range, extension, isVideoAsset, request.method
            )
        val byteRange = parseMdzipByteRange(rangeHeader, fileLength)
            ?: return mdzipRangeError(
                fileLength, mimeType, rangeHeader, extension, isVideoAsset, request.method
            )
        headers["Content-Length"] = byteRange.length.toString()
        val contentRange = "bytes ${byteRange.start}-${byteRange.endInclusive}/$fileLength"
        headers["Content-Range"] = contentRange
        if (isVideoAsset) {
            recordMdzipVideoAsset(
                extension,
                206,
                mimeType,
                rangeHeader = rangeHeader,
                contentRange = contentRange,
                contentLength = byteRange.length,
                method = request.method
            )
        } else {
            recordMdzipAudioAsset(
                extension,
                206,
                mimeType,
                rangeHeader = rangeHeader,
                contentRange = contentRange,
                contentLength = byteRange.length
            )
        }
        val body = if (request.method.equals("HEAD", ignoreCase = true)) {
            ByteArrayInputStream(ByteArray(0))
        } else if (isVideoAsset) {
            openMdzipVideoStream(file, byteRange.start, byteRange.length, 206, rangeHeader)
        } else {
            openMdzipByteRangeStream(file, byteRange.start, byteRange.length)
        }
        return WebResourceResponse(mimeType, null, 206, "Partial Content", headers, body)
    }

    private fun openMdzipVideoStream(
        file: File,
        start: Long,
        length: Long,
        status: Int,
        rangeHeader: String?
    ): InputStream {
        val onClose: (MdzipByteRangeStreamStats) -> Unit = { stats ->
            if (AppDiagnostics.isNavigationCaptureActive(this)) {
                val requestedRange = rangeHeader
                    ?.replace(Regex("[^A-Za-z0-9=,-]"), "")
                    ?.take(48)
                    ?: "none"
                AppDiagnostics.record(
                    this,
                    "mdzip_video_stream",
                    "status=$status range=$requestedRange start=$start responseBytes=$length " +
                        "streamLimit=${stats.expectedBytes} " +
                        "read=${stats.readBytes} skipped=${stats.skippedBytes} " +
                        "complete=${stats.complete} earlyEof=${stats.sourceEndedEarly}"
                )
            }
        }
        return if (status == 206) {
            openMdzipVideoByteRangeStream(file, start, length, onClose)
        } else {
            openMdzipByteRangeStream(file, start, length, onClose)
        }
    }

    private fun recordMdzipVideoAsset(
        extension: String,
        status: Int,
        mimeType: String,
        rangeHeader: String?,
        contentRange: String?,
        contentLength: Long?,
        method: String
    ) {
        val requestedRange = rangeHeader
            ?.replace(Regex("[^A-Za-z0-9=,-]"), "")
            ?.take(48)
            ?: "none"
        AppDiagnostics.record(
            this,
            "mdzip_video_asset",
            "method=$method ext=$extension status=$status mime=$mimeType range=$requestedRange " +
                "contentRange=${contentRange?.take(56) ?: "none"} bytes=${contentLength ?: "unknown"}"
        )
    }

    private fun mdzipAudioMimeType(extension: String): String =
        when (extension.lowercase()) {
            "aac" -> "audio/aac"
            "m4a" -> "audio/mp4"
            "wav" -> "audio/wav"
            "flac" -> "audio/flac"
            "opus", "ogg", "oga" -> "audio/ogg"
            else -> "audio/mpeg"
        }

    private fun mdzipVideoMimeType(extension: String): String =
        when (extension.lowercase()) {
            "webm" -> "video/webm"
            "3gp" -> "video/3gpp"
            "mov" -> "video/quicktime"
            "mkv" -> "video/x-matroska"
            "avi" -> "video/x-msvideo"
            "mpeg", "mpg" -> "video/mpeg"
            "ogv" -> "video/ogg"
            "wmv" -> "video/x-ms-wmv"
            else -> "video/mp4"
        }

    private fun recordMdzipAudioAsset(
        extension: String,
        status: Int,
        mimeType: String,
        rangeHeader: String?,
        contentRange: String?,
        contentLength: Long?
    ) {
        if (!AppDiagnostics.isNavigationCaptureActive(this)) return
        val requestedRange = rangeHeader
            ?.replace(Regex("[^A-Za-z0-9=,-]"), "")
            ?.take(48)
            ?: "none"
        AppDiagnostics.record(
            this,
            "mdzip_audio_asset",
            "ext=$extension status=$status mime=$mimeType range=$requestedRange " +
                "contentRange=${contentRange ?: "none"} bytes=${contentLength ?: "unknown"}"
        )
    }

    private fun mdzipRangeError(
        fileLength: Long,
        mimeType: String,
        rangeHeader: String?,
        extension: String,
        isVideoAsset: Boolean = false,
        method: String = "GET"
    ): WebResourceResponse {
        if (isVideoAsset) {
            recordMdzipVideoAsset(
                extension,
                416,
                mimeType,
                rangeHeader = rangeHeader,
                contentRange = "bytes */$fileLength",
                contentLength = 0,
                method = method
            )
        } else {
            recordMdzipAudioAsset(
                extension,
                416,
                mimeType,
                rangeHeader = rangeHeader,
                contentRange = "bytes */$fileLength",
                contentLength = 0
            )
        }
        return WebResourceResponse(
            mimeType,
            null,
            416,
            "Range Not Satisfiable",
            mapOf(
                "Accept-Ranges" to "bytes",
                "Cache-Control" to "no-store",
                "Content-Range" to "bytes */$fileLength"
            ),
            ByteArrayInputStream(ByteArray(0))
        )
    }

    private fun mdzipAssetError(status: Int, reason: String): WebResourceResponse =
        WebResourceResponse(
            "text/plain",
            "UTF-8",
            status,
            reason,
            mapOf("Content-Length" to "0"),
            ByteArrayInputStream(ByteArray(0))
        )

    private fun handleInsertImage() {
        val choices = arrayOf(
            "Choose image file",
            "Choose image file and embed as Base64",
            "Paste Base64",
            "Enter URL"
        )
        AlertDialog.Builder(this)
            .setTitle("Insert Image")
            .setItems(choices) { _, choice ->
                when (choice) {
                    0 -> pickImageLauncher.launch("image/*")
                    1 -> pickImageAsBase64Launcher.launch("image/*")
                    2 -> showPasteBase64ImageDialog()
                    3 -> showImageUrlDialog()
                }
            }
            .show()
    }

    private fun handleInsertAudio() {
        pendingReplaceMdzipAudioLink = null
        pendingInsertAudioDocumentSessionId = currentDocumentSessionId
        pickAudioLauncher.launch("audio/*")
    }

    private fun handleInsertVideo() {
        pendingInsertVideoDocumentSessionId = currentDocumentSessionId
        pickVideoLauncher.launch("video/*")
    }

    private fun handleInsertAttachment() {
        pendingInsertAttachmentDocumentSessionId = currentDocumentSessionId
        pickAttachmentLauncher.launch(arrayOf("*/*"))
    }

    private fun handleInsertEmbeddedDocument() {
        pendingInsertEmbeddedDocumentSessionId = currentDocumentSessionId
        pickEmbeddedDocumentLauncher.launch(
            arrayOf(
                "text/*",
                "application/json",
                "application/xml",
                "application/javascript",
                "application/yaml",
                "application/x-yaml",
                "application/toml",
                MdzipManager.MIME_TYPE,
                "application/octet-stream"
            )
        )
    }

    private fun insertEmbeddedDocumentFromUri(uri: Uri, expectedSessionId: String) {
        val fileName = getFileNameFromUri(uri).trim()
        val isMdzip = MdzipManager.isMdzipFileName(fileName)
        if (!isMdzip && isUnsupportedEmbeddedFileName(fileName)) {
            ThemedToast.show(
                this,
                "Legacy TextPack documents cannot be embedded.",
                Toast.LENGTH_LONG
            )
            return
        }
        if (expectedSessionId != currentDocumentSessionId) {
            ThemedToast.show(
                this,
                "The active document changed. The embedded document was not added.",
                Toast.LENGTH_LONG
            )
            return
        }

        runCatching {
            val sourceText = readEmbeddedMarkdown(uri, fileName, isMdzip)
            if (sourceText.toByteArray(Charsets.UTF_8).size > MAX_EMBEDDED_DOCUMENT_BYTES) {
                throw java.io.IOException("This text document is too large to embed.")
            }
            val prefs = PreferenceManager.getDefaultSharedPreferences(this)
            val method = prefs.getString("pref_embedded_document_method", "copy")
            var mediaBaseUrl: String? = null
            if (method == "link" || !isMdzip) {
                persistDocumentUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
                if (method == "link") {
                    persistDocumentUriPermission(
                        uri,
                        android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )
                }
                if (!hasPersistedReadAccess(uri)) {
                    throw java.io.IOException(
                        "The selected file provider does not allow saved access. Choose Copy into current document."
                    )
                }
            }
            val link = if (method == "link") {
                mediaBaseUrl = uri.toString()
                uri.toString()
            } else {
                if (!isMdzip) {
                    mediaBaseUrl = uri.toString()
                }
                when (currentDocumentFormat) {
                    DocumentFormat.MDZIP -> {
                        val session = currentMdzipSession
                            ?: throw java.io.IOException("Save the MDZip document before copying an embed.")
                        MdzipManager.addAttachment(
                            session,
                            contentResolver.openInputStream(uri)
                                ?: throw java.io.IOException("Could not read the selected document."),
                            fileName
                        )
                    }
                    DocumentFormat.TEXT_PACK -> {
                        val session = currentTextPackSession
                            ?: throw java.io.IOException("Save the TextPack before copying an embed.")
                        TextPackManager.addAssetFile(
                            session,
                            contentResolver.openInputStream(uri)
                                ?: throw java.io.IOException("Could not read the selected document."),
                            fileName
                        )
                    }
                    DocumentFormat.MARKDOWN -> {
                        val documentUri = currentFileUri
                            ?: throw java.io.IOException("Save the Markdown file before copying an embed.")
                        val location = MarkdownAssetManager.locateDocument(
                            this,
                            documentUri,
                            requireWrite = true
                        ) ?: throw java.io.IOException(
                            "Open the Markdown file from a writable approved folder before copying an embed."
                        )
                        MarkdownAssetManager.addAsset(
                            this,
                            location,
                            contentResolver.openInputStream(uri)
                                ?: throw java.io.IOException("Could not read the selected document."),
                            fileName,
                            if (isMdzip) MdzipManager.MIME_TYPE else contentResolver.getType(uri),
                            prefs.getString(
                                "pref_markdown_image_location",
                                MarkdownAssetManager.LOCATION_ASSETS
                            ) ?: MarkdownAssetManager.LOCATION_ASSETS
                        )
                    }
                }
            }
            val label = fileName.substringBeforeLast('.', fileName).ifBlank { fileName }
            if (
                !mediaBaseUrl.isNullOrBlank() &&
                !link.startsWith("content://", ignoreCase = true)
            ) {
                rememberEmbeddedMediaBase(link, mediaBaseUrl)
            }
            val safeUrl = JSONObjectWrapper.quote(link)
            val safeLabel = JSONObjectWrapper.quote(label)
            webView.evaluateJavascript(
                "window.editorBridge?.insertEmbeddedDocumentLink?.($safeUrl, $safeLabel);",
                null
            )
        }.onFailure { error ->
            ThemedToast.show(
                this,
                error.localizedMessage ?: "Could not add the embedded document.",
                Toast.LENGTH_LONG
            )
        }
    }

    private fun isUnsupportedEmbeddedFileName(fileName: String): Boolean =
        fileName.endsWith(".textpack", ignoreCase = true) ||
            fileName.endsWith(".textpack.zip", ignoreCase = true)

    private fun embeddedMediaBasePreferenceKey(relativeLink: String): String? {
        val documentUri = currentFileUri?.toString() ?: return null
        val identity = "$documentUri\u0000${Uri.decode(relativeLink)}"
        val digest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(identity.toByteArray(Charsets.UTF_8))
        val suffix = digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return "embedded_media_base_$suffix"
    }

    private fun rememberEmbeddedMediaBase(relativeLink: String, mediaBaseUrl: String) {
        val key = embeddedMediaBasePreferenceKey(relativeLink) ?: return
        PreferenceManager.getDefaultSharedPreferences(this)
            .edit()
            .putString(key, mediaBaseUrl)
            .apply()
    }

    private fun embeddedMediaBaseFor(relativeLink: String): Uri? {
        val key = embeddedMediaBasePreferenceKey(relativeLink) ?: return null
        val value = PreferenceManager.getDefaultSharedPreferences(this)
            .getString(key, null)
            ?: return null
        return runCatching { Uri.parse(value) }.getOrNull()
    }

    private fun readEmbeddedMarkdown(uri: Uri, fileName: String, isMdzip: Boolean): String {
        if (isMdzip) {
            return getEmbeddedMdzipSession(uri).markdownContent
        }
        if (isUnsupportedEmbeddedFileName(fileName)) {
            throw java.io.IOException("Legacy TextPack documents cannot be embedded.")
        }
        val input = contentResolver.openInputStream(uri)
            ?: throw java.io.FileNotFoundException("Could not read the selected text document.")
        val output = java.io.ByteArrayOutputStream()
        input.use { source ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var copied = 0L
            while (true) {
                val count = source.read(buffer)
                if (count < 0) break
                copied += count
                if (copied > MAX_EMBEDDED_DOCUMENT_BYTES) {
                    throw java.io.IOException("This text document is too large to embed.")
                }
                output.write(buffer, 0, count)
            }
        }
        val text = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                .decode(java.nio.ByteBuffer.wrap(output.toByteArray()))
                .toString()
        } catch (error: java.nio.charset.CharacterCodingException) {
            throw java.io.IOException("Choose a UTF-8 text-based file or an MDZip document.", error)
        }
        val allowedControls = setOf('\t', '\n', '\r', '\u000C')
        if (text.any { character ->
                character == '\u0000' ||
                    (Character.isISOControl(character.code) && character !in allowedControls)
            }
        ) {
            throw java.io.IOException("The selected file is not text-based and cannot be embedded.")
        }
        return text
    }

    private fun getEmbeddedMdzipSession(uri: Uri): MdzipSession {
        val key = "${currentDocumentSessionId}:${uri}"
        synchronized(embeddedMdzipSessionsLock) {
            embeddedMdzipSessions[key]?.let { return it }
        }
        val opened = MdzipManager.open(this, uri)
        synchronized(embeddedMdzipSessionsLock) {
            embeddedMdzipSessions[key]?.let {
                opened.sessionDir.deleteRecursively()
                return it
            }
            embeddedMdzipSessions[key] = opened
            while (embeddedMdzipSessions.size > 16) {
                val eldest = embeddedMdzipSessions.entries.iterator()
                if (!eldest.hasNext()) break
                val evicted = eldest.next()
                eldest.remove()
                evicted.value.sessionDir.deleteRecursively()
            }
            return opened
        }
    }

    private fun clearEmbeddedMdzipSessions() {
        synchronized(embeddedMdzipSessionsLock) {
            embeddedMdzipSessions.values.forEach { it.sessionDir.deleteRecursively() }
            embeddedMdzipSessions.clear()
        }
    }

    private fun promptForAssetTitle(
        uri: Uri,
        kind: InsertAssetKind,
        onConfirm: (String) -> Unit
    ) {
        val originalName = getFileNameFromUri(uri).ifBlank {
            when (kind) {
                InsertAssetKind.AUDIO -> "audio"
                InsertAssetKind.VIDEO -> "video"
                InsertAssetKind.ATTACHMENT -> "attachment"
            }
        }
        val extensionStart = originalName.lastIndexOf('.')
        val defaultTitle = originalName
            .let { if (extensionStart > 0) it.substring(0, extensionStart) else it }
            .trim()
            .ifBlank { originalName }
        val input = EditText(this).apply {
            setSingleLine(true)
            hint = "Displayed title"
            setText(defaultTitle)
            setSelection(text.length)
        }
        val kindTitle = when (kind) {
            InsertAssetKind.AUDIO -> "audio"
            InsertAssetKind.VIDEO -> "video"
            InsertAssetKind.ATTACHMENT -> "attachment"
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("Set $kindTitle title")
            .setMessage("This title appears in the document. It does not rename the file.")
            .setView(input, 24, 4, 24, 0)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Insert", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val title = input.text.toString().trim()
                if (title.isEmpty()) {
                    input.error = "Enter a title"
                    input.requestFocus()
                    return@setOnClickListener
                }
                dialog.dismiss()
                onConfirm(title)
            }
            input.requestFocus()
        }
        dialog.show()
    }

    private fun insertAttachmentFromUri(uri: Uri, title: String) =
        insertAssetFromUri(uri, InsertAssetKind.ATTACHMENT, title)

    private fun insertVideoFromUri(uri: Uri, title: String) =
        insertAssetFromUri(uri, InsertAssetKind.VIDEO, title)

    private fun insertAudioFromUri(uri: Uri, title: String) =
        insertAssetFromUri(uri, InsertAssetKind.AUDIO, title)

    private fun insertAssetFromUri(uri: Uri, kind: InsertAssetKind, title: String) {
        try {
            val originalName = getFileNameFromUri(uri).ifBlank { "attachment" }
            if (kind == InsertAssetKind.AUDIO && !MdzipManager.isSupportedAudioFileName(originalName)) {
                throw java.io.IOException("Choose an MP3, AAC, M4A, WAV, FLAC, Opus, OGG, or OGA audio file.")
            }
            if (kind == InsertAssetKind.VIDEO && !MdzipManager.isSupportedVideoFileName(originalName)) {
                throw java.io.IOException("Choose an MP4, M4V, WebM, 3GP, MOV, MKV, AVI, MPEG, MPG, OGV, or WMV video file.")
            }
            val mimeType = contentResolver.getType(uri)
                ?.takeIf { it.isNotBlank() && it != "application/octet-stream" }
                ?: android.webkit.MimeTypeMap.getSingleton()
                    .getMimeTypeFromExtension(originalName.substringAfterLast('.', "").lowercase())
            val input = contentResolver.openInputStream(uri)
                ?: throw java.io.IOException("Could not read the selected file.")
            val relativeLink = input.use { assetInput ->
                when (currentDocumentFormat) {
                    DocumentFormat.MDZIP -> {
                        val session = currentMdzipSession
                            ?: throw java.io.IOException("The active MDZip document is no longer available.")
                        when (kind) {
                            InsertAssetKind.AUDIO -> MdzipManager.addAudio(session, assetInput, originalName)
                            InsertAssetKind.VIDEO -> MdzipManager.addVideo(session, assetInput, originalName)
                            InsertAssetKind.ATTACHMENT ->
                                MdzipManager.addAttachment(session, assetInput, originalName)
                        }
                    }
                    DocumentFormat.TEXT_PACK -> {
                        val session = currentTextPackSession
                            ?: throw java.io.IOException("The active TextPack document is no longer available.")
                        TextPackManager.addAssetFile(session, assetInput, originalName)
                    }
                    DocumentFormat.MARKDOWN -> {
                        val documentUri = currentFileUri
                            ?: throw java.io.IOException(
                                "Save this Markdown file in an approved writable folder before adding files."
                            )
                        val location = MarkdownAssetManager.locateDocument(
                            this,
                            documentUri,
                            requireWrite = true
                        ) ?: throw java.io.IOException(
                            "Open this Markdown file from an approved writable folder before adding files."
                        )
                        val storageLocation = PreferenceManager.getDefaultSharedPreferences(this)
                            .getString(
                                "pref_markdown_image_location",
                                MarkdownAssetManager.LOCATION_ASSETS
                            ) ?: MarkdownAssetManager.LOCATION_ASSETS
                        MarkdownAssetManager.addAsset(
                            this,
                            location,
                            assetInput,
                            originalName,
                            mimeType,
                            storageLocation
                        )
                    }
                }
            }
            isDirty = true
            updateTitle()
            val escapedLink = JSONObjectWrapper.quote(relativeLink)
            val escapedTitle = JSONObjectWrapper.quote(title)
            val insertMethod = when (kind) {
                InsertAssetKind.AUDIO -> "insertAudioLink"
                InsertAssetKind.VIDEO -> "insertVideoLink"
                InsertAssetKind.ATTACHMENT -> "insertAttachmentLink"
            }
            webView.evaluateJavascript(
                "window.editorBridge?.$insertMethod?.($escapedLink, $escapedTitle);",
                null
            )
        } catch (error: Exception) {
            ThemedToast.show(
                this,
                "Could not add the file: ${error.localizedMessage ?: "unknown error"}",
                Toast.LENGTH_LONG
            )
        }
    }

    private fun replaceAudioFromUri(uri: Uri, relativeLink: String) {
        val session = currentMdzipSession
        if (session == null) {
            ThemedToast.show(this, "The active document is no longer an MDZip package.", Toast.LENGTH_LONG)
            return
        }
        try {
            val selectedName = getFileNameFromUri(uri)
            if (!MdzipManager.isSupportedAudioFileName(selectedName)) {
                throw java.io.IOException("Choose an MP3, AAC, M4A, WAV, FLAC, Opus, OGG, or OGA file.")
            }
            val input = contentResolver.openInputStream(uri)
                ?: throw java.io.IOException("Could not read the selected audio file.")
            MdzipManager.replaceAudio(session, relativeLink, input, selectedName)
            isDirty = true
            updateTitle()
            val escapedLink = JSONObjectWrapper.quote(relativeLink)
            webView.evaluateJavascript(
                "window.editorBridge?.reloadMdzipAudio?.($escapedLink);",
                null
            )
            ThemedToast.show(
                this,
                "Audio replaced. Save the MDZip document to keep the change.",
                Toast.LENGTH_LONG
            )
        } catch (error: Exception) {
            ThemedToast.show(
                this,
                "Could not replace the audio file: ${error.localizedMessage ?: "unknown error"}",
                Toast.LENGTH_LONG
            )
        }
    }

    private fun showImageUrlDialog() {
        val expectedSessionId = currentDocumentSessionId
        val input = EditText(this)
        input.hint = "https://example.com/image.png"
        input.inputType =
            android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_URI

        val downloadImage = android.widget.CheckBox(this).apply {
            text = "Download image to document assets"
        }
        val embedAsBase64 = android.widget.CheckBox(this).apply {
            text = "Embed image as Base64"
        }
        downloadImage.setOnCheckedChangeListener { _, checked ->
            if (checked) embedAsBase64.isChecked = false
        }
        embedAsBase64.setOnCheckedChangeListener { _, checked ->
            if (checked) downloadImage.isChecked = false
        }
        val helperText = android.widget.TextView(this).apply {
            text = "Leave both options unchecked to use the URL directly."
            setTextColor(androidx.core.content.ContextCompat.getColor(
                this@MainActivity,
                android.R.color.darker_gray
            ))
            textSize = 13f
        }
        val content = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            val sidePadding = (24 * resources.displayMetrics.density).toInt()
            setPadding(sidePadding, 0, sidePadding, 0)
            addView(
                input,
                android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                    android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )
            addView(downloadImage)
            addView(embedAsBase64)
            addView(helperText)
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle("Enter Image URL")
            .setView(content)
            .setPositiveButton("Insert", null)
            .setNegativeButton("Cancel", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val url = input.text.toString().trim()
                if (!isHttpImageUrl(url)) {
                    ThemedToast.show(
                        this,
                        "Enter a valid HTTP or HTTPS image URL.",
                        Toast.LENGTH_LONG
                    )
                    return@setOnClickListener
                }
                if (expectedSessionId != currentDocumentSessionId) {
                    ThemedToast.show(
                        this,
                        "The active document changed. The image was not inserted.",
                        Toast.LENGTH_LONG
                    )
                    dialog.dismiss()
                    return@setOnClickListener
                }
                val shouldDownload = downloadImage.isChecked || embedAsBase64.isChecked
                val shouldEmbedAsBase64 = embedAsBase64.isChecked
                dialog.dismiss()
                if (shouldDownload) {
                    downloadImageFromUrl(url, expectedSessionId, shouldEmbedAsBase64)
                } else {
                    insertImageMarkdown(url)
                }
            }
        }
        dialog.show()
    }

    private fun showPasteBase64ImageDialog() {
        val expectedSessionId = currentDocumentSessionId
        val input = EditText(this).apply {
            hint = "data:image/png;base64,... or Base64 data"
            minLines = 4
            maxLines = 9
            gravity = android.view.Gravity.TOP or android.view.Gravity.START
            inputType =
                android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                    android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("Paste Base64 Image")
            .setView(input)
            .setPositiveButton("Insert", null)
            .setNegativeButton("Cancel", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val imageData = runCatching {
                    normalizeBase64Image(input.text.toString())
                }.getOrElse { error ->
                    ThemedToast.show(
                        this,
                        error.localizedMessage ?: "Enter valid image Base64 data.",
                        Toast.LENGTH_LONG
                    )
                    return@setOnClickListener
                }
                if (expectedSessionId != currentDocumentSessionId) {
                    ThemedToast.show(
                        this,
                        "The active document changed. The image was not inserted.",
                        Toast.LENGTH_LONG
                    )
                    dialog.dismiss()
                    return@setOnClickListener
                }
                insertImageMarkdown(imageData)
                dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun isHttpImageUrl(value: String): Boolean = runCatching {
        val url = URL(value)
        (url.protocol.equals("http", ignoreCase = true) ||
            url.protocol.equals("https", ignoreCase = true)) &&
            url.host.isNotBlank()
    }.getOrDefault(false)

    private fun normalizeBase64Image(value: String): String {
        val dataUriMatch = Regex(
            "^data:(image/[a-zA-Z0-9.+-]+);base64,([\\s\\S]+)$",
            RegexOption.IGNORE_CASE
        ).matchEntire(value.trim())
        val mimeType: String
        val encoded: String
        var decodedBytes: ByteArray? = null
        if (dataUriMatch != null) {
            mimeType = dataUriMatch.groupValues[1].lowercase()
            encoded = dataUriMatch.groupValues[2]
        } else {
            encoded = value.filterNot { it.isWhitespace() }
            decodedBytes = decodeImageBase64(encoded)
            mimeType = detectImageMimeType(decodedBytes)
                ?: throw IOException(
                    "Could not identify the image type. Paste a data:image/...;base64,... value instead."
                )
        }
        val bytes = decodedBytes ?: decodeImageBase64(encoded)
        if (!mimeType.startsWith("image/")) {
            throw IOException("The pasted Base64 data is not an image.")
        }
        return "data:$mimeType;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    }

    private fun decodeImageBase64(encoded: String): ByteArray {
        if (encoded.length > (MAX_DOWNLOADED_IMAGE_BYTES * 4L / 3L) + 16L) {
            throw IOException("The Base64 image is too large to insert.")
        }
        val bytes = try {
            Base64.decode(encoded, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            throw IOException("Enter valid Base64 image data.", error)
        }
        if (bytes.isEmpty()) throw IOException("The pasted Base64 image is empty.")
        if (bytes.size > MAX_DOWNLOADED_IMAGE_BYTES) {
            throw IOException("The Base64 image is too large to insert.")
        }
        return bytes
    }

    private fun detectImageMimeType(bytes: ByteArray): String? {
        if (
            bytes.size >= 8 &&
            bytes[0] == 0x89.toByte() &&
            bytes[1] == 0x50.toByte() &&
            bytes[2] == 0x4e.toByte() &&
            bytes[3] == 0x47.toByte()
        ) return "image/png"
        if (
            bytes.size >= 3 &&
            bytes[0] == 0xff.toByte() &&
            bytes[1] == 0xd8.toByte() &&
            bytes[2] == 0xff.toByte()
        ) return "image/jpeg"
        if (bytes.size >= 6 && String(bytes, 0, 6, Charsets.US_ASCII).startsWith("GIF8")) {
            return "image/gif"
        }
        if (
            bytes.size >= 12 &&
            String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" &&
            String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP"
        ) return "image/webp"
        if (bytes.size >= 2 && bytes[0] == 'B'.code.toByte() && bytes[1] == 'M'.code.toByte()) {
            return "image/bmp"
        }
        val textPrefix = String(bytes, 0, minOf(bytes.size, 512), Charsets.UTF_8)
            .removePrefix("\uFEFF")
        if (Regex("<svg\\b", RegexOption.IGNORE_CASE).containsMatchIn(textPrefix)) {
            return "image/svg+xml"
        }
        return null
    }

    private fun downloadImageFromUrl(
        url: String,
        expectedSessionId: String,
        embedAsBase64: Boolean
    ) {
        val storageTarget = if (embedAsBase64) {
            null
        } else {
            runCatching { captureImageStorageTarget(expectedSessionId) }
                .getOrElse { error ->
                    ThemedToast.show(
                        this,
                        "Failed to insert image: ${error.localizedMessage ?: "unknown error"}",
                        Toast.LENGTH_LONG
                    )
                    return
                }
        }
        val progressDialog = AlertDialog.Builder(this)
            .setTitle(if (embedAsBase64) "Embedding Image" else "Downloading Image")
            .setMessage("Please wait…")
            .setCancelable(false)
            .create()
        progressDialog.show()
        try {
            imageUrlDownloadExecutor.execute {
                val result = runCatching {
                    val image = fetchImageFromUrl(url)
                    if (expectedSessionId != currentDocumentSessionId) {
                        throw IOException("The active document changed. The image was not inserted.")
                    }
                    if (embedAsBase64) {
                        "data:${image.mimeType};base64," +
                            Base64.encodeToString(image.bytes, Base64.NO_WRAP)
                    } else {
                        storeImageAsset(
                            storageTarget
                                ?: throw IOException("The image storage location is unavailable."),
                            ByteArrayInputStream(image.bytes),
                            image.fileName,
                            image.mimeType
                        )
                    }
                }
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (progressDialog.isShowing) progressDialog.dismiss()
                    if (expectedSessionId != currentDocumentSessionId) {
                        ThemedToast.show(
                            this,
                            "The active document changed. The image was not inserted.",
                            Toast.LENGTH_LONG
                        )
                        return@runOnUiThread
                    }
                    result.onSuccess(::insertImageMarkdown).onFailure { error ->
                        ThemedToast.show(
                            this,
                            "Could not complete URL image insertion: ${error.localizedMessage ?: "unknown error"}",
                            Toast.LENGTH_LONG
                        )
                    }
                }
            }
        } catch (error: java.util.concurrent.RejectedExecutionException) {
            if (progressDialog.isShowing) progressDialog.dismiss()
            ThemedToast.show(
                this,
                "Could not start the image download.",
                Toast.LENGTH_LONG
            )
        }
    }

    private fun fetchImageFromUrl(value: String): DownloadedImage {
        if (!isHttpImageUrl(value)) throw IOException("Enter a valid HTTP or HTTPS image URL.")
        val connection = URL(value).openConnection() as? HttpURLConnection
            ?: throw IOException("Could not open the image URL.")
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("Accept", "image/*")
        connection.setRequestProperty("User-Agent", "W.mdx")
        try {
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                throw IOException("The image server returned HTTP $responseCode.")
            }
            val contentType = connection.contentType
                ?.substringBefore(';')
                ?.trim()
                ?.lowercase()
            if (
                contentType != null &&
                !contentType.startsWith("image/") &&
                contentType != "application/octet-stream" &&
                contentType != "binary/octet-stream"
            ) {
                throw IOException("The URL did not return an image.")
            }
            if (connection.contentLengthLong > MAX_DOWNLOADED_IMAGE_BYTES) {
                throw IOException("The image is too large to download.")
            }
            val output = ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var total = 0L
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    if (total > MAX_DOWNLOADED_IMAGE_BYTES) {
                        throw IOException("The image is too large to download.")
                    }
                    output.write(buffer, 0, count)
                }
            }
            val bytes = output.toByteArray()
            if (bytes.isEmpty()) throw IOException("The downloaded image is empty.")
            val mimeType = contentType?.takeIf { it.startsWith("image/") }
                ?: detectImageMimeType(bytes)
                ?: imageMimeTypeFromUrl(connection.url)
                ?: throw IOException("The URL did not return a supported image.")
            val fileName = imageFileNameFromUrl(connection.url, mimeType)
            return DownloadedImage(bytes, fileName, mimeType)
        } finally {
            connection.disconnect()
        }
    }

    private fun imageFileNameFromUrl(url: URL, mimeType: String): String {
        val encodedName = url.path.substringAfterLast('/').ifBlank { "image" }
        val decodedName = Uri.decode(encodedName)
            .substringAfterLast('/')
            .substringAfterLast('\\')
            .replace(Regex("[\\p{Cntrl}<>:\"|?*]"), "_")
            .trim()
            .ifBlank { "image" }
        val extension = decodedName.substringAfterLast('.', "")
        val mimeMap = android.webkit.MimeTypeMap.getSingleton()
        val existingMime = extension.takeIf(String::isNotBlank)
            ?.let(mimeMap::getMimeTypeFromExtension)
        if (existingMime?.equals(mimeType, ignoreCase = true) == true) return decodedName
        val canonicalExtension = mimeMap.getExtensionFromMimeType(mimeType)
            ?: if (mimeType == "image/svg+xml") "svg" else null
        if (canonicalExtension == null) return decodedName
        val baseName = if (extension.isNotBlank()) {
            decodedName.substringBeforeLast('.').ifBlank { "image" }
        } else {
            decodedName
        }
        return "$baseName.$canonicalExtension"
    }

    private fun imageMimeTypeFromUrl(url: URL): String? =
        android.webkit.MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(url.path.substringAfterLast('.').lowercase())
            ?.takeIf { it.startsWith("image/") }

    private fun insertImageFromUri(uri: Uri, embedBase64: Boolean) {
        try {
            val originalName = getFileNameFromUri(uri)
            val mimeType = resolveImageMimeType(uri, originalName)
            val inputStream = contentResolver.openInputStream(uri)
                ?: throw IOException("Could not read the selected image.")
            val imageReference = if (embedBase64) {
                inputStream.use { input ->
                    val bytes = input.readBytes()
                    if (bytes.isEmpty()) throw IOException("The selected image file is empty.")
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    "data:$mimeType;base64,$base64"
                }
            } else {
                inputStream.use { input ->
                    when {
                        currentTextPackSession != null -> TextPackManager.addAssetImage(
                            currentTextPackSession!!,
                            input,
                            originalName,
                            mimeType
                        )
                        currentMdzipSession != null -> MdzipManager.addImage(
                            currentMdzipSession!!,
                            input,
                            originalName,
                            mimeType
                        )
                        else -> {
                            val documentUri = currentFileUri
                                ?: throw IOException("Save the Markdown document before adding an image file.")
                            val location = MarkdownAssetManager.locateDocument(
                                this,
                                documentUri,
                                requireWrite = true
                            ) ?: throw IOException(
                                "Could not match this Markdown file to an approved write-enabled folder. " +
                                    "Reopen it from that folder, or choose Base64 in the insert dialog."
                            )
                            val storageLocation = PreferenceManager
                                .getDefaultSharedPreferences(this)
                                .getString(
                                    "pref_markdown_image_location",
                                    MarkdownAssetManager.LOCATION_ASSETS
                                )
                                ?: MarkdownAssetManager.LOCATION_ASSETS
                            MarkdownAssetManager.addImage(
                                this,
                                location,
                                input,
                                originalName,
                                mimeType,
                                storageLocation
                            )
                        }
                    }
                }
            }
            insertImageMarkdown(imageReference)
        } catch (e: Exception) {
            ThemedToast.show(this, "Failed to insert image: ${e.localizedMessage}", Toast.LENGTH_LONG)
        }
    }

    private fun captureImageStorageTarget(expectedSessionId: String): ImageStorageTarget {
        if (expectedSessionId != currentDocumentSessionId) {
            throw IOException("The active document changed. The image was not inserted.")
        }
        return when (currentDocumentFormat) {
            DocumentFormat.TEXT_PACK -> ImageStorageTarget(
                sessionId = expectedSessionId,
                format = DocumentFormat.TEXT_PACK,
                textPackSession = currentTextPackSession
                    ?: throw IOException("The active TextPack session is no longer available.")
            )
            DocumentFormat.MDZIP -> ImageStorageTarget(
                sessionId = expectedSessionId,
                format = DocumentFormat.MDZIP,
                mdzipSession = currentMdzipSession
                    ?: throw IOException("The active MDZip session is no longer available.")
            )
            DocumentFormat.MARKDOWN -> {
                val documentUri = currentFileUri
                    ?: throw IOException("Save the Markdown document before downloading an image.")
                val location = MarkdownAssetManager.locateDocument(
                    this,
                    documentUri,
                    requireWrite = true
                ) ?: throw IOException(
                    "Could not match this Markdown file to an approved write-enabled folder. " +
                        "Choose URL only or embed as Base64 instead."
                )
                val storageLocation = PreferenceManager
                    .getDefaultSharedPreferences(this)
                    .getString(
                        "pref_markdown_image_location",
                        MarkdownAssetManager.LOCATION_ASSETS
                    ) ?: MarkdownAssetManager.LOCATION_ASSETS
                ImageStorageTarget(
                    sessionId = expectedSessionId,
                    format = DocumentFormat.MARKDOWN,
                    markdownLocation = location,
                    markdownStorageLocation = storageLocation
                )
            }
        }
    }

    private fun storeImageAsset(
        target: ImageStorageTarget,
        inputStream: InputStream,
        originalName: String,
        mimeType: String
    ): String = inputStream.use { input ->
        if (target.sessionId != currentDocumentSessionId) {
            throw IOException("The active document changed. The image was not inserted.")
        }
        when {
            target.format == DocumentFormat.TEXT_PACK ->
                TextPackManager.addAssetImage(
                    target.textPackSession
                        ?: throw IOException("The TextPack session is no longer available."),
                    input,
                    originalName,
                    mimeType
                )
            target.format == DocumentFormat.MDZIP -> MdzipManager.addImage(
                target.mdzipSession
                    ?: throw IOException("The MDZip session is no longer available."),
                input,
                originalName,
                mimeType
            )
            else -> {
                val location = target.markdownLocation
                    ?: throw IOException("The Markdown image folder is no longer available.")
                MarkdownAssetManager.addImage(
                    this,
                    location,
                    input,
                    originalName,
                    mimeType,
                    target.markdownStorageLocation
                )
            }
        }
    }

    private fun insertImageMarkdown(imageReference: String) {
        val escapedReference = JSONObjectWrapper.quote(imageReference)
        webView.evaluateJavascript(
            "window.editorBridge.insertImage($escapedReference, \"\");",
            null
        )
    }

    private fun resolveImageMimeType(uri: Uri, fileName: String): String {
        val declaredType = contentResolver.getType(uri)
        if (declaredType?.startsWith("image/") == true) return declaredType
        val extension = fileName.substringAfterLast('.', "").lowercase()
        return android.webkit.MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(extension)
            ?.takeIf { it.startsWith("image/") }
            ?: MarkdownAssetManager.mimeTypeForExtension(extension)
                .takeIf { it.startsWith("image/") }
            ?: "image/png"
    }


    private fun showUnsavedChangesDialog(onConfirm: () -> Unit) {
        AlertDialog.Builder(this)
            .setTitle(R.string.unsaved_changes_title)
            .setMessage(R.string.unsaved_changes_message)
            .setPositiveButton(R.string.discard) { _, _ -> onConfirm() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun getFileNameFromUri(uri: Uri): String {
        var result: String? = null
        if (uri.scheme == "content") {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (nameIndex != -1) {
                        result = cursor.getString(nameIndex)
                    }
                }
            }
        }
        if (result == null) {
            result = uri.path
            val cut = result?.lastIndexOf('/') ?: -1
            if (cut != -1) {
                result = result?.substring(cut + 1)
            }
        }
        return result ?: "Document.md"
    }

    private fun loadFontDataUri(path: String?): String {
        if (path.isNullOrEmpty()) return ""
        return try {
            val file = java.io.File(path)
            if (!file.exists()) return ""
            val modifiedAt = file.lastModified()
            val length = file.length()
            fontDataUriCache.get(path)?.let { cached ->
                if (cached.modifiedAt == modifiedAt && cached.length == length) {
                    return cached.dataUri
                }
            }
            val bytes = file.readBytes()
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            val mimeType = when {
                path.endsWith(".otf", ignoreCase = true) -> "font/otf"
                path.endsWith(".woff2", ignoreCase = true) -> "font/woff2"
                path.endsWith(".woff", ignoreCase = true) -> "font/woff"
                else -> "font/ttf"
            }
            val dataUri = "data:$mimeType;base64,$base64"
            fontDataUriCache.put(path, CachedFontData(modifiedAt, length, dataUri))
            dataUri
        } catch (e: Exception) {
            ""
        }
    }

    private fun authorizedLeftPanelTrees(requireWrite: Boolean = false): List<Uri> {
        val revoked = PreferenceManager.getDefaultSharedPreferences(this)
            .getStringSet("locally_revoked_storage_folder_uris", emptySet())
            .orEmpty()
        return contentResolver.persistedUriPermissions
            .filter {
                it.isReadPermission &&
                    (!requireWrite || it.isWritePermission) &&
                    android.provider.DocumentsContract.isTreeUri(it.uri) &&
                    it.uri.toString() !in revoked
            }
            .map { it.uri }
    }

    private fun authorizedLeftPanelTree(treeUri: Uri, requireWrite: Boolean = false): Uri? =
        authorizedLeftPanelTrees(requireWrite).firstOrNull { it == treeUri }

    private fun leftPanelTreeForDocument(documentUri: Uri, requireWrite: Boolean = false): Uri? {
        if (!android.provider.DocumentsContract.isDocumentUri(this, documentUri)) return null
        val documentTreeId = runCatching {
            android.provider.DocumentsContract.getTreeDocumentId(documentUri)
        }.getOrNull() ?: return null
        return authorizedLeftPanelTrees(requireWrite).firstOrNull { treeUri ->
            treeUri.authority == documentUri.authority &&
                runCatching {
                    android.provider.DocumentsContract.getTreeDocumentId(treeUri) == documentTreeId
                }.getOrDefault(false)
        }
    }

    private fun hasLeftPanelDocumentAccess(uri: Uri, write: Boolean = false): Boolean {
        if (leftPanelTreeForDocument(uri, requireWrite = write) != null) return true
        if (!write && uri == currentFileUri) return true
        val flag = if (write) {
            android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        } else {
            android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
        }
        return checkUriPermission(
            uri,
            android.os.Process.myPid(),
            android.os.Process.myUid(),
            flag
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
            contentResolver.persistedUriPermissions.any {
                it.uri == uri && (if (write) it.isWritePermission else it.isReadPermission)
            }
    }

    private fun queryLeftPanelChildren(treeUri: Uri, parentDocumentId: String): List<LeftPanelDocumentEntry> {
        if (authorizedLeftPanelTree(treeUri) == null) return emptyList()
        val childrenUri = runCatching {
            android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId)
        }.getOrNull() ?: return emptyList()
        return runCatching {
            contentResolver.query(
                childrenUri,
                arrayOf(
                    android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    android.provider.DocumentsContract.Document.COLUMN_MIME_TYPE
                ),
                null,
                null,
                null
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndex(android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameIndex = cursor.getColumnIndex(android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeIndex = cursor.getColumnIndex(android.provider.DocumentsContract.Document.COLUMN_MIME_TYPE)
                if (idIndex < 0 || nameIndex < 0 || mimeIndex < 0) return@use emptyList()
                buildList {
                    while (cursor.moveToNext()) {
                        val documentId = cursor.getString(idIndex) ?: continue
                        val name = cursor.getString(nameIndex) ?: continue
                        val mimeType = cursor.getString(mimeIndex).orEmpty()
                        val documentUri = runCatching {
                            android.provider.DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
                        }.getOrNull() ?: continue
                        add(
                            LeftPanelDocumentEntry(
                                documentId = documentId,
                                name = name,
                                uri = documentUri,
                                isDirectory = mimeType == android.provider.DocumentsContract.Document.MIME_TYPE_DIR,
                                mimeType = mimeType
                            )
                        )
                    }
                }.sortedWith(compareByDescending<LeftPanelDocumentEntry> { it.isDirectory }.thenBy { it.name.lowercase() })
            } ?: emptyList()
        }.getOrDefault(emptyList())
    }

    private fun leftPanelContextJson(): String {
        val uri = currentFileUri
        val name = currentFileName
        val markdown = latestMarkdownContent.orEmpty()
        return org.json.JSONObject()
            .put("launcherWindow", intent.getBooleanExtra("launcher_window", false))
            .put("taskId", taskId)
            .put("uri", uri?.toString())
            .put("name", name)
            .put("markdown", markdown)
            .put("dirty", isDirty)
            .put("emptyContentExplicitlyEdited", currentEmptyContentExplicitlyEdited)
            .put("isTextPack", currentTextPackSession != null || name.endsWith(".textpack", true) || name.endsWith(".textpack.zip", true))
            .put("isMdzip", currentMdzipSession != null || MdzipManager.isMdzipFileName(name))
            .put("hasBom", hasBom)
            .put("hasCrlf", hasCrlf)
            .toString()
    }

    private fun readLeftPanelDocument(uri: Uri): org.json.JSONObject {
        if (!hasLeftPanelDocumentAccess(uri)) {
            return org.json.JSONObject()
                .put("ok", false)
                .put("needsFolderAccess", true)
                .put("error", "This file is outside the folders approved for the panel.")
        }
        return runCatching {
            val name = getFileNameFromUri(uri)
            val mdzip = MdzipManager.isMdzipFileName(name)
            val textPack = !mdzip && TextPackManager.isTextPackFile(this, uri, name)
            val markdown = when {
                mdzip -> MdzipManager.open(this, uri).markdownContent
                textPack -> TextPackManager.openTextPack(this, uri).markdownContent
                else -> contentResolver.openInputStream(uri)?.use {
                    BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText()
                } ?: throw java.io.IOException("Could not read the selected file.")
            }
            org.json.JSONObject()
                .put("ok", true)
                .put("uri", uri.toString())
                .put("name", name)
                .put("markdown", markdown)
                .put("dirty", false)
                .put("isTextPack", textPack)
                .put("isMdzip", mdzip)
                .put("hasBom", markdown.startsWith("\uFEFF"))
                .put("hasCrlf", markdown.contains("\r\n"))
        }.getOrElse {
            org.json.JSONObject().put("ok", false).put("error", it.localizedMessage ?: "Could not read this file.")
        }
    }

    private fun leftPanelFileContains(
        uri: Uri,
        needle: String,
        wholeWordPattern: Regex?
    ): Boolean = runCatching {
        val input = contentResolver.openInputStream(uri) ?: return@runCatching false
        BufferedReader(InputStreamReader(input, Charsets.UTF_8)).use { reader ->
            var matched = false
            while (!matched && !Thread.currentThread().isInterrupted) {
                val line = reader.readLine() ?: break
                matched = wholeWordPattern?.containsMatchIn(line)
                    ?: line.contains(needle, ignoreCase = true)
            }
            matched
        }
    }.getOrDefault(false)

    private fun searchLeftPanelDocuments(
        query: String,
        includeContents: Boolean,
        wholeWords: Boolean,
        markdownOnly: Boolean
    ): String {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return org.json.JSONObject().put("items", JSONArray()).toString()
        val results = JSONArray()
        var scannedFiles = 0
        var truncated = false
        val maxResults = 100
        val maxScannedFiles = 2500
        val textExtensions = setOf(".md", ".markdown", ".txt")
        val wholeWordPattern = if (wholeWords) {
            Regex(
                "(^|[^\\p{L}\\p{N}_])${Regex.escape(needle)}(?![\\p{L}\\p{N}_])",
                RegexOption.IGNORE_CASE
            )
        } else {
            null
        }
        val markdownExtensions = setOf(".md", ".textpack", ".textpack.zip", ".mdz")

        for (treeUri in authorizedLeftPanelTrees()) {
            if (results.length() >= maxResults || scannedFiles >= maxScannedFiles) {
                truncated = true
                break
            }
            val rootId = runCatching { android.provider.DocumentsContract.getTreeDocumentId(treeUri) }
                .getOrNull() ?: continue
            val rootName = runCatching {
                queryDocumentDisplayName(
                    android.provider.DocumentsContract.buildDocumentUriUsingTree(treeUri, rootId)
                )
            }.getOrNull().orEmpty()
            val pending = java.util.ArrayDeque<Triple<String, String, Int>>()
            pending.add(Triple(rootId, rootName, 0))
            while (
                pending.isNotEmpty() &&
                results.length() < maxResults &&
                scannedFiles < maxScannedFiles &&
                !Thread.currentThread().isInterrupted
            ) {
                val (parentId, parentPath, depth) = pending.removeLast()
                if (depth > 14) {
                    truncated = true
                    continue
                }
                for (entry in queryLeftPanelChildren(treeUri, parentId)) {
                    if (Thread.currentThread().isInterrupted) break
                    if (results.length() >= maxResults) {
                        truncated = true
                        break
                    }
                    val path = listOf(parentPath, entry.name).filter { it.isNotBlank() }.joinToString("/")
                    if (entry.isDirectory) {
                        pending.add(Triple(entry.documentId, path, depth + 1))
                        continue
                    }
                    scannedFiles++
                    val hasTextPackExtension = entry.name.endsWith(".textpack", true) ||
                        entry.name.endsWith(".textpack.zip", true)
                    val hasMdzipExtension = MdzipManager.isMdzipFileName(entry.name)
                    val hasPlainTextExtension = textExtensions.any { entry.name.endsWith(it, true) }
                    val needsTextPackProbe = includeContents &&
                        !hasMdzipExtension &&
                        !hasPlainTextExtension &&
                        !hasTextPackExtension
                    val isTextPack = !hasMdzipExtension && (hasTextPackExtension ||
                        (needsTextPackProbe &&
                            TextPackManager.isTextPackFile(this, entry.uri, entry.name)))
                    val isMarkdownFile = markdownExtensions.any { entry.name.endsWith(it, true) } ||
                        isTextPack || hasMdzipExtension
                    if (markdownOnly && !isMarkdownFile) continue
                    val nameMatches = wholeWordPattern?.containsMatchIn(entry.name)
                        ?: entry.name.contains(needle, ignoreCase = true)
                    var contentMatches = false
                    if (
                        !nameMatches &&
                        includeContents &&
                        (
                            hasPlainTextExtension ||
                                isTextPack ||
                                hasMdzipExtension
                            )
                    ) {
                        contentMatches = runCatching {
                            if (hasMdzipExtension) {
                                MdzipManager.open(this, entry.uri).markdownContent.let { content ->
                                    wholeWordPattern?.containsMatchIn(content)
                                        ?: content.contains(needle, ignoreCase = true)
                                }
                            } else if (isTextPack) {
                                TextPackManager.openTextPack(this, entry.uri)
                                    .markdownContent.let { content ->
                                        wholeWordPattern?.containsMatchIn(content)
                                            ?: content.contains(needle, ignoreCase = true)
                                    }
                            } else {
                                leftPanelFileContains(entry.uri, needle, wholeWordPattern)
                            }
                        }.getOrDefault(false)
                    }
                    if (nameMatches || contentMatches) {
                        results.put(
                            org.json.JSONObject()
                                .put("uri", entry.uri.toString())
                                .put("name", entry.name)
                                .put("path", parentPath)
                                .put("match", if (nameMatches) "name" else "content")
                        )
                    }
                    if (results.length() >= maxResults) {
                        truncated = true
                        break
                    }
                    if (scannedFiles >= maxScannedFiles) break
                }
            }
            if (
                results.length() >= maxResults ||
                scannedFiles >= maxScannedFiles ||
                Thread.currentThread().isInterrupted
            ) {
                truncated = true
            }
        }
        return org.json.JSONObject()
            .put("items", results)
            .put("truncated", truncated)
            .put("scannedFiles", scannedFiles)
            .toString()
    }

    private fun saveLeftPanelDocument(
        uri: Uri,
        markdown: String,
        isTextPack: Boolean,
        tabHasBom: Boolean,
        tabHasCrlf: Boolean,
        emptyContentExplicitlyEdited: Boolean
    ): org.json.JSONObject {
        if (!hasLeftPanelDocumentAccess(uri, write = true)) {
            return org.json.JSONObject().put("ok", false).put("error", "This file is not writable.")
        }
        if (markdown.isEmpty() && !emptyContentExplicitlyEdited) {
            return org.json.JSONObject()
                .put("ok", false)
                .put("error", "The empty snapshot was not confirmed as an intentional edit.")
        }
        return runCatching {
            var content = markdown
            if (tabHasCrlf && !content.contains("\r\n") && content.contains("\n")) {
                content = content.replace("\r\n", "\n").replace("\n", "\r\n")
            }
            if (tabHasBom && !content.startsWith("\uFEFF")) content = "\uFEFF$content"
            val name = getFileNameFromUri(uri)
            val mdzipTarget = MdzipManager.isMdzipFileName(name)
            val packTarget = !mdzipTarget &&
                (isTextPack || TextPackManager.isTextPackFile(this, uri, name))
            if (mdzipTarget) {
                val session = if (uri == currentFileUri) {
                    currentMdzipSession ?: MdzipManager.open(this, uri)
                } else {
                    MdzipManager.open(this, uri)
                }
                MdzipManager.save(this, session, content, uri)
                if (uri == currentFileUri) {
                    currentMdzipSession = session
                    currentTextPackSession = null
                }
            } else if (packTarget) {
                val session = if (uri == currentFileUri) {
                    currentTextPackSession ?: TextPackManager.openTextPack(this, uri)
                } else {
                    TextPackManager.openTextPack(this, uri)
                }
                TextPackManager.saveTextPack(this, session, content, uri)
                if (uri == currentFileUri) {
                    currentTextPackSession = session
                    currentMdzipSession = null
                }
            } else {
                val output = contentResolver.openOutputStream(uri, "rwt")
                    ?: throw java.io.IOException("Could not open this file for writing.")
                output.use { stream ->
                    OutputStreamWriter(stream, Charsets.UTF_8).use { writer -> writer.write(content) }
                }
            }
            persistDocumentUriPermission(uri)
            if (uri == currentFileUri) {
                latestMarkdownContent = markdown
                isDirty = false
                currentRevision = 0
                currentEmptyContentExplicitlyEdited = false
                runOnUiThread { updateTitle() }
            }
            org.json.JSONObject().put("ok", true)
        }.getOrElse {
            org.json.JSONObject().put("ok", false).put("error", it.localizedMessage ?: "Could not save this file.")
        }
    }

    private fun saveToolbarKeyPreferencesConfig(surface: String, rawConfig: String): Boolean {
        if (surface != "bottom" && surface != "floating") return false
        if (rawConfig.length > 256_000) return false
        val config = runCatching { org.json.JSONObject(rawConfig) }.getOrNull()
            ?: return false
        if (config.optInt("version", 0) < 1 ||
            config.optJSONArray("order") == null ||
            config.optJSONObject("styles") == null) {
            return false
        }
        val preferenceKey = if (surface == "floating") {
            "pref_toolbar_floating_config"
        } else {
            "pref_toolbar_bottom_config"
        }
        val saved = PreferenceManager.getDefaultSharedPreferences(this)
            .edit()
            .putString(preferenceKey, config.toString())
            .commit()
        if (saved) runOnUiThread { refreshBottomToolbarFromPreferences() }
        return saved
    }

    private fun isToolbarKeyInConfig(config: org.json.JSONObject, itemId: String): Boolean {
        if (itemId == "toolbarToggleControl") return true
        if (config.optJSONObject("customGroups")?.has(itemId) == true ||
            config.optJSONObject("customKeys")?.has(itemId) == true) {
            return true
        }
        fun contains(array: org.json.JSONArray?): Boolean {
            return array != null &&
                (0 until array.length()).any { array.optString(it) == itemId }
        }
        if (contains(config.optJSONArray("order")) ||
            contains(config.optJSONArray("holding")) ||
            contains(config.optJSONArray("hidden"))) {
            return true
        }
        val popupGroups = config.optJSONObject("popupGroups") ?: return false
        val keys = popupGroups.keys()
        while (keys.hasNext()) {
            val group = popupGroups.optJSONObject(keys.next()) ?: continue
            if (contains(group.optJSONArray("order")) || contains(group.optJSONArray("hidden"))) {
                return true
            }
        }
        return false
    }

    private fun isSafeToolbarKeySvg(svg: String): Boolean {
        if (svg.toByteArray(Charsets.UTF_8).size > 64 * 1024) return false
        val trimmed = svg.trim()
        if (trimmed.isEmpty()) return true
        val lower = trimmed.lowercase()
        if (!lower.contains("<svg")) return false
        if (listOf(
                "<script", "foreignobject", "javascript:", "data:", "<embed", "<object",
                "<iframe", "<image", "<style", "url("
            ).any(lower::contains)) {
            return false
        }
        if (Regex("""\bon[a-z]+\s*=""", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) {
            return false
        }
        return runCatching { com.caverock.androidsvg.SVG.getFromString(trimmed) }.isSuccess
    }

    private fun updateToolbarKeyPreferenceStyle(
        surface: String,
        itemId: String,
        property: String,
        value: String
    ): Boolean {
        if (surface != "bottom" && surface != "floating") return false
        val isColor = property in setOf("iconColor", "backgroundColor", "activeBackgroundColor")
        val isSvg = property == "customSvg" ||
            property == "gestureActionIconSvg" ||
            Regex("""^gestureActionIconSvg:(longPress|tap1|tap2|tap3|swipeUp|swipeDown|swipeLeft|swipeRight|swipeUpLeft|swipeUpRight|swipeDownLeft|swipeDownRight)$""")
                .matches(property)
        if (!isColor && !isSvg) return false
        if (isColor && !Regex(
                """^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)|[A-Za-z]{1,20})$"""
            ).matches(value.trim())) {
            return false
        }
        if (isSvg && !isSafeToolbarKeySvg(value)) return false

        val preferences = PreferenceManager.getDefaultSharedPreferences(this)
        val preferenceKey = if (surface == "floating") {
            "pref_toolbar_floating_config"
        } else {
            "pref_toolbar_bottom_config"
        }
        val config = runCatching {
            org.json.JSONObject(preferences.getString(preferenceKey, null) ?: return false)
        }.getOrNull() ?: return false
        if (!isToolbarKeyInConfig(config, itemId)) return false

        val styles = config.optJSONObject("styles") ?: org.json.JSONObject().also {
            config.put("styles", it)
        }
        val style = styles.optJSONObject(itemId) ?: org.json.JSONObject()
        when {
            property in setOf("iconColor", "backgroundColor", "activeBackgroundColor") ->
                style.put(property, value.trim())
            property == "customSvg" -> {
                if (value.isBlank()) style.remove("customSvg") else style.put("customSvg", value.trim())
            }
            property == "gestureActionIconSvg" ->
                style.put("gestureActionIconSvg", value.trim())
            else -> {
                val gestureId = property.substringAfter(':')
                val gestureIcons = style.optJSONObject("gestureActionIcons")
                    ?: org.json.JSONObject().also { style.put("gestureActionIcons", it) }
                if (value.isBlank()) gestureIcons.remove(gestureId)
                else gestureIcons.put(gestureId, value.trim())
                if (gestureIcons.length() == 0) style.remove("gestureActionIcons")
            }
        }
        if (style.length() == 0) styles.remove(itemId) else styles.put(itemId, style)
        val updatedConfig = config.toString()
        if (!saveToolbarKeyPreferencesConfig(surface, updatedConfig)) return false
        val surfaceLiteral = org.json.JSONObject.quote(surface)
        val configLiteral = org.json.JSONObject.quote(updatedConfig)
        runOnUiThread {
            webView.evaluateJavascript(
                "window.updateToolbarKeyPreferencesFrame?.($surfaceLiteral, $configLiteral)",
                null
            )
        }
        return true
    }

    inner class WebAppInterface {
        @JavascriptInterface
        fun getLeftPanelContext(): String = leftPanelContextJson()

        @JavascriptInterface
        fun getCurrentDocumentSessionId(): String = currentDocumentSessionId

        @JavascriptInterface
        fun saveToolbarKeyPreferences(surface: String, rawConfig: String): Boolean =
            saveToolbarKeyPreferencesConfig(surface, rawConfig)

        @JavascriptInterface
        fun pickToolbarKeyColor(surface: String, itemId: String, property: String) {
            if (surface != "bottom" && surface != "floating") return
            if (property !in setOf("iconColor", "backgroundColor", "activeBackgroundColor")) return
            runOnUiThread {
                val preferenceKey = if (surface == "floating") {
                    "pref_toolbar_floating_config"
                } else {
                    "pref_toolbar_bottom_config"
                }
                val config = runCatching {
                    org.json.JSONObject(
                        PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
                            .getString(preferenceKey, null) ?: return@runOnUiThread
                    )
                }.getOrNull() ?: return@runOnUiThread
                if (!isToolbarKeyInConfig(config, itemId)) return@runOnUiThread

                val styleColor = config.optJSONObject("styles")
                    ?.optJSONObject(itemId)
                    ?.optString(property)
                    ?.takeIf { it.isNotBlank() && it != "default" }
                val preferenceDefaults = PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
                val inheritedColor = when (property) {
                    "iconColor" -> preferenceDefaults.getString(
                        if (surface == "floating") {
                            "pref_toolbar_floating_icon_color"
                        } else {
                            "pref_toolbar_icon_color"
                        },
                        "#FFFFFF"
                    )?.takeIf { it.isNotBlank() && it != "default" } ?: "#FFFFFF"
                    else -> "#00000000"
                }
                ColorPickerDialog(
                    this@MainActivity,
                    styleColor ?: inheritedColor
                ) { selected ->
                    updateToolbarKeyPreferenceStyle(surface, itemId, property, selected)
                }.show()
            }
        }

        @JavascriptInterface
        fun pickToolbarKeySvg(surface: String, itemId: String, property: String): Boolean {
            if (surface != "bottom" && surface != "floating") return false
            if (property != "customSvg" &&
                property != "gestureActionIconSvg" &&
                !Regex("""^gestureActionIconSvg:(longPress|tap1|tap2|tap3|swipeUp|swipeDown|swipeLeft|swipeRight|swipeUpLeft|swipeUpRight|swipeDownLeft|swipeDownRight)$""")
                    .matches(property)) {
                return false
            }
            val preferenceKey = if (surface == "floating") {
                "pref_toolbar_floating_config"
            } else {
                "pref_toolbar_bottom_config"
            }
            val config = runCatching {
                org.json.JSONObject(
                    PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
                        .getString(preferenceKey, null) ?: return false
                )
            }.getOrNull() ?: return false
            if (!isToolbarKeyInConfig(config, itemId)) return false
            runOnUiThread {
                pendingToolbarKeySvgRequest =
                    PendingToolbarKeySvgRequest(surface, itemId, property)
                toolbarKeySvgPickerLauncher.launch(arrayOf("image/svg+xml", "text/xml"))
            }
            return true
        }

        @JavascriptInterface
        fun setToolbarKeySvg(
            surface: String,
            itemId: String,
            property: String,
            svg: String
        ): Boolean = updateToolbarKeyPreferenceStyle(surface, itemId, property, svg)

        @JavascriptInterface
        fun isAutoSaveOnLeaveEnabled(): Boolean =
            PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
                .getBoolean("pref_auto_save_on_leave", true)

        @JavascriptInterface
        fun listLeftPanelFolderRoots(): String {
            val roots = JSONArray()
            for (treeUri in authorizedLeftPanelTrees()) {
                val documentId = runCatching {
                    android.provider.DocumentsContract.getTreeDocumentId(treeUri)
                }.getOrNull() ?: continue
                val rootDocumentUri = runCatching {
                    android.provider.DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
                }.getOrNull() ?: continue
                val name = queryDocumentDisplayName(rootDocumentUri) ?: "Folder"
                roots.put(
                    org.json.JSONObject()
                        .put("treeUri", treeUri.toString())
                        .put("documentId", documentId)
                        .put("uri", rootDocumentUri.toString())
                        .put("name", name)
                        .put("isDirectory", true)
                )
            }
            return roots.toString()
        }

        @JavascriptInterface
        fun requestDefaultSearchFolderAccess() {
            runOnUiThread {
                if (authorizedLeftPanelTrees().isNotEmpty()) {
                    webView.evaluateJavascript(
                        "window.leftPanelController?.onSearchFolderAccessResult?.(true);",
                        null
                    )
                } else {
                    openDefaultDocumentsFolderPicker()
                }
            }
        }

        @JavascriptInterface
        fun listLeftPanelFolderChildren(treeUriString: String, documentId: String): String {
            val treeUri = runCatching { Uri.parse(treeUriString) }.getOrNull() ?: return "[]"
            if (authorizedLeftPanelTree(treeUri) == null) return "[]"
            val items = JSONArray()
            queryLeftPanelChildren(treeUri, documentId).forEach { entry ->
                items.put(
                    org.json.JSONObject()
                        .put("treeUri", treeUri.toString())
                        .put("documentId", entry.documentId)
                        .put("uri", entry.uri.toString())
                        .put("name", entry.name)
                        .put("isDirectory", entry.isDirectory)
                )
            }
            return items.toString()
        }

        @JavascriptInterface
        fun readLeftPanelDocument(uriString: String): String {
            val uri = runCatching { Uri.parse(uriString) }.getOrNull()
                ?: return org.json.JSONObject().put("ok", false).put("error", "Invalid file.").toString()
            return this@MainActivity.readLeftPanelDocument(uri).toString()
        }

        @JavascriptInterface
        fun readWmdxTabSession(uriString: String): String {
            val uri = runCatching { Uri.parse(uriString) }.getOrNull()
                ?: return org.json.JSONObject()
                    .put("isSession", false)
                    .toString()
            return this@MainActivity.readWmdxTabSession(uri).toString()
        }

        @JavascriptInterface
        fun saveWmdxTabSession(sessionJson: String): Boolean {
            val sanitized = sanitizeWmdxTabSession(sessionJson) ?: return false
            if (isFinishing) return false
            runOnUiThread {
                pendingWmdxTabSessionJson = sanitized
                saveWmdxTabSessionLauncher.launch("Wmdx Session.wmdx")
            }
            return true
        }

        @JavascriptInterface
        fun updateWmdxTabSession(sessionJson: String, uriString: String): String {
            val uri = runCatching { Uri.parse(uriString) }.getOrNull()
                ?: return org.json.JSONObject()
                    .put("ok", false)
                    .put("error", "The session file location is invalid.")
                    .toString()
            val sanitized = sanitizeWmdxTabSession(sessionJson)
                ?: return org.json.JSONObject()
                    .put("ok", false)
                    .put("error", "The session data is invalid.")
                    .toString()
            return runCatching {
                writeWmdxTabSession(uri, sanitized)
                clearPendingWmdxTabSessionSave(uri)
                org.json.JSONObject().put("ok", true).toString()
            }.getOrElse { error ->
                val cached = cachePendingWmdxTabSessionSave(uri, sanitized)
                org.json.JSONObject()
                    .put("ok", false)
                    .put("error", error.localizedMessage ?: "Could not update the session file.")
                    .put("cached", cached)
                    .toString()
            }
        }

        @JavascriptInterface
        fun hasPendingWmdxTabSessionSave(uriString: String): Boolean =
            this@MainActivity.hasCachedWmdxTabSessionSave(uriString)

        @JavascriptInterface
        fun getDocumentNavigationHistory(): String =
            this@MainActivity.documentHistoryStateJson()

        @JavascriptInterface
        fun registerLeftPanelOpenTabUris(urisJson: String) {
            WindowRegistry.registerOpenTabUris(this@MainActivity, urisJson)
        }

        @JavascriptInterface
        fun focusOpenDocument(uriString: String): Boolean {
            val uri = runCatching { Uri.parse(uriString).normalizeScheme() }.getOrNull()
                ?: return false
            return WindowRegistry.focus(this@MainActivity, uri, excludeTask = taskId)
        }

        @JavascriptInterface
        fun readLeftPanelDocumentForNavigation(uriString: String): String {
            val uri = runCatching { Uri.parse(uriString) }.getOrNull()
                ?: return org.json.JSONObject().put("ok", false).put("error", "Invalid file.").toString()
            val document = this@MainActivity.readLeftPanelDocument(uri)
            if (document.optBoolean("ok") && currentFileUri != uri) {
                synchronized(documentHistoryLock) {
                    currentFileUri?.let { current -> documentHistoryStack.push(current) }
                    documentForwardStack.clear()
                }
            }
            return document.toString()
        }

        @JavascriptInterface
        fun searchLeftPanelFiles(
            query: String,
            includeContents: Boolean,
            wholeWords: Boolean,
            markdownOnly: Boolean,
            requestId: Int
        ) {
            val safeQuery = query.take(240)
            synchronized(this@MainActivity) {
                leftPanelSearchFuture?.cancel(true)
                leftPanelSearchFuture = leftPanelSearchExecutor.submit {
                    val results = searchLeftPanelDocuments(
                        safeQuery,
                        includeContents,
                        wholeWords,
                        markdownOnly
                    )
                    if (!Thread.currentThread().isInterrupted && !isFinishing) {
                        val escapedResults = JSONObjectWrapper.quote(results)
                        webView.post {
                            if (!isFinishing && webView.isAttachedToWindow) {
                                webView.evaluateJavascript(
                                    "window.leftPanelController?.onSearchResults?.($requestId, $escapedResults);",
                                    null
                                )
                            }
                        }
                    }
                }
            }
        }

        @JavascriptInterface
        fun activateLeftPanelTab(
            uriString: String,
            name: String,
            markdown: String,
            dirty: Boolean,
            isTextPack: Boolean,
            tabHasBom: Boolean,
            tabHasCrlf: Boolean,
            emptyContentExplicitlyEdited: Boolean,
            historyStateJson: String?
        ): Boolean {
            val uri = uriString.takeIf { it.isNotBlank() }?.let {
                runCatching { Uri.parse(it) }.getOrNull()
            }
            if (uri != null && !hasLeftPanelDocumentAccess(uri)) return false
            restoreDocumentHistoryState(historyStateJson.orEmpty())
            currentFileUri = uri
            currentFileName = name.ifBlank { "Untitled.md" }
            currentDocumentFormat = when {
                MdzipManager.isMdzipFileName(name) -> DocumentFormat.MDZIP
                isTextPack || name.endsWith(".textpack", ignoreCase = true) ||
                    name.endsWith(".textpack.zip", ignoreCase = true) ->
                    DocumentFormat.TEXT_PACK
                else -> DocumentFormat.MARKDOWN
            }
            clearEmbeddedMdzipSessions()
            currentDocumentSessionId = java.util.UUID.randomUUID().toString()
            currentRevision = 0
            currentEmptyContentExplicitlyEdited = emptyContentExplicitlyEdited
            val isMdzipFile = uri != null && MdzipManager.isMdzipFileName(name)
            currentTextPackSession = if (isTextPack && uri != null && !isMdzipFile) {
                runCatching { TextPackManager.openTextPack(this@MainActivity, uri) }.getOrNull()
            } else null
            currentMdzipSession = if (isMdzipFile && uri != null) {
                runCatching { MdzipManager.open(this@MainActivity, uri) }.getOrNull()
            } else null
            if (currentMdzipSession != null) currentTextPackSession = null
            hasBom = tabHasBom
            hasCrlf = tabHasCrlf
            latestMarkdownContent = markdown
            isDirty = dirty
            runOnUiThread { updateTitle() }
            return true
        }

        @JavascriptInterface
        fun saveLeftPanelTab(
            uriString: String,
            name: String,
            markdown: String,
            isTextPack: Boolean,
            tabHasBom: Boolean,
            tabHasCrlf: Boolean,
            emptyContentExplicitlyEdited: Boolean
        ): String {
            val uri = runCatching { Uri.parse(uriString) }.getOrNull()
                ?: return org.json.JSONObject().put("ok", false).put("error", "This tab has no saved file yet.").toString()
            return saveLeftPanelDocument(
                uri,
                markdown,
                isTextPack,
                tabHasBom,
                tabHasCrlf,
                emptyContentExplicitlyEdited
            ).toString()
        }

        @JavascriptInterface
        fun renameLeftPanelDocument(uriString: String, requestedName: String): String {
            val uri = runCatching { Uri.parse(uriString) }.getOrNull()
                ?: return org.json.JSONObject().put("ok", false).put("error", "Invalid file.").toString()
            if (!hasLeftPanelDocumentAccess(uri, write = true)) {
                return org.json.JSONObject().put("ok", false).put("error", "This file is not writable.").toString()
            }
            val newName = requestedName.trim().take(180)
            if (newName.isBlank()) return org.json.JSONObject().put("ok", false).put("error", "Enter a file name.").toString()
            if (newName.contains('/') || newName.contains('\\')) {
                return org.json.JSONObject().put("ok", false).put("error", "File names cannot contain path separators.").toString()
            }
            val renamed = runCatching {
                android.provider.DocumentsContract.renameDocument(contentResolver, uri, newName)
            }.getOrNull() ?: return org.json.JSONObject().put("ok", false).put("error", "The storage provider could not rename this file.").toString()
            val finalName = queryDocumentDisplayName(renamed) ?: newName
            if (currentFileUri == uri) {
                currentFileUri = renamed
                currentFileName = finalName
                runOnUiThread { updateTitle() }
            }
            return org.json.JSONObject()
                .put("ok", true)
                .put("uri", renamed.toString())
                .put("name", finalName)
                .toString()
        }

        @JavascriptInterface
        fun deleteLeftPanelDocument(uriString: String): String {
            val uri = runCatching { Uri.parse(uriString) }.getOrNull()
                ?: return org.json.JSONObject().put("ok", false).put("error", "Invalid file.").toString()
            if (!hasLeftPanelDocumentAccess(uri, write = true)) {
                return org.json.JSONObject().put("ok", false).put("error", "This file is not writable.").toString()
            }
            val deleted = runCatching {
                android.provider.DocumentsContract.deleteDocument(contentResolver, uri)
            }.getOrDefault(false)
            return if (deleted) {
                org.json.JSONObject().put("ok", true).toString()
            } else {
                org.json.JSONObject().put("ok", false).put("error", "The storage provider could not delete this file.").toString()
            }
        }

        @JavascriptInterface
        fun showToast(message: String) {
            showCustomToast(message)
        }

        @JavascriptInterface
        fun onHostReady() {
            runOnUiThread {
                AppDiagnostics.record(this@MainActivity, "web_host_ready")
                val prefs = PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
                val selectedMode = prefs.getString("pref_editor_mode", "rich_text") ?: "rich_text"
                currentEditorMode = selectedMode
                AppDiagnostics.record(this@MainActivity, "init_mode_requested", "mode=$selectedMode")
                webView.evaluateJavascript("window.editorBridge.setEditorMode('$selectedMode');", null)
            }
        }

        @JavascriptInterface
        fun onDirtyStateChanged(dirty: Boolean, revision: Long, documentSessionId: String?) {
            if (documentSessionId != currentDocumentSessionId) return
            runOnUiThread {
                currentRevision = revision
                if (isDirty != dirty) {
                    isDirty = dirty
                    updateTitle()
                }
            }
        }

        @JavascriptInterface
        fun onContentChanged(markdownText: String?, revision: Long, documentSessionId: String?) {
            if (documentSessionId != currentDocumentSessionId) {
                AppDiagnostics.record(this@MainActivity, "stale_document_edit_ignored")
                return
            }
            if (markdownText != null) {
                latestMarkdownContent = markdownText
            }
            currentRevision = revision
            currentEmptyContentExplicitlyEdited =
                revision > 0 && markdownText.isNullOrEmpty()
            val becameDirty = !isDirty
            isDirty = true
            if (becameDirty) runOnUiThread { updateTitle() }
        }

        @JavascriptInterface
        fun reportDiagnostic(event: String, detail: String = "") {
            if (BuildConfig.DEBUG) {
                AppDiagnostics.record(this@MainActivity, event, detail)
            }
        }

        @JavascriptInterface
        fun reportNavigationTrace(jsonRecord: String?) {
            if (BuildConfig.DEBUG && jsonRecord != null && jsonRecord.length <= 16 * 1024) {
                AppDiagnostics.recordNavigationTrace(this@MainActivity, jsonRecord)
            }
        }

        @JavascriptInterface
        fun reportNavigationTraceBatch(jsonBatch: String?) {
            if (BuildConfig.DEBUG && jsonBatch != null) {
                AppDiagnostics.recordNavigationTraceBatch(this@MainActivity, jsonBatch)
            }
        }

        @JavascriptInterface
        fun captureDiagnosticSnapshot(reason: String?) {
            if (BuildConfig.DEBUG) {
                AppDiagnostics.captureWindowSnapshot(this@MainActivity, webView, reason ?: "webview-request")
            }
        }

        @JavascriptInterface
        fun isNavigationCaptureActive(): Boolean =
            AppDiagnostics.isNavigationCaptureActive(this@MainActivity)

        @JavascriptInterface
        fun onEditorReady(mode: String? = null) {
            runOnUiThread {
                val activeMode = mode ?: currentEditorMode
                currentEditorMode = activeMode
                val wasReady = isEditorReady
                AppDiagnostics.record(this@MainActivity, "editor_ready", "mode=$activeMode")
                isEditorReady = true
                if (!wasReady) {
                    applyThemeAndFullscreenPreferences()
                }
                updateTitle()

                pendingOpenUri?.let { uri ->
                    pendingOpenUri = null
                    val permissionFlags = pendingOpenPermissionFlags
                    pendingOpenPermissionFlags = null
                    val skipExistingWindowFocus = pendingOpenSkipExistingWindowFocus
                    pendingOpenSkipExistingWindowFocus = false
                    openFile(
                        uri,
                        skipExistingWindowFocus = skipExistingWindowFocus,
                        permissionFlags = permissionFlags
                    )
                }
                pendingSharedText?.let { text ->
                    pendingSharedText = null
                    currentFileUri = null
                    currentFileName = getString(R.string.untitled_document)
                    currentDocumentFormat = DocumentFormat.MARKDOWN
                    clearEmbeddedMdzipSessions()
                    currentDocumentSessionId = java.util.UUID.randomUUID().toString()
                    currentRevision = 0
                    currentTextPackSession = null
                    currentMdzipSession = null
                    latestMarkdownContent = text
                    isDirty = text.isNotEmpty()
                    val escaped = JSONObjectWrapper.quote(text)
                    webView.evaluateJavascript("window.editorBridge.setMarkdown($escaped);") {
                        updateTitle()
                    }
                }
                dispatchPendingExistingDocumentFocus()

                webView.post {
                    webView.requestLayout()
                    webView.invalidate()
                }
            }
        }

        @JavascriptInterface
        fun onNativeAction(action: String) {
            runOnUiThread {
                when (action) {
                    "new" -> handleNewFile()
                    "new_markdown" -> requestNewDocument(DocumentFormat.MARKDOWN)
                    "new_mdzip" -> requestNewDocument(DocumentFormat.MDZIP)
                    "open_session" -> {
                        pendingSessionOpenInNewWindow = false
                        openWmdxTabSessionLauncher.launch(createOpenWmdxTabSessionIntent())
                    }
                    "open_session_new_window" -> {
                        pendingSessionOpenInNewWindow = true
                        openWmdxTabSessionLauncher.launch(createOpenWmdxTabSessionIntent())
                    }
                    "open" -> handleOpenFile()
                    "save" -> handleSaveFile()
                    "save_as" -> handleSaveAsFile()
                    "save_as_textpack" -> handleSaveAsTextPackFile()
                    "save_as_mdzip" -> handleSaveAsMdzipFile()
                    "export" -> handleExportDocument()
                    "image" -> handleInsertImage()
                    "audio" -> handleInsertAudio()
                    "video" -> handleInsertVideo()
                    "attachment" -> handleInsertAttachment()
                    "embed" -> handleInsertEmbeddedDocument()
                    "new_window" -> handleNewWindow()
                    "settings" -> settingsLauncher.launch(android.content.Intent(this@MainActivity, SettingsActivity::class.java))
                    "toc_settings" -> settingsLauncher.launch(
                        android.content.Intent(this@MainActivity, SettingsActivity::class.java)
                            .putExtra("settings_page", "toc")
                    )
                    "history_back" -> navigateCombinedHistory("back")
                    "history_forward" -> navigateCombinedHistory("forward")
                }
            }
        }

        @JavascriptInterface
        fun resolveMdzipMediaUrl(relativeLink: String): String {
            return runCatching {
                when (currentDocumentFormat) {
                    DocumentFormat.MDZIP -> {
                        val session = currentMdzipSession ?: return ""
                        MdzipManager.audioUrl(session, relativeLink)
                            ?: MdzipManager.videoUrl(session, relativeLink)
                    }
                    DocumentFormat.TEXT_PACK -> currentTextPackSession?.let {
                        TextPackManager.previewAssetUrl(it, relativeLink)
                    }
                    DocumentFormat.MARKDOWN -> resolveMarkdownAssetUrl(relativeLink)
                }
            }
                .getOrNull()
                .orEmpty()
        }

        @JavascriptInterface
        fun resolveMdzipAttachmentUrl(relativeLink: String): String {
            return runCatching {
                when (currentDocumentFormat) {
                    DocumentFormat.MDZIP -> currentMdzipSession?.let {
                        MdzipManager.assetUrl(it, relativeLink)
                    }
                    DocumentFormat.TEXT_PACK -> currentTextPackSession?.let {
                        TextPackManager.previewAssetUrl(it, relativeLink)
                    }
                    DocumentFormat.MARKDOWN -> resolveMarkdownAssetUrl(relativeLink)
                }
            }.getOrNull().orEmpty()
        }

        @JavascriptInterface
        fun resolveTextPackAssetUrl(relativeLink: String): String {
            val session = currentTextPackSession ?: return ""
            return runCatching {
                TextPackManager.previewAssetUrl(session, relativeLink)
            }
                .getOrNull()
                .orEmpty()
        }

        @JavascriptInterface
        fun resolveMarkdownAssetUrl(relativeLink: String): String {
            if (currentTextPackSession != null || currentMdzipSession != null) return ""
            val trimmedLink = relativeLink.trim()
            if (
                trimmedLink.isBlank() ||
                trimmedLink.startsWith("/") ||
                trimmedLink.startsWith("//") ||
                Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(trimmedLink)
            ) {
                return ""
            }
            val documentUri = currentFileUri ?: return ""
            return runCatching {
                val location = MarkdownAssetManager.locateDocument(
                    this@MainActivity,
                    documentUri,
                    requireWrite = false
                ) ?: return@runCatching ""
                MarkdownAssetManager.previewAssetUrl(
                    this@MainActivity,
                    location,
                    currentDocumentSessionId,
                    relativeLink
                )
            }.getOrNull().orEmpty()
        }

        @JavascriptInterface
        fun canOpenAttachment(
            relativeLink: String,
            documentSessionId: String?,
            sourceContextJson: String?
        ): Boolean {
            if (documentSessionId != currentDocumentSessionId) return false
            return resolveEmbeddedAttachmentUri(relativeLink, sourceContextJson) != null
        }

        @JavascriptInterface
        fun canDeletePackagedAsset(relativeLink: String, documentSessionId: String?): Boolean {
            if (documentSessionId != currentDocumentSessionId) return false
            return when (currentDocumentFormat) {
                DocumentFormat.MDZIP -> currentMdzipSession?.let {
                    MdzipManager.canDeletePackagedAsset(it, relativeLink)
                } ?: false
                DocumentFormat.TEXT_PACK -> currentTextPackSession?.let {
                    TextPackManager.canDeleteAsset(it, relativeLink)
                } ?: false
                DocumentFormat.MARKDOWN -> false
            }
        }

        @JavascriptInterface
        fun deletePackagedAsset(relativeLink: String, documentSessionId: String?): Boolean {
            if (documentSessionId != currentDocumentSessionId) return false
            return when (currentDocumentFormat) {
                DocumentFormat.MDZIP -> currentMdzipSession?.let {
                    runCatching {
                        MdzipManager.stagePackagedAssetDeletion(it, relativeLink)
                    }.getOrDefault(false)
                } ?: false
                DocumentFormat.TEXT_PACK -> currentTextPackSession?.let {
                    runCatching {
                        TextPackManager.stageAssetDeletion(it, relativeLink)
                    }.getOrDefault(false)
                } ?: false
                DocumentFormat.MARKDOWN -> false
            }
        }

        @JavascriptInterface
        fun syncPackagedAssetReferences(
            referencesJson: String?,
            documentSessionId: String?
        ) {
            if (documentSessionId != currentDocumentSessionId) return
            val references = runCatching {
                val values = org.json.JSONArray(referencesJson ?: "[]")
                (0 until values.length()).mapNotNull { index ->
                    values.optString(index).takeIf { it.isNotBlank() }
                }
            }.getOrNull() ?: return

            when (currentDocumentFormat) {
                DocumentFormat.MDZIP -> currentMdzipSession?.let {
                    MdzipManager.syncPackagedAssetReferences(it, references)
                }
                DocumentFormat.TEXT_PACK -> currentTextPackSession?.let {
                    TextPackManager.syncAssetReferences(it, references)
                }
                DocumentFormat.MARKDOWN -> Unit
            }
        }

        @JavascriptInterface
        fun openMarkdownLink(
            target: String,
            documentSessionId: String?,
            sourceContextJson: String?
        ): Boolean {
            if (documentSessionId != currentDocumentSessionId) return false

            val link = target.trim()
            if (link.isBlank()) return false

            val externalUri = when {
                link.startsWith("https://", ignoreCase = true) ||
                    link.startsWith("http://", ignoreCase = true) ||
                    link.startsWith("ftp://", ignoreCase = true) ||
                    link.startsWith("mailto:", ignoreCase = true) ->
                    runCatching { Uri.parse(link) }.getOrNull()
                link.startsWith("www.", ignoreCase = true) ->
                    Uri.parse("https://$link")
                Regex("""^[^@\s]+@[^@\s]+\.[^@\s]+$""").matches(link) ->
                    Uri.parse("mailto:$link")
                else -> null
            }

            if (externalUri != null) {
                runOnUiThread {
                    if (documentSessionId != currentDocumentSessionId) return@runOnUiThread
                    try {
                        startActivity(
                            android.content.Intent(
                                android.content.Intent.ACTION_VIEW,
                                externalUri
                            )
                        )
                    } catch (_: android.content.ActivityNotFoundException) {
                        ThemedToast.show(
                            this@MainActivity,
                            "No app on this device can open that link.",
                            Toast.LENGTH_LONG
                        )
                    } catch (error: Exception) {
                        ThemedToast.show(
                            this@MainActivity,
                            "Could not open the link: ${error.localizedMessage ?: "unknown error"}",
                            Toast.LENGTH_LONG
                        )
                    }
                }
                return true
            }

            val uriScheme = runCatching { Uri.parse(link).scheme }.getOrNull()
            val relativePath = link.substringBefore('#').substringBefore('?').trim()
            val sourceLinks = parseEmbeddedSourceLinks(sourceContextJson)
            val embeddedTarget = if (
                sourceLinks?.isNotEmpty() == true ||
                currentDocumentFormat == DocumentFormat.MDZIP
            ) {
                runCatching {
                    resolveEmbeddedDocumentTarget(relativePath, sourceContextJson)
                }.getOrNull()
            } else {
                null
            }
            val targetIsInsideArchive = embeddedTarget?.archiveSession != null
            val linkedUri = when {
                uriScheme != null ||
                    relativePath.isBlank() ||
                    relativePath.startsWith("/") ||
                    relativePath.startsWith("\\") -> null
                targetIsInsideArchive -> null
                embeddedTarget != null -> embeddedTarget.uri
                currentDocumentFormat == DocumentFormat.MARKDOWN ->
                    currentFileUri?.let { parentUri ->
                        runCatching {
                            resolveExternalEmbeddedDocumentUri(parentUri, relativePath)
                        }.getOrNull()
                    }
                else -> null
            }

            if (linkedUri == null) {
                runOnUiThread {
                    if (documentSessionId == currentDocumentSessionId) {
                        ThemedToast.show(
                            this@MainActivity,
                            if (targetIsInsideArchive) {
                                "A linked file inside an MDZip archive cannot be opened for editing yet."
                            } else {
                                "Could not open the linked file. Confirm its path and folder access, then try again."
                            },
                            Toast.LENGTH_LONG
                        )
                    }
                }
                return false
            }

            if (linkedUri == currentFileUri) return true

            runOnUiThread {
                if (documentSessionId != currentDocumentSessionId) return@runOnUiThread
                val openLinkedFile = { openFile(linkedUri) }
                if (isDirty) {
                    showUnsavedChangesDialog(openLinkedFile)
                } else {
                    openLinkedFile()
                }
            }
            return true
        }

        @JavascriptInterface
        fun openAttachment(
            relativeLink: String,
            documentSessionId: String?,
            sourceContextJson: String?
        ): Boolean {
            if (documentSessionId != currentDocumentSessionId) return false
            val attachmentUri =
                resolveEmbeddedAttachmentUri(relativeLink, sourceContextJson) ?: return false
            runOnUiThread {
                if (documentSessionId != currentDocumentSessionId) {
                    return@runOnUiThread
                }
                try {
                    val uri = attachmentUri
                    val fileName = getFileNameFromUri(uri)
                    val mimeType = android.webkit.MimeTypeMap.getSingleton()
                        .getMimeTypeFromExtension(fileName.substringAfterLast('.', "").lowercase())
                        ?: contentResolver.getType(uri)
                        ?: "application/octet-stream"
                    val viewIntent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, mimeType)
                        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivity(android.content.Intent.createChooser(viewIntent, "Open attachment"))
                } catch (_: android.content.ActivityNotFoundException) {
                    ThemedToast.show(
                        this@MainActivity,
                        "No app on this device can open that file.",
                        Toast.LENGTH_LONG
                    )
                } catch (error: Exception) {
                    ThemedToast.show(
                        this@MainActivity,
                        "Could not open the attachment: ${error.localizedMessage ?: "unknown error"}",
                        Toast.LENGTH_LONG
                    )
                }
            }
            return true
        }

        @JavascriptInterface
        fun canOpenMdzipAttachment(relativeLink: String, documentSessionId: String?): Boolean =
            canOpenAttachment(relativeLink, documentSessionId, null)

        @JavascriptInterface
        fun openMdzipAttachment(relativeLink: String, documentSessionId: String?): Boolean =
            openAttachment(relativeLink, documentSessionId, null)

        @JavascriptInterface
        fun loadEmbeddedMarkdown(
            relativeLink: String,
            documentSessionId: String?,
            sourceContextJson: String?
        ): String {
            if (documentSessionId != currentDocumentSessionId) {
                return JSONObject().put("ok", false).toString()
            }
            var loadStage = "resolve"
            return runCatching {
                val target = resolveEmbeddedDocumentTarget(relativeLink, sourceContextJson)
                    ?: throw java.io.FileNotFoundException(
                        if (parseEmbeddedSourceLinks(sourceContextJson)?.isNotEmpty() == true) {
                            "The embedded document could not be found relative to its parent document."
                        } else if (currentDocumentFormat == DocumentFormat.MARKDOWN) {
                            EMBEDDED_MARKDOWN_READ_ACCESS_MESSAGE
                        } else {
                            "The embedded document could not be found."
                        }
                    )
                val sourceUri = target.uri
                val fileName = getFileNameFromUri(sourceUri)
                val isMdzip = MdzipManager.isMdzipFileName(fileName)
                loadStage = if (isMdzip) "open_mdzip" else "read_text"
                val markdown = when {
                    isMdzip ->
                        getEmbeddedMdzipSession(sourceUri).markdownContent
                    else -> readEmbeddedMarkdown(sourceUri, fileName, isMdzip = false)
                }
                JSONObject()
                    .put("ok", true)
                    .put("markdown", markdown)
                    .toString()
            }.getOrElse { error ->
                AppDiagnostics.record(
                    this@MainActivity,
                    "embedded_document_load_failed",
                    "stage=$loadStage error=${error.javaClass.simpleName}"
                )
                val message =
                    when {
                        error is SecurityException ->
                            EMBEDDED_MARKDOWN_READ_ACCESS_MESSAGE
                        currentDocumentFormat == DocumentFormat.MARKDOWN &&
                            loadStage == "resolve" &&
                            parseEmbeddedSourceLinks(sourceContextJson)?.isEmpty() == true &&
                            error is java.io.FileNotFoundException ->
                            EMBEDDED_MARKDOWN_READ_ACCESS_MESSAGE
                        else ->
                            error.localizedMessage ?: "Could not load this embedded document."
                    }
                JSONObject()
                    .put("ok", false)
                    .put("message", message)
                    .toString()
            }
        }

        @JavascriptInterface
        fun saveEmbeddedMarkdown(
            relativeLink: String,
            markdownText: String?,
            documentSessionId: String?,
            sourceContextJson: String?
        ): Boolean {
            if (documentSessionId != currentDocumentSessionId || markdownText == null) return false
            val bytes = markdownText.toByteArray(Charsets.UTF_8)
            if (bytes.size > MAX_EMBEDDED_DOCUMENT_BYTES) return false

            return runCatching {
                val decodedLink = if (relativeLink.startsWith("content://", ignoreCase = true)) {
                    relativeLink
                } else {
                    Uri.decode(relativeLink)
                }
                val isDirectLinkedFile = runCatching {
                    Uri.parse(decodedLink).scheme == "content"
                }.getOrDefault(false)
                val target = resolveEmbeddedDocumentTarget(relativeLink, sourceContextJson)
                    ?: throw java.io.FileNotFoundException(
                        "The embedded document could not be found."
                    )
                val targetUri = target.uri

                val fileName = getFileNameFromUri(targetUri)
                if (
                    target.archiveSession != null &&
                    target.archivePath != null
                ) {
                    if (MdzipManager.isMdzipFileName(fileName)) {
                        MdzipManager.save(
                            this@MainActivity,
                            getEmbeddedMdzipSession(targetUri),
                            markdownText,
                            targetUri
                        )
                    } else {
                        val output = contentResolver.openOutputStream(targetUri, "w")
                            ?: throw java.io.IOException(
                                "Could not open the embedded document for writing."
                            )
                        output.use { it.write(bytes) }
                    }
                    if (currentDocumentFormat == DocumentFormat.MDZIP) {
                        runOnUiThread {
                            if (documentSessionId == currentDocumentSessionId) {
                                isDirty = true
                                updateTitle()
                            }
                        }
                    } else {
                        val archiveUri = target.archiveSession.sourceUri
                            ?: throw java.io.IOException(
                                "The embedded MDZip has no writable source file."
                            )
                        MdzipManager.save(
                            this@MainActivity,
                            target.archiveSession,
                            target.archiveSession.markdownContent,
                            archiveUri
                        )
                    }
                } else if (MdzipManager.isMdzipFileName(fileName)) {
                    MdzipManager.save(
                        this@MainActivity,
                        getEmbeddedMdzipSession(targetUri),
                        markdownText,
                        targetUri
                    )
                } else {
                    val output = contentResolver.openOutputStream(targetUri, "w")
                        ?: throw java.io.IOException(
                            "Could not open the embedded document for writing."
                        )
                    output.use { it.write(bytes) }
                }

                val isPackagedCopy = !isDirectLinkedFile &&
                    (currentDocumentFormat == DocumentFormat.MDZIP ||
                        currentDocumentFormat == DocumentFormat.TEXT_PACK)
                if (isPackagedCopy) {
                    runOnUiThread {
                        if (documentSessionId == currentDocumentSessionId) {
                            isDirty = true
                            updateTitle()
                        }
                    }
                }
                true
            }.onFailure {
                AppDiagnostics.record(this@MainActivity, "embedded_document_save_failed")
            }.getOrDefault(false)
        }

        @JavascriptInterface
        fun resolveEmbeddedAssetUrl(
            relativeLink: String,
            sourceContextJson: String,
            documentSessionId: String?
        ): String {
            if (documentSessionId != currentDocumentSessionId) return ""
            return runCatching {
                val sourceLinks = parseEmbeddedSourceLinks(sourceContextJson) ?: return ""
                if (sourceLinks.isNotEmpty()) {
                    when (val source = resolveEmbeddedSourceContext(sourceLinks) ?: return "") {
                        is EmbeddedDocumentSourceContext.MdzipFile ->
                            return MdzipManager.assetUrl(
                                source.session,
                                source.markdownPath,
                                relativeLink
                            ).orEmpty()
                        is EmbeddedDocumentSourceContext.ExternalFile -> {
                            val location = MarkdownAssetManager.locateDocument(
                                this@MainActivity,
                                source.uri,
                                requireWrite = false
                            ) ?: return ""
                            return MarkdownAssetManager.previewAssetUrl(
                                this@MainActivity,
                                location,
                                currentDocumentSessionId,
                                relativeLink
                            ).orEmpty()
                        }
                    }
                }

                val sourceUri = resolveEmbeddedDocumentUri(relativeLink) ?: return ""
                val location = MarkdownAssetManager.locateDocument(
                    this@MainActivity,
                    sourceUri,
                    requireWrite = false
                ) ?: return ""
                MarkdownAssetManager.previewAssetUrl(
                    this@MainActivity,
                    location,
                    currentDocumentSessionId,
                    relativeLink
                ).orEmpty()
            }.getOrDefault("")
        }

        private fun parseEmbeddedSourceLinks(sourceContextJson: String?): List<String>? {
            if (sourceContextJson.isNullOrBlank()) return emptyList()
            val trimmed = sourceContextJson.trim()
            if (!trimmed.startsWith("[")) return listOf(trimmed)
            return try {
                val sourceLinks = JSONArray(trimmed)
                if (sourceLinks.length() > 4) return null
                val links = mutableListOf<String>()
                for (index in 0 until sourceLinks.length()) {
                    val link = sourceLinks.getString(index).trim()
                    if (link.isBlank()) return null
                    links += link
                }
                links
            } catch (_: Exception) {
                null
            }
        }

        private fun resolveEmbeddedSourceContext(
            sourceLinks: List<String>
        ): EmbeddedDocumentSourceContext? {
            var source: EmbeddedDocumentSourceContext = when (currentDocumentFormat) {
                DocumentFormat.MARKDOWN ->
                    currentFileUri?.let { EmbeddedDocumentSourceContext.ExternalFile(it) }
                        ?: return null
                DocumentFormat.MDZIP ->
                    currentMdzipSession?.let {
                        EmbeddedDocumentSourceContext.MdzipFile(it, it.entryPoint)
                    } ?: return null
                DocumentFormat.TEXT_PACK -> return null
            }

            for ((index, link) in sourceLinks.withIndex()) {
                source = resolveEmbeddedSourceChild(
                    source,
                    link,
                    useMediaBase = index == 0 &&
                        currentDocumentFormat == DocumentFormat.MARKDOWN
                ) ?: return null
            }
            return source
        }

        private fun resolveEmbeddedSourceChild(
            parent: EmbeddedDocumentSourceContext,
            relativeLink: String,
            useMediaBase: Boolean
        ): EmbeddedDocumentSourceContext? {
            val targetUri = when (parent) {
                is EmbeddedDocumentSourceContext.ExternalFile ->
                    resolveExternalEmbeddedDocumentUri(parent.uri, relativeLink)
                        ?: return null
                is EmbeddedDocumentSourceContext.MdzipFile -> {
                    val archivePath = MdzipManager.resolveRelativeArchivePath(
                        parent.markdownPath,
                        relativeLink
                    ) ?: return null
                    val file = MdzipManager.assetArchiveFile(parent.session, archivePath)
                        ?: return null
                    embeddedFileProviderUri(file) ?: return null
                }
            }

            val mappedMediaUri = if (useMediaBase) {
                embeddedMediaBaseFor(relativeLink)
                    ?.let { resolveEmbeddedContentUri(it.toString()) }
            } else {
                null
            }
            val resolvedUri = mappedMediaUri ?: targetUri
            val fileName = getFileNameFromUri(resolvedUri)
            return if (MdzipManager.isMdzipFileName(fileName)) {
                val session = runCatching { getEmbeddedMdzipSession(resolvedUri) }.getOrNull()
                    ?: return null
                EmbeddedDocumentSourceContext.MdzipFile(session, session.entryPoint)
            } else {
                when (parent) {
                    is EmbeddedDocumentSourceContext.ExternalFile ->
                        EmbeddedDocumentSourceContext.ExternalFile(resolvedUri)
                    is EmbeddedDocumentSourceContext.MdzipFile -> {
                        val archivePath = MdzipManager.resolveRelativeArchivePath(
                            parent.markdownPath,
                            relativeLink
                        ) ?: return null
                        EmbeddedDocumentSourceContext.MdzipFile(parent.session, archivePath)
                    }
                }
            }
        }

        private fun resolveExternalEmbeddedDocumentUri(
            parentUri: Uri,
            relativeLink: String
        ): Uri? {
            resolveEmbeddedContentUri(relativeLink)?.let { return it }
            val location = MarkdownAssetManager.locateDocument(
                this@MainActivity,
                parentUri,
                requireWrite = false
            ) ?: return null
            return MarkdownAssetManager.resolveImageUri(
                this@MainActivity,
                location,
                relativeLink
            )
        }

        private fun resolveEmbeddedDocumentTarget(
            relativeLink: String,
            sourceContextJson: String?
        ): ResolvedEmbeddedDocument? {
            val sourceLinks = parseEmbeddedSourceLinks(sourceContextJson) ?: return null
            if (sourceLinks.isEmpty() || currentDocumentFormat == DocumentFormat.TEXT_PACK) {
                val targetUri = resolveEmbeddedDocumentUri(relativeLink) ?: return null
                val archiveSession = currentMdzipSession
                    ?.takeIf { currentDocumentFormat == DocumentFormat.MDZIP }
                val archivePath = archiveSession?.let {
                    MdzipManager.resolveRelativeArchivePath(it.entryPoint, relativeLink)
                }
                return ResolvedEmbeddedDocument(targetUri, archiveSession, archivePath)
            }

            val parent = resolveEmbeddedSourceContext(sourceLinks) ?: return null
            if (parent is EmbeddedDocumentSourceContext.MdzipFile) {
                val archivePath = MdzipManager.resolveRelativeArchivePath(
                    parent.markdownPath,
                    relativeLink
                ) ?: return null
                val file = MdzipManager.assetArchiveFile(parent.session, archivePath)
                    ?: return null
                val uri = embeddedFileProviderUri(file) ?: return null
                return ResolvedEmbeddedDocument(uri, parent.session, archivePath)
            }

            parent as EmbeddedDocumentSourceContext.ExternalFile
            val uri = resolveExternalEmbeddedDocumentUri(parent.uri, relativeLink) ?: return null
            return ResolvedEmbeddedDocument(uri)
        }

        private fun embeddedFileProviderUri(file: java.io.File): Uri? = runCatching {
            androidx.core.content.FileProvider.getUriForFile(
                this@MainActivity,
                "${packageName}.diagnostics.provider",
                file
            )
        }.getOrNull()

        private fun resolveEmbeddedContentUri(relativeLink: String): Uri? {
            val decodedLink = if (relativeLink.startsWith("content://", ignoreCase = true)) {
                relativeLink
            } else {
                Uri.decode(relativeLink)
            }
            val directUri = runCatching { Uri.parse(decodedLink) }.getOrNull()
            if (directUri?.scheme != "content") return null
            val name = getFileNameFromUri(directUri)
            return directUri.takeIf {
                !isUnsupportedEmbeddedFileName(name) &&
                    hasPersistedReadAccess(directUri)
            }
        }

        private fun resolveEmbeddedDocumentUri(relativeLink: String): Uri? =
            resolveEmbeddedContentUri(relativeLink) ?: resolveAttachmentUri(relativeLink)

        private fun resolveEmbeddedAttachmentUri(
            relativeLink: String,
            sourceContextJson: String?
        ): Uri? {
            val sourceLinks = parseEmbeddedSourceLinks(sourceContextJson) ?: return null
            if (sourceLinks.isEmpty() || currentDocumentFormat == DocumentFormat.TEXT_PACK) {
                return resolveAttachmentUri(relativeLink)
            }

            return when (val parent = resolveEmbeddedSourceContext(sourceLinks) ?: return null) {
                is EmbeddedDocumentSourceContext.MdzipFile -> {
                    val archivePath = MdzipManager.resolveAttachmentArchivePath(
                        parent.markdownPath,
                        relativeLink
                    ) ?: return null
                    val file = MdzipManager.attachmentArchiveFile(parent.session, archivePath)
                        ?: return null
                    embeddedFileProviderUri(file)
                }
                is EmbeddedDocumentSourceContext.ExternalFile ->
                    resolveExternalEmbeddedDocumentUri(parent.uri, relativeLink)
            }
        }

        private fun resolveAttachmentUri(relativeLink: String): Uri? {
            val file = when (currentDocumentFormat) {
                DocumentFormat.MDZIP -> currentMdzipSession?.let {
                    MdzipManager.resolveAttachmentFile(it, relativeLink)
                }
                DocumentFormat.TEXT_PACK -> currentTextPackSession?.let {
                    TextPackManager.resolveAssetFile(it, relativeLink)
                }
                DocumentFormat.MARKDOWN -> null
            }
            if (file != null) {
                return runCatching {
                    androidx.core.content.FileProvider.getUriForFile(
                        this@MainActivity,
                        "${packageName}.diagnostics.provider",
                        file
                    )
                }.getOrNull()
            }
            if (currentDocumentFormat != DocumentFormat.MARKDOWN) return null
            val documentUri = currentFileUri ?: return null
            val location = MarkdownAssetManager.locateDocument(
                this@MainActivity,
                documentUri,
                requireWrite = false
            ) ?: return null
            return MarkdownAssetManager.resolveImageUri(
                this@MainActivity,
                location,
                relativeLink
            )
        }

        @JavascriptInterface
        fun editMdzipAudio(relativeLink: String): Boolean {
            val session = currentMdzipSession ?: return false
            if (MdzipManager.resolveAudioFile(session, relativeLink) == null) return false
            val sessionId = currentDocumentSessionId
            runOnUiThread {
                if (currentDocumentSessionId != sessionId || currentMdzipSession !== session) {
                    ThemedToast.show(
                        this@MainActivity,
                        "The active document changed. The audio file was not edited.",
                        Toast.LENGTH_LONG
                    )
                    return@runOnUiThread
                }
                pendingReplaceMdzipAudioLink = relativeLink
                pendingInsertAudioDocumentSessionId = sessionId
                pickAudioLauncher.launch("audio/*")
            }
            return true
        }

        @JavascriptInterface
        fun removeMdzipAudio(relativeLink: String): Boolean {
            val session = currentMdzipSession ?: return false
            return runCatching { MdzipManager.removeAudio(session, relativeLink) }
                .getOrDefault(false)
        }

        @JavascriptInterface
        fun syncMdzipAudioReferences(
            previousLinksJson: String?,
            currentLinksJson: String?,
            documentSessionId: String?
        ) {
            if (documentSessionId != currentDocumentSessionId) return
            val session = currentMdzipSession ?: return
            val previousLinks = runCatching {
                val values = org.json.JSONArray(previousLinksJson ?: "[]")
                (0 until values.length()).mapNotNull { index ->
                    values.optString(index).takeIf { it.isNotBlank() }
                }
            }.getOrNull() ?: return
            val currentLinks = runCatching {
                val values = org.json.JSONArray(currentLinksJson ?: "[]")
                (0 until values.length()).mapNotNull { index ->
                    values.optString(index).takeIf { it.isNotBlank() }
                }
            }.getOrNull() ?: return
            runCatching {
                MdzipManager.syncAudioReferences(session, previousLinks, currentLinks)
            }.onFailure { error ->
                if (BuildConfig.DEBUG) {
                    AppDiagnostics.record(
                        this@MainActivity,
                        "mdzip_audio_reference_sync_failed",
                        error.javaClass.simpleName
                    )
                }
            }
        }

        @JavascriptInterface
        fun syncMdzipVideoReferences(
            previousLinksJson: String?,
            currentLinksJson: String?,
            documentSessionId: String?
        ) {
            if (documentSessionId != currentDocumentSessionId) return
            val session = currentMdzipSession ?: return
            val previousLinks = runCatching {
                val values = org.json.JSONArray(previousLinksJson ?: "[]")
                (0 until values.length()).mapNotNull { index ->
                    values.optString(index).takeIf { it.isNotBlank() }
                }
            }.getOrNull() ?: return
            val currentLinks = runCatching {
                val values = org.json.JSONArray(currentLinksJson ?: "[]")
                (0 until values.length()).mapNotNull { index ->
                    values.optString(index).takeIf { it.isNotBlank() }
                }
            }.getOrNull() ?: return
            runCatching {
                MdzipManager.syncVideoReferences(session, previousLinks, currentLinks)
            }.onFailure { error ->
                if (BuildConfig.DEBUG) {
                    AppDiagnostics.record(
                        this@MainActivity,
                        "mdzip_video_reference_sync_failed",
                        error.javaClass.simpleName
                    )
                }
            }
        }

        @JavascriptInterface
        fun setMediaPlaybackSpeed(speedText: String): Boolean {
            val speed = speedText.toFloatOrNull() ?: return false
            val allowedSpeeds = setOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)
            if (speed !in allowedSpeeds) return false
            val storedSpeed = if (speed == 1f) "1.0" else speed.toString()
            runOnUiThread {
                PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
                    .edit()
                    .putString("pref_media_playback_speed", storedSpeed)
                    .apply()
            }
            return true
        }

        @JavascriptInterface
        fun writeClipboard(text: String?): Boolean {
            if (text == null) return false
            return try {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE)
                    as? android.content.ClipboardManager ?: return false
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("W.mdx", text))
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun readClipboard(): String {
            return try {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE)
                    as? android.content.ClipboardManager ?: return ""
                val clip = clipboard.primaryClip ?: return ""
                if (clip.itemCount == 0) return ""
                clip.getItemAt(0).coerceToText(this@MainActivity)?.toString() ?: ""
            } catch (_: Exception) {
                ""
            }
        }

        @JavascriptInterface
        fun hideKeyboard() {
            runOnUiThread {
                val inputMethodManager =
                    this@MainActivity.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                inputMethodManager.hideSoftInputFromWindow(webView.windowToken, 0)
            }
        }

        @JavascriptInterface
        fun showEditorKeyboard() {
            this@MainActivity.requestEditorKeyboard(refocusWebView = true)
        }

        @JavascriptInterface
        fun showEditorKeyboardForFocusedInput() {
            this@MainActivity.requestEditorKeyboard(refocusWebView = false)
        }
        @JavascriptInterface
        fun renameCurrentDocument(newName: String) {
            runOnUiThread {
                this@MainActivity.renameCurrentDocument(newName)
            }
        }

        @JavascriptInterface
        fun onSelectionChanged(selectionJson: String) {
            if (selectionJson.length > 2048) return
            val selection = try {
                org.json.JSONObject(selectionJson)
            } catch (_: Exception) {
                return
            }

            val left = selection.optDouble("left", Double.NaN)
            val top = selection.optDouble("top", Double.NaN)
            val bottom = selection.optDouble("bottom", Double.NaN)
            val pixelRatio = selection.optDouble(
                "devicePixelRatio",
                resources.displayMetrics.density.toDouble()
            )
            val viewportScale = selection.optDouble("visualViewportScale", 1.0)
            val viewportOffsetLeft = selection.optDouble("visualViewportOffsetLeft", 0.0)
            val viewportOffsetTop = selection.optDouble("visualViewportOffsetTop", 0.0)
            if (
                !left.isFinite() || !top.isFinite() || !bottom.isFinite() ||
                !pixelRatio.isFinite() || !viewportScale.isFinite() ||
                !viewportOffsetLeft.isFinite() || !viewportOffsetTop.isFinite() ||
                pixelRatio <= 0.0 || viewportScale <= 0.0 || bottom < top
            ) {
                return
            }

            webView.post {
                if (
                    !webView.isAttachedToWindow ||
                    !webView.isFocused ||
                    !window.decorView.hasWindowFocus() ||
                    !editorImeVisible()
                ) {
                    return@post
                }

                val scale = (pixelRatio * viewportScale).toFloat()
                val locationOnScreen = IntArray(2)
                webView.getLocationOnScreen(locationOnScreen)
                val matrix = Matrix().apply {
                    setScale(scale, scale)
                    postTranslate(
                        locationOnScreen[0] - viewportOffsetLeft.toFloat() * scale,
                        locationOnScreen[1] - viewportOffsetTop.toFloat() * scale
                    )
                }
                val baseline = (top + (bottom - top) * 0.8).toFloat()
                val cursorAnchor = CursorAnchorInfo.Builder()
                    .setMatrix(matrix)
                    .setInsertionMarkerLocation(
                        left.toFloat(),
                        top.toFloat(),
                        baseline,
                        bottom.toFloat(),
                        CursorAnchorInfo.FLAG_HAS_VISIBLE_REGION
                    )
                    .build()
                (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
                    ?.updateCursorAnchorInfo(webView, cursorAnchor)
            }
        }

        @JavascriptInterface
        fun onInDocumentNavigationOccurred() {
            runOnUiThread {
                val hadForwardHistory = synchronized(documentHistoryLock) {
                    if (documentForwardStack.isEmpty()) {
                        false
                    } else {
                        documentForwardStack.clear()
                        true
                    }
                }
                if (hadForwardHistory) updateTitle()
            }
        }

        @JavascriptInterface
        fun restoreNativeCursorAndScrollState(documentSessionId: String?) {
            runOnUiThread {
                if (documentSessionId != currentDocumentSessionId) return@runOnUiThread
                restoreCursorAndScrollState()
            }
        }

        @JavascriptInterface
        fun onScrollChanged(scrollTop: Int, documentSessionId: String?) {
            if (documentSessionId != currentDocumentSessionId) return
            val fileName = currentFileName
            if (fileName.isEmpty() || fileName == getString(R.string.untitled_document)) return
            val key = "cursor_scroll_${currentDocumentHistoryKey()}"
            val prefs = PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
            prefs.edit().putInt(key, scrollTop).apply()
        }
    }

    object JSONObjectWrapper {
        fun quote(string: String?): String {
            return org.json.JSONObject.quote(string ?: "")
        }

        fun unquote(quoted: String): String {
            if (quoted.isEmpty() || quoted == "null") return ""
            return try {
                org.json.JSONTokener(quoted).nextValue().toString()
            } catch (e: Exception) {
                quoted
            }
        }
    }
}
