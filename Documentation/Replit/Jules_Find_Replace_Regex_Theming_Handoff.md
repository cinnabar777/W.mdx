# Jules handoff — Find & Replace repair, regex history, settings preview, and themed toasts

## Target and guardrails

- Repository: https://github.com/cinnabar777/W.mdx
- Latest inspected branch: jules-3492949419147525921-af940c11
- Inspected base commit: 1670b68b851915bb1e86548ac3e0540481913fcf
- If Jules has created a newer branch/commit, start from that current working branch and inspect its latest files before editing. Do not reset or replace newer work.
- Keep the existing Find/Replace window design: two rows, full width, placed at the top above the editor. Do not redesign it, move it, make it floating, add a panel radius setting, or add panel width/position settings.
- Keep the work limited to Find/Replace, its new settings page, and centralized app-toast styling. Do not change editor modes, toolbar layout, tables, typing, or unrelated styling.
- Do not use CodeMirror’s default search panel as a second visible panel. The existing HTML panel is the UI.

## What is in the inspected source now

- The panel markup is in web/index.html. It already has Find and Replace rows, a match counter, Previous/Next, Highlight, Regex, Close, Replace One, Replace All, Match Case, and Whole Word buttons.
- The controls are wired in web/src/main.js, but Previous, Next, and Highlight are not wired. Match Case and Regex affect the hand-built match counter and replacements. Whole Word toggles visually but is not applied to matching.
- Replace One replaces the first matching text in the entire document. Replace One and Replace All call activeAdapter.setMarkdown(), which makes a programmatic whole-document replacement instead of a normal undoable CodeMirror edit.
- web/package.json does not currently include @codemirror/search; keep web/package-lock.json in sync when adding it.
- Settings pages are routed by StylingSettingsFragment in app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt and listed in app/src/main/res/xml/preferences_styling.xml. MainActivity.applyThemeAndFullscreenPreferences already sends all SharedPreferences to editorBridge.applyAllPreferences; map new visual keys in web/src/main.js rather than building a second preference bridge.
- MainActivity.kt already has an iconless custom showCustomToast, but uses direct Toast.makeText in other places. SettingsActivity.kt also has direct Toast.makeText calls. They currently do not all share the requested appearance.

## 1. Make the existing search actually work

### Use CodeMirror’s search implementation

Add the current compatible @codemirror/search package to web/package.json and update web/package-lock.json. Import the package APIs in web/src/main.js:

~~~js
import {
  search,
  SearchQuery,
  setSearchQuery,
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll
} from '@codemirror/search';
~~~

Add search() to the CodeMirror extensions created by CodeMirrorAdapter.init(). Supply a custom createPanel adapter that reuses the existing #custom-search-bar element. Opening/closing the existing bar must also open/close CodeMirror’s search state so CodeMirror’s search decorations work. Preserve the current top-of-editor, full-width location and appearance; do not let CodeMirror create its stock panel or show two panels.

Use the current UI values to create a SearchQuery. This is the integration shape; wire it to the existing buttons and activeAdapter.view:

~~~js
function buildSearchQuery() {
  return new SearchQuery({
    search: searchInput.value || '',
    replace: replaceInput.value || '',
    caseSensitive: searchState.matchCase,
    wholeWord: searchState.wholeWords,
    regexp: searchState.useRegex
  });
}

function commitSearchQuery() {
  const view = activeAdapter?.view;
  if (!view) return false;

  const query = buildSearchQuery();
  if (!query.search) {
    clearInlineSearchError();
    clearMatchCounter();
    view.dispatch({ effects: setSearchQuery.of(query) });
    return true;
  }
  if (!query.valid) {
    if (searchState.useRegex) {
      showInlineSearchError('Invalid regular expression');
    }
    return false;
  }

  clearInlineSearchError();
  view.dispatch({ effects: setSearchQuery.of(query) });
  updateMatchCounterFromQuery(query, view);
  return true;
}
~~~

Use CodeMirror’s query/cursor and commands—not a separate RegExp over activeAdapter.getMarkdown():

