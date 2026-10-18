# CodeMirror typography implementation notes for Jules

This is implementation code for the current CodeMirror branch, not a tested
drop-in patch. Apply it to the current branch after checking that the names and
surrounding code still match. Keep the work limited to typography and its
tests; do not alter file handling, Android launch routing, editing commands,
undo, selection, toolbar behavior, or performance code.

## What this is intended to fix

The current Android host sends the full preference object to
`window.editorBridge.applyAllPreferences`, but the bridge does not map all of
the styling preferences. Some existing CSS still targets `.ck-content`, which
does not style the CodeMirror editor. The CodeMirror `.cm-content` rule also
sets body size, body font, and paragraph line height globally, so those
paragraph settings leak into headings and other blocks.

## 1. Replace the preference-to-CSS mapping

In `web/src/main.js`, inside `window.editorBridge.applyAllPreferences`, replace
the existing `setCssVar` helper and the scattered preference assignments with
the helper and map below. Keep the theme and line-wrap handling around it.

The helper removes a custom property for `"default"` so the CSS fallback
becomes active again after reset. It also avoids producing invalid values such
as `0pxpx`.

```js
    const setCssVar = (name, value, unit = '') => {
      if (value === undefined || value === null || value === '' || value === 'default') {
        document.documentElement.style.removeProperty(name);
        return;
      }

      const raw = String(value).trim();
      if (!raw || raw === 'default') {
        document.documentElement.style.removeProperty(name);
        return;
      }

      // Preserve explicit CSS units; append the requested unit only to numbers.
      const isNumber = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(raw);
      document.documentElement.style.setProperty(name, unit && isNumber ? raw + unit : raw);
    };

    const setPreference = (key, cssName, unit = '') =>
      setCssVar(cssName, prefs[key], unit);

    // Headings: shared settings plus the six per-heading colors exposed by
    // the current Android preferences screen.
    setCssVar(
      '--heading-scale',
      prefs.pref_heading_scale_percent == null
        ? null
        : Number(prefs.pref_heading_scale_percent) / 100
    );
    setPreference('pref_font_weight_heading', '--heading-font-weight');
    setPreference('pref_heading_align', '--heading-align');
    setPreference('pref_heading_line_height', '--heading-line-height');
    setPreference('pref_heading_letter_spacing', '--heading-letter-spacing');
    setPreference('pref_heading_text_transform', '--heading-text-transform');
    setPreference('pref_heading_underline_style', '--heading-underline-style');
    setPreference('pref_heading_underline_thickness', '--heading-underline-thickness', 'px');
    setPreference('pref_heading_underline_color', '--heading-underline-color');
    setPreference('pref_heading_margin_top', '--heading-margin-top', 'px');
    setPreference('pref_heading_margin_bottom', '--heading-margin-bottom', 'px');
    for (let level = 1; level <= 6; level++) {
      setPreference(`pref_heading_${level}_color`, `--heading-${level}-color`);
    }

    // Body and paragraph preferences. Do not put paragraph-only variables on
    // every .cm-line; the paragraph decorations and CSS below scope them.
    setPreference('pref_body_font_size', '--body-font-size', 'px');
    setPreference('pref_paragraph_line_height', '--paragraph-line-height');
    setPreference('pref_letter_spacing', '--paragraph-letter-spacing');
    setPreference('pref_paragraph_align', '--paragraph-align');
    setPreference('pref_paragraph_first_line_indent', '--paragraph-first-line-indent', 'px');
    setPreference('pref_paragraph_margin_top', '--paragraph-margin-top', 'px');
    setPreference('pref_paragraph_margin_bottom', '--paragraph-margin-bottom', 'px');
    setCssVar(
      '--paragraph-align',
      prefs.pref_justify_paragraph === true ? 'justify' : prefs.pref_paragraph_align
    );

    // Inline styling.
    setPreference('pref_bold_color', '--bold-color');
    setPreference('pref_font_weight_bold', '--bold-font-weight');
    setPreference('pref_italic_color', '--italic-color');
    setPreference('pref_font_weight_italic', '--italic-font-weight');
    setPreference('pref_link_color', '--link-color');
    setPreference('pref_link_decoration', '--link-decoration');
    setPreference('pref_code_color', '--code-color');
    setPreference('pref_code_bg_color', '--code-bg-color');
    setPreference('pref_code_padding', '--code-padding', 'px');
    setPreference('pref_code_border_radius', '--code-border-radius', 'px');

    // Footnote appearance. These variables only have an effect if the editor
    // actually renders footnote markup; this is not a footnote-plugin feature.
    setPreference('pref_footnote_font_size', '--footnote-font-size', 'px');
    setPreference('pref_footnote_text_color', '--footnote-text-color');
    setPreference('pref_footnote_ref_color', '--footnote-ref-color');
    setPreference('pref_footnote_link_color', '--footnote-link-color');
    setPreference('pref_footnote_bg_color', '--footnote-bg-color');

    // Lists and checkboxes.
    setPreference('pref_list_left_indent', '--list-left-indent', 'px');
    setPreference('pref_list_item_spacing', '--list-item-spacing', 'px');
    setPreference('pref_list_line_height', '--list-line-height');
    setPreference('pref_list_bullet_color', '--list-bullet-color');
    setPreference('pref_list_number_color', '--list-number-color');
    setPreference('pref_todo_unchecked_color', '--todo-unchecked-color');
    setPreference('pref_todo_checked_color', '--todo-checked-color');

    // Tables. The table widget must use these variables too; see section 5.
    setPreference('pref_table_border_style', '--table-border-style');
    setPreference('pref_table_border_thickness', '--table-border-width', 'px');
    setPreference('pref_table_border_color', '--table-border-color');
    setPreference('pref_table_header_bg_color', '--table-header-bg');
    setPreference('pref_table_header_text_color', '--table-header-color');
    setPreference('pref_table_header_font_weight', '--table-header-font-weight');
    setPreference('pref_table_cell_bg_color', '--table-cell-bg');
    setPreference('pref_table_cell_text_color', '--table-cell-color');
    setPreference('pref_table_cell_padding', '--table-cell-padding', 'px');

    // Code blocks.
    setPreference('pref_code_block_color', '--code-block-color');
    setPreference('pref_code_block_bg_color', '--code-block-bg-color');
    setPreference('pref_code_block_padding', '--code-block-padding', 'px');
    setPreference('pref_code_block_border_radius', '--code-block-border-radius', 'px');
    setPreference('pref_code_block_line_height', '--code-block-line-height');
    setPreference('pref_code_block_lang_label_color', '--code-block-lang-label-color');

    // Block quotes and callout variables. Callout styling remains unsupported
    // until a real callout node/widget is rendered by this editor.
    setPreference('pref_blockquote_line_thickness', '--blockquote-border-width', 'px');
    setPreference('pref_blockquote_line_style', '--blockquote-border-style');
    setPreference('pref_blockquote_line_color', '--blockquote-border-color');
    setPreference('pref_blockquote_bg_color', '--blockquote-bg-color');
    setPreference('pref_blockquote_text_color', '--blockquote-text-color');
    setPreference('pref_blockquote_left_indent', '--blockquote-left-indent', 'px');
    setPreference('pref_blockquote_padding', '--blockquote-padding', 'px');
    setPreference('pref_callout_line_thickness', '--callout-border-width', 'px');
    setPreference('pref_callout_line_style', '--callout-border-style');
    setPreference('pref_callout_line_color', '--callout-border-color');
    setPreference('pref_callout_bg_color', '--callout-bg-color');
    setPreference('pref_callout_padding', '--callout-padding', 'px');

    // Horizontal dividers.
    setPreference('pref_hr_thickness', '--hr-thickness', 'px');
    setPreference('pref_hr_style', '--hr-style');
    setPreference('pref_hr_color', '--hr-color');
    setCssVar(
      '--hr-width',
      prefs.pref_hr_width_percent == null
        ? null
        : `${Number(prefs.pref_hr_width_percent)}%`
    );
    setPreference('pref_hr_margin_top', '--hr-margin-top', 'px');
    setPreference('pref_hr_margin_bottom', '--hr-margin-bottom', 'px');
```

