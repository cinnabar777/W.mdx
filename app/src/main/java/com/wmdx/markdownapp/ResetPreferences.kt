package com.wmdx.markdownapp

import android.content.Context
import android.util.AttributeSet
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.preference.EditTextPreference
import androidx.preference.ListPreference
import androidx.preference.Preference
import androidx.preference.PreferenceManager
import androidx.preference.PreferenceViewHolder
import androidx.preference.SeekBarPreference
import androidx.preference.SwitchPreferenceCompat
import java.io.File

interface ResettablePreference {
    fun callNotifyChanged()
}

object PreferenceResetHelper {
    private const val HEADING_OVERRIDE_DEFAULTS_MIGRATED =
        "pref_heading_override_defaults_migrated_v1"

    fun getDefaultColorHex(key: String?): String {
        return when (key) {
            "pref_settings_category_title_color" -> "#00E5FF"
            "pref_settings_title_color" -> "#FFFFFF"
            "pref_settings_summary_color" -> "#AAAAAA"
            "pref_settings_switch_color" -> "#00E5FF"
            "pref_settings_reset_icon_color" -> "#00E5FF"
            "pref_settings_reset_inactive_icon_color" -> "#555555"
            "pref_settings_bg_color" -> "#000000"
            "pref_toolbar_bg_color" -> "#121212"
            "pref_toolbar_icon_color" -> "#FFFFFF"
            "pref_toolbar_active_key_bg_color" -> "#1F1F1F"
            "pref_toolbar_label_color" -> "#FFFFFF"
            "pref_toolbar_toggle_bg_color" -> "#00000000"
            "pref_toolbar_toggle_icon_color" -> "#FFFFFF"
            "pref_toc_panel_bg_color" -> "#121212"
            "pref_toc_panel_border_color" -> "#444444"
            "pref_toc_history_bg_color" -> "#00000000"
            "pref_toc_history_border_color" -> "#444444"
            "pref_toc_history_icon_color" -> "#FFFFFF"
            "pref_toc_text_color" -> "#FFFFFF"
            "pref_toc_active_text_color" -> "#FFFF00"
            "pref_toc_active_bg_color" -> "#00000000"
            "pref_toc_search_highlight_bg_color" -> "#FFFFC107"
            "pref_toc_toggle_bg_color", "pref_toc_toggle_active_bg_color" -> "#26FFFFFF"
            "pref_toc_toggle_icon_color", "pref_toc_toggle_active_icon_color" -> "#FFFFFF"
            "pref_heading_underline_color" -> "#FFFFFF"
            "pref_body_text_color", "pref_list_text_color" -> "#FFFFFF"
            "pref_blockquote_line_color" -> "#444444"
            "pref_blockquote_bg_color" -> "#1A1A1A"
            "pref_blockquote_text_color" -> "#FFFFFF"
            "pref_callout_line_color" -> "#29B6F6"
            "pref_callout_bg_color" -> "#1A232A"
            "pref_callout_text_color" -> "#FFFFFF"
            "pref_callout_header_bg_color" -> "#1A232A"
            "pref_callout_header_title_color" -> "#FFFFFF"
            "pref_callout_header_accent_color" -> "#29B6F6"
            "pref_hr_color" -> "#444444"
            "pref_bold_color" -> "#FFFFFF"
            "pref_italic_color" -> "#FFFFFF"
            "pref_link_color" -> "#29B6F6"
            "pref_code_color" -> "#FF80AB"
            "pref_code_bg_color" -> "#212121"
            "pref_code_block_color" -> "#E0E0E0"
            "pref_code_block_bg_color" -> "#121212"
            "pref_code_block_lang_label_color" -> "#AAAAAA"
            "pref_code_block_text_bg_color" -> "#00000000"
            "pref_code_block_label_bg_color" -> "#1FFFFFFF"
            "pref_code_block_copy_bg_color" -> "#00000000"
            "pref_code_block_copy_text_color" -> "#FFFFFFFF"
            "pref_code_block_border_color" -> "#33FFFFFF"
            "pref_heading_color" -> "#FFFFFF"
            "pref_list_bullet_color" -> "#00E5FF"
            "pref_list_number_color" -> "#00E5FF"
            "pref_todo_unchecked_color" -> "#888888"
            "pref_todo_checked_color" -> "#00E5FF"
            "pref_todo_checkmark_color" -> "#111111"
            "pref_table_border_color" -> "#444444"
            "pref_table_header_bg_color" -> "#252525"
            "pref_table_header_text_color" -> "#FFFFFF"
            "pref_table_cell_bg_color" -> "#000000"
            "pref_table_cell_text_color" -> "#FFFFFF"
            "pref_table_menu_bg_color" -> "#222428"
            "pref_table_menu_action_bg_color" -> "rgba(255,255,255,0.12)"
            "pref_table_menu_text_color" -> "#FFFFFF"
            "pref_table_menu_disabled_color" -> "#777777"
            "pref_table_menu_pressed_bg_color" -> "rgba(0,120,212,0.4)"
            "pref_footnote_text_color" -> "#E0E0E0"
            "pref_footnote_ref_color" -> "#29B6F6"
            "pref_footnote_link_color" -> "#29B6F6"
            "pref_footnote_bg_color" -> "#1A1A1A"
            "pref_findreplace_panel_bg" -> "#121212"
            "pref_findreplace_panel_border" -> "#282828"
            "pref_findreplace_field_find_bg", "pref_findreplace_field_replace_bg" -> "#1E1E1E"
            "pref_findreplace_field_find_color", "pref_findreplace_field_replace_color" -> "#FFFFFF"
            "pref_findreplace_field_find_placeholder", "pref_findreplace_field_replace_placeholder" -> "#888888"
            "pref_findreplace_field_find_border", "pref_findreplace_field_replace_border" -> "#333333"
            "pref_findreplace_field_find_focus_border", "pref_findreplace_field_replace_focus_border" -> "#0078D4"
            "pref_findreplace_counter_color" -> "#888888"
            "pref_findreplace_counter_bg" -> "#00000000"
            "pref_findreplace_match_bg" -> "rgba(255, 255, 0, 0.35)"
            "pref_findreplace_current_match_bg" -> "#0078D4"
            "pref_findreplace_current_match_color" -> "#FFFFFF"
            else -> {
                if (key != null && key.startsWith("pref_heading_") && key.endsWith("_color")) {
                    "#FFFFFF"
                } else {
                    "#FFFFFF"
                }
            }
        }
    }

