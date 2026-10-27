# Jules follow-up: Find & Replace settings preview is missing (commit 7d16ca2)

Target: cinnabar777/W.mdx commit 7d16ca2f0ebed31912e586e405aaa1838a1c0ddb. Do not change editor search/highlight behavior in this task; this is only the settings-page UI that is currently trapping the user on one category.

## Verified behavior in source

- The root page now routes pref_page_findreplace to StylingFindReplaceFragment, so the navigation fix is present.
- StylingFindReplaceFragment starts with selectedCategoryKey = category_panel and filterCategories() hides the fields, counter, and button categories.
- setupInteractivePreview() builds the only UI that can select those categories, but attaches it only inside: if (parent is android.widget.LinearLayout) { parent.addView(previewCard, 0) }.
- If the PreferenceFragmentCompat list's parent is another ViewGroup (for example FrameLayout), the preview is silently not attached, while filterCategories() still hides all other categories. The screenshot shows exactly that unusable state: only Search Panel Window preferences are visible and no preview/category selector appears.

## Required fix

1. Inspect/log the actual runtime parent class and child hierarchy for listView in StylingFindReplaceFragment. Do not assume it is LinearLayout.
2. Insert the preview reliably above the preference list using a supported container/header approach that works with the actual PreferenceFragmentCompat layout. Keep both the preview and the RecyclerView in normal vertical flow; do not overlay the preview on top of the list, and do not put a RecyclerView inside an unsupported parent.
3. Add a safety fallback: if the preview cannot be inserted, show all four preference categories rather than hiding three and leaving the user stuck.
4. Keep the current behavior where tapping the panel, find/replace fields, counter, or an action button selects its corresponding category below the preview. Ensure the preview is visible after fragment recreation/rotation too; do not add duplicate preview views.
5. Keep the user’s intended GUI: the graphical search/replace bar is the category selector. Do not replace it with a long flat settings list or move this page back under Typography.

A safe implementation may use a proper custom PreferenceFragmentCompat header/container, or a custom non-selectable Preference with a dedicated layout inserted before the four categories. Choose the approach compatible with the actual AndroidX preference list. If retaining programmatic insertion, support the actual parent type and correct layout params, and verify the list is pushed below the preview rather than covered by it.

## Acceptance test

- Open Settings → Editor Configuration Pages → Find & Replace Appearance.
- The two-row graphical preview is visible at the top immediately.
- Tap each preview element in turn: Search Panel, Find/Replace field, match counter, and action button. The corresponding options appear beneath the preview.
- Verify the preview remains visible while each category changes; verify no other categories are inaccessible.
- Rotate/recreate the page once: exactly one preview remains, with a working category selector.
- Force the preview insertion path to fail in a test or fallback: all category groups remain visible instead of disappearing.

Do not call this fixed based only on the settings page opening. The preview must actually be visible and usable on the phone.
