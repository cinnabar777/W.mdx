const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function androidDom(markup) {
  const dom = new JSDOM(markup, { pretendToBeVisual: true });
  Object.defineProperty(dom.window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/147.0 Mobile'
  });
  return dom;
}

function selectText(doc, textNode, from, to) {
  const range = doc.createRange();
  range.setStart(textNode, from);
  range.setEnd(textNode, to);
  const selection = doc.defaultView.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  doc.dispatchEvent(new doc.defaultView.Event('selectionchange'));
}

test('only the selected auto-hyphenated paragraph is temporarily reflowed', async () => {
  const { installHyphenSelectionWorkaround } =
    await import('../src/hyphenSelectionWorkaround.js');
  const dom = androidDom(`
    <div class="cm-editor">
      <div class="cm-content">
        <div class="cm-line cm-paragraph" style="hyphens: auto">first generated hyphen later</div>
        <div class="cm-line cm-paragraph" style="hyphens: auto">another paragraph</div>
      </div>
    </div>
  `);
  const doc = dom.window.document;
  const editor = doc.querySelector('.cm-editor');
  const [first, second] = editor.querySelectorAll('.cm-paragraph');
  const workaround = installHyphenSelectionWorkaround({ dom: editor });
  assert.ok(workaround);

  const css = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(
    css,
    /\.cm-editor \.cm-content \.cm-paragraph\.cm-android-selection-no-auto-hyphens[\s\S]*?hyphens:\s*none\s*!important/
  );

  selectText(doc, first.firstChild, 0, 5);
  assert.equal(first.classList.contains('cm-android-selection-no-auto-hyphens'), true);
  assert.equal(second.classList.contains('cm-android-selection-no-auto-hyphens'), false);

  selectText(doc, second.firstChild, 0, 4);
  assert.equal(first.classList.contains('cm-android-selection-no-auto-hyphens'), false);
  assert.equal(second.classList.contains('cm-android-selection-no-auto-hyphens'), true);

  doc.getSelection().collapse(second.firstChild, 4);
  doc.dispatchEvent(new dom.window.Event('selectionchange'));
  assert.equal(second.classList.contains('cm-android-selection-no-auto-hyphens'), false);
  workaround.destroy();
  dom.window.close();
});

test('touch selection stays reflowed until Android completes the delayed selection', async () => {
  const { installHyphenSelectionWorkaround } =
    await import('../src/hyphenSelectionWorkaround.js');
  const dom = androidDom(`
    <div class="cm-editor"><div class="cm-content">
      <div class="cm-line cm-paragraph" style="hyphens: auto">first generated hyphen later</div>
      <div class="cm-line cm-paragraph" style="hyphens: auto">another paragraph</div>
    </div></div>
  `);
  const doc = dom.window.document;
  const editor = doc.querySelector('.cm-editor');
  const [paragraph, otherParagraph] = editor.querySelectorAll('.cm-paragraph');
  const getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  dom.window.getComputedStyle = element => {
    const computed = getComputedStyle(element);
    if (!element.classList.contains('cm-android-selection-no-auto-hyphens')) {
      return computed;
    }
    return {
      hyphens: 'none',
      getPropertyValue(property) {
        if (property === 'hyphens' || property === '-webkit-hyphens') return 'none';
        return computed.getPropertyValue(property);
      }
    };
  };
  let layoutReads = 0;
  const getBoundingClientRect = paragraph.getBoundingClientRect.bind(paragraph);
  paragraph.getBoundingClientRect = () => {
    layoutReads += 1;
    return getBoundingClientRect();
  };
  const workaround = installHyphenSelectionWorkaround({ dom: editor });

  const pointerDown = new dom.window.Event('pointerdown', { bubbles: true });
  Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
  paragraph.dispatchEvent(pointerDown);
  assert.equal(paragraph.classList.contains('cm-android-selection-no-auto-hyphens'), true);
  assert.equal(otherParagraph.classList.contains('cm-android-selection-no-auto-hyphens'), false);
  assert.ok(layoutReads > 0, 'touch-down forces layout before native handle placement');

  const pointerUp = new dom.window.Event('pointerup', { bubbles: true });
  Object.defineProperty(pointerUp, 'pointerType', { value: 'touch' });
  doc.dispatchEvent(pointerUp);
  assert.equal(
    paragraph.classList.contains('cm-android-selection-no-auto-hyphens'),
    true,
    'do not restore hyphenation while Android selection is still collapsed'
  );

  // Android can expand the selection after pointer-up/touch-end.
  await new Promise(resolve => dom.window.setTimeout(resolve, 20));
  selectText(doc, paragraph.firstChild, 6, 11);
  await new Promise(resolve => dom.window.setTimeout(resolve, 320));
  assert.equal(paragraph.classList.contains('cm-android-selection-no-auto-hyphens'), true);

  doc.getSelection().collapse(paragraph.firstChild, 11);
  doc.dispatchEvent(new dom.window.Event('selectionchange'));
  assert.equal(paragraph.classList.contains('cm-android-selection-no-auto-hyphens'), false);
  workaround.destroy();
  dom.window.close();
});

test('the selection workaround is disabled outside Android', async () => {
  const { installHyphenSelectionWorkaround } =
    await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM('<div class="cm-editor"></div>');
  assert.equal(
    installHyphenSelectionWorkaround({ dom: dom.window.document.querySelector('.cm-editor') }),
    null
  );
  dom.window.close();
});