    fun getDefaultColorHex(context: Context, key: String?): String {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val isLightTheme = prefs.getString("pref_app_theme", "amoled") == "light"
        return when (key) {
            "pref_body_text_color", "pref_list_text_color" ->
                if (isLightTheme) "#111111" else "#FFFFFF"
            "pref_toc_panel_bg_color" -> {
                val toolbarColor = prefs.getString("pref_toolbar_bg_color", "default")
                if (!toolbarColor.isNullOrBlank() && toolbarColor != "default") {
                    toolbarColor
                } else if (isLightTheme) {
                    "#F8F9FA"
                } else {
                    "#121212"
                }
            }
            "pref_toc_panel_border_color" ->
                if (isLightTheme) "#E0E0E0" else "#444444"
            "pref_toc_history_border_color" -> {
                val tocBorderColor = prefs.getString("pref_toc_panel_border_color", "default")
                if (!tocBorderColor.isNullOrBlank() && tocBorderColor != "default") {
                    tocBorderColor
                } else if (isLightTheme) {
                    "#E0E0E0"
                } else {
                    "#444444"
                }
            }
            "pref_toc_history_icon_color" -> {
                val tocTextColor = prefs.getString("pref_toc_text_color", "default")
                if (!tocTextColor.isNullOrBlank() && tocTextColor != "default") {
                    tocTextColor
                } else if (isLightTheme) {
                    "#111111"
                } else {
                    "#FFFFFF"
                }
            }
            "pref_toc_text_color" ->
                if (isLightTheme) "#111111" else "#FFFFFF"
            "pref_toolbar_active_key_bg_color" ->
                if (isLightTheme) "#E9ECEF" else "#1F1F1F"
            "pref_toc_toggle_icon_color", "pref_toc_toggle_active_icon_color" -> {
                val tocTextColor = prefs.getString("pref_toc_text_color", "default")
                if (!tocTextColor.isNullOrBlank() && tocTextColor != "default") {
                    tocTextColor
                } else if (isLightTheme) {
                    "#111111"
                } else {
                    "#FFFFFF"
                }
            }
            else -> getDefaultColorHex(key)
        }
    }

