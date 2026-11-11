const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { Parser, HtmlRenderer } = require('commonmark');
const { marked } = require('marked');

const dom = new JSDOM('');
const template = dom.window.document.createElement('template');
const commonMarkParser = new Parser();
const commonMarkRenderer = new HtmlRenderer();

function canonicalHtml(html) {
  template.innerHTML = html;
  return template.innerHTML
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderCommonMark(markdown) {
  return commonMarkRenderer.render(commonMarkParser.parse(markdown));
}

function reasonForEscape(markdown, offset, context) {
  if (typeof context.reasonForEscape === 'function') {
    return context.reasonForEscape(markdown, offset);
  }
  const next = markdown[offset + 1] ?? '';
  if (next === '\\') return 'encodes a literal backslash';
  if (next === '|') return context.tableCell
    ? 'prevents a literal pipe from becoming a table column boundary'
    : 'prevents a literal pipe from splitting a Wmdx field';
  if (next === ']') return 'prevents the literal closing bracket from terminating its syntax container';
  if (next === '[') return 'prevents a literal opening bracket from starting nested link syntax';
  if (next === '>' || next === '-' || next === '+' || next === '*') {
    return `prevents the block marker ${JSON.stringify(next)} from starting Markdown structure`;
  }
  if (next === '=' || next === '_') return 'prevents a target-specific paired delimiter from activating';
  if (next === '`') return 'prevents a code span delimiter from activating';
  if (next === '&') return 'keeps an entity-like string literal';
  if (next === '<') return 'keeps HTML/autolink-looking text literal';
  if (next === '.' || next === ')') return 'prevents an ordered-list marker from activating';
  if (next === '\n' || next === '\r' || !next) {
    return 'prevents a trailing backslash from changing line-break semantics';
  }
  if (/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(next)) {
    return `prevents target syntax from consuming literal punctuation ${JSON.stringify(next)}`;
  }
  return `preserves a literal backslash before ordinary character ${JSON.stringify(next)}`;
}

function assertEveryEscapeIsNecessary(
  markdown,
  expectedSemantics,
  render = renderCommonMark,
  context = {}
) {
  const escapes = [...markdown.matchAll(/\\/g)];
  assert.ok(context.id && context.helper && context.target && context.reason,
    'every escape audit must identify its case, serializer, target, and reason');
  const comparable = value => typeof value === 'string'
    ? canonicalHtml(value)
    : JSON.stringify(value);
  for (const match of escapes) {
    const offset = match.index;
    const next = markdown[offset + 1] ?? 'end of input';
    const reason = reasonForEscape(markdown, offset, context);
    assert.ok(reason, `${context.id}: every emitted backslash needs a reason`);
    const withoutEscape = markdown.slice(0, offset) + markdown.slice(offset + 1);
    assert.notEqual(
      comparable(render(withoutEscape)),
      comparable(expectedSemantics),
      `${context.id}: unnecessary or unexplained escape at offset ${offset} ` +
      `before ${JSON.stringify(next)}; helper=${context.helper}; ` +
      `target=${context.target}; reason=${reason}; case rationale=${context.reason}; ` +
      `output=${JSON.stringify(markdown)}`
    );
  }
}

test('HTML prose keeps punctuation bare unless CommonMark would parse syntax', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const sourceHtml =
    '<p>Hash #tag, a*b, under_score, [x], !wow, less &lt;3, 6.2 value; ' +
    'literal *bold*, _italic_, `code`, &amp;copy;, [label](target), ' +
    '&lt;b&gt;literal&lt;/b&gt;.</p>';
  const converted = convertFromHtml(sourceHtml, dom.window.DOMParser);
  const exported = exportMarkdown(converted.markdown, 'commonmark');
  const expectedMarkdown =
    'Hash #tag, a\\*b, under_score, [x], !wow, less <3, 6.2 value; ' +
    'literal \\*bold*, \\_italic_, \\`code`, \\&copy;, ' +
    '\\[label](target), \\<b>literal\\</b>.';

  assert.equal(exported.markdown, expectedMarkdown);
  assert.equal(
    canonicalHtml(renderCommonMark(exported.markdown)),
    canonicalHtml(
      '<p>Hash #tag, a*b, under_score, [x], !wow, less &lt;3, 6.2 value; ' +
      'literal *bold*, _italic_, `code`, &amp;copy;, [label](target), ' +
      '&lt;b&gt;literal&lt;/b&gt;.</p>'
    )
  );
  assertEveryEscapeIsNecessary(exported.markdown, '<p>' +
    'Hash #tag, a*b, under_score, [x], !wow, less &lt;3, 6.2 value; ' +
    'literal *bold*, _italic_, `code`, &amp;copy;, [label](target), ' +
    '&lt;b&gt;literal&lt;/b&gt;.</p>',
  renderCommonMark,
  {
    id: 'ESC-TXT-02',
    helper: 'markdownText through HTML import and CommonMark export',
    target: 'CommonMark 0.31.2',
    reason: 'prevent literal emphasis, code, entity, link, or HTML text from activating syntax'
  });
});

