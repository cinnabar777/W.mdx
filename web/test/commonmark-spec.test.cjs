const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree, syntaxTree } = require('@codemirror/language');
const { GFM, Table, Strikethrough, TaskList } = require('@lezer/markdown');

const corpusPath = path.join(__dirname, 'fixtures/commonmark-0.31.2.json');
const commonmarkCases = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const htmlSections = new Set(['HTML blocks', 'Raw HTML']);
const nestedCommonMarkEmphasisExamples = [373, 389, 407, 408, 425, 426, 461, 463, 465, 468];
const verifiedHtmlSemanticExamples = new Set(
  Array.from({ length: 20 }, (_, index) => index + 613)
);
const verifiedHtmlBlockExamples = new Set([
  152, 153, 154, 156, 157, 158, 167, 168, 174, 175, 179, 181,
  182, 183, 184, 187, 188, 191, 344, 476, 477, 642, 643
]);
const verifiedHtmlLinkExamples = new Set([201, 491, 494, 524, 536]);
const verifiedHtmlInteropExamples = new Set([
  ...verifiedHtmlSemanticExamples,
  ...verifiedHtmlBlockExamples,
  ...verifiedHtmlLinkExamples
]);
const rawHtmlPreservedWarning =
  'Raw HTML was preserved during Markdown conversion; unconverted tags may not render like the source dialect.';
const unconvertedHtmlBlockWarning =
  'An HTML block without convertible text was preserved unchanged.';
const expectedHtmlInteropWarnings = new Map([
  ...[152, 153, 154, 156, 157, 158, 184, 188, 191].map(number => [
    number,
    [rawHtmlPreservedWarning, unconvertedHtmlBlockWarning]
  ]),
  ...[167, 179, 181, 182, 183].map(number => [
    number,
    [unconvertedHtmlBlockWarning]
  ]),
  [174, [rawHtmlPreservedWarning]]
]);
let wmdxMarkdown;
let parsedCases;
let htmlInteropCases;
let pendingHtmlSemanticCases;
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
const renderedBlockTags = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'ul'
]);

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
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) || syntaxTree(state);
  tree.iterate({
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

function canonicalizeRenderedHtml(html, template) {
  template.innerHTML = html;
  const serialize = (node, parentTag = '') => {
    if (node.nodeType === 3) {
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
            // Keep invalid URLs as authored so the differing semantics remain visible.
          }
        }
        return [attribute.name, value];
      })
      .sort(([left], [right]) => left.localeCompare(right));
    let children = [...node.childNodes]
      .map(child => serialize(child, tag))
      .filter(Boolean);
    if (renderedBlockTags.has(tag)) {
      children = children.filter(child =>
        child[0] !== '#text' || child[1].trim()
      );
    }
    const mergedChildren = [];
    for (const child of children) {
      const previous = mergedChildren.at(-1);
      if (child[0] === '#text' && previous?.[0] === '#text') {
        previous[1] += child[1];
      } else {
        mergedChildren.push(child);
      }
    }
    return [tag, attributes, mergedChildren];
  };
  return JSON.stringify(
    [...template.content.childNodes]
      .map(node => serialize(node, ''))
      .filter(Boolean)
  );
}

function assertEveryEscapeIsNecessary(markdown, expectedHtml, renderAfterRemoval, label) {
  for (const escape of markdown.matchAll(/\\/g)) {
    const withoutEscape = markdown.slice(0, escape.index) +
      markdown.slice(escape.index + 1);
    assert.notEqual(
      renderAfterRemoval(withoutEscape),
      expectedHtml,
      `${label} contains an unnecessary backslash at offset ${escape.index}`
    );
  }
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
  pendingHtmlSemanticCases = htmlInteropCases.filter(
    example => !verifiedHtmlInteropExamples.has(example.example)
  );
  parserComparableCases = parsedCases.filter(example => !isRawHtmlCase(example));
  activeCases = parserComparableCases;
});

