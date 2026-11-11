const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const assets = path.join(root, 'app/src/main/assets/www');
const gfm = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/gfm-0.29-extensions.json'),
  'utf8'
));
const obsidian = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/obsidian-rendering.json'),
  'utf8'
));

function normalizeHref(href, label) {
  // The app upgrades bare www links to HTTPS; the GFM fixture expects HTTP.
  return label.startsWith('www.') && href.startsWith('http://')
    ? href.replace(/^http:/, 'https:')
    : href;
}

async function waitForDomCondition(window, predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), message);
}

function serializeInline(node) {
  const serialize = child => {
    if (child.nodeType === 3) return child.nodeValue.replace(/\s+/g, ' ');
    if (child.nodeType !== 1 ||
        (child.hasAttribute('aria-hidden') &&
          !child.classList.contains('cm-markdown-soft-break-space')) ||
        child.classList.contains('cm-widgetBuffer')) {
      return null;
    }

    const tag = child.tagName.toLowerCase();
    const semanticTag = child.classList.contains('cm-strikethrough')
      ? 'del'
      : child.classList.contains('cm-wmdx-highlight-yellow')
        ? 'mark'
        : tag;
    const children = [...child.childNodes].flatMap(inner => {
      const value = serialize(inner);
      return value === null ? [] : Array.isArray(value) ? value : [value];
    });

    if (semanticTag === 'a') {
      const href = normalizeHref(
        child.getAttribute('href') || '',
        child.textContent.trim()
      );
      if (children.length === 1 && typeof children[0] === 'object' &&
          children[0].tag === 'a' && children[0].href === href) {
        return children[0];
      }
      return { tag: 'a', href, children };
    }
    if (['code', 'del', 'em', 'mark', 'strong', 'sub', 'sup'].includes(semanticTag)) {
      return { tag: semanticTag, children };
    }
    return children;
  };

  const values = [...node.childNodes]
    .flatMap(child => {
      const value = serialize(child);
      return Array.isArray(value) ? value : value === null ? [] : [value];
    })
    .reduce((result, value) => {
      const previous = result.at(-1);
      if (typeof value === 'string' && typeof previous === 'string') {
        result[result.length - 1] += value;
      } else {
        result.push(value);
      }
      return result;
    }, []);
  if (typeof values[0] === 'string') {
    values[0] = values[0].replace(/^\s+/, '');
  }
  if (typeof values.at(-1) === 'string') {
    values[values.length - 1] = values.at(-1).replace(/\s+$/, '');
  }
  return values.filter(value => value !== '');
}

function summarizeTable(table) {
  return [...table.rows].map(row => [...row.cells].map(cell => {
    const align = cell.getAttribute('align') || cell.style.textAlign || '';
    return {
      tag: cell.tagName.toLowerCase(),
      align: align === 'left' ? '' : align,
      children: serializeInline(cell)
    };
  }));
}

function summarizeExpected(html, document) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.children].map(block => {
    const tag = block.tagName.toLowerCase();
    if (tag === 'table') return { type: 'table', rows: summarizeTable(block) };
    return { type: tag, children: serializeInline(block) };
  });
}

function summarizeRendered(content) {
  return [...content.children].flatMap(block => {
    if (block.classList.contains('cm-wp-table-container')) {
      const table = block.querySelector('table');
      return table ? [{ type: 'table', rows: summarizeTable(table) }] : [];
    }
    if (!block.classList.contains('cm-line') ||
        !block.classList.contains('cm-paragraph')) {
      return [];
    }
    return [{
      type: block.classList.contains('cm-blockquote') ? 'blockquote' : 'p',
      children: serializeInline(block)
    }];
  });
}

