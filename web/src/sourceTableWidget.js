import { EditorState, Transaction } from '@codemirror/state';
import {
  EditorView,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  keymap
} from '@codemirror/view';
import { defaultKeymap, redo, undo } from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';

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
  constructor({ markdown, from, to, language, highlightStyle }) {
    super();
    this.markdown = markdown;
    this.from = from;
    this.to = to;
    this.language = language;
    this.highlightStyle = highlightStyle;
  }

  eq(other) {
    return other instanceof SourceTableWidget &&
      other.markdown === this.markdown &&
      other.from === this.from &&
      other.to === this.to;
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
          if (!update.docChanged || mount._syncingFromParent) return;
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
          const nextMarkdown = update.state.doc.toString();
          if (parentView.state.doc.sliceString(from, to) === nextMarkdown) return;
          parentView.dispatch({
            changes: { from, to, insert: nextMarkdown }
          });
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
            overflowX: 'auto',
            overflowY: 'hidden'
          },
          '.cm-content': {
            width: 'max-content',
            minWidth: '100%',
            maxWidth: 'none'
          },
          '.cm-line': {
            width: 'max-content',
            minWidth: '100%',
            whiteSpace: 'pre'
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
