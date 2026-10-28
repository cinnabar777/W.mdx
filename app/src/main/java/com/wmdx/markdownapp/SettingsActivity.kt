package com.wmdx.markdownapp

import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.PreferenceManager
import java.io.File
import java.io.FileOutputStream

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        applySystemBarDimming()
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = getString(R.string.settings_title)

        if (savedInstanceState == null) {
            val directPage = intent.getStringExtra("settings_page")
            val initialFragment = when (directPage) {
                "toc" -> TocPanelSettingsFragment()
                "left_panel" -> LeftPanelSettingsFragment()
                else -> SettingsFragment()
            }
            supportFragmentManager
                .beginTransaction()
                .replace(R.id.settings_container, initialFragment)
                .commit()
        }

        if (intent.getStringExtra("settings_page") == "toc") {
            supportActionBar?.title = "Table of Contents Panel"
        } else if (intent.getStringExtra("settings_page") == "left_panel") {
            supportActionBar?.title = "Left Side Panel"
        }

        supportFragmentManager.addOnBackStackChangedListener {
            val currentFragment = supportFragmentManager.findFragmentById(R.id.settings_container)
            supportActionBar?.title = when (currentFragment) {
                is SettingsThemeFragment -> "Settings Appearance"
                is StylingHeadingsFragment -> "Headings"
                is StylingParagraphFragment -> "Paragraph & Body"
                is StylingBoldFragment -> "Bold"
                is StylingItalicFragment -> "Italic"
                is StylingLinksFragment -> "Links"
                is StylingInlineCodeFragment -> "Inline Code"
                is StylingFootnotesFragment -> "Footnotes"
                is StylingListsFragment -> "Lists & Todos"
                is StylingBlockquotesFragment -> "Block Quotes"
                is StylingCalloutsFragment -> "Callouts"
                is StylingTablesFragment -> "Tables"
                is StylingCodeFragment -> "Code Blocks"
                is StylingHrFragment -> "Horizontal Rules"
                is StylingControlbarFragment -> "Toolbars"
                is StylingCursorFragment -> "Cursor & Selection"
                is StylingFindReplaceFragment -> "Find & Replace"
                is TocPanelSettingsFragment -> "Table of Contents"
                is LeftPanelSettingsFragment -> "Left Side Panel"
                is StorageAccessSettingsFragment -> "File & Folder Access"
                is StylingSettingsFragment -> "Typography"
                is ExportSettingsFragment -> "HTML & MHTML Export"
                is HotkeysSettingsFragment -> "Keyboard Shortcuts"
                else -> getString(R.string.settings_title)
            }
        }
    }

    private fun applySystemBarDimming() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = Color.BLACK
            window.navigationBarColor = Color.BLACK
            val insetsController = WindowCompat.getInsetsController(window, window.decorView)
            insetsController.isAppearanceLightStatusBars = false
            insetsController.isAppearanceLightNavigationBars = false
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        if (supportFragmentManager.backStackEntryCount > 0) {
            supportFragmentManager.popBackStack()
        } else {
            finish()
        }
        return true
    }
}

open class BaseSettingsFragment : PreferenceFragmentCompat(), SharedPreferences.OnSharedPreferenceChangeListener {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {}

    override fun setPreferencesFromResource(preferencesResId: Int, key: String?) {
        super.setPreferencesFromResource(preferencesResId, key)
        preferenceScreen?.let {
            applyCustomLayouts(it)
            configureDeviceFontChoices(it)
        }
    }

    private fun configureDeviceFontChoices(group: androidx.preference.PreferenceGroup) {
        val options = DeviceFontCatalog.options()
        for (index in 0 until group.preferenceCount) {
            val preference = group.getPreference(index)
            if (preference is androidx.preference.PreferenceGroup) {
                configureDeviceFontChoices(preference)
            }
            if (preference !is androidx.preference.ListPreference ||
                preference.key?.endsWith("_font_family") != true
            ) {
                continue
            }

            val entries = options.toMutableList()
            val selected = preference.value
            if (!selected.isNullOrBlank() && entries.none { it.value == selected }) {
                entries.add(DeviceFontOption("Saved: $selected", selected))
            }
            preference.entries = entries.map { it.label }.toTypedArray()
            preference.entryValues = entries.map { it.value }.toTypedArray()
        }
    }

    protected fun applyCustomLayouts(group: androidx.preference.PreferenceGroup) {
        for (i in 0 until group.preferenceCount) {
            val pref = group.getPreference(i)
            pref.isIconSpaceReserved = false
            if (pref is androidx.preference.PreferenceCategory) {
                pref.layoutResource = R.layout.preference_category_custom
                applyCustomLayouts(pref)
            } else if (pref is androidx.preference.SeekBarPreference) {
                if (pref is androidx.preference.PreferenceGroup) {
                    applyCustomLayouts(pref)
                }
            } else {
                pref.layoutResource = R.layout.preference_custom
                if (pref is androidx.preference.PreferenceGroup) {
                    applyCustomLayouts(pref)
                }
            }
        }
    }

    protected fun keepPreferenceCategories(vararg categoryKeys: String) {
        val screen = preferenceScreen ?: return
        val allowedKeys = categoryKeys.toSet()
        for (index in screen.preferenceCount - 1 downTo 0) {
            val preference = screen.getPreference(index)
            if (
                preference is androidx.preference.PreferenceCategory &&
                preference.key !in allowedKeys
            ) {
                screen.removePreference(preference)
            }
        }
    }

    override fun onViewCreated(view: android.view.View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val context = context ?: return
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val bgColorHex = prefs.getString("pref_settings_bg_color", "#000000") ?: "#000000"
        val bgColor = ColorPickerDialog.parseHexColor(bgColorHex, Color.BLACK)
        view.setBackgroundColor(bgColor)
        listView?.setBackgroundColor(bgColor)
    }

    override fun onResume() {
        super.onResume()
        preferenceScreen?.sharedPreferences?.registerOnSharedPreferenceChangeListener(this)
        view?.let { v ->
            val context = context ?: return
            val prefs = PreferenceManager.getDefaultSharedPreferences(context)
            val bgColorHex = prefs.getString("pref_settings_bg_color", "#000000") ?: "#000000"
            val bgColor = ColorPickerDialog.parseHexColor(bgColorHex, Color.BLACK)
            v.setBackgroundColor(bgColor)
            listView?.setBackgroundColor(bgColor)
        }
    }

    override fun onPause() {
        super.onPause()
        preferenceScreen?.sharedPreferences?.unregisterOnSharedPreferenceChangeListener(this)
    }

    protected open fun onSettingPreferenceChanged(
        sharedPreferences: SharedPreferences,
        key: String
    ) = Unit

    override fun onSharedPreferenceChanged(sharedPreferences: SharedPreferences?, key: String?) {
        if (key != null) {
            val pref = findPreference<Preference>(key)
            if (pref is ResettablePreference) {
                pref.callNotifyChanged()
            }
            if (key.startsWith("pref_settings_")) {
                listView?.adapter?.notifyDataSetChanged()
                view?.let { v ->
                    val context = context ?: return
                    val prefs = PreferenceManager.getDefaultSharedPreferences(context)
                    val bgColorHex = prefs.getString("pref_settings_bg_color", "#000000") ?: "#000000"
                    val bgColor = ColorPickerDialog.parseHexColor(bgColorHex, Color.BLACK)
                    v.setBackgroundColor(bgColor)
                    listView?.setBackgroundColor(bgColor)
                }
            }
            if (sharedPreferences != null) {
                onSettingPreferenceChanged(sharedPreferences, key)
            }
        }
    }
}

class SettingsFragment : BaseSettingsFragment() {

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences, rootKey)

        findPreference<Preference>("pref_export_backup")?.setOnPreferenceClickListener {
            exportBackupLauncher.launch("Wmdx_Backup_${System.currentTimeMillis()}.zip")
            true
        }

        findPreference<Preference>("pref_import_backup")?.setOnPreferenceClickListener {
            importBackupLauncher.launch(arrayOf("application/zip", "application/x-zip-compressed", "*/*"))
            true
        }

        findPreference<Preference>("pref_reset_all_defaults")?.setOnPreferenceClickListener {
            confirmAndResetAllDefaults()
            true
        }

        findPreference<Preference>("pref_page_diagnostics")?.apply {
            isVisible = BuildConfig.DEBUG
            setOnPreferenceClickListener {
                context?.let { AppDiagnostics.show(it) }
                true
            }
        }
    }

    override fun onPreferenceTreeClick(preference: Preference): Boolean {
        val key = preference.key ?: return super.onPreferenceTreeClick(preference)
        when (key) {
            "pref_page_toc" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, TocPanelSettingsFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_left_panel" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, LeftPanelSettingsFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_storage_access" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, StorageAccessSettingsFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_settings_theme" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, SettingsThemeFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_findreplace" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, StylingFindReplaceFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_bottom_toolbar" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, StylingControlbarFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_export", "pref_export_page" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, ExportSettingsFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_styling", "pref_styling_page" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, StylingSettingsFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
            "pref_page_hotkeys", "pref_hotkeys_page" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, HotkeysSettingsFragment())
                    .addToBackStack(null)
                    .commit()
                return true
            }
        }
        return super.onPreferenceTreeClick(preference)
    }

    private fun confirmAndResetAllDefaults() {
        val context = context ?: return
        AlertDialog.Builder(context)
            .setTitle("Reset All Settings ↺")
            .setMessage(R.string.reset_defaults_confirm)
            .setPositiveButton("Reset All") { _, _ ->
                val prefs = PreferenceManager.getDefaultSharedPreferences(context)
                prefs.edit().clear().apply()

                val fontDir = File(context.filesDir, "fonts")
                if (fontDir.exists()) {
                    fontDir.deleteRecursively()
                }

                preferenceScreen.removeAll()
                onCreatePreferences(null, null)
                ThemedToast.show(context, "All settings restored to defaults ↺", Toast.LENGTH_LONG)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private val exportBackupLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        uri?.let { performBackupExport(it) }
    }

    private val importBackupLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { performBackupImport(it) }
    }

    private fun performBackupExport(uri: Uri) {
        val context = context ?: return
        try {
            val prefs = PreferenceManager.getDefaultSharedPreferences(context)
            val allEntries = prefs.all
            val jsonObject = org.json.JSONObject()
            for ((key, value) in allEntries) {
                jsonObject.put(key, value)
            }

            context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                java.util.zip.ZipOutputStream(outputStream).use { zipOut ->
                    val prefBytes = jsonObject.toString(2).toByteArray(Charsets.UTF_8)
                    val prefEntry = java.util.zip.ZipEntry("preferences.json")
                    zipOut.putNextEntry(prefEntry)
                    zipOut.write(prefBytes)
                    zipOut.closeEntry()

                    val fontDir = File(context.filesDir, "fonts")
                    if (fontDir.exists() && fontDir.isDirectory) {
                        fontDir.listFiles()?.forEach { fontFile ->
                            if (fontFile.isFile) {
                                val fontEntry = java.util.zip.ZipEntry("fonts/${fontFile.name}")
                                zipOut.putNextEntry(fontEntry)
                                fontFile.inputStream().use { fontIn ->
                                    fontIn.copyTo(zipOut)
                                }
                                zipOut.closeEntry()
                            }
                        }
                    }
                }
            }
            ThemedToast.show(context, "Settings & fonts exported to ZIP!", Toast.LENGTH_LONG)
        } catch (e: Exception) {
            ThemedToast.show(context, "Export failed: ${e.localizedMessage}", Toast.LENGTH_LONG)
        }
    }

    private fun performBackupImport(uri: Uri) {
        val context = context ?: return
        try {
            val prefs = PreferenceManager.getDefaultSharedPreferences(context)
            val fontDir = File(context.filesDir, "fonts").apply { if (!exists()) mkdirs() }

            context.contentResolver.openInputStream(uri)?.use { inputStream ->
                java.util.zip.ZipInputStream(inputStream).use { zipIn ->
                    var entry = zipIn.nextEntry
                    while (entry != null) {
                        if (entry.name == "preferences.json") {
                            val jsonStr = zipIn.bufferedReader().readText()
                            val jsonObject = org.json.JSONObject(jsonStr)
                            val editor = prefs.edit()
                            val keys = jsonObject.keys()
                            while (keys.hasNext()) {
                                val key = keys.next()
                                val valObj = jsonObject.get(key)
                                when (valObj) {
                                    is Boolean -> editor.putBoolean(key, valObj)
                                    is Int -> editor.putInt(key, valObj)
                                    is Long -> editor.putLong(key, valObj)
                                    is Float -> editor.putFloat(key, valObj)
                                    is String -> editor.putString(key, valObj)
                                }
                            }
                            editor.apply()
                        } else if (entry.name.startsWith("fonts/") && !entry.isDirectory) {
                            val fileName = entry.name.substring("fonts/".length)
                            if (fileName.isNotEmpty()) {
                                val targetFile = File(fontDir, fileName)
                                FileOutputStream(targetFile).use { out ->
                                    zipIn.copyTo(out)
                                }
                            }
                        }
                        zipIn.closeEntry()
                        entry = zipIn.nextEntry
                    }
                }
            }
            ThemedToast.show(context, "Settings & fonts restored from ZIP!", Toast.LENGTH_LONG)
        } catch (e: Exception) {
            ThemedToast.show(context, "Import failed: ${e.localizedMessage}", Toast.LENGTH_LONG)
        }
    }
}

class StorageAccessSettingsFragment : BaseSettingsFragment() {
    private val locallyRevokedFolderUrisKey = "locally_revoked_storage_folder_uris"

