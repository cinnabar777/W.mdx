# Jules task: Make Find & Replace preview truly per-element, remove two height controls, restore visible search

Target: cinnabar777/W.mdx commit cf7459f1f70e3396dfc00d64ee9a266aa8871515. Keep this in one focused patch. Do not change editor engine, table model, file routing, or unrelated typography.

## Verified problems in this commit

- The graphical preview is made from hard-coded TextViews and fixed colors/symbols. Preference changes do not update its appearance; onSharedPreferenceChanged() only calls filterCategories().
- Every preview button click selects the same category_buttons. The XML contains only generic button preferences (pref_findreplace_btn_bg, color, active colors, pressed background, width and height), so there are no per-button controls.
- web/src/main.js already looks for per-button keys such as pref_findreplace_btn_prev_bg and pref_findreplace_btn_prev_svg, but the settings XML does not define these preferences. Therefore the per-button CSS/custom-SVG code has nothing to read.
- preferences_styling_findreplace.xml still exposes pref_findreplace_panel_min_height and pref_findreplace_btn_height, although both sizes should follow the field height.
- This commit’s JavaScript change only adds runFindAndCenter(). It does not fix visible search decorations; the previous “matches counted but nothing highlighted” failure is still not addressed by this commit.

## A. Make the preview reflect real settings and select individual controls

1. Use the actual Find/Replace bar markup and icons from web/index.html as the preview’s source of truth. Do not use substitute ▲/▼/≡ characters or fixed colors. Preview should be a faithful, tappable miniature/normal-size representation of the real two-row bar.
2. Give the preview an explicit selected element ID. Tapping a field, counter, or button selects that element and shows only that element’s settings beneath the preview. Tapping one button must never open a shared “all buttons” settings group.
3. Apply persisted preference values to the preview when it is first created and refresh it immediately in onSharedPreferenceChanged(). Show the selected button’s actual normal/active appearance and custom icon; edits must visibly change the preview without leaving the page.
4. Add independent settings for each action button, using the same IDs as the actual DOM controls:
   - prev, next, highlight, regex, close, replace-one, replace-all, case, word.
   - Each gets its own normal background, icon color, pressed background, width, and custom SVG text preference.
   - Toggle buttons highlight, regex, case, and word also get their own active background and active icon color. Do not add active-state settings to buttons that have no active state.
   - Use consistent keys, e.g. pref_findreplace_btn_prev_bg, pref_findreplace_btn_prev_color, pref_findreplace_btn_prev_pressed_bg, pref_findreplace_btn_prev_width, pref_findreplace_btn_prev_svg; add _active_bg and _active_color for the four toggles. Match these keys exactly in preferences_styling_findreplace.xml, applyAllPreferences(), and CSS.
5. Provide separate field settings for Find and Replace if they are individually selectable in the preview; do not send both taps to one indistinguishable “fields” group. Keep the container and counter independently selectable too.
6. Add a custom-SVG preference for every button. Provide a multiline/paste-friendly input with a reset action. Validate with the existing SVG sanitizer before applying; reject unsafe markup, scripts, event-handler attributes, foreignObject, external/data URLs, and malformed SVG. Invalid input must leave the previous valid icon intact and show a clear inline/toast error. Never apply raw unsanitized SVG.
7. Keep a fallback so preview failure does not hide preferences or trap the user. Retain the repaired root route pref_page_findreplace → StylingFindReplaceFragment.

## B. Remove the two redundant height settings

- Delete pref_findreplace_panel_min_height from the preference XML and remove its JS/CSS preference mapping.
- Delete pref_findreplace_btn_height from the preference XML and remove its mapping.
- The panel should size itself from its contents. Use pref_findreplace_field_height as the single height control for the two input rows and align the action buttons to those fields. No separate panel-minimum-height or button-height slider should remain in settings or reset/default lists.

## C. Fix Find/Replace rendering, not just its count

The current counter is computed by iterating a local SearchQuery, so a nonzero counter does not prove CodeMirror installed or displayed search decorations.

- Trace the exact active CodeMirror view when a query is entered. Ensure the search extension/state is installed once in every editor mode and editor rebuild, and that setSearchQuery reaches that same view.
- Add a browser regression test that types a term and asserts actual visible .cm-searchMatch decorations in the editor DOM, not just a nonzero counter. If marks exist but are invisible, inspect the hide-matches body class, active-match class, computed CSS custom properties, and selector specificity; test both normal and heading-styled text.
- Test next/previous selection and centered scrolling; keep the active match visible and visually distinct.
- Preserve search across paragraph text, headings, rendered tables, and code blocks. For rendered table widgets, verify the visible cell receives the search highlight, not merely a hidden/raw Markdown match.
- Test close/reopen and editor recreation/document loading. Do not reattach the app-owned static search bar to CodeMirror’s createPanel lifecycle as a shortcut.
- When Highlight All is on, every match should be visible; when off, only the active match remains visible. Updating the toggle should refresh the decorations immediately.

## Acceptance checklist

- Tapping each preview element opens its own relevant settings; all nine buttons are individually configurable.
- Change the Next button’s background/icon color and SVG: only Next changes in both preview and real search bar. Repeat with a different button.
- Invalid SVG cannot break the app or replace the current working icon.
- No panel minimum-height or button-height controls remain; changing field height resizes the panel contents naturally.
- Search test confirms visible marks in paragraph, heading, table cell, and code block, plus working next/previous and close/reopen.
- Android settings navigation and search UI do not regress. Report which tests ran and the actual result; do not claim search fixed from the counter alone.