async function createEditor() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(
    fs.readFileSync(path.join(assets, 'index.html'), 'utf8'),
    {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://wmdx.test/',
      virtualConsole
    }
  );
  const window = dom.window;
  const rect = () => ({
    x: 0, y: 0, width: 640, height: 480,
    top: 0, right: 640, bottom: 480, left: 0,
    toJSON() { return this; }
  });
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function() {};
  window.HTMLElement.prototype.getBoundingClientRect = function() {
    return this.classList?.contains('cm-line')
      ? { ...rect(), height: 24, bottom: 24 }
      : rect();
  };
  window.Range.prototype.getBoundingClientRect = rect;
  window.Range.prototype.getClientRects = () => [];
  window.AndroidNative = {
    getCurrentDocumentSessionId: () => 'dialect-render-fixtures',
    onEditorReady: () => {},
    onContentChanged: () => {},
    onDirtyStateChanged: () => {},
    reportDiagnostic: (kind, detail) => errors.push(`${kind}: ${detail}`)
  };

  window.eval(fs.readFileSync(path.join(assets, 'bundle.js'), 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 20));
  return { window, errors, close: () => dom.window.close() };
}

test('GFM 0.29 extension fixtures preserve rendered meaning in WYSIWYG', async () => {
  assert.equal(gfm.examples.length, 21);
  assert.ok(gfm.examples.every(example => typeof example.html === 'string'));
  const editor = await createEditor();

  try {
    const { window } = editor;
    window.editorBridge.applyAllPreferences({ pref_markdown_profile: 'gfm' });
    for (const example of gfm.examples) {
      window.editorBridge.setMarkdown(example.markdown);
      await window.editorBridge.setEditorMode('wysiwyg');
      await new Promise(resolve => setTimeout(resolve, 5));

      const content = window.document.querySelector('.cm-content');
      assert.ok(content, `GFM ${example.section} example ${example.number} mounts`);
      assert.equal(
        content.querySelectorAll('a.cm-link a.cm-link').length,
        0,
        `GFM ${example.section} example ${example.number} does not nest link anchors`
      );
      assert.deepEqual(
        summarizeRendered(content),
        summarizeExpected(example.html, window.document),
        `GFM ${example.section} example ${example.number} renders its upstream HTML semantics`
      );
      assert.equal(
        window.editorBridge.getMarkdown(),
        example.markdown,
        `GFM example ${example.number} keeps its source unchanged`
      );
    }
    assert.deepEqual(editor.errors, []);
  } finally {
    editor.close();
  }
});

