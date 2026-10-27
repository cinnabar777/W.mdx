package com.wmdx.markdownapp

import android.content.Context
import android.graphics.Color
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
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter

class MainActivity : AppCompatActivity(), SharedPreferences.OnSharedPreferenceChangeListener {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var suppressImeUntilUserTouch = false
    private var imeHideGeneration = 0

    private data class CachedFontData(val modifiedAt: Long, val length: Long, val dataUri: String)
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
    private var currentDocumentSessionId: String = java.util.UUID.randomUUID().toString()
    @Volatile private var isDirty: Boolean = false
    private var isEditorReady: Boolean = false
    private var currentEditorMode: String = "rich_text"
    @Volatile private var currentRevision: Long = 0
    private var hasBom: Boolean = false
    private var hasCrlf: Boolean = false
    @Volatile private var latestMarkdownContent: String? = null
    private var pendingOpenUri: Uri? = null
    private var pendingOpenPermissionFlags: Int? = null
    private var pendingSharedText: String? = null
    private var currentToast: Toast? = null
    private var currentTextPackSession: TextPackSession? = null
    private var pendingRenameFallbackName: String? = null
    private var pendingCreateDocumentAsTextPack: Boolean? = null
    private data class RenameAccessRequest(val uri: Uri, val targetName: String)
    private var pendingRenamePermissionRequest: RenameAccessRequest? = null
    private val documentHistoryStack = java.util.ArrayDeque<Uri>()
    private val documentForwardStack = java.util.ArrayDeque<Uri>()

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

