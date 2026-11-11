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
        InstrumentationRegistry.getInstrumentation()
            .targetContext
            .getSharedPreferences("diagnostic_report", 0)
            .edit()
            .clear()
            .commit()
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
                    "nested ordered list item",
                    "gfm",
                    "ANDROID-NESTED-LIST-01",
                    "Before the list.\n\n1. Parent ordered item.\n   - ANDROID-NESTED-LIST-01 nested child text has enough words to wrap across several visual rows on a phone-sized WebView, and the continuation must remain aligned under this child after the caret enters it.\n     This nested continuation belongs to the child item and must not shift any source character.\n   - Second nested child item.\n2. Second ordered item."
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
                    assertRowsAlign(before, fixture.context, "$scope before cursor entry")

                    val point = touchPoint(webView, fixture.marker)
                    tap(webView, point.getDouble("x"), point.getDouble("y"), point.getDouble("dpr"))
                    await(webView, caretInLineScript(fixture.source, fixture.marker))
                    val afterCaretEntry = listGeometry(webView, fixture.marker)
                    assertRowsAlign(
                        afterCaretEntry,
                        fixture.context,
                        "$scope after cursor entry"
                    )
                    val selection = JSONObject(
                        decode(evaluate(webView, "window.editorBridge.getSelectionState()"))
                    )
                    val expectedEdit =
                        fixture.source.substring(0, selection.getInt("head")) +
                            "X" + fixture.source.substring(selection.getInt("head"))
                    InstrumentationRegistry.getInstrumentation().sendStringSync("X")
                    await(webView, "window.editorBridge.getMarkdown() === ${JSONObject.quote(expectedEdit)}")
                    assertEquals(
                        "${fixture.context}/$scope typing must insert at the touched list caret",
                        expectedEdit,
                        decode(evaluate(webView, "window.editorBridge.getMarkdown()"))
                    )
                    val undoAvailable = decode(
                        evaluate(
                            webView,
                            """
                                (() => {
                                  const button = document.querySelector('#grp-btn-undo');
                                  if (!button) return false;
                                  button.click();
                                  return true;
                                })()
                            """.trimIndent()
                        )
                    )
                    assertEquals(
                        "The list edit must expose the toolbar undo action",
                        "true",
                        undoAvailable
                    )
                    await(webView, "window.editorBridge.getMarkdown() === ${JSONObject.quote(fixture.source)}")
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

            val sourceNestedList = fixtures.first { it.context == "nested ordered list item" }
            val sourceListTarget = "after the caret enters it."
            evaluate(
                webView,
                """
                    (async () => {
                      await window.editorBridge.setEditorMode('source');
                      window.editorBridge.applyAllPreferences({
                        pref_markdown_profile: 'gfm',
                        pref_markdown_syntax_exposure: 'hidden'
                      });
                      window.editorBridge.setMarkdown(${JSONObject.quote(sourceNestedList.source)});
                    })();
                    true;
                """.trimIndent()
            )
            await(
                webView,
                "document.querySelector('#editor > .cm-editor .cm-content')?.textContent.includes(" +
                    "${JSONObject.quote(sourceListTarget)})"
            )
            val sourceListPoint = sourceEditorTouchPoint(webView, sourceListTarget)
            tap(
                webView,
                sourceListPoint.getDouble("x"),
                sourceListPoint.getDouble("y"),
                sourceListPoint.getDouble("dpr")
            )
            val sourceListSelection = JSONObject(
                decode(evaluate(webView, "window.editorBridge.getSelectionState()"))
            )
            val sourceListExpectedCaret =
                sourceNestedList.source.indexOf(sourceListTarget) + sourceListTarget.length / 2
            assertTrue(
                "Source-view tap must put the caret in the touched nested-list text: $sourceListSelection",
                sourceListSelection.getInt("head") > 0 &&
                    kotlin.math.abs(sourceListSelection.getInt("head") - sourceListExpectedCaret) <= 24
            )
            assertEquals(
                "Source-view cursor entry must preserve nested-list bytes",
                sourceNestedList.source,
                decode(evaluate(webView, "window.editorBridge.getMarkdown()"))
            )
            val editedSourceList =
                sourceNestedList.source.substring(0, sourceListSelection.getInt("head")) +
                    "X" + sourceNestedList.source.substring(sourceListSelection.getInt("head"))
            InstrumentationRegistry.getInstrumentation().sendStringSync("X")
            await(
                webView,
                "window.editorBridge.getMarkdown() === ${JSONObject.quote(editedSourceList)}"
            )
            assertEquals(
                "Source-view nested-list typing must occur at the tapped caret",
                editedSourceList,
                decode(evaluate(webView, "window.editorBridge.getMarkdown()"))
            )

            val renderedTableSource = """
                | Mode | Description |
                | --- | --- |
                | Rendered Markdown editor | The active cell must hide its original text. |
                | Source Code editor | Tap here to place the cursor in this cell. |
            """.trimIndent()
            val tableCellLabel = "Source Code editor"
            val tableCaretTarget = "place the cursor"
            evaluate(
                webView,
                """
                    (async () => {
                      await window.editorBridge.setEditorMode('rendered');
                      window.editorBridge.applyAllPreferences({
                        pref_markdown_profile: 'gfm',
                        pref_markdown_syntax_exposure: 'hidden'
                      });
                      window.editorBridge.setMarkdown(${JSONObject.quote(renderedTableSource)});
                    })();
                    true;
                """.trimIndent()
            )
            await(
                webView,
                "Boolean([...document.querySelectorAll('.cm-wp-table-container td')].some(cell => " +
                    "cell.textContent.includes(${JSONObject.quote(tableCellLabel)})))"
            )
            val cellPoint = tableCellTouchPoint(webView, tableCellLabel, tableCaretTarget)
            tap(webView, cellPoint.getDouble("x"), cellPoint.getDouble("y"), cellPoint.getDouble("dpr"))
            await(webView, "Boolean(document.querySelector('.cm-wp-cell-editor[contenteditable=\"true\"]'))")
            val activeCell = decode(
                evaluate(
                    webView,
                    """
                        (() => {
                          const overlay = document.querySelector('.cm-wp-cell-editor');
                          const cell = document.querySelector('.cm-wp-table-container td[data-row="2"][data-col="1"]');
                          if (!overlay || !cell) return null;
                          const selection = window.getSelection();
                          const range = document.createRange();
                          if (selection?.anchorNode) {
                            range.selectNodeContents(overlay);
                            range.setEnd(selection.anchorNode, selection.anchorOffset);
                          }
                          const background = getComputedStyle(overlay).backgroundColor;
                          const rgba = background.match(/^rgba?\(([^)]+)\)$/);
                          const channels = rgba?.[1].split(/[\\s,/]+/).filter(Boolean) || [];
                          return JSON.stringify({
                            text: overlay.textContent,
                            originalText: cell.textContent,
                            background,
                            opaque: background !== 'transparent' &&
                              (channels.length < 4 || Number.parseFloat(channels[channels.length - 1]) > 0.99),
                            caretOffset: range.toString().length,
                            selectionCollapsed: selection?.isCollapsed || false
                          });
                        })()
                    """.trimIndent()
                )
            )
            val activeCellState = JSONObject(activeCell)
            val expectedTableCell = "Tap here to place the cursor in this cell."
            assertEquals(expectedTableCell, activeCellState.getString("text"))
            assertEquals(expectedTableCell, activeCellState.getString("originalText"))
            assertTrue(
                "Android WebView table overlay must cover the original cell text: $activeCellState",
                activeCellState.getBoolean("opaque")
            )
            assertTrue(
                "A rendered cell tap must place the caret at the touched phrase, not the end: $activeCellState",
                activeCellState.getBoolean("selectionCollapsed") &&
                    kotlin.math.abs(
                        activeCellState.getInt("caretOffset") -
                            cellPoint.getInt("expectedCaretOffset")
                    ) <= 3
            )
            evaluate(
                webView,
                "document.querySelector('.cm-wp-cell-editor')?.dispatchEvent(" +
                    "new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true;"
            )
            await(webView, "!document.querySelector('.cm-wp-cell-editor')")
            assertSource(webView, renderedTableSource, "rendered table cell", "hidden")

            val sourceTableMarkdown = """
                | Item | Description | Status |
                | --- | --- | --- |
                | SRC-TAP-01 | Tap here to edit this source cell. | Open |
            """.trimIndent()
            val sourceTablePrefix = "Text before the table.\n\n"
            val sourceTableSource = sourceTablePrefix + sourceTableMarkdown
            val sourceTableFrom = sourceTablePrefix.length
            val sourceTableTarget = "Tap here to edit this source cell."
            evaluate(
                webView,
                """
                    (async () => {
                      await window.editorBridge.setEditorMode('source');
                      window.editorBridge.applyAllPreferences({
                        pref_markdown_profile: 'gfm',
                        pref_markdown_syntax_exposure: 'hidden',
                        pref_table_scroll_source_enabled: true
                      });
                      window.editorBridge.setMarkdown(${JSONObject.quote(sourceTableSource)});
                    })();
                    true;
                """.trimIndent()
            )
            await(
                webView,
                "Boolean(document.querySelector('.cm-source-table-editor') && " +
                    "document.querySelector('.cm-source-table-editor').textContent.includes('SRC-TAP-01'))"
            )
            val sourceTablePoint = sourceTableTouchPoint(webView, sourceTableTarget)
            tap(
                webView,
                sourceTablePoint.getDouble("x"),
                sourceTablePoint.getDouble("y"),
                sourceTablePoint.getDouble("dpr")
            )
            await(
                webView,
                """
                    (() => {
                      const child = document.querySelector('.cm-source-table-editor')?._sourceTableEditor;
                      return Boolean(child && document.activeElement === child.contentDOM &&
                        child.state.selection.main.head > 0);
                    })()
                """.trimIndent()
            )
            val sourceTableCaret = JSONObject(
                decode(
                    evaluate(
                        webView,
                        """
                            (() => {
                              const child = document.querySelector('.cm-source-table-editor')?._sourceTableEditor;
                              return JSON.stringify({
                                focused: Boolean(child && document.activeElement === child.contentDOM),
                                head: child?.state.selection.main.head ?? -1,
                                length: child?.state.doc.length ?? 0,
                                childMarkdown: child?.state.doc.toString() ?? null,
                                  parentSelection: JSON.parse(window.editorBridge.getSelectionState()),
                                parentMarkdown: window.editorBridge.getMarkdown()
                              });
                            })()
                        """.trimIndent()
                    )
                )
            )
            val expectedSourceOffset =
                sourceTableMarkdown.indexOf(sourceTableTarget) + sourceTableTarget.length / 2
            assertTrue(
                "Source table tap must focus its nested editor and place the caret in the tapped cell, not at document start: $sourceTableCaret",
                sourceTableCaret.getBoolean("focused") &&
                    sourceTableCaret.getInt("head") > 0 &&
                    sourceTableCaret.getInt("head") < sourceTableCaret.getInt("length") - 5 &&
                    kotlin.math.abs(sourceTableCaret.getInt("head") - expectedSourceOffset) <= 24
            )
            assertEquals(sourceTableMarkdown, sourceTableCaret.getString("childMarkdown"))
            assertEquals(sourceTableSource, sourceTableCaret.getString("parentMarkdown"))
            assertEquals(
                "The outer document cursor must follow the source-table caret",
                sourceTableFrom + sourceTableCaret.getInt("head"),
                sourceTableCaret.getJSONObject("parentSelection").getInt("head")
            )
            val parentCaret = sourceTableFrom + sourceTableCaret.getInt("head")
            val editedSourceTable = sourceTableSource.substring(0, parentCaret) +
                "X" + sourceTableSource.substring(parentCaret)
            InstrumentationRegistry.getInstrumentation().sendStringSync("X")
            await(
                webView,
                "window.editorBridge.getMarkdown() === ${JSONObject.quote(editedSourceTable)}"
            )
            assertEquals(
                "Typing after a source-table tap must edit at the caret, not at the start of the document",
                editedSourceTable,
                decode(evaluate(webView, "window.editorBridge.getMarkdown()"))
            )

            val calloutSource = """
                Outside paragraph before callouts.

                > [!note] Note
                > This is a note callout.
                > [!warning] Custom callout title
                > This warning has a custom title.
            """.trimIndent()
            for (scope in listOf("hidden", "caret", "block")) {
                evaluate(
                    webView,
                    """
                        (async () => {
                          await window.editorBridge.setEditorMode('rendered');
                          window.editorBridge.applyAllPreferences({
                            pref_markdown_profile: 'obsidian',
                            pref_markdown_syntax_exposure: ${JSONObject.quote(scope)},
                            pref_body_font_size: 24
                          });
                          window.editorBridge.setMarkdown(${JSONObject.quote(calloutSource)});
                          window.editorBridge.setSelectionState(JSON.stringify({
                            anchor: ${calloutSource.indexOf("Outside") + 2},
                            head: ${calloutSource.indexOf("Outside") + 2}
                          }));
                        })();
                        true;
                    """.trimIndent()
                )
                await(
                    webView,
                    "Boolean(document.querySelector('.cm-callout-title-rendered') && " +
                        "[...document.querySelectorAll('.cm-callout-title-text')].some(el => el.textContent.trim() === 'Note'))"
                )

                for (title in listOf("Note", "Custom callout title")) {
                    val geometry = calloutHeaderGeometry(webView, title)
                    val icon = geometry.getJSONObject("icon")
                    val text = geometry.getJSONObject("text")
                    assertTrue(
                        "callout/$scope/$title icon overlaps title before touch: $geometry",
                        icon.getDouble("right") + 1.0 <= text.getDouble("left")
                    )
                    assertTrue(
                        "callout/$scope/$title icon is not aligned with title: $geometry",
                        kotlin.math.abs(icon.getDouble("top") - text.getDouble("top")) < 8.0
                    )
                }

                val titleStart = calloutSource.indexOf("Custom callout title")
                val before = calloutHeaderGeometry(webView, "Custom callout title")
                val text = before.getJSONObject("text")
                tap(
                    webView,
                    (text.getDouble("left") + text.getDouble("right")) / 2,
                    (text.getDouble("top") + text.getDouble("bottom")) / 2,
                    evaluate(webView, "window.devicePixelRatio").toDouble()
                )
                await(
                    webView,
                    "(() => { const s = JSON.parse(window.editorBridge.getSelectionState()); " +
                        "return s.head >= $titleStart && s.head <= ${titleStart + "Custom callout title".length}; })()"
                )
                val selection = JSONObject(decode(evaluate(webView, "window.editorBridge.getSelectionState()")))
                assertTrue(
                    "callout/$scope touch must leave the caret in the custom title: $selection",
                    selection.getInt("head") in titleStart..(titleStart + "Custom callout title".length)
                )
                assertEquals(
                    "callout/$scope touch changed Markdown",
                    calloutSource,
                    decode(evaluate(webView, "window.editorBridge.getMarkdown()"))
                )

                val after = calloutHeaderGeometry(webView, "Custom callout title")
                if (after.has("icon") && after.has("text")) {
                    assertTrue(
                        "callout/$scope title overlap appeared after caret entry: $after",
                        after.getJSONObject("icon").getDouble("right") + 1.0 <=
                            after.getJSONObject("text").getDouble("left")
                    )
                    assertTrue(
                        "callout/$scope icon jumped onto or away from its title after caret entry: $after",
                        kotlin.math.abs(
                            after.getJSONObject("icon").getDouble("top") -
                                after.getJSONObject("text").getDouble("top")
                        ) < 8.0
                    )
                }
                assertTrue(
                    "callout/$scope caret entry moved the title row: before=$before after=$after",
                    kotlin.math.abs(after.getDouble("lineTop") - before.getDouble("lineTop")) < 8.0
                )

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
                val afterResize = calloutHeaderGeometry(webView, "Custom callout title")
                if (afterResize.has("icon") && afterResize.has("text")) {
                    assertTrue(
                        "callout/$scope WebView resize caused icon/title overlap: $afterResize",
                        afterResize.getJSONObject("icon").getDouble("right") + 1.0 <=
                            afterResize.getJSONObject("text").getDouble("left")
                    )
                    assertTrue(
                        "callout/$scope WebView resize moved the icon onto a different row: $afterResize",
                        kotlin.math.abs(
                            afterResize.getJSONObject("icon").getDouble("top") -
                                afterResize.getJSONObject("text").getDouble("top")
                        ) < 8.0
                    )
                }
                assertEquals(
                    "callout/$scope resize changed Markdown",
                    calloutSource,
                    decode(evaluate(webView, "window.editorBridge.getMarkdown()"))
                )
                val resizedSelection = JSONObject(decode(evaluate(webView, "window.editorBridge.getSelectionState()")))
                assertTrue(
                    "callout/$scope resize lost caret in title: $resizedSelection",
                    resizedSelection.getInt("head") in titleStart..(titleStart + "Custom callout title".length)
                )
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
                      line.scrollIntoView({ block: 'center', inline: 'nearest' });
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

    private fun tableCellTouchPoint(webView: WebView, cellLabel: String, target: String): JSONObject {
        val result = decode(
            evaluate(
                webView,
                """
                    (() => {
                      const cell = [...document.querySelectorAll('.cm-wp-table-container td')]
                        .find(item => item.textContent.includes(${JSONObject.quote(cellLabel)}));
                      if (!cell) return null;
                      cell.scrollIntoView({ block: 'center', inline: 'nearest' });
                      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
                      let node;
                      while ((node = walker.nextNode())) {
                        const offset = node.nodeValue.indexOf(${JSONObject.quote(target)});
                        if (offset < 0) continue;
                        const caret = offset + Math.floor(${target.length} / 2);
                        const range = document.createRange();
                        range.setStart(node, caret);
                        range.setEnd(node, caret + 1);
                        const rect = range.getBoundingClientRect();
                        return JSON.stringify({
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                          dpr: window.devicePixelRatio,
                          expectedCaretOffset: caret
                        });
                      }
                      return null;
                    })()
                """.trimIndent()
            )
        )
        assertTrue("No rendered-table tap point for $cellLabel: $result", result != "null")
        return JSONObject(result)
    }

    private fun sourceTableTouchPoint(webView: WebView, target: String): JSONObject {
        val result = decode(
            evaluate(
                webView,
                """
                    (() => {
                      const host = document.querySelector('.cm-source-table-editor');
                      const child = host?._sourceTableEditor;
                      const line = [...(host?.querySelectorAll('.cm-line') || [])]
                        .find(item => item.textContent.includes(${JSONObject.quote(target)}));
                      if (!host || !child || !line) return null;
                      line.scrollIntoView({ block: 'center', inline: 'nearest' });
                      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                      let node;
                      while ((node = walker.nextNode())) {
                        const offset = node.nodeValue.indexOf(${JSONObject.quote(target)});
                        if (offset < 0) continue;
                        const caret = offset + Math.floor(${target.length} / 2);
                        const range = document.createRange();
                        range.setStart(node, caret);
                        range.setEnd(node, caret + 1);
                        let rect = range.getBoundingClientRect();
                        const scroller = child.scrollDOM;
                        if (scroller && (rect.left < 0 || rect.right > window.innerWidth)) {
                          scroller.scrollLeft += rect.left + rect.width / 2 - window.innerWidth / 2;
                          rect = range.getBoundingClientRect();
                        }
                        if (!rect.width || !rect.height) return null;
                        return JSON.stringify({
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                          dpr: window.devicePixelRatio,
                          expectedCaretOffset: child.state.doc.toString().indexOf(${JSONObject.quote(target)}) +
                            Math.floor(${target.length} / 2)
                        });
                      }
                      return null;
                    })()
                """.trimIndent()
            )
        )
        assertTrue("No source-table tap point for $target: $result", result != "null")
        return JSONObject(result)
    }

    private fun sourceEditorTouchPoint(webView: WebView, target: String): JSONObject {
        val result = decode(
            evaluate(
                webView,
                """
                    (() => {
                      const host = document.querySelector('#editor > .cm-editor');
                      const line = [...(host?.querySelectorAll('.cm-line') || [])]
                        .find(item => item.textContent.includes(${JSONObject.quote(target)}));
                      if (!host || !line) return null;
                      line.scrollIntoView({ block: 'center', inline: 'nearest' });
                      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                      let node;
                      while ((node = walker.nextNode())) {
                        const offset = node.nodeValue.indexOf(${JSONObject.quote(target)});
                        if (offset < 0) continue;
                        const caret = offset + Math.floor(${target.length} / 2);
                        const range = document.createRange();
                        range.setStart(node, caret);
                        range.setEnd(node, caret + 1);
                        const rect = range.getBoundingClientRect();
                        if (!rect.width || !rect.height) return null;
                        return JSON.stringify({
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                          dpr: window.devicePixelRatio
                        });
                      }
                      return null;
                    })()
                """.trimIndent()
            )
        )
        assertTrue("No source-editor tap point for $target: $result", result != "null")
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

    private fun calloutHeaderGeometry(webView: WebView, title: String): JSONObject {
        val result = decode(
            evaluate(
                webView,
                """
                    (() => {
                      const line = [...document.querySelectorAll('.cm-line.cm-callout-title')]
                        .find(item => item.textContent.includes(${JSONObject.quote(title)}));
                      if (!line) return null;
                      const lineRect = line.getBoundingClientRect();
                      if (lineRect.top < 0 || lineRect.bottom > window.innerHeight) {
                        line.scrollIntoView({ block: 'center', inline: 'nearest' });
                      }
                      const bounds = selector => {
                        const rect = line.querySelector(selector)?.getBoundingClientRect();
                        return rect ? {
                          left: rect.left, right: rect.right, top: rect.top,
                          bottom: rect.bottom, width: rect.width, height: rect.height
                        } : null;
                      };
                      return JSON.stringify({
                        lineTop: line.getBoundingClientRect().top,
                        viewportHeight: window.innerHeight,
                        icon: bounds('.cm-callout-icon'),
                        text: bounds('.cm-callout-title-text')
                      });
                    })()
                """.trimIndent()
            )
        )
        assertTrue("Callout title disappeared for $title: $result", result != "null")
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
        val deadline = SystemClock.uptimeMillis() + 30_000
        var lastCallbackFailure: String? = null
        while (SystemClock.uptimeMillis() < deadline) {
            try {
                if (evaluate(webView, expression, callbackTimeoutMs = 3_000) == "true") return
            } catch (error: AssertionError) {
                // Do not keep queueing JavaScript evaluations behind an unresponsive
                // WebView renderer; capture startup state and native diagnostics below.
                lastCallbackFailure = error.message
                break
            }
            Thread.sleep(80)
        }
        val pageState = runCatching {
            evaluate(
                webView,
                """
                    JSON.stringify({
                      url: location.href,
                      readyState: document.readyState,
                      bridge: typeof window.editorBridge,
                      nativeBridge: typeof window.AndroidNative,
                      editor: Boolean(document.querySelector('.cm-content')),
                      editorContainer: Boolean(document.querySelector('#editor-container')),
                      bodyChildren: document.body?.children.length || 0
                    })
                """.trimIndent(),
                callbackTimeoutMs = 1_000
            )
        }.getOrElse { "unavailable (${it.message})" }
        val appEvents = InstrumentationRegistry.getInstrumentation()
            .targetContext
            .getSharedPreferences("diagnostic_report", 0)
            .getString("events", "<no native diagnostic events>")
        throw AssertionError(
            "Timed out waiting for Android WebView condition: $expression; " +
                "page=$pageState; appEvents=$appEvents; " +
                "lastCallbackFailure=$lastCallbackFailure"
        )
    }

    private fun evaluate(
        webView: WebView,
        script: String,
        callbackTimeoutMs: Long = 15_000
    ): String {
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.evaluateJavascript(script) {
                result.set(it)
                latch.countDown()
            }
        }
        val completed = latch.await(callbackTimeoutMs, TimeUnit.MILLISECONDS)
        val scriptSummary = script.replace(Regex("\\s+"), " ").take(180)
        assertTrue(
            "Android WebView JavaScript callback timed out after ${callbackTimeoutMs}ms; script: $scriptSummary",
            completed
        )
        return result.get() ?: "null"
    }

    private fun decode(raw: String): String = JSONTokener(raw).nextValue()?.toString() ?: "null"
}