test('CommonMark 0.31.2 upstream corpus inventory is complete', () => {
  assert.equal(commonmarkCases.length, 652, 'the pinned upstream corpus is complete');
  assert.equal(htmlInteropCases.length, 77, 'HTML interoperability cases stay outside Wmdx-native parsing');
  assert.equal(pendingHtmlSemanticCases.length, 29, 'every HTML case is either verified or a TODO');
  assert.equal(parserComparableCases.length, 575, 'all non-HTML examples are classified');
  assert.equal(activeCases.length, 575, 'all parser-comparable examples are checked');
  assert.deepEqual(
    commonmarkCases.map(example => example.example),
    Array.from({ length: 652 }, (_, index) => index + 1),
    'every upstream example number appears once and in order'
  );
});

test('CommonMark upstream reference output is checked per numbered example', async t => {
  const { Parser, HtmlRenderer } = require('commonmark');
  const { JSDOM } = require('jsdom');
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const template = new JSDOM('').window.document.createElement('template');

  for (const example of commonmarkCases) {
    await t.test(
      `CM-EX-${String(example.example).padStart(3, '0')} ${example.section} ` +
      `lines ${example.start_line}-${example.end_line}: reference output`,
      () => {
        const actualHtml = renderer.render(parser.parse(example.markdown));
        assert.equal(
          canonicalizeRenderedHtml(actualHtml, template),
          canonicalizeRenderedHtml(example.html, template),
          `reference HTML differs for CommonMark example ${example.example}`
        );
      }
    );
  }
});

test('Wmdx parser node families on CommonMark source are checked per core example', async t => {
  for (const example of activeCases) {
    await t.test(
      `CM-EX-${String(example.example).padStart(3, '0')} ${example.section}: ` +
      `Wmdx source parser families`,
      () => {
        const expectedTags = [...new Set(getExpectedTags(example.html))];
        const missing = expectedTags.filter(tag =>
          !htmlTagNodes[tag]?.some(nodeName => example.nodeNames.has(nodeName))
        );
        assert.deepEqual(
          missing,
          [],
          `source does not expose expected Wmdx parser families for example ${example.example}`
        );
      }
    );
  }
});

test('Wmdx CommonMark import/export semantics are checked per core example', async t => {
  const { Parser, HtmlRenderer } = require('commonmark');
  const { JSDOM } = require('jsdom');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const window = new JSDOM('').window;
  const template = window.document.createElement('template');

  for (const example of activeCases) {
    await t.test(
      `CM-EX-${String(example.example).padStart(3, '0')} ${example.section}: ` +
      'Wmdx import/export semantics',
      () => {
        const imported = convertFromMarkdown(example.markdown, 'commonmark');
        const exported = exportMarkdown(imported.markdown, 'commonmark');
        const expectedHtml = renderer.render(parser.parse(example.markdown));
        const actualHtml = renderer.render(parser.parse(exported.markdown));
        const matchesReference =
          canonicalizeRenderedHtml(actualHtml, template) ===
          canonicalizeRenderedHtml(expectedHtml, template);

        assert.equal(
          matchesReference,
          true,
          `CommonMark rendered semantics differ for example ${example.example}; ` +
          `exported Markdown: ${JSON.stringify(exported.markdown)}`
        );
      }
    );
  }
});