test('curated Obsidian syntax fixtures render in the Obsidian profile', async () => {
  assert.equal(obsidian.cases.length, 7);
  const editor = await createEditor();

  try {
    const { window } = editor;
    window.editorBridge.applyAllPreferences({
      pref_markdown_profile: 'obsidian'
    });

    for (const example of obsidian.cases) {
      window.editorBridge.setMarkdown(example.markdown);
      await window.editorBridge.setEditorMode('wysiwyg');
      const expected = example.expected;
      await waitForDomCondition(
        window,
        () => {
          const content = window.document.querySelector('.cm-content');
          return Boolean(content) &&
            (!expected.link || content.querySelector('a.cm-wikilink')) &&
            (!expected.highlight || content.querySelector('.cm-wmdx-highlight-yellow')) &&
            (!expected.image || content.querySelector('.cm-image-preview-wrapper img')) &&
            (!expected.callout || content.querySelector('.cm-callout-title-text')) &&
            (!expected.tasks ||
              content.querySelectorAll('.cm-line.cm-todo-list-item').length ===
                expected.tasks.length) &&
            (!expected.footnote ||
              (content.querySelector('.cm-footnote-reference') &&
                content.querySelector('.cm-footnote-text')));
        },
        `${example.feature} finishes rendering before its assertions`
      );
      const content = window.document.querySelector('.cm-content');

      if (expected.link) {
        const link = content.querySelector('a.cm-wikilink');
        assert.ok(link, `${example.feature} renders a wikilink`);
        assert.equal(link.getAttribute('href'), expected.link.href, example.feature);
        assert.equal(link.textContent, expected.link.text, example.feature);
      }
      if (expected.highlight) {
        assert.equal(
          content.querySelector('.cm-wmdx-highlight-yellow')?.textContent,
          expected.highlight,
          example.feature
        );
      }
      if (expected.image) {
        const image = content.querySelector('.cm-image-preview-wrapper img');
        assert.ok(image, `${example.feature} renders an image`);
        assert.equal(image.getAttribute('src'), expected.image.src);
        assert.equal(image.getAttribute('alt'), expected.image.alt);
        assert.equal(image.style.width, expected.image.width);
      }
      if (expected.callout) {
        const title = content.querySelector('.cm-callout-title-text');
        const body = content.querySelector('.cm-callout-body');
        assert.ok(title && body, `${example.feature} renders title and body`);
        assert.equal(title.closest('.cm-callout')?.dataset.calloutType, expected.callout.type);
        assert.equal(title.textContent, expected.callout.title);
        assert.equal(body.textContent, expected.callout.body);
        assert.equal(
          body.querySelector('strong, .cm-bold')?.textContent,
          expected.callout.strong
        );
      }
      if (expected.tasks) {
        const items = [...content.querySelectorAll('.cm-line.cm-todo-list-item')];
        assert.equal(items.length, expected.tasks.length, example.feature);
        assert.deepEqual(
          items.map((item, index) => ({
            checked: item.querySelector('.cm-todo-checkbox')?.checked,
            containsText: item.textContent.includes(expected.tasks[index].text)
          })),
          expected.tasks.map(task => ({ checked: task.checked, containsText: true })),
          example.feature
        );
      }
      if (expected.footnote) {
        const reference = content.querySelector('.cm-footnote-reference');
        const definition = content.querySelector('.cm-footnote-text');
        assert.ok(reference && definition, `${example.feature} renders both ends`);
        assert.equal(reference.dataset.footnoteLabel, expected.footnote.label);
        assert.equal(reference.textContent, expected.footnote.reference);
        assert.equal(definition.textContent, expected.footnote.definition);
      }

      assert.equal(
        window.editorBridge.getMarkdown(),
        example.markdown,
        `${example.feature} keeps its source unchanged`
      );
    }
    assert.deepEqual(editor.errors, []);
  } finally {
    editor.close();
  }
});

test('escaped CommonMark bracket references stay out of Obsidian wikilink rendering', async () => {
  const editor = await createEditor();

  try {
    const { window } = editor;
    window.editorBridge.applyAllPreferences({
      pref_markdown_profile: 'obsidian'
    });
    window.editorBridge.setMarkdown(
      '\\[[*foo* bar]]\n\n' +
      '[*foo* bar]: /url "title"\n\n' +
      '!\\[[foo]]\n\n' +
      '\\[[foo]]: /url "title"'
    );
    await window.editorBridge.setEditorMode('wysiwyg');
    await new Promise(resolve => setTimeout(resolve, 5));

    const content = window.document.querySelector('.cm-content');
    assert.ok(content, 'the Obsidian-profile editor mounts');
    assert.equal(
      content.querySelectorAll('a.cm-wikilink').length,
      0,
      'escaped CommonMark references are not decorated as internal links'
    );
    assert.equal(
      content.querySelectorAll('.cm-image-preview-wrapper, .cm-embed-widget').length,
      0,
      'escaped CommonMark text is not rendered as an embed'
    );

    window.editorBridge.setMarkdown(
      '[[*foo* bar]]\n\n' +
      '[*foo* bar]: /url "title"'
    );
    await new Promise(resolve => setTimeout(resolve, 5));
    const unescapedContent = window.document.querySelector('.cm-content');
    assert.ok(
      unescapedContent.querySelector('a.cm-wikilink'),
      'removing the protective bracket escape activates Obsidian wikilink rendering'
    );
    assert.deepEqual(editor.errors, []);
  } finally {
    editor.close();
  }
});
