'use strict';

const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree, syntaxTree } = require('@codemirror/language');
const { GFM, Table, Strikethrough, TaskList } = require('@lezer/markdown');

const commonmarkCases = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/commonmark-0.31.2.json'), 'utf8'
));
const rawHtmlSections = new Set(['HTML blocks', 'Raw HTML']);
const nativeHtmlTags = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'strong', 'code',
  'pre', 'blockquote', 'ul', 'ol', 'li', 'hr', 'a', 'img', 'br'
]);
const renderedBlockTags = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'
]);
let coreCases;
let wmdxMarkdown;

function expectedTags(html) {
  return [...String(html).matchAll(/<\/?([A-Za-z][\w-]*)\b[^>]*>/g)]
    .map(match => match[1].toLowerCase());
}

function parserNodeNames(source) {
  const state = EditorState.create({ doc: source, extensions: [wmdxMarkdown] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) || syntaxTree(state);
  const names = new Set();
  tree.iterate({ enter(node) { names.add(node.name); } });
  return names;
}

function isRawHtmlCase(example) {
  const nodes = parserNodeNames(example.markdown);
  return rawHtmlSections.has(example.section) ||
    nodes.has('HTMLTag') ||
    nodes.has('HTMLBlock') ||
    expectedTags(example.html).some(tag => !nativeHtmlTags.has(tag));
}

function canonicalizeRenderedHtml(html, template) {
  template.innerHTML = html;
  const serialize = (node, parentTag = '') => {
    if (node.nodeType === 3) {
      if ((parentTag === '' || renderedBlockTags.has(parentTag)) && !node.nodeValue.trim()) return null;
      const text = parentTag === 'code' || parentTag === 'pre'
        ? node.nodeValue
        : node.nodeValue.replace(/\s+/g, ' ');
      return text ? ['#text', text] : null;
    }
    if (node.nodeType !== 1) return null;
    const tag = node.tagName.toLowerCase();
    const attributes = [...node.attributes]
      .map(attribute => {
        let value = attribute.value;
        if (attribute.name === 'href' || attribute.name === 'src') {
          try {
            value = new URL(value, 'https://commonmark.example/base/').href;
          } catch {
            // Preserve invalid destinations so differences remain visible.
          }
        }
        return [attribute.name, value];
      })
      .sort(([left], [right]) => left.localeCompare(right));
    let children = [...node.childNodes]
      .map(child => serialize(child, tag))
      .filter(Boolean);
    if (renderedBlockTags.has(tag)) {
      children = children.filter(child => child[0] !== '#text' || child[1].trim());
    }
    const merged = [];
    for (const child of children) {
      const previous = merged.at(-1);
      if (child[0] === '#text' && previous?.[0] === '#text') previous[1] += child[1];
      else merged.push(child);
    }
    return [tag, attributes, merged];
  };
  return JSON.stringify([...template.content.childNodes]
    .map(node => serialize(node, ''))
    .filter(Boolean));
}

before(async () => {
  const { wmdxCommonMarkCompatibility } = await import('../src/commonmark-compat.mjs');
  wmdxMarkdown = markdown({
    extensions: [GFM, Table, Strikethrough, TaskList, wmdxCommonMarkCompatibility]
  });
  const allCoreCases = commonmarkCases.filter(example => !isRawHtmlCase(example));
  const rawRequestedIds = String(process.env.COMMONMARK_CASES ?? '').trim();
  const requestedIds = rawRequestedIds
    ? rawRequestedIds.split(',').map(value => Number(value.trim()))
    : [];
  assert.ok(
    requestedIds.every(id => Number.isInteger(id) && id > 0),
    'COMMONMARK_CASES must be a comma-separated list of positive example numbers'
  );
  const requested = new Set(requestedIds);
  assert.equal(requested.size, requestedIds.length, 'COMMONMARK_CASES must not repeat example numbers');
  coreCases = requested.size
    ? allCoreCases.filter(example => requested.has(example.example))
    : allCoreCases;
  const missingIds = [...requested].filter(id => !coreCases.some(example => example.example === id));
  assert.deepEqual(missingIds, [], 'requested example numbers must exist in the non-raw-HTML corpus');
  if (requested.size) {
    assert.equal(coreCases.length, requested.size, 'focused CommonMark run includes every requested case');
  } else {
    assert.equal(coreCases.length, 575, 'only the 575 non-raw-HTML reference cases enter this gate');
  }
});

test('CommonMark 0.31.2 core Markdown exports to reference-equivalent HTML', async t => {
  const { Parser, HtmlRenderer } = require('commonmark');
  const { JSDOM } = require('jsdom');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const window = new JSDOM('').window;
  const template = window.document.createElement('template');

  for (const example of coreCases) {
    await t.test('CM-EX-' + String(example.example).padStart(3, '0') + ' ' + example.section,
      () => {
        const expectedHtml = renderer.render(parser.parse(example.markdown));
        const result = renderMarkdownHtml(example.markdown, {
          profile: 'commonmark',
          sourceDialect: 'commonmark',
          window
        });
        assert.equal(
          canonicalizeRenderedHtml(result.html, template),
          canonicalizeRenderedHtml(expectedHtml, template),
          'HTML export differs from CommonMark reference output; warnings: ' +
            JSON.stringify(result.warnings)
        );
      }
    );
  }
});

test('Reference-rendered CommonMark HTML imports without semantic loss', async t => {
  const { Parser, HtmlRenderer } = require('commonmark');
  const { JSDOM } = require('jsdom');
  const { convertFromHtml, exportMarkdown } = await import('../src/markdownConversion.mjs');
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const window = new JSDOM('').window;
  const template = window.document.createElement('template');

  for (const example of coreCases) {
    await t.test('CM-EX-' + String(example.example).padStart(3, '0') + ' ' + example.section,
      () => {
        const expectedHtml = renderer.render(parser.parse(example.markdown));
        const imported = convertFromHtml(expectedHtml, window.DOMParser);
        const exported = exportMarkdown(imported.markdown, 'commonmark');
        const actualHtml = renderer.render(parser.parse(exported.markdown));
        assert.equal(
          canonicalizeRenderedHtml(actualHtml, template),
          canonicalizeRenderedHtml(expectedHtml, template),
          'HTML import changed CommonMark semantics; import warnings: ' +
            JSON.stringify(imported.warnings) + '; export warnings: ' +
            JSON.stringify(exported.warnings) + '; imported Markdown: ' +
            JSON.stringify(imported.markdown) + '; exported Markdown: ' +
            JSON.stringify(exported.markdown)
        );
      }
    );
  }
});
