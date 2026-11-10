const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const PROFILES = ['commonmark', 'gfm', 'obsidian'];

function canonicalizeHtml(html, document) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const meaningfulAttributes = new Set([
    'alt', 'checked', 'colspan', 'disabled', 'height', 'href', 'rowspan',
    'src', 'start', 'title', 'width'
  ]);
  const serialize = node => {
    if (node.nodeType === 3) {
      const value = node.nodeValue.replace(/\s+/g, ' ');
      return value ? ['text', value] : null;
    }
    if (node.nodeType !== 1) return null;
    const tag = node.tagName.toLowerCase();
    const attributes = [...node.attributes]
      .filter(attribute => meaningfulAttributes.has(attribute.name))
      .map(attribute => [attribute.name, attribute.value])
      .sort(([left], [right]) => left.localeCompare(right));
    const children = [...node.childNodes].map(serialize).filter(Boolean);
    return [tag, attributes, children];
  };
  return JSON.stringify(
    [...template.content.childNodes]
      .map(serialize)
      .filter(child => child && !(child[0] === 'text' && !child[1].trim()))
  );
}

const sharedElementCases = [
  {
    id: 'TXT-01',
    name: 'paragraphs, soft breaks, and hard breaks',
    sources: {
      commonmark: 'First line\ncontinues softly.\nThis line ends hard.  \nNext line.\n\nSecond paragraph.',
      gfm: 'First line\ncontinues softly.\nThis line ends hard.  \nNext line.\n\nSecond paragraph.',
      obsidian: 'First line\ncontinues softly.\nThis line ends hard.  \nNext line.\n\nSecond paragraph.'
    }
  },
  {
    id: 'HDG-01',
    name: 'ATX and Setext headings',
    sources: {
      commonmark: 'Title\n=====\n\n## Section',
      gfm: 'Title\n=====\n\n## Section',
      obsidian: 'Title\n=====\n\n## Section'
    }
  },
  {
    id: 'EMP-01',
    name: 'bold, italic, combined emphasis, and inline code',
    sources: {
      commonmark: 'A **bold**, *italic*, ***combined***, and `literal *code*` span.',
      gfm: 'A **bold**, *italic*, ***combined***, and `literal *code*` span.',
      obsidian: 'A **bold**, *italic*, ***combined***, and `literal *code*` span.'
    }
  },
  {
    id: 'CODE-01',
    name: 'fenced code and language label',
    sources: {
      commonmark: '```javascript\nconst answer = 42;\n```',
      gfm: '```javascript\nconst answer = 42;\n```',
      obsidian: '```javascript\nconst answer = 42;\n```'
    }
  },
  {
    id: 'CODE-02',
    name: 'multi-backtick code span and tilde fence',
    sources: {
      commonmark: 'Use `` `code` `` literally.\n\n~~~text\n**literal**\n~~~',
      gfm: 'Use `` `code` `` literally.\n\n~~~text\n**literal**\n~~~',
      obsidian: 'Use `` `code` `` literally.\n\n~~~text\n**literal**\n~~~'
    }
  },
  {
    id: 'LST-01',
    name: 'nested unordered and ordered lists',
    sources: {
      commonmark: '- first\n- second\n  - nested\n\n1. one\n2. two',
      gfm: '- first\n- second\n  - nested\n\n1. one\n2. two',
      obsidian: '- first\n- second\n  - nested\n\n1. one\n2. two'
    }
  },
  {
    id: 'LST-02',
    name: 'alternate bullet and ordered list markers',
    sources: {
      commonmark: '* star\n+ plus\n\n1) first\n2) second',
      gfm: '* star\n+ plus\n\n1) first\n2) second',
      obsidian: '* star\n+ plus\n\n1) first\n2) second'
    }
  },
  {
    id: 'BRK-01',
    name: 'multi-paragraph and nested blockquotes',
    sources: {
      commonmark: '> First paragraph.\n>\n> Second paragraph.\n>\n> > Nested quote.',
      gfm: '> First paragraph.\n>\n> Second paragraph.\n>\n> > Nested quote.',
      obsidian: '> First paragraph.\n>\n> Second paragraph.\n>\n> > Nested quote.'
    }
  },
  {
    id: 'LNK-01',
    name: 'external and relative links with titles',
    sources: {
      commonmark: '[External](https://example.test/path "Site") and [Local](docs/file%20name.md).',
      gfm: '[External](https://example.test/path "Site") and [Local](docs/file%20name.md).',
      obsidian: '[External](https://example.test/path "Site") and [Local](docs/file%20name.md).'
    }
  },
  {
    id: 'LNK-03',
    name: 'reference links and their definitions',
    sources: {
      commonmark: 'Read the [guide][manual].\n\n[manual]: https://example.test/guide "Manual"',
      gfm: 'Read the [guide][manual].\n\n[manual]: https://example.test/guide "Manual"',
      obsidian: 'Read the [guide][manual].\n\n[manual]: https://example.test/guide "Manual"'
    }
  },
  {
    id: 'IMG-01',
    name: 'Markdown image with alt text and title',
    sources: {
      commonmark: '![Pixel](https://example.test/pixel.png "Pixel title")',
      gfm: '![Pixel](https://example.test/pixel.png "Pixel title")',
      obsidian: '![Pixel](https://example.test/pixel.png "Pixel title")'
    }
  },
  {
    id: 'HR-01',
    name: 'thematic breaks',
    sources: {
      commonmark: 'Before.\n\n---\n\nAfter.',
      gfm: 'Before.\n\n***\n\nAfter.',
      obsidian: 'Before.\n\n---\n\nAfter.'
    }
  },
  {
    id: 'STR-01',
    name: 'strikethrough in CommonMark HTML, GFM, and Obsidian spelling',
    sources: {
      commonmark: 'Keep <del>removed</del> visible.',
      gfm: 'Keep ~~removed~~ visible.',
      obsidian: 'Keep ~~removed~~ visible.'
    }
  }
];

