# Jules patch: keep body text size out of code blocks

**Target:** current W.mdx branch after commit `fbe086ebb64b66c1385b6e2e0724bb6b7e1d0034` (“Classify paragraph and list lines in CodeMirror livePreviewPlugin”). Preserve that paragraph/list fix and the already-tested toolbar-toggle colors and horizontal-rule behavior.

## Observed result

Phone test report:

- Body text size changes, but also changes code-block text — still broken.
- Paragraph letter spacing — fixed.
- Body paragraph font — fixed.
- Paragraph top margin — fixed.

The current CodeMirror theme sets the editor’s base font size to `--body-font-size`; code-block lines inherit it unless they set their own size. Give code blocks a separate size preference, defaulting to 14 CSS px, so body-size changes cannot resize code blocks. This also gives the user an independent code-block size control.

## 1. Add a code-block font-size preference

In `app/src/main/res/xml/preferences_styling_code.xml`, add this slider inside the existing **Code Block Styling** category, before the padding preference:

```xml
        <com.wmdx.markdownapp.ResetSeekBarPreference
            app:key="pref_code_block_font_size"
            app:title="Code Block Text Size (px)"
            app:summary="Font size for code inside fenced code blocks"
            app:min="8"
            android:max="32"
            app:defaultValue="14"
            app:showSeekBarValue="true" />
```

In `app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt`, add the reset default in `getDefaultValue()`:

```kotlin
            key == "pref_code_block_font_size" -> 14
```

Keep this as a `ResetSeekBarPreference`; it should receive the normal reset icon and restore to 14.

## 2. Map the setting to CSS

In `web/src/main.js`, inside `window.editorBridge.applyAllPreferences`, add this mapping in the existing `// Code blocks` section:

```js
    setCssVar('--code-block-font-size', prefs.pref_code_block_font_size, 'px');
```

Do not change the existing `--body-font-size` mapping or CodeMirror editor theme. Body size still controls the editor’s normal text; code blocks will now have their own explicit size.

## 3. Apply the independent size to code-block lines

In `web/index.html`, inside the existing `.cm-content .cm-codeblock-line` rule, add:

```css
      font-size: var(--code-block-font-size, 14px) !important;
```

Also add the same declaration to the existing `.cm-content .cm-codeblock-line span` rule. This makes syntax-colored spans follow the code-block size instead of inheriting the editor’s body size.

Keep the language/copy header styling unchanged; its label already uses its own 12px size.

## 4. Regression tests

In `web/test/typography.test.cjs`, add a read for the code-block settings XML alongside the existing settings-file reads:

```js
const codeSettingsPath = path.join(
  __dirname,
  '../../app/src/main/res/xml/preferences_styling_code.xml'
);
const codeSettings = fs.readFileSync(codeSettingsPath, 'utf8');
```

Add these checks:

```js
test('code blocks have a separate font-size preference and CSS variable', () => {
  assert.match(codeSettings, /app:key="pref_code_block_font_size"/);
  assert.match(codeSettings, /app:title="Code Block Text Size \(px\)"/);
  assert.match(source, /pref_code_block_font_size/);
  assert.match(source, /setCssVar\('--code-block-font-size', prefs\.pref_code_block_font_size, 'px'\)/);
  assert.match(indexHtml, /font-size:\s*var\(--code-block-font-size,\s*14px\)\s*!important/);
});
```

Also update the existing `getDefaultValue()` test coverage or add a lightweight source assertion that `ResetPreferences.kt` maps `pref_code_block_font_size` to `14`.

## Verification

Run from `web/`:

```sh
npm test
npm run build
```

Then build and install the normal Android debug build. In Settings, change **Body Text Size** substantially (for example, 16 → 26) and confirm:

1. Regular paragraph text changes size.
2. Code-block text does not change with the body-size slider.
3. **Code Block Text Size** independently changes the code text, including syntax-colored text.
4. Resetting the code-block size returns it to 14.
5. The language label and Copy button keep their current appearance and behavior.
6. Paragraph letter spacing, paragraph font, and top margin remain fixed as reported; list spacing and navigation do not regress.

Do not mark the body-size/code-block issue fixed until this is checked in a phone build.
