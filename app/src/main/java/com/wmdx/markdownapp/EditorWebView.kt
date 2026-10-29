package com.wmdx.markdownapp

import android.content.Context
import android.util.AttributeSet
import android.view.ActionMode
import android.view.Menu
import android.view.MenuInflater
import android.view.View
import android.webkit.WebView
import androidx.preference.PreferenceManager

/**
 * WebView that keeps text selection and switches between the editor's floating
 * toolbar and Android's native selection action mode according to preferences.
 */
class EditorWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : WebView(context, attrs, defStyleAttr) {

    private fun isFloatingToolbarEnabled(): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean("pref_toolbar_floating_enabled", false)

    override fun startActionMode(callback: ActionMode.Callback): ActionMode =
        if (isFloatingToolbarEnabled()) {
            EmptySelectionActionMode()
        } else {
            super.startActionMode(callback)
        }

    override fun startActionMode(callback: ActionMode.Callback, type: Int): ActionMode =
        if (isFloatingToolbarEnabled()) {
            EmptySelectionActionMode()
        } else {
            super.startActionMode(callback, type)
        }

    override fun startActionModeForChild(
        child: View,
        callback: ActionMode.Callback
    ): ActionMode? =
        if (isFloatingToolbarEnabled()) {
            EmptySelectionActionMode()
        } else {
            super.startActionModeForChild(child, callback)
        }

    override fun startActionModeForChild(
        child: View,
        callback: ActionMode.Callback,
        type: Int
    ): ActionMode? =
        if (isFloatingToolbarEnabled()) {
            EmptySelectionActionMode()
        } else {
            super.startActionModeForChild(child, callback, type)
        }

    private class EmptySelectionActionMode : ActionMode() {
        override fun finish() = Unit
        override fun getCustomView(): View? = null
        override fun getMenu(): Menu? = null
        override fun getMenuInflater(): MenuInflater? = null
        override fun getSubtitle(): CharSequence? = null
        override fun getTitle(): CharSequence? = null
        override fun invalidate() = Unit
        override fun setCustomView(view: View?) = Unit
        override fun setSubtitle(subtitle: CharSequence?) = Unit
        override fun setSubtitle(resId: Int) = Unit
        override fun setTitle(title: CharSequence?) = Unit
        override fun setTitle(resId: Int) = Unit
    }
}
