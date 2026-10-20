const ALLOWED_BLOCKS = new Set(['heading', 'list', 'callout', 'code', 'table', 'paragraph', 'other']);
const ALLOWED_KINDS = new Set(['arrow', 'arrow_press', 'tap', 'scroll', 'selection']);
const ALLOWED_SOURCES = new Set(['arrow', 'pointer', 'unattributed']);
const ALLOWED_DIRECTIONS = new Set(['up', 'down', 'none']);
const ALLOWED_POINTER_TYPES = new Set(['touch', 'mouse', 'pen', 'unknown']);
const ALLOWED_SAMPLE_TARGETS = new Set(['editor', 'ancestor1', 'ancestor2', 'page']);

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

function sanitizePreview(text, maxLen = 160) {
  if (typeof text !== 'string') return null;
  const singleLine = text.replace(/[\r\n\t]+/g, ' ').trim();
  if (singleLine.length > maxLen) {
    return singleLine.slice(0, maxLen);
  }
  return singleLine;
}

function sanitizeSnapshot(snap, linePreviewMaxLen = 160) {
  if (!snap || typeof snap !== 'object') {
    return {
      anchor: null,
      head: null,
      collapsed: true,
      anchorLine: null,
      anchorColumn: null,
      headLine: null,
      headColumn: null,
      anchorBlock: 'other',
      headBlock: 'other',
      anchorLineText: null,
      headLineText: null,
      anchorClientTop: null,
      anchorClientBottom: null,
      headClientTop: null,
      headClientBottom: null,
      viewTop: null,
      viewBottom: null,
      viewWidth: null,
      viewHeight: null,
      scrollTop: null,
      scrollLeft: null,
      scrollHeight: null,
      clientHeight: null,
      windowScrollY: null,
      windowInnerHeight: null
    };
  }

  const anchor = sanitizeNum(snap.anchor);
  const head = sanitizeNum(snap.head);
  const collapsed = (anchor !== null && head !== null) ? (anchor === head) : Boolean(snap.collapsed);

  return {
    anchor,
    head,
    collapsed,
    anchorLine: sanitizeNum(snap.anchorLine),
    anchorColumn: sanitizeNum(snap.anchorColumn),
    headLine: sanitizeNum(snap.headLine),
    headColumn: sanitizeNum(snap.headColumn),
    anchorBlock: sanitizeBlock(snap.anchorBlock),
    headBlock: sanitizeBlock(snap.headBlock),
    anchorLineText: sanitizePreview(snap.anchorLineText, linePreviewMaxLen),
    headLineText: sanitizePreview(snap.headLineText, linePreviewMaxLen),
    anchorClientTop: sanitizeNum(snap.anchorClientTop),
    anchorClientBottom: sanitizeNum(snap.anchorClientBottom),
    headClientTop: sanitizeNum(snap.headClientTop),
    headClientBottom: sanitizeNum(snap.headClientBottom),
    viewTop: sanitizeNum(snap.viewTop),
    viewBottom: sanitizeNum(snap.viewBottom),
    viewWidth: sanitizeNum(snap.viewWidth),
    viewHeight: sanitizeNum(snap.viewHeight),
    scrollTop: sanitizeNum(snap.scrollTop),
    scrollLeft: sanitizeNum(snap.scrollLeft),
    scrollHeight: sanitizeNum(snap.scrollHeight),
    clientHeight: sanitizeNum(snap.clientHeight),
    windowScrollY: sanitizeNum(snap.windowScrollY),
    windowInnerHeight: sanitizeNum(snap.windowInnerHeight)
  };
}

function sanitizeSample(s) {
  if (!s || typeof s !== 'object') return null;
  const target = (typeof s.target === 'string' && ALLOWED_SAMPLE_TARGETS.has(s.target)) ? s.target : 'editor';
  const source = (typeof s.source === 'string' && ALLOWED_SOURCES.has(s.source)) ? s.source : 'unattributed';

  return {
    elapsedMs: sanitizeNum(s.elapsedMs),
    pressId: sanitizeNum(s.pressId),
    source,
    target,
    scrollTop: sanitizeNum(s.scrollTop),
    scrollLeft: sanitizeNum(s.scrollLeft),
    scrollHeight: sanitizeNum(s.scrollHeight),
    clientHeight: sanitizeNum(s.clientHeight),
    pointerX: sanitizeNum(s.pointerX),
    pointerY: sanitizeNum(s.pointerY),
    anchor: sanitizeNum(s.anchor),
    head: sanitizeNum(s.head),
    headLine: sanitizeNum(s.headLine),
    headClientTop: sanitizeNum(s.headClientTop),
    viewTop: sanitizeNum(s.viewTop),
    viewBottom: sanitizeNum(s.viewBottom)
  };
}

