# Remaining CodeMirror typography fixes — Jules handoff

The status checklist is intentionally on `main` so it survives Jules deleting
or replacing a working branch. I inspected the current Jules branch separately;
apply these changes there, not by moving or overwriting the checklist.

This is a commented patch guide based on the current Jules-branch source. It is
not built or device-tested. Keep changes limited to display/styling and the
specific preference wiring below. Do not change save/load, Android routing,
undo, selection, or toolbar behavior.

## Confirmed causes in the current CodeMirror branch

- Heading underline preferences contain values like `solid`, `dashed`, and
  `wavy`. Those are `text-decoration-style` values, not
  `text-decoration-line` values. The source also writes per-heading variables
  while its CSS reads shared variable names.
- The heading font file is loaded into `--heading-font-family`, but the
  `.cm-heading` rule does not consume that variable. Heading token styles also
  set font sizes independently, which can override the line-level H1–H6 size.
- Link decoration receives a style such as `solid`, but `text-decoration`
  expects a full decoration value. The renderer also leaves Markdown link
  delimiters and URL visible instead of presenting just the label in WYSIWYG.
- Checkbox preferences are mapped to CSS variables, but the CodeMirror
  checkbox has no matching `.cm-todo-checkbox` CSS rules.
- Code-block text colors can be overridden by syntax-token colors inside
  `.cm-codeblock-line`; border radius has no CodeMirror line/header rule.
- The CodeMirror parser configuration has GFM, tables, strikethrough, and task
  lists, but no footnote extension or footnote renderer. Existing
  `.ck-content` footnote rules cannot style CodeMirror content.
- `pref_line_wrap` currently changes a body class; the working toolbar toggle
  changes CodeMirror's line-wrap compartment. The preference path should call
  that same `setLineWrap` method.

## 1. Fix heading font and underline rendering

In `applyAllPreferences`, inside the H1–H6 loop, replace the underline
assignments with:

```js
      // The preference values are none/solid/double/dashed/dotted/wavy.
      // CSS needs the line (underline or none) and its visual style separately.
      const underlineEnabled = pUnderlineStyle && pUnderlineStyle !== 'none';
      setCssVar(
        '--heading-' + i + '-underline-line',
        underlineEnabled ? 'underline' : 'none'
      );
      setCssVar(
        '--heading-' + i + '-underline-style',
        underlineEnabled ? pUnderlineStyle : 'solid'
      );
      setCssVar('--heading-' + i + '-underline-thickness', pUnderlineThickness, 'px');
      setCssVar('--heading-' + i + '-underline-color', pUnderlineColor);
```

In `web/index.html`, add the heading font family and per-level decoration
variables to the CodeMirror rules:

```css
.cm-content .cm-heading {
  font-family: var(--heading-font-family, var(--body-font-family, inherit)) !important;
  text-decoration-line: var(--cm-heading-decoration-line, none) !important;
  text-decoration-style: var(--cm-heading-decoration-style, solid) !important;
  text-decoration-thickness: var(--cm-heading-decoration-thickness, 2px) !important;
  text-decoration-color: var(--cm-heading-decoration-color, currentColor) !important;
}

.cm-heading-1 {
  --cm-heading-decoration-line: var(--heading-1-underline-line, none);
  --cm-heading-decoration-style: var(--heading-1-underline-style, solid);
  --cm-heading-decoration-thickness: var(--heading-1-underline-thickness, 2px);
  --cm-heading-decoration-color: var(--heading-1-underline-color, currentColor);
}
.cm-heading-2 {
  --cm-heading-decoration-line: var(--heading-2-underline-line, none);
  --cm-heading-decoration-style: var(--heading-2-underline-style, solid);
  --cm-heading-decoration-thickness: var(--heading-2-underline-thickness, 2px);
  --cm-heading-decoration-color: var(--heading-2-underline-color, currentColor);
}
.cm-heading-3 {
  --cm-heading-decoration-line: var(--heading-3-underline-line, none);
  --cm-heading-decoration-style: var(--heading-3-underline-style, solid);
  --cm-heading-decoration-thickness: var(--heading-3-underline-thickness, 2px);
  --cm-heading-decoration-color: var(--heading-3-underline-color, currentColor);
}
.cm-heading-4 {
  --cm-heading-decoration-line: var(--heading-4-underline-line, none);
  --cm-heading-decoration-style: var(--heading-4-underline-style, solid);
  --cm-heading-decoration-thickness: var(--heading-4-underline-thickness, 2px);
  --cm-heading-decoration-color: var(--heading-4-underline-color, currentColor);
}
.cm-heading-5 {
  --cm-heading-decoration-line: var(--heading-5-underline-line, none);
  --cm-heading-decoration-style: var(--heading-5-underline-style, solid);
  --cm-heading-decoration-thickness: var(--heading-5-underline-thickness, 2px);
  --cm-heading-decoration-color: var(--heading-5-underline-color, currentColor);
}
.cm-heading-6 {
  --cm-heading-decoration-line: var(--heading-6-underline-line, none);
  --cm-heading-decoration-style: var(--heading-6-underline-style, solid);
  --cm-heading-decoration-thickness: var(--heading-6-underline-thickness, 2px);
  --cm-heading-decoration-color: var(--heading-6-underline-color, currentColor);
}
```

