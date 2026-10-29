package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Test

class PreferenceResetHelperTest {
    @Test
    fun markerAndPenColorDefaultsMatchTheirSettingsAndPreviews() {
        val expectedColors = mapOf(
            "pref_highlight_yellow_background_color" to "#ffe066",
            "pref_highlight_green_background_color" to "#a8f087",
            "pref_highlight_pink_background_color" to "#ff99c8",
            "pref_highlight_blue_background_color" to "#9bf6ff",
            "pref_highlight_yellow_text_color" to "#111111",
            "pref_highlight_green_text_color" to "#111111",
            "pref_highlight_pink_text_color" to "#111111",
            "pref_highlight_blue_text_color" to "#111111",
            "pref_pen_red_text_color" to "#ff595e",
            "pref_pen_green_text_color" to "#2ec4b6",
            "pref_pen_blue_text_color" to "#4dabf7",
            "pref_pen_purple_text_color" to "#845ef7"
        )

        for ((key, expectedColor) in expectedColors) {
            assertEquals(key, expectedColor, PreferenceResetHelper.getDefaultColorHex(key))
            assertEquals(key, expectedColor, PreferenceResetHelper.getDefaultValue(key))
        }
    }
}