for (const elementCase of sharedElementCases) {
  test(`${elementCase.id}: ${elementCase.name} survives every flavor pair`, async () => {
    const { convertFromMarkdown, exportMarkdown } =
      await import('../src/markdownConversion.mjs');
    const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
    const dom = new JSDOM('');
    const document = dom.window.document;

    for (const sourceProfile of PROFILES) {
      const initial = convertFromMarkdown(
        elementCase.sources[sourceProfile],
        sourceProfile,
        { DOMParser: dom.window.DOMParser }
      );
      assert.deepEqual(
        initial.warnings,
        [],
        `${elementCase.id}: ${sourceProfile} source import`
      );
      const baseline = canonicalizeHtml(
        renderMarkdownHtml(initial.markdown, {
          profile: 'wmdx',
          window: dom.window
        }).html,
        document
      );

      for (const targetProfile of PROFILES) {
        const exported = exportMarkdown(initial.markdown, targetProfile);
        assert.deepEqual(
          exported.warnings,
          [],
          `${elementCase.id}: ${sourceProfile} → ${targetProfile} export`
        );
        const returned = convertFromMarkdown(
          exported.markdown,
          targetProfile,
          { DOMParser: dom.window.DOMParser }
        );
        assert.deepEqual(
          returned.warnings,
          [],
          `${elementCase.id}: ${sourceProfile} → ${targetProfile} import`
        );
        const actual = canonicalizeHtml(
          renderMarkdownHtml(returned.markdown, {
            profile: 'wmdx',
            window: dom.window
          }).html,
          document
        );
        assert.equal(
          actual,
          baseline,
          `${elementCase.id}: ${sourceProfile} → ${targetProfile} changed rendered meaning`
        );
      }
    }
  });
}

test('TSK-01: task state round-trips in GFM and Obsidian and warns for CommonMark', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const dom = new JSDOM('');
  const source = '- [x] complete\n- [ ] pending';
  const baseline = renderMarkdownHtml(
    convertFromMarkdown(source, 'gfm').markdown,
    { profile: 'wmdx', window: dom.window }
  ).html;

  for (const profile of ['gfm', 'obsidian']) {
    const exported = exportMarkdown(convertFromMarkdown(source, 'gfm').markdown, profile);
    assert.deepEqual(exported.warnings, []);
    assert.match(exported.markdown, /- \[x\] complete/);
    assert.match(exported.markdown, /- \[ \] pending/);
    const returned = convertFromMarkdown(exported.markdown, profile);
    const actual = renderMarkdownHtml(returned.markdown, {
      profile: 'wmdx',
      window: dom.window
    }).html;
    assert.equal(
      canonicalizeHtml(actual, dom.window.document),
      canonicalizeHtml(baseline, dom.window.document),
      `${profile} changed task state`
    );
  }

  const commonmark = exportMarkdown(convertFromMarkdown(source, 'gfm').markdown, 'commonmark');
  assert.ok(commonmark.warnings.some(warning => warning.includes('task-list')));
  assert.match(commonmark.markdown, /<input type="checkbox" disabled checked>/);
  assert.match(commonmark.markdown, /<input type="checkbox" disabled>/);
});