test('block-start escapes depend on paragraph, heading, list, and quote context', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const paragraph = convertFromHtml('<p>5. Item</p>', dom.window.DOMParser);
  const heading = convertFromHtml('<h1>5. Item</h1>', dom.window.DOMParser);
  const listItem = convertFromHtml('<ol><li>5. Item</li></ol>', dom.window.DOMParser);
  const quote = convertFromHtml(
    '<blockquote><p>&gt; literal</p></blockquote>',
    dom.window.DOMParser
  );
  const headingMarkdown = exportMarkdown(heading.markdown, 'commonmark').markdown;
  const listMarkdown = exportMarkdown(listItem.markdown, 'commonmark').markdown;
  const quoteMarkdown = exportMarkdown(quote.markdown, 'commonmark').markdown;
  const cases = [
    {
      id: 'paragraph ordered-list collision',
      markdown: exportMarkdown(paragraph.markdown, 'commonmark').markdown,
      expected: '<p>5. Item</p>',
      required: '5\\. Item'
    },
    {
      id: 'heading text',
      markdown: headingMarkdown,
      expected: '<h1>5. Item</h1>',
      required: '# 5. Item'
    },
    {
      id: 'ordered-list item text',
      markdown: listMarkdown,
      expected: '<ol><li>5. Item</li></ol>',
      required: '1. 5\\. Item'
    },
    {
      id: 'blockquote literal marker',
      markdown: quoteMarkdown,
      expected: '<blockquote><p>&gt; literal</p></blockquote>',
      required: '> \\> literal'
    }
  ];

  for (const item of cases) {
    assert.ok(
      item.markdown.includes(item.required),
      `${item.id} should use the expected context-specific spelling`
    );
    assert.equal(
      canonicalHtml(renderCommonMark(item.markdown)),
      canonicalHtml(item.expected),
      `${item.id} must preserve its rendered meaning`
    );
    assertEveryEscapeIsNecessary(item.markdown, item.expected, renderCommonMark, {
      id: item.id,
      helper: 'markdownText with block-context options',
      target: 'CommonMark 0.31.2',
      reason: `${item.id} uses an escape only to prevent the block construct named by its case`
    });
  }
});

test('CommonMark bracket collisions use only necessary Obsidian-target escapes', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const cases = [
    {
      id: 'ESC-OBSIDIAN-CM-REF-559',
      source: '[[*foo* bar]]\n\n[*foo* bar]: /url "title"\n',
      expected:
        '\\[[*foo* bar]]\n\n[*foo* bar]: /url "title"\n',
      reason: 'prevent a CommonMark shortcut reference from becoming an Obsidian wikilink'
    },
    {
      id: 'ESC-OBSIDIAN-CM-IMAGE-590',
      source: '![[foo]]\n\n[[foo]]: /url "title"\n',
      expected:
        '!\\[[foo]]\n\n\\[[foo]]: /url "title"\n',
      reason: 'keep CommonMark literal image/reference syntax from becoming Obsidian embeds or wikilinks'
    }
  ];

  for (const item of cases) {
    const commonMark = convertFromMarkdown(
      item.source,
      'commonmark',
      { DOMParser: dom.window.DOMParser }
    );
    const exported = exportMarkdown(commonMark.markdown, 'obsidian');
    assert.equal(exported.markdown, item.expected, item.id);

    const parseObsidian = markdown => {
      const parsed = convertFromMarkdown(
        markdown,
        'obsidian',
        { DOMParser: dom.window.DOMParser }
      );
      return { markdown: parsed.markdown, warnings: parsed.warnings };
    };
    const expectedSemantics = parseObsidian(exported.markdown);
    assertEveryEscapeIsNecessary(
      exported.markdown,
      expectedSemantics,
      parseObsidian,
      {
        id: item.id,
        helper: 'protectObsidianCommonMarkReferenceCollisions',
        target: 'Wmdx Obsidian-profile importer',
        reason: item.reason
      }
    );
  }
});