- On valid query change, update the query state and select the first result when one exists. The query must carry literal-vs-regex, match-case, whole-word, and replacement text.
- Previous and Next call findPrevious(view) and findNext(view), with CodeMirror’s wrap-around behavior. Keep the editor selection at the active match and scroll it into view.
- Replace One must replace the currently selected match and leave/select the next match. If no match is selected yet, select the first/next result before replacing so one tap has predictable behavior.
- Replace All must use replaceAll(view). It must be one normal CodeMirror transaction, undoable with one Undo, and must not call setMarkdown().
- The Highlight button must actually toggle all-match highlighting while preserving the active-match indication. Keep its active visual state synchronized with the toggle.
- Match Case and Whole Word must affect navigation, counter, highlight and both replacement commands, not only button appearance.
- A bad regex displays an inline error next to the search field/counter. It must not crash, erase the query, alter the document or throw on Replace One/All. Typing a corrected pattern clears the error.
- Preserve editor selection/focus sensibly when opening and closing the panel. Finding a result should select it. Closing should return focus to the editor without changing toolbar visibility or disabling the toolbar toggle.
- Do not synchronously rescan a large document for every keystroke just to update the count. Debounce count refresh; iterate SearchQuery.getCursor(view.state) in cancellable short chunks, cap the displayed count (for example, show 10,000+), and discard stale work when a newer query arrives. Keep next/previous navigation responsive.

CodeMirror’s SearchQuery exposes valid, getCursor(state), and supports regexp and wholeWord. The search extension’s built-in visible-match decorations depend on its panel being open; integrating the existing panel through search({createPanel}) is important. Do not merely call findNext while leaving the search panel state closed.

## 2. Regex history and long-press behavior

- Keep the Regex button’s short tap as the regex on/off toggle.
- Long-pressing the Regex button opens a compact, themed history list anchored to that button. Selecting an entry fills the Find field and runs the query; it does not change the Replace field.
- Save only valid, nonempty regex patterns, most-recent first, with duplicates moved to the front. Keep at most 20. Store locally on-device (version the storage key); do not send patterns or document text to diagnostics/analytics. Provide “Clear history.” Invalid patterns are not saved.
- Long press is about 500 ms; cancel it if the pointer moves more than 10 dp or is cancelled/released early. Suppress the click after a successful long press so it does not also toggle Regex.
- For the other Find/Replace icons, long press shows a short description using the app’s themed toast. Regex is the deliberate exception: long press opens history. Provide its purpose through its accessibility label and history-panel hint.
- Every icon button keeps an accessible name/title and keyboard/screen-reader access. Long-press behavior must not be the only way to learn what a control does.

## 3. Add the Find & Replace settings page

Add a “Find & Replace” entry under the existing Editor Configuration Pages / Styling & Typography category in app/src/main/res/xml/preferences_styling.xml. Route it from StylingSettingsFragment to a new StylingFindReplaceFragment in SettingsActivity.kt. Use a custom fragment/layout for the graphical editor; do not force this interactive preview into a long list of ordinary XML preferences.

### Preview and interaction

- The preview reproduces the real existing two-row, full-width, top-pinned search window at the phone’s available width.
- Tapping the panel, a field, the counter, or an individual button selects that element and shows only its relevant configurable controls below the preview.
- Selecting the whole panel shows container controls. Selecting Find and Replace shows that field’s controls. Selecting a button shows that button’s controls.
- Preview updates immediately as values change and reflects the same saved values used by the editor. Do not create a separate preview-only style system.
- Keep the two-row layout. Button width changes must not push controls offscreen or create horizontal scrolling; the two text fields remain flexible.
- Include per-property reset-to-default and a page-level Reset Defaults action.

### Exposed settings

Panel/container:
- Height (use a minimum/vertical sizing value that cannot clip the two rows; do not let a setting hide controls).
- Background color including alpha/transparency.
- Border color. Keep the existing full-width placement and do not expose panel radius, width or position.

Find and Replace fields, independently:
- Border color; focused/active border color; background color; text color.
- Placeholder color, text size and field height. Keep text readable and the fields flexible.

Counter and match feedback:
- Counter text color.
- All-match highlight color and active/current-match highlight/background text colors. Maintain a visible distinction between the active result and other results.

Each icon button (Previous, Next, Highlight, Regex, Close, Replace One, Replace All, Match Case, Whole Word):
- Button background and icon color; active background/icon colors; pressed background; disabled icon/background colors.
- Button width/height and visual SVG size are separate values so the hit target does not shrink with the artwork.
- Allow a pasted custom SVG, with a live preview and per-icon reset. Validate and sanitize it: reject script, foreignObject, event-handler attributes and external links; only allow safe local SVG geometry and attributes. Invalid input keeps the last valid/default icon and shows an inline error.
- The current search controls use text glyphs (for example ▲, ▼, .* and Aa), not a consistent SVG set. Replace those with simple, consistent inline SVG defaults first, using currentColor, and keep Regex’s “.*” meaning clear. Keep the current button arrangement and labels/tooltips.

