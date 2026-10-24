# Jules task: Fix nested callout folding, list heading links, and Android scroll/render issues

Work on the latest W.mdx branch that contains the currently working callout and link features. Do not replace the editor or revert unrelated working features. Preserve current table rendering, toolbar, typography/settings, and callout appearance.

## Confirmed issues

1. **Nested callout folding is incomplete.** With three nested callout levels, collapsing the outer callout hides only the next level; the third level remains visible. Collapsing a callout must hide its entire descendant content, regardless of nesting depth. A nested callout must still be independently collapsible when its parent is expanded. Preserve each callout’s initial + / - state and make repeated collapse/expand reliable without stale ranges or orphaned decorations.
2. **Existing defect: heading links inside lists do not work.** This is not a regression from the latest build. Heading links work outside lists but fail when placed in list items. Trace the link parser/target resolver and support heading anchors inside ordered and unordered list content, including nested lists. Preserve list structure and formatting. On activation, place the target heading in a useful visible position, not at the viewport bottom.
3. **New intermittent rendering bug: document goes blank while scrolling.** This happened once near the callouts section; the cause is unknown. Reproduce and trace around nested callouts and long documents. Check CodeMirror/DOM rendering, decorations/widgets, virtualized or deferred content, scroll/layout callbacks, and WebView console/runtime errors. Fix the actual failure without clearing/recreating the document, losing edits, or hiding the editor as a workaround.
4. **The prior scroll jump improvement has regressed.** Recheck the scroll/caret behavior that was improved before. Heading-link navigation and restored last reading/cursor position must land in a stable, visible area. If the Android keyboard magnifier still jumps to the screen corner when the caret crosses hidden/replaced syntax, inspect the caret geometry produced by those decorations too. Avoid broad scroll adjustments that reintroduce jumps elsewhere.

## Diagnostics supplied

The attached Android diagnostic report is SDK 37 / WebView 154.0.8037.126.0. It records a 13,781-character, 659-line file read completing in 70 ms and successful saves (33 ms, then 138 ms and 137 ms). It also records repeated window focus/pause/resume cycles. It does not record a renderer crash, JavaScript error, blank-screen event, or scroll position, so it does not prove the cause of the blank screen or jump. Add only bounded, privacy-safe diagnostics needed to distinguish renderer loss, JS exceptions, editor-root disappearance, and scroll/layout state; never log document text, file names, or URIs.

## Implementation requirements

- Trace the existing callout fold model and determine the complete descendant range for each callout from the parsed/editor structure, not by stopping at the first nested callout.
- Ensure nested folds compose correctly: folding a parent hides all descendants; unfolding it restores the children’s own fold states.
- Make list-contained heading navigation use the same anchor normalization and target lookup as links outside lists. Cover heading links in normal, ordered, unordered, and nested list items.
- Keep navigation/restoration inside the actual editor scroll container, measure after layout, and avoid scrolling the target beneath the fixed top panel or toolbar. Keep the target in the upper-middle portion of the usable viewport.
- For any returning caret/magnifier jump, inspect the geometry of the active caret when source syntax is visually hidden or replaced. Do not fix by moving focus, disabling editing, or adding a zero-size placeholder.
- Do not change established callout syntax or table behavior as a side effect.

## Required verification

Add regression coverage for: three-level callouts (outer and inner folding independently), list-contained heading links, heading navigation placement, remembered-position restoration, and scrolling across nested callouts without a blank editor. Run the relevant unit tests and Android debug build; fix failures introduced by this task before committing.
