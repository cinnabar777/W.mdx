# Jules patch: real SVG tint + rearrangeable Find & Replace buttons

**Base branch:** jules-3492949419147525921-af940c11
**Latest source commit checked:** 7c15453f4a29ae10ed6b89954ec2835567dcc913

Please do both items in one focused patch. Keep the existing Find & Replace appearance, button actions, and per-button styling controls. Do not remove or rename the existing button IDs.

## 1. Fix the SVG color in the Android Settings preview

### Why the current fix still leaves it black

The latest SettingsActivity renders the supplied SVG to an Android Picture, wraps it in PictureDrawable, then sets a Drawable colorFilter. PictureDrawable records/renders the SVG artwork through a Picture; applying the filter afterward does not reliably recolor the recorded black SVG fill. The live WebView icon and the native Settings preview use different rendering paths, so the live icon can be colored while the preview stays black.

### Required rendering path

In SettingsActivity.kt, in refreshFindReplacePreview(), keep resolving iconColor from that button's pref_findreplace_btn_<suffix>_color. Replace the PictureDrawable creation/filter block with an alpha-mask bitmap tint. Do not rely on PictureDrawable.colorFilter.

Use Android's existing Canvas/Bitmap/Paint/PorterDuffColorFilter and the already-installed AndroidSVG dependency:

~~~kotlin
val sourceBitmap = android.graphics.Bitmap.createBitmap(
    sizePx,
    sizePx,
    android.graphics.Bitmap.Config.ARGB_8888
)
val sourceCanvas = android.graphics.Canvas(sourceBitmap)
svg.renderToCanvas(sourceCanvas)

val tintedBitmap = android.graphics.Bitmap.createBitmap(
    sizePx,
    sizePx,
    android.graphics.Bitmap.Config.ARGB_8888
)
val tintPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
    colorFilter = android.graphics.PorterDuffColorFilter(
        iconColor,
        android.graphics.PorterDuff.Mode.SRC_IN
    )
}
android.graphics.Canvas(tintedBitmap).drawBitmap(sourceBitmap, 0f, 0f, tintPaint)
sourceBitmap.recycle()

val drawable = android.graphics.drawable.BitmapDrawable(
    btnView.resources,
    tintedBitmap
).apply {
    setBounds(0, 0, sizePx, sizePx)
}
btnView.text = ""
btnView.setCompoundDrawables(drawable, null, null, null)
~~~

Keep the existing SVG safety validation and size setup before rendering. SRC_IN must recolor the SVG's visible alpha to iconColor while preserving transparent pixels. In the invalid/empty/error path, restore the built-in glyph and clear the compound drawable exactly as now. Do not alter the WebView's already-working custom icon rendering.

## 2. Add a visual button arranger to the existing Settings preview

The current SettingsActivity already builds the two-row Find & Replace preview and maps each button to its own styling category. Extend that preview: a short press on a visible icon continues to open that icon's existing styling category; a long-press starts a drag. This keeps normal search-bar taps untouched and makes the settings mockup the layout editor.

Below the preview, add a clearly labeled **Hidden buttons — drag here to remove; tap + to restore** tray. Dropping a preview icon on this tray hides it from the real Find & Replace bar and the preview. Show a chip for each hidden icon with a visible + affordance. Tapping + restores the icon to its saved position. Hiding must not erase that button's custom SVG, style settings, or place in the saved order.

### Stable IDs and default layout

Use these existing stable IDs (without the search-btn- prefix):

~~~text
prev,next,highlight,regex,close,replace-one,replace-all,case,word
~~~

Add two SharedPreferences string values:

- pref_findreplace_button_order — comma-separated IDs in the user's visual order. Default: prev,next,highlight,regex,close,replace-one,replace-all,case,word
- pref_findreplace_hidden_buttons — comma-separated IDs currently hidden. Default: empty string

When reading order, accept only known IDs, remove duplicates, then append any missing known IDs in the default order. When reading hidden IDs, ignore unknown IDs. This makes a malformed/older preference harmless and ensures every button can always be restored.

Keep the ordered list complete even when a button is hidden; visibility is a separate hidden-ID set. That way tapping + restores the icon to its old slot.

### Settings preview interaction

In StylingFindReplaceFragment:

1. Keep the existing two preview rows and their fixed Find/Replace fields and counter. Keep two button-group containers, one per row.
2. On every refresh, reorder the existing previewButtonMap views using the saved order: first five IDs into row 1's icon group; remaining four into row 2's icon group. Do not recreate button views; this preserves each view's color, custom SVG, and existing click listener. Hidden IDs are omitted from the visible groups.
3. Preserve each preview button's short click listener that opens its existing category. Add a long-click listener that starts Android drag-and-drop with the button ID as ClipData.
4. Both icon-group rows must accept a dragged icon. On drop onto a row, insert that ID at the target position in the global ordered list, then repartition first-five/rest-four, save the order preference, and refresh the preview. Dropping onto the hidden tray adds the ID to the hidden set, saves it, and refreshes. Do not let a drag trigger the short-click category listener.
5. Render one + chip per hidden ID in the tray. Tapping + removes that ID from the hidden set, persists it, and refreshes. The icon returns to the same saved order slot.
6. Set the tray's drag target across its full width and give it a visible dashed/outlined drop area, so this works on a phone rather than requiring a precise tiny target. Do not hide a button when the user drops it somewhere else on the settings screen.
7. Refresh the preview and tray immediately after drag/drop, after tapping +, and after a related preference change. Existing button-specific appearance settings must continue to apply to their own preview icon.

