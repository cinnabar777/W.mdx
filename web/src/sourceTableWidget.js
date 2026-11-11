import { EditorState, Transaction } from '@codemirror/state';
import {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  keymap
} from '@codemirror/view';
import { defaultKeymap, redo, undo } from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';

function isEscaped(text, position) {
  let slashCount = 0;
  for (let index = position - 1; index >= 0 && text[index] === '\\'; index--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function getPipeTableCells(text) {
  const pipes = [];
  let codeTicks = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '`' && !isEscaped(text, index)) {
      let end = index + 1;
      while (text[end] === '`') end++;
      const runLength = end - index;
      if (!codeTicks) codeTicks = runLength;
      else if (codeTicks === runLength) codeTicks = 0;
      index = end - 1;
      continue;
    }
    if (text[index] === '|' && !codeTicks && !isEscaped(text, index)) {
      pipes.push(index);
    }
  }
  if (!pipes.length) return null;

  const leadingPipe = pipes[0] === 0;
  const trailingPipe = pipes[pipes.length - 1] === text.length - 1;
  const cells = [];
  let cellStart = leadingPipe ? 1 : 0;
  for (let index = leadingPipe ? 1 : 0; index < pipes.length; index++) {
    const pipe = pipes[index];
    cells.push({ from: cellStart, to: pipe, pipe });
    cellStart = pipe + 1;
  }
  if (!trailingPipe && cellStart <= text.length) {
    cells.push({ from: cellStart, to: text.length, pipe: null });
  }
  return { cells, leadingPipe };
}

function buildPipeAlignmentDecorations(view) {
  const rows = [];
  const columnWidths = [];
  let hasLeadingPipe = false;
  let hasUnledRow = false;
  for (let number = 1; number <= view.state.doc.lines; number++) {
    const line = view.state.doc.line(number);
    const parsed = getPipeTableCells(line.text);
    if (!parsed) continue;
    hasLeadingPipe ||= parsed.leadingPipe;
    hasUnledRow ||= !parsed.leadingPipe;
    rows.push({ line, cells: parsed.cells });
    parsed.cells.forEach((cell, column) => {
      columnWidths[column] = Math.max(
        columnWidths[column] || 0,
        cell.to - cell.from
      );
    });
  }

  const ranges = [];
  for (const { line, cells } of rows) {
    const hasPipePadding = hasLeadingPipe && hasUnledRow && !line.text.startsWith('|');
    if (hasPipePadding) {
      ranges.push(Decoration.line({
        attributes: { class: 'cm-source-table-align-leading-pipe' }
      }).range(line.from));
    }
    for (let column = 0; column < cells.length; column++) {
      const cell = cells[column];
      if (cell.pipe === null) continue;
      const width = columnWidths[column] || 0;
      const padding = Math.max(0, width - (cell.to - cell.from));
      ranges.push(Decoration.mark({
        class: 'cm-source-table-aligned-pipe',
        attributes: { style: `margin-left:${padding}ch` }
      }).range(line.from + cell.pipe, line.from + cell.pipe + 1));
    }
  }
  return Decoration.set(ranges, true);
}

const pipeAlignmentExtension = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildPipeAlignmentDecorations(view);
    }

    update(update) {
      if (update.docChanged) {
        this.decorations = buildPipeAlignmentDecorations(update.view);
      }
    }
  },
  { decorations: value => value.decorations }
);

function minimalChange(before, after) {
  let from = 0;
  while (
    from < before.length &&
    from < after.length &&
    before.charCodeAt(from) === after.charCodeAt(from)
  ) {
    from++;
  }

  let beforeTo = before.length;
  let afterTo = after.length;
  while (
    beforeTo > from &&
    afterTo > from &&
    before.charCodeAt(beforeTo - 1) === after.charCodeAt(afterTo - 1)
  ) {
    beforeTo--;
    afterTo--;
  }
  return {
    from,
    to: beforeTo,
    insert: after.slice(from, afterTo)
  };
}

export class SourceTableWidget extends WidgetType {
  constructor({
    markdown,
    from,
    to,
    language,
    highlightStyle,
    horizontalScrollEnabled = true
  }) {
    super();
    this.markdown = markdown;
    this.from = from;
    this.to = to;
    this.language = language;
    this.highlightStyle = highlightStyle;
    this.horizontalScrollEnabled = horizontalScrollEnabled !== false;
  }

  eq(other) {
    return other instanceof SourceTableWidget &&
      other.language === this.language &&
      other.highlightStyle === this.highlightStyle &&
      other.horizontalScrollEnabled === this.horizontalScrollEnabled;
  }

