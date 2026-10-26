const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

test('bottom toolbar configuration ignores unknown and duplicate keys but restores missing built-ins', async () => {
  const { BOTTOM_TOOLBAR_ITEM_IDS, normalizeBottomToolbarConfig } =
    await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig({
    version: 999,
    order: ['table', 'menu', 'table', 'not-a-key'],
    hidden: ['undo', 'undo', 'not-a-key']
  });

  assert.deepEqual(config.order, [
    'table',
    'menu',
    'heading',
    'lists',
    'format',
    'insert'
  ]);
  assert.deepEqual(config.hidden, ['undo']);
  assert.equal(config.version, 1);
  assert.deepEqual([...config.order, ...config.hidden].sort(), [...BOTTOM_TOOLBAR_ITEM_IDS].sort());
});

test('invalid saved configuration falls back to the current toolbar order', async () => {
  const { normalizeBottomToolbarConfig } =
    await import('../src/toolbarConfig.js');
  assert.deepEqual(
    normalizeBottomToolbarConfig('{invalid json'),
    {
      version: 1,
      order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
      hidden: [],
      styles: {}
    }
  );
});

test('toolbar styles retain colors for popup actions but discard unknown style targets', async () => {
  const { normalizeBottomToolbarConfig } = await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig({
    order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
    hidden: [],
    styles: {
      mergeLeft: {
        iconColor: '#ff0000',
        backgroundColor: '#00000000',
        activeBackgroundColor: 'rgba(1, 2, 3, 0.5)'
      },
      saveAsTextPack: {
        iconColor: '#123456',
        customSvg: '<svg><path d="M0 0"/></svg>',
        preserveSvgColors: true
      },
      inventedAction: { iconColor: '#ffffff' }
    }
  });

  assert.deepEqual(config.styles.mergeLeft, {
    iconColor: '#ff0000',
    backgroundColor: '#00000000',
    activeBackgroundColor: 'rgba(1, 2, 3, 0.5)'
  });
  assert.deepEqual(config.styles.saveAsTextPack, {
    iconColor: '#123456',
    customSvg: '<svg><path d="M0 0"/></svg>',
    preserveSvgColors: true
  });
  assert.equal(config.styles.inventedAction, undefined);
});

test('toolbar config always leaves the Menu key available when every key is hidden', async () => {
  const { BOTTOM_TOOLBAR_ITEM_IDS, normalizeBottomToolbarConfig } =
    await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig({
    version: 1,
    order: [],
    hidden: [...BOTTOM_TOOLBAR_ITEM_IDS]
  });

  assert.deepEqual(config.order, ['menu']);
  assert.equal(config.hidden.includes('menu'), false);
});

test('runtime renderer creates the configured order with stable accessible key identifiers', async () => {
  const { renderBottomToolbarKeys, sanitizeToolbarSvg } =
    await import('../src/toolbarRenderer.js');
  const dom = new JSDOM('<div id="toolbar"></div>');
  const toolbar = dom.window.document.querySelector('#toolbar');
  const buttons = renderBottomToolbarKeys(toolbar, {
    version: 1,
    order: ['menu', 'undo'],
    hidden: ['heading', 'lists', 'format', 'table', 'insert']
  }, {
    menu: '<svg data-icon="menu"></svg>',
    undo: '<svg data-icon="undo"></svg>'
  });

  assert.deepEqual(buttons.map(button => button.dataset.toolbarKey), ['menu', 'undo']);
  assert.deepEqual(
    [...toolbar.querySelectorAll('button')].map(button => button.id),
    ['grp-btn-menu', 'grp-btn-undo']
  );
  assert.equal(toolbar.querySelector('#grp-btn-menu').getAttribute('aria-label'), 'Menu');
  assert.equal(toolbar.querySelector('#grp-btn-undo svg').dataset.icon, 'undo');
});

test('custom icons are made tintable by default and unsafe SVG content is stripped', async () => {
  const { sanitizeToolbarSvg } =
    await import('../src/toolbarRenderer.js');
  const dom = new JSDOM('');
  const sanitized = sanitizeToolbarSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><path fill="#ff0000" stroke="#00ff00" d="M0 0"/></svg>',
    false,
    dom.window.document
  );

  assert.doesNotMatch(sanitized, /script|onload|#ff0000|#00ff00/i);
  assert.match(sanitized, /fill="currentColor"/);
  assert.match(sanitized, /stroke="currentColor"/);
});

test('custom multicolor icons retain authored colors only when explicitly requested', async () => {
  const { sanitizeToolbarSvg } =
    await import('../src/toolbarRenderer.js');
  const dom = new JSDOM('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ff0000" d="M0 0"/></svg>';

  assert.match(sanitizeToolbarSvg(svg, true, dom.window.document), /fill="#ff0000"/);
  assert.match(sanitizeToolbarSvg(svg, false, dom.window.document), /fill="currentColor"/);
});