In `customHighlightStyle`, remove `fontSize` from the six `tags.headingN`
entries. The `.cm-heading-N` line classes already control heading size; leaving
font size on the nested syntax spans can let body-size styling override them.
Retain each tag's color and weight settings.

The current Android preferences expose shared heading settings and individual
heading colors. Fully independent font, underline, spacing, etc. for H1–H6
needs separate Android preference controls and reset defaults; these snippets
only make existing settings render correctly.

## 2. Fix link-decoration values and WYSIWYG display

In `applyAllPreferences`, replace the current `--link-decoration` assignment:

```js
    const linkStyle = prefs.pref_link_decoration || 'solid';
    setCssVar('--link-decoration-line', linkStyle === 'none' ? 'none' : 'underline');
    setCssVar('--link-decoration-style', linkStyle === 'none' ? 'solid' : linkStyle);
```

Replace the `.cm-link` CSS rule:

```css
.cm-link {
  color: var(--link-color, #29b6f6) !important;
  text-decoration-line: var(--link-decoration-line, underline) !important;
  text-decoration-style: var(--link-decoration-style, solid) !important;
}
```

Replace the current `node.name === 'URL' || node.name === 'Link'` decoration
branch with this basic inline-link rendering. It formats ordinary
`[label](url)` links by styling the label and hiding the Markdown syntax when
the syntax is not active. Leave unsupported link forms untouched rather than
corrupting their text.

```js
          if (node.name === 'Link') {
            const raw = view.state.doc.sliceString(node.from, node.to);
            const match = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (match) {
              const labelFrom = node.from + 1;
              const labelTo = labelFrom + match[1].length;
              builder.push(
                Decoration.mark({ class: 'cm-link' }).range(labelFrom, labelTo)
              );

              if (!isNodeActive) {
                builder.push(Decoration.replace({}).range(node.from, labelFrom));
                builder.push(Decoration.replace({}).range(labelTo, node.to));
              }
            }
          }
```

This is visual WYSIWYG formatting only; it does not add link-click navigation.
Test links with titles and nested brackets separately before claiming those
forms are supported.

## 3. Add CodeMirror checkbox styles

The preference bridge already sets `--todo-border-color`,
`--todo-accent-color`, and `--todo-bg-color`. Add rules for the actual
`.cm-todo-checkbox` widget:

```css
.cm-todo-checkbox {
  appearance: none !important;
  -webkit-appearance: none !important;
  width: 16px !important;
  height: 16px !important;
  box-sizing: border-box !important;
  border: 1.5px solid var(--todo-border-color, #888) !important;
  border-radius: 3px !important;
  background: var(--todo-bg-color, #222) !important;
  vertical-align: text-bottom !important;
  margin: 0 6px 0 0 !important;
  position: relative !important;
}
.cm-todo-checkbox:checked {
  border-color: var(--todo-accent-color, #00e5ff) !important;
  background: var(--todo-accent-color, #00e5ff) !important;
}
.cm-todo-checkbox:checked::after {
  content: '' !important;
  position: absolute !important;
  left: 4px !important;
  top: 1px !important;
  width: 4px !important;
  height: 8px !important;
  border: solid #111 !important;
  border-width: 0 2px 2px 0 !important;
  transform: rotate(45deg) !important;
}
```

Check contrast in both dark and light themes; if one fixed checkmark color is
not legible in both, add a theme-specific rule.

## 4. Render list bullets as bullets, not Markdown punctuation

The current `ListMark` decoration only colors the literal marker, so `-` and
`*` remain visible. Add a widget:

```js
class ListMarkerWidget extends WidgetType {
  constructor(source, isBullet) {
    super();
    this.source = source;
    this.isBullet = isBullet;
  }
  eq(other) {
    return other instanceof ListMarkerWidget &&
      other.source === this.source &&
      other.isBullet === this.isBullet;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = this.isBullet ? 'cm-list-bullet' : 'cm-list-number';
    span.textContent = this.isBullet ? '•' : this.source;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
}
```