test('block-start escape audit covers rules, Setext, reference definitions, and HTML declarations', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const sourceHtml = '<p>Text\n===</p><p>---</p><p>[ref]: /url</p><p>&gt; quote</p>' +
    '<p>- bullet</p><p>1. ordered</p>' +
    '<p>&lt;![CDATA[x]]&gt; and &lt;?processing?&gt;</p>';
  const expectedHtml = '<p>Text\n===</p><p>---</p><p>[ref]: /url</p><p>&gt; quote</p>' +
    '<p>- bullet</p><p>1. ordered</p>' +
    '<p>&lt;![CDATA[x]]&gt; and &lt;?processing?&gt;</p>';
  const converted = convertFromHtml(sourceHtml, dom.window.DOMParser);
  const exported = exportMarkdown(converted.markdown, 'commonmark');

  assert.match(exported.markdown, /\\===/);
  assert.match(exported.markdown, /\\---/);
  assert.match(exported.markdown, /\\\[ref\]:/);
  assert.match(exported.markdown, /\\>/);
  assert.match(exported.markdown, /\\-/);
  assert.match(exported.markdown, /1\\\./);
  assert.match(exported.markdown, /\\<!\[CDATA/);
  assert.match(exported.markdown, /\\<\?processing/);
  assert.equal(
    canonicalHtml(renderCommonMark(exported.markdown)),
    canonicalHtml(expectedHtml)
  );
  assertEveryEscapeIsNecessary(exported.markdown, expectedHtml, renderCommonMark, {
    id: 'ESC-BLK-02 / ESC-REF-01 / ESC-HTML-01',
    helper: 'markdownText block syntax and literal HTML protection',
    target: 'CommonMark 0.31.2',
    reason: 'keep rule lines, reference definitions, quote/list markers, and declarations as visible paragraph text'
  });
});

test('literal backslashes and mixed delimiter runs survive serialization minimally', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const sourceHtml = String.raw`<p>Literal \*paired* and **strong *nested*** and back\slash</p>`;
  const expectedHtml = String.raw`<p>Literal \*paired* and **strong *nested*** and back\slash</p>`;
  const converted = convertFromHtml(sourceHtml, dom.window.DOMParser);
  const exported = exportMarkdown(converted.markdown, 'commonmark');

  assert.ok(exported.markdown.includes(String.raw`back\slash`),
    'a literal backslash before a letter must not be doubled unnecessarily');
  assert.equal(
    canonicalHtml(renderCommonMark(exported.markdown)),
    canonicalHtml(expectedHtml)
  );
  assertEveryEscapeIsNecessary(exported.markdown, expectedHtml, renderCommonMark, {
    id: 'ESC-SLASH-01',
    helper: 'markdownText backslash-run serializer',
    target: 'CommonMark 0.31.2',
    reason: 'preserve literal backslash runs while escaping only runs that could consume following syntax'
  });
});

test('backslash-run encoding is minimal from one through four literal slashes', async () => {
  const { escapeMarkdownField } =
    await import('../src/markdownEscaping.js');
  const renderText = source => {
    const container = dom.window.document.createElement('div');
    container.innerHTML = renderCommonMark(source);
    return container.firstElementChild?.textContent ?? '';
  };
  const following = ['a', '*', '|', '\n', ''];

  for (let runLength = 1; runLength <= 4; runLength++) {
    for (const next of following) {
      const literal = `left${'\\'.repeat(runLength)}${next}right`;
      const serialized = escapeMarkdownField(literal);
      assert.equal(renderText(serialized), literal);
      assertEveryEscapeIsNecessary(serialized, literal, renderText, {
        id: `ESC-SLASH-RUN-${runLength}-${next ? next.codePointAt(0).toString(16) : 'eof'}`,
        helper: 'escapeMarkdownField CommonMark backslash-run encoder',
        target: 'CommonMark 0.31.2 inline text',
        reason: 'encode the exact number of literal backslashes without consuming following punctuation or creating a hard break'
      });
    }
  }
});

