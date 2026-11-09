const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { syntaxTree } = require('@codemirror/language');
const { GFM, Table, Strikethrough, TaskList } = require('@lezer/markdown');

const corpusPath = path.join(__dirname, 'fixtures/commonmark-0.31.2.json');
const commonmarkCases = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const htmlSections = new Set(['HTML blocks', 'Raw HTML']);
let wmdxMarkdown;
let parsedCases;
let htmlInteropCases;
let parserComparableCases;
let activeCases;

const htmlTagNodes = {
  p: ['Paragraph'],
  h1: ['ATXHeading1', 'SetextHeading1'],
  h2: ['ATXHeading2', 'SetextHeading2'],
  h3: ['ATXHeading3', 'SetextHeading3'],
  h4: ['ATXHeading4', 'SetextHeading4'],
  h5: ['ATXHeading5', 'SetextHeading5'],
  h6: ['ATXHeading6', 'SetextHeading6'],
  em: ['Emphasis'],
  strong: ['StrongEmphasis'],
  code: ['InlineCode', 'FencedCode', 'CodeBlock'],
  pre: ['FencedCode', 'CodeBlock'],
  blockquote: ['Blockquote'],
  ul: ['BulletList'],
  ol: ['OrderedList'],
  li: ['ListItem'],
  hr: ['HorizontalRule'],
  a: ['Link', 'Autolink'],
  img: ['Image'],
  br: ['HardBreak']
};

function getExpectedTags(html) {
  return [...html.matchAll(/<\/?([A-Za-z][\w-]*)\b[^>]*>/g)]
    .map(match => match[1].toLowerCase());
}

function getParserNodeNames(source) {
  const state = EditorState.create({
    doc: source,
    extensions: [wmdxMarkdown]
  });
  const nodeNames = new Set();
  syntaxTree(state).iterate({
    enter(node) {
      nodeNames.add(node.name);
    }
  });
  return nodeNames;
}

function isRawHtmlCase(example) {
  const expectedTags = getExpectedTags(example.html);
  return htmlSections.has(example.section) ||
    example.nodeNames.has('HTMLTag') ||
    example.nodeNames.has('HTMLBlock') ||
    expectedTags.some(tag => !htmlTagNodes[tag]);
}

before(async () => {
  const { wmdxCommonMarkCompatibility } = await import('../src/commonmark-compat.mjs');
  wmdxMarkdown = markdown({
    extensions: [
      GFM,
      Table,
      Strikethrough,
      TaskList,
      wmdxCommonMarkCompatibility
    ]
  });
  parsedCases = commonmarkCases.map(example => ({
    ...example,
    nodeNames: getParserNodeNames(example.markdown)
  }));
  htmlInteropCases = parsedCases.filter(isRawHtmlCase);
  parserComparableCases = parsedCases.filter(example => !isRawHtmlCase(example));
  activeCases = parserComparableCases;
});

test('CommonMark 0.31.2 fixtures expose expected core parser node families', () => {
  assert.equal(commonmarkCases.length, 652, 'the pinned upstream corpus is complete');
  assert.equal(htmlInteropCases.length, 77, 'HTML interoperability cases stay outside Wmdx-native parsing');
  assert.equal(parserComparableCases.length, 575, 'all non-HTML examples are classified');
  assert.equal(activeCases.length, 575, 'all parser-comparable examples are checked');

  const failures = [];
  for (const example of activeCases) {
    const expectedTags = [...new Set(getExpectedTags(example.html))];
    const missing = expectedTags.filter(tag =>
      !htmlTagNodes[tag].some(nodeName => example.nodeNames.has(nodeName))
    );

    if (missing.length) {
      failures.push({
        example: example.example,
        section: example.section,
        missing
      });
    }
  }

  assert.deepEqual(
    failures,
    [],
    'all active cases expose the semantic parser nodes implied by CommonMark output'
  );
});

