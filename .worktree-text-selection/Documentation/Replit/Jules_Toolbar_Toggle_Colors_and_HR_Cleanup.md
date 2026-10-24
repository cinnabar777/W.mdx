# Jules patch: toolbar-toggle colors + HR visibility cleanup

Target: `cinnabar777/W.mdx`, branch
`jules-3492949419147525921-af940c11`, currently at commit
`790d67d44a9df29c1a40b80ad7531a2305b9af44`.

The user asked for settings to customize the floating toolbar-toggle button's
background and icon colors. The current Control Bar settings already include
toolbar background/icon/active-icon settings. The floating toggle already has
theme defaults (`--toggle-bg`, `--toggle-color`), but its CSS hardcodes a
transparent background and text color; `applyAllPreferences` does not map
toggle colors.

Also include the previously agreed tiny cleanup: hide the horizontal-rule
Markdown source again while the caret is on it, since the user reports that
navigation now works and the temporary visible source is unnecessary.

Do not modify the table implementation, heading spacing, general navigation,
or scroll behavior.

## 1. Add two color preferences

In `app/src/main/res/xml/preferences_styling_controlbar.xml`, inside the
existing “Bottom Control Bar Customization” category, add:

```xml
<com.wmdx.markdownapp.ResetColorPickerPreference
    app:key="pref_toolbar_toggle_bg_color"
    app:title="Toolbar Toggle Background Color"
    app:summary="Background color for the floating button that shows or hides the bottom toolbar"
    app:defaultValue="default" />

<com.wmdx.markdownapp.ResetColorPickerPreference
    app:key="pref_toolbar_toggle_icon_color"
    app:title="Toolbar Toggle Icon Color"
    app:summary="Icon color for the floating button that shows or hides the bottom toolbar"
    app:defaultValue="default" />
```

Place these after the existing toolbar background/icon/active-icon preferences
and before the toolbar height setting.

## 2. Add default/reset values

In `app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt`, add these
cases to `PreferenceResetHelper.getDefaultColorHex`:

```kotlin
"pref_toolbar_toggle_bg_color" -> "#00000000"
"pref_toolbar_toggle_icon_color" -> "#FFFFFF"
```

The background default is transparent. The CSS theme fallback continues to
provide the current white/dark-theme or dark/light-theme icon color.

Add these cases to the existing default-preference-value `when`:

```kotlin
key == "pref_toolbar_toggle_bg_color" -> "default"
key == "pref_toolbar_toggle_icon_color" -> "default"
```

These must reset to `"default"` rather than saving the preview hex values; that
lets the existing theme defaults apply again. Use the existing
`ResetColorPickerPreference` behavior for preview circles and reset icons.

## 3. Use the two settings in CSS

In `web/index.html`, replace the two hardcoded background declarations and
text color in `.floating-toggle-btn`:

```css
background: transparent !important;
background-color: transparent !important;
color: var(--text-color) !important;
```

with:

```css
background: var(
  --toolbar-toggle-bg-color,
  var(--toggle-bg, transparent)
) !important;
background-color: var(
  --toolbar-toggle-bg-color,
  var(--toggle-bg, transparent)
) !important;
color: var(
  --toolbar-toggle-icon-color,
  var(--toggle-color, var(--text-color))
) !important;
```

Use the new `--toolbar-toggle-*` custom-property names for saved values. Do not
write custom values directly to `--toggle-bg` or `--toggle-color`: those
variables are set again on `body.light-theme`, which could override a custom
value inherited from the root in light mode. The new custom properties are
not redeclared by the theme and therefore work in either theme. When preference
value is `"default"`, the existing `setCssVar` helper removes the custom
property and the theme fallback is used.

## 4. Pass the values through `applyAllPreferences`

In `web/src/main.js`, inside `window.editorBridge.applyAllPreferences`, add
this helper immediately after the existing local `setCssVar` helper:

```js
// Android ColorPickerDialog stores alpha colors as #AARRGGBB.
// CSS 8-digit hex is #RRGGBBAA, so convert ARGB values to rgba() first.
const androidArgbToCss = (value) => {
  if (typeof value !== 'string') return value;
  const match = /^#([0-9a-f]{8})$/i.exec(value.trim());
  if (!match) return value;

  const [alpha, red, green, blue] = match[1]
    .match(/.{2}/g)
    .map(channel => parseInt(channel, 16));

  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
};
```

In the existing `// Toolbar` section, add:

```js
setCssVar(
  '--toolbar-toggle-bg-color',
  androidArgbToCss(prefs.pref_toolbar_toggle_bg_color)
);
setCssVar(
  '--toolbar-toggle-icon-color',
  androidArgbToCss(prefs.pref_toolbar_toggle_icon_color)
);
```

The Android activity already sends all saved preferences to
`applyAllPreferences`, so no separate native bridge mapping is needed.

## 5. Remove only the HR source reveal

In `web/src/main.js`, inside the existing `HorizontalRule` node branch, remove
the `caretIsOnRule` variable and restore the existing replacement condition:

```js
if (node.name === 'HorizontalRule') {
  addLineClass(line.from, 'cm-hr');
  if (!isNodeActive) {
    builder.push(Decoration.replace({}).range(node.from, node.to));
  }
}
```

Keep `horizontalRuleNavigationKeymap` and the HR padding CSS unchanged for
this patch. This restores the old branch's hidden-HR appearance without
undoing the working navigation.

## Checks

- Confirm both new settings appear in the existing Control Bar settings page
  and each has a visible reset icon/color swatch.
- Pick a solid toggle background and icon color; confirm both appear on the
  floating toolbar toggle in dark and light themes.
- Pick a semi-transparent background color; confirm alpha renders correctly.
- Reset each preference; background returns to transparent and icon returns
  to the appropriate theme default.
- Confirm the toggle still shows/hides the toolbar and its hit target remains
  easy to tap.
- Confirm HR navigation still works while the Markdown dashes remain hidden
  after the caret leaves the rule.
- Confirm heading sizes, scrolling, tables, and toolbar behavior are unchanged.

Do not mark the HR cleanup successful until tested on the device.