The current font-file preferences are handled separately by native
`setFontSettings`. Keep that path, but make sure its CodeMirror selectors use
the custom font variables:

```css
.cm-paragraph { font-family: var(--body-font-family, inherit); }
.cm-heading { font-family: var(--heading-font-family, var(--body-font-family, inherit)); }
.cm-bold { font-family: var(--bold-font-family, inherit); }
.cm-italic { font-family: var(--italic-font-family, inherit); }
.cm-inline-code,
.cm-codeblock-line { font-family: var(--code-font-family, monospace); }
```

The current `EditorView.theme` sets body size and body font on the entire
editor root. Change that base to a neutral 16px so the paragraph rule above can
scope the Android “Body Text Size” preference to paragraph text. Keep the
content's color and caret rules:

```js
// In EditorView.theme:
'&': {
  fontSize: '16px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  // keep the existing height/background/color rules
},
'.cm-content': {
  fontSize: 'inherit',
  fontFamily: 'inherit',
  lineHeight: 'normal',
  // keep the existing padding/caret/color rules
},
```

In `customHighlightStyle`, do not force every heading syntax token to use
`--heading-1-color`; let the line-level H1–H6 class supply its own color:

```js
{ tag: tags.heading, color: 'inherit', fontWeight: 'var(--heading-font-weight, 700)' },
```

