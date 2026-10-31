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
    ['docs/chapters/topic.md', '# Topic\n\n## Deep Dive\n\nTopic text.']
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

    await openLinkAndFlush('../guide.md#Guide%20Details');
    assert.equal(activePath, 'docs/guide.md');
    assert.equal(selectedTab().dataset.tabId, guideTabId, 'returning to the guide reuses its tab');
    assert.deepEqual(headingNavigations.at(-1), {
      path: 'docs/guide.md',
      heading: 'Guide Details'
    });

    await openLinkAndFlush('../index.md#Start');
    assert.equal(activePath, 'index.md');
    const entryTabId = selectedTab().dataset.tabId;
    assert.deepEqual(headingNavigations.at(-1), {
      path: 'index.md',
      heading: 'Start'
    });

    await openLinkAndFlush('docs/guide.md#Guide');
    assert.equal(activePath, 'docs/guide.md');
    assert.equal(selectedTab().dataset.tabId, guideTabId);

    const allTabs = visibleTabs();
    assert.equal(allTabs.length, 3, 'each project document has exactly one tab');
    assert.equal(guideTabId, makeDocumentUri('docs/guide.md'));
    assert.equal(topicTabId, makeDocumentUri('docs/chapters/topic.md'));
    assert.equal(entryTabId, makeDocumentUri('index.md'));

    await new Promise((resolve) => setTimeout(resolve, 300));
    const persisted = JSON.parse(
      window.localStorage.getItem('wmdx.leftPanel.taskTabs.mdzip-navigation-test')
    );
    assert.equal(persisted.tabs.length, 3);
    assert.equal(persisted.activeTabId, guideTabId);
    assert.equal(
      persisted.tabs.find((tab) => tab.id === topicTabId)?.uri,
      makeDocumentUri('docs/chapters/topic.md')
    );
  } finally {
    dom.window.close();
  }
});
