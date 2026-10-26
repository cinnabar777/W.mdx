package com.wmdx.markdownapp

import android.content.Context
import android.util.AttributeSet
import android.view.ActionMode
import android.view.Menu
import android.view.MenuInflater
import android.view.View
import android.webkit.WebView

/**
 * WebView that keeps its text selection while letting the editor's own floating
 * toolbar replace Android's default selection action mode.
 */
class EditorWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : WebView(context, attrs, defStyleAttr) {

    override fun startActionMode(callback: ActionMode.Callback): ActionMode =
        EmptySelectionActionMode()

    override fun startActionMode(callback: ActionMode.Callback, type: Int): ActionMode =
        EmptySelectionActionMode()

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
