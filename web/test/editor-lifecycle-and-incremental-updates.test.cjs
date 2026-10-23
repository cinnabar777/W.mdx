const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const mainSource = fs.readFileSync(mainJsPath, 'utf8');

const navCapturePath = path.join(__dirname, '../src/navigationCapture.js');
const navCaptureSource = fs.readFileSync(navCapturePath, 'utf8');

const tableWidgetPath = path.join(__dirname, '../src/tableWidget.js');
const tableWidgetSource = fs.readFileSync(tableWidgetPath, 'utf8');

test('setupNavigationDiagnostics returns complete cleanup function', () => {
  assert.ok(mainSource.includes('const fullCaptureDisposer = setupFullNavigationCapture(view)'));
  assert.ok(mainSource.includes('dom.removeEventListener(\'keydown\', onKeyDown, true)'));
  assert.ok(mainSource.includes('dom.removeEventListener(\'keyup\', onKeyUp, true)'));
  assert.ok(mainSource.includes('window.removeEventListener(\'blur\', onBlur)'));
  assert.ok(mainSource.includes('document.removeEventListener(\'selectionchange\', onSelectionChange)'));
  assert.ok(mainSource.includes('dom.removeEventListener(\'pointerdown\', onPointerDown, true)'));
  assert.ok(mainSource.includes('window.removeEventListener(\'pointermove\', onPointerMove, true)'));
  assert.ok(mainSource.includes('window.removeEventListener(\'pointerup\', onPointerUp, true)'));
  assert.ok(mainSource.includes('window.removeEventListener(\'pointercancel\', onPointerCancel, true)'));
  assert.ok(mainSource.includes('fullCaptureDisposer()'));
});

test('control bar, fast scrollbar, and TOC gestures have idempotent lifecycle', () => {
  assert.ok(mainSource.includes('if (!groupedControlBarClickInitialized)'));
  assert.ok(mainSource.includes('activeFastScrollbarDisposer()'));
  assert.ok(mainSource.includes('if (tocGestureInitialized) return'));
});

test('State fields implement incremental decoration updates mapped through transactions', () => {
  assert.ok(mainSource.includes('current.map(tr.changes)'));
  assert.ok(mainSource.includes('mappedDecos.update'));
  assert.ok(mainSource.includes('mapped.update'));
});

test('TABLE_HEIGHT_STYLE_PROPERTIES excludes color properties to prevent table cache invalidation on theme change', () => {
  const match = tableWidgetSource.match(/const TABLE_HEIGHT_STYLE_PROPERTIES = \[([\s\S]*?)\];/);
  assert.ok(match, 'TABLE_HEIGHT_STYLE_PROPERTIES block found');
  const propertiesText = match[1];

  assert.strictEqual(propertiesText.includes('--table-header-bg'), false);
  assert.strictEqual(propertiesText.includes('--table-header-color'), false);
  assert.strictEqual(propertiesText.includes('--table-cell-bg'), false);
  assert.strictEqual(propertiesText.includes('--table-cell-color'), false);
  assert.strictEqual(propertiesText.includes('--text-color'), false);
  assert.ok(propertiesText.includes('--table-cell-padding'));
  assert.ok(propertiesText.includes('--table-border-width'));
});

test('Ordinary scrolling does not invoke window_snapshot_requested on scroll-active', () => {
  assert.strictEqual(navCaptureSource.includes("requestWindowSnapshot('scroll-active')"), false);
  assert.ok(navCaptureSource.includes("requestWindowSnapshot('large-scroll-delta', true)"));
  assert.ok(navCaptureSource.includes("requestWindowSnapshot('scroll-idle')"));
});