test('CommonMark import and export preserve parser families across all non-HTML fixtures', async () => {
  const { convertFromMarkdown, exportMarkdown } = await import('../src/markdownConversion.mjs');
  const [
    { EditorState: ImportedEditorState },
    { markdown: importedMarkdown },
    { syntaxTree: importedSyntaxTree },
    { GFM, Strikethrough, Table, TaskList }
  ] = await Promise.all([
    import('@codemirror/state'),
    import('@codemirror/lang-markdown'),
    import('@codemirror/language'),
    import('@lezer/markdown')
  ]);
  const { wmdxCommonMarkCompatibility: importedCompatibility } =
    await import('../src/commonmark-compat.mjs');
  const importedParser = importedMarkdown({
    extensions: [
      GFM,
      Table,
      Strikethrough,
      TaskList,
      importedCompatibility
    ]
  });
  const importNodeFamilies = {
    ...htmlTagNodes,
    a: [...htmlTagNodes.a, 'WmdxResource'],
    img: [...htmlTagNodes.img, 'WmdxResource']
  };
  const getImportedNodeNames = source => {
    const state = ImportedEditorState.create({
      doc: source,
      extensions: [importedParser]
    });
    const names = new Set();
    importedSyntaxTree(state).iterate({
      enter(node) {
        names.add(node.name);
      }
    });
    return names;
  };
  const failures = [];

  for (const example of activeCases) {
    const imported = convertFromMarkdown(example.markdown, 'commonmark');
    const expectedTags = [...new Set(getExpectedTags(example.html))];
    const exported = exportMarkdown(imported.markdown, 'commonmark');

    for (const [stage, markdownText] of [
      ['import', imported.markdown],
      ['import/export roundtrip', exported.markdown]
    ]) {
      const nodeNames = getImportedNodeNames(markdownText);
      const missing = expectedTags.filter(tag =>
        !importNodeFamilies[tag].some(nodeName => nodeNames.has(nodeName))
      );
      if (missing.length) {
        failures.push({
          example: example.example,
          section: example.section,
          stage,
          missing,
          markdown: markdownText.slice(0, 160)
        });
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    'CommonMark import and export preserve the expected semantic node families'
  );
});

test('CommonMark tab-separated headings and undefined-reference emphasis parse correctly', () => {
  const tabHeading = parsedCases.find(example => example.example === 10);
  const unresolvedReference = parsedCases.find(example => example.example === 523);
  assert.ok(tabHeading.nodeNames.has('ATXHeading1'));
  assert.ok(unresolvedReference.nodeNames.has('Emphasis'));
  assert.ok(!unresolvedReference.nodeNames.has('Link'));

  const inlineLink = getParserNodeNames('*foo [bar* baz](https://example.test)\n');
  const definedReference = getParserNodeNames(
    '*foo [bar* baz]\n\n[bar* baz]: https://example.test\n'
  );
  const foldedReference = getParserNodeNames(
    '*foo [ẞ* baz]\n\n[SS* baz]: https://example.test\n'
  );
  const multilineReference = getParserNodeNames(
    '*foo [Foo\n  bar* baz]\n\n[Foo\n  bar* baz]: https://example.test\n'
  );

  assert.ok(inlineLink.has('Link'), 'inline links keep using the standard parser');
  assert.ok(definedReference.has('Link'), 'defined shortcut references remain links');
  assert.ok(foldedReference.has('Link'), 'reference labels use Unicode case folding');
  assert.ok(multilineReference.has('Link'), 'multiline reference labels remain valid');
});

test('native decimal heading markers parse as the six structural heading levels', () => {
  const source = '.1 Level one\n.2 Level two\n.3 Level three\n.4 Level four\n.5 Level five\n.6 Level six\n.7 Not a heading';
  const state = EditorState.create({
    doc: source,
    extensions: [wmdxMarkdown]
  });
  const headings = [];
  const markers = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (/^ATXHeading[1-6]$/.test(node.name)) headings.push(node.name);
      if (node.name === 'WmdxHeadingMarker') {
        markers.push(source.slice(node.from, node.to));
      }
    }
  });

  assert.deepEqual(headings, [
    'ATXHeading1',
    'ATXHeading2',
    'ATXHeading3',
    'ATXHeading4',
    'ATXHeading5',
    'ATXHeading6'
  ]);
  assert.deepEqual(markers, ['.1 ', '.2 ', '.3 ', '.4 ', '.5 ', '.6 ']);
  assert.equal(state.doc.toString(), source, 'parsing leaves the saved source unchanged');
});

