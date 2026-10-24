---
name: TOC panel behavior
description: The expected default expansion, active-heading, and cross-view behavior for the app's TOC panel.
---

The TOC follows the heading visible in the editor viewport, not only the caret. On opening, show the outline through H2 by default, and mark the first heading active when the document is at the top. When a heading jump places a heading at 30% of the viewport, the active-heading sample point must match that landing position. As the user scrolls, reveal the current heading's parent path, collapse the deeper branch they leave, and center the active heading in an overflowing panel. A plus tap expands one heading level by default, with a setting for expansion depth. Headings with no children keep a visible minus but do not toggle. Preserve this behavior across WYSIWYG, live preview, and source mode.

**Why:** The user expects the TOC to stay synchronized with reading position while remaining navigable in long documents; the previous cursor-only behavior and expand-everything behavior did not meet that expectation. A mismatch between heading jump placement and the active-heading sample point marked the preceding heading instead.

**How to apply:** Keep scroll-based active-heading detection and expansion state independent of an individual editor view. Rebuild the TOC after mode changes and center the active row when the panel opens or the active heading changes. Handle scroll position zero explicitly before sampling a viewport point.
