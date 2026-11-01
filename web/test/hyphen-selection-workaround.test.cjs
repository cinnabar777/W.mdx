const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

function selectText(doc, node, from, to) {
  const range = doc.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const selection = doc.defaultView.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  doc.dispatchEvent(new doc.defaultView.Event('selectionchange'));
}

test('only paragraph-start selections with active hyphenation are affected', async () => {
  const {
    getHyphenatedParagraphForSelection,
    isRangeStartAtParagraphStart
  } = await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM(`
    <div class="cm-paragraph" style="hyphens: auto">first generated hyphen later</div>
    <div class="cm-paragraph" style="hyphens: none">ordinary paragraph</div>
  `);
  const [hyphenated, ordinary] =
    dom.window.document.querySelectorAll('.cm-paragraph');
  const hyphenatedText = hyphenated.firstChild;
  const ordinaryText = ordinary.firstChild;
  const range = dom.window.document.createRange();
  range.setStart(hyphenatedText, 0);
  range.setEnd(hyphenatedText, 5);

  assert.equal(isRangeStartAtParagraphStart(range), true);
  assert.equal(getHyphenatedParagraphForSelection(range), hyphenated);

  range.setStart(hyphenatedText, 6);
  range.setEnd(hyphenatedText, 11);
  assert.equal(getHyphenatedParagraphForSelection(range), null);

  range.setStart(ordinaryText, 0);
  range.setEnd(ordinaryText, 4);
  assert.equal(getHyphenatedParagraphForSelection(range), null);

  range.collapse(true);
  assert.equal(getHyphenatedParagraphForSelection(range), null);
  dom.window.close();
});

test('Android selection temporarily disables and then restores paragraph hyphenation', async () => {
  const { installHyphenSelectionWorkaround } =
    await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM(`
    <div id="editor">
      <div class="cm-paragraph" style="hyphens: auto !important; -webkit-hyphens: auto">first generated hyphen later</div>
      <div class="cm-paragraph" style="hyphens: auto">another paragraph</div>
    </div>
  `);
  Object.defineProperty(dom.window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/147.0 Mobile'
  });
  const doc = dom.window.document;
  const editor = doc.querySelector('#editor');
  const [firstParagraph, secondParagraph] = editor.querySelectorAll('.cm-paragraph');
  const firstText = firstParagraph.firstChild;
  const secondText = secondParagraph.firstChild;
  const workaround = installHyphenSelectionWorkaround({ dom: editor });
  assert.ok(workaround);

  selectText(doc, firstText, 0, 5);
  assert.equal(firstParagraph.style.getPropertyValue('hyphens'), 'none');
  assert.equal(firstParagraph.style.getPropertyPriority('hyphens'), 'important');

  selectText(doc, firstText, 6, 11);
  assert.equal(firstParagraph.style.getPropertyValue('hyphens'), 'auto');
  assert.equal(firstParagraph.style.getPropertyPriority('hyphens'), 'important');

  selectText(doc, firstText, 0, 5);
  selectText(doc, secondText, 0, 4);
  assert.equal(firstParagraph.style.getPropertyValue('hyphens'), 'auto');
  assert.equal(secondParagraph.style.getPropertyValue('hyphens'), 'none');

  workaround.destroy();
  assert.equal(secondParagraph.style.getPropertyValue('hyphens'), 'auto');
  dom.window.close();
});

test('the workaround is not installed outside Android WebView', async () => {
  const { installHyphenSelectionWorkaround } =
    await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM('<div id="editor"></div>');
  assert.equal(
    installHyphenSelectionWorkaround({ dom: dom.window.document.querySelector('#editor') }),
    null
  );
  dom.window.close();
});
