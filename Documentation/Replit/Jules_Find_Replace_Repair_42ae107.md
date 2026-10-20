# Jules handoff — Find & Replace repair after 42ae107

**Project:** cinnabar777/W.mdx  
**Inspected commit:** 42ae1070536c549b6c110132d8f4735127dc1e5f  
**Parent:** 1670b68b851915bb1e86548ac3e0540481913fcf  
**Scope:** repair Find & Replace, restore the requested selectable-preview settings UI, and fix the reported close/reopen regression. Keep this as one focused patch. Do not rework unrelated editor or table features.

## Important: the requested settings UI is a requirement

The settings page in this commit is a long static list under Styling & Typography. That is not the requested interface. The design requested was: show a near-real-size, two-row Find & Replace preview; the user taps the specific control to select it; only that selected control’s settings appear below; edits update the preview immediately. Keep that interaction. Do not replace it with a long list of generic preferences.

Move its entry to **Settings → Editor Configuration Pages → Find & Replace Appearance** (the root list is app/src/main/res/xml/preferences.xml). Do not nest it under Typography. Keep the actual editor bar pinned at the top and full width; do not add radius, position, panel-height, or button-height preferences.

## Findings verified in commit 42ae107

- The custom bar is a persistent #custom-search-bar element outside the editor. The CodeMirror search extension’s createPanel callback returns that same element. toggleFindAndReplaceBar also calls openSearchPanel/closeSearchPanel. That gives CodeMirror’s panel lifecycle ownership of an app-owned node and is the likely reason closing it removes/detaches the bar, so it cannot reopen. Remove that ownership conflict and add a close→reopen regression test.
- The editor visually replaces the entire Markdown Table source range with WordProcessorTableWidget. CodeMirror can search the underlying document text, but those source ranges have no visible DOM text while the table widget is displayed. Searching must connect source matches to rendered table cells; simply adding more search CSS will not fix this.
- The code-block body remains in the editor document and is not replaced by the code-header widget. Search must find and visibly highlight body text in fenced blocks; do not skip code blocks or search a rendered copy of the document.
- The new settings XML defines generic button keys (for example pref_findreplace_btn_bg), while applyAllPreferences looks for per-button keys (pref_findreplace_btn_prev_bg, etc.). The CSS for .search-icon-btn hard-codes its background, color, height, and minimum width. This is why button styling does not take effect.
- The SVG code looks for pref_findreplace_btn_<id>_svg, but the settings page provides no SVG input. No custom SVG can be entered.
- Active-match color is set on .cm-searchMatch.cm-searchMatch-selected only. Heading/inline syntax spans have their own text colors; set the color on the match and its rendered descendants, then verify on headings.
- The panel-height and button-height controls exist although these dimensions should be content-driven. Remove both. Keep field height; buttons should fill/align to the row height.
- DocumentDispatchActivity.kt still has one direct Toast.makeText (“Could not open this file”). Route it through ThemedToast so the app-wide toast rule remains true.

## 1. Fix panel ownership and close/reopen

Keep #custom-search-bar in app-owned DOM. Do not pass the persistent node to CodeMirror’s createPanel and do not use openSearchPanel/closeSearchPanel to show/hide this custom bar. Use the search extension for SearchQuery, decorations, findNext/findPrevious, and replace commands; show/hide the app-owned bar with its hidden class. Clear the active query on close if appropriate, but do not remove or reparent the element. When reopening, the same controls and listeners must still work. Initialize listeners once, even if CodeMirrorAdapter is rebuilt.

Use this shape for visibility; connect it to the existing toolbar action and close button:

~~~js
function toggleFindAndReplaceBar(forceState) {
  const bar = document.getElementById('custom-search-bar');
  if (!bar) return;
  const show = forceState ?? bar.classList.contains('hidden');
  bar.classList.toggle('hidden', !show);
  if (show) {
    requestAnimationFrame(() => {
      const input = bar.querySelector('#search-input');
      input?.focus();
      input?.select();
    });
  } else {
    // Hide only. Do not call closeSearchPanel on this app-owned element.
    activeAdapter?.view?.focus();
  }
}
~~~

