const test = require('node:test');
const assert = require('node:assert/strict');

const { separateTableMenuFromFloatingToolbar } = require('../src/toolbarOverlap.js');

function element(rect, { visible = false, top = `${rect.top}px` } = {}) {
  return {
    classList: { contains: name => name === 'is-visible' && visible },
    style: { top },
    getBoundingClientRect: () => rect
  };
}

test('table action menu moves clear of the floating toolbar without hiding either', () => {
  const floatingToolbar = element(
    { left: 50, right: 250, top: 120, bottom: 180, width: 200, height: 60 },
    { visible: true }
  );
  const tableMenu = element(
    { left: 40, right: 300, top: 140, bottom: 190, width: 260, height: 50 },
    { top: '140px' }
  );
  const documentRef = {
    querySelector(selector) {
      if (selector === '#floating-selection-toolbar') return floatingToolbar;
      if (selector === '.cm-wp-table-context-menu') return tableMenu;
      return null;
    }
  };
  const windowRef = { visualViewport: { offsetTop: 0, height: 400 }, innerHeight: 400 };

  assert.equal(separateTableMenuFromFloatingToolbar(documentRef, windowRef), true);
  const menuTop = Number.parseFloat(tableMenu.style.top);
  assert.ok(
    menuTop + 50 <= 120 || menuTop >= 180,
    'the table action menu is positioned above or below the floating toolbar'
  );
});

test('table action menu stays put when it does not overlap the floating toolbar', () => {
  const floatingToolbar = element(
    { left: 50, right: 250, top: 120, bottom: 180, width: 200, height: 60 },
    { visible: true }
  );
  const tableMenu = element(
    { left: 40, right: 300, top: 220, bottom: 270, width: 260, height: 50 },
    { top: '220px' }
  );
  const documentRef = {
    querySelector(selector) {
      if (selector === '#floating-selection-toolbar') return floatingToolbar;
      if (selector === '.cm-wp-table-context-menu') return tableMenu;
      return null;
    }
  };

  assert.equal(
    separateTableMenuFromFloatingToolbar(documentRef, { innerHeight: 400 }),
    false
  );
  assert.equal(tableMenu.style.top, '220px');
});
