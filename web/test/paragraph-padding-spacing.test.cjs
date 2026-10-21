const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Paragraph spacing CSS rules use padding instead of margins', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const indexHtml = fs.readFileSync(htmlPath, 'utf8');

  // Check first line paragraph rule
  assert.ok(
    indexHtml.includes('.cm-content .cm-paragraph-first:not(.cm-list-item)'),
    'Selector for cm-paragraph-first exists'
  );
  assert.ok(
    indexHtml.includes('margin-top: 0 !important;'),
    'cm-paragraph-first sets margin-top to 0'
  );
  assert.ok(
    indexHtml.includes('padding-top: var(--paragraph-margin-top, 0px) !important;'),
    'cm-paragraph-first sets padding-top with --paragraph-margin-top'
  );

  // Check last line paragraph rule
  assert.ok(
    indexHtml.includes('.cm-content .cm-paragraph-last:not(.cm-list-item)'),
    'Selector for cm-paragraph-last exists'
  );
  assert.ok(
    indexHtml.includes('margin-bottom: 0 !important;'),
    'cm-paragraph-last sets margin-bottom to 0'
  );
  assert.ok(
    indexHtml.includes('padding-bottom: var(--paragraph-margin-bottom, 8px) !important;'),
    'cm-paragraph-last sets padding-bottom with --paragraph-margin-bottom'
  );
});
