# CodeMirror typography repair — Jules handoff

**Scope:** Fix typography preferences in the CodeMirror 6 branch only. Do not change file loading/saving, menus, tables, toolbar, editor mode behavior, or Android launch routing.

I checked branch `jules-3492949419147525921-af940c11`. It already has an initial mapping attempt, but several settings still do not visibly reach CodeMirror. Use the snippets below as targeted replacements/additions, not as a new editor implementation.

## 1. Make CSS value units safe

In `web/src/main.js`, inside `window.editorBridge.applyAllPreferences`, replace its current `setCssVar` helper with this. Some Android preference values already contain units such as `0px`; do not turn those into invalid `0pxpx` values.

```js
    // Set a CSS custom property; only append a unit to a plain numeric value.
    const setCssVar = (varName, value, unit = '') => {
      if (value === undefined || value === null || value === '' || value === 'default') {
        document.documentElement.style.removeProperty(varName);
        return;
      }

      const raw = String(value).trim();
      if (!raw || raw === 'default') {
        document.documentElement.style.removeProperty(varName);
        return;
      }

      const isPlainNumber = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(raw);
      document.documentElement.style.setProperty(varName, unit && isPlainNumber ? raw + unit : raw);
    };
```

## 2. Keep the shared heading scale separate from H1–H6 defaults

Replace the heading scale setup and the `pScale` calculation in the existing “Headings Global Defaults” / H1–H6 loop. The Android settings screen has one shared scale slider; it must scale all heading levels while keeping their different default sizes. Do not assign the shared scale as every level's individual size.

```js
    // Android stores these as shared preferences. Keep the shared multiplier
    // separate from each level's base size (H1 remains larger than H6).
    const globalHeadingScale = prefs.pref_heading_scale_percent != null
      ? Number(prefs.pref_heading_scale_percent) / 100
      : null;
    setCssVar('--heading-scale', globalHeadingScale);

    const globalHeadingWeight = prefs.pref_font_weight_heading;
    const globalHeadingAlign = prefs.pref_heading_align;
    const globalHeadingLineHeight = prefs.pref_heading_line_height;
    const globalHeadingLetterSpacing = prefs.pref_heading_letter_spacing;
    const globalHeadingTransform = prefs.pref_heading_text_transform;
    const globalHeadingUnderlineStyle = prefs.pref_heading_underline_style;
    const globalHeadingUnderlineThickness = prefs.pref_heading_underline_thickness;
    const globalHeadingUnderlineColor = prefs.pref_heading_underline_color;
    const globalHeadingMarginTop = prefs.pref_heading_margin_top;
    const globalHeadingMarginBottom = prefs.pref_heading_margin_bottom;

    // Preserve per-level colors and any older per-level values, while falling
    // back to the actual shared keys shown in preferences_styling_headings.xml.
    for (let i = 1; i <= 6; i++) {
      const pColor = prefs['pref_heading_' + i + '_color'];
      const oldLevelScale = prefs['pref_heading_' + i + '_scale'];
      const oldLevelFontSize = prefs['pref_heading_' + i + '_font_size'];
      const pScale = oldLevelScale != null
        ? oldLevelScale
        : (oldLevelFontSize != null ? Number(oldLevelFontSize) / 16 : null);
      const pAlign = prefs['pref_heading_' + i + '_align'] ?? globalHeadingAlign;
      const pLineHeight = prefs['pref_heading_' + i + '_line_height'] ?? globalHeadingLineHeight;
      const pLetterSpacing = prefs['pref_heading_' + i + '_letter_spacing'] ?? globalHeadingLetterSpacing;
      const pTransform = prefs['pref_heading_' + i + '_transform'] ?? globalHeadingTransform;
      const pUnderlineStyle = prefs['pref_heading_' + i + '_underline_style'] ?? globalHeadingUnderlineStyle;
      const pUnderlineThickness = prefs['pref_heading_' + i + '_underline_thickness'] ?? globalHeadingUnderlineThickness;
      const pUnderlineColor = prefs['pref_heading_' + i + '_underline_color'] ?? globalHeadingUnderlineColor;
      const pMarginTop = prefs['pref_heading_' + i + '_margin_top'] ?? globalHeadingMarginTop;
      const pMarginBottom = prefs['pref_heading_' + i + '_margin_bottom'] ?? globalHeadingMarginBottom;
      const pWeight = prefs['pref_heading_' + i + '_font_weight'] ?? globalHeadingWeight;

      setCssVar('--heading-' + i + '-color', pColor);
      setCssVar('--heading-' + i + '-scale', pScale); // null means use H1–H6 CSS defaults
      setCssVar('--heading-' + i + '-align', pAlign);
      setCssVar('--heading-' + i + '-line-height', pLineHeight);
      setCssVar('--heading-' + i + '-letter-spacing', pLetterSpacing, 'px');
      setCssVar('--heading-' + i + '-text-transform', pTransform);
      setCssVar('--heading-' + i + '-underline-style', pUnderlineStyle);
      setCssVar('--heading-' + i + '-underline-thickness', pUnderlineThickness, 'px');
      setCssVar('--heading-' + i + '-underline-color', pUnderlineColor);
      setCssVar('--heading-' + i + '-margin-top', pMarginTop, 'px');
      setCssVar('--heading-' + i + '-margin-bottom', pMarginBottom, 'px');
      setCssVar('--heading-' + i + '-font-weight', pWeight);
    }
```