test('all CommonMark core cases survive GFM and Obsidian conversion with explicit warnings', async () => {
  const { Parser, HtmlRenderer } = require('commonmark');
  const { JSDOM } = require('jsdom');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { createWmdxGfmTildeExtension } =
    await import('../src/gfm-strikethrough.mjs');
  const {
    getMarkdownFormatRanges,
    getWmdxColorSyntaxRanges,
    setWmdxColorSyntaxEnabled,
    setWmdxSuperscriptSyntaxEnabled,
    setWmdxUnderlineSyntaxEnabled
  } = await import('../src/markdownFormatting.js');
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const window = new JSDOM('').window;
  const template = window.document.createElement('template');
  const wmdxFormattingLanguage = markdown({
    extensions: [
      Table,
      TaskList,
      createWmdxGfmTildeExtension()
    ]
  });
  setWmdxColorSyntaxEnabled(true);
  setWmdxSuperscriptSyntaxEnabled(true);
  setWmdxUnderlineSyntaxEnabled(true);
  const wmdxFormattingFingerprint = source => {
    const state = EditorState.create({
      doc: source,
      extensions: [wmdxFormattingLanguage]
    });
    ensureSyntaxTree(state, state.doc.length, 1000);
    const view = { state };
    const formats = [
      'bold', 'italic', 'strikethrough', 'subscript',
      'superscript', 'mark', 'code', 'underline'
    ];
    const renderedFormats = Object.fromEntries(formats.map(format => [
      format,
      getMarkdownFormatRanges(view, format).map(range => ({
        kind: range.kind ?? '',
        style: range.style ?? '',
        content: state.doc.sliceString(range.contentFrom, range.contentTo)
      }))
    ]));
    return JSON.stringify({
      formats: renderedFormats,
      colors: getWmdxColorSyntaxRanges(state).map(range => ({
        actionId: range.actionId,
        content: state.doc.sliceString(range.contentFrom, range.contentTo)
      }))
    });
  };
  const wmdxSemantics = (source, canonicalHtml) => JSON.stringify({
    commonMarkHtml: canonicalHtml,
    wmdxFormatting: wmdxFormattingFingerprint(source)
  });
  const frontmatterWarnings = [
    'YAML frontmatter was preserved verbatim; Wmdx does not interpret frontmatter properties.',
    'YAML frontmatter was preserved verbatim; this target does not standardize frontmatter properties.'
  ];
  const expectedWarnings = new Map([
    [96, frontmatterWarnings],
    [98, frontmatterWarnings],
    [308, ['An HTML block without convertible text was preserved unchanged.']],
    [309, ['An HTML block without convertible text was preserved unchanged.']]
  ]);

  assert.equal(activeCases.length, 575, 'the matrix covers every non-HTML CommonMark example');
  for (const example of activeCases) {
    const expectedHtml = renderer.render(parser.parse(example.markdown));
    const expectedCanonicalHtml = canonicalizeRenderedHtml(expectedHtml, template);
    // Authored escapes and bracket-like links have separate source-fidelity and
    // link-structure assertions; this loop audits newly generated inline escapes.
    const auditGeneratedEscapes =
      !example.markdown.includes('\\') && !example.markdown.includes('[[');
    for (const target of ['gfm', 'obsidian']) {
      const imported = convertFromMarkdown(example.markdown, 'commonmark', {
        DOMParser: window.DOMParser
      });
      if (auditGeneratedEscapes) {
        assertEveryEscapeIsNecessary(
          imported.markdown,
          wmdxSemantics(imported.markdown, expectedCanonicalHtml),
          source => {
            const commonMark = exportMarkdown(source, 'commonmark');
            const canonicalHtml = canonicalizeRenderedHtml(
              renderer.render(parser.parse(commonMark.markdown)),
              template
            );
            return wmdxSemantics(source, canonicalHtml);
          },
          `CM-EX-${String(example.example).padStart(3, '0')} Wmdx import`
        );
      }
      const directCommonMark = exportMarkdown(imported.markdown, 'commonmark');
      if (auditGeneratedEscapes) {
        assertEveryEscapeIsNecessary(
          directCommonMark.markdown,
          expectedCanonicalHtml,
          source => canonicalizeRenderedHtml(
            renderer.render(parser.parse(source)),
            template
          ),
          `CM-EX-${String(example.example).padStart(3, '0')} CommonMark export`
        );
      }
      const exported = exportMarkdown(imported.markdown, target);
      const targetRenderAfterRemoval = source => {
        const targetImport = convertFromMarkdown(source, target, {
          DOMParser: window.DOMParser
        });
        const commonMark = exportMarkdown(targetImport.markdown, 'commonmark');
        const canonicalHtml = canonicalizeRenderedHtml(
          renderer.render(parser.parse(commonMark.markdown)),
          template
        );
        return wmdxSemantics(targetImport.markdown, canonicalHtml);
      };
      const returned = convertFromMarkdown(exported.markdown, target, {
        DOMParser: window.DOMParser
      });
      if (auditGeneratedEscapes) {
        assertEveryEscapeIsNecessary(
          exported.markdown,
          wmdxSemantics(returned.markdown, expectedCanonicalHtml),
          targetRenderAfterRemoval,
          `CM-EX-${String(example.example).padStart(3, '0')} ${target} export`
        );
      }
      if (auditGeneratedEscapes) {
        assertEveryEscapeIsNecessary(
          returned.markdown,
          wmdxSemantics(returned.markdown, expectedCanonicalHtml),
          source => {
            const commonMark = exportMarkdown(source, 'commonmark');
            const canonicalHtml = canonicalizeRenderedHtml(
              renderer.render(parser.parse(commonMark.markdown)),
              template
            );
            return wmdxSemantics(source, canonicalHtml);
          },
          `CM-EX-${String(example.example).padStart(3, '0')} ${target} reimport`
        );
      }
      const commonMark = exportMarkdown(returned.markdown, 'commonmark');
      if (auditGeneratedEscapes) {
        assertEveryEscapeIsNecessary(
          commonMark.markdown,
          expectedCanonicalHtml,
          source => canonicalizeRenderedHtml(
            renderer.render(parser.parse(source)),
            template
          ),
          `CM-EX-${String(example.example).padStart(3, '0')} ${target} CommonMark export`
        );
      }
      const actualHtml = renderer.render(parser.parse(commonMark.markdown));
      const warnings = [...new Set([
        ...imported.warnings,
        ...exported.warnings,
        ...returned.warnings,
        ...commonMark.warnings
      ])].sort();

      assert.equal(
        canonicalizeRenderedHtml(actualHtml, template),
        canonicalizeRenderedHtml(expectedHtml, template),
        `CM-EX-${String(example.example).padStart(3, '0')} lost semantics through ${target}; ` +
          `returned Markdown: ${JSON.stringify(commonMark.markdown)}`
      );
      assert.deepEqual(
        warnings,
        [...(expectedWarnings.get(example.example) ?? [])].sort(),
        `CM-EX-${String(example.example).padStart(3, '0')} ${target} warnings must be explicit`
      );
    }
  }
});