  updateDOM(dom, parentView) {
    const mount = dom.querySelector('.cm-source-table-editor');
    const childView = mount?._sourceTableEditor;
    if (!mount || !childView) return false;

    dom.dataset.tableFrom = String(this.from);
    dom.dataset.tableTo = String(this.to);
    const current = childView.state.doc.toString();
    if (current !== this.markdown) {
      mount._syncingFromParent = true;
      try {
        childView.dispatch({
          changes: minimalChange(current, this.markdown),
          annotations: Transaction.addToHistory.of(false)
        });
      } finally {
        mount._syncingFromParent = false;
      }
    }
    return true;
  }

  toDOM(parentView) {
    const doc = parentView.dom.ownerDocument;
    const wrapper = doc.createElement('div');
    wrapper.className = 'cm-source-table-widget';
    wrapper.dataset.tableFrom = String(this.from);
    wrapper.dataset.tableTo = String(this.to);
    wrapper.dataset.horizontalScrollEnabled = String(this.horizontalScrollEnabled);

    const mount = doc.createElement('div');
    mount.className = 'cm-source-table-editor';
    wrapper.appendChild(mount);

    const parentUndo = () => undo(parentView);
    const parentRedo = () => redo(parentView);
    const childState = EditorState.create({
      doc: this.markdown,
      extensions: [
        this.language,
        syntaxHighlighting(this.highlightStyle),
        pipeAlignmentExtension,
        drawSelection(),
        highlightActiveLine(),
        keymap.of([
          { key: 'Mod-z', run: parentUndo },
          { key: 'Mod-Shift-z', run: parentRedo },
          { key: 'Mod-y', run: parentRedo },
          ...defaultKeymap
        ]),
        EditorView.contentAttributes.of({
          autocapitalize: 'off',
          spellcheck: 'false'
        }),
        EditorView.updateListener.of(update => {
          if (mount._syncingFromParent) return;
          if (!parentView.dom.isConnected) return;
          const from = Number(wrapper.dataset.tableFrom);
          const to = Number(wrapper.dataset.tableTo);
          if (
            !Number.isInteger(from) ||
            !Number.isInteger(to) ||
            from < 0 ||
            to < from ||
            to > parentView.state.doc.length
          ) return;
          const spec = {};
          if (update.docChanged) {
            const nextMarkdown = update.state.doc.toString();
            if (parentView.state.doc.sliceString(from, to) !== nextMarkdown) {
              spec.changes = { from, to, insert: nextMarkdown };
            }
          }
          if (update.docChanged || update.selectionSet) {
            const selection = update.state.selection.main;
            const anchor = from + selection.anchor;
            const head = from + selection.head;
            const parentSelection = parentView.state.selection.main;
            if (
              update.docChanged ||
              parentSelection.anchor !== anchor ||
              parentSelection.head !== head
            ) {
              spec.selection = { anchor, head };
            }
          }
          if (spec.changes || spec.selection) {
            parentView.dispatch(spec);
          }
        }),
        EditorView.theme({
          '&': {
            width: '100%',
            height: 'auto',
            backgroundColor: 'transparent',
            color: 'var(--source-editor-text-color, var(--text-color, #fff))',
            fontFamily: 'var(--source-editor-font-family, ui-monospace, monospace)',
            fontSize: 'var(--source-editor-font-size, 14px)'
          },
          '.cm-scroller': {
            overflowX: this.horizontalScrollEnabled ? 'auto' : 'hidden',
            overflowY: 'hidden'
          },
          '.cm-content': {
            width: this.horizontalScrollEnabled ? 'max-content' : '100%',
            minWidth: '100%',
            maxWidth: this.horizontalScrollEnabled ? 'none' : '100%'
          },
          '.cm-line': {
            width: this.horizontalScrollEnabled ? 'max-content' : '100%',
            minWidth: '100%',
            whiteSpace: this.horizontalScrollEnabled ? 'pre' : 'pre-wrap',
            overflowWrap: this.horizontalScrollEnabled ? 'normal' : 'anywhere'
          }
        })
      ]
    });

    const childView = new EditorView({
      state: childState,
      parent: mount
    });
    mount._sourceTableEditor = childView;
    wrapper._sourceTableEditor = childView;
    return wrapper;
  }

  destroy(dom) {
    const childView = dom?._sourceTableEditor ||
      dom?.querySelector?.('.cm-source-table-editor')?._sourceTableEditor;
    childView?.destroy();
  }

  ignoreEvent() {
    return true;
  }
}
