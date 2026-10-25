const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('menu retains its Settings action and the popup can scroll to the last item', () => {
  assert.match(
    source,
    /title: 'Settings', action: \(\) => window\.AndroidNative && window\.AndroidNative\.onNativeAction\('settings'\)/
  );
  assert.match(html, /\.popup-toolbar-strip\s*\{[^}]*overflow-x:\s*scroll\s*!important/s);
  assert.match(html, /\.popup-toolbar-strip\s*\{[^}]*width:\s*calc\(100vw - 16px\)\s*!important/s);
  assert.match(html, /\.popup-toolbar-strip\s*\{[^}]*max-width:\s*calc\(100vw - 16px\)/s);
  assert.match(html, /\.popup-strip-btn\s*\{[^}]*flex:\s*0 0 auto\s*!important/s);
  assert.match(source, /strip\.scrollLeft\s*=\s*0/);
});

test('menu actions use distinct supplied icons for the three save actions and HTML export', () => {
  const menu = source.slice(source.indexOf("togglePopupStrip('menu'"), source.indexOf('\n      ]);', source.indexOf("togglePopupStrip('menu'")));
  const insert = source.slice(source.indexOf("togglePopupStrip('insert'"), source.indexOf('\n      ]);', source.indexOf("togglePopupStrip('insert'")));
  assert.match(menu, /icon: svgIcons\.saveFile, title: 'Save File'/);
  assert.match(menu, /icon: svgIcons\.saveAsFile, title: 'Save As'/);
  assert.match(menu, /icon: svgIcons\.saveAsTextPack, title: 'Save as Text Pack'/);
  assert.match(menu, /icon: svgIcons\.exportHtml, title: 'Export HTML \/ MHTML'/);
  assert.match(menu, /icon: svgIcons\.switchView, title: 'Switch View Mode'/);
  assert.match(menu, /icon: svgIcons\.newWindow, title: 'New Window'/);
  assert.match(insert, /icon: svgIcons\.footnote, title: 'Insert Footnote'/);
});

test('table toolbar opens the original insert-table picker', () => {
  assert.match(source, /const tableBtn = bar\.querySelector\('#grp-btn-table'\)/);
  assert.match(source, /tableBtn\.onclick = \(e\) => \{\s*e\.stopPropagation\(\);\s*showTableGridPickerModal\(\);/);
  assert.doesNotMatch(source, /TABLE_ACTIONS|wmdxTableActions/);
});
