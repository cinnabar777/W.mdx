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

    private fun getFileName(uri: Uri): String? {
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
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        setPreferencesFromResource(R.xml.preferences_styling_findreplace, rootKey)
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
