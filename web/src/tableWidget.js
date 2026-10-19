import { WidgetType } from '@codemirror/view';
import { TableModel } from './tableModule.js';

export class WordProcessorTableWidget extends WidgetType {
  constructor(tableMarkdown, from, to) {
    super();
    this.tableMarkdown = tableMarkdown;
    this.from = from;
    this.to = to;
    this.model = TableModel.parse(tableMarkdown);
  }

  eq(other) {
    return (
      other instanceof WordProcessorTableWidget &&
      other.tableMarkdown === this.tableMarkdown &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  ignoreEvent(event) {
    // Allow pointer/click events inside widget for cell selection & editing
    return true;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'cm-wp-table-container';
    container.style.cssText = 'position: relative; margin: 12px 0; overflow-x: auto; max-width: 100%; border-radius: 6px; box-sizing: border-box;';

    if (!this.model) {
      container.textContent = this.tableMarkdown;
      return container;
    }

    const matrix = this.model.getRenderMatrix();
    const rowCount = this.model.getRowCount();
    const colCount = this.model.getColCount();

    let selectedRange = null; // { startR, startC, endR, endC }
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
    table.style.cssText = `width: 100%; border-collapse: collapse; table-layout: auto; color: var(--text-color, #fff); font-size: 15px; border: ${borderCss};`;

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

        attachCellEvents(th, 0, c);
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

          attachCellEvents(td, r, c);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
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

    let longPressTimer = null;

    const attachCellEvents = (cellEl, r, c) => {
      const startLongPress = (e) => {
        if (activeOverlay) return;
        clearTimeout(longPressTimer);
        const startX = e.clientX || (e.touches && e.touches[0].clientX);
        const startY = e.clientY || (e.touches && e.touches[0].clientY);

        longPressTimer = setTimeout(() => {
          selectCell(r, c);
          showContextMenu(cellEl, r, c);
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

      cellEl.addEventListener('pointerdown', startLongPress);

      cellEl.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(longPressTimer);
        if (selectedRange && selectedRange.startR === r && selectedRange.startC === c && !activeOverlay) {
          openCellEditor(cellEl, r, c);
        } else {
          selectCell(r, c);
        }
      });
    };

    const showContextMenu = (cellEl, r, c) => {
      let existingMenu = document.querySelector('.cm-wp-table-context-menu');
      if (existingMenu) existingMenu.remove();

      const menu = document.createElement('div');
      menu.className = 'cm-wp-table-context-menu';
      menu.style.cssText = 'position: fixed; z-index: 10009; background: var(--table-menu-bg, #222428); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); max-height: 240px; overflow-y: auto;';

      const addBtn = (label, action, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `padding: 4px 10px; background: var(--table-menu-action-bg, rgba(255,255,255,0.12)); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: ${isDisabled ? 'var(--table-menu-disabled-color, #777)' : 'var(--table-menu-text, #fff)'}; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; opacity: ${isDisabled ? '0.5' : '1'};`;
        if (isDisabled) {
          btn.disabled = true;
        } else {
          btn.onclick = (e) => {
            e.stopPropagation();
            menu.remove();
            action();
            renderTableCells();
            commitTableChange();
          };
          btn.addEventListener('pointerdown', () => {
            btn.style.backgroundColor = 'var(--table-menu-pressed-bg, rgba(0, 120, 212, 0.4))';
          });
          btn.addEventListener('pointerup', () => {
            btn.style.backgroundColor = 'var(--table-menu-action-bg, rgba(255,255,255,0.12))';
          });
          btn.addEventListener('pointercancel', () => {
            btn.style.backgroundColor = 'var(--table-menu-action-bg, rgba(255,255,255,0.12))';
          });
        }
        menu.appendChild(btn);
      };

      addBtn('Add Row Below', () => this.model.insertRow(r + 1));
      addBtn('Add Column Right', () => this.model.insertCol(c + 1));

      if (rowCount > 1) {
        addBtn('Delete Row', () => this.model.deleteRow(r));
      }
      if (colCount > 1) {
        addBtn('Delete Column', () => this.model.deleteCol(c));
      }

      if (c < colCount - 1) addBtn('Merge Right', () => this.model.mergeDirection(r, c, 'right'));
      if (c > 0) addBtn('Merge Left', () => this.model.mergeDirection(r, c, 'left'));
      if (r < rowCount - 1) addBtn('Merge Down', () => this.model.mergeDirection(r, c, 'down'));
      if (r > 0) addBtn('Merge Up', () => this.model.mergeDirection(r, c, 'up'));

      const primaryCell = matrix[r][c];
      const isMerged = primaryCell.colSpan > 1 || primaryCell.rowSpan > 1;
      addBtn('Split Cell', () => this.model.splitCell(r, c), !isMerged);

      document.body.appendChild(menu);

      const cellRect = cellEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const menuHeight = menu.offsetHeight || 180;
      const menuWidth = menu.offsetWidth || 140;

      let top = cellRect.bottom + 6;
      if (top + menuHeight > viewportHeight - 10) {
        top = Math.max(10, cellRect.top - menuHeight - 6);
      }

      let left = Math.max(10, Math.min(cellRect.left, viewportWidth - menuWidth - 10));

      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;

      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          window.removeEventListener('pointerdown', closeMenu);
        }
      };
      window.addEventListener('pointerdown', closeMenu);
    };

    const selectCell = (r, c) => {
      selectedRange = { startR: r, startC: c, endR: r, endC: c };
      updateSelectionHighlight();
    };

    const updateSelectionHighlight = () => {
      table.querySelectorAll('th, td').forEach(el => {
        el.style.outline = 'none';
        el.style.backgroundColor = '';
      });

      if (!selectedRange) {
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

      const primaryCell = matrix[minR][minC];
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

    const openCellEditor = (cellEl, r, c) => {
      if (activeOverlay) activeOverlay.remove();

      const overlay = document.createElement('textarea');
      overlay.className = 'cm-wp-cell-editor';
      overlay.value = this.model.rows[r][c] || '';
      overlay.style.cssText = `position: absolute; top: ${cellEl.offsetTop}px; left: ${cellEl.offsetLeft}px; width: ${cellEl.offsetWidth}px; height: ${cellEl.offsetHeight}px; box-sizing: border-box; font-family: inherit; font-size: 14px; padding: 6px; border: 2px solid #0078d4; background: var(--bg-color, #000); color: var(--text-color, #fff); z-index: 100; outline: none; resize: none; border-radius: 4px;`;

      let isCommitted = false;
      const commitAndClose = (nextNavigation) => {
        if (isCommitted) return;
        isCommitted = true;
        this.model.rows[r][c] = overlay.value;
        activeOverlay = null;
        overlay.remove();
        renderTableCells();
        commitTableChange();

        if (nextNavigation) {
          requestAnimationFrame(() => {
            const newContainer = document.querySelector('.cm-wp-table-container');
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
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commitAndClose({ rowDelta: 1, colDelta: 0 });
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitAndClose({ rowDelta: 0, colDelta: e.shiftKey ? -1 : 1 });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          activeOverlay = null;
          overlay.remove();
        }
      });

      overlay.addEventListener('blur', () => {
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

    btnMerge.addEventListener('click', (e) => {
      e.preventDefault();
      if (!selectedRange) return;
      this.model.mergeRect(selectedRange.startR, selectedRange.startC, selectedRange.endR, selectedRange.endC);
      renderTableCells();
      commitTableChange();
    });

    btnSplit.addEventListener('click', (e) => {
      e.preventDefault();
      if (!selectedRange) return;
      this.model.splitCell(selectedRange.startR, selectedRange.startC);
      renderTableCells();
      commitTableChange();
    });

    renderTableCells();
    container.appendChild(table);
    return container;
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
