import { WidgetType } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { TableModel } from './tableModule.js';
import { TABLE_ACTIONS } from './tableActions.js';

export const tableHeightEstimatesChanged = StateEffect.define();

const tableHeightCache = new Map();
const tableResizeObserverState = new WeakMap();
const tableCellSelectors = new WeakMap();
const tableCellSelections = new WeakMap();

const TABLE_HEIGHT_STYLE_PROPERTIES = [
  '--table-cell-padding',
  '--table-border-width',
  '--table-border-style',
  '--table-header-font-weight'
];

function activeEditorContent() {
  return document.querySelector('.cm-editor > .cm-scroller > .cm-content');
}

function tableHeightCacheKey(markdown, contentElement) {
  if (!contentElement) return null;
  const style = getComputedStyle(contentElement);
  const width = contentElement.getBoundingClientRect().width;
  const signature = [
    ...TABLE_HEIGHT_STYLE_PROPERTIES.map(
      property => `${property}:${style.getPropertyValue(property).trim()}`
    ),
    `font:${style.font}`,
    `line-height:${style.lineHeight}`
  ].join(';');
  return `${Math.round(width)}|${signature}|${markdown}`;
}

function cachedTableHeight(markdown, contentElement = activeEditorContent()) {
  const key = tableHeightCacheKey(markdown, contentElement);
  return key ? (tableHeightCache.get(key) ?? null) : null;
}

function selectionsForView(view) {
  let selections = tableCellSelections.get(view);
  if (!selections) {
    selections = new Map();
    tableCellSelections.set(view, selections);
  }
  return selections;
}

function tableActionBridge() {
  if (typeof window === 'undefined') return null;
  if (!window.wmdxTableActions) {
    window.wmdxTableActions = {
      context: null,
      active: null,
      isEnabled(actionId) {
        return Boolean(this.context?.isEnabled(actionId));
      },
      run(actionId) {
        return this.context?.run(actionId) ?? false;
      }
    };
  }
  return window.wmdxTableActions;
}

function measuredOuterHeight(element) {
  const style = getComputedStyle(element);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  return Math.ceil(element.getBoundingClientRect().height + marginTop + marginBottom);
}

function estimateAvailableWidth() {
  if (typeof window !== 'undefined' && window.innerWidth) {
    return Math.max(280, window.innerWidth - 32);
  }
  return 360;
}

function estimateTableHeight(model, availableWidth = 360) {
  if (!model) return 60;
  const rowCount = model.getRowCount();
  const colCount = model.getColCount();
  const matrix = model.getRenderMatrix();

  let estimatedTotal = 24 + 32; // container margins + toolbar
  const colWidth = Math.max(60, Math.floor(availableWidth / Math.max(1, colCount)));

  for (let r = 0; r < rowCount; r++) {
    let maxLinesInRow = 1;
    for (let c = 0; c < colCount; c++) {
      const cell = matrix[r]?.[c];
      if (!cell || cell.isCovered) continue;
      const contentLen = cell.content ? cell.content.length : 0;
      const charsPerLine = Math.max(4, Math.floor(colWidth / 9));
      const cellLines = Math.max(1, Math.ceil(contentLen / charsPerLine));
      if (cellLines > maxLinesInRow) maxLinesInRow = cellLines;
    }
    const padding = 16;
    const lineHeight = 20;
    estimatedTotal += (maxLinesInRow * lineHeight) + padding + 2;
  }

  return Math.max(50, Math.round(estimatedTotal));
}

export class WordProcessorTableWidget extends WidgetType {
  constructor(tableMarkdown, from, to) {
    super();
    this.tableMarkdown = tableMarkdown;
    this.from = from;
    this.to = to;
    this.model = TableModel.parse(tableMarkdown);
    const content = activeEditorContent();
    this.heightEstimate =
      cachedTableHeight(this.tableMarkdown, content) ??
      estimateTableHeight(
        this.model,
        content?.getBoundingClientRect().width || estimateAvailableWidth()
      );
  }

  get estimatedHeight() {
    return this.heightEstimate;
  }

