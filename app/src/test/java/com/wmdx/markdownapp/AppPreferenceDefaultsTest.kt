package com.wmdx.markdownapp

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppPreferenceDefaultsTest {
    @Test
    fun backupPreferenceDefaultsKeepFontFamiliesButExcludeFontFilesAndPersonalState() {
        val defaults = AppPreferenceDefaults.parseDefaults(readDefaultsResource())

        assertEquals("roboto-flex", defaults["pref_body_font_family"])
        assertEquals("roboto-flex", defaults["pref_list_font_family"])
        assertEquals("sans-serif-light", defaults["pref_toc_font_family"])
        assertEquals(12, defaults["pref_list_left_indent"])
        assertEquals(false, defaults["pref_list_non_hanging"])
        assertEquals("gfm", defaults["pref_markdown_profile"])

        assertFalse(defaults.keys.any { "font_file" in it })
        assertFalse(defaults.containsKey("pref_toolbar_bottom_config"))
        assertFalse(defaults.containsKey("pref_list_wrap_under_text"))
        assertFalse(defaults.containsKey("pref_heading_override_defaults_migrated_v1"))
        assertFalse(defaults.containsKey("pref_toolbar_default_corrected"))
        assertTrue(defaults.keys.all { it.startsWith("pref_") })
        assertFalse(defaults.keys.any { it.startsWith("cursor_scroll_") })
    }

    private fun readDefaultsResource(): String {
        var directory: File? = File(System.getProperty("user.dir")).absoluteFile
        while (directory != null) {
            val candidate = File(
                directory,
                "app/src/main/res/raw/wmdx_default_preferences.json"
            )
            if (candidate.isFile) return candidate.readText()
            directory = directory.parentFile
        }
        error("Could not locate the Wmdx default preference resource")
    }
}
