package com.wmdx.markdownapp

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppPreferenceDefaultsTest {
    @Test
    fun backupPreferenceDefaultsKeepEveryAppSettingExceptFontFiles() {
        val defaults = AppPreferenceDefaults.parseDefaults(readDefaultsResource())

        assertEquals(17, defaults["pref_body_font_size"])
        assertEquals("roboto-flex", defaults["pref_body_font_family"])
        assertEquals("roboto-flex", defaults["pref_bold_font_family"])
        assertEquals("roboto-flex", defaults["pref_list_font_family"])
        assertEquals("sans-serif-light", defaults["pref_toc_font_family"])
        assertEquals(12, defaults["pref_list_left_indent"])
        assertEquals(false, defaults["pref_list_non_hanging"])
        assertEquals("gfm", defaults["pref_markdown_profile"])
        assertEquals("#666666", defaults["pref_todo_unchecked_color"])

        assertEquals(259, defaults.size)
        assertFalse(defaults.keys.any { "font_file" in it })
        assertTrue(defaults.containsKey("pref_toolbar_bottom_config"))
        assertTrue(defaults.containsKey("pref_list_wrap_under_text"))
        assertTrue(defaults.containsKey("pref_heading_override_defaults_migrated_v1"))
        assertTrue(defaults.containsKey("pref_toolbar_default_corrected"))
        assertTrue(defaults.keys.all { it.startsWith("pref_") })
        assertFalse(defaults.keys.any { it.startsWith("cursor_scroll_") })

        val toolbar = org.json.JSONObject(defaults["pref_toolbar_bottom_config"] as String)
        val editorGroup = toolbar.getJSONObject("popupGroups")
            .getJSONObject("custom-group-mwieocsn-3")
            .getJSONArray("order")
        val syntaxActions = (0 until editorGroup.length())
            .map { editorGroup.getString(it) }
            .filter { it.startsWith("syntaxExposure") }
        assertEquals(
            listOf(
                "syntaxExposureHidden",
                "syntaxExposureCaret",
                "syntaxExposureLine",
                "syntaxExposureBlock"
            ),
            syntaxActions
        )
    }

    private fun readDefaultsResource(): String {
        var directory: File? = File(System.getProperty("user.dir")).absoluteFile
        while (directory != null) {
            val candidate = File(
                directory,
                "app/src/main/res/raw/wmdx_default_preferences_gzip.b64"
            )
            if (candidate.isFile) {
                return AppPreferenceDefaults.decodeDefaultsPayload(candidate.readText())
            }
            directory = directory.parentFile
        }
        error("Could not locate the Wmdx default preference resource")
    }
}
