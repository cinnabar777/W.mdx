package com.wmdx.markdownapp

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.TextView
import android.widget.Toast
import androidx.preference.PreferenceManager

object ThemedToast {
    private var currentToast: Toast? = null

    fun show(context: Context, message: String, duration: Int = Toast.LENGTH_SHORT) {
        val applicationContext = context.applicationContext
        try {
            currentToast?.cancel()
        } catch (e: Exception) {}

        val prefs = PreferenceManager.getDefaultSharedPreferences(applicationContext)
        val isLightTheme = prefs.getString("pref_app_theme", "amoled") == "light"

        val density = applicationContext.resources.displayMetrics.density
        val textView = TextView(applicationContext).apply {
            text = message
            textSize = 14f
            setPadding(
                (16 * density).toInt(),
                (10 * density).toInt(),
                (16 * density).toInt(),
                (10 * density).toInt()
            )
            gravity = Gravity.CENTER

            val bgDrawable = GradientDrawable().apply {
                cornerRadius = 20 * density
                if (isLightTheme) {
                    setColor(Color.parseColor("#E0E0E0"))
                } else {
                    setColor(Color.parseColor("#282828"))
                }
            }
            background = bgDrawable
            setTextColor(if (isLightTheme) Color.parseColor("#111111") else Color.parseColor("#FFFFFF"))
        }

        val toast = Toast(applicationContext).apply {
            this.duration = duration
            view = textView
        }
        currentToast = toast
        toast.show()
    }
}
