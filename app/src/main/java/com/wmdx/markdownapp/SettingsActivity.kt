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
            "pref_font_file_bold",
            "pref_font_file_italic",
            "pref_font_file_code",
            "pref_font_file_callout_header"
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
        addHeadingLevelPreferences()
        configureFontPreferences()
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
    private var previewContainer: android.widget.LinearLayout? = null
    private val previewTitleViews = mutableMapOf<String, android.widget.TextView>()
    private val previewCardViews = mutableMapOf<String, android.widget.LinearLayout>()

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_blockquotes, rootKey)
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

        val handleRowDrop = { isRow1Target: Boolean, event: android.view.DragEvent ->
            when (event.action) {
                android.view.DragEvent.ACTION_DROP -> {
                    val draggedId = event.clipData?.getItemAt(0)?.text?.toString()
                    if (draggedId != null && draggedId in KNOWN_BUTTON_IDS) {
                        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
                        val (row1, row2) = parseAndNormalizeRows(prefs)
                        val hiddenSet = parseHiddenButtons(prefs.getString(PREF_KEY_HIDDEN_BUTTONS, ""))

                        hiddenSet.remove(draggedId)
                        row1.remove(draggedId)
                        row2.remove(draggedId)

                        val targetGroup = if (isRow1Target) row1GroupView else row2GroupView
                        val targetList = if (isRow1Target) row1 else row2

                        var targetIndex = targetGroup?.childCount ?: 0
                        if (targetGroup != null) {
                            for (i in 0 until targetGroup.childCount) {
                                val child = targetGroup.getChildAt(i)
                                val childMidX = child.x + child.width / 2f
                                if (event.x < childMidX) {
                                    targetIndex = i
                                    break
                                }
                            }
                        }

                        val insertIdx = Math.min(targetList.size, Math.max(0, targetIndex))
                        targetList.add(insertIdx, draggedId)

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
