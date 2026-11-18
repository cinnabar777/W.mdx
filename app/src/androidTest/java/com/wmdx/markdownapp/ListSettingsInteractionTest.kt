package com.wmdx.markdownapp

import android.os.SystemClock
import android.webkit.WebView
import androidx.preference.PreferenceManager
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.Espresso.pressBack
import androidx.test.espresso.NoMatchingViewException
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.swipeUp
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withText
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
import androidx.recyclerview.widget.RecyclerView

@RunWith(AndroidJUnit4::class)
class ListSettingsInteractionTest {
    @Test
    fun settingsSwitchesChangeEditorRenderingAfterActivityRestart() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val appContext = instrumentation.targetContext
        val preferences = PreferenceManager.getDefaultSharedPreferences(appContext)
        preferences.edit()
            .putBoolean("pref_soft_breaks_as_spaces", false)
            .putBoolean("pref_list_non_hanging", false)
            .commit()

        var settingsScenario: ActivityScenario<SettingsActivity>? = null
        var editorScenario: ActivityScenario<MainActivity>? = null
        try {
            val settings = ActivityScenario.launch(SettingsActivity::class.java)
            settingsScenario = settings
            openBodySettings()
            togglePreference("Join Soft Line Breaks")
            assertTrue(preferences.getBoolean("pref_soft_breaks_as_spaces", false))

            pressBack()
            revealPreference("Lists (Bulleted, Numbered, Todo Checkboxes)")
            onView(withText("Lists (Bulleted, Numbered, Todo Checkboxes)"))
                .perform(click())
            revealPreference("Non-hanging List Wrapping")
            onView(withText("Non-hanging List Wrapping")).perform(click())
            assertTrue(preferences.getBoolean("pref_list_non_hanging", false))
            settings.close()
            settingsScenario = null

            val editor = ActivityScenario.launch(MainActivity::class.java)
            editorScenario = editor
            var candidate: WebView? = null
            editor.onActivity { candidate = it.findViewById(R.id.webView) }
            val webView = requireNotNull(candidate)
            await(webView, "Boolean(window.editorBridge && document.querySelector('.cm-content'))")

            val markdown = listOf(
                "SOFT-SETTING-01 first paragraph line",
                "SOFT-SETTING-02 second line",
                "HARD-SETTING-01 explicit break  ",
                "HARD-SETTING-02 must remain below.",
                "",
                "- LIST-SETTING-01 This item has enough words to wrap across a small phone display and reveal which list wrapping preference is active."
            ).joinToString("\n")
            evaluate(webView, "window.editorBridge.setMarkdown(${JSONObject.quote(markdown)}); true;")
            await(
                webView,
                "window.editorBridge.getMarkdown() === ${JSONObject.quote(markdown)}"
            )

            val geometry = JSONObject(
                decode(
                    evaluate(
                        webView,
                        """
                            (() => {
                              const content = document.querySelector('.cm-content');
                              const rect = text => {
                                const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
                                let node;
                                while ((node = walker.nextNode())) {
                                  const offset = node.nodeValue.indexOf(text);
                                  if (offset < 0) continue;
                                  const range = document.createRange();
                                  range.setStart(node, offset);
                                  range.setEnd(node, offset + text.length);
                                  const box = range.getBoundingClientRect();
                                  if (box.width && box.height) return { left: box.left, top: box.top };
                                }
                                return null;
                              };
                              const listLine = [...document.querySelectorAll('.cm-line.cm-list-item')]
                                .find(line => line.textContent.includes('LIST-SETTING-01'));
                              return JSON.stringify({
                                softFirst: rect('SOFT-SETTING-01'),
                                softSecond: rect('SOFT-SETTING-02'),
                                hardFirst: rect('HARD-SETTING-01'),
                                hardSecond: rect('HARD-SETTING-02'),
                                listWrapUnderText: document.body.classList.contains('list-wrap-under-text'),
                                listTextIndent: listLine ? getComputedStyle(listLine).textIndent : null
                              });
                            })()
                        """.trimIndent()
                    )
                )
            )
            val softFirst = geometry.getJSONObject("softFirst").getDouble("top")
            val softSecond = geometry.getJSONObject("softSecond").getDouble("top")
            val hardFirst = geometry.getJSONObject("hardFirst").getDouble("top")
            val hardSecond = geometry.getJSONObject("hardSecond").getDouble("top")
            assertTrue(
                "The Body setting must join a single newline in the reopened editor: $geometry",
                kotlin.math.abs(softSecond - softFirst) < 2.0
            )
            assertTrue(
                "Two trailing spaces must preserve the hard line break: $geometry",
                hardSecond > hardFirst + 5.0
            )
            assertEquals(
                "The list preference must reach the WebView after relaunch",
                false,
                geometry.getBoolean("listWrapUnderText")
            )
            assertEquals("0px", geometry.getString("listTextIndent"))
        } finally {
            editorScenario?.close()
            settingsScenario?.close()
            preferences.edit()
                .putBoolean("pref_soft_breaks_as_spaces", false)
                .putBoolean("pref_list_non_hanging", false)
                .commit()
        }
    }

    private fun openBodySettings() {
        onView(withText("Document Appearance")).perform(click())
        onView(withText("Body")).perform(click())
        revealPreference("Join Soft Line Breaks")
    }

    private fun togglePreference(title: String) {
        onView(withText(title)).perform(click())
    }

    private fun revealPreference(title: String) {
        repeat(12) {
            try {
                onView(withText(title)).check(matches(isDisplayed()))
                return
            } catch (_: NoMatchingViewException) {
                onView(isAssignableFrom(RecyclerView::class.java)).perform(swipeUp())
                SystemClock.sleep(100)
            }
        }
        onView(withText(title)).check(matches(isDisplayed()))
    }

    private fun evaluate(webView: WebView, script: String): String {
        val latch = CountDownLatch(1)
        val result = AtomicReference<String>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.evaluateJavascript(script) {
                result.set(it ?: "null")
                latch.countDown()
            }
        }
        assertTrue("WebView JavaScript callback timed out", latch.await(10, TimeUnit.SECONDS))
        return result.get()
    }

    private fun decode(value: String): String =
        runCatching { JSONTokener(value).nextValue().toString() }.getOrDefault(value)

    private fun await(webView: WebView, expression: String) {
        val deadline = SystemClock.uptimeMillis() + 20_000
        while (SystemClock.uptimeMillis() < deadline) {
            if (decode(evaluate(webView, "$expression;")) == "true") return
            SystemClock.sleep(100)
        }
        throw AssertionError("Timed out waiting for WebView expression: $expression")
    }
}
