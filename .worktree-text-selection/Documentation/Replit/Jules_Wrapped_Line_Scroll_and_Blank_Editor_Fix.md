# Jules task: Fix wrapped-line scroll jumps and intermittent blank editor

Work on the latest W.mdx branch containing the verified fixes. The user confirmed that heading links inside lists work and nested callouts fold correctly. Do not modify those working features, table behavior, or unrelated UI. Focus only on the two remaining issues below.

## 1. Stop scroll jumps around wrapped lines

The user observes that jumps may happen when the bottom of the screen tries to bring the end of a logical line into view. With word wrap enabled, that line can span multiple visual rows, so the viewport shifts unexpectedly. Treat this as a useful hypothesis to verify, not a confirmed root cause.

Trace every path that can scroll the editor or WebView in response to cursor/selection changes, transactions, Android focus/IME updates, syntax decorations, and editor layout. Instrument relevant events temporarily or keep bounded debug-only telemetry to record before/after scrollTop, selection/caret rectangle, visual-line geometry, viewport height, and scroll cause. Do not log document text, filenames, or URIs.

Correct the behavior so visibility checks use the actual caret rectangle or visual wrapped row, not the far end or full bounding box of the logical line. Apply the smallest vertical scroll delta needed to expose the caret; do not force the caret or line end to the viewport bottom. Avoid competing CodeMirror scrollIntoView, DOM scrollIntoView, WebView, and Android requestRectangleOnScreen adjustments. Preserve the current scroll anchor during reflow and when the keyboard appears or disappears. Keep cursor navigation, word wrapping, and editing functional.

## 2. Diagnose and fix the intermittent blank document while scrolling

The document has occasionally gone blank during scrolling, once near the callout section. The cause remains unknown. Reproduce with long documents and nested callouts while monitoring the editor root and scroll container. Check CodeMirror view/plugin errors, DOM/editor-root removal or zero-height layout, WebView console/runtime errors, renderer loss, decoration/widget lifecycle, resize/reflow, and scroll callbacks. Do not assume this is caused by callouts just because one occurrence happened near them.

Add narrowly scoped, privacy-safe diagnostics sufficient to distinguish WebView renderer loss, JavaScript exception, editor DOM/root disappearing, root remaining present but rendering blank, and scroll/layout geometry failure. Avoid logging any document content or file identity. Fix the identified cause without clearing/recreating the document or losing unsaved edits. If renderer recovery is genuinely required, preserve and restore the latest document state and selection safely; do not reload repeatedly or mask the failure by hiding the editor.

## Constraints

- Preserve the verified list-heading-link and nested-callout fixes; do not reopen those tasks.
- Do not make broad scroll-position changes without tracing the source of the unwanted movement.
- Keep diagnostics bounded and privacy-safe; remove temporary noisy logging before completion.

## Verification

Add focused regression coverage for a long wrapped line near the bottom of the viewport, cursor movement across wrapped rows with the keyboard visible and hidden, and scrolling through long content containing nested callouts without a blank editor. Run the relevant tests and Android debug build, and fix task-introduced failures before committing.
