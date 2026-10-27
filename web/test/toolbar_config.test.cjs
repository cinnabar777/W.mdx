const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

test('bottom toolbar configuration ignores unknown and duplicate keys but restores missing built-ins', async () => {
  const {
    BOTTOM_TOOLBAR_ITEM_IDS,
    BUILT_IN_HOLDING_ITEM_IDS,
    normalizeBottomToolbarConfig
  } =
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
  assert.deepEqual(config.hidden, ['undo', 'cut', 'copy', 'paste', 'selectAll']);
  assert.equal(config.version, 4);
  assert.deepEqual(
    [...config.order, ...config.hidden].sort(),
    [...BOTTOM_TOOLBAR_ITEM_IDS, ...BUILT_IN_HOLDING_ITEM_IDS].sort()
  );
});

test('invalid saved configuration falls back to the current toolbar order', async () => {
  const { BOTTOM_TOOLBAR_GROUP_ITEM_IDS, normalizeBottomToolbarConfig } =
    await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig('{invalid json');
  assert.deepEqual(config.order, ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu']);
  assert.deepEqual(config.hidden, []);
  assert.deepEqual(config.styles, {});
  assert.deepEqual(
    config.popupGroups,
    Object.fromEntries(
      Object.entries(BOTTOM_TOOLBAR_GROUP_ITEM_IDS).map(([group, ids]) => [
        group,
        { order: [...ids], hidden: [] }
      ])
    )
  );
});

test('popup actions can be reordered and removed from their former group into the shared holding area', async () => {
  const {
    BOTTOM_TOOLBAR_GROUP_ITEM_IDS,
    BOTTOM_TOOLBAR_POPUP_ITEM_IDS,
    BUILT_IN_HOLDING_ITEM_IDS,
    DEFAULT_BOTTOM_TOOLBAR_CONFIG,
    normalizeBottomToolbarConfig,
    OPEN_GROUP_ACTION_ID,
    orderBottomToolbarPopupItems
  } = await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig({
    popupGroups: {
      format: {
        order: ['italic', 'bold', 'italic', 'unknown'],
        hidden: ['underline', 'underline', 'unknown']
      }
    }
  });

  assert.deepEqual(config.popupGroups.format.order, ['italic', 'bold']);
  assert.deepEqual(config.popupGroups.format.hidden, []);
  assert.ok(config.holding.includes('underline'));
  assert.ok(config.holding.includes('strikethrough'));
  assert.deepEqual(
    orderBottomToolbarPopupItems(
      'format',
      BOTTOM_TOOLBAR_GROUP_ITEM_IDS.format.map(id => ({ id })),
      config.popupGroups
    ).map(item => item.id),
    ['italic', 'bold']
  );
  assert.equal(
    [...Object.values(BOTTOM_TOOLBAR_GROUP_ITEM_IDS).flat()].length,
    BOTTOM_TOOLBAR_POPUP_ITEM_IDS.length
  );
  assert.equal(new Set(BOTTOM_TOOLBAR_POPUP_ITEM_IDS).size, BOTTOM_TOOLBAR_POPUP_ITEM_IDS.length);
  assert.deepEqual(BUILT_IN_HOLDING_ITEM_IDS, ['cut', 'copy', 'paste', 'selectAll']);
  assert.deepEqual(DEFAULT_BOTTOM_TOOLBAR_CONFIG.holding, BUILT_IN_HOLDING_ITEM_IDS);
  assert.deepEqual(
    normalizeBottomToolbarConfig({
      order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu']
    }).holding,
    BUILT_IN_HOLDING_ITEM_IDS
  );

  const gestureConfig = normalizeBottomToolbarConfig({
    customKeys: {
      'custom-key-open-group': {
        title: 'Open group shortcut',
        icon: 'folder',
        actionId: 'openToolbarGroup:format'
      }
    },
    styles: {
      table: {
        gestureActions: { swipeUp: 'openToolbarGroup:format' }
      }
    }
  });
  assert.equal(gestureConfig.styles.table.gestureActions.swipeUp, OPEN_GROUP_ACTION_ID);
  assert.equal(
    gestureConfig.customKeys['custom-key-open-group'].actionId,
    undefined,
    'a standalone custom key cannot retain a group-opening action'
  );
});

test('toolbar styles retain colors for popup actions but discard unknown style targets', async () => {
  const { normalizeBottomToolbarConfig } = await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig({
    order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
    hidden: [],
    customKeys: {
      'custom-key-quick-save': {
        title: 'Quick Save',
        icon: 'saveFile',
        actionId: 'saveFile'
      }
    },
    styles: {
      mergeLeft: {
        iconColor: '#ff0000',
        backgroundColor: '#00000000',
        activeBackgroundColor: 'rgba(1, 2, 3, 0.5)'
      },
      saveAsTextPack: {
        iconColor: '#123456',
        customSvg: '<svg><path d="M0 0"/></svg>',
        preserveSvgColors: true,
        forceShowLabel: true,
        title: 'Save as Markdown Pack',
        gestureActions: {
          longPress: 'saveFile',
          swipeUp: 'bold',
          swipeDown: 'custom-key-quick-save'
        },
        gestureActionIcons: {
          swipeUp: '<svg><path d="M1 1"/></svg>',
          swipeDown: '<svg><path d="M2 2"/></svg>'
        }
      },
      inventedAction: { iconColor: '#ffffff' },
      undo: { gestureAction: 'inventedAction', title: 'Invalid target' }
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
    preserveSvgColors: true,
    forceShowLabel: true,
    title: 'Save as Markdown Pack',
    gestureActions: {
      longPress: 'saveFile',
      swipeUp: 'bold',
      swipeDown: 'custom-key-quick-save'
    },
    gestureActionIcons: {
      swipeUp: '<svg><path d="M1 1"/></svg>',
      swipeDown: '<svg><path d="M2 2"/></svg>'
    }
  });
  assert.deepEqual(config.customKeys['custom-key-quick-save'], {
    title: 'Quick Save',
    icon: 'saveFile',
    actionId: 'saveFile'
  });
  assert.equal(config.styles.inventedAction, undefined);
  assert.equal(config.styles.undo.gestureActions, undefined);
  assert.equal(config.styles.undo.title, 'Invalid target');
});

test('toolbar gesture indicators occupy directional positions and use tap fallbacks only without corner swipes', async () => {
  const { getToolbarGestureIndicatorEntries } = await import('../src/toolbarGestures.js');
  assert.deepEqual(
    getToolbarGestureIndicatorEntries({
      gestureActions: {
        longPress: 'saveFile',
        tap2: 'bold',
        tap3: 'italic',
        swipeUp: 'code',
        swipeLeft: 'heading2'
      }
    }),
    [
      { id: 'longPress', actionId: 'saveFile', position: 'top-left' },
      { id: 'tap2', actionId: 'bold', position: 'top-right' },
      { id: 'tap3', actionId: 'italic', position: 'bottom-right' },
      { id: 'swipeUp', actionId: 'code', position: 'top' },
      { id: 'swipeLeft', actionId: 'heading2', position: 'left' }
    ]
  );
  assert.deepEqual(
    getToolbarGestureIndicatorEntries({
      gestureActions: {
        longPress: 'saveFile',
        tap2: 'bold',
        swipeDownRight: 'italic'
      }
    }),
    [{ id: 'swipeDownRight', actionId: 'italic', position: 'bottom-right' }]
  );
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

test('groups can contain other toolbar keys while normalization removes cyclic or duplicate placement', async () => {
  const { normalizeBottomToolbarConfig } = await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig({
    version: 3,
    order: ['undo', 'menu', 'heading', 'lists', 'format', 'table', 'insert'],
    hidden: [],
    holding: [],
    customGroups: {
      'custom-group-alpha': { title: 'Alpha', icon: 'folder' },
      'custom-group-beta': { title: 'Beta', icon: 'folder' }
    },
    popupGroups: {
      'custom-group-alpha': {
        order: ['table', 'custom-group-beta'],
        hidden: []
      },
      'custom-group-beta': {
        order: ['custom-group-alpha'],
        hidden: []
      }
    },
    styles: {}
  });

  assert.deepEqual(config.popupGroups['custom-group-alpha'].order, [
    'table', 'custom-group-beta'
  ]);
  assert.deepEqual(config.popupGroups['custom-group-beta'].order, []);
  assert.ok(config.order.includes('custom-group-alpha'));
  assert.ok(!config.order.includes('table'));
  assert.ok(!config.holding.includes('custom-group-beta'));
  assert.equal(
    Object.values(config.popupGroups).flatMap(group => group.order)
      .filter(id => id === 'table').length,
    1,
    'a key has only one folder location'
  );
});

test('runtime renderer creates the configured order with stable accessible key identifiers', async () => {
  const { renderBottomToolbarKeys, sanitizeToolbarSvg } =
    await import('../src/toolbarRenderer.js');
  const dom = new JSDOM('<div id="toolbar"></div>');
  const toolbar = dom.window.document.querySelector('#toolbar');
  const buttons = renderBottomToolbarKeys(toolbar, {
    version: 1,
    order: ['menu', 'undo'],
    hidden: ['heading', 'lists', 'format', 'table', 'insert'],
    styles: {
      undo: {
        forceShowLabel: true,
        gestureActions: { swipeLeft: 'bold', swipeUpRight: 'heading2' }
      }
    }
  }, {
    menu: '<svg data-icon="menu"></svg>',
    undo: '<svg data-icon="undo"></svg>'
  }, {
    resolveGestureActionIcon: (_actionId, _customSvg, _keyId, gestureId) =>
      `<svg data-gesture="${gestureId}"></svg>`
  });

  assert.deepEqual(buttons.map(button => button.dataset.toolbarKey), ['menu', 'undo']);
  assert.deepEqual(
    [...toolbar.querySelectorAll('button')].map(button => button.id),
    ['grp-btn-menu', 'grp-btn-undo']
  );
  assert.equal(toolbar.querySelector('#grp-btn-menu').getAttribute('aria-label'), 'Menu');
  assert.equal(toolbar.querySelector('#grp-btn-undo svg').dataset.icon, 'undo');
  const undo = toolbar.querySelector('#grp-btn-undo');
  assert.equal(undo.classList.contains('toolbar-key-force-label'), true);
  assert.deepEqual(
    [...undo.querySelectorAll('.toolbar-key-gesture-indicator')]
      .map(marker => marker.dataset.gesturePosition),
    ['left', 'top-right']
  );
});

test('runtime toolbar dispatches all eight swipe directions from a key', async () => {
  const { renderBottomToolbarKeys } = await import('../src/toolbarRenderer.js');
  const { TOOLBAR_SWIPE_GESTURE_IDS } = await import('../src/toolbarGestures.js');
  const dom = new JSDOM('<div id="toolbar"></div>');
  const toolbar = dom.window.document.querySelector('#toolbar');
  const directions = {
    swipeUp: [0, -60],
    swipeDown: [0, 60],
    swipeLeft: [-60, 0],
    swipeRight: [60, 0],
    swipeUpLeft: [-50, -50],
    swipeUpRight: [50, -50],
    swipeDownLeft: [-50, 50],
    swipeDownRight: [50, 50]
  };
  const dispatched = [];
  const [button] = renderBottomToolbarKeys(toolbar, {
    order: ['undo'],
    styles: {
      undo: {
        gestureActions: Object.fromEntries(
          TOOLBAR_SWIPE_GESTURE_IDS.map(id => [id, 'bold'])
        )
      }
    }
  }, { undo: '<svg></svg>' }, {
    onGesture: (_keyId, gestureId) => {
      dispatched.push(gestureId);
      return true;
    }
  });
  assert.equal(button.classList.contains('has-toolbar-swipe-action'), true);

  for (const gestureId of TOOLBAR_SWIPE_GESTURE_IDS) {
    const [deltaX, deltaY] = directions[gestureId];
    for (const [type, x, y] of [
      ['pointerdown', 100, 100],
      ['pointerup', 100 + deltaX, 100 + deltaY]
    ]) {
      const event = new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      button.dispatchEvent(event);
    }
  }

  assert.deepEqual(dispatched, TOOLBAR_SWIPE_GESTURE_IDS);
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

test('outline icons keep a no-fill shape when prepared for toolbar tinting', async () => {
  const { sanitizeToolbarSvg } =
    await import('../src/toolbarRenderer.js');
  const dom = new JSDOM('');
  const sanitized = sanitizeToolbarSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#222"><path d="M2 2L22 22"/></svg>',
    false,
    dom.window.document
  );

  assert.match(sanitized, /fill="none"/);
  assert.match(sanitized, /stroke="currentColor"/);
  assert.doesNotMatch(sanitized, /<path[^>]*fill="currentColor"/);

  const styleBasedNone = sanitizeToolbarSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" style="fill:none;stroke:#222"><path d="M2 2L22 22"/></svg>',
    false,
    dom.window.document
  );
  assert.match(styleBasedNone, /fill="none"/);
  assert.match(styleBasedNone, /stroke="currentColor"/);

  const inferredOutline = sanitizeToolbarSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="#222" d="M2 2L22 22"/></svg>',
    false,
    dom.window.document
  );
  assert.match(inferredOutline, /fill="none"/);
  assert.match(inferredOutline, /stroke="currentColor"/);
});

test('custom multicolor icons retain authored colors only when explicitly requested', async () => {
  const { sanitizeToolbarSvg } =
    await import('../src/toolbarRenderer.js');
  const dom = new JSDOM('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ff0000" d="M0 0"/></svg>';

  assert.match(sanitizeToolbarSvg(svg, true, dom.window.document), /fill="#ff0000"/);
  assert.match(sanitizeToolbarSvg(svg, false, dom.window.document), /fill="currentColor"/);
  assert.doesNotMatch(
    sanitizeToolbarSvg(svg, false, dom.window.document),
    /stroke=/,
    'tinting a filled SVG must not add a stroke that makes it look heavier'
  );
});