    fun getDefaultValue(key: String): Any? {
        return when {
            getPerHeadingOverrideDefault(key) != null -> getPerHeadingOverrideDefault(key)
            key == "pref_body_font_size" -> 16
            key == "pref_body_font_weight" -> 400
            key == "pref_body_text_color" -> "default"
            key == "pref_heading_scale_percent" -> 100
            key == "pref_heading_color" -> "default"
            key == "pref_heading_word_spacing" -> "0px"
            key == "pref_font_weight_bold" -> 700
            key == "pref_font_weight_italic" -> 400
            key == "pref_font_weight_heading" -> 700
            key == "pref_bold_font_family" -> "default"
            key == "pref_italic_font_family" -> "default"
            key == "pref_code_font_family" -> "default"
            key == "pref_code_block_font_family" -> "default"
            key == "pref_toc_font_family" -> "default"
            key == "pref_italic_decoration" -> "none"
            key == "pref_heading_1_font_family" ||
                key == "pref_heading_2_font_family" ||
                key == "pref_heading_3_font_family" ||
                key == "pref_heading_4_font_family" ||
                key == "pref_heading_5_font_family" ||
                key == "pref_heading_6_font_family" -> "default"
            key == "pref_heading_align" -> "default"
            key == "pref_heading_line_height" -> "1.2"
            key == "pref_heading_letter_spacing" -> "0px"
            key == "pref_heading_text_transform" -> "none"
            key == "pref_heading_underline_style" -> "none"
            key == "pref_heading_underline_thickness" -> 2
            key == "pref_heading_underline_color" -> "default"
            key == "pref_heading_margin_top" -> 16
            key == "pref_heading_margin_bottom" -> 8
            key == "pref_paragraph_align" -> "left"
            key == "pref_paragraph_first_line_indent" -> 0
            key == "pref_paragraph_margin_top" -> 0
            key == "pref_paragraph_margin_bottom" -> 8
            key == "pref_link_decoration" -> "solid"
            key == "pref_link_underline_thickness" -> 1
            key == "pref_code_padding" -> 4
            key == "pref_code_border_radius" -> 4
            key == "pref_body_margin_left" -> 16
            key == "pref_body_margin_right" -> 16
            key == "pref_heading_margin_left" -> 0
            key == "pref_heading_margin_right" -> 0
            key == "pref_list_left_indent" -> 24
            key == "pref_list_inherit_body_typography" -> true
            key == "pref_list_font_family" -> "default"
            key == "pref_font_file_list" -> null
            key == "pref_list_font_weight" -> 400
            key == "pref_list_font_size" -> 16
            key == "pref_list_letter_spacing" -> "0px"
            key == "pref_list_text_color" -> "default"
            key == "pref_list_text_align" -> "default"
            key == "pref_list_hyphenate" -> false
            key == "pref_list_right_margin" -> 0
            key == "pref_list_wrap_under_text" -> false
            key == "pref_list_item_spacing" -> 4
            key == "pref_list_line_height" -> "1.5"
            key == "pref_list_bullet_color" -> "default"
            key == "pref_list_number_color" -> "default"
            key == "pref_todo_unchecked_color" -> "default"
            key == "pref_todo_checked_color" -> "default"
            key == "pref_todo_checkmark_color" -> "default"
            key == "pref_todo_hide_extra_bullet" -> false
            key == "pref_blockquote_line_thickness" -> 4
            key == "pref_blockquote_line_style" -> "solid"
            key == "pref_blockquote_line_color" -> "default"
            key == "pref_blockquote_bg_color" -> "default"
            key == "pref_blockquote_text_color" -> "default"
            key == "pref_blockquote_inherit_body_typography" -> true
            key == "pref_blockquote_font_family" -> "default"
            key == "pref_font_file_blockquote" -> null
            key == "pref_blockquote_font_weight" -> 400
            key == "pref_blockquote_font_size" -> 16
            key == "pref_blockquote_letter_spacing" -> "0px"
            key == "pref_blockquote_text_align" -> "default"
            key == "pref_blockquote_hyphenate" -> false
            key == "pref_blockquote_line_height" -> "1.6"
            key == "pref_blockquote_left_indent" -> 0
            key == "pref_blockquote_right_margin" -> 0
            key == "pref_blockquote_padding" -> 12
            key == "pref_callout_line_thickness" -> 4
            key == "pref_callout_line_style" -> "solid"
            key == "pref_callout_line_color" -> "default"
            key == "pref_callout_bg_color" -> "default"
            key == "pref_callout_text_color" -> "default"
            key == "pref_callout_inherit_body_typography" -> true
            key == "pref_callout_font_family" -> "default"
            key == "pref_font_file_callout" -> null
            key == "pref_callout_font_weight" -> 400
            key == "pref_callout_font_size" -> 16
            key == "pref_callout_letter_spacing" -> "0px"
            key == "pref_callout_text_align" -> "default"
            key == "pref_callout_hyphenate" -> false
            key == "pref_callout_line_height" -> "1.6"
            key == "pref_callout_margin_left" -> 0
            key == "pref_callout_margin_right" -> 0
            key == "pref_callout_padding" -> 12
            key == "pref_callout_header_bg_color" -> "default"
            key == "pref_callout_header_title_color" -> "default"
            key == "pref_callout_header_title_size" -> 0
            key == "pref_callout_header_font_family" -> "default"
            key == "pref_callout_header_font_weight" -> 700
            key == "pref_callout_header_padding" -> 0
            key == "pref_callout_header_accent_color" -> "default"
            key == "pref_callout_header_accent_thickness" -> 0
            key == "pref_font_file_callout_header" -> null
            key == "pref_font_file_code_block" -> null
            key == "pref_font_file_table" -> null
            key == "pref_font_file_footnote" -> null
            key == "pref_callout_type_selector" -> "info"
            key.startsWith("pref_callout_type_") -> "default"
            key == "pref_table_margin_left" -> 0
            key == "pref_table_margin_right" -> 0
            key == "pref_table_inherit_body_typography" -> true
            key == "pref_table_font_family" -> "default"
            key == "pref_table_font_weight" -> 400
            key == "pref_table_font_size" -> 15
            key == "pref_table_letter_spacing" -> "0px"
            key == "pref_table_hyphenate" -> false
            key == "pref_table_line_height" -> "1.6"
            key == "pref_table_border_style" -> "solid"
            key == "pref_table_border_thickness" -> 1
            key == "pref_table_border_color" -> "default"
            key == "pref_table_header_bg_color" -> "default"
            key == "pref_table_header_text_color" -> "default"
            key == "pref_table_header_font_weight" -> 700
            key == "pref_table_cell_bg_color" -> "default"
            key == "pref_table_cell_text_color" -> "default"
            key == "pref_table_cell_padding" -> 8
            key == "pref_table_menu_bg_color" -> "default"
            key == "pref_table_menu_action_bg_color" -> "default"
            key == "pref_table_menu_text_color" -> "default"
            key == "pref_table_menu_disabled_color" -> "default"
            key == "pref_table_menu_pressed_bg_color" -> "default"
            key == "pref_code_block_margin_left" -> 0
            key == "pref_code_block_margin_right" -> 0
            key == "pref_code_block_font_size" -> 14
            key == "pref_code_block_padding" -> 16
            key == "pref_code_block_border_radius" -> 6
            key == "pref_code_block_line_height" -> "1.4"
            key == "pref_code_block_lang_label_color" -> "default"
            key == "pref_hr_thickness" -> 2
            key == "pref_hr_style" -> "solid"
            key == "pref_hr_color" -> "default"
            key == "pref_hr_margin_left" -> 0
            key == "pref_hr_margin_right" -> 0
            key == "pref_hr_centered" -> false
            key == "pref_hr_width_percent" -> 100
            key == "pref_hr_margin_top" -> 16
            key == "pref_hr_margin_bottom" -> 16
            key == "pref_justify_paragraph" -> false
            key == "pref_paragraph_hyphenate" -> false
            key == "pref_paragraph_line_height" -> "1.6"
            key == "pref_letter_spacing" -> "0px"
            key == "pref_line_wrap" -> true
            key == "pref_bold_color" -> "default"
            key == "pref_italic_color" -> "default"
            key == "pref_link_color" -> "default"
            key == "pref_code_color" -> "default"
            key == "pref_code_bg_color" -> "default"
            key == "pref_cursor_color" -> "default"
            key == "pref_cursor_width" -> 2
            key == "pref_cursor_blink_rate" -> "0.8s"
            key == "pref_selection_highlight_bg_color" -> "default"
            key == "pref_selection_highlight_text_color" -> "default"
            key == "pref_findreplace_panel_bg" -> "default"
            key == "pref_findreplace_panel_border" -> "default"
            key == "pref_findreplace_field_find_bg" -> "default"
            key == "pref_findreplace_field_find_color" -> "default"
            key == "pref_findreplace_field_find_placeholder" -> "default"
            key == "pref_findreplace_field_find_border" -> "default"
            key == "pref_findreplace_field_find_focus_border" -> "default"
            key == "pref_findreplace_field_find_font_size" -> 14
            key == "pref_findreplace_field_replace_bg" -> "default"
            key == "pref_findreplace_field_replace_color" -> "default"
            key == "pref_findreplace_field_replace_placeholder" -> "default"
            key == "pref_findreplace_field_replace_border" -> "default"
            key == "pref_findreplace_field_replace_focus_border" -> "default"
            key == "pref_findreplace_field_replace_font_size" -> 14
            key == "pref_findreplace_field_height" -> 32
            key == "pref_findreplace_counter_color" -> "default"
            key == "pref_findreplace_counter_bg" -> "default"
            key == "pref_findreplace_match_bg" -> "default"
            key == "pref_findreplace_current_match_bg" -> "default"
            key == "pref_findreplace_current_match_color" -> "default"
            key.startsWith("pref_findreplace_btn_") && key.endsWith("_width") -> 28
            key.startsWith("pref_findreplace_btn_") && key.endsWith("_svg") -> ""
            key.startsWith("pref_findreplace_btn_") -> "default"
            key == "pref_code_block_color" -> "default"
            key == "pref_code_block_bg_color" -> "default"
            key == "pref_code_block_text_bg_color" -> "default"
            key == "pref_code_block_label_bg_color" -> "default"
            key == "pref_code_block_copy_bg_color" -> "default"
            key == "pref_code_block_copy_text_color" -> "default"
            key == "pref_code_block_border_color" -> "default"
            key.startsWith("pref_heading_") && key.endsWith("_color") -> "default"
            key == "pref_toolbar_bg_color" -> "default"
            key == "pref_toolbar_icon_color" -> "default"
            key == "pref_toolbar_active_key_bg_color" -> "default"
            key == "pref_toolbar_show_labels" -> false
            key == "pref_toolbar_label_size" -> 8
            key == "pref_toolbar_label_color" -> "default"
            key == "pref_toolbar_toggle_bg_color" -> "default"
            key == "pref_toolbar_toggle_icon_color" -> "default"
            key == "pref_toolbar_toggle_closed_width" -> 34
            key == "pref_toolbar_toggle_closed_height" -> 34
            key == "pref_toolbar_height" -> 48
            key == "pref_toolbar_padding" -> 4
            key == "pref_toolbar_floating_enabled" -> false
            key == "pref_toolbar_floating_key_width" -> 48
            key == "pref_toolbar_floating_corner_radius" -> 24
            key == "pref_app_theme" -> "amoled"
            key == "pref_toc_panel_width" -> 80
            key == "pref_toc_default_level" -> 2
            key == "pref_toc_expand_levels_per_tap" -> 1
            key == "pref_toc_hide_file_extension" -> false
            key == "pref_toc_panel_bg_color" -> "default"
            key == "pref_toc_panel_bg_opacity" -> 100
            key == "pref_toc_panel_border_color" -> "default"
            key == "pref_toc_overlay_dim" -> 50
            key == "pref_toc_font_size" -> 16
            key == "pref_toc_font_weight" -> 600
            key == "pref_toc_text_color" -> "default"
            key == "pref_toc_active_text_color" -> "#FFFF00"
            key == "pref_toc_active_bg_color" -> "default"
            key == "pref_toc_search_highlight_bg_color" -> "#FFFFC107"
            key == "pref_toc_history_bg_color" -> "default"
            key == "pref_toc_history_border_color" -> "default"
            key == "pref_toc_history_icon_color" -> "default"
            key == "pref_toc_toggle_bg_color" -> "default"
            key == "pref_toc_toggle_icon_color" -> "default"
            key == "pref_toc_toggle_active_bg_color" -> "default"
            key == "pref_toc_toggle_active_icon_color" -> "default"
            key == "pref_toc_text_overflow" -> "truncate"
            key == "pref_toc_row_spacing" -> 4
            key == "pref_toc_indent_spacing" -> 12
            key == "pref_left_panel_width" -> 80
            key == "pref_left_panel_bg_color" -> "default"
            key == "pref_left_panel_bg_opacity" -> 100
            key == "pref_left_panel_border_color" -> "default"
            key == "pref_left_panel_overlay_dim" -> 50
            key == "pref_left_panel_font_family" -> "default"
            key == "pref_left_panel_font_size" -> 16
            key == "pref_left_panel_font_weight" -> 600
            key == "pref_left_panel_text_color" -> "default"
            key == "pref_left_panel_row_spacing" -> 2
            key == "pref_left_panel_search_keep_open" ||
                key == "pref_left_panel_folders_keep_open" ||
                key == "pref_left_panel_tabs_keep_open" -> false
            key == "pref_image_mode" -> "picker"
            key == "pref_settings_category_title_color" -> "#00E5FF"
            key == "pref_settings_title_color" -> "#FFFFFF"
            key == "pref_settings_summary_color" -> "#AAAAAA"
            key == "pref_settings_switch_color" -> "#00E5FF"
            key == "pref_settings_reset_icon_color" -> "#00E5FF"
            key == "pref_settings_reset_inactive_icon_color" -> "#555555"
            key == "pref_settings_bg_color" -> "#000000"
            key == "pref_hide_status_bar" -> false
            key == "pref_hide_nav_bar" -> false
            key == "pref_editor_mode" -> "wysiwyg"
            key == "pref_export_format" -> "html"
            key == "pref_export_include_css" -> true
            key == "pref_export_css_placement" -> "head"
            key == "pref_export_include_toc" -> true
            key == "pref_export_toc_levels" -> 3
            key == "pref_hotkey_export" -> "ctrl+shift+e"
            key == "pref_hotkey_open_with" -> "ctrl+shift+o"
            key == "pref_hotkey_line_numbers" -> "ctrl+alt+l"
            key == "pref_hotkey_footnote" -> "ctrl+shift+f"
            key == "pref_footnote_inherit_body_typography" -> true
            key == "pref_footnote_font_weight" -> 400
            key == "pref_footnote_letter_spacing" -> "0px"
            key == "pref_footnote_font_size" -> 14
            key == "pref_footnote_text_color" -> "default"
            key == "pref_footnote_ref_color" -> "default"
            key == "pref_footnote_link_color" -> "default"
            key == "pref_footnote_bg_color" -> "default"
            key == "pref_footnote_text_align" -> "default"
            key == "pref_footnote_line_height" -> "default"
            key == "pref_footnote_hyphenate" -> false
            key == "pref_auto_save_on_leave" -> true
            key == "pref_hotkey_new" -> "ctrl+n"
            key == "pref_hotkey_history_back" -> "alt+left"
            key == "pref_hotkey_history_forward" -> "alt+right"
            key == "pref_hotkey_open" -> "ctrl+o"
            key == "pref_hotkey_save" -> "ctrl+s"
            key == "pref_hotkey_save_as" -> "ctrl+shift+s"
            key == "pref_hotkey_save_as_textpack" -> "ctrl+shift+alt+s"
            key == "pref_hotkey_image" -> "ctrl+shift+i"
            key == "pref_hotkey_settings" -> "ctrl+,"
            key == "pref_hotkey_toggle_toolbar" -> "ctrl+t"
            key == "pref_hotkey_line_wrap" -> "ctrl+alt+w"
            key == "pref_hotkey_bold" -> "ctrl+b"
            key == "pref_hotkey_italic" -> "ctrl+i"
            key == "pref_hotkey_underline" -> "ctrl+u"
            key == "pref_hotkey_strikethrough" -> "ctrl+shift+x"
            key == "pref_hotkey_code" -> "ctrl+e"
            key == "pref_hotkey_link" -> "ctrl+k"
            key == "pref_hotkey_blockQuote" -> "ctrl+shift+q"
            key == "pref_hotkey_callout" -> "ctrl+alt+q"
            key == "pref_hotkey_codeBlock" -> "ctrl+shift+c"
            key == "pref_hotkey_bulletedList" -> "ctrl+shift+8"
            key == "pref_hotkey_numberedList" -> "ctrl+shift+7"
            key == "pref_hotkey_todoList" -> "ctrl+shift+l"
            key == "pref_hotkey_indent" -> "tab"
            key == "pref_hotkey_outdent" -> "shift+tab"
            key == "pref_hotkey_horizontalLine" -> "ctrl+shift+h"
            key == "pref_hotkey_findAndReplace" -> "ctrl+f"
            key == "pref_hotkey_sourceEditing" -> "ctrl+shift+u"
            key == "pref_hotkey_heading_p" -> "ctrl+alt+0"
            key == "pref_hotkey_heading_1" -> "ctrl+alt+1"
            key == "pref_hotkey_heading_2" -> "ctrl+alt+2"
            key == "pref_hotkey_heading_3" -> "ctrl+alt+3"
            key == "pref_hotkey_heading_4" -> "ctrl+alt+4"
            key == "pref_hotkey_heading_5" -> "ctrl+alt+5"
            key == "pref_hotkey_heading_6" -> "ctrl+alt+6"
            key == "pref_hotkey_highlight_yellow" -> "ctrl+alt+y"
            key == "pref_hotkey_highlight_green" -> "ctrl+alt+g"
            key == "pref_hotkey_highlight_pink" -> "ctrl+alt+p"
            key == "pref_hotkey_highlight_blue" -> "ctrl+alt+b"
            key == "pref_hotkey_highlight_red" -> "ctrl+alt+r"
            key == "pref_hotkey_highlight_red_pen" -> "ctrl+alt+r"
            key == "pref_hotkey_highlight_green_pen" -> "ctrl+alt+shift+g"
            key == "pref_hotkey_highlight_remove" -> "ctrl+alt+x"
            else -> null
        }
    }