test('Wmdx decimal headings do not add list-marker escapes to heading text', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  for (const level of [1, 2, 6]) {
    const source = `.${level} 5. Chapter`;
    for (const dialect of ['commonmark', 'gfm', 'obsidian']) {
      const exported = exportMarkdown(source, dialect);
      assert.equal(exported.markdown, `${'#'.repeat(level)} 5. Chapter`);
      assert.doesNotMatch(exported.markdown, /5\\\./);
    }
  }

  const imported = convertFromMarkdown('# 5. Chapter\n', 'commonmark');
  assert.equal(imported.markdown, '.1 5. Chapter\n');
  for (const dialect of ['commonmark', 'gfm', 'obsidian']) {
    const exported = exportMarkdown(imported.markdown, dialect);
    assert.equal(exported.markdown, '# 5. Chapter\n');
    assert.doesNotMatch(exported.markdown, /5\\\./);
  }
});

test('table-cell pipe escaping is necessary and does not affect adjacent prose', async () => {
  const { convertFromHtml } = await import('../src/markdownConversion.mjs');
  const converted = convertFromHtml(
    '<table><tr><th>Value</th></tr><tr><td>a|b</td></tr></table>',
    dom.window.DOMParser
  );
  const expected = '<table><thead><tr><th>Value</th></tr></thead>' +
    '<tbody><tr><td>a|b</td></tr></tbody></table>\n';

  assert.match(converted.markdown, /\| a\\\|b \|/);
  assert.equal(
    canonicalHtml(marked.parse(converted.markdown)),
    canonicalHtml(expected)
  );
  assertEveryEscapeIsNecessary(
    converted.markdown,
    expected,
    markdown => marked.parse(markdown),
    {
      id: 'ESC-TBL-01',
      helper: 'markdownText tableCell mode',
      target: 'GFM pipe tables',
      reason: 'prevent a literal cell pipe from becoming a column boundary'
    }
  );
});

test('Wmdx resource field escapes are individually classified and semantically necessary', async () => {
  const { formatWmdxResourceSyntax, parseWmdxResourceSyntax } =
    await import('../src/wmdxResources.js');
  const input = {
    embed: true,
    source: String.raw`assets/a|b\photo.png`,
    title: String.raw`Caption | folder\note`,
    size: '80%',
    alignment: 'center'
  };
  const syntax = formatWmdxResourceSyntax(input);
  const parsed = parseWmdxResourceSyntax(syntax);

  assert.equal(parsed.source, input.source);
  assert.equal(parsed.title, input.title);
  assert.ok(syntax.includes(String.raw`b\photo.png`),
    'a literal backslash before an ordinary filename character should stay singly encoded');
  assertEveryEscapeIsNecessary(syntax, parsed, parseWmdxResourceSyntax, {
    id: 'ESC-WMDX-RESOURCE-01',
    helper: 'escapeField in wmdxResources.js',
    target: 'Wmdx resource field parser',
    reason: 'backslashes preserve literal path characters and pipes protect Wmdx field boundaries'
  });
});

test('image, audio, video, and attachment label escapes are audited per serializer', async () => {
  const {
    formatMarkdownImage,
    parseMarkdownImage
  } = await import('../src/markdownImages.js');
  const media = await import('../src/markdownMedia.js');
  const cases = [
    {
      id: 'ESC-IMAGE-ALT-01',
      helper: 'formatMarkdownImage alt serializer',
      target: 'CommonMark image label',
      markdown: formatMarkdownImage(
        String.raw`Diagram\notes ] bracket`,
        'images/diagram.png',
        320
      ),
      parse: parseMarkdownImage,
      expectedLabel: String.raw`Diagram\notes ] bracket`
    },
    {
      id: 'ESC-AUDIO-LABEL-01',
      helper: 'formatMarkdownAudioLink label serializer',
      target: 'CommonMark link label with audio metadata',
      markdown: media.formatMarkdownAudioLink(
        String.raw`Voice\notes ] take`,
        'audio/voice.mp3'
      ),
      parse: media.parseMarkdownAudioLink,
      expectedLabel: String.raw`Voice\notes ] take`
    },
    {
      id: 'ESC-VIDEO-LABEL-01',
      helper: 'formatMarkdownVideoLink label serializer',
      target: 'CommonMark link label with video metadata',
      markdown: media.formatMarkdownVideoLink(
        String.raw`Clip\notes ] take`,
        'video/clip.mp4'
      ),
      parse: media.parseMarkdownVideoLink,
      expectedLabel: String.raw`Clip\notes ] take`
    },
    {
      id: 'ESC-ATTACHMENT-LABEL-01',
      helper: 'formatMarkdownAttachmentLink label serializer',
      target: 'CommonMark link label with attachment metadata',
      markdown: media.formatMarkdownAttachmentLink(
        String.raw`File\notes ] attached`,
        'attachments/file.pdf'
      ),
      parse: media.parseMarkdownAttachmentLink,
      expectedLabel: String.raw`File\notes ] attached`
    }
  ];

  for (const item of cases) {
    const parsed = item.parse(item.markdown);
    assert.equal(parsed.label ?? parsed.alt, item.expectedLabel);
    assertEveryEscapeIsNecessary(item.markdown, parsed, item.parse, {
      id: item.id,
      helper: item.helper,
      target: item.target,
      reason: 'protect the closing label delimiter and preserve literal backslash data'
    });
  }
});

