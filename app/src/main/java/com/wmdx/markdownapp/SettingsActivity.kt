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
            supportFragmentManager
                .beginTransaction()
                .replace(R.id.settings_container, SettingsFragment())
                .commit()
        }

        supportFragmentManager.addOnBackStackChangedListener {
            val currentFragment = supportFragmentManager.findFragmentById(R.id.settings_container)
            supportActionBar?.title = when (currentFragment) {
                is SettingsThemeFragment -> "Settings Theme & Custom Colors"
                is StylingHeadingsFragment -> "Headings Styling"
                is StylingParagraphFragment -> "Paragraph & Body Styling"
                is StylingInlineFragment -> "Inline Formats Styling"
                is StylingListsFragment -> "Lists & Todos Styling"
                is StylingBlockquotesFragment -> "Block Quotes & Callouts Styling"
                is StylingTablesFragment -> "Tables Styling"
                is StylingCodeFragment -> "Code Blocks Styling"
                is StylingHrFragment -> "Horizontal Dividers Styling"
                is StylingControlbarFragment -> "Bottom Control Bar Styling"
                is StylingCursorFragment -> "Cursor & Selection Settings"
                is StylingFindReplaceFragment -> "Find & Replace Settings"
                is StylingSettingsFragment -> "Styling & Typography"
                is ExportSettingsFragment -> "HTML & MHTML Export Settings"
                is HotkeysSettingsFragment -> "Custom Keyboard Shortcuts"
                is PluginsSettingsFragment -> "Editor Plugins & Tools"
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
        preferenceScreen?.let { applyCustomLayouts(it) }
    }

    private fun applyCustomLayouts(group: androidx.preference.PreferenceGroup) {
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

        findPreference<Preference>("pref_page_diagnostics")?.setOnPreferenceClickListener {
            context?.let { AppDiagnostics.show(it) }
            true
        }
    }

    override fun onPreferenceTreeClick(preference: Preference): Boolean {
        val key = preference.key ?: return super.onPreferenceTreeClick(preference)
        when (key) {
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
            "pref_page_plugins", "pref_plugins_page" -> {
                parentFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, PluginsSettingsFragment())
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

open class StylingSettingsFragment : BaseSettingsFragment() {
    private var activeFontTargetKey: String? = null

    private val pickFontLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { handleFontPicked(it) }
    }

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling, rootKey)

        val fontKeys = listOf(
            "pref_font_file_body",
            "pref_font_file_heading",
            "pref_font_file_bold",
            "pref_font_file_italic",
            "pref_font_file_code"
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
            "pref_styling_page_inline" -> StylingInlineFragment()
            "pref_styling_page_lists" -> StylingListsFragment()
            "pref_styling_page_blockquotes" -> StylingBlockquotesFragment()
            "pref_styling_page_tables" -> StylingTablesFragment()
            "pref_styling_page_code" -> StylingCodeFragment()
            "pref_styling_page_hr" -> StylingHrFragment()
            "pref_styling_page_controlbar" -> StylingControlbarFragment()
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
    }
}

class StylingParagraphFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_paragraph, rootKey)
    }
}

class StylingInlineFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_inline, rootKey)
    }
}

class StylingListsFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_lists, rootKey)
    }
}

class StylingBlockquotesFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_blockquotes, rootKey)
    }
}

class StylingTablesFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_tables, rootKey)
    }
}

class StylingCodeFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_code, rootKey)
    }
}

class StylingHrFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_hr, rootKey)
    }
}