export function serializeNavigationTraceRecord(record) {
  if (!record || typeof record !== 'object') {
    return JSON.stringify({
      id: 0,
      kind: 'tap',
      direction: 'none',
      repeat: false,
      pointerType: 'unknown',
      duration: null,
      selectionChanged: false,
      before: sanitizeSnapshot(null),
      after: sanitizeSnapshot(null)
    });
  }

  const kind = ALLOWED_KINDS.has(record.kind) ? record.kind : 'tap';
  const direction = ALLOWED_DIRECTIONS.has(record.direction) ? record.direction : 'none';
  const pointerType = ALLOWED_POINTER_TYPES.has(record.pointerType) ? record.pointerType : 'unknown';
  const source = ALLOWED_SOURCES.has(record.source) ? record.source : undefined;

  let rawSamples = Array.isArray(record.scrollSamples) ? record.scrollSamples : [];
  let totalSampleCount = typeof record.totalSampleCount === 'number' ? record.totalSampleCount : rawSamples.length;
  let droppedSampleCount = typeof record.droppedSampleCount === 'number' ? record.droppedSampleCount : 0;

  // Retention strategy: keep sample 0 (first) + 11 newest if > 12 samples
  if (rawSamples.length > 12) {
    if (typeof record.droppedSampleCount !== 'number') {
      droppedSampleCount += (rawSamples.length - 12);
    }
    const firstSample = rawSamples[0];
    const newest11 = rawSamples.slice(rawSamples.length - 11);
    rawSamples = [firstSample, ...newest11];
  }

  let samples = rawSamples.map(sanitizeSample).filter(Boolean);

  let previewMaxLen = 160;

  const buildObject = (maxPreviewLen, sampleArray) => {
    const out = {
      id: typeof record.id === 'number' ? record.id : 0,
      pressId: sanitizeNum(record.pressId),
      kind,
      direction,
      repeat: Boolean(record.repeat),
      reportedRepeat: record.reportedRepeat !== undefined ? Boolean(record.reportedRepeat) : undefined,
      keydownIndex: sanitizeNum(record.keydownIndex),
      eventElapsedMs: sanitizeNum(record.eventElapsedMs),
      hadReportedRepeat: record.hadReportedRepeat !== undefined ? Boolean(record.hadReportedRepeat) : undefined,
      endedByBlur: record.endedByBlur !== undefined ? Boolean(record.endedByBlur) : undefined,
      keydownCount: sanitizeNum(record.keydownCount),
      pointerType,
      duration: sanitizeNum(record.duration),
      pointerStartX: sanitizeNum(record.pointerStartX),
      pointerStartY: sanitizeNum(record.pointerStartY),
      pointerEndX: sanitizeNum(record.pointerEndX),
      pointerEndY: sanitizeNum(record.pointerEndY),
      maxTravel: sanitizeNum(record.maxTravel),
      scrollDeltaTop: sanitizeNum(record.scrollDeltaTop),
      scrollDeltaLeft: sanitizeNum(record.scrollDeltaLeft),
      canceled: Boolean(record.canceled),
      selectionChanged: Boolean(record.selectionChanged),
      before: sanitizeSnapshot(record.before, maxPreviewLen),
      after: sanitizeSnapshot(record.after, maxPreviewLen)
    };

    if (source !== undefined) {
      out.source = source;
    }

    if (totalSampleCount > 0) {
      out.totalSampleCount = totalSampleCount;
      out.droppedSampleCount = droppedSampleCount;
    }

    if (sampleArray && sampleArray.length > 0) {
      out.scrollSamples = sampleArray;
    }

    return out;
  };

  let obj = buildObject(previewMaxLen, samples);
  let jsonStr = JSON.stringify(obj);

  // Enforce 8,192 character strict limit
  if (jsonStr.length > 8192 && samples.length > 0) {
    while (jsonStr.length > 8192 && samples.length > 0) {
      samples.pop();
      obj = buildObject(previewMaxLen, samples);
      jsonStr = JSON.stringify(obj);
    }
  }

  if (jsonStr.length > 8192) {
    previewMaxLen = 40;
    obj = buildObject(previewMaxLen, samples);
    jsonStr = JSON.stringify(obj);
  }

  if (jsonStr.length > 8192) {
    previewMaxLen = 0;
    obj = buildObject(previewMaxLen, []);
    jsonStr = JSON.stringify(obj);
  }

  return jsonStr;
}
