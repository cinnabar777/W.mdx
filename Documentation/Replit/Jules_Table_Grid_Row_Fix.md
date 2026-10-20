# Jules correction: keep each table line on one grid row

**Target commit:** `7332c17c35605d6d7ea4ecf9b2fe4a38fecaccdf`  
**Scope:** Fix the cells stacking diagonally after the CSS-grid table patch. Do not change table parsing, column widths, Markdown editing, or Tab navigation.

## Cause

The current patch assigns `grid-column` to each cell but leaves its grid row to automatic placement. In the tested build, the cells are being assigned successive implicit grid rows, which produces the diagonal layout in the screenshot.

Pin every cell to row 1 of its own CodeMirror table-line grid.

## 1. `web/src/main.js` — pin non-empty cell marks

In the table-cell `Decoration.mark()` attributes, replace:

```js
attributes: { style: `grid-column:${column + 1};` }
```

with:

```js
attributes: { style: `grid-column:${column + 1};grid-row:1;` }
```

## 2. `web/src/main.js` — pin empty-cell widgets

In `EmptyTableCellWidget.toDOM()`, immediately after the existing `gridColumn` assignment:

```js
cell.style.gridColumn = String(this.columnNumber);
```

add:

```js
cell.style.gridRow = '1';
```

## 3. Regression test

In the existing test named `table rows use shared grid columns so wrapped cells keep aligned borders`, add:

```js
  assert.ok(code.includes('grid-row:1;'));
  assert.ok(code.includes("cell.style.gridRow = '1'"));
```

## Verify on the phone

Use the same three-column table from the screenshot.

- The `left`, `centered`, and `right` header cells must appear side by side on one row.
- Each `Test` row must also appear side by side—not diagonally.
- Check that all horizontal and vertical borders remain visible.
- Confirm the long-description table still wraps and that Tab/Shift-Tab navigation still works.

Do not call this fixed from the test alone; inspect the generated debug APK on the phone.