## 2. Add syntax-aware paragraph and code-block line classes

In `livePreviewPlugin.buildDecorations`, collect line classes and emit one line
decoration per line. This avoids competing `Decoration.line` objects at the
same position.

At the start of `buildDecorations`, next to `builder`, add:

```js
    const lineClasses = new Map();
    const addLineClass = (lineFrom, className) => {
      if (!lineClasses.has(lineFrom)) lineClasses.set(lineFrom, new Set());
      lineClasses.get(lineFrom).add(className);
    };
    const addVisibleNodeLines = (node, className, doc, visibleRanges) => {
      const first = doc.lineAt(node.from);
      const last = doc.lineAt(Math.max(node.from, node.to - 1));
      for (let n = first.number; n <= last.number; n++) {
        const line = doc.line(n);
        if (visibleRanges.some(r => line.from >= r.from && line.from <= r.to)) {
          addLineClass(line.from, className);
        }
      }
    };
```

Inside the existing syntax-tree `enter` callback, after `line` is obtained,
add the paragraph and code-block checks. Confirm the parser node names in this
build before relying on them.

```js
          // Only ordinary Markdown paragraphs receive paragraph typography.
          if (node.name === 'Paragraph') {
            addVisibleNodeLines(node, 'cm-paragraph', view.state.doc, view.visibleRanges);
            const first = view.state.doc.lineAt(node.from);
            addLineClass(first.from, 'cm-paragraph-first');
          }

          // A code block is a CodeMirror line sequence, not a CKEditor element.
          if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
            addVisibleNodeLines(node, 'cm-codeblock-line', view.state.doc, view.visibleRanges);
          }

          if (node.name === 'ListItem') {
            addVisibleNodeLines(node, 'cm-list-item', view.state.doc, view.visibleRanges);
          }
```

Replace existing direct heading, blockquote, and horizontal-rule
`Decoration.line(...)` calls with `addLineClass(line.from, ...)`. For example:

```js
          if (node.name.startsWith('ATXHeading')) {
            const level = node.name.replace('ATXHeading', '');
            addLineClass(line.from, `cm-heading cm-heading-${level}`);
          }
          if (node.name === 'Blockquote') {
            addVisibleNodeLines(node, 'cm-blockquote', view.state.doc, view.visibleRanges);
          }
          if (node.name === 'HorizontalRule') addLineClass(line.from, 'cm-hr');
```

After the syntax-tree iteration and before sorting `builder`, emit the collected
decorations:

```js
    for (const [from, classes] of lineClasses) {
      builder.push(Decoration.line({
        attributes: { class: [...classes].join(' ') }
      }).range(from));
    }
```

If the exact node names differ, inspect `syntaxTree(view.state)` for a sample
paragraph, heading, list, quote, table, and fenced code block. Do not style all
`.cm-line` elements as a fallback.

## 3. Add CodeMirror-only CSS

Add these rules alongside the CodeMirror rules in `web/index.html`. Remove or
replace any `.ck-content`-only rule when it is being used for this editor.