test('TBL-01: GFM table columns and alignment survive GFM/Obsidian; CommonMark warns', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const dom = new JSDOM('');
  const source = '| Left | Center | Right |\n| :--- | :---: | ---: |\n| A | B | C |';
  const initial = convertFromMarkdown(source, 'gfm');
  const baseline = canonicalizeHtml(
    renderMarkdownHtml(initial.markdown, {
      profile: 'gfm',
      window: dom.window
    }).html,
    dom.window.document
  );

  for (const profile of ['gfm', 'obsidian']) {
    const exported = exportMarkdown(initial.markdown, profile);
    assert.deepEqual(exported.warnings, []);
    assert.match(exported.markdown, /\| :--- \| :---: \| ---: \|/);
    const returned = convertFromMarkdown(exported.markdown, profile);
    const actual = canonicalizeHtml(
      renderMarkdownHtml(returned.markdown, {
        profile: 'gfm',
        window: dom.window
      }).html,
      dom.window.document
    );
    assert.equal(actual, baseline, `${profile} changed table cells or alignment`);
  }

  const commonmark = exportMarkdown(initial.markdown, 'commonmark');
  assert.ok(commonmark.warnings.some(warning => warning.includes('Pipe tables')));
});

test('SUB-01 and SUP-01: Wmdx subscripts and superscripts use portable HTML in each flavor', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = 'H~2~O and x^2^';
  for (const profile of PROFILES) {
    const exported = exportMarkdown(source, profile);
    assert.match(exported.markdown, /H<sub>2<\/sub>O/);
    assert.match(exported.markdown, /x<sup>2<\/sup>/);
    const returned = convertFromMarkdown(exported.markdown, profile);
    assert.match(returned.markdown, /H~2~O/);
    assert.match(returned.markdown, /x\^2\^/);
  }
});

test('HIL-01 and PEN-01: highlight and pen exports state exact style loss', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = '==highlight== and =pen=';
  for (const profile of PROFILES) {
    const exported = exportMarkdown(source, profile);
    if (profile === 'obsidian') {
      assert.match(exported.markdown, /==highlight==/);
      assert.doesNotMatch(exported.markdown, /(?<!\\)=pen=(?!\s)/);
    } else {
      assert.match(exported.markdown, /<mark>highlight<\/mark>/);
    }
    assert.ok(
      exported.warnings.some(warning => warning.includes('pen colors')),
      `${profile} must report pen loss`
    );
    const returned = convertFromMarkdown(exported.markdown, profile);
    assert.match(returned.markdown, /highlight/);
    assert.match(returned.markdown, /pen/);
    assert.match(returned.markdown, /==highlight==/);
  }
  for (const marker of ['₀', '₁', '₂']) {
    for (const profile of PROFILES) {
      const highlighted = exportMarkdown(`==${marker}colored==`, profile);
      assert.match(highlighted.markdown, /<mark>colored<\/mark>|==colored==/);
      assert.ok(
        highlighted.warnings.some(warning => warning.includes('highlight slots')),
        `${marker} highlight in ${profile} must report custom-color loss`
      );
      const pen = exportMarkdown(`=${marker}ink=`, profile);
      assert.match(pen.markdown, /ink/);
      assert.ok(
        pen.warnings.some(warning => warning.includes('pen colors')),
        `${marker} pen in ${profile} must report style loss`
      );
    }
  }
});

test('UDL-01: all Wmdx underline styles export as semantic underline with a loss warning', async () => {
  const { exportMarkdown } = await import('../src/markdownConversion.mjs');
  for (const [style, source] of [
    ['solid', '_solid_'],
    ['dotted', '_₀dotted_'],
    ['dashed', '_₁dashed_'],
    ['double', '_₂double_'],
    ['wavy', '_₃wavy_']
  ]) {
    for (const profile of PROFILES) {
      const exported = exportMarkdown(source, profile);
      assert.match(exported.markdown, /<u>[^<]+<\/u>/, `${style} ${profile}`);
      if (style === 'solid') {
        assert.deepEqual(exported.warnings, [], `${style} ${profile}`);
      } else {
        assert.ok(
          exported.warnings.some(warning => warning.includes('styled underline')),
          `${style} ${profile} must state the style loss`
        );
      }
    }
  }
});

