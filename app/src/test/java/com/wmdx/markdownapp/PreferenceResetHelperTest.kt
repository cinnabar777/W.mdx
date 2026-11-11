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

    @Test
    fun sourceEditorColorsHaveRealSwatchDefaultsAndResetValues() {
        val expectedColors = mapOf(
            "pref_source_editor_markup_color" to "#89ddff",
            "pref_source_editor_heading_color" to "#82aaff",
            "pref_source_editor_link_color" to "#89ddff",
            "pref_source_editor_code_color" to "#c3e88d",
            "pref_source_editor_comment_color" to "#808080",
            "pref_source_editor_string_color" to "#c3e88d",
            "pref_source_editor_number_color" to "#f78c6c",
            "pref_source_editor_keyword_color" to "#c792ea",
            "pref_source_editor_property_color" to "#ffcb6b",
            "pref_source_editor_type_color" to "#f07178",
            "pref_source_editor_variable_color" to "#eeffff",
            "pref_source_editor_function_color" to "#82aaff",
            "pref_source_editor_operator_color" to "#89ddff"
        )

        for ((key, expectedColor) in expectedColors) {
            assertEquals(key, expectedColor, PreferenceResetHelper.getDefaultColorHex(key))
            assertEquals(key, "default", PreferenceResetHelper.getDefaultValue(key))
        }
        assertEquals(
            "Source editor base text",
            "default",
            PreferenceResetHelper.getDefaultValue("pref_source_editor_text_color")
        )
        assertEquals(
            "Source editor text size",
            14,
            PreferenceResetHelper.getDefaultValue("pref_source_editor_font_size")
        )
    }

    @Test
    fun perCalloutColorSwatchesMatchTheActualDefaultPreviewPalette() {
        val expectedColors = mapOf(
            "pref_callout_type_info_bg_color" to "rgba(41,182,246,0.12)",
            "pref_callout_type_faq_bg_color" to "rgba(255,152,0,0.12)",
            "pref_callout_type_question_bg_color" to "rgba(255,152,0,0.12)",
            "pref_callout_type_todo_bg_color" to "rgba(0,188,212,0.12)",
            "pref_callout_type_example_bg_color" to "rgba(171,71,188,0.12)",
            "pref_callout_type_info_title_color" to "#FFFFFF",
            "pref_callout_type_info_accent_color" to "#29B6F6",
            "pref_callout_type_faq_accent_color" to "#FF9800",
            "pref_callout_type_question_accent_color" to "#FF9800",
            "pref_callout_type_todo_accent_color" to "#00BCD4",
            "pref_callout_type_example_accent_color" to "#AB47BC"
        )

        for ((key, expectedColor) in expectedColors) {
            assertEquals(key, expectedColor, PreferenceResetHelper.getDefaultColorHex(key))
            assertEquals(key, "default", PreferenceResetHelper.getDefaultValue(key))
        }
    }

    @Test
    fun recentlyAddedAppearanceColorKeysHaveConcreteFallbackSwatches() {
        val expectedColors = mapOf(
            "pref_cursor_color" to "#FFFFFF",
            "pref_left_panel_bg_color" to "#121212",
            "pref_left_panel_border_color" to "#444444",
            "pref_left_panel_text_color" to "#FFFFFF",
            "pref_start_page_bg_color" to "#000000",
            "pref_start_page_title_color" to "#FFFFFF",
            "pref_start_page_action_text_color" to "#FFFFFF",
            "pref_start_page_action_bg_color" to "#00000000",
            "pref_start_page_action_border_color" to "#3DFFFFFF",
            "pref_underline_solid_color" to "#FFFFFF",
            "pref_underline_dotted_color" to "#FFFFFF",
            "pref_underline_dashed_color" to "#FFFFFF",
            "pref_underline_double_color" to "#FFFFFF",
            "pref_underline_wavy_color" to "#FFFFFF"
        )

        for ((key, expectedColor) in expectedColors) {
            assertEquals(key, expectedColor, PreferenceResetHelper.getDefaultColorHex(key))
            assertEquals(key, "default", PreferenceResetHelper.getDefaultValue(key))
        }
    }

    @Test
    fun dialectMediaAndFormattingSettingsHaveResetDefaults() {
        val expectedDefaults = mapOf(
            "pref_gfm_extensions_enabled" to true,
            "pref_markdown_auto_paste_enabled" to true,
            "pref_media_controls_accent_color" to "default",
            "pref_media_controls_background_color" to "default",
            "pref_media_controls_text_color" to "default",
            "pref_media_player_background_color" to "default",
            "pref_media_playback_speed" to "1.0",
            "pref_hotkey_clearFormatting" to "ctrl+\\"
        )

        for ((key, expectedDefault) in expectedDefaults) {
            assertEquals(key, expectedDefault, PreferenceResetHelper.getDefaultValue(key))
        }
    }
}