test('Obsidian inline-footnote formatter escapes only syntax needed by its parser', async () => {
  const { formatObsidianInlineFootnote, parseFootnotes } =
    await import('../src/footnotes.js');
  const expectedBody = String.raw`A\notes ] footnote`;
  const markdown = formatObsidianInlineFootnote(expectedBody);
  const parseBody = source => parseFootnotes(source)
    .definitions.find(definition => definition.syntax === 'obsidian_inline')?.body ?? null;

  assert.equal(parseBody(markdown), expectedBody);
  assert.ok(markdown.includes(String.raw`A\notes`),
    'a backslash before an ordinary letter should be kept as data, not doubled');
  assertEveryEscapeIsNecessary(markdown, expectedBody, parseBody, {
    id: 'ESC-FOOTNOTE-INLINE-01',
    helper: 'formatObsidianInlineFootnote',
    target: 'Obsidian inline-footnote parser',
    reason: 'preserve literal backslashes while protecting a literal closing bracket'
  });
});

test('CommonMark import escapes each Wmdx collision only where required', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { parseObsidianLinkSyntax } =
    await import('../src/wmdxLinkSyntax.mjs');
  const { parseObsidianImageEmbed } =
    await import('../src/markdownImages.js');
  const { getMarkdownDocumentLayout } =
    await import('../src/markdownDocumentLayout.js');
  const listSyntax = await import('../src/listSyntax.mjs');
  const headingSyntax = await import('../src/headingSyntax.mjs');
  const calloutSyntax = await import('../src/calloutSyntax.mjs');
  const blockquoteSyntax = await import('../src/blockquoteSyntax.mjs');
  const { wmdxCommonMarkCompatibility } =
    await import('../src/commonmark-compat.mjs');
  const { EditorState } = require('@codemirror/state');
  const { markdown } = require('@codemirror/lang-markdown');
  const { Table, TaskList } = require('@lezer/markdown');
  const calloutSettings = {
    list: listSyntax.normalizeListSyntaxSettings(),
    heading: headingSyntax.normalizeHeadingSyntaxSettings(),
    callout: calloutSyntax.normalizeCalloutSyntaxSettings(),
    blockquote: blockquoteSyntax.normalizeBlockquoteSyntaxSettings()
  };
  const parseObsidianCalloutOpeners = source => {
    const state = EditorState.create({
      doc: source,
      extensions: [markdown({
        extensions: [Table, TaskList, wmdxCommonMarkCompatibility]
      })]
    });
    return getMarkdownDocumentLayout(state, calloutSettings).calloutOpeners.size;
  };
  const cases = [
    {
      id: 'ESC-WMDX-SUBSCRIPT-01',
      source: 'Literal ~subscript~ text.',
      reason: 'prevent a literal CommonMark tilde pair from becoming Wmdx subscript'
    },
    {
      id: 'ESC-WMDX-HIGHLIGHT-01',
      source: 'Literal ==highlight== text.',
      reason: 'prevent a literal CommonMark equals pair from becoming Wmdx highlight'
    },
    {
      id: 'ESC-WMDX-PEN-01',
      source: 'Literal =pen= text.',
      reason: 'prevent a literal CommonMark single-equals pair from becoming Wmdx pen syntax'
    },
    {
      id: 'ESC-WMDX-SUPERSCRIPT-01',
      source: 'Literal ^superscript^ text.',
      reason: 'prevent a literal CommonMark caret pair from becoming Wmdx superscript'
    },
    {
      id: 'ESC-WMDX-STRIKE-LITERAL-01',
      source: 'Literal ~~tildes~~ text.',
      reason: 'prevent literal CommonMark tildes from becoming Wmdx strikethrough'
    },
    {
      id: 'ESC-WMDX-WIKILINK-01',
      source: '[[wikilink]]',
      appParser: parseObsidianLinkSyntax,
      reason: 'prevent CommonMark literal brackets from becoming an Obsidian-style wikilink'
    },
    {
      id: 'ESC-WMDX-IMAGE-EMBED-01',
      source: '![[image.png]]',
      appParser: parseObsidianImageEmbed,
      reason: 'prevent a literal CommonMark image-like string from becoming an Obsidian image embed'
    },
    {
      id: 'ESC-WMDX-EQUALS-RUN-01',
      source: '===',
      expectNoEscapes: true,
      reason: 'three equals signs are not a Wmdx delimiter and need no protection'
    },
    {
      id: 'ESC-CM-UNDERSCORE-EMPHASIS-01',
      source: '_emphasis_ and __strong__',
      expectNoEscapes: true,
      reason: 'CommonMark underscore emphasis is normalized to asterisk emphasis instead of escaped as literal text'
    },
    {
      id: 'ESC-WMDX-CALLOUT-01',
      source: '> [!note] Literal CommonMark quote text.',
      appParser: parseObsidianCalloutOpeners,
      reason: 'prevent a quote marker from activating the Obsidian callout parser'
    }
  ];

  for (const item of cases) {
    const imported = convertFromMarkdown(item.source, 'commonmark').markdown;
    const renderAfterWmdxParsing = source =>
      renderCommonMark(exportMarkdown(source, 'commonmark').markdown);
    const expectedHtml = renderCommonMark(item.source);

    assert.equal(
      canonicalHtml(renderAfterWmdxParsing(imported)),
      canonicalHtml(expectedHtml),
      `${item.id}: import/export must preserve the CommonMark meaning`
    );
    if (item.expectNoEscapes) {
      assert.ok(!imported.includes('\\'),
        `${item.id}: this syntax must not receive unnecessary backslashes`);
    }
    const parser = item.appParser ?? renderAfterWmdxParsing;
    const expectedSemantics = item.appParser
      ? item.appParser(imported)
      : expectedHtml;
    assertEveryEscapeIsNecessary(imported, expectedSemantics, parser, {
      id: item.id,
      helper: 'escapeDialectSpecificWmdxSyntax / escapeForeignCalloutMarkers',
      target: 'CommonMark import into Wmdx, then Wmdx export back to CommonMark',
      reason: item.reason
    });
  }
});