test('nested CommonMark emphasis survives conversion through every Markdown flavor', async t => {
  const { Parser, HtmlRenderer } = require('commonmark');
  const { JSDOM } = require('jsdom');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const template = new JSDOM('').window.document.createElement('template');

  for (const number of nestedCommonMarkEmphasisExamples) {
    const example = commonmarkCases.find(candidate => candidate.example === number);
    await t.test(`CM-EX-${String(number).padStart(3, '0')}: nested delimiter round trips`, () => {
      const imported = convertFromMarkdown(example.markdown, 'commonmark');
      const expectedHtml = renderer.render(parser.parse(example.markdown));
      assert.deepEqual(imported.warnings, []);

      for (const target of ['commonmark', 'gfm', 'obsidian']) {
        const exported = exportMarkdown(imported.markdown, target);
        const returned = convertFromMarkdown(exported.markdown, target);
        const commonMark = exportMarkdown(returned.markdown, 'commonmark');
        const actualHtml = renderer.render(parser.parse(commonMark.markdown));

        assert.deepEqual(exported.warnings, [], `CM-EX-${number} ${target} export warnings`);
        assert.deepEqual(returned.warnings, [], `CM-EX-${number} ${target} import warnings`);
        assert.deepEqual(commonMark.warnings, [], `CM-EX-${number} ${target} return warnings`);
        assert.equal(
          canonicalizeRenderedHtml(actualHtml, template),
          canonicalizeRenderedHtml(expectedHtml, template),
          `CM-EX-${number} lost nested emphasis through ${target}`
        );
      }
    });
  }
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
  const { convertFromHtml, convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const Parser = new JSDOM('').window.DOMParser;
  const examples = new Map(commonmarkCases.map(example => [example.example, example]));

  const table = convertFromHtml(examples.get(160).html, Parser);
  assert.match(table.markdown, /^\| foo \|$/m);
  assert.match(table.markdown, /^\| --- \|$/m);

  const activeHtml = convertFromHtml(examples.get(170).html, Parser);
  assert.match(activeHtml.markdown, /okay/);
  assert.doesNotMatch(activeHtml.markdown, /Hello JavaScript|document\.getElementById/);

  const activeMarkdown = convertFromMarkdown(examples.get(170).markdown, 'commonmark', {
    DOMParser: Parser
  });
  assert.match(activeMarkdown.markdown, /okay/);
  assert.doesNotMatch(activeMarkdown.markdown, /<script|Hello JavaScript|document\.getElementById/);

  const comment = convertFromHtml(examples.get(179).html, Parser);
  assert.match(comment.markdown, /okay/);
  assert.doesNotMatch(comment.markdown, /Foo|bar|baz/);
});

test('CommonMark raw HTML import smoke checks are tracked per example', async t => {
  const { JSDOM } = require('jsdom');
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const Parser = new JSDOM('').window.DOMParser;

  for (const example of htmlInteropCases) {
    await t.test(
      `CM-EX-${String(example.example).padStart(3, '0')} ${example.section}: ` +
      `HTML smoke check; semantic parity pending`,
      () => {
        const result = convertFromMarkdown(example.markdown, 'commonmark', {
          DOMParser: Parser
        });
        assert.equal(
          typeof result.markdown,
          'string',
          `example ${example.example} must return Markdown output`
        );
        assert.ok(
          Array.isArray(result.warnings),
          `example ${example.example} must return an explicit warning list`
        );
      }
    );
  }
});

test('CommonMark raw HTML examples 613-632 round-trip through all Markdown flavors', async t => {
  const { JSDOM } = require('jsdom');
  const { Parser, HtmlRenderer } = require('commonmark');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const DOMParser = new JSDOM('').window.DOMParser;
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const template = new JSDOM('').window.document.createElement('template');

  for (const number of verifiedHtmlSemanticExamples) {
    const example = commonmarkCases.find(candidate => candidate.example === number);
    for (const target of ['commonmark', 'gfm', 'obsidian']) {
      await t.test(`CM-EX-${number} → ${target} → CommonMark`, () => {
        const imported = convertFromMarkdown(example.markdown, 'commonmark', { DOMParser });
        const exported = exportMarkdown(imported.markdown, target);
        const returned = convertFromMarkdown(exported.markdown, target, { DOMParser });
        const commonMark = exportMarkdown(returned.markdown, 'commonmark');

        assert.deepEqual(imported.warnings, [], `CM-EX-${number} CommonMark import warnings`);
        assert.deepEqual(exported.warnings, [], `CM-EX-${number} ${target} export warnings`);
        assert.deepEqual(returned.warnings, [], `CM-EX-${number} ${target} import warnings`);
        assert.deepEqual(commonMark.warnings, [], `CM-EX-${number} CommonMark return warnings`);
        const expectedMarkdown = number === 632
          ? example.markdown.replace(/\\(?=")/, '')
          : example.markdown;
        assert.equal(
          commonMark.markdown,
          expectedMarkdown,
          `CM-EX-${number} must return without unnecessary escapes after ${target}`
        );
        const actualHtml = renderer.render(parser.parse(commonMark.markdown));
        assert.equal(
          canonicalizeRenderedHtml(actualHtml, template),
          canonicalizeRenderedHtml(example.html, template),
          `CM-EX-${number} changed CommonMark semantics through ${target}`
        );
        if (number === 632) {
          const sourceWithoutEscape = renderer.render(
            parser.parse(example.markdown.replace(/\\(?=")/, ''))
          );
          assert.equal(
            canonicalizeRenderedHtml(sourceWithoutEscape, template),
            canonicalizeRenderedHtml(example.html, template),
            'the removed quote escape is redundant in CommonMark text'
          );
        }

      });
    }
  }
});

test('selected CommonMark HTML cases round-trip through all flavors with explicit warnings', async t => {
  const { JSDOM } = require('jsdom');
  const { Parser, HtmlRenderer } = require('commonmark');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const DOMParser = new JSDOM('').window.DOMParser;
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const template = new JSDOM('').window.document.createElement('template');

  for (const number of verifiedHtmlBlockExamples) {
    const example = commonmarkCases.find(candidate => candidate.example === number);
    for (const target of ['commonmark', 'gfm', 'obsidian']) {
      await t.test(`CM-EX-${number} → ${target} → CommonMark`, () => {
        const imported = convertFromMarkdown(example.markdown, 'commonmark', { DOMParser });
        const exported = exportMarkdown(imported.markdown, target);
        const returned = convertFromMarkdown(exported.markdown, target, { DOMParser });
        const commonMark = exportMarkdown(returned.markdown, 'commonmark');

        const warnings = [
          ...new Set([
            ...imported.warnings,
            ...exported.warnings,
            ...returned.warnings,
            ...commonMark.warnings
          ])
        ].sort();
        assert.deepEqual(
          warnings,
          [...(expectedHtmlInteropWarnings.get(number) ?? [])].sort(),
          `CM-EX-${number} warning/loss contract through ${target}`
        );
        assert.equal(
          commonMark.markdown,
          example.markdown,
          `CM-EX-${number} must return byte-for-byte after ${target}`
        );
        const actualHtml = renderer.render(parser.parse(commonMark.markdown));
        assert.equal(
          canonicalizeRenderedHtml(actualHtml, template),
          canonicalizeRenderedHtml(example.html, template),
          `CM-EX-${number} changed CommonMark semantics through ${target}`
        );

        for (const escape of commonMark.markdown.matchAll(/\\/g)) {
          const withoutEscape = commonMark.markdown.slice(0, escape.index) +
            commonMark.markdown.slice(escape.index + 1);
          const withoutEscapeHtml = renderer.render(parser.parse(withoutEscape));
          assert.notEqual(
            canonicalizeRenderedHtml(withoutEscapeHtml, template),
            canonicalizeRenderedHtml(example.html, template),
            `CM-EX-${number} has an unnecessary escape at ${escape.index}`
          );
        }

      });
    }
  }
});

test('CommonMark angle-bracket link examples round-trip through all Markdown flavors', async t => {
  const { JSDOM } = require('jsdom');
  const { Parser, HtmlRenderer } = require('commonmark');
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const DOMParser = new JSDOM('').window.DOMParser;
  const parser = new Parser();
  const renderer = new HtmlRenderer();
  const template = new JSDOM('').window.document.createElement('template');

  for (const number of verifiedHtmlLinkExamples) {
    const example = commonmarkCases.find(candidate => candidate.example === number);
    for (const target of ['commonmark', 'gfm', 'obsidian']) {
      await t.test(`CM-EX-${number} → ${target} → CommonMark`, () => {
        const imported = convertFromMarkdown(example.markdown, 'commonmark', { DOMParser });
        const exported = exportMarkdown(imported.markdown, target);
        const returned = convertFromMarkdown(exported.markdown, target, { DOMParser });
        const commonMark = exportMarkdown(returned.markdown, 'commonmark');

        assert.deepEqual(imported.warnings, [], `CM-EX-${number} CommonMark import warnings`);
        assert.deepEqual(exported.warnings, [], `CM-EX-${number} ${target} export warnings`);
        assert.deepEqual(returned.warnings, [], `CM-EX-${number} ${target} import warnings`);
        assert.deepEqual(commonMark.warnings, [], `CM-EX-${number} CommonMark return warnings`);
        assert.equal(
          commonMark.markdown,
          example.markdown,
          `CM-EX-${number} must return byte-for-byte after ${target}`
        );
        const actualHtml = renderer.render(parser.parse(commonMark.markdown));
        assert.equal(
          canonicalizeRenderedHtml(actualHtml, template),
          canonicalizeRenderedHtml(example.html, template),
          `CM-EX-${number} changed CommonMark semantics through ${target}`
        );

        for (const escape of commonMark.markdown.matchAll(/\\/g)) {
          const withoutEscape = commonMark.markdown.slice(0, escape.index) +
            commonMark.markdown.slice(escape.index + 1);
          const withoutEscapeHtml = renderer.render(parser.parse(withoutEscape));
          assert.notEqual(
            canonicalizeRenderedHtml(withoutEscapeHtml, template),
            canonicalizeRenderedHtml(example.html, template),
            `CM-EX-${number} has an unnecessary escape at ${escape.index}`
          );
        }
      });
    }
  }
});

test('CommonMark raw HTML semantic parity has explicit per-example pending cases', async t => {
  for (const example of pendingHtmlSemanticCases) {
    await t.test(
      `CM-EX-${String(example.example).padStart(3, '0')} ${example.section}: ` +
      'raw HTML semantic parity',
      { skip: 'TODO: define exact safe-HTML preservation or documented sanitization loss' },
      () => {
        assert.fail(
          `semantic parity for CommonMark example ${example.example} has not been asserted`
        );
      }
    );
  }
});

test('CommonMark raw HTML semantic parity remains explicitly incomplete', () => {
  assert.ok(parserComparableCases.length < commonmarkCases.length);
  assert.ok(pendingHtmlSemanticCases.length > 0);
  assert.ok(
    fs.existsSync(path.join(__dirname, 'fixtures/COMMONMARK-LICENSE.md')),
    'the upstream fixture attribution and license are present'
  );
});
