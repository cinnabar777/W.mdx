package com.wmdx.markdownapp

import android.content.Context
import android.graphics.Rect
import android.util.AttributeSet
import android.view.ActionMode
import android.view.Menu
import android.view.MenuInflater
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
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

    @Volatile
    private var imeInputAllowed = true

    fun setImeInputAllowed(allowed: Boolean) {
        if (imeInputAllowed == allowed) return
        imeInputAllowed = allowed
        // Restarting input while suppressing a hidden IME can cause Android
        // to reopen it. Recreate the input connection only for an explicit
        // transition back to text input; the toolbar touch gate stays passive.
        if (!allowed) return
        (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
            ?.restartInput(this)
    }

    override fun onCheckIsTextEditor(): Boolean =
        imeInputAllowed && super.onCheckIsTextEditor()

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? =
        if (imeInputAllowed) super.onCreateInputConnection(outAttrs) else null

    // WebView can request native focus on touch while reusing its existing
    // input connection. Reject those implicit requests until an editor-text
    // gesture explicitly re-enables IME input.
    override fun requestFocus(
        direction: Int,
        previouslyFocusedRect: Rect?
    ): Boolean =
        if (imeInputAllowed) {
            super.requestFocus(direction, previouslyFocusedRect)
        } else {
            false
        }

    private fun isFloatingToolbarEnabled(): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean("pref_toolbar_floating_enabled", true)

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
