package com.wmdx.markdownapp

import android.content.Context
import androidx.preference.PreferenceManager
import java.io.ByteArrayInputStream
import java.util.Base64
import java.util.zip.GZIPInputStream
import org.json.JSONObject

/**
 * Seeds first-install preferences from the supplied Wmdx settings backup.
 * Existing user settings are never overwritten. Font-file references and
 * per-document cursor state are excluded; every other backed-up app preference
 * is retained, including the saved toolbar layout and custom icons.
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
                "_font_file_" in key
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

    internal fun decodeDefaultsPayload(encoded: String): String =
        GZIPInputStream(
            ByteArrayInputStream(Base64.getDecoder().decode(encoded.trim()))
        ).bufferedReader().use { it.readText() }

    private fun readDefaults(context: Context): Map<String, Any> =
        context.resources.openRawResource(R.raw.wmdx_default_preferences_gzip)
            .bufferedReader()
            .use { parseDefaults(decodeDefaultsPayload(it.readText())) }
}
