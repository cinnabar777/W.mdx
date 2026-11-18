const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const projectRoot = path.resolve(__dirname, '../..');
const appAssets = path.join(projectRoot, 'app/src/main/assets/www');

function sourceText(content) {
  return [...content.querySelectorAll('.cm-line')]
    .map(line => line.textContent)
    .join('\n');
}

async function waitForDomCondition(window, predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), message);
}

test('raw HTML respects WYSIWYG syntax-exposure settings', async () => {
  const html = fs.readFileSync(path.join(appAssets, 'index.html'), 'utf8');
  const bundle = fs.readFileSync(path.join(appAssets, 'bundle.js'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://wmdx.test/',
    virtualConsole
  });
  const window = dom.window;
  const rect = () => ({
    x: 0, y: 0, width: 640, height: 2400,
    top: 0, right: 640, bottom: 2400, left: 0,
    toJSON() { return this; }
  });
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  window.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
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
    if (this.classList?.contains('cm-line')) {
      return { x: 0, y: 0, width: 640, height: 24, top: 0, right: 640, bottom: 24, left: 0,
        toJSON() { return this; } };
    }
    return rect();
  };
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return this.classList?.contains('cm-scroller') ? 2400 : 0; }
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return this.classList?.contains('cm-scroller') ? 640 : 0; }
  });
  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return this.classList?.contains('cm-scroller') ? 2400 : 0; }
  });
  window.Range.prototype.getBoundingClientRect = rect;
  window.Range.prototype.getClientRects = () => [];
  window.AndroidNative = {
    getCurrentDocumentSessionId: () => 'markdown-html-render-test',
    onEditorReady: () => {},
    onContentChanged: () => {},
    onDirtyStateChanged: () => {},
    reportDiagnostic: (kind, detail) => errors.push(kind + ': ' + detail)
  };

  try {
    window.eval(bundle);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await waitForDomCondition(window,
      () => Boolean(window.editorBridge && window.document.querySelector('.cm-content')),
      'the Markdown editor mounts');

    await window.editorBridge.setEditorMode('rendered');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(window.editorBridge.getEditorMode(), 'rendered', 'the user-facing editor mode is WYSIWYG');
    assert.equal(window.editorBridge.getSyntaxExposureScope(), 'hidden', 'syntax exposure starts hidden');
    const bookmarkSource =
      '<DL><p><DT><H3 ADD_DATE="1777481312" LAST_MODIFIED="0" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3><DL><p><DT><A HREF="https://example.test/">Example <STRONG>bookmark</STRONG></A></DL></DL>';
    window.editorBridge.setMarkdown(bookmarkSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    let content = window.document.querySelector('.cm-content');
    const bookmarkTextFrom = bookmarkSource.indexOf('Example ');
    const bookmarkLinkTextFrom = bookmarkSource.indexOf('bookmark</STRONG>');
    const headingTextFrom = bookmarkSource.indexOf('Bookmarks bar');
    const headingOpenFrom = bookmarkSource.indexOf('<H3 ');
    const headingOpenTo = bookmarkSource.indexOf('>', headingOpenFrom) + 1;
    const headingCloseFrom = bookmarkSource.indexOf('</H3>', headingOpenTo);
    const anchorOpenFrom = bookmarkSource.indexOf('<A HREF=');
    const anchorOpenTo = bookmarkSource.indexOf('>', anchorOpenFrom) + 1;
    const anchorCloseFrom = bookmarkSource.indexOf('</A>', anchorOpenTo);
    const editableHtmlText = text =>
      [...content.querySelectorAll('.cm-raw-html-text')]
        .find(span => span.textContent.trim() === text);
    assert.ok(editableHtmlText('Bookmarks bar')?.classList.contains('cm-raw-html-h3'),
      'bookmark headings render with HTML styling while remaining editor text');
    assert.ok(editableHtmlText('Example')?.classList.contains('cm-raw-html-a'),
      'bookmark label text remains editable inside its link');
    assert.ok(editableHtmlText('bookmark')?.classList.contains('cm-raw-html-strong'),
      'nested bookmark text stays editable and retains its own HTML style');
    assert.equal(sourceText(content).includes('<DL>'), false,
      'WYSIWYG hides structural bookmark wrapper tags');
    assert.equal(sourceText(content).includes('<A HREF='), false,
      'WYSIWYG hides the anchor source while syntax exposure is off');
    window.editorBridge.setSelectionState({
      anchor: bookmarkTextFrom,
      head: bookmarkTextFrom
    });
    content.focus();
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, bookmarkTextFrom + 1,
      'the caret moves through bookmark label characters instead of jumping across an HTML widget');
    const beforeNestedTag = bookmarkTextFrom + 'Example '.length;
    window.editorBridge.setSelectionState({
      anchor: beforeNestedTag,
      head: beforeNestedTag
    });
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, bookmarkLinkTextFrom,
      'the caret skips a hidden nested HTML tag without skipping the first visible letter');
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, bookmarkLinkTextFrom + 1,
      'the first letter after hidden HTML syntax remains independently caret-addressable');
    assert.equal(window.editorBridge.getMarkdown(), bookmarkSource,
      'rendered HTML does not mutate source until the user edits text');

    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    window.editorBridge.setSelectionState({
      anchor: headingTextFrom + 2,
      head: headingTextFrom + 2
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='), false,
      'a caret in heading text keeps unrelated HTML tag syntax hidden');
    window.editorBridge.setSelectionState({
      anchor: headingOpenFrom + 2,
      head: headingOpenFrom + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='),
      'caret exposure reveals the opening heading tag when the caret enters that tag');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('</H3>'), false,
      'exposing an opening heading tag does not expose its closing tag');
    window.editorBridge.setSelectionState({
      anchor: headingOpenTo,
      head: headingOpenTo
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='), false,
      'the caret at the first heading character is outside the opening tag');
    window.editorBridge.setSelectionState({
      anchor: headingCloseFrom + 2,
      head: headingCloseFrom + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('</H3>'),
      'caret exposure reveals the closing heading tag independently');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='), false,
      'exposing a closing heading tag does not expose the opening tag');
    assert.equal(window.editorBridge.getEditorMode(), 'rendered', 'syntax exposure does not create a second user-facing mode');
    assert.equal(window.editorBridge.getSyntaxExposureScope(), 'caret');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='), false,
      'the sibling bookmark link remains rendered');
    window.editorBridge.setSelectionState({
      anchor: anchorOpenFrom,
      head: anchorOpenFrom
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='),
      'caret at the opening delimiter reveals the anchor tag under the caret');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('</A>'), false,
      'exposing an anchor opening tag does not expose its closing tag');
    window.editorBridge.setSelectionState({
      anchor: bookmarkTextFrom + 2,
      head: bookmarkTextFrom + 2
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='), false,
      'caret in a link label does not expose the complete anchor source');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('</A>'), false,
      'caret in a link label leaves its closing tag hidden');
    window.editorBridge.setSelectionState({
      anchor: anchorCloseFrom + 2,
      head: anchorCloseFrom + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('</A>'),
      'caret exposure reveals the anchor closing tag independently');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='), false,
      'exposing an anchor closing tag does not expose its opening tag');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='), false,
      'moving from the heading to the link hides the previous element source again');

    const structuredBookmarkSource = [
      '<DL><p>',
      '  <DT><H3>WMK</H3>',
      '  <DL><p>',
      '    <DT><A HREF="https://example.test/commit">Commit</A>',
      '    <DT><A HREF="https://example.test/commits">commits</A>',
      '  </DL><p>',
      '  <DT><A HREF="https://example.test/bm">BM</A>',
      '</DL><p>'
    ].join('\n');
    const firstBookmarkLabel = structuredBookmarkSource.indexOf('Commit');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    window.editorBridge.setMarkdown(structuredBookmarkSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent === 'Commit' && span.classList.contains('cm-raw-html-a')),
    'a nested bookmark list does not get absorbed into its preceding DT heading');
    assert.equal(sourceText(content).includes('</DL>'), false,
      'malformed bookmark closing tags stay hidden rather than becoming visible text');

    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    window.editorBridge.setSelectionState({
      anchor: firstBookmarkLabel + 2,
      head: firstBookmarkLabel + 2
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sourceText(window.document.querySelector('.cm-content'))
      .includes('<A HREF="https://example.test/commit">Commit</A>'), false,
    'caret in bookmark text does not expose all of its anchor syntax');
    window.editorBridge.setSelectionState({
      anchor: structuredBookmarkSource.indexOf('<A HREF="https://example.test/commit">') + 2,
      head: structuredBookmarkSource.indexOf('<A HREF="https://example.test/commit">') + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content'))
        .includes('<A HREF="https://example.test/commit">'),
      'caret in an anchor tag exposes only that tag');
    let exposedBookmarkSource = sourceText(window.document.querySelector('.cm-content'));
    assert.equal(exposedBookmarkSource.includes('</A>'), false,
      'the active anchor opening tag does not reveal its closing tag');
    assert.equal(exposedBookmarkSource.includes('https://example.test/commits'), false,
      'caret exposure does not reveal a sibling bookmark');
    assert.equal(exposedBookmarkSource.includes('</DL>'), false,
      'caret exposure does not reveal a distant structural closing tag');

    window.editorBridge.setMarkdownSyntaxExposure('line');
    await new Promise(resolve => setTimeout(resolve, 20));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content'))
        .includes('<DT><A HREF="https://example.test/commit">Commit</A>'),
      'line exposure includes the complete source line containing the caret');
    exposedBookmarkSource = sourceText(window.document.querySelector('.cm-content'));
    assert.equal(exposedBookmarkSource.includes('https://example.test/commits'), false,
      'line exposure leaves the neighboring source line rendered');

    window.editorBridge.setMarkdownSyntaxExposure('block');
    await new Promise(resolve => setTimeout(resolve, 20));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content'))
        .includes('https://example.test/commits'),
      'block exposure reveals the complete raw HTML block');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('</DL>'), true,
      'block exposure includes structural closing tags within that HTML block');

    const quotedSource = [
      '> <DL><p><DT><H3>Quoted folder</H3>',
      '> <DL><DT><A HREF="https://quoted.example.test/">Quoted bookmark</A></DL></DL>'
    ].join('\n');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    window.editorBridge.setMarkdown(quotedSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent.trim() === 'Quoted bookmark' &&
        span.classList.contains('cm-raw-html-a')),
    'HTML text remains editable when nested in a Markdown blockquote');
    assert.equal(sourceText(content).includes('> <DL>'), false,
      'the blockquote marker stays hidden while its HTML content renders');

    const inlineSource = 'Inline HTML <kbd>Ctrl</kbd> and <mark>highlight</mark>.';
    window.editorBridge.setMarkdown(inlineSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent === 'Ctrl' && span.classList.contains('cm-raw-html-kbd')),
    'inline HTML remains character-editable with its styling');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent === 'highlight' && span.classList.contains('cm-raw-html-mark')),
    'adjacent inline HTML retains independent styling');

    const complexSource = [
      '<div class="raw-html-block"><p>Block HTML <strong>renders</strong>.</p></div>',
      '<script>window.__wmdxRawHtmlExecuted = true;</script>'
    ].join('\n');
    window.editorBridge.setMarkdown(complexSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.equal(content.querySelectorAll('.cm-markdown-html-preview script').length, 0,
      'WYSIWYG never inserts active script elements');
    assert.equal(window.__wmdxRawHtmlExecuted, undefined, 'WYSIWYG does not execute raw HTML scripts');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent.trim() === 'renders' &&
        span.classList.contains('cm-raw-html-strong')),
    'nested text in a complex HTML block remains editable instead of becoming one block widget');
    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    const complexTextFrom = complexSource.indexOf('renders') + 2;
    window.editorBridge.setSelectionState({
      anchor: complexTextFrom,
      head: complexTextFrom
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<p>Block HTML'), false,
      'caret in raw HTML text does not expose an entire parent element');
    window.editorBridge.setSelectionState({
      anchor: complexSource.indexOf('<strong>') + 2,
      head: complexSource.indexOf('<strong>') + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<strong>'),
      'caret exposure reveals only the nested HTML tag under the caret');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('</strong>'), false,
      'the matching closing tag stays hidden when only the opening tag is active');
    assert.equal(window.editorBridge.getMarkdown(), complexSource, 'syntax exposure never mutates Markdown');
    const inlineTextPosition = inlineSource.indexOf('Ctrl') + 1;
    window.editorBridge.setMarkdown(inlineSource);
    window.editorBridge.setSelectionState({
      anchor: inlineTextPosition,
      head: inlineTextPosition
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<kbd>Ctrl</kbd>'), false,
      'caret in inline HTML text keeps surrounding source hidden');
    window.editorBridge.setSelectionState({
      anchor: inlineSource.indexOf('<kbd>') + 2,
      head: inlineSource.indexOf('<kbd>') + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<kbd>'),
      'caret exposure reveals only the inline HTML tag under the caret');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('</kbd>'), false,
      'the closing inline tag stays hidden while the opening tag is exposed');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<mark>highlight</mark>'), false,
      'the neighboring inline HTML element remains rendered');
    assert.ok([...window.document.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent.trim() === 'highlight' &&
        span.classList.contains('cm-raw-html-mark')),
    'the neighboring inline element remains styled and editable');

    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    const markdownSource = '**bold**';
    window.editorBridge.setMarkdown(markdownSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    window.editorBridge.setSelectionState({ anchor: 0, head: 0 });
    content.focus();
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, 2,
      'hidden Markdown delimiters are skipped without skipping the first formatted letter');

    window.editorBridge.setMarkdownSyntaxExposure('caret');
    const hardBreakSource = 'hard  \nbreak';
    window.editorBridge.setMarkdown(hardBreakSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.equal(content.querySelectorAll('.cm-hardbreak-syntax').length, 0,
      'two-space hard-break spelling is not hidden as syntax');
    const hardBreakSpaces = content.querySelector('.cm-hardbreak-spaces');
    assert.ok(hardBreakSpaces, 'hard-break spaces retain a visible whitespace style');
    assert.equal(hardBreakSpaces.textContent, '  ');

    await window.editorBridge.setEditorMode('rendered');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    const taskListSource = '- [ ] Open task\n- [x] Completed task';
    await window.editorBridge.applyAllPreferences({ pref_markdown_profile: 'commonmark' });
    window.editorBridge.setMarkdown(taskListSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(window.document.querySelectorAll('.cm-todo-checkbox').length, 0,
      'task markers are literal brackets in the CommonMark-only profile');
    assert.ok(sourceText(window.document.querySelector('.cm-content')).includes('[ ] Open task'),
      'the CommonMark profile preserves the unsupported GFM task marker literally');
    await window.editorBridge.applyAllPreferences({ pref_markdown_profile: 'gfm' });
    window.editorBridge.setMarkdown(taskListSource);
    await waitForDomCondition(window,
      () => window.document.querySelectorAll('.cm-todo-checkbox').length === 2,
      'GFM task items render as checkboxes when the GFM profile is selected');
    const taskBoxes = [...window.document.querySelectorAll('.cm-todo-checkbox')];
    assert.equal(taskBoxes[0].checked, false);
    assert.equal(taskBoxes[1].checked, true);
    taskBoxes[0].click();
    await waitForDomCondition(window,
      () => window.editorBridge.getMarkdown().startsWith('- [x] Open task'),
      'tapping a rendered task checkbox updates its Markdown state');

    window.editorBridge.setMarkdown(hardBreakSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    await window.editorBridge.setEditorMode('source');
    const sourceContent = window.document.querySelector('.cm-content');
    assert.equal(sourceText(sourceContent), hardBreakSource, 'Source displays the complete Markdown text');
    assert.equal(sourceContent.querySelectorAll('.cm-markdown-html-preview').length, 0,
      'Source mode does not render HTML previews');
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
