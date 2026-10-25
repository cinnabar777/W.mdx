package com.wmdx.markdownapp

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

class ColorPickerDialog(
    context: Context,
    private val initialColorHex: String,
    private val onColorSelected: (String) -> Unit
) : AlertDialog(context) {

    private var currentHue = 0f
    private var currentSat = 1f
    private var currentVal = 1f
    private var currentAlpha = 255

    private val initialColorInt: Int = parseHexColor(initialColorHex, Color.WHITE)
    private var currentColorInt: Int = initialColorInt

    private lateinit var satValView: SatValView
    private lateinit var hueView: HueView
    private lateinit var alphaView: AlphaView
    private lateinit var hexEditText: EditText
    private lateinit var previewOldView: View
    private lateinit var previewNewView: View

    private var isUpdatingFromInput = false

    override fun onCreate(savedInstanceState: Bundle?) {
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        super.onCreate(savedInstanceState)

        val hsv = FloatArray(3)
        Color.colorToHSV(initialColorInt, hsv)
        currentHue = hsv[0]
        currentSat = hsv[1]
        currentVal = hsv[2]
        currentAlpha = Color.alpha(initialColorInt)

        val density = context.resources.displayMetrics.density

        val mainLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((16 * density).toInt(), (16 * density).toInt(), (16 * density).toInt(), (16 * density).toInt())
            setBackgroundColor(Color.parseColor("#121212"))
        }

        // 1. Preset colors row at the top
        val presetsLayout = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (12 * density).toInt())
        }

        val presets = listOf(
            Color.WHITE, Color.BLACK, Color.parseColor("#757575"),
            Color.parseColor("#00E5FF"), Color.parseColor("#00B0FF"),
            Color.parseColor("#FF1744"), Color.parseColor("#FFEA00"),
            Color.parseColor("#00E676"), Color.parseColor("#FF4081")
        )

        for (presetColor in presets) {
            val swatch = View(context).apply {
                val size = (32 * density).toInt()
                val margin = (4 * density).toInt()
                layoutParams = LinearLayout.LayoutParams(size, size).apply {
                    setMargins(margin, 0, margin, 0)
                }
                background = android.graphics.drawable.GradientDrawable().apply {
                    shape = android.graphics.drawable.GradientDrawable.OVAL
                    setColor(presetColor)
                    setStroke((1 * density).toInt(), Color.parseColor("#555555"))
                }
                setOnClickListener {
                    setColorInt(presetColor)
                }
            }
            presetsLayout.addView(swatch)
        }
        mainLayout.addView(presetsLayout)

        // 2. Sat/Val box + Hue slider side by side
        val pickerContainer = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                (200 * density).toInt()
            )
        }

        satValView = SatValView(context).apply {
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f)
            onSatValChanged = { s, v ->
                currentSat = s
                currentVal = v
                updateColorFromHSV()
            }
        }

        hueView = HueView(context).apply {
            val width = (32 * density).toInt()
            val margin = (8 * density).toInt()
            layoutParams = LinearLayout.LayoutParams(width, ViewGroup.LayoutParams.MATCH_PARENT).apply {
                setMargins(margin, 0, 0, 0)
            }
            onHueChanged = { h ->
                currentHue = h
                satValView.setHue(h)
                updateColorFromHSV()
            }
        }

        pickerContainer.addView(satValView)
        pickerContainer.addView(hueView)
        mainLayout.addView(pickerContainer)

        // 3. Alpha / Transparency Slider
        val alphaLabel = TextView(context).apply {
            text = "Opacity / Alpha"
            setTextColor(Color.parseColor("#AAAAAA"))
            textSize = 12f
            setPadding(0, (8 * density).toInt(), 0, (2 * density).toInt())
        }
        mainLayout.addView(alphaLabel)

        alphaView = AlphaView(context).apply {
            val height = (24 * density).toInt()
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height).apply {
                setMargins(0, (2 * density).toInt(), 0, (12 * density).toInt())
            }
            onAlphaChanged = { a ->
                currentAlpha = a
                updateColorFromHSV()
            }
        }
        mainLayout.addView(alphaView)

        // 4. Hex input row + Previews
        val hexAndPreviewLayout = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, (4 * density).toInt(), 0, (12 * density).toInt())
        }

        val hexSymbol = TextView(context).apply {
            text = "# "
            setTextColor(Color.WHITE)
            textSize = 16f
        }
        hexAndPreviewLayout.addView(hexSymbol)

        hexEditText = EditText(context).apply {
            layoutParams = LinearLayout.LayoutParams((120 * density).toInt(), ViewGroup.LayoutParams.WRAP_CONTENT)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            textSize = 14f
            isSingleLine = true
            isFocusable = true
            isFocusableInTouchMode = true
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setOnClickListener { showHexKeyboard() }
        }
        hexAndPreviewLayout.addView(hexEditText)

        val spacer = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        }
        hexAndPreviewLayout.addView(spacer)

        previewOldView = View(context).apply {
            val size = (32 * density).toInt()
            layoutParams = LinearLayout.LayoutParams(size, size)
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(initialColorInt)
                setStroke((1 * density).toInt(), Color.parseColor("#777777"))
            }
        }

        val arrow = TextView(context).apply {
            text = " → "
            setTextColor(Color.WHITE)
            textSize = 16f
        }

        previewNewView = View(context).apply {
            val size = (32 * density).toInt()
            layoutParams = LinearLayout.LayoutParams(size, size)
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(initialColorInt)
                setStroke((1 * density).toInt(), Color.parseColor("#FFFFFF"))
            }
        }

        hexAndPreviewLayout.addView(previewOldView)
        hexAndPreviewLayout.addView(arrow)
        hexAndPreviewLayout.addView(previewNewView)

        mainLayout.addView(hexAndPreviewLayout)

        // 5. Action Buttons (Cancel / OK)
        val buttonsLayout = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(0, (8 * density).toInt(), 0, 0)
        }

        val btnCancel = TextView(context).apply {
            text = "Cancel"
            setTextColor(Color.parseColor("#BBBBBB"))
            textSize = 14f
            setPadding((16 * density).toInt(), (8 * density).toInt(), (16 * density).toInt(), (8 * density).toInt())
            isClickable = true
            setOnClickListener { dismiss() }
        }

        val btnOk = TextView(context).apply {
            text = "OK"
            setTextColor(Color.parseColor("#00E5FF"))
            textSize = 14f
            setPadding((16 * density).toInt(), (8 * density).toInt(), (8 * density).toInt(), (8 * density).toInt())
            isClickable = true
            setOnClickListener {
                onColorSelected(formatColorToHex(currentColorInt))
                dismiss()
            }
        }

        buttonsLayout.addView(btnCancel)
        buttonsLayout.addView(btnOk)
        mainLayout.addView(buttonsLayout)

        setContentView(mainLayout)

        // Sync initial state
        satValView.setHue(currentHue)
        satValView.setSatVal(currentSat, currentVal)
        hueView.setHue(currentHue)
        alphaView.setAlphaValue(currentAlpha)

        updateUIComponents()

        hexEditText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (isUpdatingFromInput) return
                val text = s?.toString()?.trim() ?: return
                val hexCandidate = if (text.startsWith("#")) text else "#$text"
                if (hexCandidate.length == 7 || hexCandidate.length == 9) {
                    try {
                        val parsed = parseHexColor(hexCandidate, currentColorInt)
                        if (parsed != currentColorInt) {
                            setColorInt(parsed)
                        }
                    } catch (e: Exception) {}
                }
            }
        })
    }

    override fun onStart() {
        window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        super.onStart()
    }

    private fun showHexKeyboard() {
        val dialogWindow = window ?: return
        hexEditText.requestFocus()
        dialogWindow.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE or
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )
        hexEditText.post {
            if (hexEditText.hasFocus()) {
                WindowCompat.getInsetsController(dialogWindow, hexEditText)
                    .show(WindowInsetsCompat.Type.ime())
            }
        }
    }

    private fun updateColorFromHSV() {
        currentColorInt = Color.HSVToColor(currentAlpha, floatArrayOf(currentHue, currentSat, currentVal))
        updateUIComponents()
    }

    private fun setColorInt(colorInt: Int) {
        currentColorInt = colorInt
        val hsv = FloatArray(3)
        Color.colorToHSV(colorInt, hsv)
        currentHue = hsv[0]
        currentSat = hsv[1]
        currentVal = hsv[2]
        currentAlpha = Color.alpha(colorInt)

        satValView.setHue(currentHue)
        satValView.setSatVal(currentSat, currentVal)
        hueView.setHue(currentHue)
        alphaView.setAlphaValue(currentAlpha)

        updateUIComponents()
    }

    private fun updateUIComponents() {
        alphaView.setColor(Color.HSVToColor(255, floatArrayOf(currentHue, currentSat, currentVal)))

        (previewNewView.background as? android.graphics.drawable.GradientDrawable)?.setColor(currentColorInt)

        isUpdatingFromInput = true
        val formattedHex = formatColorToHex(currentColorInt)
        val cleanHex = if (formattedHex.startsWith("#")) formattedHex.substring(1) else formattedHex
        if (hexEditText.text.toString() != cleanHex) {
            hexEditText.setText(cleanHex)
            hexEditText.setSelection(cleanHex.length)
        }
        isUpdatingFromInput = false
    }

    companion object {
        fun parseHexColor(hex: String?, defaultColor: Int): Int {
            if (hex.isNullOrEmpty() || hex == "default") return defaultColor
            return try {
                val clean = hex.trim()
                val colorStr = if (clean.startsWith("#")) clean else "#$clean"
                Color.parseColor(colorStr)
            } catch (e: Exception) {
                defaultColor
            }
        }

        fun formatColorToHex(colorInt: Int): String {
            val alpha = Color.alpha(colorInt)
            return if (alpha < 255) {
                String.format("#%02X%06X", alpha, 0xFFFFFF and colorInt)
            } else {
                String.format("#%06X", 0xFFFFFF and colorInt)
            }
        }
    }

    // Custom 2D Saturation / Value Box
    private class SatValView(context: Context) : View(context) {
        var onSatValChanged: ((Float, Float) -> Unit)? = null
        private var hue = 0f
        private var sat = 1f
        private var valVal = 1f

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 3f * context.resources.displayMetrics.density
            color = Color.WHITE
        }

        fun setHue(h: Float) {
            hue = h
            invalidate()
        }

        fun setSatVal(s: Float, v: Float) {
            sat = s
            valVal = v
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat()
            val h = height.toFloat()
            if (w <= 0 || h <= 0) return

            val pureHueColor = Color.HSVToColor(floatArrayOf(hue, 1f, 1f))

            val satShader = LinearGradient(0f, 0f, w, 0f, Color.WHITE, pureHueColor, Shader.TileMode.CLAMP)
            val valShader = LinearGradient(0f, 0f, 0f, h, Color.TRANSPARENT, Color.BLACK, Shader.TileMode.CLAMP)

            paint.shader = satShader
            canvas.drawRect(0f, 0f, w, h, paint)

            paint.shader = valShader
            canvas.drawRect(0f, 0f, w, h, paint)

            val x = sat * w
            val y = (1f - valVal) * h

            canvas.drawCircle(x, y, 8f * context.resources.displayMetrics.density, strokePaint)
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                    val x = event.x.coerceIn(0f, width.toFloat())
                    val y = event.y.coerceIn(0f, height.toFloat())
                    sat = x / width.toFloat()
                    valVal = 1f - (y / height.toFloat())
                    invalidate()
                    onSatValChanged?.invoke(sat, valVal)
                    return true
                }
            }
            return super.onTouchEvent(event)
        }
    }

    // Custom Vertical Hue Bar
    private class HueView(context: Context) : View(context) {
        var onHueChanged: ((Float) -> Unit)? = null
        private var hue = 0f

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val indicatorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 3f * context.resources.displayMetrics.density
        }

        fun setHue(h: Float) {
            hue = h
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat()
            val h = height.toFloat()
            if (w <= 0 || h <= 0) return

            val colors = IntArray(361)
            for (i in 0..360) {
                colors[i] = Color.HSVToColor(floatArrayOf(i.toFloat(), 1f, 1f))
            }

            val shader = LinearGradient(0f, 0f, 0f, h, colors, null, Shader.TileMode.CLAMP)
            paint.shader = shader
            canvas.drawRect(0f, 0f, w, h, paint)

            val y = (hue / 360f) * h
            canvas.drawRect(0f, y - 4f, w, y + 4f, indicatorPaint)
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                    val y = event.y.coerceIn(0f, height.toFloat())
                    hue = (y / height.toFloat()) * 360f
                    invalidate()
                    onHueChanged?.invoke(hue)
                    return true
                }
            }
            return super.onTouchEvent(event)
        }
    }

    // Custom Horizontal Alpha / Transparency Bar
    private class AlphaView(context: Context) : View(context) {
        var onAlphaChanged: ((Int) -> Unit)? = null
        private var alphaVal = 255
        private var baseColor = Color.RED

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val indicatorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 3f * context.resources.displayMetrics.density
        }

        fun setColor(color: Int) {
            baseColor = color
            invalidate()
        }

        fun setAlphaValue(a: Int) {
            alphaVal = a
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat()
            val h = height.toFloat()
            if (w <= 0 || h <= 0) return

            val transparentColor = Color.argb(0, Color.red(baseColor), Color.green(baseColor), Color.blue(baseColor))
            val solidColor = Color.argb(255, Color.red(baseColor), Color.green(baseColor), Color.blue(baseColor))

            val shader = LinearGradient(0f, 0f, w, 0f, transparentColor, solidColor, Shader.TileMode.CLAMP)
            paint.shader = shader
            canvas.drawRect(0f, 0f, w, h, paint)

            val x = (alphaVal / 255f) * w
            canvas.drawRect(x - 4f, 0f, x + 4f, h, indicatorPaint)
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                    val x = event.x.coerceIn(0f, width.toFloat())
                    alphaVal = ((x / width.toFloat()) * 255).roundToInt().coerceIn(0, 255)
                    invalidate()
                    onAlphaChanged?.invoke(alphaVal)
                    return true
                }
            }
            return super.onTouchEvent(event)
        }
    }
}
