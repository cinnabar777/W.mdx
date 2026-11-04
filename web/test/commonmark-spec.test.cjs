const test = require('node:test');
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
const wmdxMarkdown = markdown({
  extensions: [GFM, Table, Strikethrough, TaskList]
});

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

const knownGaps = new Map([
  [10, 'ATX heading markers followed by a tab are not recognized as headings.'],
  [523, 'An undefined shortcut-link label changes emphasis parsing around brackets.']
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
  syntaxTree(state).iterate({
    enter(node) {
      nodeNames.add(node.name);
    }
  });
  return nodeNames;
}

const parsedCases = commonmarkCases.map(example => ({
  ...example,
  nodeNames: getParserNodeNames(example.markdown)
}));

function isRawHtmlCase(example) {
  const expectedTags = getExpectedTags(example.html);
  return htmlSections.has(example.section) ||
    example.nodeNames.has('HTMLTag') ||
    example.nodeNames.has('HTMLBlock') ||
    expectedTags.some(tag => !htmlTagNodes[tag]);
}

const htmlInteropCases = parsedCases.filter(isRawHtmlCase);

const parserComparableCases = parsedCases.filter(example => !isRawHtmlCase(example));

const activeCases = parserComparableCases.filter(example =>
  !knownGaps.has(example.example)
);

test('CommonMark 0.31.2 fixtures expose expected core parser node families', () => {
  assert.equal(commonmarkCases.length, 652, 'the pinned upstream corpus is complete');
  assert.equal(htmlInteropCases.length, 77, 'HTML interoperability cases stay outside Wmdx-native parsing');
  assert.equal(parserComparableCases.length, 575, 'all non-HTML examples are classified');
  assert.equal(activeCases.length, 573, 'known parser gaps remain explicitly tracked');

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

test('known CommonMark parser gaps are anchored to upstream examples', () => {
  for (const [exampleNumber, reason] of knownGaps) {
    const fixture = parsedCases.find(example => example.example === exampleNumber);
    assert.ok(fixture, `CommonMark example ${exampleNumber} remains in the corpus`);
    assert.ok(reason.length > 0);
    assert.ok(
      parserComparableCases.some(example => example.example === exampleNumber),
      `CommonMark example ${exampleNumber} is included in parser comparisons`
    );
    const missing = [...new Set(getExpectedTags(fixture.html))]
      .filter(tag => !htmlTagNodes[tag].some(nodeName => fixture.nodeNames.has(nodeName)));
    assert.ok(missing.length > 0, `CommonMark example ${exampleNumber} still reproduces its tracked gap`);
  }
});

test.todo('CommonMark example 10: recognize an ATX heading after a tab separator');
test.todo('CommonMark example 523: treat an undefined shortcut-link label literally inside emphasis');
test.todo('CommonMark raw HTML examples: define and test Wmdx-native import conversion');

test('CommonMark fixtures check parser semantics, not full WYSIWYG rendering or export', () => {
  assert.ok(parserComparableCases.length < commonmarkCases.length);
  assert.ok(htmlInteropCases.length > 0);
  assert.ok(
    fs.existsSync(path.join(__dirname, 'fixtures/COMMONMARK-LICENSE.md')),
    'the upstream fixture attribution and license are present'
  );
});