    private val addFolderLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            handleFolderSelection(result.resultCode, result.data)
        }

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_storage_access, rootKey)
        findPreference<Preference>("pref_storage_add_folder")?.setOnPreferenceClickListener {
            launchFolderPicker()
            true
        }
        refreshAuthorizedFolders()
    }

    override fun onResume() {
        super.onResume()
        refreshAuthorizedFolders()
    }

    private fun launchFolderPicker() {
        val intent = android.content.Intent(
            android.content.Intent.ACTION_OPEN_DOCUMENT_TREE
        ).apply {
            addFlags(
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PREFIX_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        }
        addFolderLauncher.launch(intent)
    }

    private fun handleFolderSelection(
        resultCode: Int,
        resultIntent: android.content.Intent?
    ) {
        val selectedIntent = resultIntent
        if (resultCode != android.app.Activity.RESULT_OK || selectedIntent == null) return
        val folderUri = selectedIntent.data ?: return
        val readWriteFlags =
            android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        val grantedFlags = selectedIntent.flags and readWriteFlags
        if (grantedFlags != readWriteFlags) {
            ThemedToast.show(
                requireContext(),
                "Android did not grant read and write access to that folder.",
                Toast.LENGTH_LONG
            )
            return
        }

        val resolver = requireContext().contentResolver
        val persisted = runCatching {
            resolver.takePersistableUriPermission(folderUri, grantedFlags)
            resolver.persistedUriPermissions.any {
                it.uri == folderUri && it.isReadPermission && it.isWritePermission
            }
        }.getOrDefault(false)
        if (!persisted) {
            ThemedToast.show(
                requireContext(),
                "Android could not save access to that folder.",
                Toast.LENGTH_LONG
            )
            return
        }

        refreshAuthorizedFolders()
        ThemedToast.show(requireContext(), "Folder access saved", Toast.LENGTH_SHORT)
    }

    private fun refreshAuthorizedFolders() {
        val context = context ?: return
        val category = findPreference<androidx.preference.PreferenceCategory>(
            "pref_storage_authorized_folders"
        ) ?: return
        category.removeAll()

        val persistedPermissions = context.contentResolver.persistedUriPermissions
        val preferences =
            androidx.preference.PreferenceManager.getDefaultSharedPreferences(context)
        val locallyRevokedUris = preferences
            .getStringSet(locallyRevokedFolderUrisKey, emptySet())
            .orEmpty()
            .toMutableSet()
        val currentlyPersistedUris = persistedPermissions.map { it.uri.toString() }.toSet()
        val clearedRevocations = locallyRevokedUris.removeAll { it !in currentlyPersistedUris }
        if (clearedRevocations) {
            preferences.edit()
                .putStringSet(locallyRevokedFolderUrisKey, locallyRevokedUris)
                .apply()
        }

        val folders = persistedPermissions
            .filter {
                it.isReadPermission &&
                    it.isWritePermission &&
                    android.provider.DocumentsContract.isTreeUri(it.uri) &&
                    it.uri.toString() !in locallyRevokedUris
            }
            .map { it to getFolderDisplayName(context, it.uri) }
            .sortedBy { it.second.lowercase() }

        if (folders.isEmpty()) {
            category.addPreference(Preference(context).apply {
                title = "No folders approved"
                summary = "Use Add Folder to choose a folder once."
                isSelectable = false
                isIconSpaceReserved = false
                layoutResource = R.layout.preference_custom
            })
            return
        }

        folders.forEach { (permission, displayName) ->
            val folderUri = permission.uri
            category.addPreference(Preference(context).apply {
                title = displayName
                summary = "Tap to remove this saved folder permission"
                isIconSpaceReserved = false
                layoutResource = R.layout.preference_custom
                setOnPreferenceClickListener {
                    confirmRemoveFolder(folderUri)
                    true
                }
            })
        }
    }

    private fun getFolderDisplayName(context: android.content.Context, treeUri: Uri): String {
        val documentUri = runCatching {
            android.provider.DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                android.provider.DocumentsContract.getTreeDocumentId(treeUri)
            )
        }.getOrNull()
        val displayName = documentUri?.let { uri ->
            runCatching {
                context.contentResolver.query(
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
        return displayName
            ?: treeUri.lastPathSegment?.substringAfterLast(':')?.takeIf { it.isNotBlank() }
            ?: "Selected folder"
    }

    private fun confirmRemoveFolder(folderUri: Uri) {
        AlertDialog.Builder(requireContext())
            .setTitle("Remove folder access?")
            .setMessage(
                "The app will ask again before using this folder for file operations. If the open document relies on this permission to save, saving may also be affected."
            )
            .setPositiveButton("Remove Access") { _, _ ->
                val readWriteFlags =
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                val removed = runCatching {
                    requireContext().contentResolver.releasePersistableUriPermission(
                        folderUri,
                        readWriteFlags
                    )
                }.isSuccess
                if (removed) {
                    val preferences =
                        androidx.preference.PreferenceManager.getDefaultSharedPreferences(
                            requireContext()
                        )
                    val locallyRevokedUris = preferences
                        .getStringSet(locallyRevokedFolderUrisKey, emptySet())
                        .orEmpty()
                        .toMutableSet()
                    locallyRevokedUris.add(folderUri.toString())
                    preferences.edit()
                        .putStringSet(locallyRevokedFolderUrisKey, locallyRevokedUris)
                        .apply()
                }
                refreshAuthorizedFolders()
                if (removed) {
                    ThemedToast.show(requireContext(), "Folder access removed", Toast.LENGTH_SHORT)
                } else {
                    ThemedToast.show(
                        requireContext(),
                        "Android could not remove that folder permission.",
                        Toast.LENGTH_LONG
                    )
                }
            }
            .setNegativeButton("Keep", null)
            .show()
    }
}

open class StylingSettingsFragment : BaseSettingsFragment() {
    private var activeFontTargetKey: String? = null

    private val pickFontLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { handleFontPicked(it) }
    }

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling, rootKey)
        configureFontPreferences()
    }

    protected fun configureFontPreferences() {
        val fontKeys = listOf(
            "pref_font_file_body",
            "pref_font_file_heading",
            "pref_font_file_heading_1",
            "pref_font_file_heading_2",
            "pref_font_file_heading_3",
            "pref_font_file_heading_4",
            "pref_font_file_heading_5",
            "pref_font_file_heading_6",
            "pref_font_file_blockquote",
            "pref_font_file_callout",
            "pref_font_file_bold",
            "pref_font_file_italic",
            "pref_font_file_code",
            "pref_font_file_code_block",
            "pref_font_file_list",
            "pref_font_file_table",
            "pref_font_file_callout_header",
            "pref_font_file_toc",
            "pref_font_file_footnote"
        )

        for (key in fontKeys) {
            val pref: Preference? = findPreference(key)
            updateFontPrefSummary(pref, key)
            pref?.setOnPreferenceClickListener {
                activeFontTargetKey = key
                pickFontLauncher.launch("*/*")
                true
            }
        }
    }

    protected fun addHeadingLevelPreferences() {
        val context = requireContext()
        val screen = preferenceScreen
        val sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context)
        val globalScale = sharedPreferences.getInt("pref_heading_scale_percent", 100)
        val levelScalePreferences = mutableListOf<androidx.preference.SeekBarPreference>()

        fun addResetPreference(
            key: String,
            title: String,
            summary: String,
            defaultValue: Any? = null
        ): Preference {
            return ResetPreference(context).apply {
                this.key = key
                this.title = title
                this.summary = summary
                if (defaultValue != null) setDefaultValue(defaultValue)
                isVisible = false
            }
        }

        fun addLevel(level: Int) {
            val prefix = "pref_heading_${level}_"
            val controls = mutableListOf<Preference>()
            fun inherited(suffix: String, fallback: Any): Any =
                PreferenceResetHelper.getHeadingOverrideInheritedValue(
                    sharedPreferences,
                    prefix + suffix
                ) ?: fallback

            val header = Preference(context).apply {
                key = "pref_heading_${level}_settings_toggle"
                title = "H$level"
                summary = "Tap to show H$level settings"
            }
            screen.addPreference(header)

            val scale = ResetSeekBarPreference(context).apply {
                key = prefix + "scale_percent"
                title = "Heading Size Scale (%)"
                summary = "Overrides the global scale; reset to inherit the current global value"
                min = 50
                max = 200
                setDefaultValue(
                    PreferenceResetHelper.getHeadingOverrideInheritedValue(
                        sharedPreferences,
                        prefix + "scale_percent"
                    ) ?: globalScale
                )
                showSeekBarValue = true
                isVisible = false
            }
            controls.add(scale)
            levelScalePreferences.add(scale)

            val weight = ResetSeekBarPreference(context).apply {
                key = prefix + "font_weight"
                title = "Headings Font Weight"
                summary = "Font weight for this heading level (100–900)"
                min = 100
                max = 900
                setDefaultValue(inherited("font_weight", 700))
                showSeekBarValue = true
                isVisible = false
            }
            controls.add(weight)

            controls.add(ResetListPreference(context).apply {
                key = prefix + "font_family"
                title = "Heading Font Family"
                summary = "Choose a device font for H$level"
                entries = context.resources.getTextArray(R.array.font_family_entries)
                entryValues = context.resources.getTextArray(R.array.font_family_values)
                setDefaultValue(inherited("font_family", "default"))
                isVisible = false
            })

            controls.add(addResetPreference(
                "pref_font_file_heading_$level",
                "Heading Font File",
                "Tap to pick a font file (.ttf, .otf, .woff, .woff2)"
            ))
            controls.add(ResetColorPickerPreference(context).apply {
                key = prefix + "color"
                title = "Heading Color"
                summary = "Override the global heading color for H$level"
                setDefaultValue(inherited("color", "default"))
                isVisible = false
            })
            controls.add(ResetListPreference(context).apply {
                key = prefix + "align"
                title = "Heading Text Alignment"
                summary = "Align this heading level"
                entries = context.resources.getTextArray(R.array.align_entries)
                entryValues = context.resources.getTextArray(R.array.align_values)
                setDefaultValue(inherited("align", "default"))
                isVisible = false
            })
            controls.add(ResetEditTextPreference(context).apply {
                key = prefix + "line_height"
                title = "Heading Line Height"
                summary = "Line-height multiplier for H$level"
                setDefaultValue(inherited("line_height", "1.2"))
                isVisible = false
            })
            controls.add(ResetEditTextPreference(context).apply {
                key = prefix + "letter_spacing"
                title = "Heading Letter Spacing (px)"
                summary = "Space between letters in H$level"
                setDefaultValue(inherited("letter_spacing", "0px"))
                isVisible = false
            })
            controls.add(ResetEditTextPreference(context).apply {
                key = prefix + "word_spacing"
                title = "Heading Word Spacing (px)"
                summary = "Space between words in H$level"
                setDefaultValue(inherited("word_spacing", "0px"))
                isVisible = false
            })
            controls.add(ResetListPreference(context).apply {
                key = prefix + "text_transform"
                title = "Heading Text Transform"
                summary = "Capitalization transform for H$level"
                entries = context.resources.getTextArray(R.array.text_transform_entries)
                entryValues = context.resources.getTextArray(R.array.text_transform_values)
                setDefaultValue(inherited("text_transform", "none"))
                isVisible = false
            })
            controls.add(ResetListPreference(context).apply {
                key = prefix + "underline_style"
                title = "Underline Style"
                summary = "Text decoration for H$level"
                entries = context.resources.getTextArray(R.array.underline_style_entries)
                entryValues = context.resources.getTextArray(R.array.underline_style_values)
                setDefaultValue(inherited("underline_style", "none"))
                isVisible = false
            })
            controls.add(ResetSeekBarPreference(context).apply {
                key = prefix + "underline_thickness"
                title = "Underline Thickness (px)"
                summary = "Underline thickness for H$level"
                min = 1
                max = 10
                setDefaultValue(inherited("underline_thickness", 2))
                showSeekBarValue = true
                isVisible = false
            })
            controls.add(ResetColorPickerPreference(context).apply {
                key = prefix + "underline_color"
                title = "Underline Color"
                summary = "Override the global underline color for H$level"
                setDefaultValue(inherited("underline_color", "default"))
                isVisible = false
            })
            for ((descriptor, maxValue) in listOf(
                Triple("margin_left", "Heading Left Margin (px)", "Space before H$level") to 80,
                Triple("margin_right", "Heading Right Margin (px)", "Space after H$level") to 80,
                Triple("margin_top", "Top Margin (px)", "Space above H$level") to 50,
                Triple("margin_bottom", "Bottom Margin (px)", "Space below H$level") to 50
            )) {
                val (key, title, summary) = descriptor
                controls.add(ResetSeekBarPreference(context).apply {
                    this.key = prefix + key
                    this.title = title
                    this.summary = summary
                    min = 0
                    this.max = maxValue
                    val fallback = if (key == "margin_top") 16 else if (key == "margin_bottom") 8 else 0
                    setDefaultValue(inherited(key, fallback))
                    showSeekBarValue = true
                    isVisible = false
                })
            }

            val generatedHeadingDefaults = mutableListOf<String>()
            controls.forEach { preference ->
                val key = preference.key
                val hadStoredOverride = key != null && sharedPreferences.contains(key)
                screen.addPreference(preference)

                // SeekBar, list, and edit-text preferences persist their
                // setDefaultValue() during attachment. A displayed inherited
                // value must not become a saved H-level override.
                if (
                    !hadStoredOverride &&
                    key != null &&
                    Regex("^pref_heading_[1-6]_(?!settings_toggle$).+").matches(key)
                ) {
                    generatedHeadingDefaults.add(key)
                }
            }
            if (generatedHeadingDefaults.isNotEmpty()) {
                sharedPreferences.edit().apply {
                    generatedHeadingDefaults.forEach { remove(it) }
                }.apply()
            }
            header.summary = "Tap to show H$level settings"
            header.setOnPreferenceClickListener {
                val expanded = controls.firstOrNull()?.isVisible != true
                controls.forEach { it.isVisible = expanded }
                header.summary = if (expanded) {
                    "Tap to hide H$level settings"
                } else {
                    "Tap to show H$level settings"
                }
                true
            }
        }

        for (level in 1..6) addLevel(level)

        // These controls are created after setPreferencesFromResource has
        // applied the settings row layouts. Apply the same layouts to them.
        applyCustomLayouts(screen)

        findPreference<androidx.preference.SeekBarPreference>("pref_heading_scale_percent")
            ?.setOnPreferenceChangeListener { _, newValue ->
                val updatedScale = (newValue as? Int) ?: globalScale
                for (preference in levelScalePreferences) {
                    if (!sharedPreferences.contains(preference.key)) {
                        preference.setDefaultValue(updatedScale)
                        preference.value = updatedScale
                        // SeekBarPreference persists its assigned value. This is
                        // only an inherited display value, not an H-level override.
                        sharedPreferences.edit().remove(preference.key).apply()
                    }
                }
                true
            }
    }

    override fun onPreferenceTreeClick(preference: Preference): Boolean {
        val key = preference.key ?: return super.onPreferenceTreeClick(preference)
        if (key.startsWith("pref_font_file_")) {
            activeFontTargetKey = key
            pickFontLauncher.launch("*/*")
            return true
        }
        val targetFragment: PreferenceFragmentCompat? = when (key) {
            "pref_styling_page_headings" -> StylingHeadingsFragment()
            "pref_styling_page_paragraph" -> StylingParagraphFragment()
            "pref_styling_page_bold" -> StylingBoldFragment()
            "pref_styling_page_italic" -> StylingItalicFragment()
            "pref_styling_page_underline" -> StylingUnderlineFragment()
            "pref_styling_page_links" -> StylingLinksFragment()
            "pref_styling_page_inline_code" -> StylingInlineCodeFragment()
            "pref_styling_page_footnotes" -> StylingFootnotesFragment()
            "pref_styling_page_lists" -> StylingListsFragment()
            "pref_styling_page_blockquotes" -> StylingBlockquotesFragment()
            "pref_styling_page_callouts" -> StylingCalloutsFragment()
            "pref_styling_page_tables" -> StylingTablesFragment()
            "pref_styling_page_code" -> StylingCodeFragment()
            "pref_styling_page_hr" -> StylingHrFragment()
            "pref_styling_page_cursor" -> StylingCursorFragment()
            "pref_styling_page_findreplace" -> StylingFindReplaceFragment()
            else -> null
        }
        if (targetFragment != null) {
            parentFragmentManager.beginTransaction()
                .replace(R.id.settings_container, targetFragment)
                .addToBackStack(null)
                .commit()
            return true
        }
        return super.onPreferenceTreeClick(preference)
    }

    private fun updateFontPrefSummary(pref: Preference?, key: String) {
        if (pref == null) return
        val context = context ?: return
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val savedFileName = prefs.getString("${key}_name", null)
        if (savedFileName != null) {
            pref.summary = "Loaded: $savedFileName (Tap to change)"
        } else {
            pref.summary = "Tap to pick a font file (.ttf, .otf, .woff, .woff2)"
        }
        if (pref is ResettablePreference) {
            pref.callNotifyChanged()
        }
    }

    private fun handleFontPicked(uri: Uri) {
        val targetKey = activeFontTargetKey ?: return
        val context = context ?: return

        try {
            val fontDir = File(context.filesDir, "fonts").apply { if (!exists()) mkdirs() }
            val fileName = getFileName(uri) ?: "font_${System.currentTimeMillis()}"
            val targetFile = File(fontDir, "${targetKey}_$fileName")

            context.contentResolver.openInputStream(uri)?.use { inputStream ->
                FileOutputStream(targetFile).use { outputStream ->
                    inputStream.copyTo(outputStream)
                }
            }

            val prefs = PreferenceManager.getDefaultSharedPreferences(context)
            prefs.edit()
                .putString("${targetKey}_path", targetFile.absolutePath)
                .putString("${targetKey}_name", fileName)
                .apply()

            val pref: Preference? = findPreference(targetKey)
            updateFontPrefSummary(pref, targetKey)
            ThemedToast.show(context, "Font saved successfully: $fileName", Toast.LENGTH_SHORT)
        } catch (e: Exception) {
            ThemedToast.show(context, "Failed to load font: ${e.localizedMessage}", Toast.LENGTH_LONG)
        }
    }

    protected fun getFileName(uri: Uri): String? {
        val context = context ?: return null
        var result: String? = null
        if (uri.scheme == "content") {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
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
        return result
    }
}

class StylingHeadingsFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_headings, rootKey)
        addHeadingLevelPreferences()
        configureFontPreferences()
    }
}

class StylingParagraphFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_paragraph, rootKey)
        configureFontPreferences()
    }
}

abstract class StylingInlineElementFragment : StylingSettingsFragment() {
    protected abstract val categoryKey: String

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_inline, rootKey)
        keepPreferenceCategories(categoryKey)
        configureFontPreferences()
    }
}

class StylingBoldFragment : StylingInlineElementFragment() {
    override val categoryKey = "styling_inline_bold"
}

class StylingItalicFragment : StylingInlineElementFragment() {
    override val categoryKey = "styling_inline_italic"
}

class StylingUnderlineFragment : StylingSettingsFragment() {
    private val underlineSectionKeys = listOf(
        "solid", "dotted", "dashed", "double", "wavy"
    )

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_underline, rootKey)
        for (style in underlineSectionKeys) {
            val section = findPreference<ExpandablePreference>(
                "pref_underline_${style}_section"
            ) ?: continue
            section.setOnPreferenceClickListener {
                section.isExpanded = !section.isExpanded
                refreshUnderlineSections()
                true
            }
        }
        refreshUnderlineSections()
    }

    override fun onSettingPreferenceChanged(
        sharedPreferences: SharedPreferences,
        key: String
    ) {
        if (key == "pref_underline_use_wmdx_syntax") refreshUnderlineSections()
    }

    private fun refreshUnderlineSections() {
        val enabled = findPreference<androidx.preference.SwitchPreferenceCompat>(
            "pref_underline_use_wmdx_syntax"
        )?.isChecked == true
        for (style in underlineSectionKeys) {
            val section = findPreference<ExpandablePreference>(
                "pref_underline_${style}_section"
            )
            val controls = findPreference<androidx.preference.PreferenceCategory>(
                "pref_underline_${style}_controls"
            )
            section?.isVisible = enabled
            controls?.isVisible = enabled && section?.isExpanded == true
        }
    }
}

class StylingLinksFragment : StylingInlineElementFragment() {
    override val categoryKey = "styling_inline_links"
}

class StylingInlineCodeFragment : StylingInlineElementFragment() {
    override val categoryKey = "styling_inline_code"
}

class StylingFootnotesFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_footnotes, rootKey)
        configureFontPreferences()
    }
}

class StylingListsFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_lists, rootKey)
        configureFontPreferences()
    }
}

class StylingBlockquotesFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_blockquotes, rootKey)
        keepPreferenceCategories("styling_blockquote_typography", "styling_blockquote_settings")
        configureFontPreferences()
    }
}

class StylingCalloutsFragment : StylingSettingsFragment() {
    private var previewContainer: android.widget.LinearLayout? = null
    private val previewTitleViews = mutableMapOf<String, android.widget.TextView>()
    private val previewCardViews = mutableMapOf<String, android.widget.LinearLayout>()

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_blockquotes, rootKey)
        keepPreferenceCategories(
            "styling_callout_body_typography",
            "styling_callout_settings",
            "styling_callout_shared_header",
            "styling_callout_type_overrides"
        )
        configureFontPreferences()
    }

    override fun onViewCreated(view: android.view.View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupCalloutPreview(view)
        updateTypeOverrideVisibility()
        val ctx = context
        if (ctx != null) {
            refreshCalloutPreview(PreferenceManager.getDefaultSharedPreferences(ctx))
        }
    }

    override fun onSettingPreferenceChanged(sharedPreferences: SharedPreferences, key: String) {
        super.onSettingPreferenceChanged(sharedPreferences, key)
        if (key == "pref_callout_type_selector") {
            updateTypeOverrideVisibility()
        }
        if (key.startsWith("pref_callout_")) {
            refreshCalloutPreview(sharedPreferences)
        }
    }

    private fun updateTypeOverrideVisibility() {
        val ctx = context ?: return
        val prefs = PreferenceManager.getDefaultSharedPreferences(ctx)
        val selectedType = prefs.getString("pref_callout_type_selector", "info") ?: "info"

        val supportedTypes = listOf("info", "faq", "question", "todo", "example")
        for (t in supportedTypes) {
            val isSelected = (t == selectedType)
            findPreference<Preference>("pref_callout_type_${t}_bg_color")?.isVisible = isSelected
            findPreference<Preference>("pref_callout_type_${t}_title_color")?.isVisible = isSelected
            findPreference<Preference>("pref_callout_type_${t}_accent_color")?.isVisible = isSelected
            findPreference<Preference>("pref_callout_type_${t}_icon")?.isVisible = isSelected
        }
    }

    private fun setupCalloutPreview(fragmentRootView: android.view.View) {
        val listView = listView ?: return
        val ctx = context ?: return
        val density = ctx.resources.displayMetrics.density

        if (fragmentRootView.findViewWithTag<android.view.View>("callout_preview_card") != null) return

        val parentView = listView.parent as? android.view.ViewGroup ?: return

        val previewCard = android.widget.LinearLayout(ctx).apply {
            tag = "callout_preview_card"
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding((10 * density).toInt(), (10 * density).toInt(), (10 * density).toInt(), (10 * density).toInt())
            setBackgroundColor(Color.parseColor("#121212"))
        }
        previewContainer = previewCard

        val previewLabel = android.widget.TextView(ctx).apply {
            text = "Callout Live Preview"
            textSize = 12f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#00E5FF"))
            setPadding(0, 0, 0, (6 * density).toInt())
        }
        previewCard.addView(previewLabel)

        val supportedTypes = listOf("info", "faq", "question", "todo", "example")
        val typeLabels = mapOf(
            "info" to "ℹ Info Callout Header",
            "faq" to "❓ FAQ Callout Header",
            "question" to "❓ Question Callout Header",
            "todo" to "☑ Todo Callout Header",
            "example" to "≡ Example Callout Header"
        )

        for (t in supportedTypes) {
            val box = android.widget.LinearLayout(ctx).apply {
                orientation = android.widget.LinearLayout.VERTICAL
                setPadding((8 * density).toInt(), (6 * density).toInt(), (8 * density).toInt(), (6 * density).toInt())
                layoutParams = android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                    android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = (6 * density).toInt() }
            }

            val titleTv = android.widget.TextView(ctx).apply {
                text = typeLabels[t] ?: t
                textSize = 14f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }

            box.addView(titleTv)
            previewCard.addView(box)

            previewCardViews[t] = box
            previewTitleViews[t] = titleTv
        }

        try {
            if (parentView is android.widget.LinearLayout) {
                parentView.addView(previewCard, 0)
            } else {
                val indexInParent = parentView.indexOfChild(listView)
                parentView.removeView(listView)

                val container = android.widget.LinearLayout(ctx).apply {
                    orientation = android.widget.LinearLayout.VERTICAL
                    layoutParams = android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT
                    )
                }

                container.addView(previewCard, android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                    android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                ))

                container.addView(listView, android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                    0, 1f
                ))

                parentView.addView(container, indexInParent)
            }
        } catch (e: Exception) {}
    }

    private fun refreshCalloutPreview(prefs: SharedPreferences) {
        val supportedTypes = listOf("info", "faq", "question", "todo", "example")

        val sharedHeaderBgHex = prefs.getString("pref_callout_header_bg_color", "default") ?: "default"
        val sharedHeaderTitleHex = prefs.getString("pref_callout_header_title_color", "default") ?: "default"
        val sharedHeaderAccentHex = prefs.getString("pref_callout_header_accent_color", "default") ?: "default"

        val defaultBorders = mapOf(
            "info" to Color.parseColor("#29B6F6"),
            "faq" to Color.parseColor("#FF9800"),
            "question" to Color.parseColor("#FF9800"),
            "todo" to Color.parseColor("#00BCD4"),
            "example" to Color.parseColor("#AB47BC")
        )

        for (t in supportedTypes) {
            val box = previewCardViews[t] ?: continue
            val titleTv = previewTitleViews[t] ?: continue

            val typeBgHex = prefs.getString("pref_callout_type_${t}_bg_color", "default") ?: "default"
            val typeTitleHex = prefs.getString("pref_callout_type_${t}_title_color", "default") ?: "default"
            val typeAccentHex = prefs.getString("pref_callout_type_${t}_accent_color", "default") ?: "default"

            val effectiveBgHex = if (typeBgHex != "default") typeBgHex else sharedHeaderBgHex
            val effectiveTitleHex = if (typeTitleHex != "default") typeTitleHex else sharedHeaderTitleHex
            val effectiveAccentHex = if (typeAccentHex != "default") typeAccentHex else sharedHeaderAccentHex

            val bgColor = if (effectiveBgHex == "default") Color.parseColor("#1A232A") else ColorPickerDialog.parseHexColor(effectiveBgHex, Color.parseColor("#1A232A"))
            val titleColor = if (effectiveTitleHex == "default") Color.WHITE else ColorPickerDialog.parseHexColor(effectiveTitleHex, Color.WHITE)
            val accentColor = if (effectiveAccentHex == "default") (defaultBorders[t] ?: Color.parseColor("#29B6F6")) else ColorPickerDialog.parseHexColor(effectiveAccentHex, defaultBorders[t] ?: Color.parseColor("#29B6F6"))

            box.setBackgroundColor(bgColor)
            titleTv.setTextColor(titleColor)

            val density = box.context.resources.displayMetrics.density
            val borderDrawable = android.graphics.drawable.GradientDrawable().apply {
                setColor(bgColor)
                setStroke((3 * density).toInt(), accentColor)
                cornerRadius = 4 * density
            }
            box.background = borderDrawable
        }
    }
}

class StylingTablesFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_tables, rootKey)
        configureFontPreferences()
    }
}

class StylingCodeFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_code, rootKey)
        configureFontPreferences()
    }
}

class StylingHrFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_hr, rootKey)
    }
}

