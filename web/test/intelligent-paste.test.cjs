const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('intelligent paste detects HTML snippets and converts semantic elements', async () => {
  const { isHtmlSnippet, convertPastedContent } = await import('../src/intelligentPaste.mjs');
  const dom = new JSDOM();

  assert.equal(isHtmlSnippet('<h1>Title</h1><p>Paragraph</p>'), true);
  assert.equal(isHtmlSnippet('Just plain text with 3 < 5 comparison'), false);

  const html = '<h3>Section Heading</h3><p>Here is <b>bold</b> and <i>italic</i>.</p>';
  const converted = convertPastedContent(html, 'wmdx', dom.window.DOMParser);
  assert.ok(converted.includes('.3 Section Heading'), 'converts h3 to .3 heading');
  assert.ok(converted.includes('**bold**'), 'converts bold');
  assert.ok(converted.includes('*italic*'), 'converts italic');
});

test('intelligent paste converts dialect headings and callouts to preferred target', async () => {
  const { convertPastedContent, detectMarkdownDialect } = await import('../src/intelligentPaste.mjs');

  const obsidianText = '> [!warning] Caution\n> Danger ahead';
  assert.equal(detectMarkdownDialect(obsidianText), 'obsidian');

  const wmdxResult = convertPastedContent(obsidianText, 'wmdx');
  assert.ok(wmdxResult.includes('±warning Caution'), 'converts Obsidian callout to Wmdx callout');

  const atxHeading = '## Section Two\nSome content';
  const wmdxHeading = convertPastedContent(atxHeading, 'wmdx');
  assert.ok(wmdxHeading.includes('.2 Section Two'), 'converts ATX heading to .2 heading');
});