test('native decimal headings interrupt paragraphs and work inside indented quotes', () => {
  const source = [
    'Paragraph before.',
    '.1 Heading within the flow',
    'Paragraph after.',
    '',
    '   > .2 Quoted heading',
    '   > Quoted body.'
  ].join('\n');
  const state = EditorState.create({
    doc: source,
    extensions: [wmdxMarkdown]
  });
  const headings = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (/^ATXHeading[1-6]$/.test(node.name)) headings.push(node.name);
    }
  });

  assert.deepEqual(headings, ['ATXHeading1', 'ATXHeading2']);
  assert.ok(syntaxTree(state).toString().includes('Blockquote'));
  assert.equal(state.doc.toString(), source);
});

test('native task markers parse as checkbox markers, not shortcut links', () => {
  const source = '[ ] Open\n[x] Done\n  [ ] Nested\ninline [ ] text';
  const state = EditorState.create({
    doc: source,
    extensions: [wmdxMarkdown]
  });
  const taskMarkers = [];
  const links = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'WmdxTaskMarker') {
        taskMarkers.push(source.slice(node.from, node.to));
      }
      if (node.name === 'Link') links.push(source.slice(node.from, node.to));
    }
  });

  assert.deepEqual(taskMarkers, ['[ ]', '[x]', '[ ]']);
  assert.ok(!links.includes('[ ]') && !links.includes('[x]'));
  assert.equal(state.doc.toString(), source);
});

test('native resource references parse as one token without changing source', () => {
  const source = [
    '[https://example.com|Visit site||->]',
    '![assets/photo.png|Sunset|80%|><]',
    '`![code.png|||]`',
    '\\![escaped.png|||]',
    '[ordinary shortcut]'
  ].join('\n');
  const state = EditorState.create({
    doc: source,
    extensions: [wmdxMarkdown]
  });
  const resources = [];
  const markdownImages = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'WmdxResource') {
        resources.push(source.slice(node.from, node.to));
      }
      if (node.name === 'Image') {
        markdownImages.push(source.slice(node.from, node.to));
      }
    }
  });

  assert.deepEqual(resources, [
    '[https://example.com|Visit site||->]',
    '![assets/photo.png|Sunset|80%|><]'
  ]);
  assert.ok(!markdownImages.some(text => text.includes('code.png')));
  assert.equal(state.doc.toString(), source);
});

test('representative CommonMark HTML examples convert through the explicit HTML importer', async () => {
  const { JSDOM } = require('jsdom');
  const { convertFromHtml } = await import('../src/markdownConversion.mjs');
  const Parser = new JSDOM('').window.DOMParser;
  const examples = new Map(commonmarkCases.map(example => [example.example, example]));

  const table = convertFromHtml(examples.get(160).html, Parser);
  assert.match(table.markdown, /^\| foo \|$/m);
  assert.match(table.markdown, /^\| --- \|$/m);

  const activeHtml = convertFromHtml(examples.get(170).html, Parser);
  assert.match(activeHtml.markdown, /okay/);
  assert.doesNotMatch(activeHtml.markdown, /Hello JavaScript|document\.getElementById/);

  const comment = convertFromHtml(examples.get(179).html, Parser);
  assert.match(comment.markdown, /okay/);
  assert.doesNotMatch(comment.markdown, /Foo|bar|baz/);
});

test('CommonMark corpus coverage does not claim exact rendering or full conformance', () => {
  assert.ok(parserComparableCases.length < commonmarkCases.length);
  assert.ok(htmlInteropCases.length > 0);
  assert.ok(
    fs.existsSync(path.join(__dirname, 'fixtures/COMMONMARK-LICENSE.md')),
    'the upstream fixture attribution and license are present'
  );
});