class StylingControlbarFragment : StylingSettingsFragment() {
    companion object {
        private const val TOOLBAR_CONFIG_KEY = "pref_toolbar_bottom_config"
        private const val TOOLBAR_FLOATING_CONFIG_KEY = "pref_toolbar_floating_config"
        private const val TOOLBAR_APPEARANCE_HEADER_KEY = "pref_toolbar_global_settings"
        private const val TOOLBAR_OPEN_GROUP_ACTION_ID = "openGroup"
        private const val LEGACY_TOOLBAR_OPEN_GROUP_ACTION_PREFIX = "openToolbarGroup:"
        private val TOOLBAR_APPEARANCE_PREFERENCE_KEYS = listOf(
            "pref_toolbar_bg_color",
            "pref_toolbar_icon_color",
            "pref_toolbar_active_key_bg_color",
            "pref_toolbar_toggle_category",
            "pref_toolbar_toggle_bg_color",
            "pref_toolbar_toggle_icon_color",
            "pref_toolbar_toggle_closed_width",
            "pref_toolbar_toggle_closed_height",
            "pref_toolbar_floating_enabled",
            "pref_toolbar_height",
            "pref_toolbar_padding",
            "pref_toolbar_floating_category",
            "pref_toolbar_floating_key_width",
            "pref_toolbar_floating_corner_radius",
            "pref_toolbar_show_labels",
            "pref_toolbar_label_size",
            "pref_toolbar_label_color"
        )
        private val TOOLBAR_ITEM_IDS = listOf(
            "undo", "heading", "lists", "format", "table", "insert", "menu"
        )
        private val TOOLBAR_HOLDING_ITEM_IDS = listOf("cut", "copy", "paste", "selectAll")
        private val TOOLBAR_GROUP_ITEM_IDS = linkedMapOf(
            "heading" to listOf(
                "paragraph", "heading1", "heading2", "heading3", "heading4", "heading5",
                "heading6", "wrap", "line-numbers"
            ),
            "lists" to listOf(
                "bulletedList", "numberedList", "todoList", "indent", "outdent"
            ),
            "format" to listOf(
                "bold", "italic", "strikethrough", "underline", "underlineSolid",
                "underlineDotted", "underlineDashed", "underlineDouble", "underlineWavy",
                "yellowMarker", "greenMarker",
                "pinkMarker", "blueMarker", "redPen", "greenPen"
            ),
            "table" to listOf(
                "insertTable", "insertRowBelow", "insertColumnRight", "deleteRow", "deleteColumn",
                "mergeLeft", "mergeRight", "mergeUp", "mergeDown", "splitCell"
            ),
            "insert" to listOf(
                "image", "link", "callout", "inlineCode", "blockQuote", "codeBlock",
                "horizontalLine", "footnote"
            ),
            "menu" to listOf(
                "newFile", "openFile", "saveFile", "saveAsFile", "saveTabs", "saveAsTextPack",
                "exportHtml", "search", "switchView", "newWindow", "settings"
            )
        )
        private val TOOLBAR_STYLE_IDS = TOOLBAR_ITEM_IDS + listOf(
            "paragraph",
            "heading1", "heading2", "heading3", "heading4", "heading5", "heading6",
            "wrap", "line-numbers",
            "bulletedList", "numberedList", "todoList", "indent", "outdent",
            "bold", "italic", "strikethrough", "underline", "underlineSolid",
            "underlineDotted", "underlineDashed", "underlineDouble", "underlineWavy",
            "yellowMarker", "greenMarker", "pinkMarker", "blueMarker", "redPen", "greenPen",
            "insertTable", "insertRowBelow", "insertColumnRight", "deleteRow", "deleteColumn",
            "mergeLeft", "mergeRight", "mergeUp", "mergeDown", "splitCell",
            "image", "link", "callout", "inlineCode", "blockQuote", "codeBlock",
            "horizontalLine", "footnote",
            "newFile", "openFile", "saveFile", "saveAsFile", "saveTabs", "saveAsTextPack",
            "exportHtml", "search", "switchView", "newWindow", "settings",
            "cut", "copy", "paste", "selectAll"
        )
        private val TOOLBAR_GESTURE_IDS = listOf(
            "longPress", "tap1", "tap2", "tap3",
            "swipeUp", "swipeDown", "swipeLeft", "swipeRight",
            "swipeUpLeft", "swipeUpRight", "swipeDownLeft", "swipeDownRight"
        )
        private val TOOLBAR_GESTURE_ACTION_IDS = listOf(
            "historyBack", "historyForward", "toggleToolbar", "removeHighlight",
            TOOLBAR_OPEN_GROUP_ACTION_ID
        )
        private val TOOLBAR_CUSTOM_KEY_ID_PATTERN =
            Regex("""^custom-key-[a-z0-9-]{1,48}$""", RegexOption.IGNORE_CASE)
        private val TOOLBAR_COLOR_PROPERTIES = setOf(
            "iconColor", "backgroundColor", "activeBackgroundColor"
        )
        private const val MAX_TOOLBAR_SVG_BYTES = 64 * 1024
    }

    private var toolbarPreviewWebView: android.webkit.WebView? = null
    private var toolbarPreviewHost: android.widget.FrameLayout? = null
    private var toolbarPreviewPreferencesView: android.view.View? = null
    @Volatile
    private lateinit var toolbarPreferences: SharedPreferences
    @Volatile
    private var toolbarConfigPreferenceKey = TOOLBAR_CONFIG_KEY
    @Volatile
    private var toolbarSaveFailureReason = "unknown"
    private var targetToolbarIconId: String? = null
    private var targetToolbarIconProperty = "customSvg"
    private var toolbarAppearanceExpanded = false
    private var toolbarAppearanceHeader: ExpandablePreference? = null
    private var toolbarAppearancePreferences: List<Preference> = emptyList()

