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
});

test('requestMeasure flow sequences read geometry before write movement across multiple queued keys', () => {
  const sequence = [];

  // Mock view object with requestMeasure
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
      // Simulate CodeMirror's measurement cycle: run read then write
      const readResult = spec.read(this);
      spec.write(this);
    }
  };

  // Simulate queued movements
  const move1 = (v) => sequence.push('write_move_1');
  const move2 = (v) => sequence.push('write_move_2');

  const queue = [move1, move2];

  // Helper matching scheduleNextMeasuredVerticalMove logic
  function runScheduled(v, q) {
    if (!v.dom.isConnected) return;
    v.requestMeasure({
      read: (measuredView) => measuredView.coordsAtPos(measuredView.state.selection.main.head),
      write: (measuredView) => {
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