test('AUD-01, VID-01, ATT-01: media and attachments have explicit output per target', async () => {
  const { exportMarkdown } = await import('../src/markdownConversion.mjs');
  const source = [
    '![audio/voice note.mp3|||]',
    '![video/clip.mp4|||]',
    '![docs/manual.pdf|||]'
  ].join('\n\n');

  for (const profile of PROFILES) {
    const exported = exportMarkdown(source, profile);
    assert.deepEqual(exported.warnings, [], `${profile} warnings`);
    if (profile === 'obsidian') {
      assert.match(exported.markdown, /!\[\[audio\/voice note\.mp3\]\]/);
      assert.match(exported.markdown, /!\[\[video\/clip\.mp4\]\]/);
      assert.match(exported.markdown, /!\[\[docs\/manual\.pdf\]\]/);
    } else {
      assert.match(exported.markdown, /<audio controls src="audio\/voice%20note\.mp3"/);
      assert.match(exported.markdown, /<video controls src="video\/clip\.mp4"/);
      assert.match(exported.markdown, /\[manual\.pdf\]\(docs\/manual\.pdf "wmdx-attachment"\)/);
    }
  }
});

test('IMG-01: Wmdx image dimensions and alignment are preserved or explicitly warned', async () => {
  const { exportMarkdown } = await import('../src/markdownConversion.mjs');
  const source = '![assets/pixel.png|Pixel|640|><]';
  for (const profile of PROFILES) {
    const exported = exportMarkdown(source, profile);
    assert.match(exported.markdown, /pixel\.png/);
    assert.match(exported.markdown, /width="640"/);
    assert.ok(
      exported.warnings.some(warning => warning.includes('Image size, alignment')),
      `${profile} must identify non-portable image layout`
    );
  }
});

test('FNT-01: reference footnotes preserve references and definitions or state CommonMark loss', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = 'A citation.[^source]\n\n[^source]: Definition body.';
  const wmdx = convertFromMarkdown(source, 'obsidian').markdown;

  for (const profile of ['gfm', 'obsidian']) {
    const exported = exportMarkdown(wmdx, profile);
    assert.match(exported.markdown, /\[\^source\]/);
    assert.match(exported.markdown, /\[\^source\]: Definition body\./);
    const returned = convertFromMarkdown(exported.markdown, profile);
    assert.match(returned.markdown, /\[\^source\]/);
    assert.match(returned.markdown, /Definition body\./);
  }
  const commonmark = exportMarkdown(wmdx, 'commonmark');
  assert.ok(commonmark.warnings.some(warning => warning.includes('footnote')));
  assert.match(commonmark.markdown, /\[\^source\]: Definition body\./);
});

test('YAML-01: frontmatter bytes survive each flavor export and declare nonstandard status', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = '---\ntitle: Example\nnested:\n  active: true\n---\n\nBody.';
  for (const profile of PROFILES) {
    const exported = exportMarkdown(source, profile);
    assert.match(exported.markdown, /^---\ntitle: Example\nnested:\n  active: true\n---/);
    if (profile === 'obsidian') {
      assert.deepEqual(exported.warnings, []);
    } else {
      assert.ok(exported.warnings.some(warning => warning.includes('frontmatter')));
    }
    const returned = convertFromMarkdown(exported.markdown, profile);
    assert.match(returned.markdown, /^---\ntitle: Example\nnested:\n  active: true\n---/);
  }
});

test('CMT-01: Obsidian comments remain literal and carry an unsupported-syntax warning', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = 'Visible %%private note%% text.';
  const imported = convertFromMarkdown(source, 'obsidian');
  assert.match(imported.markdown, /%%private note%%/);
  assert.ok(imported.warnings.some(warning => warning.includes('comments')));
  assert.match(exportMarkdown(imported.markdown, 'obsidian').markdown, /%%private note%%/);
  assert.match(exportMarkdown(imported.markdown, 'commonmark').markdown, /%%private note%%/);
});

test('HTML-01: HTML hard line breaks remain hard breaks through each Markdown flavor', async () => {
  const { convertFromHtml, convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<p>First line<br>second line</p>',
    dom.window.DOMParser
  );
  assert.match(imported.markdown, /First line {2}\nsecond line/);
  for (const profile of PROFILES) {
    const exported = exportMarkdown(imported.markdown, profile);
    const returned = convertFromMarkdown(exported.markdown, profile);
    const rendered = renderMarkdownHtml(returned.markdown, {
      profile: 'wmdx',
      window: dom.window
    });
    const parsed = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
    assert.ok(parsed.querySelector('p br'), `${profile} must preserve the hard break`);
  }
});