**Important:** Keep the paragraph mappings reading the actual Android keys: `pref_letter_spacing`, `pref_paragraph_align`, `pref_justify_paragraph`, and `pref_paragraph_first_line_indent`. Use the safe helper above so numeric and already-unitized spacing values both work.

## 3. Make heading scales consistent in both CodeMirror render paths

In `web/src/main.js`, update the six heading entries in `customHighlightStyle` so they use the same per-level CSS variables as the line styles. Use one shared set of base factors in both places: H1–H6 = 1.8, 1.5, 1.3, 1.1, 1.0, 0.9. The current CSS line defaults differ for H1 and H2 (2.0 and 1.6); make those match too.

```js
  // Example for H1; use the equivalent level number and base factor for H2–H6.
  {
    tag: tags.heading1,
    color: 'var(--heading-1-color, #ffffff)',
    fontWeight: 'var(--heading-1-font-weight, var(--heading-font-weight, bold))',
    fontSize: 'calc(var(--body-font-size, 16px) * var(--heading-1-scale, 1.8) * var(--heading-scale, 1))'
  },
```

In `web/index.html`, update each `.cm-heading-N` font-size to use its matching base factor and multiply by the global `--heading-scale`. Example:

```css
/* Keep the existing other H1 properties; use the same H1 base as customHighlightStyle. */
.cm-heading-1 {
  font-size: calc(var(--body-font-size, 16px) * var(--heading-1-scale, 1.8) * var(--heading-scale, 1)) !important;
}
```

Apply the same pattern to H2–H6 with their current base defaults. This keeps the scale slider global without flattening the size hierarchy.

## 4. Apply paragraph-only settings to paragraph lines

The current JavaScript sets paragraph alignment, indentation, letter spacing, and margins, but those variables need CodeMirror line classes to affect only paragraphs—not headings, lists, tables, or code blocks.

In `livePreviewPlugin.buildDecorations` in `web/src/main.js`:

1. Add `const paragraphLineStarts = new Set();` next to the existing `builder` array.
2. Inside the existing `tree.iterate` callback, after it obtains `line`, add this paragraph branch. Keep the existing heading and other decoration logic.

```js
          // Give CodeMirror real line classes for the paragraph-only settings.
          if (node.name === 'Paragraph') {
            const doc = view.state.doc;
            const first = doc.lineAt(node.from);
            const last = doc.lineAt(Math.max(node.from, node.to - 1));

            for (let number = first.number; number <= last.number; number++) {
              const paragraphLine = doc.line(number);
              // Decorations are built for visible ranges; don't add off-viewport lines.
              if (paragraphLine.from < from || paragraphLine.from > to) continue;
              if (paragraphLineStarts.has(paragraphLine.from)) continue;
              paragraphLineStarts.add(paragraphLine.from);

              const classes = ['cm-paragraph'];
              if (number === first.number) classes.push('cm-paragraph-first');
              if (number === last.number) classes.push('cm-paragraph-last');
              builder.push(Decoration.line({
                attributes: { class: classes.join(' ') }
              }).range(paragraphLine.from));
            }
          }
```

Then add these rules in the CodeMirror styles in `web/index.html`:

```css
/* Paragraph settings apply only to Markdown Paragraph nodes. */
.cm-content .cm-paragraph {
  text-align: var(--paragraph-align, left) !important;
  letter-spacing: var(--paragraph-letter-spacing, normal) !important;
}
.cm-content .cm-paragraph-first {
  text-indent: var(--paragraph-indent, 0px) !important;
  margin-top: var(--paragraph-margin-top, 0px) !important;
}
.cm-content .cm-paragraph-last {
  margin-bottom: var(--paragraph-margin-bottom, 8px) !important;
}
```

If the parser uses a different syntax-tree name than `Paragraph` for normal text in this build, inspect the actual tree and use that exact name; do not fall back to styling every `.cm-line`, because that would affect lists, headings, and code.

## 5. Tests and phone checks required before calling it fixed

Update `web/test/typography.test.cjs` so it checks both the actual Android preference keys and CodeMirror CSS selectors—not just that a CSS variable string occurs somewhere in JavaScript. Then run the existing web tests and Android debug build.

On the phone, change one setting at a time and verify in **WYSIWYG** and **Live Preview**:

- Body font size and paragraph line height
- Paragraph alignment, first-line indent, letter spacing, top/bottom spacing
- Heading scale changes all H1–H6 while preserving different relative sizes
- Shared heading alignment, line height, letter spacing, transform, underline, margins, and weight
- Individual H1–H6 colors
- Reset each setting and confirm the default returns

Do not report a setting as fixed just because the app builds or a test finds its CSS variable name. The setting must visibly change the editor, and reset must visibly restore it.