  eq(other) {
    return (
      other instanceof WordProcessorTableWidget &&
      other.tableMarkdown === this.tableMarkdown &&
      other.from === this.from &&
      other.to === this.to &&
      other.heightEstimate === this.heightEstimate
    );
  }

  ignoreEvent(event) {
    // Allow pointer/click events inside widget for cell selection & editing
    return true;
  }

  toDOM(view, options = {}) {
    const measurementOnly = options.measurementOnly === true;
    const container = document.createElement('div');
    container.className = 'cm-wp-table-container';
    container.dataset.tableFrom = String(this.from);
    container.style.cssText = 'position: relative; margin: 12px 0; overflow-x: auto; max-width: 100%; border-radius: 6px; box-sizing: border-box; overflow-anchor: none;';

    if (!this.model) {
      container.textContent = this.tableMarkdown;
      return container;
    }

    const matrix = this.model.getRenderMatrix();
    const rowCount = this.model.getRowCount();
    const colCount = this.model.getColCount();
    const selections = view ? selectionsForView(view) : null;

    let selectedRange = selections?.get(this.from) || null; // { startR, startC, endR, endC }
    if (
      selectedRange &&
      (selectedRange.startR >= rowCount ||
        selectedRange.startC >= colCount ||
        selectedRange.endR >= rowCount ||
        selectedRange.endC >= colCount)
    ) {
      selectedRange = null;
      selections?.delete(this.from);
    }
    let activeCell = selectedRange
      ? { r: selectedRange.endR, c: selectedRange.endC }
      : null;
    const bridge = tableActionBridge();
    if (bridge?.active?.view === view && bridge.active.from === this.from) {
      activeCell = { r: bridge.active.r, c: bridge.active.c };
    }
    let activeOverlay = null;

    const toolbar = document.createElement('div');
    toolbar.className = 'cm-wp-table-toolbar';
    toolbar.style.cssText = 'display: flex; gap: 6px; margin-bottom: 8px; font-size: 12px; z-index: 10; user-select: none; flex-wrap: wrap;';

    const btnStyle = 'padding: 4px 10px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;';

    const btnMerge = document.createElement('button');
    btnMerge.textContent = 'Merge Cells';
    btnMerge.style.cssText = btnStyle;
    btnMerge.style.display = 'none';

    const btnSplit = document.createElement('button');
    btnSplit.textContent = 'Split Cell';
    btnSplit.style.cssText = btnStyle;
    btnSplit.style.display = 'none';

    toolbar.appendChild(btnMerge);
    toolbar.appendChild(btnSplit);
    container.appendChild(toolbar);

    const borderCss = 'var(--table-border-width, 1px) var(--table-border-style, solid) var(--table-border-color, #444)';

    const table = document.createElement('table');
    table.className = 'cm-wp-table';
    table.style.cssText = `width: max-content; min-width: 100%; border-collapse: collapse; table-layout: auto; color: var(--table-cell-color, var(--body-text-color, var(--text-color, #fff))); font-family: var(--table-font-family, var(--body-font-family, inherit)); font-size: var(--table-font-size, 15px); font-weight: var(--table-font-weight, 400); letter-spacing: var(--table-letter-spacing, 0px); line-height: var(--table-line-height, 1.6); hyphens: var(--table-hyphens, none); border: ${borderCss};`;

    const renderTableCells = () => {
      table.innerHTML = '';
      const currentMatrix = this.model.getRenderMatrix();
      const currentRowCount = this.model.getRowCount();
      const currentColCount = this.model.getColCount();

      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');

      for (let c = 0; c < currentColCount; c++) {
        const cellData = currentMatrix[0][c];
        if (cellData.isCovered) continue;

        const th = document.createElement('th');
        th.style.cssText = `border: ${borderCss}; padding: var(--table-cell-padding, 8px); background: var(--table-header-bg, rgba(255,255,255,0.12)); color: var(--table-header-color, var(--text-color, #fff)); font-weight: var(--table-header-font-weight, 700); text-align: ${this.model.alignments[c] || 'left'}; position: relative; cursor: pointer;`;
        if (cellData.colSpan > 1) th.colSpan = cellData.colSpan;
        if (cellData.rowSpan > 1) th.rowSpan = cellData.rowSpan;
        th.dataset.row = '0';
        th.dataset.col = String(c);
        th.innerHTML = renderMarkdownInline(cellData.content);

        if (!measurementOnly) attachCellEvents(th, 0, c);
        trHead.appendChild(th);
      }
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let r = 1; r < currentRowCount; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < currentColCount; c++) {
          const cellData = currentMatrix[r][c];
          if (cellData.isCovered) continue;

          const td = document.createElement('td');
          td.style.cssText = `border: ${borderCss}; padding: var(--table-cell-padding, 8px); background: var(--table-cell-bg, transparent); color: var(--table-cell-color, var(--text-color, #fff)); text-align: ${this.model.alignments[c] || 'left'}; position: relative; cursor: pointer;`;
          if (cellData.colSpan > 1) td.colSpan = cellData.colSpan;
          if (cellData.rowSpan > 1) td.rowSpan = cellData.rowSpan;
          td.dataset.row = String(r);
          td.dataset.col = String(c);
          td.innerHTML = renderMarkdownInline(cellData.content);

          if (!measurementOnly) attachCellEvents(td, r, c);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      updateSelectionHighlight();
    };

    const commitTableChange = () => {
      const newMarkdown = this.model.toMarkdown();
      if (newMarkdown !== this.tableMarkdown) {
        try {
          const range = getLiveRange(view, container, this.from, this.to);
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: newMarkdown }
          });
        } catch (e) {
          console.error('Failed to commit table change:', e);
        }
      }
    };

    if (!measurementOnly) {
      this.commitModel = (targetView, newModel) => {
        const v = targetView || view;
        if (newModel) this.model = newModel;
        const newMarkdown = this.model.toMarkdown();
        try {
          const liveContainer = v.dom.querySelector(`.cm-wp-table-container[data-table-from="${this.from}"]`) || container;
          const range = getLiveRange(v, liveContainer, this.from, this.to);
          v.dispatch({
            changes: { from: range.from, to: range.to, insert: newMarkdown }
          });
        } catch (e) {
          console.error('Failed to commit model change:', e);
        }
      };
    }

    const runTableAction = (mutate) => {
      const scroller = view.scrollDOM;
      const scrollerRect = scroller.getBoundingClientRect();
      const originalTableTop = container.getBoundingClientRect().top - scrollerRect.top;
      const saved = {
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft,
        windowX: window.scrollX,
        windowY: window.scrollY
      };

      mutate();
      renderTableCells();
      commitTableChange();

      // Wait for CodeMirror to rebuild and measure the replacement block widget.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (window.scrollX !== saved.windowX || window.scrollY !== saved.windowY) {
          window.scrollTo(saved.windowX, saved.windowY);
        }

        const selector = '.cm-wp-table-container[data-table-from="' + this.from + '"]';
        const liveContainer = view.dom.querySelector(selector);
        if (!liveContainer) {
          scroller.scrollTop = saved.scrollTop;
          scroller.scrollLeft = saved.scrollLeft;
          return;
        }

        const liveScrollerRect = scroller.getBoundingClientRect();
        const liveTableTop = liveContainer.getBoundingClientRect().top - liveScrollerRect.top;
        // Correct browser/CodeMirror scroll shift so this table remains at the
        // same vertical screen position it had when the action started.
        scroller.scrollTop = Math.max(0, scroller.scrollTop + liveTableTop - originalTableTop);
        scroller.scrollLeft = saved.scrollLeft;
      }));
    };

    const isContextActionEnabled = (actionId, r = activeCell?.r, c = activeCell?.c) => {
      if (r == null || c == null) return false;
      const currentRowCount = this.model.getRowCount();
      const currentColCount = this.model.getColCount();
      const currentMatrix = this.model.getRenderMatrix();
      const cell = currentMatrix[r]?.[c];
      if (!cell || cell.isCovered) return false;
      if (actionId === 'insertRowBelow' || actionId === 'insertColumnRight') return true;
      if (actionId === 'deleteRow') return currentRowCount > 1;
      if (actionId === 'deleteColumn') return currentColCount > 1;
      if (actionId === 'mergeLeft') return c > 0 && !currentMatrix[r]?.[c - 1]?.isCovered;
      if (actionId === 'mergeRight') return c < currentColCount - 1 && !currentMatrix[r]?.[c + 1]?.isCovered;
      if (actionId === 'mergeUp') return r > 0 && !currentMatrix[r - 1]?.[c]?.isCovered;
      if (actionId === 'mergeDown') return r < currentRowCount - 1 && !currentMatrix[r + 1]?.[c]?.isCovered;
      if (actionId === 'splitCell') return cell.colSpan > 1 || cell.rowSpan > 1;
      return false;
    };

    const runContextAction = (actionId, r = activeCell?.r, c = activeCell?.c) => {
      if (!isContextActionEnabled(actionId, r, c)) return false;
      const actions = {
        insertRowBelow: () => this.model.insertRow(r + 1),
        insertColumnRight: () => this.model.insertCol(c + 1),
        deleteRow: () => this.model.deleteRow(r),
        deleteColumn: () => this.model.deleteCol(c),
        mergeLeft: () => this.model.mergeDirection(r, c, 'left'),
        mergeRight: () => this.model.mergeDirection(r, c, 'right'),
        mergeUp: () => this.model.mergeDirection(r, c, 'up'),
        mergeDown: () => this.model.mergeDirection(r, c, 'down'),
        splitCell: () => this.model.splitCell(r, c)
      };
      const action = actions[actionId];
      if (!action) return false;
      runTableAction(action);
      return true;
    };

    const publishActiveCell = () => {
      const bridge = tableActionBridge();
      const active = bridge?.active;
      if (!bridge || !activeCell || active?.view !== view || active.from !== this.from) return;
      bridge.context = {
        owner: container,
        isEnabled: actionId => isContextActionEnabled(actionId, active.r, active.c),
        run: actionId => runContextAction(actionId, active.r, active.c)
      };
      window.dispatchEvent(new Event('wmdx-table-context-change'));
    };

    let longPressTimer = null;
    let longPressTriggered = false;

    const handoffToCell = (row, col, editor = activeOverlay) => {
      if (!editor) return false;
      const current = editor._cellMeta;
      if (current?.row === row && current?.col === col) return false;

      clearTimeout(longPressTimer);
      editor._commitAndClose?.();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const liveContainer = view.dom.querySelector(
          `.cm-wp-table-container[data-table-from="${this.from}"]`
        );
        const targetCell = liveContainer?.querySelector(
          `[data-row="${row}"][data-col="${col}"]`
        );
        tableCellSelectors.get(targetCell)?.();
      }));
      return true;
    };

    const attachCellEvents = (cellEl, r, c) => {
      tableCellSelectors.set(cellEl, () => selectCell(r, c));

      const startLongPress = (e) => {
        e.stopPropagation();
        clearTimeout(longPressTimer);

        if (activeOverlay) {
          const current = activeOverlay._cellMeta;
          if (current?.row === r && current?.col === c) return;
          e.preventDefault();
          handoffToCell(r, c);
          return;
        }

        longPressTriggered = false;
        const startX = e.clientX || (e.touches && e.touches[0].clientX);
        const startY = e.clientY || (e.touches && e.touches[0].clientY);

        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          selectCell(r, c);
          showContextMenu(cellEl, r, c, { x: startX, y: startY });
        }, 500);

        const removeListeners = () => {
          window.removeEventListener('pointermove', cancelLongPress);
          window.removeEventListener('pointerup', cancelLongPress);
          window.removeEventListener('pointercancel', cancelLongPress);
        };

        const cancelLongPress = (moveEvent) => {
          if (moveEvent.type === 'pointermove' || moveEvent.type === 'touchmove') {
            const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
            const currentY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
            if (Math.hypot(currentX - startX, currentY - startY) > 10) {
              clearTimeout(longPressTimer);
              removeListeners();
            }
          } else {
            clearTimeout(longPressTimer);
            removeListeners();
          }
        };

        window.addEventListener('pointermove', cancelLongPress, { passive: true });
        window.addEventListener('pointerup', cancelLongPress, { once: true });
        window.addEventListener('pointercancel', cancelLongPress, { once: true });
      };

      cellEl.addEventListener('pointerdown', startLongPress, true);

      cellEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!cellEl.isConnected) return;
        if (longPressTriggered) {
          longPressTriggered = false;
          e.preventDefault();
          return;
        }
        clearTimeout(longPressTimer);
        const active = tableActionBridge()?.active;
        if (activeOverlay) {
          if (handoffToCell(r, c)) e.preventDefault();
        } else if (
          active?.view === view &&
          active.from === this.from &&
          active.r === r &&
          active.c === c
        ) {
          openCellEditor(cellEl, r, c);
        } else {
          selectCell(r, c);
        }
      });
    };

    const showContextMenu = (cellEl, r, c, anchor = null) => {
      let existingMenu = document.querySelector('.cm-wp-table-context-menu');
      if (existingMenu) {
        if (existingMenu._dismissHandler) {
          window.removeEventListener('pointerdown', existingMenu._dismissHandler);
        }
        existingMenu.remove();
      }

      const menu = document.createElement('div');
      menu.className = 'cm-wp-table-context-menu';
      menu.setAttribute('role', 'toolbar');
      menu.setAttribute('aria-label', 'Table actions');
      menu.style.cssText = 'position: fixed; z-index: 10009;';

      let dismissHandler = null;
      const closeMenu = () => {
        if (dismissHandler) window.removeEventListener('pointerdown', dismissHandler);
        menu.remove();
        if (container._tableContextMenu === menu) {
          container._tableContextMenu = null;
        }
      };

      TABLE_ACTIONS.forEach(({ id, title, icon }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cm-wp-table-action';
        btn.dataset.action = id;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.innerHTML = icon;
        btn.disabled = !isContextActionEnabled(id, r, c);
        btn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          if (btn.disabled) return;
          closeMenu();
          runContextAction(id, r, c);
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);

      const cellRect = cellEl.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      menu.style.maxWidth = `${Math.max(0, viewportWidth - 16)}px`;
      const menuHeight = menu.offsetHeight || 48;
      const menuWidth = menu.offsetWidth || Math.min(viewportWidth - 16, 386);
      const pointX = Number.isFinite(anchor?.x) ? anchor.x : cellRect.left;
      const pointY = Number.isFinite(anchor?.y) ? anchor.y : cellRect.bottom;
      const minLeft = viewportLeft + 8;
      const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - menuWidth - 8);
      const left = Math.max(minLeft, Math.min(pointX - 20, maxLeft));
      const minTop = viewportTop + 8;
      const maxTop = Math.max(minTop, viewportTop + viewportHeight - menuHeight - 8);
      let top = pointY - menuHeight - 10;
      if (top < minTop) top = pointY + 10;

      menu.style.top = `${Math.max(minTop, Math.min(top, maxTop))}px`;
      menu.style.left = `${left}px`;
      dismissHandler = event => {
        if (!menu.contains(event.target)) closeMenu();
      };
      menu._dismissHandler = dismissHandler;
      container._tableContextMenu = menu;
      window.addEventListener('pointerdown', dismissHandler);
    };

    const selectCell = (r, c) => {
      activeCell = { r, c };
      selectedRange = { startR: r, startC: c, endR: r, endC: c };
      selections?.set(this.from, selectedRange);
      const bridge = tableActionBridge();
      if (bridge) bridge.active = { view, from: this.from, r, c };
      publishActiveCell();
      updateSelectionHighlight();
    };

    const updateSelectionHighlight = () => {
      table.querySelectorAll('th, td').forEach(el => {
        el.style.outline = 'none';
        el.style.backgroundColor = '';
      });

      const bridge = tableActionBridge();
      const isActiveTable =
        bridge?.active?.view === view &&
        bridge.active.from === this.from;
      if (!selectedRange || !isActiveTable) {
        btnMerge.style.display = 'none';
        btnSplit.style.display = 'none';
        return;
      }

      const { startR, startC, endR, endC } = selectedRange;
      const minR = Math.min(startR, endR);
      const maxR = Math.max(startR, endR);
      const minC = Math.min(startC, endC);
      const maxC = Math.max(startC, endC);

      const isMultiCell = (minR !== maxR || minC !== maxC);
      btnMerge.style.display = isMultiCell ? 'inline-flex' : 'none';

      const primaryCell = this.model.getRenderMatrix()[minR][minC];
      const isSplitable = !isMultiCell && (primaryCell.colSpan > 1 || primaryCell.rowSpan > 1);
      btnSplit.style.display = isSplitable ? 'inline-flex' : 'none';

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const el = table.querySelector(`[data-row="${r}"][data-col="${c}"]`);
          if (el) {
            el.style.outline = '2px solid #0078d4';
            el.style.backgroundColor = 'rgba(0, 120, 212, 0.2)';
          }
        }
      }
    };

    const refreshSelectionHighlight = () => updateSelectionHighlight();
    const clearActiveSelectionOutsideTables = event => {
      const target = event.target?.nodeType === 1
        ? event.target
        : event.target?.parentElement;
      if (
        !target ||
        !view?.dom?.contains(target) ||
        !target.closest?.('.cm-content') ||
        target.closest('.cm-wp-table-container')
      ) {
        return;
      }
      const bridge = tableActionBridge();
      if (bridge?.active?.view !== view) return;
      bridge.active = null;
      bridge.context = null;
      window.dispatchEvent(new Event('wmdx-table-context-change'));
    };
    if (!measurementOnly && view) {
      window.addEventListener('wmdx-table-context-change', refreshSelectionHighlight);
      document.addEventListener('pointerdown', clearActiveSelectionOutsideTables, true);
      container._tableContextChangeHandler = refreshSelectionHighlight;
      container._clearActiveSelectionHandler = clearActiveSelectionOutsideTables;
    }

    const openCellEditor = (cellEl, r, c) => {
      if (activeOverlay) activeOverlay.remove();

      const overlayContainer = container;
      const cellRect = cellEl.getBoundingClientRect();
      const containerRect = overlayContainer.getBoundingClientRect();
      const top = cellRect.top - containerRect.top +
        overlayContainer.scrollTop - overlayContainer.clientTop;
      const left = cellRect.left - containerRect.left +
        overlayContainer.scrollLeft - overlayContainer.clientLeft;

      const overlay = document.createElement('textarea');
      overlay.className = 'cm-wp-cell-editor';
      overlay.value = (this.model.rows[r][c] || '')
        .replace(/\s*<br\s*\/?>\s*/gi, '\n');
      overlay.style.cssText = `position: absolute; top: ${top}px; left: ${left}px; width: ${cellRect.width}px; height: ${cellRect.height}px; box-sizing: border-box; font-family: inherit; font-size: 14px; padding: 6px; border: 2px solid #0078d4; background: var(--bg-color, #000); color: var(--text-color, #fff); z-index: 100; outline: none; resize: none; border-radius: 4px;`;

      let isCommitted = false;
      const commitAndClose = (nextNavigation) => {
        if (isCommitted) return;
        isCommitted = true;
        const newValue = overlay.value
          .replace(/\r\n?/g, '\n')
          .replace(/\n/g, '<br>');
        activeOverlay = null;
        overlay.remove();
        runTableAction(() => {
          this.model.rows[r][c] = newValue;
        });

        if (nextNavigation) {
          requestAnimationFrame(() => {
            const selector = '.cm-wp-table-container[data-table-from="' + this.from + '"]';
            const newContainer = view.dom.querySelector(selector) || document.querySelector('.cm-wp-table-container');
            if (newContainer) {
              const { rowDelta, colDelta } = nextNavigation;
              let targetR = r + rowDelta;
              let targetC = c + colDelta;
              if (targetC >= colCount) {
                targetC = 0;
                targetR++;
              } else if (targetC < 0) {
                targetC = colCount - 1;
                targetR--;
              }

              if (targetR >= 0 && targetR < rowCount && targetC >= 0 && targetC < colCount) {
                const targetEl = newContainer.querySelector(`[data-row="${targetR}"][data-col="${targetC}"]`);
                if (targetEl) {
                  targetEl.click();
                  targetEl.click();
                }
              }
            }
          });
        }
      };

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          // Keep Return inside the cell editor; the textarea inserts a
          // newline, which is serialized as a Markdown table <br> on commit.
          e.stopPropagation();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitAndClose({ rowDelta: 0, colDelta: e.shiftKey ? -1 : 1 });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          activeOverlay = null;
          overlay.remove();
        }
      });

      overlay._cellMeta = { widget: this, model: this.model, row: r, col: c, container };
      overlay._commitAndClose = commitAndClose;

      const updateCellSnap = () => {
        window._lastActiveCellSelection = {
          widget: this,
          model: this.model,
          row: r,
          col: c,
          selStart: overlay.selectionStart ?? 0,
          selEnd: overlay.selectionEnd ?? 0,
          cellValue: overlay.value || '',
          selectedText: (overlay.value || '').substring(overlay.selectionStart ?? 0, overlay.selectionEnd ?? 0),
          timestamp: Date.now()
        };
      };

      overlay.addEventListener('keyup', updateCellSnap);
      overlay.addEventListener('mouseup', updateCellSnap);
      overlay.addEventListener('touchend', updateCellSnap);
      overlay.addEventListener('select', updateCellSnap);
      overlay.addEventListener('blur', () => {
        updateCellSnap();
        commitAndClose();
      });

      table.parentElement.appendChild(overlay);
      overlay.focus();
      activeOverlay = overlay;
    };

    const navigateCell = (r, c, rowDelta, colDelta) => {
      let targetR = r + rowDelta;
      let targetC = c + colDelta;

      if (targetC >= colCount) {
        targetC = 0;
        targetR++;
      } else if (targetC < 0) {
        targetC = colCount - 1;
        targetR--;
      }

      if (targetR >= 0 && targetR < rowCount && targetC >= 0 && targetC < colCount) {
        while (matrix[targetR][targetC].isCovered && targetC < colCount - 1) {
          targetC++;
        }
        selectCell(targetR, targetC);
        const targetEl = table.querySelector(`[data-row="${targetR}"][data-col="${targetC}"]`);
        if (targetEl) openCellEditor(targetEl, targetR, targetC);
      }
    };

    if (!measurementOnly) {
      btnMerge.addEventListener('click', (e) => {
        e.preventDefault();
        if (!selectedRange) return;
        runTableAction(() => {
          this.model.mergeRect(selectedRange.startR, selectedRange.startC, selectedRange.endR, selectedRange.endC);
        });
      });

      btnSplit.addEventListener('click', (e) => {
        e.preventDefault();
        if (!selectedRange) return;
        runTableAction(() => {
          this.model.splitCell(selectedRange.startR, selectedRange.startC);
        });
      });
    }

    renderTableCells();
    container.appendChild(table);
    if (!measurementOnly && activeCell) publishActiveCell();

    if (!measurementOnly && typeof ResizeObserver !== 'undefined') {
      const resizeState = {
        observer: null,
        frameId: null
      };

      resizeState.observer = new ResizeObserver(() => {
        const key = tableHeightCacheKey(this.tableMarkdown, view.contentDOM);
        const observedHeight = measuredOuterHeight(container);
        const cachedHeight = key ? tableHeightCache.get(key) : null;

        if (
          !key ||
          !(observedHeight > 0) ||
          (cachedHeight != null && Math.abs(cachedHeight - observedHeight) <= 1) ||
          resizeState.frameId !== null
        ) {
          return;
        }

        resizeState.frameId = requestAnimationFrame(() => {
          resizeState.frameId = null;
          if (!container.isConnected || !view.dom.isConnected) return;

          const latestKey = tableHeightCacheKey(this.tableMarkdown, view.contentDOM);
          const latestHeight = measuredOuterHeight(container);
          const latestCachedHeight = latestKey ? tableHeightCache.get(latestKey) : null;
          if (
            !latestKey ||
            !(latestHeight > 0) ||
            (latestCachedHeight != null && Math.abs(latestCachedHeight - latestHeight) <= 1)
          ) {
            return;
          }

          tableHeightCache.set(latestKey, latestHeight);
          if (tableHeightCache.size > 100) {
            tableHeightCache.delete(tableHeightCache.keys().next().value);
          }

          view.dispatch({
            effects: [
              tableHeightEstimatesChanged.of(null),
              view.scrollSnapshot()
            ]
          });
          view.requestMeasure();
        });
      });

      tableResizeObserverState.set(container, resizeState);
      resizeState.observer.observe(container);
    }

    return container;
  }

  destroy(dom) {
    if (dom._tableContextChangeHandler) {
      window.removeEventListener('wmdx-table-context-change', dom._tableContextChangeHandler);
      dom._tableContextChangeHandler = null;
    }
    if (dom._clearActiveSelectionHandler) {
      document.removeEventListener('pointerdown', dom._clearActiveSelectionHandler, true);
      dom._clearActiveSelectionHandler = null;
    }

    const bridge = tableActionBridge();
    if (bridge?.context?.owner === dom) {
      bridge.context = null;
      window.dispatchEvent(new Event('wmdx-table-context-change'));
      const active = bridge.active;
      if (active) {
        requestAnimationFrame(() => {
          if (bridge.active === active && !bridge.context) {
            bridge.active = null;
          }
        });
      }
    }
    const contextMenu = dom._tableContextMenu;
    if (contextMenu) {
      if (contextMenu._dismissHandler) {
        window.removeEventListener('pointerdown', contextMenu._dismissHandler);
      }
      contextMenu.remove();
      dom._tableContextMenu = null;
    }

    const resizeState = tableResizeObserverState.get(dom);
    if (!resizeState) return;

    resizeState.observer.disconnect();
    if (resizeState.frameId !== null) {
      cancelAnimationFrame(resizeState.frameId);
    }
    tableResizeObserverState.delete(dom);
  }
}

