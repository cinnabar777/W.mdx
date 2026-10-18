import { EditorState, Compartment, StateField, StateEffect } from '@codemirror/state';
import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, ViewPlugin, WidgetType, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo as cmUndo, redo as cmRedo } from '@codemirror/commands';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, syntaxTree, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { GFM, Table as GFMTable, Strikethrough as GFMStrikethrough, TaskList as GFMTaskList } from '@lezer/markdown';

let view = null;
let currentMode = 'wysiwyg'; // 'wysiwyg' | 'live_preview' | 'source'
let lineWrapCompartment = new Compartment();
let lineNumbersCompartment = new Compartment();
let pluginCompartment = new Compartment();

let isLineWrapEnabled = true;
let isLineNumbersEnabled = false;
let activePlugins = [];
let registeredPluginExtensions = [];

// Custom Hotkeys config
let customHotkeys = {
  bold: 'ctrl+b',
  italic: 'ctrl+i',
  undo: 'ctrl+z',
  redo: 'ctrl+y'
};

// --- Obsidian & Pure WYSIWYG Decorations & Widgets ---

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
    input.className = 'cm-task-widget';
    input.addEventListener('change', (e) => {
      const pos = this.pos;
      const doc = view.state.doc.toString();
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      const newText = this.checked ? text.replace('[x]', '[ ]') : text.replace('[ ]', '[x]');
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText }
      });
    });
    return input;
  }
}

class LinkWidget extends WidgetType {
  constructor(text, url) {
    super();
    this.text = text;
    this.url = url;
  }

  toDOM() {
    const a = document.createElement('a');
    a.className = 'cm-link-widget';
    a.textContent = this.text || this.url;
    a.href = this.url;
    a.target = '_blank';
    a.addEventListener('click', (e) => {
      if (window.AndroidHost && window.AndroidHost.openExternalUrl) {
        e.preventDefault();
        window.AndroidHost.openExternalUrl(this.url);
      }
    });
    return a;
  }
}

// Extension to render Live Preview & WYSIWYG elements
function createWysiwygExtension() {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.computeDecorations(view);
      }

      update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = this.computeDecorations(update.view);
        }
      }

      computeDecorations(view) {
        if (currentMode === 'source') {
          return Decoration.none;
        }

        const builder = [];
        const selection = view.state.selection.main;
        const cursorHead = selection.head;

        syntaxTree(view.state).iterate({
          enter: (node) => {
            const line = view.state.doc.lineAt(node.from);
            const isCursorOnLine = cursorHead >= line.from && cursorHead <= line.to;

            // In Pure WYSIWYG mode, hide formatting syntax even if cursor is on line unless in editing sub-range
            // In Live Preview, expand formatting on active line
            const hideSyntax = (currentMode === 'wysiwyg') || !isCursorOnLine;

            if (node.name === 'HeaderMark' && hideSyntax) {
              builder.push(Decoration.replace({}).range(node.from, node.to));
            } else if (node.name === 'EmphasisMark' && hideSyntax) {
              builder.push(Decoration.replace({}).range(node.from, node.to));
            } else if (node.name === 'CodeMark' && hideSyntax) {
              builder.push(Decoration.replace({}).range(node.from, node.to));
            } else if (node.name === 'TaskMarker' && hideSyntax) {
              const text = view.state.sliceDoc(node.from, node.to);
              const checked = text.includes('x') || text.includes('X');
              builder.push(
                Decoration.replace({
                  widget: new CheckboxWidget(checked, node.from)
                }).range(node.from, node.to)
              );
            }
          }
        });

        return Decoration.set(builder, true);
      }
    },
    {
      decorations: (v) => v.decorations
    }
  );
}

// Highlight styles
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, class: 'cm-header-1' },
  { tag: tags.heading2, class: 'cm-header-2' },
  { tag: tags.heading3, class: 'cm-header-3' },
  { tag: tags.heading4, class: 'cm-header-4' },
  { tag: tags.heading5, class: 'cm-header-5' },
  { tag: tags.heading6, class: 'cm-header-6' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-emphasis' },
  { tag: tags.strikethrough, class: 'cm-strikethrough' },
  { tag: tags.monospace, class: 'cm-codeblock-widget' }
]);

// --- Obsidian Plugin Compatibility Architecture ---

class ObsidianPluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
  }

  registerPlugin(manifest, pluginFactory) {
    const pluginInstance = {
      manifest,
      factory: pluginFactory,
      enabled: false,
      instance: null,
      extensions: []
    };
    this.plugins.set(manifest.id, pluginInstance);
    this.enablePlugin(manifest.id);
  }

  enablePlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.enabled) return;

    const api = {
      registerEditorExtension: (ext) => {
        plugin.extensions.push(ext);
        this.updateEditorExtensions();
      },
      addCommand: (cmd) => {
        if (!this.hooks.has(cmd.id)) {
          this.hooks.set(cmd.id, cmd.callback);
        }
      },
      registerEvent: (eventName, callback) => {
        if (!this.hooks.has(eventName)) {
          this.hooks.set(eventName, []);
        }
        this.hooks.get(eventName).push(callback);
      }
    };

    if (typeof plugin.factory === 'function') {
      plugin.instance = plugin.factory(api);
    }
    plugin.enabled = true;
    this.updateEditorExtensions();
  }

  disablePlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin || !plugin.enabled) return;
    plugin.enabled = false;
    plugin.extensions = [];
    this.updateEditorExtensions();
  }

  updateEditorExtensions() {
    registeredPluginExtensions = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        registeredPluginExtensions.push(...plugin.extensions);
      }
    }
    if (view) {
      view.dispatch({
        effects: pluginCompartment.reconfigure(registeredPluginExtensions)
      });
    }
  }

  triggerEvent(eventName, data) {
    const listeners = this.hooks.get(eventName);
    if (Array.isArray(listeners)) {
      listeners.forEach((fn) => fn(data));
    }
  }
}

const pluginRegistry = new ObsidianPluginRegistry();

// --- Init Editor ---

function createEditor(initialContent = '') {
  const container = document.getElementById('editor-container');
  container.innerHTML = '';

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSpecialChars(),
      cmMarkdown({
        extensions: [GFM, GFMTable, GFMStrikethrough, GFMTaskList]
      }),
      syntaxHighlighting(markdownHighlightStyle),
      createWysiwygExtension(),
      lineWrapCompartment.of(isLineWrapEnabled ? EditorView.lineWrapping : []),
      lineNumbersCompartment.of(isLineNumbersEnabled ? lineNumbers() : []),
      pluginCompartment.of(registeredPluginExtensions),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          updateWordCount();
          notifyNativeDocumentChanged();
          pluginRegistry.triggerEvent('docChanged', update);
        }
      })
    ]
  });

  view = new EditorView({
    state,
    parent: container
  });

  updateWordCount();
}

function updateWordCount() {
  if (!view) return;
  const text = view.state.doc.toString();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const statusEl = document.getElementById('status-info');
  if (statusEl) {
    statusEl.textContent = `${words} words`;
  }
}

function notifyNativeDocumentChanged() {
  if (window.AndroidHost && window.AndroidHost.onDocumentChanged) {
    window.AndroidHost.onDocumentChanged(view.state.doc.toString());
  }
}

// --- Native Bridge API (`window.editorBridge`) ---

window.editorBridge = {
  getMarkdown: () => {
    return view ? view.state.doc.toString() : '';
  },

  setMarkdown: (content) => {
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content || '' }
    });
  },

  setEditorMode: (mode) => {
    if (['wysiwyg', 'live_preview', 'source'].includes(mode)) {
      currentMode = mode;
      const btn = document.getElementById('btn-mode-toggle');
      if (btn) {
        const modeLabels = { wysiwyg: 'Mode: WYSIWYG', live_preview: 'Mode: Live Preview', source: 'Mode: Raw Source' };
        btn.textContent = modeLabels[mode];
      }
      if (view) {
        // Trigger re-render of decorations
        view.dispatch({});
      }
    }
  },

  getEditorMode: () => currentMode,

  toggleLineWrap: () => {
    isLineWrapEnabled = !isLineWrapEnabled;
    if (view) {
      view.dispatch({
        effects: lineWrapCompartment.reconfigure(isLineWrapEnabled ? EditorView.lineWrapping : [])
      });
    }
    return isLineWrapEnabled;
  },

  toggleLineNumbers: () => {
    isLineNumbersEnabled = !isLineNumbersEnabled;
    if (view) {
      view.dispatch({
        effects: lineNumbersCompartment.reconfigure(isLineNumbersEnabled ? lineNumbers() : [])
      });
    }
    return isLineNumbersEnabled;
  },

  registerPlugin: (manifest, factory) => {
    pluginRegistry.registerPlugin(manifest, factory);
  },

  enablePlugin: (id) => pluginRegistry.enablePlugin(id),
  disablePlugin: (id) => pluginRegistry.disablePlugin(id)
};

// UI Listeners
document.addEventListener('DOMContentLoaded', () => {
  createEditor('# Welcome to WMdx\n\n- [x] True WYSIWYG CodeMirror 6 Editor\n- [ ] Obsidian Plugin Compatibility');

  const modeBtn = document.getElementById('btn-mode-toggle');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      const modes = ['wysiwyg', 'live_preview', 'source'];
      const nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
      window.editorBridge.setEditorMode(modes[nextIdx]);
    });
  }
});
