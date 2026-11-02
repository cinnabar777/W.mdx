package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Test

class AttachmentStylePreferencesTest {
    @Test
    fun attachmentStylesHaveStableResetDefaults() {
        assertEquals("default", PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_bg_color"))
        assertEquals("default", PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_text_color"))
        assertEquals("default", PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_border_color"))
        assertEquals(1, PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_border_width"))
        assertEquals(8, PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_border_radius"))
        assertEquals(10, PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_padding_x"))
        assertEquals(7, PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_padding_y"))
        assertEquals(14, PreferenceResetHelper.getDefaultValue("pref_mdzip_attachment_font_size"))
    }
}
