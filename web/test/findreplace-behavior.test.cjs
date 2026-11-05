const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const mainSource = fs.readFileSync(
  path.join(projectRoot, 'web/src/main.js'),
  'utf8'
);

test('closing Find clears the active query without changing editor text', async () => {
  const { EditorState } = await import('@codemirror/state');
  const {
    getSearchQuery,
    search,
    SearchQuery,
    setSearchQuery
  } = await import('@codemirror/search');
  const { clearFindHighlights } = await import('../src/findReplaceActions.mjs');

  let state = EditorState.create({
    doc: 'needle appears twice: needle',
    extensions: [search()]
  });
  state = state.update({
    effects: setSearchQuery.of(new SearchQuery({ search: 'needle' }))
  }).state;
  assert.equal(getSearchQuery(state).search, 'needle');

  const originalText = state.doc.toString();
  const view = {
    get state() {
      return state;
    },
    dispatch(transaction) {
      state = state.update(transaction).state;
    }
  };

  assert.equal(clearFindHighlights(view), true);
  assert.equal(getSearchQuery(state).search, '');
  assert.equal(state.doc.toString(), originalText);
});

test('Enter advances Find and Shift+Enter searches backward', async () => {
  const { handleFindEnterKey } = await import('../src/findReplaceActions.mjs');
  const directions = [];
  const makeEvent = (key, shiftKey = false) => ({
    key,
    shiftKey,
    isComposing: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  });

  const nextEvent = makeEvent('Enter');
  assert.equal(
    handleFindEnterKey(nextEvent, reverse => directions.push(reverse)),
    true
  );
  assert.equal(nextEvent.prevented, true);
  assert.deepEqual(directions, [false]);

  const previousEvent = makeEvent('Enter', true);
  handleFindEnterKey(previousEvent, reverse => directions.push(reverse));
  assert.equal(previousEvent.prevented, true);
  assert.deepEqual(directions, [false, true]);

  const composingEvent = makeEvent('Enter');
  composingEvent.isComposing = true;
  assert.equal(handleFindEnterKey(composingEvent, () => directions.push('unexpected')), false);

  const otherKey = makeEvent('Escape');
  assert.equal(handleFindEnterKey(otherKey, () => directions.push('unexpected')), false);
  assert.deepEqual(directions, [false, true]);
});

test('custom search bar wires Enter navigation and clears matches on close', () => {
  assert.match(mainSource, /handleFindEnterKey\(event, reverse => \{/);
  assert.match(mainSource, /runFindAndCenter\(reverse \? findPrevious : findNext, view\)/);
  assert.match(mainSource, /clearFindHighlights\(view\);\s*clearMatchCounter\(\);\s*clearInlineSearchError\(\);/);
});