```css
/* The editor root must not apply paragraph-specific settings to every block. */
.cm-content {
  font-size: inherit !important;
  font-family: inherit !important;
  line-height: normal !important;
  letter-spacing: normal !important;
}

.cm-content .cm-paragraph {
  font-size: var(--body-font-size, 16px) !important;
  font-family: var(--body-font-family, inherit) !important;
  line-height: var(--paragraph-line-height, 1.6) !important;
  letter-spacing: var(--paragraph-letter-spacing, 0px) !important;
  text-align: var(--paragraph-align, left) !important;
  margin-top: var(--paragraph-margin-top, 0px) !important;
  margin-bottom: var(--paragraph-margin-bottom, 8px) !important;
}

/* Indent only the first visual editor line of the paragraph. */
.cm-content .cm-paragraph-first {
  text-indent: var(--paragraph-first-line-indent, 0px) !important;
}

.cm-content .cm-heading {
  text-align: var(--heading-align, inherit) !important;
  line-height: var(--heading-line-height, 1.2) !important;
  letter-spacing: var(--heading-letter-spacing, 0px) !important;
  text-transform: var(--heading-text-transform, none) !important;
  text-decoration-line: var(--heading-underline-style, none) !important;
  text-decoration-thickness: var(--heading-underline-thickness, 2px) !important;
  text-decoration-color: var(--heading-underline-color, currentColor) !important;
  margin-top: var(--heading-margin-top, 16px) !important;
  margin-bottom: var(--heading-margin-bottom, 8px) !important;
  font-weight: var(--heading-font-weight, 700) !important;
}

/* Keep H1–H6 different. The body-size preference is deliberately scoped to
   paragraphs, so use a stable heading base rather than inheriting that size. */
.cm-heading-1 { font-size: calc(16px * 2.0 * var(--heading-scale, 1)) !important; color: var(--heading-1-color, inherit) !important; }
.cm-heading-2 { font-size: calc(16px * 1.6 * var(--heading-scale, 1)) !important; color: var(--heading-2-color, inherit) !important; }
.cm-heading-3 { font-size: calc(16px * 1.3 * var(--heading-scale, 1)) !important; color: var(--heading-3-color, inherit) !important; }
.cm-heading-4 { font-size: calc(16px * 1.1 * var(--heading-scale, 1)) !important; color: var(--heading-4-color, inherit) !important; }
.cm-heading-5 { font-size: calc(16px * 1.0 * var(--heading-scale, 1)) !important; color: var(--heading-5-color, inherit) !important; }
.cm-heading-6 { font-size: calc(16px * 0.9 * var(--heading-scale, 1)) !important; color: var(--heading-6-color, inherit) !important; }

.cm-content .cm-list-item {
  margin-left: var(--list-left-indent, 24px) !important;
  margin-bottom: var(--list-item-spacing, 4px) !important;
  line-height: var(--list-line-height, 1.5) !important;
}

.cm-content .cm-blockquote {
  border-left: var(--blockquote-border-width, 4px)
    var(--blockquote-border-style, solid)
    var(--blockquote-border-color, #444) !important;
  background: var(--blockquote-bg-color, transparent) !important;
  color: var(--blockquote-text-color, inherit) !important;
  margin-left: var(--blockquote-left-indent, 0px) !important;
  padding-left: var(--blockquote-padding, 12px) !important;
}

.cm-content .cm-link {
  color: var(--link-color, #29b6f6) !important;
  text-decoration: var(--link-decoration, underline) !important;
}

.cm-content .cm-bold {
  color: var(--bold-color, inherit) !important;
  font-weight: var(--bold-font-weight, 700) !important;
  font-family: var(--bold-font-family, inherit) !important;
}
.cm-content .cm-italic {
  color: var(--italic-color, inherit) !important;
  font-weight: var(--italic-font-weight, 400) !important;
  font-family: var(--italic-font-family, inherit) !important;
}
.cm-content .cm-inline-code {
  color: var(--code-color, #ff80ab) !important;
  background: var(--code-bg-color, #212121) !important;
  padding: var(--code-padding, 2px 4px) !important;
  border-radius: var(--code-border-radius, 4px) !important;
  font-family: var(--code-font-family, monospace) !important;
}

.cm-content .cm-codeblock-line {
  color: var(--code-block-color, #e0e0e0) !important;
  background: var(--code-block-bg-color, #121212) !important;
  line-height: var(--code-block-line-height, 1.4) !important;
  padding-left: var(--code-block-padding, 16px) !important;
  padding-right: var(--code-block-padding, 16px) !important;
}
```

## 4. Style list markers and checkboxes

The current editor uses `TaskMarker` and replaces it with
`.cm-todo-checkbox`. Keep the widget logic, and replace the hard-coded
checkbox colors in its CSS with preference variables:

```js
/* In the existing .cm-todo-checkbox rule: */
border: 1.5px solid var(--todo-unchecked-color, #666) !important;
background-color: var(--todo-checkbox-bg, #222) !important;

/* In .cm-todo-checkbox:checked: */
background-color: var(--todo-checked-color, #29b6f6) !important;
border-color: var(--todo-checked-color, #29b6f6) !important;
```