class StylingControlbarFragment : StylingSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_controlbar, rootKey)
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

    private val DEFAULT_BUTTON_ORDER = "prev,next,highlight,regex,close,replace-one,replace-all,case,word"
    private val KNOWN_BUTTON_IDS = listOf("prev", "next", "highlight", "regex", "close", "replace-one", "replace-all", "case", "word")
    private val PREF_KEY_BUTTON_ORDER = "pref_findreplace_button_order"
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
    private var hiddenChipsContainer: android.widget.LinearLayout? = null

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

    private fun parseAndNormalizeOrder(rawOrder: String?): MutableList<String> {
        val items = rawOrder?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
        val order = mutableListOf<String>()
        for (id in items) {
            if (id in KNOWN_BUTTON_IDS && id !in order) {
                order.add(id)
            }
        }
        for (id in KNOWN_BUTTON_IDS) {
            if (id !in order) {
                order.add(id)
            }
        }
        return order
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
            targetSvgPrefKey = key
            val context = context ?: return super.onPreferenceTreeClick(preference)
            AlertDialog.Builder(context)
                .setTitle("Custom SVG Icon")
                .setItems(arrayOf("Choose SVG File", "Paste SVG Code")) { _, which ->
                    if (which == 0) {
                        pickSvgLauncher.launch(arrayOf("image/svg+xml", "text/xml", "application/xml", "*/*"))
                    } else {
                        super.onPreferenceTreeClick(preference)
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
            return true
        }
        return super.onPreferenceTreeClick(preference)
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

        val orderList = parseAndNormalizeOrder(prefs.getString(PREF_KEY_BUTTON_ORDER, DEFAULT_BUTTON_ORDER))
        val hiddenSet = parseHiddenButtons(prefs.getString(PREF_KEY_HIDDEN_BUTTONS, ""))

        val visibleIds = orderList.filter { it !in hiddenSet }
        val row1Ids = visibleIds.take(5)
        val row2Ids = visibleIds.drop(5)

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
        val chipBox = hiddenChipsContainer
        val ctx = context
        if (chipBox != null && ctx != null) {
            chipBox.removeAllViews()
            val density = ctx.resources.displayMetrics.density
            if (hiddenSet.isEmpty()) {
                val emptyTv = android.widget.TextView(ctx).apply {
                    text = "(No hidden buttons)"
                    textSize = 11f
                    setTextColor(Color.parseColor("#666666"))
                }
                chipBox.addView(emptyTv)
            } else {
                hiddenSet.forEach { hid ->
                    val chip = android.widget.TextView(ctx).apply {
                        text = "+ $hid"
                        textSize = 12f
                        setTextColor(Color.WHITE)
                        setBackgroundColor(Color.parseColor("#0078D4"))
                        setPadding((8 * density).toInt(), (4 * density).toInt(), (8 * density).toInt(), (4 * density).toInt())
                        layoutParams = android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply {
                            marginEnd = (6 * density).toInt()
                            bottomMargin = (4 * density).toInt()
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
                    val density = btnView.context.resources.displayMetrics.density
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

        val chipsContainer = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        hiddenChipsContainer = chipsContainer
        hiddenTray.addView(chipsContainer)

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

        val handleRowDrop = { isRow1: Boolean, event: android.view.DragEvent ->
            when (event.action) {
                android.view.DragEvent.ACTION_DROP -> {
                    val draggedId = event.clipData?.getItemAt(0)?.text?.toString()
                    if (draggedId != null && draggedId in KNOWN_BUTTON_IDS) {
                        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
                        val orderList = parseAndNormalizeOrder(prefs.getString(PREF_KEY_BUTTON_ORDER, DEFAULT_BUTTON_ORDER))
                        val hiddenSet = parseHiddenButtons(prefs.getString(PREF_KEY_HIDDEN_BUTTONS, ""))

                        hiddenSet.remove(draggedId)
                        orderList.remove(draggedId)

                        val targetIndex = if (isRow1) 0 else Math.min(5, orderList.size)
                        orderList.add(targetIndex, draggedId)

                        prefs.edit()
                            .putString(PREF_KEY_BUTTON_ORDER, orderList.joinToString(","))
                            .putString(PREF_KEY_HIDDEN_BUTTONS, hiddenSet.joinToString(","))
                            .apply()

                        refreshFindReplacePreview(prefs)
                        ThemedToast.show(context, "Reordered $draggedId")
                    }
                    true
                }
                android.view.DragEvent.ACTION_DRAG_STARTED -> true
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

class PluginsSettingsFragment : BaseSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_plugins, rootKey)
    }
}

class SettingsThemeFragment : BaseSettingsFragment() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_settings_theme, rootKey)
    }
}