    private val renameFolderLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            handleRenameFolderSelection(result.resultCode, result.data)
        }

    private val createDocumentLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        if (uri != null) {
            pendingRenameFallbackName = null
            val saveAsTextPack = pendingCreateDocumentAsTextPack
            pendingCreateDocumentAsTextPack = null
            saveFileToUri(uri, saveAsTextPack)
        } else if (pendingRenameFallbackName != null) {
            pendingCreateDocumentAsTextPack = null
            pendingRenameFallbackName = null
            updateTitle()
        } else {
            pendingCreateDocumentAsTextPack = null
        }
    }

    private val exportDocumentLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        uri?.let { saveExportToUri(it) }
    }

    private val pickImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { insertImageFromUri(it) }
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
        outState.putStringArrayList("document_history",
            ArrayList(documentHistoryStack.map { it.toString() }))
        outState.putStringArrayList("document_forward_history",
            ArrayList(documentForwardStack.map { it.toString() }))
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
        AppDiagnostics.record(this, "window_resumed")
        PreferenceManager.getDefaultSharedPreferences(this).registerOnSharedPreferenceChangeListener(this)
        if (::webView.isInitialized) {
            webView.onResume()
            applyThemeAndFullscreenPreferences()
            refreshBottomToolbarFromPreferences()
            suppressImeUntilUserTouch = true
            val generation = ++imeHideGeneration
            window.setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                    WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
            )
            webView.post { hideImeWhileResumeIsSuppressed(generation) }
            webView.postDelayed({ hideImeWhileResumeIsSuppressed(generation) }, 180)
            webView.postDelayed({ hideImeWhileResumeIsSuppressed(generation) }, 500)
            AppDiagnostics.record(
                this,
                "ime_resume_suppression_started",
                "generation=${generation} viewFocused=${webView.isFocused} windowFocused=${window.decorView.hasWindowFocus()} imeVisible=${editorImeVisible()}"
            )
        }
    }

    override fun onPause() {
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
    private fun performAutoSaveOnLeave() {
        if (!isDirty || currentFileUri == null) return
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val autoSaveEnabled = prefs.getBoolean("pref_auto_save_on_leave", true)
        if (autoSaveEnabled) {
            currentFileUri?.let { uri ->
                val cachedMarkdownContent = latestMarkdownContent
                if (cachedMarkdownContent != null) {
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
                return request?.url?.let { assetLoader.shouldInterceptRequest(it) }
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
        val canGoBack = documentHistoryStack.isNotEmpty()
        val canGoForward = documentForwardStack.isNotEmpty()
        webView.evaluateJavascript(
            "if (window.editorBridge) { window.editorBridge.setDocumentTitle($escapedTitle, $escapedDocumentKey); window.editorBridge.setDocumentHistoryState($canGoBack, $canGoForward); }",
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
        replaceIn(documentHistoryStack)
        replaceIn(documentForwardStack)
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
            "calloutHeader" to "pref_callout_header_font_family"
        )
        familyPreferenceKeys.forEach { (category, preferenceKey) ->
            var family = prefs.getString(preferenceKey, "default") ?: "default"
            val inherited = when (category) {
                "blockquote" -> prefs.getBoolean("pref_blockquote_inherit_body_typography", true)
                "callout" -> prefs.getBoolean("pref_callout_inherit_body_typography", true)
                "list" -> prefs.getBoolean("pref_list_inherit_body_typography", true)
                "table" -> prefs.getBoolean("pref_table_inherit_body_typography", true)
                else -> false
            }
            if (inherited) family = "default"
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
            "table" to Pair("pref_font_file_table", !prefs.getBoolean("pref_table_inherit_body_typography", true))
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
            "heading_p" to prefs.getString("pref_hotkey_heading_p", "ctrl+alt+0"),
            "heading_1" to prefs.getString("pref_hotkey_heading_1", "ctrl+alt+1"),
            "heading_2" to prefs.getString("pref_hotkey_heading_2", "ctrl+alt+2"),
            "heading_3" to prefs.getString("pref_hotkey_heading_3", "ctrl+alt+3"),
            "heading_4" to prefs.getString("pref_hotkey_heading_4", "ctrl+alt+4"),
            "heading_5" to prefs.getString("pref_hotkey_heading_5", "ctrl+alt+5"),
            "heading_6" to prefs.getString("pref_hotkey_heading_6", "ctrl+alt+6"),
            "highlight_yellow" to prefs.getString("pref_hotkey_highlight_yellow", "ctrl+alt+y"),
            "highlight_green" to prefs.getString("pref_hotkey_highlight_green", "ctrl+alt+g"),
            "highlight_pink" to prefs.getString("pref_hotkey_highlight_pink", "ctrl+alt+p"),
            "highlight_blue" to prefs.getString("pref_hotkey_highlight_blue", "ctrl+alt+b"),
            "highlight_red" to prefs.getString("pref_hotkey_highlight_red", "ctrl+alt+r"),
            "highlight_red_pen" to prefs.getString("pref_hotkey_highlight_red_pen", "ctrl+alt+r"),
            "highlight_green_pen" to prefs.getString("pref_hotkey_highlight_green_pen", "ctrl+alt+shift+g"),
            "highlight_remove" to prefs.getString("pref_hotkey_highlight_remove", "ctrl+alt+x")
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
            R.id.action_export -> {
                handleExportDocument()
                true
            }
            R.id.action_insert_image -> {
                handleInsertImage()
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
        currentFileUri?.let { documentHistoryStack.push(it) }
        documentForwardStack.clear()
        currentDocumentSessionId = java.util.UUID.randomUUID().toString()
        currentTextPackSession = null
        latestMarkdownContent = ""
        currentFileUri = null
        currentFileName = getString(R.string.untitled_document)
        isDirty = false
        updateTitle()
        webView.evaluateJavascript("window.editorBridge.setMarkdown('');", null)
    }

    private fun navigateBackOrFinish() {
        if (documentHistoryStack.isNotEmpty()) {
            val previousUri = documentHistoryStack.pop()
            currentFileUri?.let { documentForwardStack.push(it) }
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
                direction == "back" && documentHistoryStack.isNotEmpty() -> {
                    if (isDirty) {
                        showUnsavedChangesDialog { navigateBackOrFinish() }
                    } else {
                        navigateBackOrFinish()
                    }
                }
                direction == "forward" && documentForwardStack.isNotEmpty() -> {
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
        if (documentForwardStack.isEmpty()) return
        val nextUri = documentForwardStack.pop()
        currentFileUri?.let { documentHistoryStack.push(it) }
        openFile(nextUri, rememberHistory = false)
        updateTitle()
    }

    private fun openFileFromHistory(uri: Uri) {
        openFile(uri, rememberHistory = false)
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
        if (!forceReload && currentFileUri == uri && !isDirty) return
        if (!skipExistingWindowFocus && WindowRegistry.focus(this, uri, excludeTask = taskId)) return
        if (rememberHistory && currentFileUri != null && currentFileUri != uri) {
            documentHistoryStack.push(currentFileUri)
            documentForwardStack.clear()
        }

        AppDiagnostics.record(this, "native_read_start")
        val readStarted = android.os.SystemClock.elapsedRealtime()

        try {
            val fileName = getFileNameFromUri(uri)

            if (TextPackManager.isTextPackFile(this, uri, fileName)) {
                val session = TextPackManager.openTextPack(this, uri)
                val text = session.markdownContent
                hasBom = text.startsWith("\uFEFF")
                hasCrlf = text.contains("\r\n")
                val lines = text.lineSequence().count()
                val readMs = android.os.SystemClock.elapsedRealtime() - readStarted
                AppDiagnostics.record(this, "textpack_read_done", "chars=${text.length} lines=$lines ms=$readMs")

                currentTextPackSession = session
                latestMarkdownContent = text
                currentFileUri = uri
                currentFileName = fileName
                isDirty = false
                updateTitle()

                prefs.edit().putString("last_opened_uri", uri.toString()).apply()

                val escaped = JSONObjectWrapper.quote(text)
                webView.evaluateJavascript("window.editorBridge.setMarkdown($escaped);") {
                    restoreCursorAndScrollState()
                    webView.post {
                        webView.requestFocus()
                        webView.requestLayout()
                        webView.invalidate()
                        webView.postInvalidate()
                    }
                }
            } else {
                currentTextPackSession = null
                contentResolver.openInputStream(uri)?.use { inputStream ->
                    val reader = BufferedReader(InputStreamReader(inputStream))
                    val content = reader.readText()
                    hasBom = content.startsWith("\uFEFF")
                    hasCrlf = content.contains("\r\n")
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
                        restoreCursorAndScrollState()
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
            WindowRegistry.register(this, currentFileUri)
            AppDiagnostics.record(this, "file_load_error", "category=${e.javaClass.simpleName}")
            ThemedToast.show(this, "Failed to open file: ${e.localizedMessage}", Toast.LENGTH_LONG)
        }
    }

    private fun restoreCursorAndScrollState() {
        val fileName = currentFileName
        if (fileName.isEmpty() || fileName == getString(R.string.untitled_document)) return
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val key = "doc_$fileName"
        val savedScroll = prefs.getInt("cursor_scroll_$key", 0)
        webView.evaluateJavascript("window.editorBridge.setScrollPosition($savedScroll);", null)
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

    private fun launchCreateDocument(fileName: String, asTextPack: Boolean?) {
        pendingCreateDocumentAsTextPack = asTextPack
        createDocumentLauncher.launch(fileName)
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
        return when {
            lowerName.endsWith(".textpack.zip") || lowerName.endsWith(".textpack") -> name
            lowerName.endsWith(".markdown") || lowerName.endsWith(".md") ->
                name.substringBeforeLast(".") + ".textpack"
            else -> {
                val lastDot = name.lastIndexOf('.')
                val base = if (lastDot > 0) name.substring(0, lastDot) else name
                "$base.textpack"
            }
        }
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
        cachedMarkdownText: String? = null
    ) {
        val oldDocumentKey = currentDocumentHistoryKey()
        val saveStarted = android.os.SystemClock.elapsedRealtime()
        val snapshotSource = if (cachedMarkdownText != null) "cached" else "webview"
        AppDiagnostics.record(this, "save_start", "source=$snapshotSource mode=$currentEditorMode rev=$currentRevision")
        val persistSnapshot: (String) -> Unit = { snapshot ->
            var markdownText = snapshot
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
                val isTextPackTarget = requestedAsTextPack ?: (
                    hasTextPackExtension ||
                        (uri == currentFileUri && currentTextPackSession != null)
                    )

                if (isTextPackTarget) {
                    val session = currentTextPackSession ?: TextPackManager.openTextPack(this, uri)
                    currentTextPackSession = session
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
                }

                persistDocumentUriPermission(uri)
                remapDocumentNavigationHistory(oldDocumentKey, uri.toString())
                currentFileUri = uri
                currentFileName = targetFileName
                latestMarkdownContent = markdownText
                isDirty = false
                updateTitle()
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


    private fun handleInsertImage() {
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val imageMode = prefs.getString("pref_image_mode", "picker")
        if (imageMode == "url") {
            showImageUrlDialog()
        } else {
            pickImageLauncher.launch("image/*")
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

    inner class WebAppInterface {
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
        fun onDirtyStateChanged(dirty: Boolean, revision: Long) {
            runOnUiThread {
                currentRevision = revision
                if (isDirty != dirty) {
                    isDirty = dirty
                    updateTitle()
                }
            }
        }

        @JavascriptInterface
        fun onContentChanged(markdownText: String?, revision: Long = 0) {
            if (markdownText != null) {
                latestMarkdownContent = markdownText
            }
            currentRevision = revision
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
                    val escaped = JSONObjectWrapper.quote(text)
                    webView.evaluateJavascript("window.editorBridge.setMarkdown($escaped);") {
                        latestMarkdownContent = text
                        isDirty = text.isNotEmpty()
                        updateTitle()
                    }
                }

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
                    "export" -> handleExportDocument()
                    "image" -> handleInsertImage()
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
            // Live selection updates are not persisted as return scroll position
        }

        @JavascriptInterface
        fun onInDocumentNavigationOccurred() {
            runOnUiThread {
                if (documentForwardStack.isNotEmpty()) {
                    documentForwardStack.clear()
                    updateTitle()
                }
            }
        }

        @JavascriptInterface
        fun restoreNativeCursorAndScrollState() {
            runOnUiThread {
                restoreCursorAndScrollState()
            }
        }

        @JavascriptInterface
        fun onScrollChanged(scrollTop: Int) {
            val fileName = currentFileName
            if (fileName.isEmpty() || fileName == getString(R.string.untitled_document)) return
            val key = "doc_$fileName"
            val prefs = PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
            prefs.edit().putInt("cursor_scroll_$key", scrollTop).apply()
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