For bullet and numbered marker color, confirm the Lezer node name for list
markers first. Add a mark decoration with either `cm-list-bullet` or
`cm-list-number`, then use:

```css
.cm-list-bullet { color: var(--list-bullet-color, currentColor) !important; }
.cm-list-number { color: var(--list-number-color, currentColor) !important; }
```

Do not claim list indentation is fixed unless wrapped lines in a multi-line
list item align under the text, not under the bullet.

## 5. Make the existing table and code-header widgets consume the settings

`GFMTableWidget` builds real HTML table cells and currently hard-codes some
styles. Replace the existing table, header-cell, and body-cell `style.cssText`
assignments with CSS-variable-backed values:

```js
const border =
  'var(--table-border-width, 1px) var(--table-border-style, solid) var(--table-border-color, #444)';

// Use this for table.style.cssText:
table.style.cssText =
  'width:100%;border-collapse:collapse;color:var(--text-color,#fff);' +
  'font-size:16px;table-layout:auto;';

// Use this for each th.style.cssText:
th.style.cssText =
  `border:${border};padding:var(--table-cell-padding,8px);` +
  'background:var(--table-header-bg,rgba(255,255,255,.12));' +
  'color:var(--table-header-color,var(--text-color,#fff));' +
  'font-weight:var(--table-header-font-weight,700);' +
  'text-align:left;outline:none;min-width:60px;';

// Use this for each td.style.cssText:
td.style.cssText =
  `border:${border};padding:var(--table-cell-padding,8px);` +
  'background:var(--table-cell-bg,transparent);' +
  'color:var(--table-cell-color,var(--text-color,#fff));' +
  'text-align:left;outline:none;min-width:60px;';
```

In `CodeBlockHeaderWidget.toDOM`, replace hard-coded header and copy-button
colors with variables:

```js
header.style.cssText =
  'display:flex;justify-content:space-between;align-items:center;' +
  'background:var(--code-block-label-bg, rgba(255,255,255,.12));' +
  'padding:4px 10px;border-radius:var(--code-block-border-radius, 6px) ' +
  'var(--code-block-border-radius, 6px) 0 0;font-size:12px;font-weight:bold;' +
  'font-family:monospace;color:var(--code-block-lang-label-color, #fff);' +
  'user-select:none;border-bottom:1px solid var(--code-block-label-border, rgba(255,255,255,.2));';

copyBtn.style.cssText =
  'background:var(--code-copy-bg, transparent);' +
  'border:1px solid var(--code-copy-border, rgba(255,255,255,.35));' +
  'color:var(--code-copy-color, inherit);border-radius:3px;' +
  'padding:2px 8px;font-size:11px;cursor:pointer;font-weight:bold;';
```

The current preferences screen has a language-label text color, but does not
yet expose label background, copy-button colors, or their border colors. Keep
the extra variables at defaults unless Jules adds matching preferences and
reset defaults; do not invent visible settings that have no Android controls.

## 6. Horizontal rules, footnotes, and remaining scope

Use the existing `.cm-hr` line decoration and add:

```css
.cm-content .cm-hr {
  border-bottom: var(--hr-thickness, 2px) var(--hr-style, solid)
    var(--hr-color, #444) !important;
  width: var(--hr-width, 100%) !important;
  margin: var(--hr-margin-top, 16px) auto var(--hr-margin-bottom, 16px) !important;
}
```

Footnote CSS must target CodeMirror-rendered footnote nodes/classes, not
`.ck-content`. First verify whether the current CodeMirror parser/plugin creates
those nodes. If it does not, mark the footnote appearance settings as
unsupported in this pass; implementing functional footnotes is a separate
editor feature.

The current preferences screen has only shared heading alignment, weight,
line-height, spacing, transform, and underline settings, plus separate H1–H6
colors. Fully independent per-level controls for every heading property would
require adding Android preferences and defaults as a separate UI/data change;
do not silently pretend those controls already exist.

## 7. Verification before calling anything fixed

1. Add tests that confirm every XML preference key above is mapped or explicitly
   marked unsupported, and that its CodeMirror selector/widget consumes the
   corresponding variable.
2. Run all web tests and the Android debug build.
3. On device, verify the checklist in `Typography.md` in WYSIWYG and Live
   Preview. Test reset for each changed control.
4. Report visual phone-test results separately from build/test results.