export function measureTableWidgetHeight(widget, view) {
  const width = view.contentDOM.getBoundingClientRect().width;
  if (!(width > 0)) {
    throw new Error('Cannot measure table with zero editor content width');
  }

  const host = document.createElement('div');
  host.className = view.dom.className;
  host.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${view.dom.clientWidth}px;` +
    'height:auto;max-height:none;overflow:visible;visibility:hidden;' +
    'pointer-events:none;z-index:-1;';
  const scroller = document.createElement('div');
  scroller.className = view.scrollDOM.className;
  scroller.style.cssText = 'height:auto;max-height:none;overflow:visible;';
  const content = document.createElement('div');
  content.className = view.contentDOM.className;
  content.style.width = `${width}px`;
  content.style.height = 'auto';
  content.style.minHeight = '0';
  scroller.appendChild(content);
  host.appendChild(scroller);
  view.dom.appendChild(host);

  try {
    const tableDOM = widget.toDOM(view, { measurementOnly: true });
    content.appendChild(tableDOM);
    const height = measuredOuterHeight(tableDOM);
    if (!(height > 0)) {
      throw new Error('Measured table height is not positive');
    }
    const key = tableHeightCacheKey(widget.tableMarkdown, view.contentDOM);
    if (!key) throw new Error('Cannot build table height cache key');
    tableHeightCache.set(key, height);
    if (tableHeightCache.size > 100) {
      tableHeightCache.delete(tableHeightCache.keys().next().value);
    }
    return height;
  } finally {
    host.remove();
  }
}

function renderMarkdownInline(text, searchQuery, isSelectedCell) {
  if (!text) return '';
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/&lt;br&gt;/gi, '<br>');
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

  if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim().length > 0) {
    try {
      const cls = isSelectedCell ? 'cm-searchMatch cm-searchMatch-selected' : 'cm-searchMatch';
      const safeQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`(${safeQuery})`, 'gi');
      escaped = escaped.replace(reg, `<mark class="${cls}">$1</mark>`);
    } catch (e) {}
  }

  return escaped;
}

function getLiveRange(view, container, fallbackFrom, fallbackTo) {
  try {
    const pos = view.posAtDOM(container);
    const line = view.state.doc.lineAt(pos);
    let startL = line.number;
    let endL = line.number;
    while (startL > 1 && view.state.doc.line(startL - 1).text.trim().startsWith('|')) {
      startL--;
    }
    while (endL < view.state.doc.lines && view.state.doc.line(endL + 1).text.trim().startsWith('|')) {
      endL++;
    }
    return {
      from: view.state.doc.line(startL).from,
      to: view.state.doc.line(endL).to
    };
  } catch (e) {
    return { from: fallbackFrom, to: fallbackTo };
  }
}
