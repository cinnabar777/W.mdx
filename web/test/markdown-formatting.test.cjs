const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('inline formatting state follows the syntax at the cursor and selection', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { GFM, Strikethrough } = await import('@lezer/markdown');
  const { getMarkdownFormattingState, isMarkdownFormatActive } =
    await import('../src/markdownFormatting.js');
  const doc = '**bold** *italic* ~~strike~~ `code` <u>underlined</u> ==marked==';
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(4),
    extensions: [markdown({ extensions: [GFM, Strikethrough] })]
  });
  const view = { state };

  assert.equal(isMarkdownFormatActive(view, 'bold'), true);
  assert.equal(isMarkdownFormatActive(view, 'italic'), false);

  view.state = view.state.update({
    selection: EditorSelection.range(doc.indexOf('italic') + 1, doc.indexOf('italic') + 4)
  }).state;
  const formatting = getMarkdownFormattingState(view);
  assert.equal(formatting.italic, true);
  assert.equal(formatting.strikethrough, false);

  view.state = view.state.update({
    selection: EditorSelection.cursor(doc.indexOf('strike') + 2)
  }).state;
  assert.equal(isMarkdownFormatActive(view, 'strikethrough'), true);

  view.state = view.state.update({
    selection: EditorSelection.cursor(doc.indexOf('code') + 2)
  }).state;
  assert.equal(isMarkdownFormatActive(view, 'code'), true);

  view.state = view.state.update({
    selection: EditorSelection.cursor(doc.indexOf('underlined') + 2)
  }).state;
  assert.equal(isMarkdownFormatActive(view, 'underline'), true);

  view.state = view.state.update({
    selection: EditorSelection.cursor(doc.indexOf('marked') + 2)
  }).state;
  assert.equal(isMarkdownFormatActive(view, 'yellowMarker'), true);
  assert.equal(isMarkdownFormatActive(view, 'blueMarker'), true);
});

test('the same inline toolbar action toggles formatting instead of nesting it', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { toggleMarkdownFormat, isMarkdownFormatActive } =
    await import('../src/markdownFormatting.js');
  const initial = '**bold text** and plain';
  const selection = EditorSelection.range(2, 11);
  const state = EditorState.create({ doc: initial, selection, extensions: [markdown()] });
  const view = {
    state,
    dispatch(transaction) {
      this.state = this.state.update(transaction).state;
    },
    focus() {}
  };

  assert.equal(isMarkdownFormatActive(view, 'bold'), true);
  assert.equal(toggleMarkdownFormat(view, 'bold'), true);
  assert.equal(view.state.doc.toString(), 'bold text and plain');
  assert.equal(view.state.selection.main.from, 0);
  assert.equal(view.state.selection.main.to, 9);

  assert.equal(toggleMarkdownFormat(view, 'bold'), true);
  assert.equal(view.state.doc.toString(), '**bold text** and plain');
  assert.equal(toggleMarkdownFormat(view, 'bold'), true);
  assert.equal(view.state.doc.toString(), 'bold text and plain');
});

test('partial formatting removal keeps the unselected text formatted', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { toggleMarkdownFormat } = await import('../src/markdownFormatting.js');
  const state = EditorState.create({
    doc: '**bold text**',
    selection: EditorSelection.range(2, 6),
    extensions: [markdown()]
  });
  const view = {
    state,
    dispatch(transaction) {
      this.state = this.state.update(transaction).state;
    },
    focus() {}
  };

  toggleMarkdownFormat(view, 'bold');
  assert.equal(view.state.doc.toString(), 'bold **text**');
  assert.equal(view.state.doc.sliceString(view.state.selection.main.from, view.state.selection.main.to), 'bold');
});

test('applying a format to mixed selected text does not nest it over existing syntax', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { toggleMarkdownFormat } = await import('../src/markdownFormatting.js');
  const doc = '**bold** plain';
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(2, doc.length),
    extensions: [markdown()]
  });
  const view = {
    state,
    dispatch(transaction) {
      this.state = this.state.update(transaction).state;
    },
    focus() {}
  };

  toggleMarkdownFormat(view, 'bold');
  assert.equal(view.state.doc.toString(), '**bold plain**');
  assert.equal(
    view.state.doc.sliceString(view.state.selection.main.from, view.state.selection.main.to),
    'bold plain'
  );
});

test('every inline format removes its existing wrapper when toggled again', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { GFM, Strikethrough } = await import('@lezer/markdown');
  const { toggleMarkdownFormat } = await import('../src/markdownFormatting.js');
  const formats = [
    { name: 'italic', doc: '*text*', start: 1, end: 5, plain: 'text' },
    { name: 'strikethrough', doc: '~~text~~', start: 2, end: 6, plain: 'text' },
    { name: 'code', doc: '`text`', start: 1, end: 5, plain: 'text' },
    { name: 'underline', doc: '<u>text</u>', start: 3, end: 7, plain: 'text' },
    { name: 'yellowMarker', doc: '==text==', start: 2, end: 6, plain: 'text' },
    { name: 'redPen', doc: '<span style="color:red">text</span>', start: 24, end: 28, plain: 'text' }
  ];

  for (const format of formats) {
    const state = EditorState.create({
      doc: format.doc,
      selection: EditorSelection.range(format.start, format.end),
      extensions: [markdown({ extensions: [GFM, Strikethrough] })]
    });
    const view = {
      state,
      dispatch(transaction) {
        this.state = this.state.update(transaction).state;
      },
      focus() {}
    };
    toggleMarkdownFormat(view, format.name);
    assert.equal(view.state.doc.toString(), format.plain, `${format.name} removes its existing syntax`);
  }
});

test('an empty inline-format pair can be toggled off at the caret', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { toggleMarkdownFormat } = await import('../src/markdownFormatting.js');
  const state = EditorState.create({
    doc: 'word',
    selection: EditorSelection.cursor(2),
    extensions: [markdown()]
  });
  const view = {
    state,
    dispatch(transaction) {
      this.state = this.state.update(transaction).state;
    },
    focus() {}
  };

  toggleMarkdownFormat(view, 'bold');
  assert.equal(view.state.doc.toString(), 'wo****rd');
  toggleMarkdownFormat(view, 'bold');
  assert.equal(view.state.doc.toString(), 'word');
});

test('popup toolbar items expose syntax state and follow editor selection updates', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(source.includes('data-toolbar-command'), 'popup controls are keyed by the syntax they edit');
  assert.ok(source.includes('refreshToolbarSyntaxState(update.view)'), 'selection and document changes refresh active controls');
  assert.ok(source.includes('button.setAttribute(\'aria-pressed\', String(active))'), 'active state is accessible');
  assert.ok(styles.includes('.grouped-key-btn.has-active-syntax'), 'closed toolbar groups show when their syntax is active');
  assert.ok(styles.includes('.popup-strip-btn.active'), 'the matching popup action is visibly highlighted');
});
