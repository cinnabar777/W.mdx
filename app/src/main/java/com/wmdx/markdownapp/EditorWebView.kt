package com.wmdx.markdownapp

import android.content.Context
import android.util.AttributeSet
import android.view.ActionMode
import android.view.Menu
import android.view.MenuInflater
import android.view.MotionEvent
import android.view.View
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
    private var selectionGestureActive = false
    private var selectionGestureDragReported = false
    private var selectionGestureStartX = 0f
    private var selectionGestureStartY = 0f

    fun setImeInputAllowed(allowed: Boolean) {
        if (imeInputAllowed == allowed) return
        imeInputAllowed = allowed
        (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
            ?.restartInput(this)
    }

    override fun onCheckIsTextEditor(): Boolean =
        imeInputAllowed && super.onCheckIsTextEditor()

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            selectionGestureActive = true
            selectionGestureDragReported = false
            selectionGestureStartX = event.x
            selectionGestureStartY = event.y
            sendSelectionGestureToEditor("down", event.x, event.y)
        }

        val handled = super.dispatchTouchEvent(event)

        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                if (selectionGestureActive && !selectionGestureDragReported) {
                    val cssPixelScale = resources.displayMetrics.density * scale
                    val dragThreshold = 8f * cssPixelScale.coerceAtLeast(1f)
                    val dx = event.x - selectionGestureStartX
                    val dy = event.y - selectionGestureStartY
                    if (dx * dx + dy * dy >= dragThreshold * dragThreshold) {
                        selectionGestureDragReported = true
                        sendSelectionGestureToEditor("move", event.x, event.y)
                    }
                }
            }
            MotionEvent.ACTION_UP,
            MotionEvent.ACTION_CANCEL -> {
                if (selectionGestureActive) {
                    sendSelectionGestureToEditor(
                        if (event.actionMasked == MotionEvent.ACTION_CANCEL) "cancel" else "up",
                        event.x,
                        event.y
                    )
                }
                selectionGestureActive = false
                selectionGestureDragReported = false
            }
        }
        return handled
    }

    private fun sendSelectionGestureToEditor(action: String, x: Float, y: Float) {
        if (!isFloatingToolbarEnabled() || !x.isFinite() || !y.isFinite()) return
        evaluateJavascript(
            "window.editorBridge?.onNativeSelectionTouch?.('$action', $x, $y);",
            null
        )
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