If the installed CodeMirror version truly requires an open panel for visible match decorations, create a separate CodeMirror-owned wrapper and implement its destroy/reattach lifecycle. Never return the persistent #custom-search-bar as the panel DOM. The automated test must prove the bar is still a descendant of the app root after close and opens again without reloading the page.

Also test opening a file-manager file after closing the previous document. The code change above is the likely search-panel bug, but it does not prove the separate file-routing symptom’s cause. Inspect DocumentDispatchActivity, WindowRegistry, and MainActivity.handleIntent: a fresh dispatched intent containing a URI must not be replaced by a stale task-registry URI. Preserve registry restoration for genuine activity/process restoration. Add a regression test or a narrowly-scoped guard so a closed/reused task cannot silently open a blank/new untitled document. Do not alter the established multi-window routing behavior without a demonstrated need.

## 2. Search across rendered content, including tables

Keep CodeMirror’s SearchQuery as the source of truth for literal/regex, case, whole-word, and replacement settings. Search the Markdown document, not getMarkdown() followed by a separate JavaScript RegExp and not an HTML export.

### Tables

WordProcessorTableWidget replaces the complete table source range, so a normal CodeMirror search decoration cannot paint text inside its rendered HTML table. Implement a source-position map for each parsed header/body cell (the current TableModel parsing trims cell strings and loses offsets). For each search match inside a cell:

- Identify the corresponding rendered th/td and visibly highlight the matched visible text without replacing the whole table with Markdown.
- On Next/Previous, select/navigate to that cell and scroll it into view. The selected cell’s active match must be visible in the rendered table.
- Replace One and Replace All must update the cell’s Markdown source via a normal CodeMirror transaction so undo works and the table widget refreshes. Preserve alignment, escaped pipes, inline Markdown, and merged-cell markers. Never replace the entire document with setMarkdown().
- Search visible header/body cell text; do not count pipe delimiters or the separator/alignment row as user-visible matches.

If matching formatted cell content needs a Markdown-to-rendered-text offset map, add that mapping explicitly. Do not claim table search is fixed merely because SearchQuery.getCursor finds the source string—the user must see the highlight on the rendered cell and Next/Previous must land on it.

### Code blocks and other formatted text

The fenced code body is still in the CodeMirror document. Ensure search and replacement include it, including plain text and syntax-highlighted code. Search also needs to retain existing heading/list/inline-code behavior. Add test cases for each; do not bypass parser nodes in the query.

### Find/replace behavior and navigation

- Changing Find text selects/navigates to the first applicable result and updates the match counter. Invalid regex shows an inline error without discarding the last valid query.
- Next/Previous moves to the next/previous result with wraparound; Replace One selects the first result if none is selected, replaces exactly one result, then selects the next; Replace All is one undoable editor transaction.
- After Next/Previous or first-result selection, explicitly center the active match (or the table cell containing it) within the visible editor viewport when possible. CodeMirror’s default minimal scroll-into-view is not enough for the reported off-screen matches.

For ordinary CodeMirror matches, use this navigation helper after the command succeeds:

~~~js
function runFindAndCenter(command, view) {
  if (!view || !command(view)) return false;
  const { head } = view.state.selection.main;
  view.dispatch({
    effects: EditorView.scrollIntoView(head, { y: 'center', yMargin: 20 })
  });
  return true;
}
~~~

Use the active match’s end/head position consistently. For table matches, center the rendered cell element in the editor scroller instead of a source position hidden by the table replacement widget.

## 3. Restore the actual selectable-preview settings page

Put one settings-page link in the root Editor Configuration Pages category. Implement one page with:

