const test = require('node:test');
const assert = require('node:assert/strict');

test('auto heading cycles below, equal to, above, then to H1', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { applyAutoHeading } = await import('../src/autoHeading.js');
  const state = EditorState.create({
    doc: '# One\n## Two\n### Three\n#### Four\n##### Five\ntext',
    extensions: [markdown()]
  });
  const targetLine = state.doc.line(6);
  const view = {
    state: state.update({
      selection: { anchor: targetLine.from + 2, head: targetLine.from + 2 }
    }).state,
    dispatch(spec) {
      this.state = this.state.update(spec).state;
    },
    focus() {}
  };

  for (const level of [6, 5, 4, 1]) {
    assert.equal(applyAutoHeading(view), true);
    assert.equal(view.state.doc.line(6).text, `${'#'.repeat(level)} text`);
  }
});

test('auto heading starts at H1 without a previous heading and clamps at document limits', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { applyAutoHeading } = await import('../src/autoHeading.js');

  const createView = (doc, lineNumber = 1) => {
    const initialState = EditorState.create({ doc, extensions: [markdown()] });
    const line = initialState.doc.line(lineNumber);
    const state = initialState.update({
      selection: { anchor: line.from, head: line.from }
    }).state;
    return {
      state,
      dispatch(spec) {
        this.state = this.state.update(spec).state;
      },
      focus() {}
    };
  };

  const noPreviousHeading = createView('text');
  for (let tap = 0; tap < 4; tap += 1) {
    applyAutoHeading(noPreviousHeading);
    assert.equal(noPreviousHeading.state.doc.toString(), '# text');
  }

  const previousH6 = createView('# One\n###### Six\ntext', 3);
  for (const level of [6, 6, 5, 1]) {
    applyAutoHeading(previousH6);
    assert.equal(previousH6.state.doc.line(3).text, `${'#'.repeat(level)} text`);
  }
});

test('auto heading replaces a setext heading without leaving its underline', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { applyAutoHeading } = await import('../src/autoHeading.js');
  const state = EditorState.create({
    doc: '##### Previous\nTitle\n---\nNext',
    extensions: [markdown()]
  });
  const targetLine = state.doc.line(2);
  const view = {
    state: state.update({
      selection: { anchor: targetLine.from + 2, head: targetLine.from + 2 }
    }).state,
    dispatch(spec) {
      this.state = this.state.update(spec).state;
    },
    focus() {}
  };

  assert.equal(applyAutoHeading(view), true);
  assert.equal(view.state.doc.toString(), '##### Previous\n###### Title\nNext');
});

test('auto heading ignores headings inside fenced code and does not edit code', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { applyAutoHeading, getPrecedingHeadingLevel } = await import('../src/autoHeading.js');
  const code = '# Actual\n```md\n# Not a heading\n```\ntext';
  const state = EditorState.create({ doc: code, extensions: [markdown()] });
  assert.equal(getPrecedingHeadingLevel(state, 5), 1);

  const codeLine = state.doc.line(3);
  const view = {
    state: state.update({
      selection: { anchor: codeLine.from + 2, head: codeLine.from + 2 }
    }).state,
    dispatch(spec) {
      this.state = this.state.update(spec).state;
    },
    focus() {}
  };
  assert.equal(applyAutoHeading(view), false);
  assert.equal(view.state.doc.toString(), code);
});