### Apply the same order and hidden set to the real WebView bar

In web/src/main.js, add a small applyFindReplaceButtonLayout(prefs) helper and call it from the existing Find & Replace preference/theme application path. Use exactly the two preference keys above and the same default/validation rules.

- The real button elements already exist in web/index.html inside the two .search-icon-group containers. Move those existing nodes with appendChild; do not clone/recreate them, because initCustomSearchBar() has already attached functional listeners.
- Put the first five ordered IDs in the first row group and the remaining four in the second row group, matching the Settings preview.
- Set each hidden button's hidden property (or equivalent display:none) so it occupies no layout width. Do not remove the button from the DOM or detach its event handlers.
- Keep applying per-button colors, active state, pressed state, width, and custom SVG to the same existing nodes after reordering. Ensure the hidden state stays applied after every preference refresh.
- Add a small CSS rule only if required so an empty icon group takes no width and the input can use the freed space. Do not change the panel's pinned/full-width layout.

Ensure both new preference values are included in the existing native-to-WebView preferences payload. Do not create a separate storage mechanism or hard-code different defaults in Kotlin and JavaScript.

## 3. Make custom SVG entry phone-friendly: file picker plus paste

The current per-button Custom SVG Icon setting is a ResetEditTextPreference whose summary says “Paste custom SVG XML string.” Pasting must keep working, but on a phone the preferred path should be selecting an .svg file.

For each existing Custom SVG Icon preference, change the interaction to offer two choices:

- **Choose SVG file** — launch Android’s Storage Access Framework picker with ActivityResultContracts.OpenDocument and MIME type image/svg+xml (also accept text/xml and application/xml if the provider labels SVG files that way). Read the selected URI immediately through ContentResolver; do not request broad storage permission or retain the URI. Save the SVG text into that same existing pref_findreplace_btn_<suffix>_svg SharedPreferences key, so WebView rendering and Settings preview continue to use one value.
- **Paste SVG code** — retain the existing multiline text editor for users copying SVG markup directly.

Use one reusable dialog/action for all button-specific SVG preferences; capture the selected preference key before opening the picker so the result updates the correct icon. Keep the existing reset control to clear the custom SVG and restore the built-in icon.

Before saving a picked file:

1. Read as UTF-8 with a strict maximum of 64 KiB; reject larger files with a short, themed error message.
2. Run the same safety validation used for pasted SVG, then require a parseable SVG document. Reject scripts, event handlers, external references, embedded objects, and other content already rejected by the app's SVG sanitizer. Do not silently truncate.
3. Store the validated SVG text, refresh the Settings preview immediately, and let the existing native-to-WebView preference sync update the actual toolbar.
4. Show the selected file name in the preference summary, but never store a filesystem path or persist URI permissions. If the user later moves/deletes the original file, the icon still works because the SVG text is stored in the existing preference.

Keep paste available; a picker-only design would make it harder to use SVG markup copied from an icon source. The file picker is the easiest default workflow, and both entry methods should produce the same validated stored SVG.

## Acceptance checks

1. Use a custom SVG whose paths have fill="#000000". Set that button's icon color to bright red, green, then white. The Settings preview must visibly change each time and match the live search icon. Reset the SVG and confirm the built-in icon returns with the selected icon color.
2. In the Settings preview, long-press and reorder icons within and across both rows. Confirm each appears in the same order in the actual Find & Replace bar after leaving Settings. Restart the app and confirm the order persists.
3. Drag Regex and Highlight All into the Hidden buttons tray. Confirm they disappear completely from the actual search bar, leaving no blank slots and giving the other controls the freed room. Tap each + chip and confirm that icon returns to its original saved slot, still with its function and custom styling.
4. Verify all nine buttons still perform their original actions after reorder, hide, restore, settings refresh, and app restart. Short-tapping a preview icon must still open its individual settings; long-press must drag instead.
5. For one button, import an SVG using the picker, then another using paste. Both methods must update the same preview and live icon; reset must clear either one. Test a non-SVG, malformed SVG, unsafe SVG, and a file over 64 KiB; each must be rejected without replacing the previous valid icon.
6. Run existing Android build and JavaScript tests. Add focused tests for order/hidden normalization and application if possible without adding dependencies.

**Scope:** fix the preview's rendered tint and add persistent reorder/hide/restore in the existing Settings preview. Do not change Find & Replace search/replace logic, the default button order, the table widget, or unrelated settings.