    private val pickToolbarSvgLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            uri?.let { handleToolbarSvgPicked(it) }
        }

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        toolbarPreferences =
            PreferenceManager.getDefaultSharedPreferences(requireContext().applicationContext)
        toolbarConfigPreferenceKey = TOOLBAR_CONFIG_KEY
        setPreferencesFromResource(R.xml.preferences_styling_controlbar, rootKey)
        val appearanceHeader =
            findPreference<ExpandablePreference>(TOOLBAR_APPEARANCE_HEADER_KEY)
                ?: return
        toolbarAppearanceHeader = appearanceHeader
        toolbarAppearancePreferences = TOOLBAR_APPEARANCE_PREFERENCE_KEYS.mapNotNull {
            findPreference<Preference>(it)
        }
        toolbarAppearanceExpanded = false
        appearanceHeader.isExpanded = toolbarAppearanceExpanded
        toolbarAppearancePreferences.forEach { it.isVisible = toolbarAppearanceExpanded }
        appearanceHeader.setOnPreferenceClickListener {
            if (toolbarAppearanceExpanded) saveToolbarPreviewLayout()
            toolbarAppearanceExpanded = !toolbarAppearanceExpanded
            appearanceHeader.isExpanded = toolbarAppearanceExpanded
            toolbarAppearancePreferences.forEach { it.isVisible = toolbarAppearanceExpanded }
            view?.parent?.requestLayout()
            true
        }
    }

    private fun collapseToolbarAppearanceSettings() {
        if (!toolbarAppearanceExpanded) return
        saveToolbarPreviewLayout()
        toolbarAppearanceExpanded = false
        toolbarAppearanceHeader?.isExpanded = false
        toolbarAppearancePreferences.forEach { it.isVisible = false }
        view?.parent?.requestLayout()
    }

    private fun saveToolbarPreviewLayout() {
        val preview = toolbarPreviewWebView
            ?: toolbarPreviewHost?.findViewWithTag<android.webkit.WebView>(
                "toolbar-preview-save-target"
            )
            ?: view?.rootView?.findViewWithTag<android.webkit.WebView>(
                "toolbar-preview-save-target"
            )
            ?: return
        val saveScript = """
            (function() {
                var save = window.saveToolbarLayout;
                if (typeof save !== "function") return false;
                try {
                    return save() === true;
                } catch (error) {
                    return false;
                }
            })()
        """.trimIndent()
        preview.evaluateJavascript(saveScript, null)
    }

    override fun onCreateView(
        inflater: android.view.LayoutInflater,
        container: android.view.ViewGroup?,
        savedInstanceState: Bundle?
    ): android.view.View {
        val preferencesView = super.onCreateView(inflater, container, savedInstanceState)
        val context = requireContext()
        val wrapper = android.widget.FrameLayout(context)
        val baseLayout = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
        }
        listView?.apply {
            isNestedScrollingEnabled = false
            layoutParams = layoutParams?.apply {
                height = android.view.ViewGroup.LayoutParams.WRAP_CONTENT
            }
        }
        preferencesView.layoutParams = android.widget.LinearLayout.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT
        )
        val preview = android.webkit.WebView(context).apply {
            tag = "toolbar-preview-save-target"
            alpha = 0f
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            addJavascriptInterface(ToolbarPreviewBridge(), "ToolbarSettings")
            setOnTouchListener { view, event ->
                if (
                    event.actionMasked == android.view.MotionEvent.ACTION_UP &&
                    event.x.isFinite() &&
                    event.y.isFinite()
                ) {
                    val density = context.resources.displayMetrics.density
                    val clientX = event.x / density
                    val clientY = event.y / density
                    (view as? android.webkit.WebView)?.evaluateJavascript(
                        "window.finishToolbarDragFromNative?.($clientX,$clientY);",
                        null
                    )
                }
                false
            }
        }
        toolbarPreviewWebView = preview
        toolbarPreviewHost = wrapper
        toolbarPreviewPreferencesView = preferencesView
        baseLayout.addView(
            preferencesView,
            android.widget.LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
        baseLayout.addView(
            android.view.View(context),
            android.widget.LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        )
        wrapper.addView(
            baseLayout,
            android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        wrapper.addView(
            preview,
            android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        val updatePreviewBounds = android.view.View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            updateToolbarPreviewBounds()
        }
        wrapper.addOnLayoutChangeListener(updatePreviewBounds)
        preferencesView.addOnLayoutChangeListener(updatePreviewBounds)

        val assetLoader = androidx.webkit.WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                androidx.webkit.WebViewAssetLoader.AssetsPathHandler(context)
            )
            .build()
        preview.webViewClient = object : android.webkit.WebViewClient() {
            override fun shouldInterceptRequest(
                view: android.webkit.WebView?,
                request: android.webkit.WebResourceRequest?
            ): android.webkit.WebResourceResponse? {
                return request?.url?.let { assetLoader.shouldInterceptRequest(it) }
            }

            override fun onPageFinished(view: android.webkit.WebView?, url: String?) {
                super.onPageFinished(view, url)
                updateToolbarPreview()
            }
        }
        preview.setBackgroundColor(Color.BLACK)
        preview.loadUrl(
            "https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html"
        )
        wrapper.post { updateToolbarPreviewBounds() }
        return wrapper
    }

    private fun updateToolbarPreviewBounds() {
        val host = toolbarPreviewHost ?: return
        val preview = toolbarPreviewWebView ?: return
        if (host.height <= 0) return
        val preferenceBottom = toolbarPreviewPreferencesView?.bottom ?: 0
        val top = preferenceBottom.coerceIn(0, host.height)
        val params = (preview.layoutParams as? android.widget.FrameLayout.LayoutParams)
            ?: android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        params.width = android.view.ViewGroup.LayoutParams.MATCH_PARENT
        params.height = (host.height - top).coerceAtLeast(0)
        params.topMargin = top
        params.gravity = android.view.Gravity.TOP
        preview.layoutParams = params
        preview.alpha = 1f
        preview.bringToFront()
    }

    override fun onSettingPreferenceChanged(
        sharedPreferences: SharedPreferences,
        key: String
    ) {
        super.onSettingPreferenceChanged(sharedPreferences, key)
        if (
            (key.startsWith("pref_toolbar_") &&
                key != TOOLBAR_CONFIG_KEY &&
                key != TOOLBAR_FLOATING_CONFIG_KEY) ||
            key == "pref_app_theme"
        ) {
            saveToolbarPreviewLayout()
            updateToolbarPreview(includeToolbarConfig = false)
        }
    }

    override fun onDestroyView() {
        toolbarPreviewWebView?.apply {
            stopLoading()
            // Destroy the WebView with its bridge intact. Removing the bridge
            // first leaves page scripts holding a stale Java proxy during teardown.
            destroy()
        }
        toolbarPreviewWebView = null
        toolbarPreviewHost = null
        toolbarPreviewPreferencesView = null
        super.onDestroyView()
    }

    private fun toolbarSettingsJson(includeToolbarConfig: Boolean = true): String {
        val prefs = toolbarPreferences
        val payload = org.json.JSONObject()
        if (includeToolbarConfig) {
            payload.put(
                TOOLBAR_CONFIG_KEY,
                prefs.getString(TOOLBAR_CONFIG_KEY, defaultToolbarConfigJson())
                    ?: defaultToolbarConfigJson()
            )
            payload.put(
                TOOLBAR_FLOATING_CONFIG_KEY,
                prefs.getString(
                    TOOLBAR_FLOATING_CONFIG_KEY,
                    prefs.getString(TOOLBAR_CONFIG_KEY, defaultToolbarConfigJson())
                ) ?: prefs.getString(TOOLBAR_CONFIG_KEY, defaultToolbarConfigJson())
                    ?: defaultToolbarConfigJson()
            )
        }
        payload.put("pref_toolbar_bg_color", prefs.getString("pref_toolbar_bg_color", "default"))
        payload.put("pref_toolbar_icon_color", prefs.getString("pref_toolbar_icon_color", "default"))
        payload.put(
            "pref_toolbar_active_key_bg_color",
            prefs.getString("pref_toolbar_active_key_bg_color", "default")
        )
        payload.put(
            "pref_toolbar_toggle_closed_width",
            prefs.getInt("pref_toolbar_toggle_closed_width", 34)
        )
        payload.put(
            "pref_toolbar_toggle_closed_height",
            prefs.getInt("pref_toolbar_toggle_closed_height", 34)
        )
        payload.put(
            "pref_toolbar_floating_enabled",
            prefs.getBoolean("pref_toolbar_floating_enabled", false)
        )
        payload.put("pref_toolbar_height", prefs.getInt("pref_toolbar_height", 48))
        payload.put("pref_toolbar_padding", prefs.getInt("pref_toolbar_padding", 4))
        payload.put("pref_toolbar_floating_key_width", prefs.getInt("pref_toolbar_floating_key_width", 48))
        payload.put("pref_toolbar_floating_corner_radius", prefs.getInt("pref_toolbar_floating_corner_radius", 24))
        payload.put("pref_toolbar_show_labels", prefs.getBoolean("pref_toolbar_show_labels", false))
        payload.put("pref_toolbar_label_size", prefs.getInt("pref_toolbar_label_size", 8))
        payload.put("pref_toolbar_label_color", prefs.getString("pref_toolbar_label_color", "default"))
        payload.put("pref_app_theme", prefs.getString("pref_app_theme", "amoled"))
        return payload.toString()
    }

    private fun defaultToolbarConfigJson(): String {
        val defaultOrder = org.json.JSONArray(TOOLBAR_ITEM_IDS)
        val popupGroups = org.json.JSONObject()
        for ((groupId, itemIds) in TOOLBAR_GROUP_ITEM_IDS) {
            popupGroups.put(
                groupId,
                org.json.JSONObject()
                    .put("order", org.json.JSONArray(itemIds))
                    .put("hidden", org.json.JSONArray())
            )
        }
        return org.json.JSONObject()
            .put("version", 4)
            .put("order", defaultOrder)
            .put("hidden", org.json.JSONArray())
            .put("popupGroups", popupGroups)
            .put("holding", org.json.JSONArray(TOOLBAR_HOLDING_ITEM_IDS))
            .put("customGroups", org.json.JSONObject())
            .put("customKeys", org.json.JSONObject())
            .put("styles", org.json.JSONObject())
            .toString()
    }

    private fun updateToolbarPreview(includeToolbarConfig: Boolean = true) {
        val preview = toolbarPreviewWebView ?: return
        val payload = try {
            org.json.JSONObject.quote(toolbarSettingsJson(includeToolbarConfig))
        } catch (_: Exception) {
            return
        }
        preview.post {
            preview.evaluateJavascript(
                "window.applyToolbarSettings && window.applyToolbarSettings($payload);",
                null
            )
        }
    }

    private fun normalizeToolbarConfigForStorage(raw: String): String {
        val input = org.json.JSONObject(raw)
        val customGroups = org.json.JSONObject()
        val rawCustomGroups = input.optJSONObject("customGroups") ?: org.json.JSONObject()
        val customGroupIdPattern = Regex("""^custom-group-[a-z0-9-]{1,48}$""", RegexOption.IGNORE_CASE)
        for (id in rawCustomGroups.keys()) {
            val source = rawCustomGroups.optJSONObject(id) ?: continue
            val title = source.optString("title", "").trim().take(48)
            if (!customGroupIdPattern.matches(id) || title.isBlank()) continue
            val icon = source.optString("icon", "folder")
                .takeIf { Regex("""^[a-z0-9_-]{1,48}$""", RegexOption.IGNORE_CASE).matches(it) }
                ?: "folder"
            customGroups.put(id, org.json.JSONObject().put("title", title).put("icon", icon))
        }
        val customKeys = org.json.JSONObject()
        val rawCustomKeys = input.optJSONObject("customKeys") ?: org.json.JSONObject()
        for (id in rawCustomKeys.keys()) {
            val source = rawCustomKeys.optJSONObject(id) ?: continue
            val title = source.optString("title", "").trim().take(48)
            if (!TOOLBAR_CUSTOM_KEY_ID_PATTERN.matches(id) || title.isBlank()) continue
            val icon = source.optString("icon", "newFile")
                .takeIf { Regex("""^[a-z0-9_-]{1,48}$""", RegexOption.IGNORE_CASE).matches(it) }
                ?: "newFile"
            customKeys.put(id, org.json.JSONObject().put("title", title).put("icon", icon))
        }
        val popupActionIds = TOOLBAR_GROUP_ITEM_IDS.values.flatten().toSet()
        val validRootIds = TOOLBAR_ITEM_IDS +
            TOOLBAR_HOLDING_ITEM_IDS +
            customGroups.keys().asSequence().toList() +
            customKeys.keys().asSequence().toList()
        val validKeyIds = validRootIds + popupActionIds
        val validActionIds = validKeyIds + TOOLBAR_GESTURE_ACTION_IDS
        val groupIds = TOOLBAR_GROUP_ITEM_IDS.keys.toList() +
            customGroups.keys().asSequence().toList()
        fun normalizeToolbarActionId(
            actionId: String,
            allowOpenGroup: Boolean = false
        ): String? {
            return when {
                (actionId == TOOLBAR_OPEN_GROUP_ACTION_ID ||
                    actionId.startsWith(LEGACY_TOOLBAR_OPEN_GROUP_ACTION_PREFIX)) &&
                    allowOpenGroup -> TOOLBAR_OPEN_GROUP_ACTION_ID
                actionId == TOOLBAR_OPEN_GROUP_ACTION_ID ||
                    actionId.startsWith(LEGACY_TOOLBAR_OPEN_GROUP_ACTION_PREFIX) -> null
                actionId in validActionIds -> actionId
                else -> null
            }
        }
        for (id in customKeys.keys()) {
            val actionId = rawCustomKeys.optJSONObject(id)?.optString("actionId", "").orEmpty()
            val normalizedActionId = normalizeToolbarActionId(actionId)
            if (!normalizedActionId.isNullOrBlank() && normalizedActionId != id) {
                customKeys.optJSONObject(id)?.put("actionId", normalizedActionId)
            }
        }
        val hidden = mutableListOf<String>()
        val rawHidden = input.optJSONArray("hidden") ?: org.json.JSONArray()
        for (index in 0 until rawHidden.length()) {
            val id = rawHidden.optString(index)
            if (id in validKeyIds && id !in hidden) hidden.add(id)
        }

        val order = mutableListOf<String>()
        val rawOrder = input.optJSONArray("order") ?: org.json.JSONArray()
        for (index in 0 until rawOrder.length()) {
            val id = rawOrder.optString(index)
            if (id in validKeyIds && id !in hidden && id !in order) order.add(id)
        }
        for (id in TOOLBAR_ITEM_IDS) {
            if (id !in order && id !in hidden) order.add(id)
        }

        val popupGroups = org.json.JSONObject()
        val rawPopupGroups = input.optJSONObject("popupGroups") ?: org.json.JSONObject()
        val assignedActions = mutableSetOf<String>()
        val legacyHeldActions = mutableListOf<String>()
        for (groupId in groupIds) {
            val rawGroup = rawPopupGroups.optJSONObject(groupId) ?: org.json.JSONObject()
            val rawGroupHidden = rawGroup.optJSONArray("hidden") ?: org.json.JSONArray()
            for (index in 0 until rawGroupHidden.length()) {
                val id = rawGroupHidden.optString(index)
                if (id in validKeyIds && id !in legacyHeldActions) legacyHeldActions.add(id)
            }

            val groupOrder = mutableListOf<String>()
            val rawGroupOrder = rawGroup.optJSONArray("order") ?: org.json.JSONArray()
            for (index in 0 until rawGroupOrder.length()) {
                val id = rawGroupOrder.optString(index)
                if (id in validKeyIds && id != groupId &&
                    id !in assignedActions && id !in groupOrder) {
                    groupOrder.add(id)
                    assignedActions.add(id)
                }
            }
            if (!rawPopupGroups.has(groupId)) {
                val defaults = TOOLBAR_GROUP_ITEM_IDS[groupId].orEmpty()
                for (id in defaults) {
                    if (id !in assignedActions) {
                        groupOrder.add(id)
                        assignedActions.add(id)
                    }
                }
            }
            popupGroups.put(
                groupId,
                org.json.JSONObject()
                    .put("order", org.json.JSONArray(groupOrder))
                    .put("hidden", org.json.JSONArray())
            )
        }
        sanitizeToolbarGroupCycles(popupGroups, groupIds)
        assignedActions.clear()
        for (groupId in groupIds) {
            val items = popupGroups.optJSONObject(groupId)?.optJSONArray("order")
                ?: org.json.JSONArray()
            for (index in 0 until items.length()) {
                assignedActions.add(items.optString(index))
            }
        }

        val rawHoldingActions = input.optJSONArray("holding") ?: org.json.JSONArray()

        val holding = mutableListOf<String>()
        val rawHolding = rawHoldingActions
        for (index in 0 until rawHolding.length()) {
            val id = rawHolding.optString(index)
            if (id in validKeyIds && id !in assignedActions && id !in holding) holding.add(id)
        }
        for (id in TOOLBAR_HOLDING_ITEM_IDS) {
            if (id !in order && id !in assignedActions && id !in holding) {
                holding.add(id)
            }
        }
        for (id in legacyHeldActions) {
            if (id !in assignedActions && id !in holding) holding.add(id)
        }
        for (groupId in groupIds) {
            if (input.optInt("version", 1) >= 3 || groupId !in hidden) continue
            val group = popupGroups.optJSONObject(groupId) ?: continue
            val items = group.optJSONArray("order") ?: org.json.JSONArray()
            for (index in 0 until items.length()) {
                val id = items.optString(index)
                assignedActions.remove(id)
                if (id !in holding) holding.add(id)
            }
            group.put("order", org.json.JSONArray())
        }
        order.removeAll { it in assignedActions || it in holding }
        for (id in validKeyIds) {
            if (id !in assignedActions && id !in holding && id !in order &&
                (id in popupActionIds || id in customGroups.keys().asSequence().toList())) {
                holding.add(id)
            }
        }
        for (groupId in groupIds) {
            val group = popupGroups.optJSONObject(groupId) ?: continue
            if (group.optJSONArray("order")?.length() == 0 && groupId !in assignedActions) {
                order.remove(groupId)
                if (groupId !in holding) holding.add(groupId)
                if (groupId !in hidden) hidden.add(groupId)
            }
        }
        for (id in validRootIds) {
            if (id in assignedActions || id in holding || id in order) continue
            if (popupGroups.has(id) && popupGroups.optJSONObject(id)
                    ?.optJSONArray("order")?.length() == 0) {
                holding.add(id)
                hidden.add(id)
            } else if (id !in hidden) {
                order.add(id)
            }
        }
        order.removeAll { it in assignedActions || it in holding }
        if (order.isEmpty()) {
            for (groupId in groupIds) {
                val group = popupGroups.optJSONObject(groupId) ?: continue
                val children = group.optJSONArray("order") ?: org.json.JSONArray()
                val retained = org.json.JSONArray()
                for (index in 0 until children.length()) {
                    val id = children.optString(index)
                    if (id != "menu") retained.put(id)
                }
                group.put("order", retained)
            }
            assignedActions.remove("menu")
            holding.remove("menu")
            hidden.remove("menu")
            order.add("menu")
        }
        hidden.clear()
        for (id in holding) {
            if (id in validRootIds && id !in hidden) hidden.add(id)
        }

        val styles = org.json.JSONObject()
        val rawStyles = input.optJSONObject("styles") ?: org.json.JSONObject()
        val safeColor = Regex(
            """^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)|[A-Za-z]{1,20})$"""
        )
        for (id in TOOLBAR_STYLE_IDS +
            customGroups.keys().asSequence().toList() +
            customKeys.keys().asSequence().toList()) {
            val style = rawStyles.optJSONObject(id) ?: continue
            val cleanedStyle = org.json.JSONObject()
            for (property in TOOLBAR_COLOR_PROPERTIES) {
                val color = style.optString(property, "")
                if (color.isNotBlank() && safeColor.matches(color.trim())) {
                    cleanedStyle.put(property, color.trim())
                }
            }
            val customSvg = style.optString("customSvg", "")
            if (customSvg.isNotBlank() && isSafeToolbarSvg(customSvg)) {
                cleanedStyle.put("customSvg", customSvg)
                cleanedStyle.put(
                    "preserveSvgColors",
                    style.optBoolean("preserveSvgColors", false)
                )
            }
            if (style.has("forceShowLabel")) {
                cleanedStyle.put("forceShowLabel", style.optBoolean("forceShowLabel", false))
            }
            val title = style.optString("title", "").trim().take(48)
            if (title.isNotBlank()) cleanedStyle.put("title", title)
            val gestureActions = org.json.JSONObject()
            val rawGestureActions = style.optJSONObject("gestureActions") ?: org.json.JSONObject()
            for (gestureId in TOOLBAR_GESTURE_IDS) {
                val actionId = normalizeToolbarActionId(
                    rawGestureActions.optString(gestureId, ""),
                    allowOpenGroup = popupGroups.has(id)
                )
                if (actionId != null) gestureActions.put(gestureId, actionId)
            }
            val legacyGestureAction =
                normalizeToolbarActionId(
                    style.optString("gestureAction", ""),
                    allowOpenGroup = popupGroups.has(id)
                )
            if (!gestureActions.has("swipeUp") && legacyGestureAction != null) {
                gestureActions.put("swipeUp", legacyGestureAction)
            }
            if (gestureActions.length() > 0) {
                cleanedStyle.put("gestureActions", gestureActions)
            }

            val gestureActionIcons = org.json.JSONObject()
            val rawGestureIcons = style.optJSONObject("gestureActionIcons") ?: org.json.JSONObject()
            for (gestureId in TOOLBAR_GESTURE_IDS) {
                if (!gestureActions.has(gestureId)) continue
                val iconSvg = rawGestureIcons.optString(gestureId, "")
                if (iconSvg.isNotBlank() && isSafeToolbarSvg(iconSvg)) {
                    gestureActionIcons.put(gestureId, iconSvg)
                }
            }
            if (!gestureActionIcons.has("swipeUp") && gestureActions.has("swipeUp")) {
                val legacyIcon = style.optString("gestureActionIconSvg", "")
                if (legacyIcon.isNotBlank() && isSafeToolbarSvg(legacyIcon)) {
                    gestureActionIcons.put("swipeUp", legacyIcon)
                }
            }
            if (gestureActionIcons.length() > 0) {
                cleanedStyle.put("gestureActionIcons", gestureActionIcons)
            }
            if (cleanedStyle.length() > 0) styles.put(id, cleanedStyle)
        }

        return org.json.JSONObject()
            .put("version", 4)
            .put("order", org.json.JSONArray(order))
            .put("hidden", org.json.JSONArray(hidden))
            .put("popupGroups", popupGroups)
            .put("holding", org.json.JSONArray(holding))
            .put("customGroups", customGroups)
            .put("customKeys", customKeys)
            .put("styles", styles)
            .toString()
    }

    private fun sanitizeToolbarGroupCycles(
        groups: org.json.JSONObject,
        groupIds: List<String>
    ) {
        val groupIdSet = groupIds.toSet()
        val acceptedChildren = mutableMapOf<String, MutableList<String>>()

        fun hasPath(start: String, target: String, visited: MutableSet<String>): Boolean {
            if (start == target) return true
            if (!visited.add(start)) return false
            return acceptedChildren[start].orEmpty().any { child ->
                hasPath(child, target, visited)
            }
        }

        for (groupId in groupIds) {
            val group = groups.optJSONObject(groupId) ?: continue
            val rawOrder = group.optJSONArray("order") ?: org.json.JSONArray()
            val safeOrder = org.json.JSONArray()
            for (index in 0 until rawOrder.length()) {
                val childId = rawOrder.optString(index)
                if (childId in groupIdSet && hasPath(childId, groupId, mutableSetOf())) {
                    continue
                }
                safeOrder.put(childId)
                if (childId in groupIdSet) {
                    acceptedChildren.getOrPut(groupId) { mutableListOf() }.add(childId)
                }
            }
            group.put("order", safeOrder)
        }
    }

    private fun isSafeToolbarSvg(svg: String): Boolean {
        if (svg.toByteArray(Charsets.UTF_8).size > MAX_TOOLBAR_SVG_BYTES) return false
        val trimmed = svg.trim()
        val lower = trimmed.lowercase()
        if (!lower.contains("<svg")) return false
        val forbidden = listOf(
            "<script", "foreignobject", "javascript:", "data:", "<embed", "<object",
            "<iframe", "<image", "<style", "url("
        )
        if (forbidden.any(lower::contains)) return false
        if (Regex("""\bon[a-z]+\s*=""", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) {
            return false
        }
        return try {
            com.caverock.androidsvg.SVG.getFromString(trimmed)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun saveToolbarConfig(
        raw: String,
        updatePreview: Boolean = true,
        flushToDisk: Boolean = true
    ): Boolean {
        toolbarSaveFailureReason = "unknown"
        val normalized = try {
            normalizeToolbarConfigForStorage(raw)
        } catch (error: Exception) {
            toolbarSaveFailureReason = "invalid_config"
            android.util.Log.e("ToolbarSettings", "Failed to normalize toolbar layout", error)
            return false
        }
        val saved = try {
            val editor = toolbarPreferences.edit()
                .putString(toolbarConfigPreferenceKey, normalized)
            if (flushToDisk) editor.commit() else {
                editor.apply()
                true
            }
        } catch (error: Exception) {
            toolbarSaveFailureReason = "preference_write_error"
            android.util.Log.e("ToolbarSettings", "Failed to write toolbar layout preferences", error)
            return false
        }
        if (!saved) {
            toolbarSaveFailureReason = "commit_failed"
            android.util.Log.e("ToolbarSettings", "SharedPreferences commit failed for toolbar layout")
            return false
        }
        if (updatePreview) {
            try {
                updateToolbarPreview()
            } catch (error: Exception) {
                android.util.Log.e("ToolbarSettings", "Toolbar layout saved but preview refresh failed", error)
            }
        }
        toolbarSaveFailureReason = "saved"
        return true
    }

    private fun isToolbarStyleAllowed(itemId: String): Boolean {
        if (itemId in TOOLBAR_STYLE_IDS) return true
        val isCustomGroup = Regex(
            """^custom-group-[a-z0-9-]{1,48}$""",
            RegexOption.IGNORE_CASE
        ).matches(itemId)
        if (!isCustomGroup && !TOOLBAR_CUSTOM_KEY_ID_PATTERN.matches(itemId)) {
            return false
        }
        return runCatching {
            val saved = org.json.JSONObject(
                toolbarPreferences.getString(toolbarConfigPreferenceKey, defaultToolbarConfigJson())
                    ?: defaultToolbarConfigJson()
            )
            saved.optJSONObject("customGroups")?.has(itemId) == true ||
                saved.optJSONObject("customKeys")?.has(itemId) == true
        }.getOrDefault(false)
    }

    private fun updateToolbarStyle(
        itemId: String,
        property: String,
        value: String?
    ): Boolean {
        if (!isToolbarStyleAllowed(itemId)) return false
        val gestureIconMatch = Regex(
            """^gestureActionIconSvg:(longPress|tap1|tap2|tap3|swipeUp|swipeDown|swipeLeft|swipeRight|swipeUpLeft|swipeUpRight|swipeDownLeft|swipeDownRight)$"""
        ).matchEntire(property)
        if (
            property !in TOOLBAR_COLOR_PROPERTIES &&
            property != "customSvg" &&
            property != "gestureActionIconSvg" &&
            gestureIconMatch == null
        ) return false
        return try {
            val current = org.json.JSONObject(
                toolbarPreferences.getString(toolbarConfigPreferenceKey, defaultToolbarConfigJson())
                    ?: defaultToolbarConfigJson()
            )
            val styles = current.optJSONObject("styles") ?: org.json.JSONObject()
            val style = styles.optJSONObject(itemId) ?: org.json.JSONObject()
            if (gestureIconMatch != null) {
                val gestureId = gestureIconMatch.groupValues[1]
                val icons = style.optJSONObject("gestureActionIcons") ?: org.json.JSONObject()
                val safeValue = value?.takeIf { it.isNotBlank() }
                if (safeValue == null) icons.remove(gestureId)
                else if (isSafeToolbarSvg(safeValue)) icons.put(gestureId, safeValue)
                else return false
                if (icons.length() == 0) style.remove("gestureActionIcons")
                else style.put("gestureActionIcons", icons)
            } else if (value.isNullOrBlank()) {
                style.remove(property)
            } else {
                style.put(property, value)
            }
            if (style.length() == 0) styles.remove(itemId) else styles.put(itemId, style)
            current.put("styles", styles)
            saveToolbarConfig(current.toString())
        } catch (_: Exception) {
            false
        }
    }

    private fun showToolbarSvgChooser(itemId: String, property: String = "customSvg") {
        targetToolbarIconId = itemId
        targetToolbarIconProperty = property
        AlertDialog.Builder(requireContext())
            .setTitle("Custom toolbar icon")
            .setItems(arrayOf("Choose SVG file", "Paste SVG code", "Use default icon")) { _, which ->
                when (which) {
                    0 -> chooseToolbarSvgFile(itemId, property)
                    1 -> pasteToolbarSvg(itemId, property)
                    else -> updateToolbarStyle(itemId, property, null)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun chooseToolbarSvgFile(itemId: String, property: String = "customSvg") {
        targetToolbarIconId = itemId
        targetToolbarIconProperty = property
        pickToolbarSvgLauncher.launch(
            arrayOf("image/svg+xml", "text/xml", "application/xml", "*/*")
        )
    }

    private fun pasteToolbarSvg(itemId: String, property: String = "customSvg") {
        targetToolbarIconId = itemId
        targetToolbarIconProperty = property
        showPasteToolbarSvgDialog()
    }

    private fun runToolbarSvgAction(
        itemId: String,
        property: String = "customSvg",
        action: () -> Unit
    ) {
        val host = activity ?: return
        host.runOnUiThread {
            if (!isAdded) return@runOnUiThread
            if (!isToolbarStyleAllowed(itemId)) {
                ThemedToast.show(host, "Select a toolbar key before editing its icon")
                return@runOnUiThread
            }
            targetToolbarIconId = itemId
            targetToolbarIconProperty = property
            try {
                action()
            } catch (error: Exception) {
                ThemedToast.show(
                    host,
                    error.localizedMessage ?: "Could not open the SVG action"
                )
            }
        }
    }

    private fun showPasteToolbarSvgDialog() {
        val input = android.widget.EditText(requireContext()).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            setLines(6)
        }
        val padding = (16 * resources.displayMetrics.density).toInt()
        val container = android.widget.FrameLayout(requireContext()).apply {
            setPadding(padding, padding / 2, padding, padding / 2)
            addView(input)
        }
        AlertDialog.Builder(requireContext())
            .setTitle("Paste SVG code")
            .setView(container)
            .setPositiveButton("Save") { _, _ ->
                val svg = input.text.toString().trim()
                val itemId = targetToolbarIconId
                if (itemId == null || svg.isBlank() || !isSafeToolbarSvg(svg)) {
                    ThemedToast.show(requireContext(), "Invalid or unsafe SVG icon")
                } else if (updateToolbarStyle(itemId, targetToolbarIconProperty, svg)) {
                    ThemedToast.show(requireContext(), "Toolbar icon updated")
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun handleToolbarSvgPicked(uri: Uri) {
        val itemId = targetToolbarIconId ?: return
        try {
            val svg = requireContext().contentResolver.openInputStream(uri)?.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                var total = 0
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    if (total > MAX_TOOLBAR_SVG_BYTES) {
                        throw IllegalArgumentException("SVG file exceeds 64 KB")
                    }
                    output.write(buffer, 0, read)
                }
                output.toString(Charsets.UTF_8.name())
            } ?: return
            if (!isSafeToolbarSvg(svg)) {
                ThemedToast.show(requireContext(), "Invalid or unsafe SVG icon")
                return
            }
            if (updateToolbarStyle(itemId, targetToolbarIconProperty, svg)) {
                ThemedToast.show(requireContext(), "Toolbar icon updated")
            }
        } catch (error: Exception) {
            ThemedToast.show(
                requireContext(),
                error.message ?: "Could not read the SVG file"
            )
        }
    }

    inner class ToolbarPreviewBridge {
        @android.webkit.JavascriptInterface
        fun getBottomToolbarSettings(): String = toolbarSettingsJson()

        @android.webkit.JavascriptInterface
        fun setToolbarSurface(surface: String) {
            toolbarConfigPreferenceKey = if (surface == "floating") {
                TOOLBAR_FLOATING_CONFIG_KEY
            } else {
                TOOLBAR_CONFIG_KEY
            }
        }

        @android.webkit.JavascriptInterface
        fun collapseToolbarAppearance() {
            activity?.runOnUiThread { collapseToolbarAppearanceSettings() }
        }

        @android.webkit.JavascriptInterface
        fun saveBottomToolbarConfig(raw: String): String =
            try {
                if (saveToolbarConfig(raw, updatePreview = false, flushToDisk = true)) {
                    "saved"
                } else {
                    toolbarSaveFailureReason
                }
            } catch (error: Exception) {
                toolbarSaveFailureReason = "bridge_error"
                android.util.Log.e("ToolbarSettings", "Toolbar save bridge failed unexpectedly", error)
                "bridge_error"
            }

        @android.webkit.JavascriptInterface
        fun pickBottomToolbarColor(itemId: String, property: String) {
            if (!isToolbarStyleAllowed(itemId) || property !in TOOLBAR_COLOR_PROPERTIES) return
            activity?.runOnUiThread {
                val config = org.json.JSONObject(
                    toolbarPreferences.getString(toolbarConfigPreferenceKey, defaultToolbarConfigJson())
                        ?: defaultToolbarConfigJson()
                )
                val current = config.optJSONObject("styles")
                    ?.optJSONObject(itemId)
                    ?.optString(property)
                    ?.takeIf { !it.isNullOrBlank() }
                    ?: when (property) {
                        "iconColor" -> toolbarPreferences.getString("pref_toolbar_icon_color", "#FFFFFF")
                        else -> "#00000000"
                    }
                    ?: "#FFFFFF"
                ColorPickerDialog(requireContext(), current) { selected ->
                    updateToolbarStyle(itemId, property, selected)
                }.show()
            }
        }

        @android.webkit.JavascriptInterface
        fun editBottomToolbarIcon(request: String) {
            val payload = if (request.trimStart().startsWith("{")) {
                runCatching { org.json.JSONObject(request) }.getOrNull()
            } else {
                null
            }
            val itemId = payload?.optString("itemId")
                ?.takeIf { it.isNotBlank() }
                ?: request
            val action = payload?.optString("action") ?: "chooser"
            val property = payload?.optString("property")
                ?.takeIf {
                    it == "gestureActionIconSvg" ||
                        Regex(
                            """^gestureActionIconSvg:(longPress|tap1|tap2|tap3|swipeUp|swipeDown|swipeLeft|swipeRight|swipeUpLeft|swipeUpRight|swipeDownLeft|swipeDownRight)$"""
                        ).matches(it)
                }
                ?: "customSvg"
            runToolbarSvgAction(itemId, property) {
                when (action) {
                    "paste" -> pasteToolbarSvg(itemId, property)
                    "file" -> chooseToolbarSvgFile(itemId, property)
                    else -> showToolbarSvgChooser(itemId, property)
                }
            }
        }
    }
}

class StylingCursorFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_cursor, rootKey)
    }
}

class StylingFindReplaceFragment : StylingSettingsFragment() {

    private var selectedCategoryKey: String = "category_panel"
    private var isPreviewAttached: Boolean = false

    private val DEFAULT_ROW1_ORDER = "prev,next,highlight,regex,close"
    private val DEFAULT_ROW2_ORDER = "replace-one,replace-all,case,word"
    private val KNOWN_ROW1_DEFAULTS = listOf("prev", "next", "highlight", "regex", "close")
    private val KNOWN_ROW2_DEFAULTS = listOf("replace-one", "replace-all", "case", "word")
    private val KNOWN_BUTTON_IDS = listOf("prev", "next", "highlight", "regex", "close", "replace-one", "replace-all", "case", "word")

    private val PREF_KEY_BUTTON_ROW1 = "pref_findreplace_button_row1"
    private val PREF_KEY_BUTTON_ROW2 = "pref_findreplace_button_row2"
    private val PREF_KEY_OLD_ORDER = "pref_findreplace_button_order"
    private val PREF_KEY_HIDDEN_BUTTONS = "pref_findreplace_hidden_buttons"

    private val buttonPreferenceSuffix = mapOf(
        "prev" to "prev",
        "next" to "next",
        "highlight" to "highlight",
        "regex" to "regex",
        "close" to "close",
        "replace-one" to "replace_one",
        "replace-all" to "replace_all",
        "case" to "case",
        "word" to "word"
    )

    private var targetSvgPrefKey: String? = null

    private val pickSvgLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { handleSvgPicked(it) }
    }

    private var previewCardView: android.widget.LinearLayout? = null
    private var previewFindField: android.widget.TextView? = null
    private var previewReplaceField: android.widget.TextView? = null
    private var previewCounter: android.widget.TextView? = null
    private var row1GroupView: android.widget.LinearLayout? = null
    private var row2GroupView: android.widget.LinearLayout? = null
    private var hiddenTrayView: android.widget.LinearLayout? = null
    private var hiddenChipsContainer: android.view.View? = null

    private val previewButtonMap = mutableMapOf<String, android.widget.TextView>()
    private val originalButtonTextMap = mutableMapOf<String, String>()

    private fun isValidAndSafeSvg(svgStr: String): Boolean {
        val trimmed = svgStr.trim()
        val lower = trimmed.lowercase()
        if (!lower.contains("<svg")) return false
        val forbidden = listOf("<script", "foreignobject", "javascript:", "data:", "<embed", "<object", "<iframe")
        if (forbidden.any { lower.contains(it) }) return false
        val onHandlerRegex = Regex("""\bon[a-z]+\s*=""", RegexOption.IGNORE_CASE)
        if (onHandlerRegex.containsMatchIn(trimmed)) return false
        return true
    }

    private fun parseAndNormalizeRows(prefs: SharedPreferences): Pair<MutableList<String>, MutableList<String>> {
        var rawRow1 = prefs.getString(PREF_KEY_BUTTON_ROW1, null)
        var rawRow2 = prefs.getString(PREF_KEY_BUTTON_ROW2, null)

        if (rawRow1 == null && rawRow2 == null) {
            val oldOrderStr = prefs.getString(PREF_KEY_OLD_ORDER, null)
            if (oldOrderStr != null) {
                val oldItems = oldOrderStr.split(",").map { it.trim() }.filter { it in KNOWN_BUTTON_IDS }
                val dedupped = mutableListOf<String>()
                oldItems.forEach { if (it !in dedupped) dedupped.add(it) }
                val r1 = dedupped.take(5)
                val r2 = dedupped.drop(5)
                rawRow1 = r1.joinToString(",")
                rawRow2 = r2.joinToString(",")
                prefs.edit()
                    .putString(PREF_KEY_BUTTON_ROW1, rawRow1)
                    .putString(PREF_KEY_BUTTON_ROW2, rawRow2)
                    .apply()
            }
        }

        val r1Items = rawRow1?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
        val r2Items = rawRow2?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()

        val row1 = mutableListOf<String>()
        val row2 = mutableListOf<String>()
        val seen = mutableSetOf<String>()

        for (id in r1Items) {
            if (id in KNOWN_BUTTON_IDS && id !in seen) {
                row1.add(id)
                seen.add(id)
            }
        }

        for (id in r2Items) {
            if (id in KNOWN_BUTTON_IDS && id !in seen) {
                row2.add(id)
                seen.add(id)
            }
        }

        for (id in KNOWN_ROW1_DEFAULTS) {
            if (id !in seen) {
                row1.add(id)
                seen.add(id)
            }
        }
        for (id in KNOWN_ROW2_DEFAULTS) {
            if (id !in seen) {
                row2.add(id)
                seen.add(id)
            }
        }

        return Pair(row1, row2)
    }

    private fun parseHiddenButtons(rawHidden: String?): MutableSet<String> {
        val items = rawHidden?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
        return items.filter { it in KNOWN_BUTTON_IDS }.toMutableSet()
    }

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_findreplace, rootKey)
    }

    override fun onPreferenceTreeClick(preference: Preference): Boolean {
        val key = preference.key
        if (key != null && key.startsWith("pref_findreplace_btn_") && key.endsWith("_svg")) {
            showSvgSourceChooser(key)
            return true
        }
        return super.onPreferenceTreeClick(preference)
    }

    override fun onDisplayPreferenceDialog(preference: Preference) {
        val key = preference.key
        if (key != null && key.startsWith("pref_findreplace_btn_") && key.endsWith("_svg")) {
            showSvgSourceChooser(key)
            return
        }
        super.onDisplayPreferenceDialog(preference)
    }

    private fun showSvgSourceChooser(key: String) {
        targetSvgPrefKey = key
        val context = context ?: return
        AlertDialog.Builder(context)
            .setTitle("Custom SVG Icon")
            .setItems(arrayOf("Choose SVG File", "Paste SVG Code")) { _, which ->
                if (which == 0) {
                    pickSvgLauncher.launch(arrayOf("image/svg+xml", "text/xml", "application/xml", "*/*"))
                } else {
                    showPasteSvgDialog(key)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showPasteSvgDialog(key: String) {
        val context = context ?: return
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val currentSvg = prefs.getString(key, "") ?: ""

        val input = android.widget.EditText(context).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            setLines(6)
            setText(currentSvg)
            setSelection(text.length)
        }

        val container = android.widget.FrameLayout(context).apply {
            val density = context.resources.displayMetrics.density
            setPadding((16 * density).toInt(), (8 * density).toInt(), (16 * density).toInt(), (8 * density).toInt())
            addView(input)
        }

        AlertDialog.Builder(context)
            .setTitle("Paste SVG Code")
            .setView(container)
            .setPositiveButton("Save") { _, _ ->
                val newSvg = input.text.toString().trim()
                if (newSvg.isNotBlank()) {
                    if (newSvg.toByteArray(Charsets.UTF_8).size > 64 * 1024) {
                        ThemedToast.show(context, "SVG code exceeds 64 KB limit")
                        return@setPositiveButton
                    }
                    if (!isValidAndSafeSvg(newSvg)) {
                        ThemedToast.show(context, "Invalid or unsafe SVG code")
                        return@setPositiveButton
                    }
                    try {
                        com.caverock.androidsvg.SVG.getFromString(newSvg)
                    } catch (e: Exception) {
                        ThemedToast.show(context, "Cannot parse SVG code")
                        return@setPositiveButton
                    }
                }
                prefs.edit().putString(key, newSvg).apply()
                val pref = findPreference<Preference>(key)
                if (newSvg.isNotBlank()) {
                    pref?.summary = "Custom SVG code saved"
                } else {
                    pref?.summary = "Choose an SVG file or paste SVG code"
                }
                refreshFindReplacePreview(prefs)
                ThemedToast.show(context, if (newSvg.isNotBlank()) "Custom SVG updated" else "Custom SVG cleared")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun handleSvgPicked(uri: Uri) {
        val key = targetSvgPrefKey ?: return
        val context = context ?: return
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)

        try {
            val inputStream = context.contentResolver.openInputStream(uri) ?: return
            val bytes = inputStream.use { it.readBytes() }
            if (bytes.size > 64 * 1024) {
                ThemedToast.show(context, "SVG file exceeds 64 KB limit")
                return
            }
            val svgStr = String(bytes, Charsets.UTF_8)
            if (!isValidAndSafeSvg(svgStr)) {
                ThemedToast.show(context, "Invalid or unsafe SVG file")
                return
            }
            com.caverock.androidsvg.SVG.getFromString(svgStr)

            val fileName = getFileName(uri) ?: "custom.svg"
            prefs.edit().putString(key, svgStr).apply()

            findPreference<Preference>(key)?.summary = "Custom SVG: $fileName"
            refreshFindReplacePreview(prefs)
            ThemedToast.show(context, "Loaded SVG from $fileName")
        } catch (e: Exception) {
            ThemedToast.show(context, "Failed to load SVG: ${e.localizedMessage}")
        }
    }

    override fun onViewCreated(view: android.view.View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupInteractivePreview(view)
        filterCategories()
        val ctx = context
        if (ctx != null) {
            val prefs = PreferenceManager.getDefaultSharedPreferences(ctx)
            for (id in KNOWN_BUTTON_IDS) {
                val suffix = buttonPreferenceSuffix[id] ?: id.replace("-", "_")
                val key = "pref_findreplace_btn_${suffix}_svg"
                val svgVal = prefs.getString(key, "") ?: ""
                if (svgVal.isNotBlank()) {
                    findPreference<Preference>(key)?.summary = "Custom SVG loaded"
                }
            }
            refreshFindReplacePreview(prefs)
        }
    }

    override fun onSettingPreferenceChanged(
        sharedPreferences: SharedPreferences,
        key: String
    ) {
        if (key.startsWith("pref_findreplace_")) {
            refreshFindReplacePreview(sharedPreferences)
        }
    }

    private fun refreshFindReplacePreview(prefs: SharedPreferences) {
        val card = previewCardView ?: return
        val panelBgHex = prefs.getString("pref_findreplace_panel_bg", "default") ?: "default"
        val panelBg = if (panelBgHex == "default") Color.parseColor("#121212") else ColorPickerDialog.parseHexColor(panelBgHex, Color.parseColor("#121212"))
        card.setBackgroundColor(panelBg)

        val findBgHex = prefs.getString("pref_findreplace_field_find_bg", "default") ?: "default"
        val findColorHex = prefs.getString("pref_findreplace_field_find_color", "default") ?: "default"

        previewFindField?.apply {
            setBackgroundColor(if (findBgHex == "default") Color.parseColor("#1E1E1E") else ColorPickerDialog.parseHexColor(findBgHex, Color.parseColor("#1E1E1E")))
            setTextColor(if (findColorHex == "default") Color.parseColor("#888888") else ColorPickerDialog.parseHexColor(findColorHex, Color.parseColor("#888888")))
        }

        val replaceBgHex = prefs.getString("pref_findreplace_field_replace_bg", "default") ?: "default"
        val replaceColorHex = prefs.getString("pref_findreplace_field_replace_color", "default") ?: "default"

        previewReplaceField?.apply {
            setBackgroundColor(if (replaceBgHex == "default") Color.parseColor("#1E1E1E") else ColorPickerDialog.parseHexColor(replaceBgHex, Color.parseColor("#1E1E1E")))
            setTextColor(if (replaceColorHex == "default") Color.parseColor("#888888") else ColorPickerDialog.parseHexColor(replaceColorHex, Color.parseColor("#888888")))
        }

        val counterColorHex = prefs.getString("pref_findreplace_counter_color", "default") ?: "default"
        previewCounter?.setTextColor(if (counterColorHex == "default") Color.parseColor("#888888") else ColorPickerDialog.parseHexColor(counterColorHex, Color.parseColor("#888888")))
        val counterBgHex = prefs.getString("pref_findreplace_counter_bg", "default") ?: "default"
        previewCounter?.setBackgroundColor(
            if (counterBgHex == "default") Color.TRANSPARENT
            else ColorPickerDialog.parseHexColor(counterBgHex, Color.TRANSPARENT)
        )

        val (row1List, row2List) = parseAndNormalizeRows(prefs)
        val hiddenSet = parseHiddenButtons(prefs.getString(PREF_KEY_HIDDEN_BUTTONS, ""))

        val row1Ids = row1List.filter { it !in hiddenSet }
        val row2Ids = row2List.filter { it !in hiddenSet }

        val g1 = row1GroupView
        val g2 = row2GroupView
        if (g1 != null && g2 != null) {
            g1.removeAllViews()
            g2.removeAllViews()

            row1Ids.forEach { id ->
                val btn = previewButtonMap[id]
                if (btn != null) {
                    (btn.parent as? android.view.ViewGroup)?.removeView(btn)
                    g1.addView(btn)
                }
            }

            row2Ids.forEach { id ->
                val btn = previewButtonMap[id]
                if (btn != null) {
                    (btn.parent as? android.view.ViewGroup)?.removeView(btn)
                    g2.addView(btn)
                }
            }
        }

        // Populate hidden tray chips
        val chipBox = hiddenChipsContainer as? android.widget.GridLayout
        val ctx = context
        if (chipBox != null && ctx != null) {
            chipBox.removeAllViews()
            val density = ctx.resources.displayMetrics.density
            (chipBox.parent as? android.widget.ScrollView)?.let { chipsScroll ->
                chipsScroll.layoutParams = chipsScroll.layoutParams.apply {
                    height = ((if (hiddenSet.isEmpty()) 24 else 120) * density).toInt()
                }
            }
            if (hiddenSet.isEmpty()) {
                val emptyTv = android.widget.TextView(ctx).apply {
                    text = "(No hidden buttons)"
                    textSize = 11f
                    setTextColor(Color.parseColor("#666666"))
                }
                chipBox.addView(emptyTv)
            } else {
                hiddenSet.forEach { hid ->
                    val labelText = when (hid) {
                        "prev" -> "▲ Prev"
                        "next" -> "▼ Next"
                        "highlight" -> "≡ Highlight"
                        "regex" -> ".* Regex"
                        "close" -> "✕ Close"
                        "replace-one" -> "1➔ Replace 1"
                        "replace-all" -> "∀➔ Replace All"
                        "case" -> "Aa Case"
                        "word" -> "\\b Word"
                        else -> hid
                    }
                    val chip = android.widget.TextView(ctx).apply {
                        text = "+ $labelText"
                        textSize = 11f
                        setTextColor(Color.WHITE)
                        setBackgroundColor(Color.parseColor("#0078D4"))
                        setPadding((6 * density).toInt(), (4 * density).toInt(), (6 * density).toInt(), (4 * density).toInt())
                        gravity = android.view.Gravity.CENTER
                        layoutParams = android.widget.GridLayout.LayoutParams().apply {
                            width = 0
                            columnSpec = android.widget.GridLayout.spec(android.widget.GridLayout.UNDEFINED, 1f)
                            setMargins((3 * density).toInt(), (3 * density).toInt(), (3 * density).toInt(), (3 * density).toInt())
                        }
                        setOnClickListener {
                            val curHidden = parseHiddenButtons(prefs.getString(PREF_KEY_HIDDEN_BUTTONS, ""))
                            curHidden.remove(hid)
                            prefs.edit().putString(PREF_KEY_HIDDEN_BUTTONS, curHidden.joinToString(",")).apply()
                            refreshFindReplacePreview(prefs)
                            ThemedToast.show(ctx, "Restored $hid button")
                        }
                    }
                    chipBox.addView(chip)
                }
            }
        }

        previewButtonMap.forEach { (domId, btnView) ->
            val suffix = buttonPreferenceSuffix[domId] ?: domId.replace("-", "_")
            val btnBgHex = prefs.getString("pref_findreplace_btn_${suffix}_bg", "default") ?: "default"
            val btnColorHex = prefs.getString("pref_findreplace_btn_${suffix}_color", "default") ?: "default"
            val customSvg = prefs.getString("pref_findreplace_btn_${suffix}_svg", "") ?: ""
            val density = btnView.context.resources.displayMetrics.density
            val iconWidth = prefs.getInt("pref_findreplace_btn_${suffix}_width", 28)
            (btnView.layoutParams as? android.widget.LinearLayout.LayoutParams)?.let { params ->
                params.width = (iconWidth * density).toInt()
                btnView.layoutParams = params
            }

            btnView.setBackgroundColor(if (btnBgHex == "default") Color.parseColor("#1E1E1E") else ColorPickerDialog.parseHexColor(btnBgHex, Color.parseColor("#1E1E1E")))

            val defaultIconColor = Color.parseColor("#AAAAAA")
            val iconColor = if (btnColorHex == "default") {
                defaultIconColor
            } else {
                ColorPickerDialog.parseHexColor(btnColorHex, defaultIconColor)
            }
            btnView.setTextColor(iconColor)

            val originalText = originalButtonTextMap[domId] ?: btnView.text.toString()
            if (customSvg.isNotBlank() && isValidAndSafeSvg(customSvg)) {
                try {
                    val svg = com.caverock.androidsvg.SVG.getFromString(customSvg)
                    val sizePx = (18 * density).toInt()
                    svg.documentWidth = sizePx.toFloat()
                    svg.documentHeight = sizePx.toFloat()

                    val sourceBitmap = android.graphics.Bitmap.createBitmap(
                        sizePx,
                        sizePx,
                        android.graphics.Bitmap.Config.ARGB_8888
                    )
                    val sourceCanvas = android.graphics.Canvas(sourceBitmap)
                    svg.renderToCanvas(sourceCanvas)

                    val tintedBitmap = android.graphics.Bitmap.createBitmap(
                        sizePx,
                        sizePx,
                        android.graphics.Bitmap.Config.ARGB_8888
                    )
                    val tintPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                        colorFilter = android.graphics.PorterDuffColorFilter(
                            iconColor,
                            android.graphics.PorterDuff.Mode.SRC_IN
                        )
                    }
                    android.graphics.Canvas(tintedBitmap).drawBitmap(sourceBitmap, 0f, 0f, tintPaint)
                    sourceBitmap.recycle()

                    val drawable = android.graphics.drawable.BitmapDrawable(
                        btnView.resources,
                        tintedBitmap
                    ).apply {
                        setBounds(0, 0, sizePx, sizePx)
                    }
                    btnView.text = ""
                    btnView.setCompoundDrawables(drawable, null, null, null)
                } catch (e: Exception) {
                    btnView.text = originalText
                    btnView.setCompoundDrawables(null, null, null, null)
                }
            } else {
                btnView.text = originalText
                btnView.setCompoundDrawables(null, null, null, null)
            }
        }

        val fieldHeightPx = (prefs.getInt("pref_findreplace_field_height", 32) *
            (context?.resources?.displayMetrics?.density ?: 1f)).toInt()
        listOf(previewFindField, previewReplaceField).forEach { field ->
            field?.layoutParams = field?.layoutParams?.apply { height = fieldHeightPx }
        }
    }

    private fun filterCategories() {
        val screen = preferenceScreen ?: return
        if (!isPreviewAttached) {
            for (i in 0 until screen.preferenceCount) {
                screen.getPreference(i).isVisible = true
            }
            return
        }

        for (i in 0 until screen.preferenceCount) {
            val pref = screen.getPreference(i)
            if (pref.key != null && pref.key.startsWith("category_")) {
                pref.isVisible = (pref.key == selectedCategoryKey)
            }
        }
        listView?.post { listView?.scrollToPosition(0) }
    }

    private fun setupInteractivePreview(fragmentRootView: android.view.View) {
        val listView = listView ?: return
        val context = context ?: return
        val density = context.resources.displayMetrics.density

        val existingCard = fragmentRootView.findViewWithTag<android.view.View>("findreplace_preview_card")
        if (existingCard != null) {
            isPreviewAttached = true
            return
        }

        val parentView = listView.parent as? android.view.ViewGroup ?: return

        val previewCard = android.widget.LinearLayout(context).apply {
            tag = "findreplace_preview_card"
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding((10 * density).toInt(), (10 * density).toInt(), (10 * density).toInt(), (10 * density).toInt())
            setBackgroundColor(Color.parseColor("#121212"))
        }
        previewCardView = previewCard

        val previewHint = android.widget.TextView(context).apply {
            text = "Tap a field or icon to edit it · hold an icon and drag to rearrange"
            textSize = 11f
            setTextColor(Color.parseColor("#888888"))
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (6 * density).toInt() }
        }

        val row1 = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val findField = android.widget.TextView(context).apply {
            text = "Find..."
            textSize = 14f
            setTextColor(Color.parseColor("#888888"))
            setBackgroundColor(Color.parseColor("#1E1E1E"))
            setPadding((8 * density).toInt(), (6 * density).toInt(), (8 * density).toInt(), (6 * density).toInt())
            layoutParams = android.widget.LinearLayout.LayoutParams(0, (32 * density).toInt(), 1f).apply {
                marginEnd = (6 * density).toInt()
            }
        }
        previewFindField = findField

        val counter = android.widget.TextView(context).apply {
            text = "1/12"
            textSize = 12f
            setTextColor(Color.parseColor("#888888"))
            setPadding((4 * density).toInt(), 0, (4 * density).toInt(), 0)
        }
        previewCounter = counter

        val row1Icons = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        row1GroupView = row1Icons

        val btnPrev = android.widget.TextView(context).apply { text = "▲"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }
        val btnNext = android.widget.TextView(context).apply { text = "▼"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }
        val btnHighlight = android.widget.TextView(context).apply { text = "≡"; gravity = android.view.Gravity.CENTER; setTextColor(Color.WHITE); setBackgroundColor(Color.parseColor("#0078D4")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }
        val btnRegex = android.widget.TextView(context).apply { text = ".*"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }
        val btnClose = android.widget.TextView(context).apply { text = "✕"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }

        row1Icons.addView(btnPrev)
        row1Icons.addView(btnNext)
        row1Icons.addView(btnHighlight)
        row1Icons.addView(btnRegex)
        row1Icons.addView(btnClose)

        row1.addView(findField)
        row1.addView(counter)
        row1.addView(row1Icons)

        val row2 = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = (6 * density).toInt() }
        }

        val replaceField = android.widget.TextView(context).apply {
            text = "Replace..."
            textSize = 14f
            setTextColor(Color.parseColor("#888888"))
            setBackgroundColor(Color.parseColor("#1E1E1E"))
            setPadding((8 * density).toInt(), (6 * density).toInt(), (8 * density).toInt(), (6 * density).toInt())
            layoutParams = android.widget.LinearLayout.LayoutParams(0, (32 * density).toInt(), 1f).apply {
                marginEnd = (6 * density).toInt()
            }
        }
        previewReplaceField = replaceField

        val row2Icons = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        row2GroupView = row2Icons

        val btnReplaceOne = android.widget.TextView(context).apply { text = "1➔"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }
        val btnReplaceAll = android.widget.TextView(context).apply { text = "∀➔"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }
        val btnCase = android.widget.TextView(context).apply { text = "Aa"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }
        val btnWord = android.widget.TextView(context).apply { text = "\\b"; gravity = android.view.Gravity.CENTER; setTextColor(Color.parseColor("#AAAAAA")); setBackgroundColor(Color.parseColor("#1E1E1E")); layoutParams = android.widget.LinearLayout.LayoutParams((28 * density).toInt(), (32 * density).toInt()).apply { marginStart = (3 * density).toInt() } }

        row2Icons.addView(btnReplaceOne)
        row2Icons.addView(btnReplaceAll)
        row2Icons.addView(btnCase)
        row2Icons.addView(btnWord)

        row2.addView(replaceField)
        row2.addView(row2Icons)

        val hiddenTray = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding((8 * density).toInt(), (8 * density).toInt(), (8 * density).toInt(), (8 * density).toInt())
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = (10 * density).toInt() }

            val borderDrawable = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#181818"))
                setStroke((1 * density).toInt(), Color.parseColor("#333333"), (4 * density).toFloat(), (4 * density).toFloat())
                cornerRadius = 6 * density
            }
            background = borderDrawable
        }
        hiddenTrayView = hiddenTray

        val trayLabel = android.widget.TextView(context).apply {
            text = "Hidden buttons — drag here to remove; tap + to restore"
            textSize = 11f
            setTextColor(Color.parseColor("#888888"))
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (4 * density).toInt() }
        }
        hiddenTray.addView(trayLabel)

        val chipsScroll = android.widget.ScrollView(context).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                (120 * density).toInt()
            )
        }

        val chipsContainer = android.widget.GridLayout(context).apply {
            columnCount = 3
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
            )
        }
        hiddenChipsContainer = chipsContainer
        chipsScroll.addView(chipsContainer)
        hiddenTray.addView(chipsScroll)

        previewCard.addView(previewHint)
        previewCard.addView(row1)
        previewCard.addView(row2)
        previewCard.addView(hiddenTray)

        previewButtonMap["prev"] = btnPrev
        previewButtonMap["next"] = btnNext
        previewButtonMap["highlight"] = btnHighlight
        previewButtonMap["regex"] = btnRegex
        previewButtonMap["close"] = btnClose
        previewButtonMap["replace-one"] = btnReplaceOne
        previewButtonMap["replace-all"] = btnReplaceAll
        previewButtonMap["case"] = btnCase
        previewButtonMap["word"] = btnWord

        previewButtonMap.forEach { (domId, btnView) ->
            originalButtonTextMap[domId] = btnView.text.toString()

            btnView.setOnLongClickListener { v ->
                val item = android.content.ClipData.Item(domId)
                val dragData = android.content.ClipData(domId, arrayOf(android.content.ClipDescription.MIMETYPE_TEXT_PLAIN), item)
                val shadow = android.view.View.DragShadowBuilder(v)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    v.startDragAndDrop(dragData, shadow, domId, 0)
                } else {
                    @Suppress("DEPRECATION")
                    v.startDrag(dragData, shadow, domId, 0)
                }
                true
            }
        }

        val dropMarkerTag = "findreplace_drop_marker"
        fun draggedButtonId(event: android.view.DragEvent): String? =
            (event.localState as? String) ?: event.clipData?.getItemAt(0)?.text?.toString()

        fun removeDropMarker(group: android.widget.LinearLayout) {
            for (i in group.childCount - 1 downTo 0) {
                if (group.getChildAt(i).tag == dropMarkerTag) group.removeViewAt(i)
            }
        }

        fun clearDropMarkers() {
            removeDropMarker(row1Icons)
            removeDropMarker(row2Icons)
        }

        fun insertionIndex(
            group: android.widget.LinearLayout,
            x: Float,
            draggedId: String?
        ): Int {
            removeDropMarker(group)
            val draggedView = draggedId?.let { previewButtonMap[it] }
            var indexWithoutDragged = 0
            for (i in 0 until group.childCount) {
                val child = group.getChildAt(i)
                if (child === draggedView || child.tag == dropMarkerTag) continue
                if (x < child.x + child.width / 2f) return indexWithoutDragged
                indexWithoutDragged++
            }
            return indexWithoutDragged
        }

        fun showDropMarker(
            group: android.widget.LinearLayout,
            x: Float,
            draggedId: String
        ) {
            clearDropMarkers()
            val index = insertionIndex(group, x, draggedId)
            val marker = android.view.View(context).apply {
                tag = dropMarkerTag
                background = android.graphics.drawable.GradientDrawable().apply {
                    setColor(Color.parseColor("#0078D4"))
                    cornerRadius = 2 * density
                }
                layoutParams = android.widget.LinearLayout.LayoutParams(
                    (3 * density).toInt(),
                    (28 * density).toInt()
                ).apply {
                    marginStart = (2 * density).toInt()
                    marginEnd = (2 * density).toInt()
                }
                contentDescription = "Drop position"
            }
            group.addView(marker, index.coerceIn(0, group.childCount))
        }

        val handleRowDrop = { isRow1Target: Boolean, event: android.view.DragEvent ->
            val targetGroup = if (isRow1Target) row1Icons else row2Icons
            val draggedId = draggedButtonId(event)
            when (event.action) {
                android.view.DragEvent.ACTION_DRAG_STARTED ->
                    draggedId != null && draggedId in KNOWN_BUTTON_IDS
                android.view.DragEvent.ACTION_DRAG_ENTERED,
                android.view.DragEvent.ACTION_DRAG_LOCATION -> {
                    if (draggedId != null && draggedId in KNOWN_BUTTON_IDS) {
                        showDropMarker(targetGroup, event.x, draggedId)
                    }
                    true
                }
                android.view.DragEvent.ACTION_DRAG_EXITED -> {
                    removeDropMarker(targetGroup)
                    true
                }
                android.view.DragEvent.ACTION_DROP -> {
                    clearDropMarkers()
                    if (draggedId != null && draggedId in KNOWN_BUTTON_IDS) {
                        val targetIndex = insertionIndex(targetGroup, event.x, draggedId)
                        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
                        val (row1, row2) = parseAndNormalizeRows(prefs)
                        val hiddenSet = parseHiddenButtons(prefs.getString(PREF_KEY_HIDDEN_BUTTONS, ""))

                        hiddenSet.remove(draggedId)
                        row1.remove(draggedId)
                        row2.remove(draggedId)

                        val targetList = if (isRow1Target) row1 else row2
                        targetList.add(targetIndex.coerceIn(0, targetList.size), draggedId)

                        prefs.edit()
                            .putString(PREF_KEY_BUTTON_ROW1, row1.joinToString(","))
                            .putString(PREF_KEY_BUTTON_ROW2, row2.joinToString(","))
                            .putString(PREF_KEY_HIDDEN_BUTTONS, hiddenSet.joinToString(","))
                            .apply()

                        refreshFindReplacePreview(prefs)
                        ThemedToast.show(context, "Moved $draggedId")
                    }
                    true
                }
                android.view.DragEvent.ACTION_DRAG_ENDED -> {
                    clearDropMarkers()
                    true
                }
                else -> true
            }
        }

        row1Icons.setOnDragListener { _, event -> handleRowDrop(true, event) }
        row2Icons.setOnDragListener { _, event -> handleRowDrop(false, event) }

        hiddenTray.setOnDragListener { _, event ->
            when (event.action) {
                android.view.DragEvent.ACTION_DRAG_ENTERED -> {
                    hiddenTray.setBackgroundColor(Color.parseColor("#220000"))
                    true
                }
                android.view.DragEvent.ACTION_DRAG_EXITED -> {
                    val borderDrawable = android.graphics.drawable.GradientDrawable().apply {
                        setColor(Color.parseColor("#181818"))
                        setStroke((1 * density).toInt(), Color.parseColor("#333333"), (4 * density).toFloat(), (4 * density).toFloat())
                        cornerRadius = 6 * density
                    }
                    hiddenTray.background = borderDrawable
                    true
                }
                android.view.DragEvent.ACTION_DROP -> {
                    val borderDrawable = android.graphics.drawable.GradientDrawable().apply {
                        setColor(Color.parseColor("#181818"))
                        setStroke((1 * density).toInt(), Color.parseColor("#333333"), (4 * density).toFloat(), (4 * density).toFloat())
                        cornerRadius = 6 * density
                    }
                    hiddenTray.background = borderDrawable

                    val draggedId = event.clipData?.getItemAt(0)?.text?.toString()
                    if (draggedId != null && draggedId in KNOWN_BUTTON_IDS) {
                        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
                        val hiddenSet = parseHiddenButtons(prefs.getString(PREF_KEY_HIDDEN_BUTTONS, ""))
                        hiddenSet.add(draggedId)

                        prefs.edit()
                            .putString(PREF_KEY_HIDDEN_BUTTONS, hiddenSet.joinToString(","))
                            .apply()

                        refreshFindReplacePreview(prefs)
                        ThemedToast.show(context, "Hidden $draggedId button")
                    }
                    true
                }
                android.view.DragEvent.ACTION_DRAG_STARTED -> true
                else -> true
            }
        }

        previewCard.setOnClickListener {
            selectedCategoryKey = "category_panel"
            filterCategories()
            ThemedToast.show(context, "Search Panel options selected")
        }

        findField.setOnClickListener {
            selectedCategoryKey = "category_field_find"
            filterCategories()
            ThemedToast.show(context, "Find Field options selected")
        }

        replaceField.setOnClickListener {
            selectedCategoryKey = "category_field_replace"
            filterCategories()
            ThemedToast.show(context, "Replace Field options selected")
        }

        counter.setOnClickListener {
            selectedCategoryKey = "category_counter"
            filterCategories()
            ThemedToast.show(context, "Match Counter options selected")
        }

        val buttonCategoryMap = mapOf(
            btnPrev to "category_btn_prev",
            btnNext to "category_btn_next",
            btnHighlight to "category_btn_highlight",
            btnRegex to "category_btn_regex",
            btnClose to "category_btn_close",
            btnReplaceOne to "category_btn_replace_one",
            btnReplaceAll to "category_btn_replace_all",
            btnCase to "category_btn_case",
            btnWord to "category_btn_word"
        )

        buttonCategoryMap.forEach { (btn, catKey) ->
            btn.setOnClickListener {
                selectedCategoryKey = catKey
                filterCategories()
                ThemedToast.show(context, "Button options selected")
            }
        }

        try {
            if (parentView is android.widget.LinearLayout) {
                parentView.addView(previewCard, 0)
                isPreviewAttached = true
            } else {
                val indexInParent = parentView.indexOfChild(listView)
                parentView.removeView(listView)

                val container = android.widget.LinearLayout(context).apply {
                    orientation = android.widget.LinearLayout.VERTICAL
                    layoutParams = android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT
                    )
                }

                container.addView(previewCard, android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                    android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                ))

                container.addView(listView, android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                    0, 1f
                ))

                parentView.addView(container, indexInParent)
                isPreviewAttached = true
            }
        } catch (e: Exception) {
            isPreviewAttached = false
        }
    }
}

class HotkeysSettingsFragment : BaseSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_hotkeys, rootKey)
    }
}

class ExportSettingsFragment : BaseSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_export, rootKey)
    }
}


class SettingsThemeFragment : BaseSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_settings_theme, rootKey)
    }
}

class TocPanelSettingsFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_toc, rootKey)
        configureFontPreferences()
    }
}

class LeftPanelSettingsFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_left_panel, rootKey)
        configureFontPreferences()
    }
}
