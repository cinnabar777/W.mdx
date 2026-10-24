const test = require('node:test');
const assert = require('node:assert/strict');

test('render layout metrics aggregate counts and sizes by mode without document text', async () => {
  const metrics = await import('../src/renderLayoutDiagnostics.js');
  metrics.recordHeightMapRefresh('wysiwyg', 'scheduled');
  metrics.recordHeightMapRefresh('wysiwyg', 'scheduled');
  metrics.recordHeightMapRefresh('wysiwyg', 'dispatched');
  metrics.recordHeightMapRefresh('wysiwyg', 'rebuilt');
  metrics.recordDecorationBuild('wysiwyg', 'wysiwyg_code_blocks');
  metrics.recordWidgetHeightRead('wysiwyg', 'code_header', 28);
  metrics.recordWidgetHeightRead('wysiwyg', 'code_header', 35);
  metrics.recordWidgetHeightCacheUpdate('wysiwyg', 'code_header', 28, 35);
  metrics.recordWidgetHeightCacheUpdate('wysiwyg', 'callout_title', 32, 48);
  metrics.recordListMarkerRead('wysiwyg', 9, 4);
  metrics.recordListMarkerWrite('wysiwyg', 2, 12.5, 8);
  metrics.recordWidgetHeightRead('wysiwyg', 'an example title that must not be accepted', 50);
  metrics.recordHeightMapRefresh('live_preview', 'scheduled');
  metrics.recordDecorationBuild('live_preview', 'live_preview_plugin');

  const summary = metrics.takeRenderLayoutMetrics('wysiwyg');
  assert.equal(summary.kind, 'render_layout_metrics');
  assert.equal(summary.mode, 'wysiwyg');
  assert.deepEqual(summary.heightMap, { scheduled: 2, dispatched: 1, rebuilt: 1 });
  assert.equal(summary.decorations.wysiwyg_code_blocks, 1);
  assert.deepEqual(summary.widgets.code_header, {
    reads: 2,
    cacheUpdates: 1,
    totalDeltaPx: 7,
    maxDeltaPx: 7
  });
  assert.deepEqual(summary.widgets.callout_title, {
    reads: 0,
    cacheUpdates: 1,
    totalDeltaPx: 16,
    maxDeltaPx: 16
  });
  assert.deepEqual(summary.listMarkers, {
    rowsScanned: 9,
    rowsMeasured: 4,
    gutterChanges: 2,
    totalGutterDeltaPx: 12.5,
    maxGutterDeltaPx: 8
  });
  assert.equal(JSON.stringify(summary).includes('example title'), false);
  assert.ok(JSON.stringify(summary).length < 16 * 1024);
  assert.equal(metrics.takeRenderLayoutMetrics('wysiwyg'), null);
  const livePreviewSummary = metrics.takeRenderLayoutMetrics('live_preview');
  assert.equal(livePreviewSummary.mode, 'live_preview');
  assert.equal(livePreviewSummary.heightMap.scheduled, 1);
  assert.equal(livePreviewSummary.decorations.live_preview_plugin, 1);
  assert.equal(metrics.takeRenderLayoutMetrics('live_preview'), null);
});
