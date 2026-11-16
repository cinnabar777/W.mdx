package com.wmdx.markdownapp

import android.content.Context
import androidx.preference.PreferenceManager
import org.json.JSONObject

/**
 * Seeds first-install preferences from the supplied Wmdx settings backup.
 * Existing user settings are never overwritten. Custom font files, per-document
 * cursor state, obsolete keys, and the backup's personal toolbar layout are
 * deliberately not treated as app defaults.
 */
object AppPreferenceDefaults {
    @Volatile
    private var cachedValues: Map<String, Any>? = null

    @Synchronized
    fun initialize(context: Context) {
        val appContext = context.applicationContext
        val defaults = cachedValues ?: readDefaults(appContext).also {
            cachedValues = it
        }
        val preferences = PreferenceManager.getDefaultSharedPreferences(appContext)
        val missing = defaults.filterKeys { !preferences.contains(it) }
        if (missing.isEmpty()) return

        val editor = preferences.edit()
        for ((key, value) in missing) {
            when (value) {
                is Boolean -> editor.putBoolean(key, value)
                is Int -> editor.putInt(key, value)
                is Long -> editor.putLong(key, value)
                is Float -> editor.putFloat(key, value)
                is String -> editor.putString(key, value)
                else -> error("Unsupported default preference value for $key")
            }
        }
        editor.apply()
    }

    fun get(key: String): Any? = cachedValues?.get(key)

    internal fun parseDefaults(jsonText: String): Map<String, Any> {
        val json = JSONObject(jsonText)
        val defaults = linkedMapOf<String, Any>()
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (
                !key.startsWith("pref_") ||
                key.startsWith("pref_font_file_") ||
                "_font_file_" in key ||
                key == "pref_toolbar_bottom_config" ||
                key == "pref_list_wrap_under_text" ||
                key == "pref_heading_override_defaults_migrated_v1" ||
                key == "pref_toolbar_default_corrected"
            ) {
                continue
            }

            when (val value = json.get(key)) {
                JSONObject.NULL -> Unit
                is Boolean, is String -> defaults[key] = value
                is Number -> {
                    val number = value.toDouble()
                    val integral = number.toLong()
                    defaults[key] = if (
                        number.isFinite() &&
                        number == integral.toDouble() &&
                        integral >= Int.MIN_VALUE.toLong() &&
                        integral <= Int.MAX_VALUE.toLong()
                    ) {
                        integral.toInt()
                    } else {
                        number.toFloat()
                    }
                }
                else -> error("Default preference $key must be a scalar value")
            }
        }
        return defaults
    }

    private fun readDefaults(context: Context): Map<String, Any> =
        context.resources.openRawResource(R.raw.wmdx_default_preferences)
            .bufferedReader()
            .use { parseDefaults(it.readText()) }
}
