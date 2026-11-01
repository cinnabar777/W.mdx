package com.wmdx.markdownapp

import android.content.Context

object ToolbarDefaults {
    fun floatingToolbarConfigJson(context: Context): String =
        context.resources.openRawResource(R.raw.default_floating_toolbar_config)
            .bufferedReader(Charsets.UTF_8)
            .use { it.readText() }
            .trim()
}