test('HTML-01: supported inline HTML tags import to Markdown and render back semantically', async () => {
  const { convertFromHtml, convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const dom = new JSDOM('');
  const inlineTags = [
    ['strong', '**bold**'],
    ['b', '**bold**'],
    ['em', '*italic*'],
    ['i', '*italic*'],
    ['del', '~~removed~~'],
    ['s', '~~removed~~'],
    ['strike', '~~removed~~'],
    ['sub', '~2~'],
    ['sup', '^2^'],
    ['mark', '==highlight=='],
    ['u', '<u>underlined</u>'],
    ['ins', '<u>underlined</u>'],
    ['code', '`literal`']
  ];
  const values = {
    strong: ['bold', '<strong>bold</strong>'],
    b: ['bold', '<b>bold</b>'],
    em: ['italic', '<em>italic</em>'],
    i: ['italic', '<i>italic</i>'],
    del: ['removed', '<del>removed</del>'],
    s: ['removed', '<s>removed</s>'],
    strike: ['removed', '<strike>removed</strike>'],
    sub: ['2', '<sub>2</sub>'],
    sup: ['2', '<sup>2</sup>'],
    mark: ['highlight', '<mark>highlight</mark>'],
    u: ['underlined', '<u>underlined</u>'],
    ins: ['underlined', '<ins>underlined</ins>'],
    code: ['literal', '<code>literal</code>']
  };
  const renderedTags = {
    strong: 'strong', b: 'strong', em: 'em', i: 'em',
    del: 'del', s: 'del', strike: 'del', sub: 'sub', sup: 'sup',
    mark: 'mark', u: 'u', ins: 'u', code: 'code'
  };

  for (const [tag, expectedMarkdown] of inlineTags) {
    const [text, markup] = values[tag];
    const imported = convertFromHtml(`<p>Before ${markup} after.</p>`, dom.window.DOMParser);
    assert.match(imported.markdown, new RegExp(expectedMarkdown.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const profile of PROFILES) {
      const exported = exportMarkdown(imported.markdown, profile);
      const returned = convertFromMarkdown(exported.markdown, profile);
      const rendered = renderMarkdownHtml(returned.markdown, {
        profile: 'wmdx',
        window: dom.window
      });
      const parsed = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
      assert.match(parsed.body.textContent, new RegExp(text), `${tag} / ${profile}`);
      assert.ok(
        parsed.querySelector(renderedTags[tag]),
        `${tag} formatting was lost after HTML → Wmdx → ${profile} → import`
      );
    }
  }
});

test('CAL-01: callout export preserves syntax where supported and reports CommonMark loss', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = '±warning- Careful\n  Check this.';
  const obsidian = exportMarkdown(source, 'obsidian');
  assert.match(obsidian.markdown, /^> \[!warning\]- Careful$/m);
  const importedObsidian = convertFromMarkdown(obsidian.markdown, 'obsidian');
  assert.match(importedObsidian.markdown, /^±warning- Careful$/m);

  const gfm = exportMarkdown(source, 'gfm');
  assert.match(gfm.markdown, /^> \[!WARNING\]$/m);
  assert.match(gfm.markdown, /^> \*\*Careful\*\*$/m);
  assert.ok(gfm.warnings.some(warning => warning.includes('collapsed state')));

  const commonmark = exportMarkdown(source, 'commonmark');
  assert.ok(commonmark.warnings.some(warning => warning.includes('callout')));
  assert.match(commonmark.markdown, /^> \*\*Careful\*\*$/m);
  assert.match(commonmark.markdown, /^> Check this\.$/m);
});

test('LNK-02: Obsidian file and heading wikilinks export to each target flavor', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = '[[Project Notes|Read me]] and [[#Setup|Configure it]].\n\n# Setup';
  const imported = convertFromMarkdown(source, 'obsidian');

  const obsidian = exportMarkdown(imported.markdown, 'obsidian');
  assert.match(obsidian.markdown, /\[\[Project Notes\|Read me\]\]/);
  assert.match(obsidian.markdown, /\[\[#Setup\|Configure it\]\]/);

  for (const profile of ['commonmark', 'gfm']) {
    const exported = exportMarkdown(imported.markdown, profile);
    assert.match(exported.markdown, /\[Read me\]\(Project%20Notes\)/);
    assert.match(exported.markdown, /\[Configure it\]\(#setup\)/);
    if (profile === 'commonmark') {
      assert.match(exported.markdown, /<a id="setup"><\/a>/);
    }
    const returned = convertFromMarkdown(exported.markdown, profile);
    assert.match(returned.markdown, /\[Read me\]\(Project%20Notes\)/);
    assert.match(returned.markdown, /\[#Setup\|Configure it\|\|\]/);
  }
});
