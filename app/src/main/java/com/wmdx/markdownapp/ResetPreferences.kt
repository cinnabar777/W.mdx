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

    fun getDefaultColorHex(key: String?): String {
        return when (key) {
            "pref_settings_category_title_color" -> "#00E5FF"
            "pref_settings_title_color" -> "#FFFFFF"
            "pref_settings_summary_color" -> "#AAAAAA"
            "pref_settings_switch_color" -> "#00E5FF"
            "pref_settings_reset_icon_color" -> "#00E5FF"
            "pref_settings_bg_color" -> "#000000"
            "pref_toolbar_bg_color" -> "#121212"
            "pref_toolbar_icon_color" -> "#FFFFFF"
            "pref_toolbar_active_icon_color" -> "#00E5FF"
            "pref_heading_underline_color" -> "#FFFFFF"
            "pref_blockquote_line_color" -> "#444444"
            "pref_blockquote_bg_color" -> "#1A1A1A"
            "pref_blockquote_text_color" -> "#FFFFFF"
            "pref_callout_line_color" -> "#29B6F6"
            "pref_callout_bg_color" -> "#1A232A"
            "pref_hr_color" -> "#444444"
            "pref_bold_color" -> "#FFFFFF"
            "pref_italic_color" -> "#FFFFFF"
            "pref_link_color" -> "#29B6F6"
            "pref_code_color" -> "#FF80AB"
            "pref_code_bg_color" -> "#212121"
            "pref_code_block_color" -> "#E0E0E0"
            "pref_code_block_bg_color" -> "#121212"
            "pref_code_block_lang_label_color" -> "#AAAAAA"
            "pref_list_bullet_color" -> "#00E5FF"
            "pref_list_number_color" -> "#00E5FF"
            "pref_todo_unchecked_color" -> "#888888"
            "pref_todo_checked_color" -> "#00E5FF"
            "pref_table_border_color" -> "#444444"
            "pref_table_header_bg_color" -> "#252525"
            "pref_table_header_text_color" -> "#FFFFFF"
            "pref_table_cell_bg_color" -> "#000000"
            "pref_table_cell_text_color" -> "#FFFFFF"
            "pref_footnote_text_color" -> "#E0E0E0"
            "pref_footnote_ref_color" -> "#29B6F6"
            "pref_footnote_link_color" -> "#29B6F6"
            "pref_footnote_bg_color" -> "#1A1A1A"
            else -> {
                if (key != null && key.startsWith("pref_heading_") && key.endsWith("_color")) {
                    "#FFFFFF"
                } else {
                    "#FFFFFF"
                }
            }
        }
    }

    fun getDefaultValue(key: String): Any? {
        return when {
            key == "pref_body_font_size" -> 16
            key == "pref_heading_scale_percent" -> 100
            key == "pref_font_weight_bold" -> 700
            key == "pref_font_weight_italic" -> 400
            key == "pref_font_weight_heading" -> 700
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
            key == "pref_code_padding" -> 4
            key == "pref_code_border_radius" -> 4
            key == "pref_list_left_indent" -> 24
            key == "pref_list_item_spacing" -> 4
            key == "pref_list_line_height" -> "1.5"
            key == "pref_list_bullet_color" -> "default"
            key == "pref_list_number_color" -> "default"
            key == "pref_todo_unchecked_color" -> "default"
            key == "pref_todo_checked_color" -> "default"
            key == "pref_blockquote_line_thickness" -> 4
            key == "pref_blockquote_line_style" -> "solid"
            key == "pref_blockquote_line_color" -> "default"
            key == "pref_blockquote_bg_color" -> "default"
            key == "pref_blockquote_text_color" -> "default"
            key == "pref_blockquote_left_indent" -> 0
            key == "pref_blockquote_padding" -> 12
            key == "pref_callout_line_thickness" -> 4
            key == "pref_callout_line_style" -> "solid"
            key == "pref_callout_line_color" -> "default"
            key == "pref_callout_bg_color" -> "default"
            key == "pref_callout_padding" -> 12
            key == "pref_table_border_style" -> "solid"
            key == "pref_table_border_thickness" -> 1
            key == "pref_table_border_color" -> "default"
            key == "pref_table_header_bg_color" -> "default"
            key == "pref_table_header_text_color" -> "default"
            key == "pref_table_header_font_weight" -> 700
            key == "pref_table_cell_bg_color" -> "default"
            key == "pref_table_cell_text_color" -> "default"
            key == "pref_table_cell_padding" -> 8
            key == "pref_code_block_padding" -> 16
            key == "pref_code_block_border_radius" -> 6
            key == "pref_code_block_line_height" -> "1.4"
            key == "pref_code_block_lang_label_color" -> "default"
            key == "pref_hr_thickness" -> 2
            key == "pref_hr_style" -> "solid"
            key == "pref_hr_color" -> "default"
            key == "pref_hr_width_percent" -> 100
            key == "pref_hr_margin_top" -> 16
            key == "pref_hr_margin_bottom" -> 16
            key == "pref_justify_paragraph" -> false
            key == "pref_paragraph_line_height" -> "1.6"
            key == "pref_letter_spacing" -> "0px"
            key == "pref_line_wrap" -> true
            key == "pref_bold_color" -> "default"
            key == "pref_italic_color" -> "default"
            key == "pref_link_color" -> "default"
            key == "pref_code_color" -> "default"
            key == "pref_code_bg_color" -> "default"
            key == "pref_code_block_color" -> "default"
            key == "pref_code_block_bg_color" -> "default"
            key.startsWith("pref_heading_") && key.endsWith("_color") -> "default"
            key == "pref_toolbar_bg_color" -> "default"
            key == "pref_toolbar_icon_color" -> "default"
            key == "pref_toolbar_active_icon_color" -> "default"
            key == "pref_toolbar_height" -> 48
            key == "pref_app_theme" -> "amoled"
            key == "pref_image_mode" -> "picker"
            key == "pref_settings_category_title_color" -> "#00E5FF"
            key == "pref_settings_title_color" -> "#FFFFFF"
            key == "pref_settings_summary_color" -> "#AAAAAA"
            key == "pref_settings_switch_color" -> "#00E5FF"
            key == "pref_settings_reset_icon_color" -> "#00E5FF"
            key == "pref_settings_bg_color" -> "#000000"
            key == "pref_auto_save_on_leave" -> true
            key == "pref_hotkey_new" -> "ctrl+n"
            key == "pref_hotkey_open" -> "ctrl+o"
            key == "pref_hotkey_save" -> "ctrl+s"
            key == "pref_hotkey_save_as" -> "ctrl+shift+s"
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
            key.startsWith("pref_plugin_") -> true
            else -> null
        }
    }

    fun isModifiedFromDefault(context: Context, key: String?): Boolean {
        if (key == null) return false
        if (key.startsWith("pref_export") || key.startsWith("pref_import") || key == "pref_reset_all_defaults" || key.startsWith("pref_page_") || key.endsWith("_page")) return false

        val prefs = PreferenceManager.getDefaultSharedPreferences(context)

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

    fun bindResetButton(holder: PreferenceViewHolder, preference: Preference) {
        val context = preference.context
        val key = preference.key

        val isExcluded = key == null || key.startsWith("pref_export") || key.startsWith("pref_import") || key == "pref_reset_all_defaults" || key.startsWith("pref_page_") || key.endsWith("_page")

        if (!isExcluded) {
            val titleView = holder.findViewById(android.R.id.title) as? TextView
            if (titleView != null && titleView.parent is ViewGroup) {
                val titleParent = titleView.parent as ViewGroup
                var btnReset = holder.itemView.findViewById<ImageView>(R.id.btn_reset_widget)

                if (btnReset == null) {
                    btnReset = ImageView(context).apply {
                        id = R.id.btn_reset_widget
                        setImageResource(R.drawable.ic_reset)
                        val paddingPx = (6 * context.resources.displayMetrics.density).toInt()
                        setPadding(paddingPx, paddingPx, paddingPx, paddingPx)
                        isClickable = true
                        isFocusable = true
                        contentDescription = "Reset"
                        val typedValue = TypedValue()
                        context.theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, typedValue, true)
                        setBackgroundResource(typedValue.resourceId)
                    }

                    val sizePx = (32 * context.resources.displayMetrics.density).toInt()
                    val marginPx = (4 * context.resources.displayMetrics.density).toInt()
                    val params = LinearLayout.LayoutParams(sizePx, sizePx).apply {
                        gravity = Gravity.CENTER_VERTICAL
                        marginStart = marginPx
                    }

                    val sliderRow = if (preference is SeekBarPreference) {
                        holder.findViewById(androidx.preference.R.id.seekbar)?.parent as? LinearLayout
                    } else null
                    if (sliderRow != null) {
                        // Keep the title in place: the summary is positioned relative to its ID.
                        // The weighted slider gives up space for a full-size reset touch target.
                        params.width = (48 * context.resources.displayMetrics.density).toInt()
                        params.height = params.width
                        sliderRow.addView(btnReset, params)
                    } else if (titleParent is LinearLayout && titleParent.orientation == LinearLayout.HORIZONTAL) {
                        titleParent.addView(btnReset, params)
                    } else {
                        val containerTag = "title_reset_row_container"
                        var container = titleParent.findViewWithTag<LinearLayout>(containerTag)
                        if (container == null) {
                            val indexInParent = titleParent.indexOfChild(titleView)
                            titleParent.removeView(titleView)
                            container = LinearLayout(context).apply {
                                tag = containerTag
                                orientation = LinearLayout.HORIZONTAL
                                gravity = Gravity.CENTER_VERTICAL
                            }
                            container.addView(titleView, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f))
                            container.addView(btnReset, params)
                            titleParent.addView(container, indexInParent)
                        }
                    }
                }

                val isModified = isModifiedFromDefault(context, key)
                if (isModified) {
                    btnReset.visibility = View.VISIBLE
                    btnReset.setOnClickListener {
                        resetSinglePreference(context, preference)
                    }
                } else {
                    btnReset.visibility = View.INVISIBLE
                }
            }
        } else {
            val btnReset = holder.itemView.findViewById<ImageView>(R.id.btn_reset_widget)
            btnReset?.visibility = View.INVISIBLE
        }

        applySettingsTheme(holder, preference)
    }

    fun applySettingsTheme(holder: PreferenceViewHolder, preference: Preference) {
        val context = preference.context
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)

        val catColorHex = prefs.getString("pref_settings_category_title_color", "#00E5FF") ?: "#00E5FF"
        val titleColorHex = prefs.getString("pref_settings_title_color", "#FFFFFF") ?: "#FFFFFF"
        val summaryColorHex = prefs.getString("pref_settings_summary_color", "#AAAAAA") ?: "#AAAAAA"
        val switchColorHex = prefs.getString("pref_settings_switch_color", "#00E5FF") ?: "#00E5FF"
        val resetIconColorHex = prefs.getString("pref_settings_reset_icon_color", "#00E5FF") ?: "#00E5FF"

        val catColor = ColorPickerDialog.parseHexColor(catColorHex, android.graphics.Color.parseColor("#00E5FF"))
        val titleColor = ColorPickerDialog.parseHexColor(titleColorHex, android.graphics.Color.WHITE)
        val summaryColor = ColorPickerDialog.parseHexColor(summaryColorHex, android.graphics.Color.parseColor("#AAAAAA"))
        val switchColor = ColorPickerDialog.parseHexColor(switchColorHex, android.graphics.Color.parseColor("#00E5FF"))
        val resetIconColor = ColorPickerDialog.parseHexColor(resetIconColorHex, android.graphics.Color.parseColor("#00E5FF"))

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
        btnReset?.setColorFilter(resetIconColor)

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
            Toast.makeText(context, "Font reset to default system font", Toast.LENGTH_SHORT).show()
            return
        }

        prefs.edit().remove(key).apply()

        val defVal = getDefaultValue(key)
        when (pref) {
            is SeekBarPreference -> {
                if (defVal is Int) pref.value = defVal
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
        if (pref is ResettablePreference) {
            pref.callNotifyChanged()
        }
        Toast.makeText(context, "Setting reset to default ↺", Toast.LENGTH_SHORT).show()
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
            val previewTag = "color_picker_preview_circle"
            var previewCircle = widgetFrame.findViewWithTag<View>(previewTag)
            if (previewCircle == null) {
                val density = context.resources.displayMetrics.density
                val sizePx = (24 * density).toInt()
                previewCircle = View(context).apply {
                    tag = previewTag
                    layoutParams = LinearLayout.LayoutParams(sizePx, sizePx).apply {
                        marginEnd = (8 * density).toInt()
                    }
                }
                widgetFrame.addView(previewCircle, 0)
            }

            val prefs = PreferenceManager.getDefaultSharedPreferences(context)
            val colorHex = prefs.getString(key, "default") ?: "default"
            val effectiveHex = if (colorHex == "default") PreferenceResetHelper.getDefaultColorHex(key) else colorHex
            val colorInt = ColorPickerDialog.parseHexColor(effectiveHex, android.graphics.Color.WHITE)

            previewCircle.background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(colorInt)
                setStroke((1.5 * context.resources.displayMetrics.density).toInt(), android.graphics.Color.parseColor("#888888"))
            }
        }
    }

    override fun onClick() {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val currentColor = prefs.getString(key, "default") ?: "default"
        val effectiveHex = if (currentColor == "default") PreferenceResetHelper.getDefaultColorHex(key) else currentColor

        ColorPickerDialog(context, effectiveHex) { selectedHex ->
            prefs.edit().putString(key, selectedHex).apply()
            notifyChanged()
            Toast.makeText(context, "Color set to $selectedHex", Toast.LENGTH_SHORT).show()
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