test('Markdown link destination and label serializers account for each backslash', async () => {
  const {
    createMarkdownReferenceInsertion,
    formatMarkdownLinkForFlavor,
    parseObsidianLinkSyntax
  } = await import('../src/wmdxLinkSyntax.mjs');
  const commonmark = formatMarkdownLinkForFlavor({
    flavor: 'commonmark',
    target: 'https://example.test/a(b)',
    title: String.raw`A [caption] with \path`
  });
  const expectedCommonmarkHtml =
    '<p><a href="https://example.test/a%28b%29">A [caption] with \\path</a></p>';
  assert.equal(canonicalHtml(renderCommonMark(commonmark)), canonicalHtml(expectedCommonmarkHtml));
  assertEveryEscapeIsNecessary(commonmark, expectedCommonmarkHtml, renderCommonMark, {
    id: 'ESC-LINK-COMMONMARK-01',
    helper: 'formatMarkdownLinkForFlavor plus encodeMarkdownDestination',
    target: 'CommonMark inline link',
    reason: 'protect literal label brackets and balance destination parentheses'
  });

  const obsidian = formatMarkdownLinkForFlavor({
    flavor: 'obsidian',
    target: String.raw`folder/note|section`,
    title: String.raw`A [caption] with \path`,
    aliasPresent: true
  });
  const expectedObsidian = {
    embed: false,
    target: String.raw`folder/note|section`,
    alias: String.raw`A [caption] with \path`,
    title: String.raw`A [caption] with \path`
  };
  assert.deepEqual(parseObsidianLinkSyntax(obsidian), expectedObsidian);
  assertEveryEscapeIsNecessary(
    obsidian,
    expectedObsidian,
    parseObsidianLinkSyntax,
    {
      id: 'ESC-LINK-OBSIDIAN-01',
      helper: 'formatMarkdownLinkForFlavor Obsidian target and alias serializer',
      target: 'Obsidian wikilink parser',
      reason: 'preserve a literal target pipe, alias brackets, and literal backslash data'
    }
  );

  const reference = createMarkdownReferenceInsertion({
    label: String.raw`A [caption] with \path`,
    target: 'https://example.test/a(b)'
  });
  const referenceDocument = `${reference.markdown}\n\n${reference.definition}`;
  const expectedReferenceHtml =
    '<p><a href="https://example.test/a%28b%29">A [caption] with \\path</a></p>';
  assert.equal(
    canonicalHtml(renderCommonMark(referenceDocument)),
    canonicalHtml(expectedReferenceHtml)
  );
  assertEveryEscapeIsNecessary(
    referenceDocument,
    expectedReferenceHtml,
    renderCommonMark,
    {
      id: 'ESC-LINK-REFERENCE-01',
      helper: 'createMarkdownReferenceInsertion label serializer',
      target: 'CommonMark reference link',
      reason: 'keep literal label brackets and backslashes without changing the reference destination'
    }
  );
});

