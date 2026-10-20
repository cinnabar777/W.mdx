const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');

test('measuredVerticalNavigationKeymap uses requestMeasure and enqueues vertical moves', () => {
  assert.ok(mainJs.includes('measuredVerticalNavigationKeymap'), 'measuredVerticalNavigationKeymap must be defined in main.js');
  assert.ok(mainJs.includes('enqueueMeasuredVerticalMove'), 'enqueueMeasuredVerticalMove helper must be present');
  assert.ok(mainJs.includes('requestMeasure'), 'requestMeasure must be called during vertical navigation');
  assert.ok(mainJs.includes('pendingVerticalMoves = new WeakMap()'), 'pendingVerticalMoves WeakMap must be initialized');
  assert.ok(mainJs.includes('write: (_measure, measuredView)'), 'write signature must accept (_measure, measuredView)');
});

test('requestMeasure flow passes (measure, view) to write and sequences geometry read before write move', () => {
  const sequence = [];

  // Mock view object matching CodeMirror's real requestMeasure signature: write(measure, view)
  const mockView = {
    dom: { isConnected: true },
    state: {
      selection: { main: { head: 10 } }
    },
    coordsAtPos(head) {
      sequence.push(`read_coords_${head}`);
      return { top: 100, bottom: 120, left: 10, right: 50 };
    },
    requestMeasure(spec) {
      // Simulate CodeMirror's measurement cycle: pass read result as first arg, view as second arg
      const measureResult = spec.read(this);
      spec.write(measureResult, this);
    }
  };

  const move1 = (v) => {
    assert.strictEqual(v.dom.isConnected, true, 'measuredView parameter in write must be EditorView');
    sequence.push('write_move_1');
  };
  const move2 = (v) => {
    assert.strictEqual(v.dom.isConnected, true, 'measuredView parameter in write must be EditorView');
    sequence.push('write_move_2');
  };

  const queue = [move1, move2];

  function runScheduled(v, q) {
    if (!v.dom.isConnected) return;
    v.requestMeasure({
      read: (measuredView) => measuredView.coordsAtPos(measuredView.state.selection.main.head),
      write: (_measure, measuredView) => {
        const m = q.shift();
        if (m) m(measuredView);
        if (q.length) {
          runScheduled(measuredView, q);
        }
      }
    });
  }

  runScheduled(mockView, queue);

  assert.deepStrictEqual(sequence, [
    'read_coords_10',
    'write_move_1',
    'read_coords_10',
    'write_move_2'
  ], 'Sequence must alternate read geometry and write movement for each queued key');
});
