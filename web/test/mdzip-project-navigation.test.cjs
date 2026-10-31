const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('MDZip project links reuse their tabs and navigate to the requested heading', async () => {
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: 'https://wmdx.test/'
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.getComputedStyle = window.getComputedStyle.bind(window);
  global.requestAnimationFrame = window.requestAnimationFrame.bind(window);

  const markdownByPath = new Map([
    ['index.md', '# Start\n\nProject entry point.'],
    ['docs/guide.md', '# Guide\n\n## Guide Details\n\nGuide text.'],
    ['docs/chapters/topic.md', '# Topic\n\n## Deep Dive\n\nTopic text.'],
    ['docs/notes/春の café.md', '# Unicode note\n\nUnicode path content.']
  ]);
  const archiveUri = 'content://example/project.mdz';
  const makeDocumentUri = (documentPath) =>
    `${archiveUri}#wmdx-mdzip-entry=${encodeURIComponent(documentPath)}`;
  const documentPathFromUri = (uri) => decodeURIComponent(
    String(uri).split('wmdx-mdzip-entry=')[1] || ''
  );
  const getName = (documentPath) => documentPath.split('/').at(-1);
  let activePath = 'index.md';
  let activeUri = makeDocumentUri(activePath);
  let currentMarkdown = markdownByPath.get(activePath);
  let sessionSequence = 0;
  let rejectNextSave = false;
  const savedDocuments = [];
  const headingNavigations = [];

  const context = () => ({
    taskId: 'mdzip-navigation-test',
    uri: activeUri,
    name: getName(activePath),
    markdown: currentMarkdown,
    isTextPack: true,
    isMdzipProject: true,
    mdzipDocumentPath: activePath,
    dirty: false
  });
  window.AndroidNative = {
    getLeftPanelContext: () => JSON.stringify(context()),
    getCurrentDocumentSessionId: () => `session-${activePath}-${sessionSequence}`,
    getDocumentNavigationHistory: () => JSON.stringify({ back: [], forward: [] }),
    registerLeftPanelOpenTabUris: () => {},
    activateLeftPanelTab(uri, name, markdown) {
      activeUri = uri || null;
      activePath = uri ? documentPathFromUri(uri) : '';
      currentMarkdown = markdown || '';
      sessionSequence += 1;
      return true;
    },
    resolveMdzipLinkTarget(link) {
      const resolved = new URL(link, `https://mdzip.test/${activePath}`);
      const targetPath = decodeURIComponent(resolved.pathname.slice(1));
      return markdownByPath.has(targetPath) ? makeDocumentUri(targetPath) : '';
    },
    readLeftPanelDocument(uri) {
      const documentPath = documentPathFromUri(uri);
      const markdown = markdownByPath.get(documentPath);
      return markdown == null
        ? { ok: false, error: 'Missing test document.' }
        : {
            ok: true,
            uri,
            name: getName(documentPath),
            markdown,
            isTextPack: true,
            isMdzipEntry: true
          };
    },
    saveLeftPanelTab(uri, name, markdown) {
      if (rejectNextSave) {
        rejectNextSave = false;
        return { ok: false, error: 'Test save rejected.' };
      }
      const documentPath = documentPathFromUri(uri);
      markdownByPath.set(documentPath, markdown);
      savedDocuments.push({ uri, name, markdown });
      return { ok: true };
    },
    focusOpenDocument: () => false,
    readWmdxTabSession: () => null
  };
  window.editorBridge = {
    getMarkdown: () => currentMarkdown,
    getScrollPosition: () => 0,
    persistCurrentScrollPosition: () => {},
    setMarkdown(markdown) {
      currentMarkdown = markdown || '';
    },
    navigateToHeading(heading) {
      headingNavigations.push({ path: activePath, heading });
      return true;
    }
  };

  try {
    const { setupLeftPanel } = await import('../src/leftPanel.js');
    const controller = setupLeftPanel();
    assert.ok(controller);

    const openLinkAndFlush = async (link) => {
      assert.equal(controller.openMdzipLink(link), true, `link opens: ${link}`);
      await new Promise((resolve) => setTimeout(resolve, 40));
    };
    const visibleTabs = () => Array.from(
      window.document.querySelectorAll('#left-panel-tabs-list [data-tab-id]')
    );
    const selectedTab = () =>
      window.document.querySelector('#left-panel-tabs-list [data-tab-id].selected');

    await openLinkAndFlush('docs/guide.md');
    assert.equal(activePath, 'docs/guide.md');
    const guideTabId = selectedTab().dataset.tabId;

    await openLinkAndFlush('chapters/topic.md#Deep%20Dive');
    assert.equal(activePath, 'docs/chapters/topic.md');
    const topicTabId = selectedTab().dataset.tabId;

    await openLinkAndFlush('../notes/%E6%98%A5%E3%81%AE%20caf%C3%A9.md');
    assert.equal(activePath, 'docs/notes/春の café.md');
    assert.equal(currentMarkdown, markdownByPath.get(activePath));
    const unicodeTabId = selectedTab().dataset.tabId;

    await openLinkAndFlush('../guide.md#Guide%20Details');
    assert.equal(activePath, 'docs/guide.md');
    assert.equal(selectedTab().dataset.tabId, guideTabId, 'returning to the guide reuses its tab');
    assert.deepEqual(headingNavigations.at(-1), {
      path: 'docs/guide.md',
      heading: 'Guide Details'
    });

    await openLinkAndFlush('notes/%E6%98%A5%E3%81%AE%20caf%C3%A9.md');
    assert.equal(activePath, 'docs/notes/春の café.md');
    assert.equal(selectedTab().dataset.tabId, unicodeTabId, 'reopening a Unicode document reuses its tab');
    assert.equal(
      selectedTab().dataset.tabId,
      makeDocumentUri('docs/notes/春の café.md'),
      'the encoded MDZip entry URI remains stable'
    );

    await openLinkAndFlush('../../index.md#Start');
    assert.equal(activePath, 'index.md');
    const entryTabId = selectedTab().dataset.tabId;
    assert.deepEqual(headingNavigations.at(-1), {
      path: 'index.md',
      heading: 'Start'
    });

    await openLinkAndFlush('docs/guide.md#Guide');
    assert.equal(activePath, 'docs/guide.md');
    assert.equal(selectedTab().dataset.tabId, guideTabId);

    const guideEdits = '# Guide\n\nUnsaved changes from the guide.';
    currentMarkdown = guideEdits;
    controller.onEditorChanged(guideEdits);
    await openLinkAndFlush('../index.md');
    assert.equal(activePath, 'index.md', 'a dirty source can switch after saving');
    assert.equal(markdownByPath.get('docs/guide.md'), guideEdits);
    assert.deepEqual(savedDocuments.at(-1), {
      uri: makeDocumentUri('docs/guide.md'),
      name: 'guide.md',
      markdown: guideEdits
    });

    const rejectedSaveEdits = '# Start\n\nKeep these edits after save fails.';
    currentMarkdown = rejectedSaveEdits;
    controller.onEditorChanged(rejectedSaveEdits);
    rejectNextSave = true;
    await openLinkAndFlush('docs/guide.md');
    assert.equal(activePath, 'index.md', 'a rejected save keeps the source document active');
    assert.equal(currentMarkdown, rejectedSaveEdits, 'the editor retains the source edits');
    const dirtySourceTab = visibleTabs().find((tab) => tab.dataset.tabId === entryTabId);
    assert.match(dirtySourceTab.textContent, /•/, 'the source tab remains marked dirty');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const persistedAfterRejection = JSON.parse(
      window.localStorage.getItem('wmdx.leftPanel.taskTabs.mdzip-navigation-test')
    );
    assert.equal(persistedAfterRejection.activeTabId, entryTabId);
    assert.equal(
      persistedAfterRejection.tabs.find((tab) => tab.id === entryTabId)?.markdown,
      rejectedSaveEdits
    );

    const allTabs = visibleTabs();
    assert.equal(allTabs.length, 4, 'each project document has exactly one tab');
    assert.equal(guideTabId, makeDocumentUri('docs/guide.md'));
    assert.equal(topicTabId, makeDocumentUri('docs/chapters/topic.md'));
    assert.equal(unicodeTabId, makeDocumentUri('docs/notes/春の café.md'));
    assert.equal(entryTabId, makeDocumentUri('index.md'));

    await new Promise((resolve) => setTimeout(resolve, 300));
    const persisted = JSON.parse(
      window.localStorage.getItem('wmdx.leftPanel.taskTabs.mdzip-navigation-test')
    );
    assert.equal(persisted.tabs.length, 4);
    assert.equal(persisted.activeTabId, entryTabId);
    assert.equal(
      persisted.tabs.find((tab) => tab.id === topicTabId)?.uri,
      makeDocumentUri('docs/chapters/topic.md')
    );
    assert.equal(
      persisted.tabs.find((tab) => tab.id === unicodeTabId)?.uri,
      makeDocumentUri('docs/notes/春の café.md')
    );
  } finally {
    dom.window.close();
  }
});
