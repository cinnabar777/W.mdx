# Jules patch: make paragraph typography target paragraphs, not lists

**Target:** apply this patch to the current W.mdx working branch, based on the latest tested toolbar-toggle-color and horizontal-rule changes. Do not revert or rewrite those changes.

## Why this is the next fix

In the current `web/src/main.js`, `buildDecorations()` declares `paragraphLineStarts` but never uses it. No JavaScript code adds the `cm-paragraph` or `cm-list-item` classes. Yet `web/index.html` has paragraph CSS selectors that require `cm-paragraph` and list selectors that require `cm-list-item`. The result is that the paragraph/list styling rules have no matching editor lines.

This patch adds those line classes from the Markdown syntax tree, so paragraph controls affect ordinary paragraphs while list controls style list items. It also corrects the paragraph letter-spacing label, which currently says “Global” even though the preference is intended for paragraph text.

## 1. `web/src/main.js` — classify visible paragraph and list lines

Inside `livePreviewPlugin.buildDecorations(view)`, remove the unused declaration:

```js
const paragraphLineStarts = new Set();
```

Keep the existing `lineClasses` map and `addLineClass` helper. Immediately after `addLineClass`, add this block. It uses CodeMirror/Lezer's `resolveInner()` syntax-node ancestry to identify which visible lines belong to a Markdown paragraph or list item. Code and table lines inside a list are deliberately excluded from list typography.

```js
    const doc = view.state.doc;

    // Add CSS classes to the actual CodeMirror lines. The CSS already defines
    // paragraph and list rules, but those rules cannot work until these classes
    // are attached to the rendered lines.
    for (const { from, to } of view.visibleRanges) {
      const firstVisibleLine = doc.lineAt(from).number;
      const lastVisibleLine = doc.lineAt(Math.max(from, to - 1)).number;

      for (let lineNumber = firstVisibleLine; lineNumber <= lastVisibleLine; lineNumber++) {
        const line = doc.line(lineNumber);
        const firstText = /\S/.exec(line.text);
        const probe = firstText ? line.from + firstText.index : line.from;
        const resolvedNode = tree.resolveInner(probe, 1);

        let paragraphNode = null;
        let insideListItem = false;
        let insideCodeBlock = false;
        let insideTable = false;

        // Walk from the syntax node at this line to its Markdown block parents.
        for (let ancestor = resolvedNode; ancestor; ancestor = ancestor.parent) {
          if (ancestor.name === 'Paragraph') paragraphNode = ancestor;
          if (ancestor.name === 'ListItem') insideListItem = true;
          if (ancestor.name === 'FencedCode' || ancestor.name === 'CodeBlock') {
            insideCodeBlock = true;
          }
          if (ancestor.name === 'Table') insideTable = true;
        }

        if (insideCodeBlock || insideTable) continue;

        if (insideListItem) {
          // Includes the list marker line and continuation lines.
          addLineClass(line.from, 'cm-list-item');
          continue;
        }

        if (paragraphNode) {
          addLineClass(line.from, 'cm-paragraph');

          const paragraphFirstLine = doc.lineAt(paragraphNode.from);
          const paragraphLastLine = doc.lineAt(
            Math.max(paragraphNode.from, paragraphNode.to - 1)
          );

          if (line.from === paragraphFirstLine.from) {
            addLineClass(line.from, 'cm-paragraph-first');
          }
          if (line.from === paragraphLastLine.from) {
            addLineClass(line.from, 'cm-paragraph-last');
          }
        }
      }
    }
```

Place it **before** the existing `for (const { from, to } of view.visibleRanges) { tree.iterate(...) }` traversal. Leave the existing heading, table, code-block, HR, and toolbar logic unchanged. The existing `lineClasses` loop at the end of `buildDecorations()` will emit the added classes as `Decoration.line()` decorations.

## 2. `app/src/main/res/xml/preferences_styling_paragraph.xml` — correct the label

Find the `pref_letter_spacing` preference and change only its title and summary:

```xml
<com.wmdx.markdownapp.ResetEditTextPreference
    app:key="pref_letter_spacing"
    app:title="Paragraph Letter Spacing (px)"
    app:summary="Letter spacing for regular paragraph text only (e.g. 0.5px or 0px)"
    app:defaultValue="0px" />
```

Keep the key `pref_letter_spacing`; it is already read by `applyAllPreferences()` and mapped to `--paragraph-letter-spacing`.

## 3. `web/test/typography.test.cjs` — regression checks

Add these reads near the existing `mainJsPath`/`source` declarations:

```js
const indexHtmlPath = path.join(__dirname, '../index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const paragraphSettingsPath = path.join(
  __dirname,
  '../../app/src/main/res/xml/preferences_styling_paragraph.xml'
);
const paragraphSettings = fs.readFileSync(paragraphSettingsPath, 'utf8');
```

Add these tests:

```js
test('paragraph and list typography selectors have matching editor line classes', () => {
  assert.match(source, /tree\.resolveInner\(probe, 1\)/);
  assert.match(source, /ancestor\.name === 'Paragraph'/);
  assert.match(source, /ancestor\.name === 'ListItem'/);
  assert.match(source, /addLineClass\(line\.from, 'cm-paragraph'\)/);
  assert.match(source, /addLineClass\(line\.from, 'cm-list-item'\)/);
  assert.match(source, /addLineClass\(line\.from, 'cm-paragraph-first'\)/);
  assert.match(source, /addLineClass\(line\.from, 'cm-paragraph-last'\)/);
  assert.match(indexHtml, /\.cm-content \.cm-paragraph:not\(\.cm-list-item\)/);
  assert.match(indexHtml, /\.cm-content \.cm-list-item/);
});

test('letter-spacing control is labeled as paragraph-only, not global', () => {
  assert.match(paragraphSettings, /app:key="pref_letter_spacing"/);
  assert.match(paragraphSettings, /app:title="Paragraph Letter Spacing \(px\)"/);
  assert.match(paragraphSettings, /Letter spacing for regular paragraph text only/);
  assert.doesNotMatch(paragraphSettings, /Global Letter Spacing/);
});
```

## Verification

Run the existing web tests and bundle build:

```sh
cd web
npm test
npm run build
```

Then build the Android app with the repository’s normal workflow. In the built app, use a test document containing a normal paragraph, H1/H2 headings, bullet and numbered lists, a checked and unchecked task item, a nested list, a table, and a fenced code block. Change body size, paragraph line height, paragraph letter spacing, paragraph margins, list indent, list spacing, and list line height.

**Pass criteria:** paragraph settings change ordinary paragraph lines only; list items use list spacing/indent/line-height and do not inherit paragraph font size, margins, or letter spacing; headings, tables, and code blocks retain their current appearance; editing, keyboard movement, and scrolling still work.

Do not mark the Typography checklist resolved based on source inspection alone—confirm the behavior in a phone build.
