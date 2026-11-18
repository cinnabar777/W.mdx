const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/gfm-0.29-extensions.json'),
  'utf8'
));

test('GFM 0.29 non-HTML extension examples preserve semantics through import and export', async () => {
  const { JSDOM } = require('jsdom');
  const { marked } = require('marked');
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { syntaxTree } = await import('@codemirror/language');
  const { Autolink, Table, TaskList } = await import('@lezer/markdown');
  const { wmdxGfmFtpAutolink } = await import('../src/gfm-autolink.mjs');
  const { wmdxGfmStrikethrough } = await import('../src/gfm-strikethrough.mjs');
  const { wmdxCommonMarkCompatibility } = await import('../src/commonmark-compat.mjs');
  const { getMarkdownLinkInfo } = await import('../src/markdown-link-utils.mjs');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const DOMParser = new JSDOM('').window.DOMParser;
  const summarizeHtml = html => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    return {
      text: document.body.textContent.replace(/\s+/g, ' ').trim(),
      elements: Array.from(document.body.querySelectorAll('*'), element => [
        element.tagName.toLowerCase(),
        ...['href', 'align', 'type', 'checked', 'disabled', 'start', 'value']
          .map(attribute => element.hasAttribute(attribute)
            ? `${attribute}=${element.getAttribute(attribute)}`
            : null)
          .filter(Boolean)
      ])
    };
  };
  const extensions = [
    Autolink,
    Table,
    TaskList,
    wmdxGfmFtpAutolink,
    wmdxGfmStrikethrough,
    wmdxCommonMarkCompatibility
  ];

  assert.equal(fixture.specification, 'GitHub Flavored Markdown 0.29');
  assert.equal(fixture.examples.length, 21);

  for (const example of fixture.examples) {
    const state = EditorState.create({
      doc: example.markdown,
      extensions: [markdown({ extensions })]
    });
    const actual = {
      tables: 0,
      strikethrough: 0,
      autolinks: 0
    };
    const urlNodes = [];

    syntaxTree(state).iterate({
      enter(node) {
        if (node.name === 'Table') actual.tables++;
        if (node.name === 'Strikethrough') actual.strikethrough++;
        if (node.name === 'URL') {
          actual.autolinks++;
          urlNodes.push({
            name: node.name,
            from: node.from,
            to: node.to
          });
        }
      }
    });

    assert.deepEqual(
      actual,
      example.expected,
      `GFM ${example.section} example ${example.number}`
    );

    const imported = convertFromMarkdown(example.markdown, 'gfm');
    const importedState = EditorState.create({
      doc: imported.markdown,
      extensions: [markdown({ extensions })]
    });
    const importedActual = {
      tables: 0,
      strikethrough: 0,
      autolinks: 0
    };
    syntaxTree(importedState).iterate({
      enter(node) {
        if (node.name === 'Table') importedActual.tables++;
        if (node.name === 'Strikethrough') importedActual.strikethrough++;
        if (node.name === 'URL') importedActual.autolinks++;
      }
    });
    assert.deepEqual(
      importedActual,
      example.expected,
      `GFM import ${example.section} example ${example.number}`
    );
    const exported = exportMarkdown(imported.markdown, 'gfm');
    const exportedState = EditorState.create({
      doc: exported.markdown,
      extensions: [markdown({ extensions })]
    });
    const exportedActual = {
      tables: 0,
      strikethrough: 0,
      autolinks: 0
    };
    syntaxTree(exportedState).iterate({
      enter(node) {
        if (node.name === 'Table') exportedActual.tables++;
        if (node.name === 'Strikethrough') exportedActual.strikethrough++;
        if (node.name === 'URL') exportedActual.autolinks++;
      }
    });
    assert.deepEqual(
      exportedActual,
      example.expected,
      `GFM import/export ${example.section} example ${example.number}`
    );
    const warnings = [...new Set([...imported.warnings, ...exported.warnings])];
    assert.deepEqual(
      warnings,
      [],
      `GFM ${example.section} example ${example.number} converts without loss warnings`
    );
    assert.deepEqual(
      summarizeHtml(marked.parse(exported.markdown, { gfm: true })),
      summarizeHtml(marked.parse(example.markdown, { gfm: true })),
      `GFM ${example.section} example ${example.number} preserves rendered meaning through conversion`
    );

    if (example.number === 628) {
      const ftpNode = urlNodes.find(node =>
        state.doc.sliceString(node.from, node.to).startsWith('ftp://')
      );
      assert.ok(
        ftpNode,
        `GFM example 628 parses its FTP autolink; found: ${
          urlNodes.map(node =>
            state.doc.sliceString(node.from, node.to)
          ).join(', ')
        }`
      );
      assert.equal(
        getMarkdownLinkInfo(ftpNode, state.doc)?.target,
        'ftp://foo.bar.baz',
        'the FTP autolink remains an openable external link'
      );
    }
  }
});

test('GFM raw-HTML tag-filter example remains outside the native parser corpus', () => {
  assert.deepEqual(
    fixture.excludedExamples.map(({ number, extension, reason }) => ({
      number,
      extension,
      reason
    })),
    [{
      number: 651,
      extension: 'tagfilter',
      reason: "Raw HTML tag filtering is tracked under Wmdx's no-HTML compatibility policy."
    }]
  );
});

test('GFM autolink examples preserve link targets without adding escapes', async t => {
  const { JSDOM } = require('jsdom');
  const { marked } = require('marked');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const DOMParser = new JSDOM('').window.DOMParser;
  const summarize = html => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    return {
      text: document.body.textContent.replace(/\s+/g, ' ').trim(),
      links: Array.from(document.querySelectorAll('a[href]'), anchor => [
        anchor.textContent.replace(/\s+/g, ' ').trim(),
        anchor.getAttribute('href')
      ])
    };
  };
  const examples = fixture.examples.filter(example => example.extension === 'autolink');
  assert.equal(examples.length, 11);

  for (const example of examples) {
    await t.test(`GFM ${example.number}`, () => {
      const imported = convertFromMarkdown(example.markdown, 'gfm');
      const exported = exportMarkdown(imported.markdown, 'gfm');
      const before = marked.parse(example.markdown, { gfm: true });
      const after = marked.parse(exported.markdown, { gfm: true });

      assert.deepEqual(imported.warnings, [], `GFM ${example.number} import warnings`);
      assert.deepEqual(exported.warnings, [], `GFM ${example.number} export warnings`);
      assert.equal(
        exported.markdown,
        example.markdown,
        `GFM ${example.number} adds no unnecessary escapes or source changes`
      );
      assert.deepEqual(
        summarize(after),
        summarize(before),
        `GFM ${example.number} preserves rendered autolink destinations`
      );
    });
  }
});
