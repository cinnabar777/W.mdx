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
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.util.concurrent.Executors
import java.util.concurrent.Future

private const val WMDX_TAB_SESSION_MIME = "application/vnd.wmdx.tabs-session+json"
private const val MAX_WMDX_TAB_SESSION_BYTES = 512 * 1024

class MainActivity : AppCompatActivity(), SharedPreferences.OnSharedPreferenceChangeListener {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var suppressImeUntilUserTouch = false
    private var imeHideGeneration = 0

    private data class CachedFontData(val modifiedAt: Long, val length: Long, val dataUri: String)
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
    private var pendingExistingDocumentFocusUri: Uri? = null
    private var isActivityResumed = false
    private var pendingSharedText: String? = null
    private var currentToast: Toast? = null
    private val leftPanelSearchExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var leftPanelSearchFuture: Future<*>? = null
    private var currentTextPackSession: TextPackSession? = null
    @Volatile private var currentMdzipSession: MdzipSession? = null
    private var pendingRenameFallbackName: String? = null
    private var pendingCreateDocumentAsTextPack: Boolean? = null
    private var pendingCreateDocumentAsMdzip: Boolean? = null
    private var pendingCreateDocumentSessionId: String? = null
    private var pendingInsertAudioDocumentSessionId: String? = null
    private var pendingReplaceMdzipAudioLink: String? = null
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
            if (uri == null || sessionJson == null) return@registerForActivityResult
            runCatching {
                val output = contentResolver.openOutputStream(uri, "w")
                    ?: throw java.io.IOException("Could not create the selected session file.")
                output.use { it.write(sessionJson.toByteArray(Charsets.UTF_8)) }
                persistDocumentUriPermission(uri)
            }.onSuccess {
                ThemedToast.show(this, "Tab session saved.", Toast.LENGTH_SHORT)
            }.onFailure {
                ThemedToast.show(
                    this,
                    it.localizedMessage ?: "Could not save the tab session.",
                    Toast.LENGTH_LONG
                )
            }
        }

    private val exportDocumentLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        uri?.let { saveExportToUri(it) }
    }

    private val pickImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { insertImageFromUri(it) }
    }

    private val pickAudioLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val expectedSessionId = pendingInsertAudioDocumentSessionId
        pendingInsertAudioDocumentSessionId = null
        val replacementLink = pendingReplaceMdzipAudioLink
        pendingReplaceMdzipAudioLink = null
        if (uri != null && expectedSessionId == currentDocumentSessionId) {
            if (replacementLink != null) replaceAudioFromUri(uri, replacementLink)
            else insertAudioFromUri(uri)
        } else if (uri != null) {
            ThemedToast.show(this, "The active document changed. The audio change was not applied.", Toast.LENGTH_LONG)
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
        if (!startupPreferences.getBoolean("pref_toolbar_default_corrected", false)) {
            startupPreferences.edit()
                .putBoolean("pref_toolbar_floating_enabled", false)
                .putBoolean("pref_toolbar_default_corrected", true)
                .apply()
        }
        setContentView(R.layout.activity_main)

        applySystemBarDimming()

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
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
        if (isFinishing && !isChangingConfigurations) {
            WindowRegistry.unregister(this)
        }
        super.onDestroy()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        // All new opens go through DocumentDispatchActivity. A task brought to
        // the foreground must not replay its old URI or shared text.
        AppDiagnostics.record(this, "window_refocused")
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val handled = super.dispatchKeyEvent(event)
        if (isEditorReady) {
            AppDiagnostics.recordNativeKeyEvent(this, event, handled)
        }
        return handled
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

        if (intent.getBooleanExtra("is_new_document", false)) {
            currentFileUri = null
            currentFileName = getString(R.string.untitled_document)
            isDirty = false
            updateTitle()
            if (isEditorReady) {
                webView.evaluateJavascript("window.editorBridge.setMarkdown('');", null)
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

    private fun editorImeVisible(): Boolean =
        ViewCompat.getRootWindowInsets(webView)
            ?.isVisible(WindowInsetsCompat.Type.ime()) == true

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
        val floatingConfig = prefs.getString("pref_toolbar_floating_config", bottomConfig)
        val escapedConfig = bottomConfig?.let { JSONObjectWrapper.quote(it) } ?: "null"
        val escapedFloatingConfig = floatingConfig?.let { JSONObjectWrapper.quote(it) } ?: "null"
        webView.evaluateJavascript(
            "window.editorBridge?.applyBottomToolbarConfig?.($escapedConfig);" +
                "window.editorBridge?.applyFloatingToolbarConfig?.($escapedFloatingConfig || $escapedConfig);",
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
            "save_as_textpack" to prefs.getString("pref_hotkey_save_as_textpack", "ctrl+shift+alt+s"),
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
            "callout" to prefs.getString("pref_hotkey_callout", "ctrl+alt+q"),
            "link" to prefs.getString("pref_hotkey_link", "ctrl+k"),
            "footnote" to prefs.getString("pref_hotkey_footnote", "ctrl+shift+f"),
            "blockQuote" to prefs.getString("pref_hotkey_blockQuote", "ctrl+shift+q"),
            "codeBlock" to prefs.getString("pref_hotkey_codeBlock", "ctrl+shift+c"),
            "bulletedList" to prefs.getString("pref_hotkey_bulletedList", "ctrl+shift+8"),
            "numberedList" to prefs.getString("pref_hotkey_numberedList", "ctrl+shift+7"),
            "todoList" to prefs.getString("pref_hotkey_todoList", "ctrl+shift+l"),
            "indent" to prefs.getString("pref_hotkey_indent", "tab"),
            "outdent" to prefs.getString("pref_hotkey_outdent", "shift+tab"),
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
            showUnsavedChangesDialog { createNewDocument() }
        } else {
            createNewDocument()
        }
    }

    private fun createNewDocument() {
        synchronized(documentHistoryLock) {
            currentFileUri?.let { documentHistoryStack.push(it) }
            documentForwardStack.clear()
        }
        currentDocumentSessionId = java.util.UUID.randomUUID().toString()
        currentRevision = 0
        currentEmptyContentExplicitlyEdited = false
        currentTextPackSession = null
        currentMdzipSession = null
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
                val inputStream = contentResolver.openInputStream(uri)
                    ?: throw java.io.FileNotFoundException("Could not read the selected file")
                inputStream.use {
                    val reader = BufferedReader(InputStreamReader(inputStream))
                    val content = reader.readText()
                    hasBom = content.startsWith("\uFEFF")
                    hasCrlf = content.contains("\r\n")
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
            if (sourceTabs.length() !in 1..200) return null

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
                if (uriString != null) {
                    if (uriString.length > 8192) {
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
            if (tabs.length() == 0) return null

            val groupsJson = JSONArray()
            groups.forEach { (id, group) ->
                if (id in usedGroups) groupsJson.put(group)
            }
            val activeTabId = source.optString("activeTabId")
                .takeIf { it in ids }
                ?: tabs.getJSONObject(0).getString("id")
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

    private fun isWmdxTabSession(uri: Uri): Boolean {
        val name = runCatching { getFileNameFromUri(uri) }.getOrNull().orEmpty()
        val mimeType = runCatching { contentResolver.getType(uri) }.getOrNull()
        return name.endsWith(".wmds", ignoreCase = true) ||
            name.endsWith(".mds", ignoreCase = true) ||
            name.endsWith(".wmdxsession", ignoreCase = true) ||
            mimeType == WMDX_TAB_SESSION_MIME
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
        webView.evaluateJavascript(
            "window.leftPanelController?.restorePortableSession?.($sessionJson);",
            null
        )
    }

    private fun handleSaveFile() {
        if (currentFileUri != null) {
            currentFileUri?.let { saveFileToUri(it) }
        } else {
            handleSaveAsFile()
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
                saveFileToUri(
                    uri,
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

            if (hasCrlf && !markdownText.contains("\r\n") && markdownText.contains("\n")) {
                markdownText = markdownText.replace("\r\n", "\n").replace("\n", "\r\n")
            }
            if (hasBom && !markdownText.startsWith("\uFEFF")) {
                markdownText = "\uFEFF$markdownText"
            }

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
                    val session = currentTextPackSession ?: TextPackManager.openTextPack(this, uri)
                    currentTextPackSession = session
                    currentMdzipSession = null
                    TextPackManager.saveTextPack(this, session, markdownText, uri)
                } else {
                    val output = contentResolver.openOutputStream(uri, "rwt")
                        ?: throw java.io.IOException("Could not open document for writing")
                    output.use { outputStream ->
                        val writer = OutputStreamWriter(outputStream, Charsets.UTF_8)
                        writer.write(markdownText)
                        writer.flush()
                    }
                    currentTextPackSession = null
                    currentMdzipSession = null
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


    private fun interceptMdzipAssetRequest(request: WebResourceRequest): WebResourceResponse {
        val segments = request.url.pathSegments
        val session = currentMdzipSession
        if (
            session == null ||
            segments.size < 3 ||
            segments[0] != "mdzip-assets" ||
            segments[1] != session.sessionDir.name
        ) {
            return mdzipAssetError(404, "Not Found")
        }

        val archivePath = segments.drop(2).joinToString("/")
        val file = MdzipManager.audioArchiveFile(session, archivePath)
        if (file == null) {
            if (archivePath.startsWith("audio/", ignoreCase = true) &&
                MdzipManager.isSupportedAudioFileName(archivePath)
            ) {
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
        val extension = file.extension.lowercase()
        val mimeType = mdzipAudioMimeType(extension)
        val fileLength = file.length()
        val range = request.requestHeaders.entries
            .firstOrNull { it.key.equals("Range", ignoreCase = true) }
            ?.value
        val headers = mutableMapOf(
            "Accept-Ranges" to "bytes",
            "Cache-Control" to "no-store"
        )
        if (extension == "m4a") headers.remove("Accept-Ranges")

        if (shouldServeMdzipAudioAsWholeFile(extension, range)) {
            recordMdzipAudioAsset(
                extension,
                200,
                mimeType,
                rangeHeader = range,
                contentRange = null,
                contentLength = fileLength
            )
            headers["Content-Length"] = fileLength.toString()
            val body = if (request.method.equals("HEAD", ignoreCase = true)) {
                ByteArrayInputStream(ByteArray(0))
            } else {
                openMdzipByteRangeStream(file, 0, fileLength)
            }
            return WebResourceResponse(mimeType, null, 200, "OK", headers, body)
        }

        val rangeHeader = range ?: return mdzipRangeError(fileLength, mimeType, range)
        val byteRange = parseMdzipByteRange(rangeHeader, fileLength)
            ?: return mdzipRangeError(fileLength, mimeType, rangeHeader)
        headers["Content-Length"] = byteRange.length.toString()
        val contentRange = "bytes ${byteRange.start}-${byteRange.endInclusive}/$fileLength"
        headers["Content-Range"] = contentRange
        recordMdzipAudioAsset(
            extension,
            206,
            mimeType,
            rangeHeader = rangeHeader,
            contentRange = contentRange,
            contentLength = byteRange.length
        )
        val body = if (request.method.equals("HEAD", ignoreCase = true)) {
            ByteArrayInputStream(ByteArray(0))
        } else {
            openMdzipByteRangeStream(file, byteRange.start, byteRange.length)
        }
        return WebResourceResponse(mimeType, null, 206, "Partial Content", headers, body)
    }

    private fun mdzipAudioMimeType(extension: String): String =
        if (extension.equals("m4a", ignoreCase = true)) "audio/mp4" else "audio/mpeg"

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
        rangeHeader: String?
    ): WebResourceResponse {
        val extension = if (mimeType == "audio/mp4") "m4a" else "mp3"
        recordMdzipAudioAsset(
            extension,
            416,
            mimeType,
            rangeHeader = rangeHeader,
            contentRange = "bytes */$fileLength",
            contentLength = 0
        )
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
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val imageMode = prefs.getString("pref_image_mode", "picker")
        if (imageMode == "url") {
            showImageUrlDialog()
        } else {
            pickImageLauncher.launch("image/*")
        }
    }

    private fun handleInsertAudio() {
        if (currentMdzipSession == null) {
            ThemedToast.show(
                this,
                "Open or save a document as MDZip (.mdz) before inserting audio.",
                Toast.LENGTH_LONG
            )
            return
        }
        pendingReplaceMdzipAudioLink = null
        pendingInsertAudioDocumentSessionId = currentDocumentSessionId
        pickAudioLauncher.launch("audio/*")
    }

    private fun insertAudioFromUri(uri: Uri) {
        val session = currentMdzipSession
        if (session == null) {
            ThemedToast.show(this, "The active document is no longer an MDZip package.", Toast.LENGTH_LONG)
            return
        }
        try {
            val originalName = getFileNameFromUri(uri)
            if (!MdzipManager.isSupportedAudioFileName(originalName)) {
                throw java.io.IOException("Choose an MP3 or M4A file.")
            }
            val input = contentResolver.openInputStream(uri)
                ?: throw java.io.IOException("Could not read the selected audio file.")
            val relativeLink = MdzipManager.addAudio(session, input, originalName)
            val escapedLink = JSONObjectWrapper.quote(relativeLink)
            val escapedName = JSONObjectWrapper.quote(originalName)
            webView.evaluateJavascript(
                "window.editorBridge?.insertAudioLink?.($escapedLink, $escapedName);",
                null
            )
        } catch (error: Exception) {
            ThemedToast.show(
                this,
                "Could not add the audio file: ${error.localizedMessage ?: "unknown error"}",
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
                throw java.io.IOException("Choose an MP3 or M4A file.")
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
        val input = EditText(this)
        input.hint = "https://example.com/image.png"
        AlertDialog.Builder(this)
            .setTitle("Insert Image URL")
            .setView(input)
            .setPositiveButton("Insert") { _, _ ->
                val url = input.text.toString().trim()
                if (url.isNotEmpty()) {
                    val escapedUrl = JSONObjectWrapper.quote(url)
                    webView.evaluateJavascript("window.editorBridge.insertImage($escapedUrl);", null)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun insertImageFromUri(uri: Uri) {
        try {
            contentResolver.openInputStream(uri)?.use { inputStream ->
                val session = currentTextPackSession
                if (session != null) {
                    val originalName = getFileNameFromUri(uri)
                    val assetPath = TextPackManager.addAssetImage(session, inputStream, originalName)
                    val markdownImageTag = "![Image]($assetPath)"
                    val escapedTag = JSONObjectWrapper.quote(markdownImageTag)
                    webView.evaluateJavascript("window.editorBridge.insertImage($escapedTag);", null)
                } else {
                    val bytes = inputStream.readBytes()
                    val mimeType = contentResolver.getType(uri) ?: "image/png"
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    val dataUri = "data:$mimeType;base64,$base64"
                    val escapedUri = JSONObjectWrapper.quote(dataUri)
                    webView.evaluateJavascript("window.editorBridge.insertImage($escapedUri);", null)
                }
            }
        } catch (e: Exception) {
            ThemedToast.show(this, "Failed to insert image: ${e.localizedMessage}", Toast.LENGTH_LONG)
        }
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
            return org.json.JSONObject().put("ok", false).put("error", "This file is outside the folders approved for the panel.")
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
        val textExtensions = setOf(".md", ".markdown", ".mdx", ".txt")
        val wholeWordPattern = if (wholeWords) {
            Regex(
                "(^|[^\\p{L}\\p{N}_])${Regex.escape(needle)}(?![\\p{L}\\p{N}_])",
                RegexOption.IGNORE_CASE
            )
        } else {
            null
        }
        val markdownExtensions = setOf(".md", ".textpack", ".mdx", ".textpack.zip", ".mdz")

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
                        (
                            entry.name.endsWith(".mdx", true) ||
                                (!markdownOnly && !hasPlainTextExtension && !hasTextPackExtension)
                            )
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
                saveWmdxTabSessionLauncher.launch("Wmdx Session.wmds")
            }
            return true
        }

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
            historyStateJson: String
        ): Boolean {
            val uri = uriString.takeIf { it.isNotBlank() }?.let {
                runCatching { Uri.parse(it) }.getOrNull()
            }
            if (uri != null && !hasLeftPanelDocumentAccess(uri)) return false
            restoreDocumentHistoryState(historyStateJson)
            currentFileUri = uri
            currentFileName = name.ifBlank { "Untitled.md" }
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
                    openFile(uri, permissionFlags = permissionFlags)
                }
                pendingSharedText?.let { text ->
                    pendingSharedText = null
                    currentFileUri = null
                    currentFileName = getString(R.string.untitled_document)
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
                    "open" -> handleOpenFile()
                    "save" -> handleSaveFile()
                    "save_as" -> handleSaveAsFile()
                    "save_as_textpack" -> handleSaveAsTextPackFile()
                    "save_as_mdzip" -> handleSaveAsMdzipFile()
                    "export" -> handleExportDocument()
                    "image" -> handleInsertImage()
                    "audio" -> handleInsertAudio()
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
            val session = currentMdzipSession ?: return ""
            return runCatching { MdzipManager.audioUrl(session, relativeLink) }
                .getOrNull()
                .orEmpty()
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
            runOnUiThread {
                val visibleBefore = editorImeVisible()
                AppDiagnostics.record(
                    this@MainActivity,
                    "ime_show_requested",
                    "suppressed=${suppressImeUntilUserTouch} generation=${imeHideGeneration} viewFocused=${webView.isFocused} windowFocused=${window.decorView.hasWindowFocus()} imeVisible=${visibleBefore}"
                )
                suppressImeUntilUserTouch = false
                val generation = ++imeHideGeneration
                window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                        WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED
                )
                val touchFocusRequested = webView.requestFocusFromTouch()
                val focusRequested = touchFocusRequested || webView.requestFocus()
                val insetsController = ViewCompat.getWindowInsetsController(webView)
                insetsController?.show(WindowInsetsCompat.Type.ime())
                val showAccepted =
                    (getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
                        ?.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
                AppDiagnostics.record(
                    this@MainActivity,
                    "ime_show_dispatched",
                    "generation=${generation} touchFocus=${touchFocusRequested} focusRequested=${focusRequested} viewFocused=${webView.isFocused} immAccepted=${showAccepted} touchFocusable=${webView.isFocusableInTouchMode}"
                )
                webView.postDelayed({
                    AppDiagnostics.record(
                        this@MainActivity,
                        "ime_show_observed",
                        "generation=${generation} viewFocused=${webView.isFocused} windowFocused=${window.decorView.hasWindowFocus()} imeVisible=${editorImeVisible()}"
                    )
                }, 350L)
            }
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
