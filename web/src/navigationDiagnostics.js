const ALLOWED_BLOCKS = new Set(['heading', 'list', 'callout', 'code', 'table', 'paragraph', 'other']);

function sanitizeNum(val) {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.round(val * 100) / 100;
  }
  return null;
}

function sanitizeBlock(val) {
  if (typeof val === 'string' && ALLOWED_BLOCKS.has(val)) {
    return val;
  }
  return 'other';
}

function sanitizeSnapshot(snap) {
  if (!snap || typeof snap !== 'object') {
    return {
      anchor: null,
      head: null,
      line: null,
      column: null,
      x: null,
      y: null,
      scrollTop: null,
      scrollLeft: null
    };
  }
  return {
    anchor: sanitizeNum(snap.anchor),
    head: sanitizeNum(snap.head),
    line: sanitizeNum(snap.line),
    column: sanitizeNum(snap.column),
    x: sanitizeNum(snap.x),
    y: sanitizeNum(snap.y),
    scrollTop: sanitizeNum(snap.scrollTop),
    scrollLeft: sanitizeNum(snap.scrollLeft)
  };
}

export function serializeNavigationTraceRecord(record) {
  if (!record || typeof record !== 'object') {
    return JSON.stringify({
      id: 0,
      kind: 'tap',
      direction: 'none',
      repeat: false,
      before: sanitizeSnapshot(null),
      after: sanitizeSnapshot(null),
      blockBefore: 'other',
      blockAfter: 'other',
      selectionChanged: false
    });
  }

  const kind = (record.kind === 'arrow') ? 'arrow' : 'tap';
  let direction = 'none';
  if (record.direction === 'up') direction = 'up';
  else if (record.direction === 'down') direction = 'down';

  const out = {
    id: typeof record.id === 'number' ? record.id : 0,
    kind,
    direction,
    repeat: Boolean(record.repeat),
    before: sanitizeSnapshot(record.before),
    after: sanitizeSnapshot(record.after),
    blockBefore: sanitizeBlock(record.blockBefore),
    blockAfter: sanitizeBlock(record.blockAfter)
  };

  if (kind === 'tap') {
    out.pointerX = sanitizeNum(record.pointerX);
    out.pointerY = sanitizeNum(record.pointerY);
  }

  out.selectionChanged = Boolean(record.selectionChanged);

  return JSON.stringify(out);
}