    private fun getPerHeadingOverrideDefault(key: String): Any? {
        val match = Regex("^pref_heading_[1-6]_(.+)$").matchEntire(key) ?: return null
        return when (match.groupValues[1]) {
            "scale_percent" -> 100
            "font_weight" -> 700
            "color", "underline_color" -> "default"
            "align" -> "default"
            "line_height" -> "1.2"
            "letter_spacing", "word_spacing" -> "0px"
            "text_transform" -> "none"
            "underline_style" -> "none"
            "underline_thickness" -> 2
            "margin_left", "margin_right" -> 0
            "margin_top" -> 16
            "margin_bottom" -> 8
            else -> null
        }
    }

    fun getHeadingOverrideInheritedValue(
        prefs: android.content.SharedPreferences,
        key: String
    ): Any? {
        val match = Regex("^pref_heading_[1-6]_(.+)$").matchEntire(key) ?: return null
        val globalKey = when (match.groupValues[1]) {
            "scale_percent" -> "pref_heading_scale_percent"
            "font_weight" -> "pref_font_weight_heading"
            "color" -> "pref_heading_color"
            "align" -> "pref_heading_align"
            "line_height" -> "pref_heading_line_height"
            "letter_spacing" -> "pref_heading_letter_spacing"
            "word_spacing" -> "pref_heading_word_spacing"
            "text_transform" -> "pref_heading_text_transform"
            "underline_style" -> "pref_heading_underline_style"
            "underline_thickness" -> "pref_heading_underline_thickness"
            "underline_color" -> "pref_heading_underline_color"
            "margin_left" -> "pref_heading_margin_left"
            "margin_right" -> "pref_heading_margin_right"
            "margin_top" -> "pref_heading_margin_top"
            "margin_bottom" -> "pref_heading_margin_bottom"
            else -> return null
        }

        return when (val defaultValue = getDefaultValue(globalKey)) {
            is Int -> prefs.getInt(globalKey, defaultValue)
            is String -> prefs.getString(globalKey, defaultValue) ?: defaultValue
            is Boolean -> prefs.getBoolean(globalKey, defaultValue)
            else -> null
        }
    }

