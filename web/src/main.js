import { EditorState, Compartment, Transaction } from '@codemirror/state';
import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, ViewPlugin, WidgetType, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo as cmUndo, redo as cmRedo } from '@codemirror/commands';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, syntaxTree, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { GFM, Table as GFMTable, Strikethrough as GFMStrikethrough, TaskList as GFMTaskList } from '@lezer/markdown';

let activeAdapter = null;
let currentEditorMode = 'wysiwyg'; // 'wysiwyg' | 'live_preview' | 'source'
let isProgrammaticChange = false;
let pendingMarkdown = null;
let isLineWrapEnabled = true;
let activePopupGroup = null;

let customHotkeys = {
  new: 'ctrl+n',
  open: 'ctrl+o',
  save: 'ctrl+s',
  save_as: 'ctrl+shift+s',
  export: 'ctrl+shift+e',
  image: 'ctrl+shift+i',
  settings: 'ctrl+,',
  toggle_toolbar: 'ctrl+t',
  line_wrap: 'ctrl+alt+w',
  open_with: 'ctrl+shift+o',
  line_numbers: 'ctrl+alt+l',
  bold: 'ctrl+b',
  italic: 'ctrl+i',
  underline: 'ctrl+u',
  strikethrough: 'ctrl+shift+x',
  code: 'ctrl+e',
  link: 'ctrl+k',
  footnote: 'ctrl+shift+f',
  blockQuote: 'ctrl+shift+q',
  codeBlock: 'ctrl+shift+c',
  bulletedList: 'ctrl+shift+8',
  numberedList: 'ctrl+shift+7',
  todoList: 'ctrl+shift+l',
  indent: 'tab',
  outdent: 'shift+tab',
  horizontalLine: 'ctrl+shift+h',
  findAndReplace: 'ctrl+f',
  heading_p: 'ctrl+alt+0',
  heading_1: 'ctrl+alt+1',
  heading_2: 'ctrl+alt+2',
  heading_3: 'ctrl+alt+3',
  heading_4: 'ctrl+alt+4',
  heading_5: 'ctrl+alt+5',
  heading_6: 'ctrl+alt+6',
  highlight_yellow: 'ctrl+alt+y',
  highlight_green: 'ctrl+alt+g',
  highlight_pink: 'ctrl+alt+p',
  highlight_blue: 'ctrl+alt+b',
  highlight_red: 'ctrl+alt+r',
  highlight_red_pen: 'ctrl+alt+r',
  highlight_green_pen: 'ctrl+alt+shift+g',
  highlight_remove: 'ctrl+alt+x'
};

const svgIcons = {
  undo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
  redo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>`,
  paragraph: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/></svg>`,
  lists: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  format: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
  table: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/></svg>`,
  insertTable: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/><path d="M16 16h4m-2-2v4"/></svg>`,
  insert: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
  wrap: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 21 6"/><path d="M3 12h15a3 3 0 0 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/></svg>`,
  bold: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>`,
  italic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
  underline: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`,
  strikethrough: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
  inlineCode: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><line x1="14" y1="4" x2="10" y2="20"/></svg>`,
  codeBlock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 9l-2 3 2 3"/><path d="M12 9l2 3-2 3"/></svg>`,
  link: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  image: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  blockQuote: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  horizontalLine: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
  bulletedList: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  numberedList: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`,
  todoList: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  indent: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 10 7 14 3 18"/><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/></svg>`,
  outdent: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 3 14 7 18"/><line x1="21" y1="6" x2="11" y2="6"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="21" y1="18" x2="11" y2="18"/></svg>`,
  newFile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  openFile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  saveFile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
  saveAsFile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><path d="M12 10v4m-2-2h4"/></svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  newWindow: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  footnote: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M4 15h16"/><path d="M9 11V5h6v6"/><path d="M9 8h6"/></svg>`,
  squareMarker: (color) => `<svg width="18" height="18" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="${color}"/></svg>`,
  circlePen: (color) => `<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="${color}"/></svg>`
};

class CheckboxWidget extends WidgetType {
  constructor(checked, pos) {
    super();
    this.checked = checked;
    this.pos = pos;
  }

  toDOM(view) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'cm-todo-checkbox';
    input.addEventListener('click', (e) => {
      e.preventDefault();
      const newText = this.checked ? '[ ]' : '[x]';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newText }
      });
    });
    return input;
  }
}

class CodeBlockHeaderWidget extends WidgetType {
  constructor(lang, codeText) {
    super();
    this.lang = lang || 'Plain text';
    this.codeText = codeText;
  }

  toDOM() {
    const header = document.createElement('div');
    header.className = 'cm-codeblock-header';
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.12); padding: 4px 10px; border-radius: 4px 4px 0 0; font-size: 12px; font-weight: bold; font-family: monospace; color: var(--code-block-lang-label-color, #ffffff); user-select: none; border-bottom: 1px solid rgba(255,255,255,0.2);';

    const langSpan = document.createElement('span');
    langSpan.textContent = this.lang;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'cm-codeblock-copy-btn';
    copyBtn.textContent = 'COPY';
    copyBtn.style.cssText = 'background: transparent; border: 1px solid rgba(255,255,255,0.35); color: inherit; border-radius: 3px; padding: 2px 8px; font-size: 11px; cursor: pointer; font-weight: bold;';
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(this.codeText).catch(() => {});
      }
      if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
        window.AndroidNative.showToast('Code block copied to clipboard');
      }
    });

    header.appendChild(langSpan);
    header.appendChild(copyBtn);
    return header;
  }
}

class ImagePreviewWidget extends WidgetType {
  constructor(url, alt) {
    super();
    this.url = url;
    this.alt = alt || 'image';
  }

  toDOM() {
    const img = document.createElement('img');
    img.src = this.url;
    img.alt = this.alt;
    img.style.cssText = 'max-width: 100%; height: auto; border-radius: 6px; margin: 6px 0; display: block; border: 1px solid var(--border-color, #444);';
    return img;
  }
}

