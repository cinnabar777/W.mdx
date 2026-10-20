const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeNavigationTraceRecord } = require('../src/navigationDiagnostics.js');

test('serializeNavigationTraceRecord handles arrow, tap, and scroll records while keeping endpoints separate', () => {
  const arrowRecord = {
    id: 1,
    kind: 'arrow',
    direction: 'down',
    repeat: true,
    pointerType: 'touch',
    before: {
      anchor: 10,
      head: 20,
      collapsed: false,
      anchorLine: 1,
      anchorColumn: 10,
      headLine: 2,
      headColumn: 5,
      anchorBlock: 'paragraph',
      headBlock: 'heading',
      anchorLineText: 'Line 1 text',
      headLineText: '# Heading 2 text',
      anchorClientTop: 100,
      anchorClientBottom: 120,
      headClientTop: 140,
      headClientBottom: 160,
      viewTop: 0,
      viewBottom: 800,
      viewWidth: 400,
      viewHeight: 800,
      scrollTop: 0,
      scrollLeft: 0,
      scrollHeight: 2000,
      clientHeight: 800,
      windowScrollY: 0,
      windowInnerHeight: 800
    },
    after: {
      anchor: 20,
      head: 20,
      collapsed: true,
      anchorLine: 2,
      anchorColumn: 5,
      headLine: 2,
      headColumn: 5,
      anchorBlock: 'heading',
      headBlock: 'heading',
      anchorLineText: '# Heading 2 text',
      headLineText: '# Heading 2 text',
      anchorClientTop: 140,
      anchorClientBottom: 160,
      headClientTop: 140,
      headClientBottom: 160,
      viewTop: 0,
      viewBottom: 800,
      viewWidth: 400,
      viewHeight: 800,
      scrollTop: 0,
      scrollLeft: 0,
      scrollHeight: 2000,
      clientHeight: 800,
      windowScrollY: 0,
      windowInnerHeight: 800
    },
    selectionChanged: true
  };

  const jsonStr = serializeNavigationTraceRecord(arrowRecord);
  assert.ok(jsonStr.length <= 8192);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.id, 1);
  assert.strictEqual(parsed.kind, 'arrow');
  assert.strictEqual(parsed.direction, 'down');
  assert.strictEqual(parsed.repeat, true);
  assert.strictEqual(parsed.before.anchor, 10);
  assert.strictEqual(parsed.before.head, 20);
  assert.strictEqual(parsed.before.collapsed, false);
  assert.strictEqual(parsed.before.anchorLine, 1);
  assert.strictEqual(parsed.before.headLine, 2);
  assert.strictEqual(parsed.before.anchorBlock, 'paragraph');
  assert.strictEqual(parsed.before.headBlock, 'heading');
  assert.strictEqual(parsed.after.collapsed, true);
});

test('serializeNavigationTraceRecord caps line previews at 160 characters and scroll samples at 12', () => {
  const longText = 'A'.repeat(300);
  const manySamples = Array.from({ length: 20 }, (_, i) => ({
    elapsedMs: i * 50,
    target: 'editor',
    scrollTop: i * 10,
    scrollLeft: 0,
    scrollHeight: 2000,
    clientHeight: 800,
    pointerX: 100,
    pointerY: 200,
    anchor: 0,
    head: 0,
    headLine: 1,
    headClientTop: 10,
    viewTop: 0,
    viewBottom: 800
  }));

  const record = {
    id: 2,
    kind: 'scroll',
    direction: 'none',
    repeat: false,
    pointerType: 'touch',
    duration: 500,
    pointerStartX: 100,
    pointerStartY: 200,
    pointerEndX: 100,
    pointerEndY: 400,
    maxTravel: 200,
    canceled: false,
    selectionChanged: false,
    before: {
      anchor: 0,
      head: 0,
      collapsed: true,
      anchorLine: 1,
      anchorColumn: 1,
      headLine: 1,
      headColumn: 1,
      anchorBlock: 'paragraph',
      headBlock: 'paragraph',
      anchorLineText: longText,
      headLineText: longText
    },
    after: {
      anchor: 0,
      head: 0,
      collapsed: true,
      anchorLine: 1,
      anchorColumn: 1,
      headLine: 1,
      headColumn: 1,
      anchorBlock: 'paragraph',
      headBlock: 'paragraph',
      anchorLineText: longText,
      headLineText: longText
    },
    scrollSamples: manySamples
  };

  const jsonStr = serializeNavigationTraceRecord(record);
  assert.ok(jsonStr.length <= 8192);

  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.before.anchorLineText.length, 160);
  assert.strictEqual(parsed.scrollSamples.length, 12);
});

test('serializeNavigationTraceRecord drops unknown private fields and normalizes invalid coordinates', () => {
  const sensitiveRecord = {
    id: 3,
    kind: 'tap',
    direction: 'none',
    repeat: false,
    pointerType: 'touch',
    before: {
      anchor: 'invalid',
      head: null,
      anchorLine: NaN,
      anchorColumn: undefined,
      anchorClientTop: Infinity,
      anchorBlock: 'invalid_type',
      anchorLineText: 'Line text'
    },
    after: {
      anchor: 10,
      head: 10,
      collapsed: true
    },
    text: 'PRIVATE DOCUMENT CONTENT',
    selectedText: 'SENSITIVE TEXT',
    html: '<p>SECRET HTML</p>',
    fileName: 'SecretNote.md',
    path: '/sdcard/Documents/SecretNote.md',
    uri: 'content://com.wmdx/secret'
  };

  const jsonStr = serializeNavigationTraceRecord(sensitiveRecord);
  assert.ok(jsonStr.length <= 8192);

  assert.strictEqual(jsonStr.includes('PRIVATE DOCUMENT CONTENT'), false);
  assert.strictEqual(jsonStr.includes('SENSITIVE TEXT'), false);
  assert.strictEqual(jsonStr.includes('SECRET HTML'), false);
  assert.strictEqual(jsonStr.includes('SecretNote.md'), false);
  assert.strictEqual(jsonStr.includes('/sdcard/Documents/SecretNote.md'), false);

  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.text, undefined);
  assert.strictEqual(parsed.selectedText, undefined);
  assert.strictEqual(parsed.before.anchor, null);
  assert.strictEqual(parsed.before.anchorLine, null);
  assert.strictEqual(parsed.before.anchorClientTop, null);
  assert.strictEqual(parsed.before.anchorBlock, 'other');
});