In the `ListMark` branch, keep the existing marker class while the syntax is
active, and replace only supported markers while it is visually hidden:

```js
          if (node.name === 'ListMark') {
            const marker = view.state.doc.sliceString(node.from, node.to);
            const isBullet = /^[-*+]$/.test(marker);
            if (!isNodeActive) {
              builder.push(Decoration.replace({
                widget: new ListMarkerWidget(marker, isBullet)
              }).range(node.from, node.to));
            } else {
              builder.push(Decoration.mark({
                class: isBullet ? 'cm-list-bullet' : 'cm-list-number'
              }).range(node.from, node.to));
            }
          }
```

This does not fix multi-line list commands. The current list command inserts a
prefix on the current line; applying a list to a multi-line selection and
continuation-line indentation is a separate editing behavior task.

## 5. Fix code-block text color and radius

In the existing fenced-code loop, add first/last line classes while adding
`cm-codeblock-line`:

```js
            for (let l = startLine.number; l <= endLine.number; l++) {
              const codeLine = view.state.doc.line(l);
              addLineClass(codeLine.from, 'cm-codeblock-line');
              if (l === startLine.number) addLineClass(codeLine.from, 'cm-codeblock-first');
              if (l === endLine.number) addLineClass(codeLine.from, 'cm-codeblock-last');
            }
```

Add these styles. The descendant `span` rule is important: syntax highlighting
puts token colors on nested spans, so setting color only on the parent line
does not override them.

```css
.cm-content .cm-codeblock-line {
  box-sizing: border-box !important;
  color: var(--code-block-color, #e0e0e0) !important;
  background: var(--code-block-bg-color, #121212) !important;
  line-height: var(--code-block-line-height, 1.4) !important;
  padding-left: var(--code-block-padding, 16px) !important;
  padding-right: var(--code-block-padding, 16px) !important;
}
.cm-content .cm-codeblock-line span {
  color: var(--code-block-color, #e0e0e0) !important;
}
.cm-content .cm-codeblock-first {
  border-top-left-radius: var(--code-block-border-radius, 6px) !important;
  border-top-right-radius: var(--code-block-border-radius, 6px) !important;
}
.cm-content .cm-codeblock-last {
  border-bottom-left-radius: var(--code-block-border-radius, 6px) !important;
  border-bottom-right-radius: var(--code-block-border-radius, 6px) !important;
}
.cm-codeblock-header {
  background: var(--code-block-label-bg, rgba(255,255,255,.12)) !important;
  color: var(--code-block-lang-label-color, #fff) !important;
  border-radius: var(--code-block-border-radius, 6px)
    var(--code-block-border-radius, 6px) 0 0 !important;
}
.cm-codeblock-copy-btn {
  background: var(--code-copy-bg, transparent) !important;
  color: var(--code-copy-color, inherit) !important;
  border: 1px solid var(--code-copy-border, rgba(255,255,255,.35)) !important;
}
```

The current settings screen exposes the language-label text color, but not
label background, copy-button background/text, or copy border colors. The CSS
fallbacks above make the widget styleable; adding user controls requires new
Android preference keys, reset defaults, and bridge mappings.

## 6. Line-wrap preference

Inside `applyAllPreferences`, after reading `pref_line_wrap`, also update the
CodeMirror compartment. Keep the toolbar toggle as-is:

```js
    if (typeof window.editorBridge.setLineWrap === 'function') {
      window.editorBridge.setLineWrap(prefs.pref_line_wrap !== false);
    }
```

## 7. Footnotes: do not claim a CSS-only fix

The current editor has no footnote parser/renderer in its CodeMirror
extensions. Its toolbar inserts literal `[^1]` text, and its existing
footnote CSS targets `.ck-content`. The font/color/background preferences
cannot visibly work until actual footnote references and definitions are
rendered with CodeMirror decorations/widgets. Treat this as a separate
footnote feature task; do not add more `.ck-content` selectors or report the
settings fixed.

## Verify

- Build and run web tests.
- In WYSIWYG and Live Preview, test underline values `none`, `solid`,
  `double`, `dashed`, `dotted`, and `wavy`.
- Test simple links, a link with a title, and a reference-style link; report
  which formats are supported.
- Test unchecked/checked boxes on dark and light themes.
- Confirm list bullets visually become `•`; separately report the multi-line
  list-command behavior.
- Test code-block text color with several syntax token types, background,
  radius, and the label when the cursor is both inside and outside the block.
- Report footnotes as unsupported until a real CodeMirror footnote renderer
  exists.