Use stable preference keys with a pref_findreplace_ prefix. Add defaults/reset handling in ResetPreferences.kt. Map colors and dimensions to CSS custom properties in web/src/main.js inside editorBridge.applyAllPreferences; use the existing ARGB-to-CSS alpha conversion for Android color-picker values. Apply preferences both at startup and after returning from Settings, as the current app already does.

Suggested CSS variable names (Jules may adjust names, but use one consistent mapping end-to-end):

~~~text
--findreplace-panel-min-height
--findreplace-panel-bg
--findreplace-panel-border
--findreplace-field-border
--findreplace-field-focus-border
--findreplace-field-bg
--findreplace-field-color
--findreplace-field-placeholder
--findreplace-field-font-size
--findreplace-field-height
--findreplace-counter-color
--findreplace-match-bg
--findreplace-current-match-bg
--findreplace-current-match-color
--findreplace-{button-id}-bg
--findreplace-{button-id}-color
--findreplace-{button-id}-active-bg
--findreplace-{button-id}-active-color
--findreplace-{button-id}-pressed-bg
--findreplace-{button-id}-disabled-color
--findreplace-{button-id}-width
--findreplace-{button-id}-height
--findreplace-{button-id}-svg
~~~

Do not add a radius property for the overall panel. The text fields/buttons may keep their existing shape; this task is not a redesign.

## 4. Theme every toast created by the app

Create or extract one shared ThemedToast helper and route all app-created toast messages through it. The helper must read the current app setting pref_app_theme each time it displays a message:

- Dark mode: simple dark-gray background (#282828 is the existing dark toast color) with white text (#FFFFFF).
- Light mode: simple light-gray background (#E0E0E0 is the existing light toast color) with black text (#111111).
- No icon, image, or decorative badge. Retain short/long durations where useful.
- Include Find/Replace long-press help messages.
- Replace direct Toast.makeText calls throughout MainActivity.kt and SettingsActivity.kt, plus any other app-owned direct toast paths. Keep AndroidNative.showToast routed through the same helper so WebView messages (including code-block copy) match. There must be one app-level appearance source; do not leave the current custom and default toast paths visually different.
- This requirement covers messages the app creates, not Android system UI messages owned by the operating system.

## Files expected to change

- web/package.json and web/package-lock.json
- web/src/main.js
- web/index.html (only for inline error/status/accessibility attributes and icon markup; preserve panel layout)
- app/src/main/res/xml/preferences_styling.xml
- app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt
- app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt
- a custom Find/Replace settings layout/resource and, if appropriate, a ThemedToast.kt helper

Do not modify unrelated editor behavior. Tell the user exactly which files changed and what was intentionally left alone.

## Acceptance tests

Automated:
1. Literal search for a.b matches the literal period; regex mode a.b matches a character between a and b.
2. Regex examples such as \\d+ and ^Heading work; malformed [ shows an inline error and causes no crash or document edit.
3. Match Case and Whole Word each change the result set correctly; test a word that is embedded in a longer word.
4. Previous/Next move the selection through results and wrap at the document ends; the match counter reports current/total and zero matches correctly.
5. Replace One changes the selected occurrence only; Replace All changes every match; one Undo restores the exact original text after either operation.
6. Regex history contains only valid regex patterns, caps at 20, deduplicates by moving an existing pattern to the front, survives app/editor restart, restores a selected pattern, and can be cleared.
7. Long press Regex opens history and does not toggle regex; short tap toggles regex. Other search icons show the right help toast only after long press; ordinary tap still performs the action.
8. Find/Replace settings survive reopening Settings and restarting the app. Preview and live panel agree for both themes, alpha colors, field focus, active/pressed/disabled icons and custom SVG. Invalid SVG is rejected without breaking the UI.
9. Search remains responsive on a large document; query edits do not synchronously enumerate all matches on the UI thread.
10. Every app-created toast tested from both MainActivity and SettingsActivity uses the same theme colors and has no icon.

Manual phone checks:
- Open Find/Replace from the toolbar and Ctrl+F; verify the same existing full-width top panel remains in place and the keyboard works.
- Test find, next/previous, highlighting, regex history and replace/undo on a realistic document.
- Verify opening/closing Find/Replace does not hide or disable the bottom toolbar/toggle.
- In light and dark mode, trigger search-icon help, copy-code, save/error, and a Settings toast; verify matching text/background colors and no icon.
- Change one setting per preview element, reopen the editor and verify it applies. Test reset for a single item and whole page.

Run web tests/build and Android unit tests/debug build using the repository’s existing scripts. Report the exact commands and outcomes. Do not claim phone behavior is verified until the user installs and tests Jules’s debug build.
