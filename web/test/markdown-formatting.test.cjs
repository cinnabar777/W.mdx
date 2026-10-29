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
  assert.equal(isMarkdownFormatActive(view, 'highlightYellow'), true);
  assert.equal(isMarkdownFormatActive(view, 'highlightBlue'), false);
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
    { name: 'underline', doc: '<u>text</u>', start: 3, end: 7, plain: 'text' }
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

test('highlighter and pen cycle actions apply every custom style then remove it', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { toggleWmdxColorFormat, isMarkdownFormatActive } =
    await import('../src/markdownFormatting.js');
  const createView = () => {
    const state = EditorState.create({
      doc: 'word',
      selection: EditorSelection.range(0, 4),
      extensions: [markdown()]
    });
    return {
      state,
      dispatch(transaction) {
        this.state = this.state.update(transaction).state;
      },
      focus() {}
    };
  };

  const highlighter = createView();
  for (const expected of ['==word==', '==₀word==', '==₁word==', '==₂word==', 'word']) {
    assert.equal(toggleWmdxColorFormat(highlighter, 'highlightCycle'), true);
    assert.equal(highlighter.state.doc.toString(), expected);
  }

  const pen = createView();
  for (const expected of ['=word=', '=₀word=', '=₁word=', '=₂word=', 'word']) {
    assert.equal(toggleWmdxColorFormat(pen, 'penCycle'), true);
    assert.equal(pen.state.doc.toString(), expected);
  }

  const specific = createView();
  assert.equal(toggleWmdxColorFormat(specific, 'highlightBlue'), true);
  assert.equal(specific.state.doc.toString(), '==₂word==');
  assert.equal(isMarkdownFormatActive(specific, 'highlightBlue'), true);
  assert.equal(toggleWmdxColorFormat(specific, 'highlightBlue'), true);
  assert.equal(specific.state.doc.toString(), 'word');
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

test('Wmdx underline markers render as underline styles, not italics', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { GFM, Strikethrough } = await import('@lezer/markdown');
  const {
    getMarkdownFormatRanges,
    getMarkdownFormattingState,
    setWmdxUnderlineSyntaxEnabled
  } = await import('../src/markdownFormatting.js');
  const doc = '_word_ _₀dots_ _₁dashes_ _₂double_ _₃waves_ ` _code_ `';
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.indexOf('dots') + 1),
    extensions: [markdown({ extensions: [GFM, Strikethrough] })]
  });
  const view = { state };
  setWmdxUnderlineSyntaxEnabled(true);

  const ranges = getMarkdownFormatRanges(view, 'underline');
  assert.deepEqual(
    ranges.filter(range => range.kind === 'wmdx').map(range => range.style),
    ['solid', 'dotted', 'dashed', 'double', 'wavy']
  );
  assert.equal(getMarkdownFormattingState(view).italic, false);
  assert.equal(getMarkdownFormattingState(view).underlineDotted, true);
  assert.equal(
    ranges.some(range => doc.slice(range.wrapperFrom, range.wrapperTo) === '_code_'),
    false,
    'inline code is not interpreted as underline syntax'
  );
  setWmdxUnderlineSyntaxEnabled(false);
});

test('underline actions apply each style and Ctrl+U cycles through removal', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const {
    getMarkdownFormatRanges,
    setWmdxUnderlineSyntaxEnabled,
    toggleUnderlineFormat
  } = await import('../src/markdownFormatting.js');
  const view = {
    state: EditorState.create({
      doc: 'word',
      selection: EditorSelection.range(0, 4),
      extensions: [markdown()]
    }),
    dispatch(transaction) {
      this.state = this.state.update(transaction).state;
    },
    focus() {}
  };
  setWmdxUnderlineSyntaxEnabled(true);
  const styles = [
    ['solid', '_word_'],
    ['dotted', '_₀word_'],
    ['dashed', '_₁word_'],
    ['double', '_₂word_'],
    ['wavy', '_₃word_']
  ];
  for (const [style, expected] of styles) {
    view.state = EditorState.create({
      doc: 'word',
      selection: EditorSelection.range(0, 4),
      extensions: [markdown()]
    });
    toggleUnderlineFormat(view, style);
    assert.equal(view.state.doc.toString(), expected);
  }

  view.state = EditorState.create({
    doc: 'word',
    selection: EditorSelection.range(0, 4),
    extensions: [markdown()]
  });
  for (const expected of ['_word_', '_₀word_', '_₁word_', '_₂word_', '_₃word_', 'word']) {
    toggleUnderlineFormat(view, 'cycle');
    assert.equal(view.state.doc.toString(), expected);
    if (expected !== 'word') {
      const range = getMarkdownFormatRanges(view, 'underline')
        .find(candidate => candidate.kind === 'wmdx');
      view.state = view.state.update({
        selection: EditorSelection.range(range.contentFrom, range.contentTo)
      }).state;
    }
  }

  view.state = EditorState.create({
    doc: '',
    selection: EditorSelection.cursor(0),
    extensions: [markdown()]
  });
  for (const expected of ['__', '_₀_', '_₁_', '_₂_', '_₃_', '']) {
    toggleUnderlineFormat(view, 'cycle');
    assert.equal(view.state.doc.toString(), expected);
  }
  setWmdxUnderlineSyntaxEnabled(false);
});

test('disabled Wmdx underline syntax keeps HTML underline compatibility', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const {
    getMarkdownFormattingState,
    getMarkdownFormatRanges,
    setWmdxUnderlineSyntaxEnabled
  } = await import('../src/markdownFormatting.js');
  const doc = '<u>text</u>';
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(5),
    extensions: [markdown()]
  });
  setWmdxUnderlineSyntaxEnabled(false);
  const ranges = getMarkdownFormatRanges({ state }, 'underline');
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].kind, 'html');
  assert.equal(ranges[0].style, 'solid');
  assert.equal(getMarkdownFormattingState({ state }).underlineSolid, true);
});

test('popup toolbar items expose syntax state and follow editor selection updates', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../toolbar.css'), 'utf8');
  assert.ok(source.includes('data-toolbar-command'), 'popup controls are keyed by the syntax they edit');
  assert.ok(source.includes('refreshToolbarSyntaxState(update.view)'), 'selection and document changes refresh active controls');
  assert.ok(source.includes('button.setAttribute(\'aria-pressed\', String(active))'), 'active state is accessible');
  assert.ok(styles.includes('.grouped-key-btn.has-active-syntax'), 'closed toolbar groups show when their syntax is active');
  assert.ok(styles.includes('.popup-strip-btn.active'), 'the matching popup action is visibly highlighted');
});