1. A phone-width preview of the actual two-row search bar, including both inputs, counter, and every real action icon.
2. Tapping the panel, either input, counter, or an individual button selects that exact item and visibly marks it as selected.
3. Show only that selected item’s options below the preview. Changes save immediately and update both preview and the real Find & Replace bar. Persist through the app’s existing preference bridge; defaults and Reset controls must round-trip correctly.
4. Do not display a large flat list of settings. The whole point is direct manipulation: tap an icon to edit that icon, then tap another icon.

The panel itself gets background and bottom-border colors. There is no panel-height setting: the panel’s height is determined by its contents. Do not add corner-radius or position settings. Keep each input’s background, text, placeholder, normal border, focused border, font size, and field height configurable; the fields may set the row height naturally.

For each button independently (previous, next, highlight, regex, close, replace-one, replace-all, case, whole-word), offer normal background/icon color, active background/icon color where applicable, pressed-state background, disabled icon color where applicable, width, and custom SVG. Do not expose a separate button-height slider: button height is derived from the row/field height. Keep each icon’s original SVG as its reset/default value. If custom SVG is empty/reset, restore the original SVG rather than leaving the last custom icon installed.

Use stable per-control preference keys, for example pref_findreplace_button_next_bg and pref_findreplace_button_next_svg. Use the same key map for the settings preview, SharedPreferences, applyAllPreferences, CSS variables, reset defaults, and the real panel. Remove the currently mismatched generic button controls and hard-coded .search-icon-btn colors/sizes. Give each button a stable data-control id so its preview styles target the right button.

For the SVG field, use a multiline editor/dialog and validate/sanitize before storing or applying. Parse as SVG XML; allow only the SVG elements and attributes needed for local icons; reject script, foreignObject, event-handler attributes, external hrefs, and external url() resources. Invalid SVG must leave the existing/default icon intact and show a useful themed message. Use currentColor so each icon’s configured icon color applies.

## 4. Match styling and keep nearby behaviors intact

Apply active-match text color to the match wrapper and syntax-colored descendants, then verify on heading text and code. Scope the rule to the selected active match so it does not recolor the whole editor. Example:

~~~css
.cm-searchMatch.cm-searchMatch-selected,
.cm-searchMatch.cm-searchMatch-selected * {
  background-color: var(--findreplace-current-match-bg) !important;
  color: var(--findreplace-current-match-color) !important;
}
~~~

Do not use a constant generic button style where the settings offer per-icon values. Update CSS from the same preference map; remove the hard-coded dimensions that override those values. Keep regex-history long-press behavior and app-themed toasts. Replace the remaining direct dispatcher Toast.makeText with ThemedToast and search the Kotlin app for other direct Toast.makeText calls before marking the app-wide requirement done.

## 5. Tests and device acceptance

Replace the current source-string-only tests with behavioral tests using CodeMirror’s real SearchQuery/commands and the editor DOM (Playwright/browser test is appropriate). A passing string-presence test is not enough. Cover:

- Type a query, close with X, reopen from toolbar repeatedly; the bar remains attached, query controls still respond, no reload required.
- Next/Previous finds and visibly highlights occurrences in headings, lists, inline code, fenced code bodies, table headers and body cells. Active matches are centered when viewport space permits.
- Replace One and Replace All work in normal text, code blocks and table cells; undo restores exact prior Markdown/table layout.
- Invalid regex feedback; regex history opens on long press and a normal tap still toggles regex.
- In Settings, tap each preview item and verify only its controls appear; change one icon’s color/width/SVG and verify it changes only that icon, both in preview and the live panel; reset restores that icon’s original SVG and style.
- Field-height changes resize the row naturally; there is no panel-height or button-height setting.
- After closing a file/document, open that same file from Android Files/file manager and verify the correct document appears (not a blank/new untitled document). Check both a normal file and a file URI already opened in another live window.
- Confirm direct toasts are routed through ThemedToast, including the dispatch error.

Build the app and report build/test status truthfully. Do not mark the phone-only launch, table, or visual settings cases verified until someone tests the actual APK on the phone. Keep this one repair pass limited to the issues above; leave unrelated typography/table-menu work alone.
