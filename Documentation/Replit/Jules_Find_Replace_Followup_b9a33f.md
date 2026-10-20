# Jules follow-up: Find & Replace page won’t open; search count without visible highlights

Target commit: b9a33fcbeb44835344ec94403406208094624193 (parent 42ae1070536c549b6c110132d8f4735127dc1e5f).

Please fix only the two regressions below. Preserve the interactive preview/settings design and the existing app-owned search bar. Do not rewrite the editor or alter unrelated table, toolbar, or document-routing behavior.

## 1) Make the moved settings page open

### Verified cause

The new root settings row is in app/src/main/res/xml/preferences.xml with key pref_page_findreplace. The root SettingsFragment.onPreferenceTreeClick() in SettingsActivity.kt does not handle that key. The only route in the file is pref_styling_page_findreplace inside StylingSettingsFragment, but that old row was removed from preferences_styling.xml. Therefore tapping the new row falls through to the superclass and does not navigate.

### Exact fix

In SettingsFragment.onPreferenceTreeClick(), add this case to its existing when (key) before the fallback:

    "pref_page_findreplace" -> {
        parentFragmentManager.beginTransaction()
            .replace(R.id.settings_container, StylingFindReplaceFragment())
            .addToBackStack(null)
            .commit()
        return true
    }

Keep the existing destination fragment: StylingFindReplaceFragment loads R.xml.preferences_styling_findreplace. Do not move the row back under Typography or change its key. Verify that tapping Find & Replace Appearance opens the page and Android Back returns to the root settings screen.

## 2) Restore visible search highlights (not merely the match count)

### What the current code proves—and doesn’t

In web/src/main.js, commitSearchQuery() dispatches setSearchQuery.of(query). But updateMatchCounterFromQuery(query, view) independently iterates that local query object and updates the count. A visible count therefore proves the query can find text; it does not prove the active CodeMirror view has search decorations or that CSS is displaying them.

The current editor extension uses search() and the custom app bar is now shown/hidden independently. Keep this separation: do not reattach the app-owned #custom-search-bar to CodeMirror’s panel lifecycle and do not call openSearchPanel()/closeSearchPanel() just to make highlights reappear.

### Required diagnosis and repair

Trace one typed query through the actual editor instance and make the rendered decoration the acceptance criterion:

1. In a short test document containing the same word twice in a paragraph and once in a heading, type a literal search term with Highlight All enabled.
2. Confirm the exact activeAdapter.view receives the setSearchQuery effect and that the view’s DOM renders .cm-searchMatch marks after the dispatch. The current CodeMirror search extension must be installed exactly once in every editor mode/rebuild that supports Find.
3. If the marks are absent, fix the search extension/state wiring so the active view renders them. Check that the query passed to the CodeMirror search state is the same query being counted; don’t “fix” this by drawing unrelated manual whole-document spans.
4. If marks exist but cannot be seen, inspect body.cm-search-hide-matches, the selected-match class, the computed --findreplace-match-bg / --findreplace-current-match-bg / --findreplace-current-match-color values, and CSS specificity. With Highlight All ON, every match must have a visible background; the current match must have its active background and text color. With Highlight All OFF, only the current match may remain visible.
5. Repeat after closing/reopening the bar and after editor recreation/document load. Search bar visibility must not clear the search query/decorations. Preserve heading text legibility when the active match is inside a syntax-styled heading.
6. The counter must be refreshed from the query actually installed in the active view (or clearly kept separate from decoration state); it must never be used as proof that visible highlighting works.

Do not restore the old panel-owned createPanel arrangement as a shortcut; the last change intentionally moved the static search bar outside that lifecycle to prevent the close/reopen regression.

## Tests required before calling it fixed

- Settings: tap the moved settings row → page opens → Back returns correctly.
- Literal search: two ordinary-text matches and one heading match are visibly highlighted; the active one is visually distinct.
- Toggle Highlight All off/on updates rendered highlights immediately without changing the count.
- Close and reopen Find & Replace; the query and visible decorations remain usable.
- Recreate/load an editor, then search again; rendered decorations return.
- Invalid regex continues to show its inline error and does not leave stale highlights/counts.

Report which condition failed (no DOM decorations vs. invisible CSS) and the regression test added. Do not claim success based on a nonzero match count alone.