class GFMTableWidget extends WidgetType {
  constructor(tableText, from, to) {
    super();
    this.tableText = tableText;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return (
      other instanceof GFMTableWidget &&
      other.tableText === this.tableText &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  ignoreEvent(event) {
    return true;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'cm-gfm-table-container';
    container.style.cssText =
      'overflow-x: auto; margin: 12px 0; border: 1px solid var(--table-border-color, var(--border-color, #444)); border-radius: 6px; position: relative; width: 100%; box-sizing: border-box; background-color: var(--bg-color, #000);';

    const table = document.createElement('table');
    table.style.cssText =
      'width: 100%; border-collapse: collapse; color: var(--text-color, #ffffff); font-size: var(--body-font-size, 16px); table-layout: auto;';

    const lines = this.tableText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return container;

    const isSeparator = (line) =>
      /^\|?\s*[:?]-+[:?]?(\s*\|\s*[:?]-+[:?]?)*\s*\|?$/.test(line);

    const parseCells = (line) => {
      let trimmed = line.trim();
      if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
      if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
      return trimmed.split('|').map(c => c.trim());
    };

    const headerLine = lines[0];
    const dataLines = lines.slice(1).filter(l => !isSeparator(l));

    const headers = parseCells(headerLine);
    const rows = dataLines.map(parseCells);

    const updateDoc = () => {
      const headerRowStr = '| ' + headers.join(' | ') + ' |';
      const sepRowStr = '| ' + headers.map(() => '---').join(' | ') + ' |';
      const dataRowStrs = rows.map(r => '| ' + r.join(' | ') + ' |');

      const newMarkdown = [headerRowStr, sepRowStr, ...dataRowStrs].join('\n');
      if (newMarkdown !== this.tableText) {
        view.dispatch({
          changes: { from: this.from, to: this.to, insert: newMarkdown }
        });
      }
    };

    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    headers.forEach((hText, colIdx) => {
      const th = document.createElement('th');
      th.contentEditable = 'true';
      th.style.cssText =
        'border: 1px solid var(--table-border-color, var(--border-color, #444)); padding: 8px 12px; background-color: var(--table-header-bg, rgba(255,255,255,0.12)); font-weight: bold; text-align: left; outline: none; min-width: 60px; color: var(--text-color, #ffffff);';
      th.textContent = hText;
      th.addEventListener('input', () => {
        headers[colIdx] = th.textContent || '';
      });
      th.addEventListener('blur', () => {
        updateDoc();
      });
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((rowCells, rowIdx) => {
      const tr = document.createElement('tr');
      while (rowCells.length < headers.length) rowCells.push('');
      rowCells.forEach((cellText, colIdx) => {
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.style.cssText =
          'border: 1px solid var(--table-border-color, var(--border-color, #444)); padding: 8px 12px; text-align: left; outline: none; min-width: 60px; color: var(--text-color, #ffffff);';
        td.textContent = cellText;
        td.addEventListener('input', () => {
          rows[rowIdx][colIdx] = td.textContent || '';
        });
        td.addEventListener('blur', () => {
          updateDoc();
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
    return container;
  }
}

const customHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--heading-1-color, #ffffff)', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic', color: 'var(--italic-color, inherit)' },
  { tag: tags.strong, fontWeight: 'bold', color: 'var(--bold-color, inherit)' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--link-color, #29b6f6)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--code-color, #ff80ab)' },
  { tag: tags.meta, color: '#888888' },
  { tag: tags.comment, color: '#888888' },
  { tag: tags.propertyName, color: '#29b6f6' },
  { tag: tags.string, color: '#00e676' },
  { tag: tags.number, color: '#ffea00' },
  { tag: tags.keyword, color: '#ff4081', fontWeight: 'bold' }
]);

const livePreviewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    const builder = [];
    if (currentEditorMode === 'source') {
      return Decoration.none;
    }

    const tree = syntaxTree(view.state);
    const selection = view.state.selection.main;
    const isPureWysiwyg = (currentEditorMode === 'wysiwyg');

    for (const { from, to } of view.visibleRanges) {
      tree.iterate({
        from,
        to,
        enter: (node) => {
          const line = view.state.doc.lineAt(node.from);
          const cursor = selection.head;
          const isNodeActive = !isPureWysiwyg && (cursor >= node.from && cursor <= node.to);

          if (node.name.startsWith('ATXHeading')) {
            const level = node.name.replace('ATXHeading', '');
            builder.push(Decoration.line({ attributes: { class: `cm-heading cm-heading-${level}` } }).range(line.from));
          }

          if (node.name === 'HeaderMark' && !isNodeActive) {
            const end = Math.min(node.to + 1, line.to);
            if (end > node.from && end <= line.to) {
              builder.push(Decoration.replace({}).range(node.from, end));
            }
          }

          if (node.name === 'StrongEmphasis') {
            builder.push(Decoration.mark({ class: 'cm-bold' }).range(node.from, node.to));
          }
          if (node.name === 'EmphasisMark' && !isNodeActive) {
            builder.push(Decoration.replace({}).range(node.from, node.to));
          }

          if (node.name === 'Emphasis') {
            builder.push(Decoration.mark({ class: 'cm-italic' }).range(node.from, node.to));
          }

          if (node.name === 'Strikethrough') {
            builder.push(Decoration.mark({ class: 'cm-strikethrough' }).range(node.from, node.to));
          }
          if (node.name === 'StrikethroughMark' && !isNodeActive) {
            builder.push(Decoration.replace({}).range(node.from, node.to));
          }

          if (node.name === 'InlineCode') {
            builder.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to));
          }
          if (node.name === 'CodeMark' && !isNodeActive) {
            builder.push(Decoration.replace({}).range(node.from, node.to));
          }

          if (node.name === 'Blockquote') {
            builder.push(Decoration.line({ attributes: { class: 'cm-blockquote' } }).range(line.from));
          }
          if (node.name === 'QuoteMark' && !isNodeActive) {
            const end = Math.min(node.to + 1, line.to);
            if (end > node.from) {
              builder.push(Decoration.replace({}).range(node.from, end));
            }
          }

          if (node.name === 'TaskMarker') {
            const taskText = view.state.doc.sliceString(node.from, node.to);
            const isChecked = taskText.includes('[x]') || taskText.includes('[X]');
            if (!isNodeActive && (node.to - node.from >= 3)) {
              const replaceFrom = line.text.startsWith('- ') ? line.from : node.from;
              builder.push(Decoration.replace({ widget: new CheckboxWidget(isChecked, replaceFrom) }).range(replaceFrom, node.from + 3));
            }
          }

          if (node.name === 'HorizontalRule') {
            builder.push(Decoration.line({ attributes: { class: 'cm-hr' } }).range(line.from));
            if (!isNodeActive) {
              builder.push(Decoration.replace({}).range(node.from, node.to));
            }
          }

          if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
            if (line.from === node.from) {
              const codeText = view.state.doc.sliceString(node.from, node.to);
              const firstLineText = line.text;
              const langMatch = firstLineText.match(/^```(\w+)/);
              const lang = langMatch ? langMatch[1] : 'Plain text';
              if (!isNodeActive) {
                builder.push(Decoration.replace({ widget: new CodeBlockHeaderWidget(lang, codeText) }).range(line.from, line.to));
              } else {
                builder.push(Decoration.widget({ widget: new CodeBlockHeaderWidget(lang, codeText), side: -1 }).range(line.from));
              }
            }
          }

          if (node.name === 'Table') {
            const tableText = view.state.doc.sliceString(node.from, node.to);
            const startLine = view.state.doc.lineAt(node.from);
            const endLine = view.state.doc.lineAt(node.to);

            for (let l = startLine.number; l <= endLine.number; l++) {
              const lineObj = view.state.doc.line(l);
              if (l === startLine.number) {
                builder.push(Decoration.replace({ widget: new GFMTableWidget(tableText, node.from, node.to) }).range(lineObj.from, lineObj.to));
              } else {
                builder.push(Decoration.replace({}).range(lineObj.from, lineObj.to));
              }
            }
            return false;
          }

          if (node.name === 'URL' || node.name === 'Link') {
            builder.push(Decoration.mark({ class: 'cm-link' }).range(node.from, node.to));
          }

          if (node.name === 'Image') {
            const imgText = view.state.doc.sliceString(node.from, node.to);
            const match = imgText.match(/!\[([^\]]*)\]\(([^)]+)\)/);
            if (match && !isNodeActive) {
              const alt = match[1];
              const url = match[2];
              builder.push(Decoration.replace({ widget: new ImagePreviewWidget(url, alt) }).range(node.from, node.to));
            }
          }
        }
      });
    }

    builder.sort((a, b) => a.from - b.from || a.to - b.to);
    return Decoration.set(builder, true);
  }
}, {
  decorations: v => v.decorations
});

function cmToggleLinePrefix(view, prefix) {
  if (!view) return;
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  const lineText = line.text;

  if (prefix === '') {
    const cleanText = lineText.replace(/^(#{1,6}\s+|- \[\s?[xX]?\]\s+|- |\d+\.\s+|> )/, '');
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: cleanText }
    });
    return;
  }

  if (lineText.startsWith(prefix)) {
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length, insert: '' }
    });
  } else {
    const cleanText = lineText.replace(/^(#{1,6}\s+|- \[\s?[xX]?\]\s+|- |\d+\.\s+|> )/, '');
    const newText = prefix + cleanText;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + prefix.length, head: line.from + prefix.length }
    });
  }
  view.focus();
}

function cmWrapSelection(view, before, after = before) {
  if (!view) return;
  const sel = view.state.selection.main;
  let selectedText = view.state.doc.sliceString(sel.from, sel.to);

  // Check if text is already wrapped in `before` and `after`
  if (selectedText.startsWith(before) && selectedText.endsWith(after) && selectedText.length >= before.length + after.length) {
    const unwrapped = selectedText.slice(before.length, selectedText.length - after.length);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: unwrapped },
      selection: { anchor: sel.from, head: sel.from + unwrapped.length }
    });
    view.focus();
    return;
  }

  // Trim leading/trailing whitespace to prevent user selection space formatting bugs
  let startOffset = 0;
  let endOffset = 0;
  while (startOffset < selectedText.length && /\s/.test(selectedText[startOffset])) {
    startOffset++;
  }
  while (endOffset < selectedText.length - startOffset && /\s/.test(selectedText[selectedText.length - 1 - endOffset])) {
    endOffset++;
  }

  const coreText = selectedText.slice(startOffset, selectedText.length - endOffset);
  const leadingWs = selectedText.slice(0, startOffset);
  const trailingWs = selectedText.slice(selectedText.length - endOffset);

  const replacement = leadingWs + before + coreText + after + trailingWs;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: replacement },
    selection: { anchor: sel.from + startOffset + before.length, head: sel.from + startOffset + before.length + coreText.length }
  });
  view.focus();
}

function cmIndentSelection(view, spaces = '  ') {
  if (!view) return;
  const sel = view.state.selection.main;
  const startLine = view.state.doc.lineAt(sel.from).number;
  const endLine = view.state.doc.lineAt(sel.to).number;
  const changes = [];
  for (let i = startLine; i <= endLine; i++) {
    const l = view.state.doc.line(i);
    changes.push({ from: l.from, to: l.from, insert: spaces });
  }
  view.dispatch({ changes });
  view.focus();
}

function cmOutdentSelection(view, spaces = '  ') {
  if (!view) return;
  const sel = view.state.selection.main;
  const startLine = view.state.doc.lineAt(sel.from).number;
  const endLine = view.state.doc.lineAt(sel.to).number;
  const changes = [];
  for (let i = startLine; i <= endLine; i++) {
    const l = view.state.doc.line(i);
    if (l.text.startsWith(spaces)) {
      changes.push({ from: l.from, to: l.from + spaces.length, insert: '' });
    }
  }
  if (changes.length > 0) {
    view.dispatch({ changes });
  }
  view.focus();
}


function parseTableCells(doc, startLineNum, endLineNum) {
  const cells = [];
  for (let lNum = startLineNum; lNum <= endLineNum; lNum++) {
    const line = doc.line(lNum);
    const text = line.text;
    const trimmed = text.trim();
    if (!trimmed.startsWith('|')) continue;
    // Skip separator row (|---|---|)
    if (/^\|\s*[:\-]+\s*(\|\s*[:\-]+\s*)+\|?$/.test(trimmed)) continue;

    // Find unescaped pipe positions
    const pipes = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '|' && (i === 0 || text[i - 1] !== '\\')) {
        pipes.push(line.from + i);
      }
    }
    for (let c = 0; c < pipes.length - 1; c++) {
      const pStart = pipes[c];
      const pEnd = pipes[c + 1];
      let cStart = pStart + 1;
      while (cStart < pEnd && doc.sliceDoc(cStart, cStart + 1) === ' ') cStart++;
      let cEnd = pEnd;
      while (cEnd > cStart && doc.sliceDoc(cEnd - 1, cEnd) === ' ') cEnd--;
      cells.push({ from: cStart, to: cEnd, lineNum: lNum });
    }
  }
  return cells;
}

function navigateTableCell(view, direction) {
  const state = view.state;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const trimmed = line.text.trim();
  if (!trimmed.startsWith('|')) return false;

  // Find table block boundaries
  let startL = line.number;
  let endL = line.number;
  for (let l = line.number; l >= 1; l--) {
    if (state.doc.line(l).text.trim().startsWith('|')) startL = l;
    else break;
  }
  for (let l = line.number; l <= state.doc.lines; l++) {
    if (state.doc.line(l).text.trim().startsWith('|')) endL = l;
    else break;
  }

  const cells = parseTableCells(state.doc, startL, endL);
  if (cells.length === 0) return false;

  // Find current cell index
  let currentIdx = -1;
  for (let i = 0; i < cells.length; i++) {
    if (pos >= cells[i].from - 1 && pos <= cells[i].to + 1) {
      currentIdx = i;
      break;
    }
  }

  if (currentIdx === -1) {
    // Find closest
    let minDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const dist = Math.abs(pos - cells[i].from);
      if (dist < minDist) {
        minDist = dist;
        currentIdx = i;
      }
    }
  }

  const targetIdx = currentIdx + direction;
  if (targetIdx < 0) {
    // Exit table upward
    const prevLinePos = Math.max(0, state.doc.line(startL).from - 1);
    view.dispatch({ selection: { anchor: prevLinePos, head: prevLinePos }, scrollIntoView: true });
    return true;
  }
  if (targetIdx >= cells.length) {
    // Exit table downward
    const nextLinePos = Math.min(state.doc.length, state.doc.line(endL).to + 1);
    view.dispatch({ selection: { anchor: nextLinePos, head: nextLinePos }, scrollIntoView: true });
    return true;
  }

  const targetCell = cells[targetIdx];
  view.dispatch({
    selection: { anchor: targetCell.from, head: targetCell.to },
    scrollIntoView: true
  });
  return true;
}

export const tableNavigationKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view) => navigateTableCell(view, 1)
  },
  {
    key: 'Shift-Tab',
    run: (view) => navigateTableCell(view, -1)
  }
]);


class CodeMirrorAdapter {
  constructor() {
    this.mode = currentEditorMode;
    this.view = null;
    this.lineWrapCompartment = new Compartment();
    this.lineNumbersCompartment = new Compartment();
    this.showLineNumbers = false;
    this.revision = 0;
    this.isProgrammatic = false;
  }

  async init(containerEl, initialMarkdown = '') {
    containerEl.innerHTML = '';
    const startState = EditorState.create({
      doc: initialMarkdown || '',
      extensions: [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        cmMarkdown({ extensions: [GFM, GFMTable, GFMStrikethrough, GFMTaskList] }),
        syntaxHighlighting(customHighlightStyle),
        livePreviewPlugin,
        this.lineWrapCompartment.of(isLineWrapEnabled ? EditorView.lineWrapping : []),
        this.lineNumbersCompartment.of(this.showLineNumbers ? lineNumbers() : []),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: 'var(--body-font-size, 16px)',
            fontFamily: 'var(--body-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
            backgroundColor: 'var(--bg-color, #000000)',
            color: 'var(--text-color, #ffffff)'
          },
          '.cm-content': {
            caretColor: 'var(--text-color, #ffffff) !important',
            fontFamily: 'var(--body-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
            padding: '12px 16px',
            lineHeight: 'var(--paragraph-line-height, 1.6)',
            color: 'var(--text-color, #ffffff) !important'
          },
          '.cm-cursor, .cm-dropCursor': {
            borderLeft: '2px solid var(--text-color, #ffffff) !important'
          },
          '.cm-line': {
            color: 'var(--text-color, #ffffff) !important'
          },
          '&.cm-focused': {
            outline: 'none'
          }
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !this.isProgrammatic) {
            this.revision++;
            if (window.AndroidNative && typeof window.AndroidNative.onDirtyStateChanged === 'function') {
              window.AndroidNative.onDirtyStateChanged(true, this.revision);
            } else if (window.AndroidNative && typeof window.AndroidNative.onContentChanged === 'function') {
              window.AndroidNative.onContentChanged(null, this.revision);
            }
          }
          if (update.selectionSet && !this.isProgrammatic && window.AndroidNative && typeof window.AndroidNative.onSelectionChanged === 'function') {
            const state = this.getSelectionState();
            window.AndroidNative.onSelectionChanged(JSON.stringify(state));
          }
          if ((update.selectionSet || update.docChanged) && typeof updateTocActiveSection === 'function') {
            updateTocActiveSection();
          }
        }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap
        ])
      ]
    });

    this.view = new EditorView({
      state: startState,
      parent: containerEl
    });

    setupGroupedControlBar();
    initCustomSearchBar();
    setupFastScrollbar();
    setupTocGestureAndPanel();
  }

  setMarkdown(text) {
    if (!this.view) return;
    this.isProgrammatic = true;
    const currentDoc = this.view.state.doc.toString();
    if (currentDoc !== text) {
      this.view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: text || '' }
      });
    }
    this.revision = 0;
    setTimeout(() => { this.isProgrammatic = false; }, 20);
  }

  getMarkdown() {
    if (!this.view) return '';
    return this.view.state.doc.toString();
  }

  getSelectionState() {
    if (!this.view) return { path: [], offset: 0, head: 0, anchor: 0 };
    const sel = this.view.state.selection.main;
    return { path: [], offset: sel.head, head: sel.head, anchor: sel.anchor };
  }

  setSelectionState(stateJson, scrollTop) {
    if (!this.view) return;
    try {
      let sel = typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson;
      if (typeof sel === 'string') {
        sel = JSON.parse(sel);
      }
      if (sel && typeof sel.head === 'number') {
        const len = this.view.state.doc.length;
        const head = Math.min(Math.max(0, sel.head), len);
        const anchor = Math.min(Math.max(0, sel.anchor !== undefined ? sel.anchor : sel.head), len);
        this.view.dispatch({
          selection: { anchor, head },
          scrollIntoView: true
        });
      }
    } catch (e) {
      console.error('Error setting CodeMirror selection:', e);
    }
    if (typeof scrollTop === 'number' && scrollTop >= 0) {
      this.view.scrollDOM.scrollTop = scrollTop;
    }
  }

  undo() {
    if (this.view) cmUndo(this.view);
  }

  redo() {
    if (this.view) cmRedo(this.view);
  }

  setLineWrap(enabled) {
    if (!this.view) return;
    this.view.dispatch({
      effects: this.lineWrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : [])
    });
  }

  toggleLineNumbers() {
    if (!this.view) return false;
    this.showLineNumbers = !this.showLineNumbers;
    const cmEl = this.view.dom;
    if (cmEl) {
      if (this.showLineNumbers) {
        cmEl.classList.add('cm-show-line-numbers');
      } else {
        cmEl.classList.remove('cm-show-line-numbers');
      }
    }
    this.view.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(this.showLineNumbers ? lineNumbers() : [])
    });
    return this.showLineNumbers;
  }

  insertImage(imageUrl, altText = 'image') {
    if (this.view) {
      const imgMarkdown = `![${altText}](${imageUrl})`;
      const sel = this.view.state.selection.main;
      this.view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: imgMarkdown },
        selection: { anchor: sel.from + imgMarkdown.length, head: sel.from + imgMarkdown.length }
      });
      this.view.focus();
    }
  }

  destroy() {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
  }
}

async function setEditorMode(mode) {
  const targetMode = (mode === 'live_preview' || mode === 'source') ? mode : 'wysiwyg';

  const existingText = activeAdapter ? activeAdapter.getMarkdown() : (pendingMarkdown || '');
  if (activeAdapter) {
    activeAdapter.destroy();
    activeAdapter = null;
  }

  currentEditorMode = targetMode;
  const container = document.querySelector('#editor-container');
  if (container) {
    let editorEl = container.querySelector('#editor');
    if (!editorEl) {
      editorEl = document.createElement('div');
      editorEl.id = 'editor';
      container.appendChild(editorEl);
    } else {
      editorEl.innerHTML = '';
    }
  }

  const adapter = new CodeMirrorAdapter();
  const containerEl = document.querySelector('#editor');
  await adapter.init(containerEl, existingText);
  activeAdapter = adapter;

  if (window.AndroidNative && typeof window.AndroidNative.onEditorReady === 'function') {
    window.AndroidNative.onEditorReady(targetMode);
  }

  return activeAdapter;
}

function setupGroupedControlBar() {
  const topContainer = document.querySelector('.ck-editor__top') || document.querySelector('#editor-container');
  if (!topContainer) return;

  let bar = document.querySelector('.grouped-control-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'grouped-control-bar';
    topContainer.appendChild(bar);
  }

  bar.innerHTML = `
    <button class="grouped-key-btn" id="grp-btn-undo" title="Undo (Hold: Redo)">${svgIcons.undo}</button>
    <button class="grouped-key-btn" id="grp-btn-heading" title="Paragraph & Headings">${svgIcons.paragraph}</button>
    <button class="grouped-key-btn" id="grp-btn-lists" title="Lists">${svgIcons.lists}</button>
    <button class="grouped-key-btn" id="grp-btn-format" title="Format">${svgIcons.format}</button>
    <button class="grouped-key-btn" id="grp-btn-table" title="Table">${svgIcons.insertTable}</button>
    <button class="grouped-key-btn" id="grp-btn-insert" title="Insert">${svgIcons.insert}</button>
    <button class="grouped-key-btn" id="grp-btn-menu" title="Menu">${svgIcons.menu}</button>
  `;

  const undoBtn = bar.querySelector('#grp-btn-undo');
  if (undoBtn) {
    let holdTimer = null;
    let didRedo = false;

    undoBtn.addEventListener('pointerdown', () => {
      didRedo = false;
      holdTimer = setTimeout(() => {
        didRedo = true;
        if (activeAdapter) activeAdapter.redo();
      }, 500);
    });

    const clearHold = () => {
      clearTimeout(holdTimer);
    };

    undoBtn.addEventListener('pointerup', () => {
      clearHold();
      if (!didRedo && activeAdapter) {
        activeAdapter.undo();
      }
    });

    undoBtn.addEventListener('pointercancel', clearHold);
  }

  document.addEventListener('pointerdown', (e) => {
    const strip = document.querySelector('#popup-toolbar-strip');
    const barEl = document.querySelector('.grouped-control-bar');
    if (strip && !strip.classList.contains('hidden')) {
      if (!strip.contains(e.target) && (!barEl || !barEl.contains(e.target))) {
        hidePopupStrip();
      }
    }
  });

  const headingBtn = bar.querySelector('#grp-btn-heading');
  if (headingBtn) {
    headingBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('heading', headingBtn, [
        { title: 'Paragraph', icon: 'P', action: () => execCmd('heading', { value: 'paragraph' }) },
        { title: 'Heading 1', icon: 'H1', action: () => execCmd('heading', { value: 'heading1' }) },
        { title: 'Heading 2', icon: 'H2', action: () => execCmd('heading', { value: 'heading2' }) },
        { title: 'Heading 3', icon: 'H3', action: () => execCmd('heading', { value: 'heading3' }) },
        { title: 'Heading 4', icon: 'H4', action: () => execCmd('heading', { value: 'heading4' }) },
        { title: 'Heading 5', icon: 'H5', action: () => execCmd('heading', { value: 'heading5' }) },
        { title: 'Heading 6', icon: 'H6', action: () => execCmd('heading', { value: 'heading6' }) },
        { icon: svgIcons.wrap, title: 'Toggle Line Wrap', action: () => window.editorBridge.toggleLineWrap() },
        { icon: '#', title: 'Toggle Line Numbers', action: () => window.editorBridge.toggleLineNumbers() }
      ]);
    };
  }

  const listsBtn = bar.querySelector('#grp-btn-lists');
  if (listsBtn) {
    listsBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('lists', listsBtn, [
        { title: 'Bulleted List', icon: svgIcons.bulletedList, action: () => execCmd('bulletedList') },
        { title: 'Numbered List', icon: svgIcons.numberedList, action: () => execCmd('numberedList') },
        { title: 'Todo List', icon: svgIcons.todoList, action: () => execCmd('todoList') },
        { title: 'Indent', icon: svgIcons.indent, action: () => execCmd('indent') },
        { title: 'Outdent', icon: svgIcons.outdent, action: () => execCmd('outdent') }
      ]);
    };
  }

  const formatBtn = bar.querySelector('#grp-btn-format');
  if (formatBtn) {
    formatBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('format', formatBtn, [
        { icon: svgIcons.bold, title: 'Bold', action: () => execCmd('bold') },
        { icon: svgIcons.italic, title: 'Italic', action: () => execCmd('italic') },
        { icon: svgIcons.strikethrough, title: 'Strikethrough', action: () => execCmd('strikethrough') },
        { icon: svgIcons.underline, title: 'Underline', action: () => execCmd('underline') },
        { icon: svgIcons.squareMarker('#ffe066'), title: 'Yellow Marker', action: () => execCmd('highlight', { value: 'yellowMarker' }) },
        { icon: svgIcons.squareMarker('#a8f087'), title: 'Green Marker', action: () => execCmd('highlight', { value: 'greenMarker' }) },
        { icon: svgIcons.squareMarker('#ff99c8'), title: 'Pink Marker', action: () => execCmd('highlight', { value: 'pinkMarker' }) },
        { icon: svgIcons.squareMarker('#9bf6ff'), title: 'Blue Marker', action: () => execCmd('highlight', { value: 'blueMarker' }) },
        { icon: svgIcons.circlePen('#ff595e'), title: 'Red Pen', action: () => execCmd('highlight', { value: 'redPen' }) },
        { icon: svgIcons.circlePen('#2ec4b6'), title: 'Green Pen', action: () => execCmd('highlight', { value: 'greenPen' }) }
      ]);
    };
  }

  const tableBtn = bar.querySelector('#grp-btn-table');
  if (tableBtn) {
    tableBtn.onclick = (e) => {
      e.stopPropagation();
      showTableGridPickerModal();
    };
  }

  const insertBtn = bar.querySelector('#grp-btn-insert');
  if (insertBtn) {
    insertBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('insert', insertBtn, [
        { icon: svgIcons.image, title: 'Insert Image', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('image') },
        { icon: svgIcons.link, title: 'Insert Link', action: () => execCmd('link') },
        { icon: svgIcons.inlineCode, title: 'Inline Code', action: () => execCmd('code') },
        { icon: svgIcons.blockQuote, title: 'Insert Quote', action: () => execCmd('blockQuote') },
        { icon: svgIcons.codeBlock, title: 'Code Block', action: () => execCmd('codeBlock') },
        { icon: svgIcons.horizontalLine, title: 'Insert Line', action: () => execCmd('horizontalLine') },
        { icon: svgIcons.footnote, title: 'Insert Footnote', action: () => execCmd('InsertFootnote') }
      ]);
    };
  }

  const menuBtn = bar.querySelector('#grp-btn-menu');
  if (menuBtn) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopupStrip('menu', menuBtn, [
        { icon: svgIcons.newFile, title: 'New File', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('new') },
        { icon: svgIcons.openFile, title: 'Open File', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('open') },
        { icon: svgIcons.saveFile, title: 'Save File', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('save') },
        { icon: svgIcons.saveAsFile, title: 'Save As', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('save_as') },
        { icon: svgIcons.saveFile, title: 'Export HTML / MHTML', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('export') },
        { icon: svgIcons.search, title: 'Find & Replace', action: () => { hidePopupStrip(); toggleFindAndReplaceBar(); } },
        { icon: svgIcons.newWindow, title: 'Switch View Mode', action: () => openWithOtherEngine() },
        { icon: svgIcons.newWindow, title: 'New Window', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('new_window') },
        { icon: svgIcons.settings, title: 'Settings', action: () => window.AndroidNative && window.AndroidNative.onNativeAction('settings') }
      ]);
    };
  }
}

function showTableGridPickerModal() {
  let modal = document.querySelector('#table-grid-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'table-grid-modal';
    modal.style.cssText = 'position: fixed; bottom: calc(var(--toolbar-height, 48px) + 12px); left: 50%; transform: translateX(-50%); background: #222428; border: 1px solid #444; border-radius: 12px; padding: 12px; z-index: 10008; box-shadow: 0 8px 24px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; gap: 8px;';

    const label = document.createElement('div');
    label.id = 'table-grid-label';
    label.style.cssText = 'font-size: 13px; font-weight: bold; color: #ffffff;';
    label.textContent = '1 x 1 Table';
    modal.appendChild(label);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(10, 18px); grid-template-rows: repeat(10, 18px); gap: 3px; cursor: pointer;';

    for (let r = 1; r <= 10; r++) {
      for (let c = 1; c <= 10; c++) {
        const cell = document.createElement('div');
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.className = 'grid-picker-cell';
        cell.style.cssText = 'width: 18px; height: 18px; border: 1px solid #555; background: #333; border-radius: 2px;';

        cell.addEventListener('pointerenter', () => updateGridHighlight(r, c));
        cell.addEventListener('click', () => {
          insertCustomTable(r, c);
          modal.remove();
        });
        grid.appendChild(cell);
      }
    }
    modal.appendChild(grid);
    document.body.appendChild(modal);

    const closeHandler = (e) => {
      if (!modal.contains(e.target) && !e.target.closest('#grp-btn-table')) {
        modal.remove();
        document.removeEventListener('pointerdown', closeHandler);
      }
    };
    document.addEventListener('pointerdown', closeHandler);
  }

  function updateGridHighlight(maxR, maxC) {
    const label = document.querySelector('#table-grid-label');
    if (label) label.textContent = `${maxR} x ${maxC} Table`;
    document.querySelectorAll('.grid-picker-cell').forEach(cell => {
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);
      if (r <= maxR && c <= maxC) {
        cell.style.background = '#0078d4';
        cell.style.borderColor = '#0078d4';
      } else {
        cell.style.background = '#333';
        cell.style.borderColor = '#555';
      }
    });
  }
}

function insertCustomTable(rows, cols) {
  if (!activeAdapter || !activeAdapter.view) return;
  const view = activeAdapter.view;
  let headers = '|';
  let dividers = '|';
  for (let c = 1; c <= cols; c++) {
    headers += ` Header ${c} |`;
    dividers += ' --- |';
  }
  let tableMarkdown = `\n${headers}\n${dividers}\n`;
  for (let r = 1; r <= rows; r++) {
    let rowStr = '|';
    for (let c = 1; c <= cols; c++) {
      rowStr += ` Cell ${r}-${c} |`;
    }
    tableMarkdown += `${rowStr}\n`;
  }
  cmWrapSelection(view, tableMarkdown, '');
  hidePopupStrip();
}

function execCmd(cmdName, options) {
  if (activeAdapter && activeAdapter.view) {
    const view = activeAdapter.view;
    if (cmdName === 'bold') cmWrapSelection(view, '**');
    else if (cmdName === 'italic') cmWrapSelection(view, '*');
    else if (cmdName === 'strikethrough') cmWrapSelection(view, '~~');
    else if (cmdName === 'underline') cmWrapSelection(view, '<u>', '</u>');
    else if (cmdName === 'code') cmWrapSelection(view, '`');
    else if (cmdName === 'blockQuote') cmToggleLinePrefix(view, '> ');
    else if (cmdName === 'codeBlock') cmWrapSelection(view, '```\n', '\n```');
    else if (cmdName === 'bulletedList') cmToggleLinePrefix(view, '- ');
    else if (cmdName === 'numberedList') cmToggleLinePrefix(view, '1. ');
    else if (cmdName === 'todoList') cmToggleLinePrefix(view, '- [ ] ');
    else if (cmdName === 'indent') cmIndentSelection(view, '  ');
    else if (cmdName === 'outdent') cmOutdentSelection(view, '  ');
    else if (cmdName === 'horizontalLine') cmWrapSelection(view, '\n---\n', '');
    else if (cmdName === 'InsertFootnote') cmWrapSelection(view, '[^1]', '\n[^1]: footnote text');
    else if (cmdName === 'link') cmWrapSelection(view, '[', '](https://)');
    else if (cmdName === 'insertTable') cmWrapSelection(view, '\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n', '');
    else if (cmdName === 'heading') {
      const val = options ? options.value : '';
      if (val === 'paragraph') cmToggleLinePrefix(view, '');
      else if (val === 'heading1') cmToggleLinePrefix(view, '# ');
      else if (val === 'heading2') cmToggleLinePrefix(view, '## ');
      else if (val === 'heading3') cmToggleLinePrefix(view, '### ');
      else if (val === 'heading4') cmToggleLinePrefix(view, '#### ');
      else if (val === 'heading5') cmToggleLinePrefix(view, '##### ');
      else if (val === 'heading6') cmToggleLinePrefix(view, '###### ');
    } else if (cmdName === 'highlight') {
      const val = options ? options.value : null;
      if (val === 'yellowMarker' || val === 'greenMarker' || val === 'pinkMarker' || val === 'blueMarker') cmWrapSelection(view, '==', '==');
      else if (val === 'redPen') cmWrapSelection(view, '<span style="color:red">', '</span>');
      else if (val === 'greenPen') cmWrapSelection(view, '<span style="color:green">', '</span>');
    }
  }
}

function hidePopupStrip() {
  const strip = document.querySelector('#popup-toolbar-strip');
  if (strip) {
    strip.classList.add('hidden');
    strip.innerHTML = '';
  }
  activePopupGroup = null;
  document.querySelectorAll('.grouped-key-btn').forEach(btn => btn.classList.remove('active'));
}

function togglePopupStrip(groupKey, targetBtn, items) {
  const strip = document.querySelector('#popup-toolbar-strip');
  if (!strip) return;

  if (activePopupGroup === groupKey) {
    hidePopupStrip();
    return;
  }

  hidePopupStrip();
  activePopupGroup = groupKey;
  targetBtn.classList.add('active');

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'popup-strip-btn';
    if (item.title) btn.title = item.title;
    btn.innerHTML = item.icon || item.title;
    btn.onclick = (e) => {
      e.stopPropagation();
      if (typeof item.action === 'function') {
        item.action();
      }
    };
    strip.appendChild(btn);
  });

  strip.classList.remove('hidden');
}

function initCustomSearchBar() {
  const container = document.querySelector('#custom-search-bar');
  if (!container) return;

  const searchInput = container.querySelector('#search-input');
  const replaceInput = container.querySelector('#replace-input');
  const counter = container.querySelector('#search-counter');
  const btnClose = container.querySelector('#search-btn-close');
  const btnReplaceOne = container.querySelector('#search-btn-replace-one');
  const btnReplaceAll = container.querySelector('#search-btn-replace-all');
  const btnCase = container.querySelector('#search-btn-case');
  const btnWord = container.querySelector('#search-btn-word');
  const btnRegex = container.querySelector('#search-btn-regex');

  let searchState = {
    matchCase: false,
    wholeWords: false,
    useRegex: false
  };

  const executeSearch = () => {
    if (!activeAdapter) return;
    const query = searchInput.value || '';
    if (!query) {
      counter.textContent = '';
      return;
    }

    const text = activeAdapter.getMarkdown();
    try {
      const flags = searchState.matchCase ? 'g' : 'gi';
      const searchPattern = searchState.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(searchPattern, flags);
      const matches = [...text.matchAll(reg)];
      counter.textContent = matches.length > 0 ? `1/${matches.length}` : '0/0';
    } catch (e) {
      counter.textContent = '0/0';
    }
  };

  searchInput.addEventListener('input', executeSearch);

  btnCase.onclick = () => {
    searchState.matchCase = !searchState.matchCase;
    btnCase.classList.toggle('active', searchState.matchCase);
    executeSearch();
  };

  btnWord.onclick = () => {
    searchState.wholeWords = !searchState.wholeWords;
    btnWord.classList.toggle('active', searchState.wholeWords);
    executeSearch();
  };

  btnRegex.onclick = () => {
    searchState.useRegex = !searchState.useRegex;
    btnRegex.classList.toggle('active', searchState.useRegex);
    executeSearch();
  };

  btnClose.onclick = () => {
    toggleFindAndReplaceBar(false);
  };

  btnReplaceOne.onclick = () => {
    const query = searchInput.value || '';
    const rep = replaceInput.value || '';
    if (query && activeAdapter) {
      const current = activeAdapter.getMarkdown();
      const flags = searchState.matchCase ? '' : 'i';
      const reg = new RegExp(searchState.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const nextText = current.replace(reg, rep);
      activeAdapter.setMarkdown(nextText);
      executeSearch();
    }
  };

  btnReplaceAll.onclick = () => {
    const query = searchInput.value || '';
    const rep = replaceInput.value || '';
    if (query && activeAdapter) {
      const current = activeAdapter.getMarkdown();
      const flags = searchState.matchCase ? 'g' : 'gi';
      const reg = new RegExp(searchState.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const nextText = current.replaceAll(reg, rep);
      activeAdapter.setMarkdown(nextText);
      executeSearch();
    }
  };
}

function toggleFindAndReplaceBar(forceState) {
  const container = document.querySelector('#custom-search-bar');
  if (!container) return;

  const newState = forceState !== undefined ? forceState : container.classList.contains('hidden');
  if (newState) {
    container.classList.remove('hidden');
    const input = container.querySelector('#search-input');
    if (input) {
      input.focus();
      input.select();
    }
  } else {
    container.classList.add('hidden');
  }
}

function setupFastScrollbar() {
  const mainArea = document.querySelector('.cm-scroller');
  const track = document.querySelector('#fast-scrollbar-track');
  const thumb = document.querySelector('#fast-scrollbar-thumb');
  if (!mainArea || !track || !thumb) return;

  let lastScrollTop = mainArea.scrollTop;
  let lastScrollTime = Date.now();
  let hideTimer = null;
  let isDragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;

  const updateThumbPosition = () => {
    const scrollHeight = mainArea.scrollHeight;
    const clientHeight = mainArea.clientHeight;
    if (scrollHeight <= clientHeight + 10) return;

    const maxScroll = scrollHeight - clientHeight;
    const scrollRatio = Math.min(1, Math.max(0, mainArea.scrollTop / maxScroll));

    const trackHeight = track.clientHeight || window.innerHeight;
    const thumbHeight = thumb.clientHeight || 60;
    const availableTrack = trackHeight - thumbHeight;

    thumb.style.top = `${scrollRatio * availableTrack}px`;
  };

  mainArea.addEventListener('scroll', () => {
    if (isDragging) return;

    const now = Date.now();
    const dt = now - lastScrollTime;
    const dy = Math.abs(mainArea.scrollTop - lastScrollTop);
    const velocity = dt > 0 ? (dy / dt) : 0;

    lastScrollTop = mainArea.scrollTop;
    lastScrollTime = now;

    if (velocity > 4.5 || dy > 250) {
      updateThumbPosition();
      track.classList.add('visible');

      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!isDragging) {
          track.classList.remove('visible');
        }
      }, 1200);
    }
  }, { passive: true });

  thumb.addEventListener('pointerdown', (e) => {
    isDragging = true;
    dragStartY = e.clientY;
    dragStartScrollTop = mainArea.scrollTop;
    thumb.setPointerCapture(e.pointerId);
    track.classList.add('visible');
    clearTimeout(hideTimer);
  });

  thumb.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const deltaY = e.clientY - dragStartY;

    const trackHeight = track.clientHeight || window.innerHeight;
    const thumbHeight = thumb.clientHeight || 60;
    const availableTrack = trackHeight - thumbHeight;

    const scrollHeight = mainArea.scrollHeight;
    const clientHeight = mainArea.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    if (availableTrack > 0 && maxScroll > 0) {
      const scrollDelta = (deltaY / availableTrack) * maxScroll;
      mainArea.scrollTop = Math.min(maxScroll, Math.max(0, dragStartScrollTop + scrollDelta));
      updateThumbPosition();
    }
  });

  const stopDrag = () => {
    if (isDragging) {
      isDragging = false;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        track.classList.remove('visible');
      }, 1200);
    }
  };

  thumb.addEventListener('pointerup', stopDrag);
  thumb.addEventListener('pointercancel', stopDrag);
}

function updateTocActiveSection() {
  const tocContent = document.querySelector('#toc-content');
  if (!tocContent || !activeAdapter || !activeAdapter.view) return;

  const sel = activeAdapter.view.state.selection.main;
  const currentLine = activeAdapter.view.state.doc.lineAt(sel.head).number - 1;

  const rows = Array.from(tocContent.querySelectorAll('.toc-item'));
  let activeRow = null;

  rows.forEach(row => {
    row.classList.remove('active-section');
    const idx = parseInt(row.dataset.lineIndex, 10);
    if (!isNaN(idx) && currentLine >= idx) {
      activeRow = row;
    }
  });

  if (activeRow) {
    activeRow.classList.add('active-section');
    activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function setupTocGestureAndPanel() {
  const panel = document.querySelector('#toc-panel');
  const overlay = document.querySelector('#toc-overlay');
  const tocContent = document.querySelector('#toc-content');
  const globalToggleBtn = document.querySelector('#toc-global-toggle');
  if (!panel || !overlay) return;

  let isAllCollapsed = false;

  const openToc = () => {
    buildTocTree();
    panel.classList.add('open');
    overlay.classList.add('open');
  };

  const closeToc = () => {
    panel.classList.remove('open');
    overlay.classList.remove('open');
  };

  overlay.onclick = closeToc;

  if (globalToggleBtn) {
    globalToggleBtn.onclick = () => {
      isAllCollapsed = !isAllCollapsed;
      const itemRows = Array.from(tocContent.querySelectorAll('.toc-item'));
      itemRows.forEach(row => {
        const toggle = row.querySelector('.toc-toggle');
        const level = parseInt(row.dataset.level, 10) || 1;
        if (isAllCollapsed) {
          if (level > 1) row.style.display = 'none';
          if (toggle) toggle.textContent = '+';
        } else {
          row.style.display = 'flex';
          if (toggle) toggle.textContent = '-';
        }
      });
    };
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;

  window.addEventListener('touchstart', (e) => {
    const popupStrip = document.querySelector('#popup-toolbar-strip');
    if (popupStrip && popupStrip.contains(e.target)) {
      isSwiping = false;
      return;
    }
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isSwiping = true;
    }
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!isSwiping || e.changedTouches.length !== 1) return;
    isSwiping = false;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;

    const isSelectionActive = window.getSelection() && window.getSelection().toString().length > 0;
    if (!isSelectionActive && Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const screenWidth = window.innerWidth;
      const isRightEdgeTouch = touchStartX >= (screenWidth * 0.80);

      if (deltaX < 0 && !panel.classList.contains('open') && isRightEdgeTouch) {
        openToc();
      } else if (deltaX > 0 && panel.classList.contains('open')) {
        closeToc();
      }
    }
  }, { passive: true });

  function buildTocTree() {
    if (!tocContent || !activeAdapter) return;
    tocContent.innerHTML = '';

    const items = [];
    const text = activeAdapter.getMarkdown();
    const lines = text.split('\n');
    lines.forEach((line, lineIdx) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        items.push({
          level: match[1].length,
          title: match[2].trim(),
          lineIndex: lineIdx
        });
      }
    });

    if (items.length === 0) {
      tocContent.innerHTML = '<div style="padding:16px;color:#888;font-size:14px;">No headings in document.</div>';
      return;
    }

    items.forEach((item) => {
      const itemRow = document.createElement('div');
      itemRow.className = `toc-item level-${item.level}`;
      itemRow.dataset.level = item.level;
      itemRow.dataset.lineIndex = item.lineIndex;

      const toggleSpan = document.createElement('span');
      toggleSpan.className = 'toc-toggle';
      toggleSpan.textContent = '-';
      toggleSpan.onclick = (e) => {
        e.stopPropagation();
        const isCollapsed = toggleSpan.textContent === '+';
        toggleSpan.textContent = isCollapsed ? '-' : '+';
        let sibling = itemRow.nextElementSibling;
        while (sibling && parseInt(sibling.dataset.level, 10) > item.level) {
          sibling.style.display = isCollapsed ? 'flex' : 'none';
          sibling = sibling.nextElementSibling;
        }
      };

      const textSpan = document.createElement('span');
      textSpan.className = 'toc-text';
      textSpan.textContent = item.title;

      itemRow.appendChild(toggleSpan);
      itemRow.appendChild(textSpan);

      itemRow.onclick = () => {
        closeToc();
        if (item.lineIndex !== undefined && activeAdapter && activeAdapter.view) {
          try {
            const line = activeAdapter.view.state.doc.line(item.lineIndex + 1);
            activeAdapter.view.dispatch({
              selection: { anchor: line.from, head: line.from },
              scrollIntoView: true
            });
          } catch (e) {}
        }
      };

      tocContent.appendChild(itemRow);
    });

    updateTocActiveSection();
  }
}

function openWithOtherEngine() {
  const modes = ['wysiwyg', 'live_preview', 'source'];
  const nextIdx = (modes.indexOf(currentEditorMode) + 1) % modes.length;
  const targetMode = modes[nextIdx];

  setEditorMode(targetMode).then(() => {
    toggleBottomToolbar(true);
    if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
      const names = { wysiwyg: 'Pure WYSIWYG', live_preview: 'Obsidian Live Preview', source: 'Raw Source View' };
      window.AndroidNative.showToast(`Switched to ${names[targetMode]}`);
    }
  });
}

function toggleBottomToolbar(forceState) {
  const toggleBtn = document.querySelector('#floating-toggle-btn');
  const isCurrentlyHidden = document.body.classList.contains('toolbar-hidden');
  const shouldShow = forceState !== undefined ? forceState : isCurrentlyHidden;

  if (shouldShow) {
    document.body.classList.remove('toolbar-hidden');
    if (toggleBtn) toggleBtn.innerHTML = '⟩';
  } else {
    document.body.classList.add('toolbar-hidden');
    if (toggleBtn) toggleBtn.innerHTML = '⟨';
  }
}

function setupFloatingToggle() {
  const toggleBtn = document.querySelector('#floating-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      toggleBottomToolbar();
    };
  }
}

function matchSingleHotkey(event, shortcutString) {
  if (!shortcutString || typeof shortcutString !== 'string') return false;
  const parts = shortcutString.toLowerCase().trim().split('+');
  const hasCtrl = parts.includes('ctrl') || parts.includes('control');
  const hasAlt = parts.includes('alt');
  const hasShift = parts.includes('shift');
  const keyPart = parts.find(p => p !== 'ctrl' && p !== 'control' && p !== 'alt' && p !== 'shift');

  if (!keyPart || keyPart.length === 0) return false;

  const ctrlPressed = event.ctrlKey || event.metaKey;
  const altPressed = event.altKey;
  const shiftPressed = event.shiftKey;

  if (hasCtrl !== ctrlPressed) return false;
  if (hasAlt !== altPressed) return false;
  if (hasShift !== shiftPressed) return false;

  const keyLower = (event.key || '').toLowerCase();
  const codeLower = (event.code || '').toLowerCase();

  if (keyLower === keyPart) return true;
  if (codeLower === `key${keyPart}` || codeLower === keyPart) return true;
  if (keyPart === ',' && (keyLower === ',' || codeLower === 'comma')) return true;
  if (keyPart === '.' && (keyLower === '.' || codeLower === 'period')) return true;
  if (keyPart === 'tab' && (keyLower === 'tab' || codeLower === 'tab')) return true;

  return false;
}

function parseAndMatchHotkey(event, shortcutString) {
  if (!shortcutString || typeof shortcutString !== 'string') return false;
  const shortcuts = shortcutString.trim().split(/\s+/);
  return shortcuts.some(sc => matchSingleHotkey(event, sc));
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const c = (e.code || '').toLowerCase();

    if (k === 'enter' || k === 'return' || c === 'enter' || c === 'numpadenter' || k === 'space' || k === 'backspace' || k === 'delete') {
      return;
    }

    if (k === 'undo' || k === 'redo' || c === 'undo' || c === 'redo' || (e.ctrlKey && (k === 'z' || k === 'y'))) {
      return;
    }

    if (parseAndMatchHotkey(e, customHotkeys.new)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('new');
    } else if (parseAndMatchHotkey(e, customHotkeys.open)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('open');
    } else if (parseAndMatchHotkey(e, customHotkeys.save_as)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('save_as');
    } else if (parseAndMatchHotkey(e, customHotkeys.export)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('export');
    } else if (parseAndMatchHotkey(e, customHotkeys.save)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('save');
    } else if (parseAndMatchHotkey(e, customHotkeys.image)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('image');
    } else if (parseAndMatchHotkey(e, customHotkeys.settings)) {
      e.preventDefault();
      window.AndroidNative && window.AndroidNative.onNativeAction('settings');
    } else if (parseAndMatchHotkey(e, customHotkeys.toggle_toolbar)) {
      e.preventDefault();
      toggleBottomToolbar();
    } else if (parseAndMatchHotkey(e, customHotkeys.line_wrap)) {
      e.preventDefault();
      window.editorBridge.toggleLineWrap();
    } else if (parseAndMatchHotkey(e, customHotkeys.open_with)) {
      e.preventDefault();
      openWithOtherEngine();
    } else if (parseAndMatchHotkey(e, customHotkeys.line_numbers)) {
      e.preventDefault();
      window.editorBridge.toggleLineNumbers();
    } else if (parseAndMatchHotkey(e, customHotkeys.findAndReplace)) {
      e.preventDefault();
      toggleFindAndReplaceBar();
    }

    // Formatting shortcuts
    else if (parseAndMatchHotkey(e, customHotkeys.bold)) { e.preventDefault(); execCmd('bold'); }
    else if (parseAndMatchHotkey(e, customHotkeys.italic)) { e.preventDefault(); execCmd('italic'); }
    else if (parseAndMatchHotkey(e, customHotkeys.underline)) { e.preventDefault(); execCmd('underline'); }
    else if (parseAndMatchHotkey(e, customHotkeys.strikethrough)) { e.preventDefault(); execCmd('strikethrough'); }
    else if (parseAndMatchHotkey(e, customHotkeys.code)) { e.preventDefault(); execCmd('code'); }
    else if (parseAndMatchHotkey(e, customHotkeys.link)) { e.preventDefault(); execCmd('link'); }
    else if (parseAndMatchHotkey(e, customHotkeys.blockQuote)) { e.preventDefault(); execCmd('blockQuote'); }
    else if (parseAndMatchHotkey(e, customHotkeys.codeBlock)) { e.preventDefault(); execCmd('codeBlock'); }
    else if (parseAndMatchHotkey(e, customHotkeys.bulletedList)) { e.preventDefault(); execCmd('bulletedList'); }
    else if (parseAndMatchHotkey(e, customHotkeys.numberedList)) { e.preventDefault(); execCmd('numberedList'); }
    else if (parseAndMatchHotkey(e, customHotkeys.todoList)) { e.preventDefault(); execCmd('todoList'); }
    else if (parseAndMatchHotkey(e, customHotkeys.indent)) { e.preventDefault(); execCmd('indent'); }
    else if (parseAndMatchHotkey(e, customHotkeys.outdent)) { e.preventDefault(); execCmd('outdent'); }
    else if (parseAndMatchHotkey(e, customHotkeys.horizontalLine)) { e.preventDefault(); execCmd('horizontalLine'); }

    // Headings shortcuts
    else if (parseAndMatchHotkey(e, customHotkeys.heading_p)) { e.preventDefault(); execCmd('heading', { value: 'paragraph' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_1)) { e.preventDefault(); execCmd('heading', { value: 'heading1' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_2)) { e.preventDefault(); execCmd('heading', { value: 'heading2' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_3)) { e.preventDefault(); execCmd('heading', { value: 'heading3' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_4)) { e.preventDefault(); execCmd('heading', { value: 'heading4' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_5)) { e.preventDefault(); execCmd('heading', { value: 'heading5' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.heading_6)) { e.preventDefault(); execCmd('heading', { value: 'heading6' }); }

    // Highlight Markers & Pens
    else if (parseAndMatchHotkey(e, customHotkeys.highlight_yellow)) { e.preventDefault(); execCmd('highlight', { value: 'yellowMarker' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlight_green)) { e.preventDefault(); execCmd('highlight', { value: 'greenMarker' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlight_pink)) { e.preventDefault(); execCmd('highlight', { value: 'pinkMarker' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlight_blue)) { e.preventDefault(); execCmd('highlight', { value: 'blueMarker' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlight_red_pen) || parseAndMatchHotkey(e, customHotkeys.highlight_red)) { e.preventDefault(); execCmd('highlight', { value: 'redPen' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlight_green_pen)) { e.preventDefault(); execCmd('highlight', { value: 'greenPen' }); }
    else if (parseAndMatchHotkey(e, customHotkeys.highlight_remove)) { e.preventDefault(); execCmd('highlight', { value: null }); }
  }, true);
}

// Global JS Bridge exposure
window.editorBridge = {
  setEditorMode: function(mode) {
    return setEditorMode(mode);
  },
  getEditorMode: function() {
    return currentEditorMode;
  },
  applyAllPreferences: function(prefsJson) {
    if (!prefsJson) return;
    const prefs = typeof prefsJson === 'string' ? JSON.parse(prefsJson) : prefsJson;

    const setCssVar = (varName, val, unit = '') => {
      if (val !== undefined && val !== null && val !== 'default' && val !== '') {
        document.documentElement.style.setProperty(varName, val + unit);
      } else {
        document.documentElement.style.removeProperty(varName);
      }
    };

    if (prefs.pref_app_theme === 'light') {
      document.body.classList.add('light-theme');
    } else if (prefs.pref_app_theme === 'amoled') {
      document.body.classList.remove('light-theme');
    }
    if (prefs.pref_line_wrap === false) {
      document.body.classList.add('no-line-wrap');
    } else if (prefs.pref_line_wrap === true) {
      document.body.classList.remove('no-line-wrap');
    }

    setCssVar('--body-font-size', prefs.pref_body_font_size, 'px');
    setCssVar('--heading-scale', prefs.pref_heading_scale_percent ? (prefs.pref_heading_scale_percent / 100.0) : null);
    setCssVar('--bold-font-weight', prefs.pref_font_weight_bold);
    setCssVar('--italic-font-weight', prefs.pref_font_weight_italic);
    setCssVar('--heading-font-weight', prefs.pref_font_weight_heading);

    for (let i = 1; i <= 6; i++) {
      setCssVar(`--heading-${i}-color`, prefs[`pref_heading_${i}_color`]);
    }

    setCssVar('--bold-color', prefs.pref_bold_color);
    setCssVar('--italic-color', prefs.pref_italic_color);
    setCssVar('--link-color', prefs.pref_link_color);
    setCssVar('--code-color', prefs.pref_code_color);
    setCssVar('--code-bg-color', prefs.pref_code_bg_color);
    setCssVar('--code-padding', prefs.pref_code_padding, 'px');
    setCssVar('--code-border-radius', prefs.pref_code_border_radius, 'px');

    setCssVar('--blockquote-border-width', prefs.pref_blockquote_line_thickness, 'px');
    setCssVar('--blockquote-border-style', prefs.pref_blockquote_line_style);
    setCssVar('--blockquote-border-color', prefs.pref_blockquote_line_color);
    setCssVar('--blockquote-bg-color', prefs.pref_blockquote_bg_color);
    setCssVar('--blockquote-text-color', prefs.pref_blockquote_text_color);

    setCssVar('--hr-thickness', prefs.pref_hr_thickness, 'px');
    setCssVar('--hr-style', prefs.pref_hr_style);
    setCssVar('--hr-color', prefs.pref_hr_color);

    setCssVar('--toolbar-bg', prefs.pref_toolbar_bg_color);
    setCssVar('--toolbar-icon-color', prefs.pref_toolbar_icon_color);
    setCssVar('--toolbar-active-icon-color', prefs.pref_toolbar_active_icon_color);
    setCssVar('--toolbar-height', prefs.pref_toolbar_height, 'px');
  },
  getMarkdown: function() {
    if (pendingMarkdown !== null) return pendingMarkdown;
    if (typeof activeAdapter !== 'undefined' && activeAdapter) return activeAdapter.getMarkdown();
    return '';
  },
  setMarkdown: function(markdownText) {
    if (typeof activeAdapter !== 'undefined' && activeAdapter) {
      isProgrammaticChange = true;
      try {
        activeAdapter.setMarkdown(markdownText || '');
      } catch (e) {
        console.error('Error setting markdown:', e);
      }
      setTimeout(() => { isProgrammaticChange = false; }, 50);
    } else {
      pendingMarkdown = markdownText;
    }
  },
  toggleLineWrap: function() {
    isLineWrapEnabled = !isLineWrapEnabled;
    window.editorBridge.setLineWrap(isLineWrapEnabled);
    if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
      window.AndroidNative.showToast(isLineWrapEnabled ? 'Line wrap enabled' : 'Line wrap disabled');
    }
  },
  setLineWrap: function(enabled) {
    isLineWrapEnabled = !!enabled;
    if (activeAdapter) {
      activeAdapter.setLineWrap(isLineWrapEnabled);
    }
  },
  toggleLineNumbers: function() {
    if (activeAdapter && typeof activeAdapter.toggleLineNumbers === 'function') {
      const state = activeAdapter.toggleLineNumbers();
      if (window.AndroidNative && typeof window.AndroidNative.showToast === 'function') {
        window.AndroidNative.showToast(state ? 'Line numbers enabled' : 'Line numbers disabled');
      }
    }
  },
  setHotkeys: function(hotkeysJson) {
    if (!hotkeysJson) return;
    try {
      const parsed = typeof hotkeysJson === 'string' ? JSON.parse(hotkeysJson) : hotkeysJson;
      Object.assign(customHotkeys, parsed);
    } catch (e) {
      console.error('Failed to set hotkeys:', e);
    }
  },
  getSelectionState: function() {
    if (activeAdapter) return activeAdapter.getSelectionState();
    return { path: [], offset: 0 };
  },
  setSelectionState: function(stateJson, scrollTop) {
    if (activeAdapter) activeAdapter.setSelectionState(stateJson, scrollTop);
  },
  insertImage: function(imageUrl, altText = '') {
    if (activeAdapter && typeof activeAdapter.insertImage === 'function') {
      activeAdapter.insertImage(imageUrl, altText);
    } else if (activeAdapter) {
      const imgMarkdown = `![${altText}](${imageUrl})`;
      const cur = activeAdapter.getMarkdown();
      activeAdapter.setMarkdown(cur ? `${cur}\n${imgMarkdown}` : imgMarkdown);
    }
  },
  setTheme: function(themeName) {
    if (themeName === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  },
  setDocumentTitle: function(title) {
    const titleEl = document.querySelector('#file-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  },
  setFontSettings: function(bodyFontSizePx, headingScale, boldColor, italicColor, linkColor, codeColor, codeBgColor, codeBlockColor, codeBlockBgColor, fontBodyData, fontHeadingData, fontBoldData, fontItalicData, fontCodeData, fontWeightBold, fontWeightItalic, fontWeightHeading) {
    const setCssVar = (varName, val) => {
      if (val && val !== 'default') {
        document.documentElement.style.setProperty(varName, val);
      } else {
        document.documentElement.style.removeProperty(varName);
      }
    };

    if (bodyFontSizePx) {
      document.documentElement.style.setProperty('--body-font-size', bodyFontSizePx + 'px');
    }
    if (headingScale) {
      document.documentElement.style.setProperty('--heading-scale', headingScale);
    }
    if (fontWeightBold) {
      document.documentElement.style.setProperty('--bold-font-weight', fontWeightBold);
    }
    if (fontWeightItalic) {
      document.documentElement.style.setProperty('--italic-font-weight', fontWeightItalic);
    }
    if (fontWeightHeading) {
      document.documentElement.style.setProperty('--heading-font-weight', fontWeightHeading);
    }
    setCssVar('--bold-color', boldColor);
    setCssVar('--italic-color', italicColor);
    setCssVar('--link-color', linkColor);
    setCssVar('--code-color', codeColor);
    setCssVar('--code-bg-color', codeBgColor);

    let styleEl = document.querySelector('#custom-fonts-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-fonts-style';
      document.head.appendChild(styleEl);
    }

    let fontCss = '';
    const applyFontCategory = (categoryName, fontData, cssVarName) => {
      if (fontData && fontData.length > 10) {
        const familyName = `CustomFont_${categoryName}`;
        fontCss += `
          @font-face {
            font-family: '${familyName}';
            src: url('${fontData}');
          }
          .cm-content {
            --custom-${categoryName.toLowerCase()}-font: '${familyName}';
          }
        `;
        document.documentElement.style.setProperty(cssVarName, `'${familyName}'`);
      } else {
        document.documentElement.style.removeProperty(cssVarName);
      }
    };

    applyFontCategory('Body', fontBodyData, '--body-font-family');
    applyFontCategory('Heading', fontHeadingData, '--heading-font-family');
    applyFontCategory('Bold', fontBoldData, '--bold-font-family');
    applyFontCategory('Italic', fontItalicData, '--italic-font-family');
    applyFontCategory('Code', fontCodeData, '--code-font-family');

    styleEl.innerHTML = fontCss;
  },
  configurePlugins: function() {
    return Promise.resolve();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  setupFloatingToggle();
  setupKeyboardShortcuts();
  if (window.AndroidNative && typeof window.AndroidNative.onHostReady === 'function') {
    window.AndroidNative.onHostReady();
  } else {
    setEditorMode('wysiwyg');
  }
});

window.addEventListener('error', () => window.AndroidNative?.reportDiagnostic?.('js_error', 0));
window.addEventListener('unhandledrejection', () => window.AndroidNative?.reportDiagnostic?.('js_rejection', 0));
