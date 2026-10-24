const VALID_MODES = new Set(['source', 'live_preview', 'wysiwyg']);
const WIDGET_KINDS = ['code_header', 'callout_title', 'image_preview'];
const DECORATION_KINDS = ['wysiwyg_code_blocks', 'live_preview_plugin'];
const MAX_COUNTER = 1_000_000_000;
const modeMetrics = new Map();

function normalizedMode(mode) {
  return VALID_MODES.has(mode) ? mode : 'other';
}

function emptyWidgetMetrics() {
  return { reads: 0, cacheUpdates: 0, totalDeltaPx: 0, maxDeltaPx: 0 };
}

function emptyMetrics() {
  return {
    heightMap: { scheduled: 0, dispatched: 0, rebuilt: 0 },
    decorations: { wysiwyg_code_blocks: 0, live_preview_plugin: 0 },
    widgets: Object.fromEntries(WIDGET_KINDS.map(kind => [kind, emptyWidgetMetrics()])),
    listMarkers: {
      rowsScanned: 0,
      rowsMeasured: 0,
      gutterChanges: 0,
      totalGutterDeltaPx: 0,
      maxGutterDeltaPx: 0
    }
  };
}

function countersFor(mode) {
  const key = normalizedMode(mode);
  if (!modeMetrics.has(key)) modeMetrics.set(key, emptyMetrics());
  return modeMetrics.get(key);
}

function addCount(target, value = 1) {
  if (!Number.isFinite(value) || value <= 0) return target;
  return Math.min(MAX_COUNTER, target + Math.floor(value));
}

function normalizedDelta(value) {
  return Number.isFinite(value) && value > 0
    ? Math.round(value * 10) / 10
    : 0;
}

export function recordHeightMapRefresh(mode, stage) {
  const allowed = ['scheduled', 'dispatched', 'rebuilt'];
  if (!allowed.includes(stage)) return;
  const metrics = countersFor(mode);
  metrics.heightMap[stage] = addCount(metrics.heightMap[stage]);
}

export function recordDecorationBuild(mode, kind) {
  if (!DECORATION_KINDS.includes(kind)) return;
  const metrics = countersFor(mode);
  metrics.decorations[kind] = addCount(metrics.decorations[kind]);
}

export function recordWidgetHeightRead(mode, kind, height) {
  if (!WIDGET_KINDS.includes(kind) || !Number.isFinite(height) || height <= 0) return;
  const metrics = countersFor(mode);
  metrics.widgets[kind].reads = addCount(metrics.widgets[kind].reads);
}

export function recordWidgetHeightCacheUpdate(mode, kind, estimate, actual) {
  if (!WIDGET_KINDS.includes(kind) || !Number.isFinite(actual) || actual <= 0) return;
  const metrics = countersFor(mode);
  const widget = metrics.widgets[kind];
  const delta = normalizedDelta(Number.isFinite(estimate) ? Math.abs(actual - estimate) : 0);
  widget.cacheUpdates = addCount(widget.cacheUpdates);
  widget.totalDeltaPx = normalizedDelta(widget.totalDeltaPx + delta);
  widget.maxDeltaPx = Math.max(widget.maxDeltaPx, delta);
}

export function recordListMarkerRead(mode, rowsScanned, rowsMeasured) {
  const metrics = countersFor(mode).listMarkers;
  metrics.rowsScanned = addCount(metrics.rowsScanned, rowsScanned);
  metrics.rowsMeasured = addCount(metrics.rowsMeasured, rowsMeasured);
}

export function recordListMarkerWrite(mode, changedCount, totalDeltaPx, maxDeltaPx) {
  const metrics = countersFor(mode).listMarkers;
  metrics.gutterChanges = addCount(metrics.gutterChanges, changedCount);
  metrics.totalGutterDeltaPx = normalizedDelta(metrics.totalGutterDeltaPx + normalizedDelta(totalDeltaPx));
  metrics.maxGutterDeltaPx = Math.max(metrics.maxGutterDeltaPx, normalizedDelta(maxDeltaPx));
}

function hasMetrics(metrics) {
  return Object.values(metrics.heightMap).some(Boolean) ||
    Object.values(metrics.decorations).some(Boolean) ||
    Object.values(metrics.widgets).some(widget =>
      widget.reads || widget.cacheUpdates
    ) ||
    Object.values(metrics.listMarkers).some(Boolean);
}

export function takeRenderLayoutMetrics(mode) {
  const key = normalizedMode(mode);
  const metrics = modeMetrics.get(key);
  if (!metrics || !hasMetrics(metrics)) return null;
  modeMetrics.delete(key);
  return {
    kind: 'render_layout_metrics',
    mode: key,
    ...metrics
  };
}
