# Jules patch: align table rows and make borders continuous

**Target:** latest W.mdx working branch after commit `3c76d24f97313ad5eb69d73ef4febc10c613d4e8`.

## What the screenshots show

The table uses CodeMirror line decorations and individual inline cell spans. When cell text wraps, each span gets its own height, so its vertical border can end early and its bottom border can sit above or below the neighboring cell’s border. This is visible in the long Obsidian-syntax table and in the `centered` header wrapping onto a second line.

Use a CSS grid for each rendered Markdown table row. All rows in the same table receive the same column tracks, and grid items stretch to the height of the tallest cell in that row. Keep the original Markdown in the document; do not replace the table with a non-editable widget or alter the Tab navigation implementation.

## 1. `web/src/main.js` — allow a style attribute on line decorations

Inside `livePreviewPlugin.buildDecorations(view)`, next to the existing `lineClasses` map, add:

```js
    const lineStyles = new Map();
```

After the existing `addLineClass` helper, add:

```js
    const addLineStyle = (lineFrom, cssText) => {
      const existing = lineStyles.get(lineFrom);
      lineStyles.set(lineFrom, existing ? `${existing};${cssText}` : cssText);
    };
```

In the existing `if (node.name === 'Table')` block, after `isSep` is calculated and before the cell loop, add a shared grid template for each non-separator row:

```js
              if (!isSep) {
                const gridColumns = parsed.cells
                  .map((_, column) => {
                    const widthCh = Math.max(8, columnWidths[column] || 8);
                    return `minmax(8ch, ${widthCh}ch)`;
                  })
                  .join(' ');

                // Identical column tracks across every row keep borders aligned
                // when one or more cells wrap onto multiple visual lines.
                addLineStyle(
                  lineObj.from,
                  `display:grid;grid-template-columns:${gridColumns};` +
                  'align-items:stretch;width:max-content;min-width:100%;'
                );
              }
```

Keep the existing `addLineClass(lineObj.from, cls)` call and all separator-row handling.

### Put each non-empty cell into its column

In the existing `Decoration.mark()` for table cells, replace:

```js
                      attributes: { style: `width:${widthCh}ch;` }
```

with:

```js
                      attributes: { style: `grid-column:${column + 1};` }
```

The grid row now supplies the shared width; the cell mark only needs its column number.
Remove the now-unused `const widthCh = columnWidths[column] || 8;` from this per-cell loop.

### Put empty-cell widgets into their column

Update `EmptyTableCellWidget` so it accepts and stores the 1-based grid column:

```js
class EmptyTableCellWidget extends WidgetType {
  constructor(isHeader, isFirst, isLast, columnNumber) {
    super();
    this.isHeader = isHeader;
    this.isFirst = isFirst;
    this.isLast = isLast;
    this.columnNumber = columnNumber;
  }

  eq(other) {
    return (
      other instanceof EmptyTableCellWidget &&
      other.isHeader === this.isHeader &&
      other.isFirst === this.isFirst &&
      other.isLast === this.isLast &&
      other.columnNumber === this.columnNumber
    );
  }

  toDOM() {
    const cell = document.createElement('span');
    cell.className = [
      'cm-table-cell',
      'cm-table-empty-cell',
      ...(this.isHeader ? ['cm-table-header-cell'] : []),
      ...(this.isFirst ? ['cm-table-first-cell'] : []),
      ...(this.isLast ? ['cm-table-last-cell'] : [])
    ].join(' ');
    cell.style.gridColumn = String(this.columnNumber);
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  }

  ignoreEvent() {
    return true;
  }
}
```

Update its call in the table cell loop:

```js
                      widget: new EmptyTableCellWidget(
                        isHeader,
                        column === 0,
                        column === parsed.cells.length - 1,
                        column + 1
                      ),
```

### Apply the stored line style

At the end of `buildDecorations()`, replace the existing `lineClasses` loop with:

```js
    for (const [lineFrom, classes] of lineClasses) {
      const attributes = { class: [...classes].join(' ') };
      const style = lineStyles.get(lineFrom);
      if (style) attributes.style = style;

      builder.push(
        Decoration.line({ attributes }).range(lineFrom)
      );
    }
```

Keep the existing sort and `Decoration.set()` calls after this loop.

## 2. `web/index.html` — make cells fill and stretch inside their grid tracks

In `.cm-table-row`, add:

```css
      display: grid !important;
      align-items: stretch !important;
      box-sizing: border-box !important;
```

In `.cm-content .cm-table-cell`, replace the existing `display`, `vertical-align`, and `min-width` declarations with:

```css
      display: block !important;
      box-sizing: border-box !important;
      width: 100% !important;
      min-width: 0 !important;
      align-self: stretch !important;
```

Leave the existing padding, border-side, color, background, wrapping, and overflow declarations intact. Keep the existing header, first-cell, last-cell, and empty-cell border rules intact.

## 3. `web/src/main.js` — give columns a small padding allowance

In `getTableColumnWidths()`, change:

```js
      const width = Math.max(8, Math.min(40, Array.from(text).length + 2));
```

to:

```js
      const width = Math.max(8, Math.min(40, Array.from(text).length + 3));
```

The extra `ch` is a small safety allowance for cell padding and prevents short headings such as `centered` from wrapping at the edge of their track on a phone.

## 4. Regression test

In `web/test/table-and-widgets.test.cjs`, read `web/index.html` near the existing source read:

```js
  const styles = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
```

Add a test verifying the grid layout and cell placement are present:

```js
test('table rows use shared grid columns so wrapped cells keep aligned borders', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(code.includes('const lineStyles = new Map()'));
  assert.ok(code.includes('grid-template-columns:${gridColumns}'));
  assert.ok(code.includes('grid-column:${column + 1}'));
  assert.ok(code.includes('cell.style.gridColumn = String(this.columnNumber)'));
  assert.ok(code.includes('align-items:stretch;width:max-content;min-width:100%'));
  assert.match(styles, /\.cm-table-row\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.cm-content \.cm-table-cell\s*\{[^}]*align-self:\s*stretch/s);
});
```

Keep all existing table parsing and keyboard-navigation tests.

## Verification

Run from `web/`:

```sh
npm test
npm run build
```

Build and install the normal Android debug build. Test both attached examples:

- A table with long Obsidian-style links/descriptions that wrap across multiple lines.
- A three-column table whose header includes `centered`.

**Pass criteria:** vertical borders remain continuous for the full height of each row; horizontal borders line up across all columns, including rows where some cells wrap; headings do not wrap solely because their column is too narrow; empty cells still show their borders; Markdown remains editable; Tab/Shift-Tab cell navigation still works. Check horizontal scrolling on a table wider than the phone screen. Do not mark the table issue fixed from CSS inspection alone.
