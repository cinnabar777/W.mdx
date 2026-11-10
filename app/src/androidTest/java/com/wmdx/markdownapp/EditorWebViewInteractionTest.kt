package com.wmdx.markdownapp

import android.os.SystemClock
import android.view.MotionEvent
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class EditorWebViewInteractionTest {
    private data class Fixture(val context: String, val profile: String, val marker: String, val source: String)

    @Test
    fun touchWrappedListsKeepsCaretAndIndentAcrossWebViewResize() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        try {
            var candidate: WebView? = null
            scenario.onActivity { candidate = it.findViewById(R.id.webView) }
            val webView = requireNotNull(candidate)
            await(webView, "Boolean(window.editorBridge && document.querySelector('.cm-content'))")

            val fixtures = listOf(
                Fixture(
                    "root",
                    "gfm",
                    "ANDROID-ROOT-01",
                    "Before the list.\n\n- ANDROID-ROOT-01 wrapped list text has enough words to span several lines on a phone-sized WebView, with every continuation row aligned beneath the item text rather than the marker.\n- Second root item."
                ),
                Fixture(
                    "nested quote",
                    "gfm",
                    "ANDROID-QUOTE-01",
                    "> Before the list.\n>\n> > - ANDROID-QUOTE-01 wrapped list text has enough words to span several lines on a phone-sized WebView, with every continuation row aligned beneath the item text rather than the marker.\n> > - Second quoted item."
                ),
                Fixture(
                    "callout",
                    "obsidian",
                    "ANDROID-CALLOUT-01",
                    "> [!note] Android touch fixture\n> - ANDROID-CALLOUT-01 wrapped list text has enough words to span several lines on a phone-sized WebView, with every continuation row aligned beneath the item text rather than the marker.\n> - Second callout item."
                )
            )

            for (scope in listOf("hidden", "caret", "block")) {
                for (fixture in fixtures) {
                    loadFixture(webView, fixture, scope)
                    val before = listGeometry(webView, fixture.marker)
                    assertTrue(
                        "${fixture.context}/$scope fixture must wrap on the emulator: $before",
                        before.getJSONArray("rowStarts").length() >= 2
                    )

                    val point = touchPoint(webView, fixture.marker)
                    tap(webView, point.getDouble("x"), point.getDouble("y"), point.getDouble("dpr"))
                    await(webView, caretInLineScript(fixture.source, fixture.marker))
                    assertSource(webView, fixture.source, fixture.context, scope)
                    assertRowsAlign(listGeometry(webView, fixture.marker), fixture.context, scope)

                    var oldHeight = 0
                    var shortHeight = 0
                    scenario.onActivity {
                        oldHeight = webView.layoutParams.height
                        shortHeight = (webView.height * 0.55f).toInt().coerceAtLeast(320)
                        webView.layoutParams = webView.layoutParams.apply { height = shortHeight }
                        webView.requestLayout()
                    }
                    await(webView, "window.innerHeight < ${before.getInt("viewportHeight")}")
                    scenario.onActivity {
                        webView.layoutParams = webView.layoutParams.apply { height = oldHeight }
                        webView.requestLayout()
                    }
                    await(webView, "window.innerHeight >= ${before.getInt("viewportHeight")}")

                    assertSource(webView, fixture.source, fixture.context, scope)
                    await(webView, caretInLineScript(fixture.source, fixture.marker))
                    assertRowsAlign(listGeometry(webView, fixture.marker), fixture.context, scope)
                }
            }
        } finally {
            scenario.close()
        }
    }

    private fun loadFixture(webView: WebView, fixture: Fixture, scope: String) {
        evaluate(
            webView,
            """
                (async () => {
                  await window.editorBridge.setEditorMode('rendered');
                  window.editorBridge.applyAllPreferences({
                    pref_markdown_profile: ${JSONObject.quote(fixture.profile)},
                    pref_markdown_syntax_exposure: ${JSONObject.quote(scope)},
                    pref_list_non_hanging: false
                  });
                  window.editorBridge.setMarkdown(${JSONObject.quote(fixture.source)});
                  window.__androidFixtureReady = true;
                })();
                true;
            """.trimIndent()
        )
        await(
            webView,
            "Boolean(window.__androidFixtureReady && window.editorBridge.getMarkdown() === ${JSONObject.quote(fixture.source)} && document.querySelector('.cm-list-item'))"
        )
    }

    private fun touchPoint(webView: WebView, marker: String): JSONObject {
        val result = decode(
            evaluate(
                webView,
                """
                    (() => {
                      const line = [...document.querySelectorAll('.cm-line.cm-list-item')]
                        .find(item => item.textContent.includes(${JSONObject.quote(marker)}));
                      if (!line) return null;
                      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                      let node;
                      while ((node = walker.nextNode())) {
                        if (node.parentElement.closest('.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox')) continue;
                        const offset = node.nodeValue.indexOf(${JSONObject.quote(marker)});
                        if (offset < 0) continue;
                        const range = document.createRange();
                        range.setStart(node, offset);
                        range.setEnd(node, node.nodeValue.length);
                        const rect = [...range.getClientRects()].filter(r => r.width && r.height).at(-1);
                        if (rect) return JSON.stringify({
                          x: rect.left + rect.width * 0.65,
                          y: rect.top + rect.height / 2,
                          dpr: window.devicePixelRatio
                        });
                      }
                      return null;
                    })()
                """.trimIndent()
            )
        )
        assertTrue("No wrapped-row tap point for $marker: $result", result != "null")
        return JSONObject(result)
    }

    private fun listGeometry(webView: WebView, marker: String): JSONObject {
        val result = decode(
            evaluate(
                webView,
                """
                    (() => {
                      const line = [...document.querySelectorAll('.cm-line.cm-list-item')]
                        .find(item => item.textContent.includes(${JSONObject.quote(marker)}));
                      if (!line) return null;
                      const rows = new Map();
                      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                      let node;
                      while ((node = walker.nextNode())) {
                        if (node.parentElement.closest('.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox')) continue;
                        const offset = node.nodeValue.indexOf(${JSONObject.quote(marker)});
                        if (offset < 0) continue;
                        for (let i = offset; i < node.nodeValue.length; i++) {
                          if (/\s/.test(node.nodeValue[i])) continue;
                          const range = document.createRange();
                          range.setStart(node, i);
                          range.setEnd(node, i + 1);
                          const rect = range.getBoundingClientRect();
                          if (rect.width && rect.height) {
                            const row = Math.round(rect.top);
                            if (!rows.has(row)) rows.set(row, rect.left);
                          }
                        }
                      }
                      return JSON.stringify({
                        viewportHeight: window.innerHeight,
                        rowStarts: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x)
                      });
                    })()
                """.trimIndent()
            )
        )
        assertTrue("List item disappeared for $marker: $result", result != "null")
        return JSONObject(result)
    }

    private fun caretInLineScript(source: String, marker: String): String {
        val start = source.indexOf(marker)
        val end = source.indexOf('\n', start).let { if (it < 0) source.length else it }
        return """
            (() => {
              const current = window.editorBridge.getMarkdown();
              const selection = JSON.parse(window.editorBridge.getSelectionState());
              return current === ${JSONObject.quote(source)} &&
                selection.head >= $start && selection.head <= $end;
            })()
        """.trimIndent()
    }

    private fun assertSource(webView: WebView, source: String, context: String, scope: String) {
        assertEquals(
            "$context/$scope touch or resize changed Markdown",
            "true",
            evaluate(webView, "window.editorBridge.getMarkdown() === ${JSONObject.quote(source)}")
        )
    }

    private fun assertRowsAlign(geometry: JSONObject, context: String, scope: String) {
        val rows = geometry.getJSONArray("rowStarts")
        assertTrue("$context/$scope wrapped item has fewer than two rows: $geometry", rows.length() >= 2)
        val first = rows.getDouble(0)
        for (index in 1 until rows.length()) {
            assertTrue(
                "$context/$scope wrapped row $index shifted from the item text: $geometry",
                kotlin.math.abs(rows.getDouble(index) - first) < 3.0
            )
        }
    }

    private fun tap(webView: WebView, cssX: Double, cssY: Double, density: Double) {
        val x = (cssX * density).toFloat()
        val y = (cssY * density).toFloat()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val downTime = SystemClock.uptimeMillis()
            val down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0)
            val up = MotionEvent.obtain(downTime, downTime + 80, MotionEvent.ACTION_UP, x, y, 0)
            try {
                webView.dispatchTouchEvent(down)
                webView.dispatchTouchEvent(up)
            } finally {
                down.recycle()
                up.recycle()
            }
        }
    }

    private fun await(webView: WebView, expression: String) {
        val deadline = SystemClock.uptimeMillis() + 15_000
        while (SystemClock.uptimeMillis() < deadline) {
            if (evaluate(webView, expression) == "true") return
            Thread.sleep(80)
        }
        throw AssertionError("Timed out waiting for Android WebView condition: $expression")
    }

    private fun evaluate(webView: WebView, script: String): String {
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.evaluateJavascript(script) {
                result.set(it)
                latch.countDown()
            }
        }
        val completed = latch.await(15, TimeUnit.SECONDS)
        val scriptSummary = script.replace(Regex("\\s+"), " ").take(180)
        assertTrue(
            "Android WebView JavaScript callback timed out after 15 seconds; script: $scriptSummary",
            completed
        )
        return result.get() ?: "null"
    }

    private fun decode(raw: String): String = JSONTokener(raw).nextValue()?.toString() ?: "null"
}