    /**
     * Older heading controls persisted their displayed default values as if
     * they were user-selected overrides. Remove only values that still match
     * either the original heading default or the current global value so those
     * levels inherit again. Values that differ from both are preserved.
     */
    fun migratePersistedHeadingDefaults(prefs: android.content.SharedPreferences) {
        if (prefs.getBoolean(HEADING_OVERRIDE_DEFAULTS_MIGRATED, false)) return

        val editor = prefs.edit()
        for ((key, storedValue) in prefs.all) {
            if (!Regex("^pref_heading_[1-6]_(?!settings_toggle$).+").matches(key)) {
                continue
            }

            val originalDefault = getPerHeadingOverrideDefault(key) ?: continue
            val currentInheritedValue = getHeadingOverrideInheritedValue(prefs, key)
            if (
                preferenceValuesMatch(storedValue, originalDefault) ||
                preferenceValuesMatch(storedValue, currentInheritedValue)
            ) {
                editor.remove(key)
            }
        }
        editor.putBoolean(HEADING_OVERRIDE_DEFAULTS_MIGRATED, true).apply()
    }

    private fun preferenceValuesMatch(storedValue: Any?, expectedValue: Any?): Boolean =
        when (expectedValue) {
            is Int -> storedValue is Int && storedValue == expectedValue
            is Boolean -> storedValue is Boolean && storedValue == expectedValue
            is String -> storedValue is String && storedValue == expectedValue
            else -> false
        }

