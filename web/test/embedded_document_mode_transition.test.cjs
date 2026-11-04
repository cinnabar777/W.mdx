const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const projectRoot = path.resolve(__dirname, '../..');
const appAssets = path.join(projectRoot, 'app/src/main/assets/www');

test('embedded undo stays in the child editor and survives mode transitions', async () => {
  const html = fs.readFileSync(path.join(appAssets, 'index.html'), 'utf8');
  const bundle = fs.readFileSync(path.join(appAssets, 'bundle.js'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://wmdx.test/',
    virtualConsole
  });
  const window = dom.window;
  const rect = () => ({
    x: 0, y: 0, width: 640, height: 480,
    top: 0, right: 640, bottom: 480, left: 0,
    toJSON() { return this; }
  });

  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function() {};
  window.HTMLElement.prototype.getBoundingClientRect = rect;
  window.Range.prototype.getBoundingClientRect = rect;
  window.Range.prototype.getClientRects = () => [];
  window.AndroidNative = {
    getCurrentDocumentSessionId: () => 'mode-transition-test',
    onEditorReady: () => {},
    loadEmbeddedMarkdown: () => JSON.stringify({
      ok: true,
      markdown: '# Embedded document'
    }),
    saveEmbeddedMarkdown: () => true,
    resolveEmbeddedAssetUrl: () => '',
    getEmbeddedContentInteractionMode: () => 'full',
    canOpenAttachment: () => false,
    onContentChanged: () => {},
    onDirtyStateChanged: () => {},
    reportDiagnostic: (kind, detail) => errors.push(`${kind}: ${detail}`)
  };

  try {
    window.eval(bundle);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 20));
    await window.editorBridge.setEditorMode('wysiwyg');
    window.editorBridge.applyAllPreferences({
      pref_embedded_content_limited_interaction: false,
      pref_embedded_content_full_inline_editing: true
    });

    window.editorBridge.setMarkdown('');
    window.editorBridge.insertEmbeddedDocumentLink(
      'assets/notes.md',
      'Project notes'
    );
    await new Promise(resolve => setTimeout(resolve, 20));

    const markdown = window.editorBridge.getMarkdown();
    assert.equal(markdown, '![[assets/notes.md|Project notes]]\n\n');
    assert.equal(window.editorBridge.getMarkdown(), markdown);
    assert.ok(
      window.document.querySelector('.cm-embedded-document-shell'),
      'WYSIWYG should render the embedded document'
    );

    const notesShell = [...window.document.querySelectorAll(
      '.cm-embedded-document-shell'
    )].find(shell => shell.dataset.embeddedSource === 'assets/notes.md');
    const childEditor = notesShell?.__embeddedDocumentEditor;
    assert.ok(
      childEditor,
      `the embedded document should have its own editor; found ${JSON.stringify(
        [...window.document.querySelectorAll('.cm-embedded-document-shell')]
          .map(shell => ({
            source: shell.dataset.embeddedSource,
            label: shell.getAttribute('aria-label'),
            hasEditor: Boolean(shell.__embeddedDocumentEditor)
          }))
      )}`
    );
    const originalChildMarkdown = childEditor.state.doc.toString();
    const childEdit = '\nInline edit';
    childEditor.dispatch({
      changes: {
        from: childEditor.state.doc.length,
        insert: childEdit
      },
      selection: {
        anchor: childEditor.state.doc.length + childEdit.length
      },
      userEvent: 'input'
    });
    childEditor.contentDOM.dispatchEvent(
      new window.FocusEvent('focusin', { bubbles: true })
    );

    const undoButton = window.document.querySelector('#grp-btn-undo');
    assert.ok(undoButton, 'the toolbar should expose its undo action');
    undoButton.click();
    assert.equal(childEditor.state.doc.toString(), originalChildMarkdown);
    assert.equal(window.editorBridge.getMarkdown(), markdown);
    assert.ok(
      window.document.querySelector('.cm-embedded-document-shell'),
      'undo should not remove the embedded document from the parent'
    );

    undoButton.click();
    assert.equal(
      window.editorBridge.getMarkdown(),
      markdown,
      'an empty child history should not fall through to parent history'
    );

    await window.editorBridge.setEditorMode('live_preview');
    assert.equal(window.editorBridge.getMarkdown(), markdown);
    assert.ok(
      window.document.querySelector('.cm-embedded-document-shell'),
      'Live Preview should render the embedded document'
    );

    await window.editorBridge.setEditorMode('source');
    assert.equal(window.editorBridge.getMarkdown(), markdown);
    assert.ok(
      window.document.querySelector('#editor .cm-content')
        ?.textContent.includes('![[assets/notes.md|Project notes]]'),
      'Source should show the original Obsidian embed syntax'
    );
    assert.deepEqual(errors, [], 'mode changes should not emit editor errors');
  } finally {
    dom.window.close();
  }
});