test('HTML link import emits only destination escapes that CommonMark needs', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const cases = [
    {
      id: 'ESC-LINK-HTML-IMPORT-01',
      href: String.raw`https://example.test/a(b)\notes`,
      expectedHtml:
        '<p><a href="https://example.test/a(b)%5Cnotes">A link</a></p>',
      reason: 'leave balanced parentheses bare and preserve literal backslash path data'
    },
    {
      id: 'ESC-LINK-HTML-UNBALANCED-OPEN-01',
      href: 'https://example.test/a(b',
      expectedHtml:
        '<p><a href="https://example.test/a(b">A link</a></p>',
      reason: 'escape an unmatched opening parenthesis so it cannot consume the Markdown link terminator'
    },
    {
      id: 'ESC-LINK-HTML-UNBALANCED-CLOSE-01',
      href: 'https://example.test/a)b',
      expectedHtml:
        '<p><a href="https://example.test/a)b">A link</a></p>',
      reason: 'escape an unmatched closing parenthesis so it cannot terminate the Markdown destination early'
    },
    {
      id: 'ESC-LINK-HTML-ANGLE-01',
      href: 'https://example.test/a<b>',
      expectedHtml:
        '<p><a href="https://example.test/a%3Cb%3E">A link</a></p>',
      reason: 'percent-encode angle brackets instead of adding backslashes the CommonMark renderer does not need'
    }
  ];
  for (const item of cases) {
    const source = `<p><a href="${item.href}">A link</a></p>`;
    const imported = convertFromHtml(source, dom.window.DOMParser).markdown;
    const markdown = exportMarkdown(imported, 'commonmark').markdown;
    assert.equal(
      canonicalHtml(renderCommonMark(markdown)),
      canonicalHtml(item.expectedHtml)
    );
    assertEveryEscapeIsNecessary(markdown, item.expectedHtml, renderCommonMark, {
      id: item.id,
      helper: 'markdownLinkDestination during HTML import',
      target: 'CommonMark link destination',
      reason: item.reason
    });
  }
});

test('HTML code import chooses safe backtick fences instead of ineffective escapes', async () => {
  const { convertFromHtml, convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const values = ['`', 'a`b', '`a`', ' a ', '  '];
  for (const codeText of values) {
    const escapedText = codeText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = `<p>Code <code>${escapedText}</code> end.</p>`;
    const expectedHtml = `<p>Code <code>${escapedText}</code> end.</p>`;
    const htmlImport = convertFromHtml(html, dom.window.DOMParser);
    const htmlMarkdown = exportMarkdown(htmlImport.markdown, 'commonmark').markdown;
    assert.equal(
      canonicalHtml(renderCommonMark(htmlMarkdown)),
      canonicalHtml(expectedHtml),
      `HTML import should preserve code text ${JSON.stringify(codeText)}`
    );
    assert.ok(!htmlImport.markdown.includes('\\'),
      'code-span delimiters must not be backslash-escaped inside the code span');

    const inlineHtml = `Code <code>${escapedText}</code> end.`;
    const markdownImport = convertFromMarkdown(
      inlineHtml,
      'commonmark',
      { DOMParser: dom.window.DOMParser }
    );
    const roundTrip = exportMarkdown(markdownImport.markdown, 'commonmark').markdown;
    assert.equal(
      canonicalHtml(renderCommonMark(roundTrip)),
      canonicalHtml(expectedHtml)
    );
  }
});