    private fun shouldShowResetButton(key: String?): Boolean =
        key != null &&
            key != "pref_reset_all_defaults" &&
            key != "pref_export_backup" &&
            key != "pref_import_backup" &&
            !key.startsWith("pref_page_") &&
            !key.endsWith("_page")

    fun isModifiedFromDefault(context: Context, key: String?): Boolean {
        if (key == null || !shouldShowResetButton(key)) return false

        val prefs = PreferenceManager.getDefaultSharedPreferences(context)

        if (Regex("^pref_heading_[1-6]_(?!settings_toggle$).+").matches(key)) {
            return prefs.contains(key)
        }

        if (key.startsWith("pref_font_file_")) {
            val fontPath = prefs.getString("${key}_path", null)
            val fontName = prefs.getString("${key}_name", null)
            return !fontPath.isNullOrEmpty() || !fontName.isNullOrEmpty()
        }

        if (!prefs.contains(key)) return false

        val defaultVal = getDefaultValue(key) ?: return false

        return when (defaultVal) {
            is Int -> prefs.getInt(key, defaultVal) != defaultVal
            is Boolean -> prefs.getBoolean(key, defaultVal) != defaultVal
            is String -> prefs.getString(key, defaultVal) != defaultVal
            else -> false
        }
    }

    private const val RESET_CONTROL_ROW_TAG = "reset_control_row"

    fun bindResetButton(holder: PreferenceViewHolder, preference: Preference) {
        val context = preference.context
        val key = preference.key
        val showReset = shouldShowResetButton(key)

        var button = holder.itemView.findViewById<ImageView>(R.id.btn_reset_widget)
        if (!showReset) {
            button?.visibility = View.INVISIBLE
            applySettingsTheme(holder, preference)
            return
        }

        val seekBarRow =
            holder.findViewById(androidx.preference.R.id.seekbar)?.parent as? LinearLayout
        val widgetFrame =
            holder.findViewById(android.R.id.widget_frame) as? ViewGroup
        val targetRow = seekBarRow ?: ensureHorizontalWidgetRow(context, widgetFrame)

        if (targetRow == null) {
            android.util.Log.e("PreferenceReset", "No reset slot for preference: $key")
            button?.visibility = View.INVISIBLE
            applySettingsTheme(holder, preference)
            return
        }

        targetRow.orientation = LinearLayout.HORIZONTAL
        targetRow.gravity = Gravity.CENTER_VERTICAL
        if (seekBarRow != null) {
            // AndroidX's seekbar widget layout adds 16dp of trailing padding
            // inside this row. The preference item already supplies the shared
            // trailing inset used by other reset controls.
            seekBarRow.setPaddingRelative(
                seekBarRow.paddingStart,
                seekBarRow.paddingTop,
                0,
                seekBarRow.paddingBottom
            )
        }

        val seekBar = holder.findViewById(
            androidx.preference.R.id.seekbar
        ) as? android.widget.SeekBar
        if (seekBar?.parent === targetRow) {
            (seekBar.layoutParams as? LinearLayout.LayoutParams)?.let { params ->
                params.width = 0
                params.weight = 1f
                seekBar.layoutParams = params
            }
        }

        if (button == null) button = createResetButton(context)
        if (button.parent !== targetRow) {
            (button.parent as? ViewGroup)?.removeView(button)
            targetRow.addView(
                button,
                LinearLayout.LayoutParams(dp(context, 40), dp(context, 40)).apply {
                    gravity = Gravity.CENTER_VERTICAL
                    marginStart = dp(context, 4)
                }
            )
        }

        button.visibility = View.VISIBLE
        val seekBarValue = holder.findViewById(
            androidx.preference.R.id.seekbar_value
        ) as? TextView
        if (seekBarValue?.parent === targetRow) {
            targetRow.removeView(button)
            targetRow.removeView(seekBarValue)
            targetRow.addView(
                seekBarValue,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER_VERTICAL
                    marginStart = dp(context, 4)
                }
            )
            targetRow.addView(
                button,
                LinearLayout.LayoutParams(dp(context, 40), dp(context, 40)).apply {
                    gravity = Gravity.CENTER_VERTICAL
                    marginStart = dp(context, 4)
                }
            )
        }
        val modified = isModifiedFromDefault(context, key)
        button.isEnabled = modified
        button.alpha = if (modified) 1f else 0.45f
        button.setOnClickListener {
            if (isModifiedFromDefault(context, key)) {
                resetSinglePreference(context, preference)
            }
        }

