const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeNavigationTraceRecord } = require('../src/navigationDiagnostics.js');

test('serializeNavigationTraceRecord preserves valid fields and normalizes coordinates', () => {
  const record = {
    id: 1,
    kind: 'arrow',
    direction: 'down',
    repeat: true,
    before: { anchor: 10, head: 10, line: 1, column: 1, x: 12.345, y: 56.789, scrollTop: 0, scrollLeft: 0 },
    after: { anchor: 25, head: 25, line: 2, column: 1, x: 12.345, y: 76.789, scrollTop: 0, scrollLeft: 0 },
    blockBefore: 'paragraph',
    blockAfter: 'heading',
    selectionChanged: true
  };

  const jsonStr = serializeNavigationTraceRecord(record);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.id, 1);
  assert.strictEqual(parsed.kind, 'arrow');
  assert.strictEqual(parsed.direction, 'down');
  assert.strictEqual(parsed.repeat, true);
  assert.strictEqual(parsed.before.anchor, 10);
  assert.strictEqual(parsed.before.x, 12.35);
  assert.strictEqual(parsed.after.y, 76.79);
  assert.strictEqual(parsed.blockBefore, 'paragraph');
  assert.strictEqual(parsed.blockAfter, 'heading');
  assert.strictEqual(parsed.selectionChanged, true);
  assert.strictEqual(parsed.pointerX, undefined);
});

test('serializeNavigationTraceRecord handles tap records with pointer coordinates', () => {
  const record = {
    id: 2,
    kind: 'tap',
    direction: 'none',
    repeat: false,
    before: { anchor: 0, head: 0, line: 1, column: 1, x: 0, y: 0, scrollTop: 0, scrollLeft: 0 },
    after: { anchor: 50, head: 50, line: 5, column: 3, x: 25.5, y: 100, scrollTop: 10, scrollLeft: 0 },
    blockBefore: 'other',
    blockAfter: 'list',
    pointerX: 120.45,
    pointerY: 230.89,
    selectionChanged: true
  };

  const jsonStr = serializeNavigationTraceRecord(record);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.id, 2);
  assert.strictEqual(parsed.kind, 'tap');
  assert.strictEqual(parsed.pointerX, 120.45);
  assert.strictEqual(parsed.pointerY, 230.89);
  assert.strictEqual(parsed.blockAfter, 'list');
});

test('serializeNavigationTraceRecord drops unexpected private fields and normalizes invalid coordinates to null', () => {
  const sensitiveRecord = {
    id: 3,
    kind: 'arrow',
    direction: 'up',
    repeat: false,
    before: { anchor: 'invalid', head: null, line: NaN, column: undefined, x: Infinity, y: -Infinity, scrollTop: null, scrollLeft: null },
    after: { anchor: 10, head: 10, line: 1, column: 1, x: 10, y: 20, scrollTop: 0, scrollLeft: 0 },
    blockBefore: 'invalid_block_type',
    blockAfter: 'code',
    selectionChanged: false,
    text: 'PRIVATE DOCUMENT CONTENT',
    selectedText: 'SENSITIVE TEXT',
    html: '<p>SECRET HTML</p>',
    fileName: 'SecretNote.md',
    path: '/sdcard/Documents/SecretNote.md',
    uri: 'content://com.wmdx/secret'
  };

  const jsonStr = serializeNavigationTraceRecord(sensitiveRecord);

  // Assert private fields are NOT emitted in the output JSON string at all
  assert.strictEqual(jsonStr.includes('PRIVATE DOCUMENT CONTENT'), false);
  assert.strictEqual(jsonStr.includes('SENSITIVE TEXT'), false);
  assert.strictEqual(jsonStr.includes('SECRET HTML'), false);
  assert.strictEqual(jsonStr.includes('SecretNote.md'), false);
  assert.strictEqual(jsonStr.includes('/sdcard/Documents/SecretNote.md'), false);
  assert.strictEqual(jsonStr.includes('content://com.wmdx/secret'), false);

  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.text, undefined);
  assert.strictEqual(parsed.selectedText, undefined);
  assert.strictEqual(parsed.html, undefined);
  assert.strictEqual(parsed.fileName, undefined);
  assert.strictEqual(parsed.path, undefined);
  assert.strictEqual(parsed.uri, undefined);

  // Assert invalid coordinates normalized to null
  assert.strictEqual(parsed.before.anchor, null);
  assert.strictEqual(parsed.before.line, null);
  assert.strictEqual(parsed.before.x, null);
  assert.strictEqual(parsed.before.y, null);

  // Assert invalid block category falls back to 'other'
  assert.strictEqual(parsed.blockBefore, 'other');
  assert.strictEqual(parsed.blockAfter, 'code');
});
