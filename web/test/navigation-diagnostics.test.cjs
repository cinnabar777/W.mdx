const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeNavigationTraceRecord } = require('../src/navigationDiagnostics.js');

test('serializeNavigationTraceRecord serializes arrow event records with pressId, keydownIndex, and scrollDeltas', () => {
  const arrowEvent = {
    id: 10,
    pressId: 100,
    kind: 'arrow',
    source: 'arrow',
    direction: 'down',
    repeat: true,
    reportedRepeat: false,
    keydownIndex: 2,
    eventElapsedMs: 120,
    scrollDeltaTop: 28.5,
    scrollDeltaLeft: 0,
    selectionChanged: true,
    before: { anchor: 10, head: 10, line: 1, column: 10 },
    after: { anchor: 25, head: 25, line: 2, column: 10 }
  };

  const jsonStr = serializeNavigationTraceRecord(arrowEvent);
  assert.ok(jsonStr.length <= 8192);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.id, 10);
  assert.strictEqual(parsed.pressId, 100);
  assert.strictEqual(parsed.kind, 'arrow');
  assert.strictEqual(parsed.source, 'arrow');
  assert.strictEqual(parsed.direction, 'down');
  assert.strictEqual(parsed.repeat, true);
  assert.strictEqual(parsed.reportedRepeat, false);
  assert.strictEqual(parsed.keydownIndex, 2);
  assert.strictEqual(parsed.eventElapsedMs, 120);
  assert.strictEqual(parsed.scrollDeltaTop, 28.5);
  assert.strictEqual(parsed.scrollDeltaLeft, 0);
  assert.strictEqual(parsed.selectionChanged, true);
});

test('serializeNavigationTraceRecord serializes arrow press summary records with duration and endedByBlur', () => {
  const pressRecord = {
    id: 11,
    pressId: 100,
    kind: 'arrow_press',
    source: 'arrow',
    direction: 'down',
    duration: 1500,
    keydownCount: 15,
    hadReportedRepeat: false,
    endedByBlur: true,
    totalSampleCount: 15,
    droppedSampleCount: 3,
    scrollSamples: Array.from({ length: 15 }, (_, i) => ({
      elapsedMs: i * 100,
      pressId: 100,
      source: 'arrow',
      target: 'editor',
      scrollTop: i * 28,
      scrollLeft: 0,
      scrollHeight: 5000,
      clientHeight: 800,
      anchor: 10 + i * 15,
      head: 10 + i * 15,
      headLine: 1 + i,
      headClientTop: 50,
      viewTop: 0,
      viewBottom: 800
    }))
  };

  const jsonStr = serializeNavigationTraceRecord(pressRecord);
  assert.ok(jsonStr.length <= 8192);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.id, 11);
  assert.strictEqual(parsed.pressId, 100);
  assert.strictEqual(parsed.kind, 'arrow_press');
  assert.strictEqual(parsed.duration, 1500);
  assert.strictEqual(parsed.keydownCount, 15);
  assert.strictEqual(parsed.hadReportedRepeat, false);
  assert.strictEqual(parsed.endedByBlur, true);
  assert.strictEqual(parsed.totalSampleCount, 15);
  assert.strictEqual(parsed.droppedSampleCount, 3);

  // Assert 12-sample retention (sample 0 + newest 11)
  assert.strictEqual(parsed.scrollSamples.length, 12);
  assert.strictEqual(parsed.scrollSamples[0].elapsedMs, 0); // Sample 0 (first)
  assert.strictEqual(parsed.scrollSamples[11].elapsedMs, 1400); // Sample 14 (newest)
});

test('serializeNavigationTraceRecord drops unexpected private fields and keeps JSON under 8192 characters', () => {
  const longText = 'X'.repeat(500);
  const record = {
    id: 12,
    kind: 'tap',
    direction: 'none',
    repeat: false,
    pointerType: 'touch',
    duration: 100,
    pointerStartX: 50,
    pointerStartY: 50,
    maxTravel: 2,
    before: { anchor: 0, head: 0, anchorLineText: longText, headLineText: longText },
    after: { anchor: 0, head: 0, anchorLineText: longText, headLineText: longText },
    text: 'PRIVATE DOCUMENT CONTENT',
    selectedText: 'SENSITIVE TEXT',
    html: '<p>SECRET HTML</p>',
    fileName: 'SecretNote.md',
    path: '/sdcard/Documents/SecretNote.md',
    uri: 'content://com.wmdx/secret'
  };

  const jsonStr = serializeNavigationTraceRecord(record);
  assert.ok(jsonStr.length <= 8192);

  assert.strictEqual(jsonStr.includes('PRIVATE DOCUMENT CONTENT'), false);
  assert.strictEqual(jsonStr.includes('SENSITIVE TEXT'), false);
  assert.strictEqual(jsonStr.includes('SECRET HTML'), false);
  assert.strictEqual(jsonStr.includes('SecretNote.md'), false);

  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.text, undefined);
  assert.strictEqual(parsed.before.anchorLineText.length, 160);
});

test('selection trace retains numeric highlight range but never selected text', () => {
  const record = {
    id: 99,
    kind: 'selection',
    source: 'pointer',
    direction: 'none',
    repeat: false,
    pointerType: 'touch',
    selectionChanged: true,
    before: { anchor: 40, head: 40, collapsed: true },
    after: { anchor: 40, head: 72, collapsed: false },
    selectedText: 'must not be serialized'
  };

  const jsonStr = serializeNavigationTraceRecord(record);
  const parsed = JSON.parse(jsonStr);
  assert.ok(jsonStr.length <= 8192);
  assert.strictEqual(parsed.kind, 'selection');
  assert.strictEqual(parsed.before.collapsed, true);
  assert.strictEqual(parsed.after.anchor, 40);
  assert.strictEqual(parsed.after.head, 72);
  assert.strictEqual(parsed.after.collapsed, false);
  assert.strictEqual(parsed.selectedText, undefined);
  assert.strictEqual(jsonStr.includes('must not be serialized'), false);
});