        applySettingsTheme(holder, preference)
    }

    private fun ensureHorizontalWidgetRow(
        context: Context,
        widgetFrame: ViewGroup?
    ): LinearLayout? {
        if (widgetFrame == null) return null

        val existingRow =
            widgetFrame.findViewWithTag<LinearLayout>(RESET_CONTROL_ROW_TAG)
        if (existingRow != null) return existingRow

        if (widgetFrame is LinearLayout &&
            widgetFrame.orientation == LinearLayout.HORIZONTAL
        ) {
            return widgetFrame
        }

        val oldChildren = (0 until widgetFrame.childCount)
            .map { widgetFrame.getChildAt(it) }
            .filterNot { it.id == R.id.btn_reset_widget }
        widgetFrame.removeAllViews()

        val row = LinearLayout(context).apply {
            tag = RESET_CONTROL_ROW_TAG
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        oldChildren.forEach { child ->
            (child.parent as? ViewGroup)?.removeView(child)
            row.addView(
                child,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
        }

        val rowParams = if (widgetFrame is android.widget.FrameLayout) {
            android.widget.FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.END or Gravity.CENTER_VERTICAL
            )
        } else {
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        widgetFrame.addView(row, rowParams)
        return row
    }

    private fun createResetButton(context: Context): ImageView {
        val padding = dp(context, 7)
        val typedValue = TypedValue()
        context.theme.resolveAttribute(
            android.R.attr.selectableItemBackgroundBorderless,
            typedValue,
            true
        )
        return ImageView(context).apply {
            id = R.id.btn_reset_widget
            setImageResource(R.drawable.ic_reset)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(padding, padding, padding, padding)
            isClickable = true
            isFocusable = true
            contentDescription = "Reset setting to default"
            setBackgroundResource(typedValue.resourceId)
        }
    }

    private fun dp(context: Context, value: Int): Int =
        (value * context.resources.displayMetrics.density).toInt()

    fun applySettingsTheme(holder: PreferenceViewHolder, preference: Preference) {
        val context = preference.context
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)

        val catColorHex = prefs.getString("pref_settings_category_title_color", "#00E5FF") ?: "#00E5FF"
        val titleColorHex = prefs.getString("pref_settings_title_color", "#FFFFFF") ?: "#FFFFFF"
        val summaryColorHex = prefs.getString("pref_settings_summary_color", "#AAAAAA") ?: "#AAAAAA"
        val switchColorHex = prefs.getString("pref_settings_switch_color", "#00E5FF") ?: "#00E5FF"
        val resetIconColorHex = prefs.getString("pref_settings_reset_icon_color", "#00E5FF") ?: "#00E5FF"
        val resetInactiveColorHex = prefs.getString("pref_settings_reset_inactive_icon_color", "#555555") ?: "#555555"

        val catColor = ColorPickerDialog.parseHexColor(catColorHex, android.graphics.Color.parseColor("#00E5FF"))
        val titleColor = ColorPickerDialog.parseHexColor(titleColorHex, android.graphics.Color.WHITE)
        val summaryColor = ColorPickerDialog.parseHexColor(summaryColorHex, android.graphics.Color.parseColor("#AAAAAA"))
        val switchColor = ColorPickerDialog.parseHexColor(switchColorHex, android.graphics.Color.parseColor("#00E5FF"))
        val resetIconColor = ColorPickerDialog.parseHexColor(resetIconColorHex, android.graphics.Color.parseColor("#00E5FF"))
        val resetInactiveColor = ColorPickerDialog.parseHexColor(resetInactiveColorHex, android.graphics.Color.parseColor("#555555"))

        val titleView = holder.findViewById(android.R.id.title) as? android.widget.TextView
        val summaryView = holder.findViewById(android.R.id.summary) as? android.widget.TextView

        if (preference is androidx.preference.PreferenceCategory) {
            titleView?.apply {
                textSize = 20f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(catColor)
            }
        } else {
            titleView?.apply {
                textSize = 16f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(titleColor)
            }
            summaryView?.apply {
                textSize = 13f
                setTextColor(summaryColor)
            }
        }

        val btnReset = holder.itemView.findViewById<ImageView>(R.id.btn_reset_widget)
        val isModified = isModifiedFromDefault(context, preference.key)
        btnReset?.setColorFilter(if (isModified) resetIconColor else resetInactiveColor)

        val widgetFrame = holder.findViewById(android.R.id.widget_frame) as? ViewGroup
        if (widgetFrame != null) {
            // AndroidX hides empty widget frames before this custom swatch is added.
            widgetFrame.visibility = View.VISIBLE
            findAndTintSwitches(widgetFrame, switchColor)
        }
    }

    private fun findAndTintSwitches(viewGroup: ViewGroup, color: Int) {
        for (i in 0 until viewGroup.childCount) {
            val child = viewGroup.getChildAt(i)
            if (child is androidx.appcompat.widget.SwitchCompat) {
                child.thumbTintList = android.content.res.ColorStateList.valueOf(color)
                child.trackTintList = android.content.res.ColorStateList.valueOf(
                    android.graphics.Color.argb(128, android.graphics.Color.red(color), android.graphics.Color.green(color), android.graphics.Color.blue(color))
                )
            } else if (child is android.widget.CompoundButton) {
                child.buttonTintList = android.content.res.ColorStateList.valueOf(color)
            } else if (child is ViewGroup) {
                findAndTintSwitches(child, color)
            }
        }
    }

    fun resetSinglePreference(context: Context, pref: Preference) {
        val key = pref.key ?: return
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)

        if (key.startsWith("pref_font_file_")) {
            prefs.edit().remove("${key}_path").remove("${key}_name").apply()
            val fontDir = File(context.filesDir, "fonts")
            if (fontDir.exists()) {
                fontDir.listFiles()?.forEach { file ->
                    if (file.name.startsWith(key)) {
                        file.delete()
                    }
                }
            }
            if (pref.summary != null) {
                pref.summary = "Tap to pick a font file (.ttf, .otf, .woff, .woff2)"
            }
            if (pref is ResettablePreference) {
                pref.callNotifyChanged()
            }
            ThemedToast.show(context, "Font reset to default system font", Toast.LENGTH_SHORT)
            return
        }

        val isHeadingOverride =
            Regex("^pref_heading_[1-6]_(?!settings_toggle$).+").matches(key)
        val inheritedHeadingValue = if (isHeadingOverride) {
            getHeadingOverrideInheritedValue(prefs, key)
        } else {
            null
        }

        prefs.edit().remove(key).apply()

        val defVal = if (isHeadingOverride) {
            inheritedHeadingValue ?: getDefaultValue(key)
        } else {
            getDefaultValue(key)
        }
        if (isHeadingOverride && defVal != null) {
            pref.setDefaultValue(defVal)
        }
        when (pref) {
            is SeekBarPreference -> {
                if (defVal is Int) {
                    pref.value = defVal
                }
            }
            is EditTextPreference -> {
                if (defVal is String) pref.text = defVal
            }
            is ListPreference -> {
                if (defVal is String) pref.value = defVal
            }
            is SwitchPreferenceCompat -> {
                if (defVal is Boolean) pref.isChecked = defVal
            }
        }
        // Setters above may persist their value. For a heading override, the
        // value shown by the control is inherited; its key must remain absent.
        if (isHeadingOverride) {
            prefs.edit().remove(key).apply()
        }
        if (pref is ResettablePreference) {
            pref.callNotifyChanged()
        }
        ThemedToast.show(context, "Setting reset to default ↺", Toast.LENGTH_SHORT)
    }
}

open class ResetPreferenceCategory @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = androidx.preference.R.attr.preferenceCategoryStyle
) : androidx.preference.PreferenceCategory(context, attrs, defStyleAttr) {
    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        PreferenceResetHelper.applySettingsTheme(holder, this)
    }
}

class ExpandablePreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = androidx.preference.R.attr.preferenceStyle
) : Preference(context, attrs, defStyleAttr) {
    var isExpanded: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            notifyChanged()
        }

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        val chevron = holder.findViewById(R.id.preference_expand_chevron)
            as? android.widget.TextView ?: return
        chevron.text = if (isExpanded) "⌄" else "›"
        chevron.contentDescription = if (isExpanded) {
            "Collapse settings"
        } else {
            "Expand settings"
        }
    }
}

open class ResetPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = androidx.preference.R.attr.preferenceStyle
) : Preference(context, attrs, defStyleAttr), ResettablePreference {
    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        PreferenceResetHelper.bindResetButton(holder, this)
    }
    override fun callNotifyChanged() {
        notifyChanged()
    }
}

open class ResetColorPickerPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = androidx.preference.R.attr.preferenceStyle
) : Preference(context, attrs, defStyleAttr), ResettablePreference {

    override fun getSummary(): CharSequence? {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val colorHex = prefs.getString(key, "default") ?: "default"
        if (colorHex != "default") {
            return "Selected: $colorHex"
        }
        return super.getSummary()
    }

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        PreferenceResetHelper.bindResetButton(holder, this)

        val widgetFrame = holder.findViewById(android.R.id.widget_frame) as? ViewGroup
        if (widgetFrame != null) {
            val previewHost =
                widgetFrame.findViewWithTag<LinearLayout>("reset_control_row")
                    ?: widgetFrame as? LinearLayout

            val previewTag = "color_picker_preview_circle"
            var previewCircle = previewHost?.findViewWithTag<View>(previewTag)
            if (previewCircle == null && previewHost != null) {
                val density = context.resources.displayMetrics.density
                val sizePx = (24 * density).toInt()
                val createdCircle = View(context).apply {
                    tag = previewTag
                    layoutParams = LinearLayout.LayoutParams(sizePx, sizePx).apply {
                        marginEnd = (8 * density).toInt()
                    }
                }
                previewHost.addView(createdCircle, 0)
                previewCircle = createdCircle
            }

            val prefs = PreferenceManager.getDefaultSharedPreferences(context)
            val colorHex = prefs.getString(key, "default") ?: "default"
            val effectiveHex = if (colorHex == "default") {
                PreferenceResetHelper.getDefaultColorHex(context, key)
            } else {
                colorHex
            }
            val colorInt = ColorPickerDialog.parseHexColor(effectiveHex, android.graphics.Color.WHITE)

            previewCircle?.background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(colorInt)
                setStroke((1.5 * context.resources.displayMetrics.density).toInt(), android.graphics.Color.parseColor("#888888"))
            }
        }
    }

    override fun onClick() {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val currentColor = prefs.getString(key, "default") ?: "default"
        val effectiveHex = if (currentColor == "default") {
            PreferenceResetHelper.getDefaultColorHex(context, key)
        } else {
            currentColor
        }

        ColorPickerDialog(context, effectiveHex) { selectedHex ->
            prefs.edit().putString(key, selectedHex).apply()
            notifyChanged()
            ThemedToast.show(context, "Color set to $selectedHex", Toast.LENGTH_SHORT)
        }.show()
    }

    override fun callNotifyChanged() {
        notifyChanged()
    }
}

open class ResetSeekBarPreference : SeekBarPreference, ResettablePreference {
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int, defStyleRes: Int) : super(context, attrs, defStyleAttr, defStyleRes)
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int) : super(context, attrs, defStyleAttr)
    constructor(context: Context, attrs: AttributeSet?) : super(context, attrs, androidx.preference.R.attr.seekBarPreferenceStyle)
    constructor(context: Context) : super(context)

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        // Match the shared custom preference row's trailing inset so this
        // fixed-width reset control lines up with the other preference types.
        val density = context.resources.displayMetrics.density
        holder.itemView.setPadding(
            (4 * density).toInt(),
            holder.itemView.paddingTop,
            (8 * density).toInt(),
            holder.itemView.paddingBottom
        )
        PreferenceResetHelper.bindResetButton(holder, this)
    }
    override fun callNotifyChanged() {
        notifyChanged()
    }
}

open class ResetEditTextPreference : EditTextPreference, ResettablePreference {
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int, defStyleRes: Int) : super(context, attrs, defStyleAttr, defStyleRes)
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int) : super(context, attrs, defStyleAttr)
    constructor(context: Context, attrs: AttributeSet?) : super(context, attrs, androidx.preference.R.attr.editTextPreferenceStyle)
    constructor(context: Context) : super(context)

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        PreferenceResetHelper.bindResetButton(holder, this)
    }
    override fun callNotifyChanged() {
        notifyChanged()
    }
}

open class ResetListPreference : ListPreference, ResettablePreference {
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int, defStyleRes: Int) : super(context, attrs, defStyleAttr, defStyleRes)
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int) : super(context, attrs, defStyleAttr)
    constructor(context: Context, attrs: AttributeSet?) : super(context, attrs, androidx.preference.R.attr.dialogPreferenceStyle)
    constructor(context: Context) : super(context)

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        PreferenceResetHelper.bindResetButton(holder, this)
    }
    override fun callNotifyChanged() {
        notifyChanged()
    }
}

open class ResetSwitchPreference : SwitchPreferenceCompat, ResettablePreference {
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int, defStyleRes: Int) : super(context, attrs, defStyleAttr, defStyleRes)
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int) : super(context, attrs, defStyleAttr)
    constructor(context: Context, attrs: AttributeSet?) : super(context, attrs, androidx.preference.R.attr.switchPreferenceCompatStyle)
    constructor(context: Context) : super(context)

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        PreferenceResetHelper.bindResetButton(holder, this)
    }
    override fun callNotifyChanged() {
        notifyChanged()
    }
}
