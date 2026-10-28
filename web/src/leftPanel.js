import { setupPanelSwipe } from './panelSwipe.js';

const LEFT_PANEL_STATE_KEY = 'wmdx.leftPanel.state.v2';
const LAUNCHER_TABS_KEY = 'wmdx.leftPanel.launcherTabs.v1';
const TASK_TABS_KEY_PREFIX = 'wmdx.leftPanel.taskTabs.';
const SECTION_ORDER = ['search', 'folders', 'tabs'];

function removeEmptyTabGroups(tabs, groups) {
  const usedIds = new Set(tabs.map((tab) => tab.groupId).filter(Boolean));
  for (let index = groups.length - 1; index >= 0; index--) {
    if (!usedIds.has(groups[index].id)) groups.splice(index, 1);
  }
}

export function dissolveTabGroup(tabs, groups, groupId) {
  const index = groups.findIndex((group) => group.id === groupId);
  if (index < 0) return false;
  tabs.forEach((tab) => {
    if (tab.groupId === groupId) tab.groupId = null;
  });
  groups.splice(index, 1);
  return true;
}

export function applyTabDrop(tabs, groups, source, target, position = 'after') {
  if (!source || !target || source.id === target.id && source.kind === target.kind) {
    return false;
  }
  const sourceGroup = source.kind === 'group'
    ? groups.find((group) => group.id === source.id)
    : null;
  const sourceTab = source.kind === 'tab'
    ? tabs.find((tab) => tab.id === source.id)
    : null;
  if ((!sourceGroup && !sourceTab) || !['before', 'after', 'group', 'join-group'].includes(position)) {
    return false;
  }

  if (sourceGroup) {
    if (target.kind === 'group' && target.id === source.id) return false;
    const targetTab = target.kind === 'tab'
      ? tabs.find((tab) => tab.id === target.id)
      : null;
    const targetGroup = target.kind === 'group'
      ? groups.find((group) => group.id === target.id)
      : targetTab?.groupId
        ? groups.find((group) => group.id === targetTab.groupId)
        : null;
    if (target.kind === 'tab' && !targetTab) return false;
    if (target.kind === 'group' && !targetGroup) return false;
    if (targetTab?.groupId === source.id) return false;

    const movingTabs = tabs.filter((tab) => tab.groupId === source.id);
    if (!movingTabs.length) return false;
    for (let index = tabs.length - 1; index >= 0; index--) {
      if (tabs[index].groupId === source.id) tabs.splice(index, 1);
    }
    const anchorTabs = targetGroup
      ? tabs.filter((tab) => tab.groupId === targetGroup.id)
      : [targetTab];
    const anchorIndices = anchorTabs
      .map((tab) => tabs.indexOf(tab))
      .filter((index) => index >= 0);
    if (!anchorIndices.length) {
      tabs.push(...movingTabs);
      removeEmptyTabGroups(tabs, groups);
      return false;
    }
    const insertionIndex = position === 'after'
      ? Math.max(...anchorIndices) + 1
      : Math.min(...anchorIndices);
    tabs.splice(insertionIndex, 0, ...movingTabs);
    removeEmptyTabGroups(tabs, groups);
    return true;
  }

  const targetTab = target.kind === 'tab'
    ? tabs.find((tab) => tab.id === target.id)
    : null;
  const targetGroup = target.kind === 'group'
    ? groups.find((group) => group.id === target.id)
    : null;
  if ((target.kind === 'tab' && !targetTab) || (target.kind === 'group' && !targetGroup)) {
    return false;
  }
  if (targetGroup && sourceTab.groupId === targetGroup.id) return false;

  const oldGroupId = sourceTab.groupId;
  tabs.splice(tabs.indexOf(sourceTab), 1);
  let targetGroupId = targetGroup?.id || null;
  let targetAnchor = targetTab;
  let insertionAfter = position === 'after';

  if (targetTab && (position === 'group' || position === 'join-group')) {
    if (sourceTab.groupId && sourceTab.groupId === targetTab.groupId) {
      targetGroupId = sourceTab.groupId;
      insertionAfter = true;
    } else if (targetTab.groupId) {
      targetGroupId = targetTab.groupId;
      insertionAfter = true;
    } else {
      let id;
      do {
        id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      } while (groups.some((group) => group.id === id));
      targetGroupId = id;
      groups.push({ id, name: 'Group', collapsed: false });
      targetTab.groupId = id;
      insertionAfter = true;
    }
  }

  if (targetGroup) {
    targetGroupId = targetGroup.id;
    const groupTabs = tabs.filter((tab) => tab.groupId === targetGroupId);
    targetAnchor = groupTabs.at(-1) || null;
    insertionAfter = true;
    if (!targetAnchor) {
      tabs.push(sourceTab);
      sourceTab.groupId = oldGroupId || null;
      return false;
    }
  } else if (targetTab) {
    targetGroupId ??= targetTab.groupId || null;
  }

  sourceTab.groupId = targetGroupId;
  if (!targetAnchor) {
    tabs.push(sourceTab);
  } else {
    const targetIndex = tabs.indexOf(targetAnchor);
    if (targetIndex < 0) tabs.push(sourceTab);
    else tabs.splice(targetIndex + (insertionAfter ? 1 : 0), 0, sourceTab);
  }
  removeEmptyTabGroups(tabs, groups);
  return true;
}

export function createPanelExpandedState(state = {}) {
  const tabsManuallyCollapsed = state.tabsManuallyCollapsed === true;
  const expanded = Object.fromEntries(
    SECTION_ORDER.map((section) => [
      section,
      typeof state.expanded?.[section] === 'boolean'
        ? state.expanded[section]
        : true
    ])
  );
  if (!tabsManuallyCollapsed) expanded.tabs = true;
  return { expanded, tabsManuallyCollapsed };
}

export function allocatePanelBodyHeights(availableBodyHeight, sections, activeSection) {
  const heights = Object.fromEntries(sections.map(({ id }) => [id, 0]));
  const expanded = sections.filter(({ expanded, contentHeight }) =>
    expanded && contentHeight > 0
  );
  if (!expanded.length) return heights;

  const available = Math.max(0, Math.floor(availableBodyHeight));
  const naturalTotal = expanded.reduce((total, section) => total + section.contentHeight, 0);
  if (naturalTotal <= available) {
    expanded.forEach(({ id, contentHeight }) => {
      heights[id] = contentHeight;
    });
    return heights;
  }

  const active = expanded.find(({ id }) => id === activeSection);
  const others = active
    ? expanded.filter(({ id }) => id !== active.id)
    : expanded;
  const minimums = new Map(others.map((section) => [
    section.id,
    Math.min(section.contentHeight, section.compactHeight)
  ]));
  const reserved = [...minimums.values()].reduce((total, height) => total + height, 0);

  if (reserved > available) {
    const activeMinimum = active
      ? Math.min(active.contentHeight, active.compactHeight)
      : 0;
    const remainder = Math.max(0, available - activeMinimum);
    const scale = reserved > 0 ? remainder / reserved : 0;
    minimums.forEach((height, id) => {
      heights[id] = Math.floor(height * scale);
    });
    if (active) heights[active.id] = Math.min(activeMinimum, available);
    return heights;
  }

  for (const [id, height] of minimums) heights[id] = height;
  let extra = available - reserved;
  if (active) {
    heights[active.id] = Math.min(active.contentHeight, extra);
    extra -= heights[active.id];
  }
  let eligible = others.filter(({ id, contentHeight }) => heights[id] < contentHeight);

  while (extra > 0 && eligible.length) {
    const share = Math.max(1, Math.floor(extra / eligible.length));
    let allocatedThisRound = 0;
    for (const section of eligible) {
      const amount = Math.min(
        share,
        section.contentHeight - heights[section.id],
        extra - allocatedThisRound
      );
      heights[section.id] += amount;
      allocatedThisRound += amount;
      if (allocatedThisRound >= extra) break;
    }
    if (!allocatedThisRound) break;
    extra -= allocatedThisRound;
    eligible = eligible.filter(({ id, contentHeight }) => heights[id] < contentHeight);
  }

  return heights;
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseBridgeResult(value, fallback = null) {
  if (typeof value !== 'string') return value ?? fallback;
  return parseJson(value, fallback);
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function makeButton(label, onClick, className = 'left-panel-row') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

export function setupLeftPanel() {
  const panel = document.getElementById('left-panel');
  const overlay = document.getElementById('left-panel-overlay');
  const stack = document.getElementById('left-panel-stack');
  if (!panel || !overlay || !stack) return null;

  const native = window.AndroidNative;
  panel.inert = true;
  const savedState = parseJson(readStorage(LEFT_PANEL_STATE_KEY), {});
  const state = savedState && typeof savedState === 'object' && !Array.isArray(savedState)
    ? savedState
    : {};
  const panelExpandedState = createPanelExpandedState(state);
  let tabsManuallyCollapsed = panelExpandedState.tabsManuallyCollapsed;
  const wantedExpanded = panelExpandedState.expanded;
  const searchOptions = {
    wholeWords: state.searchOptions?.wholeWords === true,
    includeContents: state.searchOptions?.includeContents === true,
    markdownOnly: state.searchOptions?.markdownOnly === true
  };
  const keepOpen = { search: false, folders: false, tabs: false };
  let activeSection = null;
  let sectionBeforeSearch = null;
  let windowContext = parseBridgeResult(native?.getLeftPanelContext?.(), {});
  if (!windowContext || typeof windowContext !== 'object') windowContext = {};
  const launcherWindow = Boolean(windowContext.launcherWindow);
  const tabsStorageKey = launcherWindow
    ? LAUNCHER_TABS_KEY
    : `${TASK_TABS_KEY_PREFIX}${windowContext.taskId ?? 'untracked'}`;
  const tabs = [];
  const groups = [];
  const restoredTabIds = new Set();
  const checkedRestoredTabIds = new Set();
  const unverifiedRestoredTabIds = new Set();
  let activeTabId = null;
  let loadedTabId = null;
  let switchingTab = false;
  let pendingTabHistoryNavigation = false;
  let tabsPersistTimer = null;
  let windowClosing = false;
  let searchTimer = null;
  let searchRequestId = 0;
  let searchPending = false;
  let folderRootsLoaded = false;
  let showSearchPath = false;
  let panelEnabled = true;
  let tabsEnabled = true;
  let hideTabFileExtension = true;
  let lastSearchResults = [];
  let lastSearchTruncated = false;

  const sectionElements = new Map(
    SECTION_ORDER.map((id) => [
      id,
      panel.querySelector(`[data-left-section="${id}"]`)
    ])
  );

  const persistPanelState = () => {
    try {
      localStorage.setItem(
        LEFT_PANEL_STATE_KEY,
        JSON.stringify({
          expanded: wantedExpanded,
          activeSection,
          tabsManuallyCollapsed,
          searchOptions
        })
      );
    } catch {
      // Private browsing or storage exhaustion should not block panel use.
    }
  };

  let registeredOpenTabUrisJson = null;
  const syncNativeOpenTabUris = () => {
    const visibleTabs = tabsEnabled
      ? tabs
      : tabs.filter((tab) => tab.id === activeTabId);
    const uris = visibleTabs.map((tab) => tab.uri).filter(Boolean).sort();
    const urisJson = JSON.stringify(uris);
    if (urisJson === registeredOpenTabUrisJson) return;
    if (typeof native?.registerLeftPanelOpenTabUris !== 'function') return;
    native.registerLeftPanelOpenTabUris(urisJson);
    registeredOpenTabUrisJson = urisJson;
  };

  const persistTabsNow = () => {
    clearTimeout(tabsPersistTimer);
    tabsPersistTimer = null;
    syncNativeOpenTabUris();
    if (windowClosing && !launcherWindow) return;
    try {
      localStorage.setItem(tabsStorageKey, JSON.stringify({ activeTabId, tabs, groups }));
    } catch {
      // A session remains usable in memory if WebView storage is unavailable.
    }
  };

  const persistTabs = () => {
    if (windowClosing && !launcherWindow) return;
    syncNativeOpenTabUris();
    clearTimeout(tabsPersistTimer);
    tabsPersistTimer = setTimeout(persistTabsNow, 250);
  };

  const updateToolbarClearance = () => {
    const toolbar = document.getElementById('bottom-toolbar');
    if (!toolbar || getComputedStyle(toolbar).display === 'none') {
      panel.style.setProperty('--left-panel-bottom-clearance', '0px');
      return;
    }
    const toolbarTop = toolbar.getBoundingClientRect().top;
    const clearance = Math.max(0, Math.min(window.innerHeight, window.innerHeight - toolbarTop));
    panel.style.setProperty('--left-panel-bottom-clearance', `${clearance}px`);
  };

  const closePanel = () => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (document.activeElement === searchInput) searchInput.blur();
    native?.hideKeyboard?.();
    hideTabMenu();
  };

  const openPanel = () => {
    if (!panelEnabled) return;
    window.closeTocPanel?.();
    window.editorBridge?.dismissToolbarPopups?.();
    updateToolbarClearance();
    if (document.activeElement === searchInput) searchInput.blur();
    native?.hideKeyboard?.();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    panel.inert = false;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (wantedExpanded.folders) {
      folderRootsLoaded = false;
      loadFolderRoots();
    }
    requestAnimationFrame(reflowSections);
  };

  const setSectionOpen = (id, shouldOpen) => {
    if (!SECTION_ORDER.includes(id)) return;
    wantedExpanded[id] = shouldOpen;
    if (id === 'tabs') tabsManuallyCollapsed = !shouldOpen;
    if (shouldOpen && id === 'search') {
      if (activeSection !== 'search') sectionBeforeSearch = activeSection;
      if (searchInput?.value.trim()) activeSection = 'search';
    } else if (shouldOpen) {
      activeSection = id;
    } else if (activeSection === id) {
      activeSection = id === 'search' && sectionBeforeSearch &&
        wantedExpanded[sectionBeforeSearch]
        ? sectionBeforeSearch
        : null;
      if (id === 'search') sectionBeforeSearch = null;
    }
    persistPanelState();
    updateSectionVisibility();
  };

  const updateSectionVisibility = () => {
    for (const id of SECTION_ORDER) {
      const section = sectionElements.get(id);
      if (!section) continue;
      section.hidden = id === 'tabs' && !tabsEnabled;
      const expanded = wantedExpanded[id];
      section.setAttribute('aria-expanded', String(expanded));
      section.querySelector('.left-panel-section-header')
        ?.setAttribute('aria-expanded', String(expanded));
      section.classList.toggle('is-priority', expanded && id === activeSection);
      section.classList.remove('fill-available');
    }
    requestAnimationFrame(reflowSections);
  };

  function reflowSections() {
    if (!stack.isConnected) return;
    const stackStyle = getComputedStyle(stack);
    const padding = Number.parseFloat(stackStyle.paddingTop || '0') +
      Number.parseFloat(stackStyle.paddingBottom || '0');
    const sections = SECTION_ORDER
      .filter((id) => id !== 'tabs' || tabsEnabled)
      .map((id) => {
        const section = sectionElements.get(id);
        const header = section?.querySelector('.left-panel-section-header');
        const body = section?.querySelector('.left-panel-section-body');
        const border = section
          ? Number.parseFloat(getComputedStyle(section).borderTopWidth || '0')
          : 0;
        return {
          id,
          expanded: wantedExpanded[id],
          contentHeight: wantedExpanded[id] ? body?.scrollHeight || 0 : 0,
          headerHeight: (header?.offsetHeight || 46) + border,
          compactHeight: keepOpen[id]
            ? (id === 'search' ? 112 : 100)
            : (id === 'search' ? 96 : id === 'folders' ? 48 : 56)
        };
      });
    const headerHeight = sections.reduce((total, section) => total + section.headerHeight, 0);
    const bodyHeights = allocatePanelBodyHeights(
      stack.clientHeight - padding - headerHeight,
      sections,
      sections.some((section) => section.id === activeSection) ? activeSection : null
    );
    for (const { id } of sections) {
      const section = sectionElements.get(id);
      const body = section?.querySelector('.left-panel-section-body');
      if (!body) continue;
      if (wantedExpanded[id]) body.style.maxHeight = `${bodyHeights[id]}px`;
      else body.style.maxHeight = '';
      section.classList.remove('fill-available');
    }
  }

  for (const [id, section] of sectionElements) {
    section?.querySelector('.left-panel-section-header')?.addEventListener('click', () => {
      setSectionOpen(id, !wantedExpanded[id]);
    });
  }

  overlay.addEventListener('click', closePanel);

  const folderTree = document.getElementById('left-panel-folders-tree');
  const folderStatus = document.getElementById('left-panel-folders-status');
  const searchInput = document.getElementById('left-panel-search-input');
  const searchContents = document.getElementById('left-panel-search-contents');
  const searchWholeWords = document.getElementById('left-panel-search-whole-words');
  const searchMarkdownOnly = document.getElementById('left-panel-search-markdown-only');
  const searchResults = document.getElementById('left-panel-search-results');
  const searchStatus = document.getElementById('left-panel-search-status');
  const tabsList = document.getElementById('left-panel-tabs-list');
  const tabMenu = document.getElementById('left-panel-tab-menu');
  if (searchContents) searchContents.checked = searchOptions.includeContents;
  if (searchWholeWords) searchWholeWords.checked = searchOptions.wholeWords;
  if (searchMarkdownOnly) searchMarkdownOnly.checked = searchOptions.markdownOnly;
  const updateSearchPriority = () => {
    if (searchInput?.value.trim()) {
      if (activeSection !== 'search') sectionBeforeSearch = activeSection;
      activeSection = 'search';
    } else {
      if (activeSection === 'search') {
        activeSection = sectionBeforeSearch && wantedExpanded[sectionBeforeSearch]
          ? sectionBeforeSearch
          : null;
      }
      sectionBeforeSearch = null;
    }
  };

  const currentMarkdown = () => window.editorBridge?.getMarkdown?.() || '';
  const activeTab = () => tabs.find((tab) => tab.id === activeTabId) || null;
  const uniqueDocumentTabId = (uri, target) => {
    const baseId = uri ||
      `untitled:${native?.getCurrentDocumentSessionId?.() || Date.now()}`;
    return tabs.some((tab) => tab !== target && tab.id === baseId)
      ? `tab:${baseId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      : baseId;
  };
  const normalizeDocumentUri = (uri) => typeof uri === 'string'
    ? uri.replace(/^([a-z][a-z\d+.-]*):/i, (_, scheme) => `${scheme.toLowerCase()}:`)
    : null;
  const sameDocumentUri = (left, right) =>
    normalizeDocumentUri(left) === normalizeDocumentUri(right);
  const tabHistoryState = (tab) => ({
    back: Array.isArray(tab?.documentHistoryBack) ? tab.documentHistoryBack : [],
    forward: Array.isArray(tab?.documentHistoryForward) ? tab.documentHistoryForward : []
  });
  const serializeTabHistoryState = (tab) => JSON.stringify(tabHistoryState(tab));
  const captureTabHistoryState = (tab) => {
    if (!tab) return;
    const state = parseBridgeResult(native?.getDocumentNavigationHistory?.(), null);
    if (!state || !Array.isArray(state.back) || !Array.isArray(state.forward)) return;
    tab.documentHistoryBack = state.back.filter((uri) => typeof uri === 'string');
    tab.documentHistoryForward = state.forward.filter((uri) => typeof uri === 'string');
  };
  const displayTabName = (name) => {
    const fullName = String(name || 'Untitled');
    if (!hideTabFileExtension) return fullName;
    const extensionIndex = fullName.lastIndexOf('.');
    return extensionIndex > 0 ? fullName.slice(0, extensionIndex) : fullName;
  };

  const syncActiveTab = () => {
    if (switchingTab || loadedTabId !== activeTabId) return;
    const tab = activeTab();
    if (!tab) return;
    const context = parseBridgeResult(native?.getLeftPanelContext?.(), {});
    if (!sameDocumentUri(context?.uri || null, tab.uri || null)) {
      native?.reportDiagnostic?.('left_panel_snapshot_uri_mismatch', '');
      return;
    }
    captureTabHistoryState(tab);
    const markdown = currentMarkdown();
    if (markdown === '' && tab.markdown !== '' && !tab.emptyContentExplicitlyEdited) {
      native?.reportDiagnostic?.('left_panel_empty_snapshot_rejected', '');
      return;
    }
    tab.markdown = markdown;
    persistTabs();
  };

  const refreshRestoredTabFromStorage = (tab) => {
    if (
      !tab?.uri ||
      !restoredTabIds.has(tab.id) ||
      checkedRestoredTabIds.has(tab.id)
    ) return;
    const documentData = parseBridgeResult(
      native?.readLeftPanelDocument?.(tab.uri),
      null
    );
    if (!documentData?.ok || typeof documentData.markdown !== 'string') return;
    checkedRestoredTabIds.add(tab.id);
    const diskMarkdown = documentData.markdown;
    const matchesDisk = tab.markdown === diskMarkdown;
    if (!tab.dirty || matchesDisk || (
      tab.markdown === '' &&
      !tab.emptyContentExplicitlyEdited &&
      diskMarkdown !== ''
    )) {
      if (tab.markdown !== diskMarkdown && diskMarkdown) {
        folderStatus.textContent = `Restored ${tab.name} from its saved file.`;
      }
      tab.name = documentData.name || tab.name;
      tab.markdown = diskMarkdown;
      tab.dirty = false;
      tab.emptyContentExplicitlyEdited = false;
      tab.isTextPack = Boolean(documentData.isTextPack);
      tab.hasBom = Boolean(documentData.hasBom);
      tab.hasCrlf = Boolean(documentData.hasCrlf);
      unverifiedRestoredTabIds.delete(tab.id);
      return;
    }
    if (tab.dirty && !matchesDisk) {
      unverifiedRestoredTabIds.add(tab.id);
      folderStatus.textContent =
        `Unsaved changes for ${tab.name} were kept. Edit or save this tab to apply them.`;
    }
  };

  const persistDirtyTab = (tab) => {
    if (!tab?.dirty) return false;
    refreshRestoredTabFromStorage(tab);
    if (
      !tab?.uri ||
      unverifiedRestoredTabIds.has(tab.id) ||
      (tab.markdown === '' && !tab.emptyContentExplicitlyEdited)
    ) return false;
    const saved = parseBridgeResult(
      native?.saveLeftPanelTab?.(
        tab.uri,
        tab.name,
        tab.markdown,
        tab.isTextPack,
        tab.hasBom,
        tab.hasCrlf,
        tab.emptyContentExplicitlyEdited
      ),
      {}
    );
    if (!saved?.ok) {
      folderStatus.textContent = saved?.error || `Could not auto-save ${tab.name}.`;
      return false;
    }
    tab.dirty = false;
    tab.emptyContentExplicitlyEdited = false;
    persistTabs();
    return true;
  };

  const autoSaveDirtyTab = (tab) => {
    if (native?.isAutoSaveOnLeaveEnabled?.() !== true) return false;
    return persistDirtyTab(tab);
  };

  const autoSaveDirtyTabsOnLeave = () => {
    if (loadedTabId === activeTabId) syncActiveTab();
    for (const tab of tabs) autoSaveDirtyTab(tab);
    renderTabs();
    persistTabsNow();
  };

  const addTab = (documentData, { activate = true, persist = true } = {}) => {
    const uri = documentData.uri || null;
    const existing = uri ? tabs.find((tab) => sameDocumentUri(tab.uri, uri)) : null;
    if (existing) {
      if (activate) activateTab(existing.id);
      return existing;
    }
    const tab = {
      id: uri || `untitled:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      uri,
      name: documentData.name || 'Untitled',
      markdown: documentData.markdown || '',
      dirty: Boolean(documentData.dirty),
      pinned: false,
      groupId: null,
      documentHistoryBack: [],
      documentHistoryForward: [],
      emptyContentExplicitlyEdited: Boolean(documentData.emptyContentExplicitlyEdited),
      isTextPack: Boolean(documentData.isTextPack),
      hasBom: Boolean(documentData.hasBom),
      hasCrlf: Boolean(documentData.hasCrlf)
    };
    tabs.push(tab);
    if (activate) activateTab(tab.id);
    else renderTabs();
    if (persist) persistTabs();
    return tab;
  };

  const activateTab = (id, focusTabsSection = true) => {
    const next = tabs.find((tab) => tab.id === id);
    if (!next) return;
    if (id !== activeTabId && loadedTabId === activeTabId) {
      window.editorBridge?.persistCurrentScrollPosition?.();
      syncActiveTab();
      const outgoingTab = activeTab();
      const saved = persistDirtyTab(outgoingTab);
      if (outgoingTab?.uri && outgoingTab.dirty && !saved) return;
    }
    refreshRestoredTabFromStorage(next);
    const previousTabId = activeTabId;
    activeTabId = next.id;
    switchingTab = true;
    const activated = native?.activateLeftPanelTab?.(
      next.uri || '',
      next.name,
      next.markdown,
      next.dirty,
      next.isTextPack,
      next.hasBom,
      next.hasCrlf,
      next.emptyContentExplicitlyEdited,
      serializeTabHistoryState(next)
    );
    if (activated === false) {
      const invalidIndex = tabs.findIndex((tab) => tab.id === next.id);
      if (invalidIndex >= 0) tabs.splice(invalidIndex, 1);
      activeTabId = previousTabId !== next.id && tabs.some((tab) => tab.id === previousTabId)
        ? previousTabId
        : tabs[0]?.id || null;
      switchingTab = false;
      if (activeTabId) {
        renderTabs();
        persistTabs();
        activateTab(activeTabId);
      } else {
        activateUntitledTab();
      }
      folderStatus.textContent = 'A tab points to a file that is no longer available.';
      return;
    }
    window.editorBridge?.setMarkdown?.(next.markdown);
    loadedTabId = next.id;
    next.documentSessionId = native?.getCurrentDocumentSessionId?.() || null;
    if (focusTabsSection) {
      wantedExpanded.tabs = true;
      tabsManuallyCollapsed = false;
      if (activeSection === 'folders' && !searchInput.value.trim()) {
        activeSection = null;
      }
      persistPanelState();
      updateSectionVisibility();
    }
    switchingTab = false;
    renderTabs();
    persistTabs();
  };

  const activateUntitledTab = () => {
    let tab = tabs.find((item) => !item.uri);
    if (!tab) {
      tab = addTab(
        { uri: null, name: 'Untitled', markdown: '' },
        { activate: false, persist: false }
      );
    }
    activeTabId = tab.id;
    switchingTab = true;
    native?.activateLeftPanelTab?.(
      '',
      tab.name || 'Untitled',
      tab.markdown || '',
      tab.dirty,
      tab.isTextPack,
      tab.hasBom,
      tab.hasCrlf,
      tab.emptyContentExplicitlyEdited,
      serializeTabHistoryState(tab)
    );
    tab.documentSessionId = native?.getCurrentDocumentSessionId?.() || null;
    window.editorBridge?.setMarkdown?.(tab.markdown || '');
    loadedTabId = tab.id;
    wantedExpanded.tabs = true;
    tabsManuallyCollapsed = false;
    if (activeSection === 'folders' && !searchInput.value.trim()) {
      activeSection = null;
    }
    persistPanelState();
    updateSectionVisibility();
    switchingTab = false;
    renderTabs();
    persistTabs();
    return tab;
  };

  const openDocumentInActiveTab = async (uri) => {
    const current = activeTab();
    if (sameDocumentUri(current?.uri || null, uri)) return true;
    const existingTarget = tabs.find((tab) =>
      sameDocumentUri(tab.uri, uri) && tab.id !== current?.id);
    if (tabsEnabled && existingTarget) {
      activateTab(existingTarget.id);
      return activeTabId === existingTarget.id;
    }
    if (native?.focusOpenDocument?.(uri) === true) return true;
    if (!native?.readLeftPanelDocumentForNavigation || !native?.activateLeftPanelTab) {
      folderStatus.textContent = 'Opening a file in the active tab is unavailable in this app build.';
      return false;
    }

    if (loadedTabId === activeTabId) syncActiveTab();
    if (current?.dirty) {
      if (current.uri) {
        if (!persistDirtyTab(current)) return false;
      } else if (!existingTarget) {
        const discard = await showDialog({
          title: 'Discard unsaved tab?',
          message: 'Opening another file will replace this untitled tab. Its unsaved text will be lost.',
          actions: [
            { label: 'Cancel', value: false },
            { label: 'Discard and Open', value: true, primary: true }
          ]
        });
        if (!discard) return false;
      }
    }

    window.editorBridge?.persistCurrentScrollPosition?.();
    const documentData = parseBridgeResult(
      native.readLeftPanelDocumentForNavigation(uri),
      {}
    );
    if (!documentData?.ok) {
      folderStatus.textContent = documentData?.error || 'Could not open this file.';
      return false;
    }
    captureTabHistoryState(current);

    const target = (tabsEnabled
      ? tabs.find((tab) => sameDocumentUri(tab.uri, documentData.uri))
      : null) || current;
    if (!target) {
      folderStatus.textContent = 'There is no active tab to open this file in.';
      return false;
    }
    const activated = native.activateLeftPanelTab(
      documentData.uri,
      documentData.name || target.name,
      documentData.markdown || '',
      false,
      Boolean(documentData.isTextPack),
      Boolean(documentData.hasBom),
      Boolean(documentData.hasCrlf),
      false,
      serializeTabHistoryState(target)
    );
    if (!activated) {
      folderStatus.textContent = 'Could not activate this file in the current window.';
      return false;
    }

    const oldId = target.id;
    restoredTabIds.delete(oldId);
    checkedRestoredTabIds.delete(oldId);
    unverifiedRestoredTabIds.delete(oldId);
    target.id = uniqueDocumentTabId(documentData.uri, target);
    target.uri = documentData.uri;
    target.name = documentData.name || target.name;
    target.markdown = documentData.markdown || '';
    target.dirty = false;
    target.emptyContentExplicitlyEdited = false;
    target.isTextPack = Boolean(documentData.isTextPack);
    target.hasBom = Boolean(documentData.hasBom);
    target.hasCrlf = Boolean(documentData.hasCrlf);
    target.documentSessionId = native.getCurrentDocumentSessionId?.() || null;
    activeTabId = target.id;
    loadedTabId = target.id;
    switchingTab = true;
    window.editorBridge?.setMarkdown?.(target.markdown);
    switchingTab = false;
    persistTabs();
    renderTabs();
    return true;
  };

  const openDocument = (uri, { replaceActive = false } = {}) => {
    if (replaceActive || !tabsEnabled) {
      return openDocumentInActiveTab(uri);
    }
    const current = activeTab();
    const existing = sameDocumentUri(current?.uri || null, uri)
      ? current
      : tabs.find((tab) => sameDocumentUri(tab.uri, uri));
    if (existing) {
      activateTab(existing.id);
      return;
    }
    if (native?.focusOpenDocument?.(uri) === true) return;
    if (!native?.readLeftPanelDocument) {
      folderStatus.textContent = 'File access is unavailable in this app build.';
      return;
    }
    const result = parseBridgeResult(native.readLeftPanelDocument(uri), {});
    if (!result?.ok) {
      folderStatus.textContent = result?.error || 'Could not open this file.';
      return;
    }
    addTab(result);
  };

  const renderFolderEntry = (entry, treeUri, parentElement, depth = 0) => {
    const row = document.createElement('div');
    row.className = 'left-panel-row';
    row.setAttribute('role', 'treeitem');
    row.tabIndex = 0;
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        row.click();
      }
    });
    row.style.paddingLeft = `${8 + Math.min(depth, 10) * 14}px`;
    const label = document.createElement('span');
    label.className = 'left-panel-row-label';
    label.textContent = `${entry.isDirectory ? '▸ ' : ''}${entry.name || 'Untitled'}`;
    row.appendChild(label);
    parentElement.appendChild(row);

    if (!entry.isDirectory) {
      row.tabIndex = 0;
      const didLongPress = bindLongPress(row, (x, y) => {
        showFolderFileMenu(entry, x, y);
      });
      row.addEventListener('click', (event) => {
        if (didLongPress()) {
          event.preventDefault();
          return;
        }
        openDocument(entry.uri);
      });
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showFolderFileMenu(entry, event.clientX, event.clientY);
      });
      return;
    }

    const childGroup = document.createElement('div');
    childGroup.setAttribute('role', 'group');
    childGroup.hidden = true;
    parentElement.appendChild(childGroup);
    let loaded = false;
    row.addEventListener('click', () => {
      activeSection = 'folders';
      persistPanelState();
      updateSectionVisibility();
      if (childGroup.hidden) {
        childGroup.hidden = false;
        label.textContent = `⌄ ${entry.name || 'Folder'}`;
        if (!loaded) {
          loaded = true;
          const result = parseBridgeResult(
            native?.listLeftPanelFolderChildren?.(treeUri, entry.documentId),
            []
          );
          const items = Array.isArray(result) ? result : result?.items || [];
          if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'left-panel-row left-panel-muted';
            empty.textContent = 'This folder is empty';
            childGroup.appendChild(empty);
          } else {
            items.forEach((child) => renderFolderEntry(child, treeUri, childGroup, depth + 1));
          }
        }
      } else {
        childGroup.hidden = true;
        label.textContent = `▸ ${entry.name || 'Folder'}`;
      }
      row.setAttribute('aria-expanded', String(!childGroup.hidden));
      requestAnimationFrame(reflowSections);
    });
  };

  const loadFolderRoots = () => {
    if (folderRootsLoaded) return;
    folderRootsLoaded = true;
    if (!native?.listLeftPanelFolderRoots) {
      folderStatus.textContent = 'Folder access is unavailable in this app build.';
      return;
    }
    const result = parseBridgeResult(native.listLeftPanelFolderRoots(), []);
    const roots = Array.isArray(result) ? result : result?.items || [];
    folderTree.replaceChildren();
    if (!roots.length) {
      folderStatus.textContent = 'No approved folders. Add a folder in Storage & Access settings.';
      requestAnimationFrame(reflowSections);
      return;
    }
    folderStatus.textContent = '';
    roots.forEach((root) => {
      const wrapper = document.createElement('div');
      folderTree.appendChild(wrapper);
      renderFolderEntry(root, root.treeUri, wrapper);
    });
    requestAnimationFrame(reflowSections);
  };

  const runSearch = () => {
    const requestId = ++searchRequestId;
    const query = searchInput?.value?.trim() || '';
    searchPending = false;
    lastSearchResults = [];
    lastSearchTruncated = false;
    searchResults?.replaceChildren();
    requestAnimationFrame(reflowSections);
    if (!query) {
      searchStatus.textContent = '';
      return;
    }
    if (!native?.searchLeftPanelFiles) {
      searchStatus.textContent = 'File search is unavailable in this app build.';
      return;
    }
    searchPending = true;
    searchStatus.textContent = 'Searching approved folders…';
    native.searchLeftPanelFiles(
      query,
      Boolean(searchContents?.checked),
      Boolean(searchWholeWords?.checked),
      Boolean(searchMarkdownOnly?.checked),
      requestId
    );
  };

  const renderSearchResults = (results, payload = {}) => {
    if (!searchResults) return;
    lastSearchResults = Array.isArray(results) ? results : [];
    lastSearchTruncated = Boolean(payload?.truncated);
    searchResults.replaceChildren();
    searchStatus.textContent = lastSearchResults.length
      ? `${lastSearchResults.length} result${lastSearchResults.length === 1 ? '' : 's'}${lastSearchTruncated ? ' — search limit reached' : ''}`
      : lastSearchTruncated
        ? 'Search limit reached; no matches found in scanned files.'
        : 'No matches found.';
    lastSearchResults.forEach((result) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'left-panel-row';
      button.setAttribute('role', 'listitem');
      const wrapper = document.createElement('span');
      wrapper.className = 'left-panel-row-label';
      wrapper.textContent = result.name || 'Untitled';
      button.appendChild(wrapper);
      if (showSearchPath && result.path) {
        const path = document.createElement('span');
        path.className = 'left-panel-result-path';
        path.textContent = result.path;
        button.appendChild(path);
      }
      button.addEventListener('click', () => openDocument(result.uri));
      searchResults.appendChild(button);
    });
    requestAnimationFrame(reflowSections);
  };

  const bindLongPress = (element, callback, delay = 520) => {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let triggered = false;
    const clear = () => {
      clearTimeout(timer);
      timer = null;
    };
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      startX = event.clientX;
      startY = event.clientY;
      triggered = false;
      const x = startX;
      const y = startY;
      timer = setTimeout(() => {
        timer = null;
        triggered = true;
        callback(x, y);
      }, delay);
    });
    element.addEventListener('pointermove', (event) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 8) clear();
    });
    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
      element.addEventListener(eventName, clear);
    }
    return () => {
      const didTrigger = triggered;
      triggered = false;
      return didTrigger;
    };
  };

  let dragState = null;
  const dragIndicator = document.createElement('div');
  dragIndicator.className = 'left-panel-drag-indicator';
  dragIndicator.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dragIndicator);

  const setDragCandidate = (candidate) => {
    if (!dragState) return;
    if (dragState.targetElement) {
      dragState.targetElement.classList.remove(
        'is-drop-target',
        'is-drop-group',
        'is-drop-before',
        'is-drop-after'
      );
    }
    dragState.target = candidate?.target || null;
    dragState.position = candidate?.position || null;
    dragState.targetElement = candidate?.element || null;
    if (dragState.targetElement) {
      dragState.targetElement.classList.add('is-drop-target');
      if (candidate.position === 'group' || candidate.position === 'join-group') {
        dragState.targetElement.classList.add('is-drop-group');
      } else {
        dragState.targetElement.classList.add(
          candidate.position === 'before' ? 'is-drop-before' : 'is-drop-after'
        );
      }
    }
    const message = candidate?.position === 'group'
      ? 'Create group'
      : candidate?.position === 'join-group'
        ? 'Add to group'
        : dragState.source.kind === 'group'
          ? 'Move group'
          : 'Move tab';
    dragIndicator.textContent = message;
    dragIndicator.classList.toggle('has-target', Boolean(candidate));
  };

  const findDragCandidate = (event) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const groupRow = element?.closest?.('.left-panel-group-row[data-group-id]');
    const tabRow = element?.closest?.('.left-panel-row[data-tab-id]');
    const targetElement = groupRow || tabRow;
    if (!targetElement) return null;
    const rect = targetElement.getBoundingClientRect();
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const position = ratio < 0.34 ? 'before' : ratio > 0.66 ? 'after' : 'group';
    if (groupRow) {
      const groupId = groupRow.dataset.groupId;
      if (dragState?.source.kind === 'group') {
        if (groupId === dragState.source.id) return null;
        return {
          element: groupRow,
          target: { kind: 'group', id: groupId },
          position: position === 'group' ? 'after' : position
        };
      }
      const tab = tabs.find((item) => item.id === dragState?.source.id);
      if (!tab || tab.groupId === groupId) return null;
      return {
        element: groupRow,
        target: { kind: 'group', id: groupId },
        position: 'join-group'
      };
    }

    const targetId = tabRow.dataset.tabId;
    if (dragState?.source.kind === 'group') {
      const targetTab = tabs.find((tab) => tab.id === targetId);
      if (!targetTab || targetTab.groupId === dragState.source.id) return null;
      return {
        element: tabRow,
        target: { kind: 'tab', id: targetId },
        position: position === 'group' ? 'after' : position
      };
    }
    const sourceTab = tabs.find((tab) => tab.id === dragState?.source.id);
    const targetTab = tabs.find((tab) => tab.id === targetId);
    if (!sourceTab || !targetTab || sourceTab.id === targetTab.id) return null;
    const sameGroup = sourceTab.groupId && sourceTab.groupId === targetTab.groupId;
    return {
      element: tabRow,
      target: { kind: 'tab', id: targetId },
      position: sameGroup
        ? (position === 'before' ? 'before' : 'after')
        : position
    };
  };

  const startPointerDrag = (event, source) => {
    if (event.button !== 0 || event.isPrimary === false || dragState) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    let cancelled = false;
    let timer = null;

    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onCancel);
      handle.removeEventListener('lostpointercapture', onCancel);
      handle.closest('.left-panel-row')?.classList.remove('is-drag-source');
      dragIndicator.classList.remove('open', 'has-target');
      dragIndicator.textContent = '';
      if (dragState?.targetElement) {
        dragState.targetElement.classList.remove(
          'is-drop-target',
          'is-drop-group',
          'is-drop-before',
          'is-drop-after'
        );
      }
      dragState = null;
    };

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (!started) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 8) {
          cancelled = true;
          cleanup();
        }
        return;
      }
      moveEvent.preventDefault();
      const indicatorX = Math.max(6, Math.min(
        window.innerWidth - 140,
        moveEvent.clientX + 10
      ));
      dragIndicator.style.left = `${indicatorX}px`;
      dragIndicator.style.top = `${Math.max(8, moveEvent.clientY + 10)}px`;
      setDragCandidate(findDragCandidate(moveEvent));
      const sectionBody = tabsList?.closest('.left-panel-section-body');
      const bodyRect = sectionBody?.getBoundingClientRect();
      if (bodyRect && moveEvent.clientY < bodyRect.top + 42) {
        sectionBody.scrollTop -= 12;
      } else if (bodyRect && moveEvent.clientY > bodyRect.bottom - 42) {
        sectionBody.scrollTop += 12;
      }
    };

    const onEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      clearTimeout(timer);
      if (started && !cancelled && dragState?.target && dragState?.position) {
        const applied = applyTabDrop(
          tabs,
          groups,
          dragState.source,
          dragState.target,
          dragState.position
        );
        if (applied) persistTabs();
      }
      cleanup();
      renderTabs();
      persistTabs();
    };

    const onCancel = (cancelEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      cancelled = true;
      cleanup();
      renderTabs();
    };

    timer = setTimeout(() => {
      if (cancelled) return;
      started = true;
      dragState = { active: true, source, target: null, position: null, targetElement: null };
      handle.closest('.left-panel-row')?.classList.add('is-drag-source');
      dragIndicator.textContent = source.kind === 'group' ? 'Move group' : 'Move tab';
      dragIndicator.style.left = `${Math.max(6, startX + 10)}px`;
      dragIndicator.style.top = `${Math.max(8, startY + 10)}px`;
      dragIndicator.classList.add('open');
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        // Document-level listeners still track the pointer if capture is unavailable.
      }
    }, 320);

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onCancel);
    handle.addEventListener('lostpointercapture', onCancel);
  };

  const renderTabRow = (tab, index, nested = false) => {
    const row = document.createElement('div');
    row.className = `left-panel-row${tab.id === activeTabId ? ' selected' : ''}${nested ? ' is-nested' : ''}`;
    row.setAttribute('role', 'listitem');
    row.dataset.tabId = tab.id;
    row.dataset.index = String(index);

    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'left-panel-icon-button left-panel-tab-drag';
    dragHandle.textContent = '⠿';
    dragHandle.setAttribute('aria-label', `Reorder ${tab.name}`);
    dragHandle.addEventListener('pointerdown', (event) =>
      startPointerDrag(event, { kind: 'tab', id: tab.id })
    );
    row.appendChild(dragHandle);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'left-panel-row-label left-panel-tab-label';
    label.style.cssText = 'border:0;background:transparent;color:inherit;text-align:left;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    label.textContent = `${tab.pinned ? '◆ ' : ''}${displayTabName(tab.name)}${tab.dirty ? ' •' : ''}`;
    label.title = tab.name;
    const didLongPress = bindLongPress(label, (x, y) => {
      showTabMenu(tab, x, y);
    });
    label.addEventListener('click', (clickEvent) => {
      if (didLongPress()) {
        clickEvent.preventDefault();
        return;
      }
      activateTab(tab.id);
    });
    label.addEventListener('contextmenu', (contextEvent) => {
      contextEvent.preventDefault();
      showTabMenu(tab, contextEvent.clientX, contextEvent.clientY);
    });
    row.appendChild(label);

    if (!tab.pinned) {
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'left-panel-icon-button';
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', `Close ${tab.name}`);
      closeButton.addEventListener('click', () => closeTabs([tab.id]));
      row.appendChild(closeButton);
    }
    tabsList.appendChild(row);
  };

  const renderGroupRow = (group, groupTabs) => {
    const row = document.createElement('div');
    row.className = 'left-panel-row left-panel-group-row';
    row.setAttribute('role', 'listitem');
    row.dataset.groupId = group.id;

    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'left-panel-icon-button left-panel-tab-drag left-panel-group-drag';
    dragHandle.textContent = '⠿';
    dragHandle.setAttribute('aria-label', `Reorder ${group.name || 'group'}`);
    dragHandle.addEventListener('pointerdown', (event) =>
      startPointerDrag(event, { kind: 'group', id: group.id })
    );
    row.appendChild(dragHandle);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'left-panel-icon-button left-panel-group-toggle';
    toggle.textContent = group.collapsed ? '▸' : '⌄';
    toggle.setAttribute('aria-label', `${group.collapsed ? 'Expand' : 'Collapse'} ${group.name || 'group'}`);
    toggle.setAttribute('aria-expanded', String(!group.collapsed));
    toggle.addEventListener('click', () => {
      group.collapsed = !group.collapsed;
      persistTabs();
      renderTabs();
    });
    row.appendChild(toggle);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'left-panel-row-label left-panel-group-label';
    label.style.cssText = 'border:0;background:transparent;color:inherit;text-align:left;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    label.textContent = group.name || 'Group';
    label.title = group.name || 'Group';
    const didLongPress = bindLongPress(label, (x, y) => {
      showGroupMenu(group, x, y);
    });
    label.addEventListener('click', (clickEvent) => {
      if (didLongPress()) {
        clickEvent.preventDefault();
        return;
      }
      group.collapsed = !group.collapsed;
      persistTabs();
      renderTabs();
    });
    label.addEventListener('contextmenu', (contextEvent) => {
      contextEvent.preventDefault();
      showGroupMenu(group, contextEvent.clientX, contextEvent.clientY);
    });
    row.appendChild(label);
    tabsList.appendChild(row);

    if (!group.collapsed) {
      groupTabs.forEach((tab, index) => renderTabRow(tab, index, true));
    }
  };

  const renderTabs = () => {
    if (!tabsList || dragState?.active) return;
    tabsList.replaceChildren();
    const renderedGroups = new Set();
    tabs.forEach((tab, index) => {
      if (tab.groupId) {
        const group = groups.find((item) => item.id === tab.groupId);
        if (!group || renderedGroups.has(group.id)) return;
        renderedGroups.add(group.id);
        renderGroupRow(group, tabs.filter((item) => item.groupId === group.id));
      } else {
        renderTabRow(tab, index);
      }
    });
    requestAnimationFrame(reflowSections);
  };

  const hideTabMenu = () => {
    tabMenu?.classList.remove('open');
    tabMenu?.replaceChildren();
  };

  const positionTabMenu = (x, y) => {
    if (!tabMenu) return;
    const toolbar = document.getElementById('bottom-toolbar');
    const toolbarVisible = toolbar && getComputedStyle(toolbar).display !== 'none';
    const toolbarRect = toolbarVisible ? toolbar.getBoundingClientRect() : null;
    const toolbarTop = toolbarRect && toolbarRect.height > 0 &&
      toolbarRect.top < window.innerHeight
      ? toolbarRect.top
      : window.innerHeight;
    const safeBottom = Math.max(8, Math.min(window.innerHeight, toolbarTop) - 8);
    tabMenu.style.maxHeight = `${Math.max(0, safeBottom - 8)}px`;
    const rect = tabMenu.getBoundingClientRect();
    const maxTop = Math.max(8, safeBottom - rect.height);
    tabMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    tabMenu.style.top = `${Math.max(8, Math.min(y, maxTop))}px`;
  };

  document.addEventListener('pointerdown', (event) => {
    if (!tabMenu?.classList.contains('open')) return;
    if (
      tabMenu.contains(event.target) ||
      event.target.closest?.('.left-panel-tab-label, .left-panel-group-label')
    ) return;
    hideTabMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (tabMenu?.classList.contains('open')) hideTabMenu();
    else if (panel.classList.contains('open')) closePanel();
  });

  const showTabMenu = (tab, x = 16, y = 120) => {
    if (!tabMenu) return;
    tabMenu.replaceChildren();
    const actions = [
      [tab.pinned ? 'Unpin' : 'Pin', () => {
        tab.pinned = !tab.pinned;
        renderTabs();
        persistTabs();
      }],
      ...(tab.uri ? [['Rename', () => renameTab(tab)]] : []),
      ...(!tab.pinned ? [['Close', () => closeTabs([tab.id])]] : []),
      ['Close other tabs', () => {
        activateTab(tab.id);
        closeTabs(tabs.filter((item) => item.id !== tab.id && !item.pinned).map((item) => item.id));
      }],
      ...(tab.uri ? [['Delete file', () => deleteTabFile(tab)]] : [])
    ];
    actions.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => {
        hideTabMenu();
        action();
      });
      tabMenu.appendChild(button);
    });
    tabMenu.classList.add('open');
    positionTabMenu(x, y);
  };

  const showFolderFileMenu = (entry, x = 16, y = 120) => {
    if (!tabMenu) return;
    tabMenu.replaceChildren();
    const actions = [
      ['Rename', () => renameFolderFile(entry)],
      ['Delete', () => {
        const openTab = tabs.find((tab) => tab.uri === entry.uri);
        deleteTabFile(openTab || {
          id: entry.uri,
          uri: entry.uri,
          name: entry.name || 'Untitled',
          dirty: false
        });
      }],
      ...(tabsEnabled ? [['Open in new tab', () => openDocument(entry.uri)]] : []),
      ['Open', () => openDocument(entry.uri, { replaceActive: true })]
    ];
    actions.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => {
        hideTabMenu();
        action();
      });
      tabMenu.appendChild(button);
    });
    tabMenu.classList.add('open');
    positionTabMenu(x, y);
  };

  const showDialog = ({ title, message, inputValue, actions }) => new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:10030;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px;';
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.cssText = 'width:min(100%,360px);padding:18px;border-radius:12px;background:var(--toolbar-bg,#171717);color:var(--text-color,#fff);box-shadow:0 12px 36px rgba(0,0,0,.6);';
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = 'font-size:17px;font-weight:600;margin-bottom:10px;';
    dialog.appendChild(heading);
    if (message) {
      const text = document.createElement('div');
      text.textContent = message;
      text.style.cssText = 'font-size:14px;line-height:1.45;margin-bottom:12px;overflow-wrap:anywhere;';
      dialog.appendChild(text);
    }
    let input = null;
    if (inputValue !== undefined) {
      input = document.createElement('input');
      input.value = inputValue;
      input.type = 'text';
      input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border-radius:7px;border:1px solid var(--border-color,#555);background:var(--bg-color,#000);color:var(--text-color,#fff);font:inherit;margin-bottom:14px;';
      dialog.appendChild(input);
    }
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:8px;';
    const finish = (value) => {
      backdrop.remove();
      resolve(value);
    };
    actions.forEach(({ label, value, primary }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = `min-height:40px;padding:7px 12px;border:1px solid var(--border-color,#555);border-radius:8px;color:var(--text-color,#fff);background:${primary ? 'var(--toolbar-accent,#444)' : 'transparent'};font:inherit;`;
      button.addEventListener('click', () => finish(input ? { value, text: input.value } : value));
      actionRow.appendChild(button);
    });
    dialog.appendChild(actionRow);
    backdrop.appendChild(dialog);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish(null);
    });
    document.body.appendChild(backdrop);
    input?.focus();
    input?.select();
  });

  const renameGroup = async (group) => {
    const result = await showDialog({
      title: 'Rename group',
      inputValue: group.name || 'Group',
      actions: [
        { label: 'Cancel', value: null },
        { label: 'Rename', value: 'rename', primary: true }
      ]
    });
    if (!result?.text?.trim()) return;
    group.name = result.text.trim();
    renderTabs();
    persistTabs();
  };

  const showGroupMenu = (group, x = 16, y = 120) => {
    if (!tabMenu) return;
    tabMenu.replaceChildren();
    [
      ['Rename group', () => renameGroup(group)],
      ['Delete group', () => {
        dissolveTabGroup(tabs, groups, group.id);
        renderTabs();
        persistTabs();
      }]
    ].forEach(([label, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => {
        hideTabMenu();
        action();
      });
      tabMenu.appendChild(button);
    });
    tabMenu.classList.add('open');
    positionTabMenu(x, y);
  };

  const closeTabs = async (ids) => {
    const targets = ids
      .map((id) => tabs.find((tab) => tab.id === id))
      .filter((tab) => tab && !tab.pinned);
    if (!targets.length) return;
    const closeIds = targets.map((tab) => tab.id);
    const dirty = targets.filter((tab) => tab.dirty);
    let choice = 'discard';
    if (dirty.length) {
      const result = await showDialog({
        title: targets.length > 1 ? 'Close tabs?' : `Close ${targets[0].name}?`,
        message: 'Some tabs have unsaved changes.',
        actions: [
          { label: 'Cancel', value: null },
          { label: 'Discard changes', value: 'discard' },
          { label: 'Save and close', value: 'save', primary: true }
        ]
      });
      if (!result) return;
      choice = result;
    }
    if (choice === 'save') {
      for (const tab of dirty) {
        const saved = parseBridgeResult(
          native?.saveLeftPanelTab?.(
            tab.uri || '',
            tab.name,
            tab.markdown,
            tab.isTextPack,
            tab.hasBom,
            tab.hasCrlf,
            tab.emptyContentExplicitlyEdited
          ),
          {}
        );
        if (!saved?.ok) {
          await showDialog({
            title: 'Could not save tab',
            message: saved?.error || `Could not save ${tab.name}.`,
            actions: [{ label: 'OK', value: true, primary: true }]
          });
          return;
        }
        tab.dirty = false;
        tab.emptyContentExplicitlyEdited = false;
      }
    }
    for (const id of closeIds) {
      const index = tabs.findIndex((tab) => tab.id === id);
      if (index >= 0) tabs.splice(index, 1);
    }
    removeEmptyTabGroups(tabs, groups);
    if (!tabs.length) {
      activateUntitledTab();
    } else if (closeIds.includes(activeTabId)) {
      const replacement = tabs[0];
      if (replacement && tabs.includes(replacement)) activateTab(replacement.id);
    }
    renderTabs();
    persistTabs();
  };

  const renameTab = async (tab) => {
    if (!tab.uri || !native?.renameLeftPanelDocument) return;
    const result = await showDialog({
      title: 'Rename file',
      inputValue: tab.name,
      actions: [
        { label: 'Cancel', value: null },
        { label: 'Rename', value: 'rename', primary: true }
      ]
    });
    if (!result?.text?.trim()) return;
    const oldId = tab.id;
    const renamed = parseBridgeResult(
      native.renameLeftPanelDocument(tab.uri, result.text.trim()),
      {}
    );
    if (!renamed?.ok) {
      await showDialog({
        title: 'Could not rename file',
        message: renamed?.error || 'The storage provider did not rename this file.',
        actions: [{ label: 'OK', value: true, primary: true }]
      });
      return;
    }
    tab.uri = renamed.uri || tab.uri;
    tab.id = tab.uri;
    tab.name = renamed.name || result.text.trim();
    if (activeTabId === oldId) activeTabId = tab.id;
    if (loadedTabId === oldId) loadedTabId = tab.id;
    renderTabs();
    persistTabs();
    folderRootsLoaded = false;
    loadFolderRoots();
    runSearch();
  };

  const renameFolderFile = async (entry) => {
    if (!entry?.uri || !native?.renameLeftPanelDocument) return;
    const result = await showDialog({
      title: 'Rename file',
      inputValue: entry.name || 'Untitled',
      actions: [
        { label: 'Cancel', value: null },
        { label: 'Rename', value: 'rename', primary: true }
      ]
    });
    if (!result?.text?.trim()) return;
    const renamed = parseBridgeResult(
      native.renameLeftPanelDocument(entry.uri, result.text.trim()),
      {}
    );
    if (!renamed?.ok) {
      await showDialog({
        title: 'Could not rename file',
        message: renamed?.error || 'The storage provider did not rename this file.',
        actions: [{ label: 'OK', value: true, primary: true }]
      });
      return;
    }

    const tab = tabs.find((item) => item.uri === entry.uri);
    if (tab) {
      const oldId = tab.id;
      restoredTabIds.delete(oldId);
      checkedRestoredTabIds.delete(oldId);
      unverifiedRestoredTabIds.delete(oldId);
      tab.uri = renamed.uri || tab.uri;
      tab.id = tab.uri;
      tab.name = renamed.name || result.text.trim();
      if (activeTabId === oldId) activeTabId = tab.id;
      if (loadedTabId === oldId) loadedTabId = tab.id;
    }
    renderTabs();
    persistTabs();
    folderRootsLoaded = false;
    loadFolderRoots();
    runSearch();
  };

  const deleteTabFile = async (tab) => {
    if (!tab.uri || !native?.deleteLeftPanelDocument) return;
    const confirmation = await showDialog({
      title: 'Delete file?',
      message: tab.dirty
        ? `“${tab.name}” has unsaved changes. Delete the file and discard those changes?`
        : `Delete “${tab.name}” from storage? This cannot be undone.`,
      actions: [
        { label: 'Cancel', value: false },
        { label: tab.dirty ? 'Delete and discard' : 'Delete file', value: true, primary: true }
      ]
    });
    if (!confirmation) return;
    const deleted = parseBridgeResult(native.deleteLeftPanelDocument(tab.uri), {});
    if (!deleted?.ok) {
      await showDialog({
        title: 'Could not delete file',
        message: deleted?.error || 'The storage provider did not delete this file.',
        actions: [{ label: 'OK', value: true, primary: true }]
      });
      return;
    }
    const index = tabs.findIndex((item) => item.id === tab.id);
    if (index >= 0) tabs.splice(index, 1);
    removeEmptyTabGroups(tabs, groups);
    if (activeTabId === tab.id) {
      activeTabId = tabs[0]?.id || null;
      if (activeTabId) activateTab(activeTabId);
      else activateUntitledTab();
    }
    renderTabs();
    persistTabs();
    folderRootsLoaded = false;
    loadFolderRoots();
    runSearch();
  };

  document.getElementById('left-panel-search-clear')?.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    wantedExpanded.search = true;
    updateSearchPriority();
    persistPanelState();
    updateSectionVisibility();
    runSearch();
  });
  searchInput?.addEventListener('input', () => {
    searchRequestId++;
    searchPending = false;
    lastSearchResults = [];
    lastSearchTruncated = false;
    searchResults?.replaceChildren();
    wantedExpanded.search = true;
    updateSearchPriority();
    persistPanelState();
    updateSectionVisibility();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 220);
  });
  const onSearchOptionChanged = (key, input) => {
    searchOptions[key] = Boolean(input?.checked);
    wantedExpanded.search = true;
    updateSearchPriority();
    persistPanelState();
    updateSectionVisibility();
    runSearch();
  };
  searchContents?.addEventListener('change', () =>
    onSearchOptionChanged('includeContents', searchContents)
  );
  searchWholeWords?.addEventListener('change', () =>
    onSearchOptionChanged('wholeWords', searchWholeWords)
  );
  searchMarkdownOnly?.addEventListener('change', () =>
    onSearchOptionChanged('markdownOnly', searchMarkdownOnly)
  );
  sectionElements.get('folders')?.querySelector('.left-panel-section-header')
    ?.addEventListener('click', () => {
      if (wantedExpanded.folders) {
        folderRootsLoaded = false;
        loadFolderRoots();
      }
    });

  const storedTabs = parseJson(readStorage(tabsStorageKey), null);
  if (Array.isArray(storedTabs?.tabs) && storedTabs.tabs.length) {
    if (Array.isArray(storedTabs.groups)) {
      storedTabs.groups.forEach((savedGroup) => {
        if (
          savedGroup &&
          typeof savedGroup.id === 'string' &&
          savedGroup.id &&
          !groups.some((group) => group.id === savedGroup.id)
        ) {
          groups.push({
            id: savedGroup.id,
            name: typeof savedGroup.name === 'string' && savedGroup.name.trim()
              ? savedGroup.name
              : 'Group',
            collapsed: Boolean(savedGroup.collapsed)
          });
        }
      });
    }
    for (const savedTab of storedTabs.tabs) {
      if (!savedTab || typeof savedTab.id !== 'string' || tabs.some((tab) => tab.id === savedTab.id)) {
        continue;
      }
      const restoredTab = {
        id: savedTab.id,
        uri: typeof savedTab.uri === 'string' && savedTab.uri ? savedTab.uri : null,
        name: typeof savedTab.name === 'string' ? savedTab.name : 'Untitled',
        markdown: typeof savedTab.markdown === 'string' ? savedTab.markdown : '',
        dirty: Boolean(savedTab.dirty),
        pinned: Boolean(savedTab.pinned),
        groupId: groups.some((group) => group.id === savedTab.groupId)
          ? savedTab.groupId
          : null,
        documentHistoryBack: Array.isArray(savedTab.documentHistoryBack)
          ? savedTab.documentHistoryBack.filter((uri) => typeof uri === 'string')
          : [],
        documentHistoryForward: Array.isArray(savedTab.documentHistoryForward)
          ? savedTab.documentHistoryForward.filter((uri) => typeof uri === 'string')
          : [],
        emptyContentExplicitlyEdited: Boolean(savedTab.emptyContentExplicitlyEdited),
        isTextPack: Boolean(savedTab.isTextPack),
        hasBom: Boolean(savedTab.hasBom),
        hasCrlf: Boolean(savedTab.hasCrlf),
        documentSessionId: null
      };
      tabs.push(restoredTab);
      if (restoredTab.uri) restoredTabIds.add(restoredTab.id);
    }
    removeEmptyTabGroups(tabs, groups);
    const emptyUntitledTabs = tabs.filter((tab) =>
      !tab.uri &&
      !tab.dirty &&
      tab.markdown === '' &&
      /^Untitled(?:\.md)?$/i.test(tab.name)
    );
    if (emptyUntitledTabs.length > 1) {
      const keepId = emptyUntitledTabs.some((tab) => tab.id === storedTabs.activeTabId)
        ? storedTabs.activeTabId
        : emptyUntitledTabs[0].id;
      const retainedTabs = tabs.filter((tab) =>
        !emptyUntitledTabs.includes(tab) || tab.id === keepId
      );
      tabs.splice(0, tabs.length, ...retainedTabs);
    }
    activeTabId = tabs.some((tab) => tab.id === storedTabs.activeTabId)
      ? storedTabs.activeTabId
      : tabs[0]?.id;
  }
  if (!tabs.length && windowContext?.name) {
    addTab({
      uri: windowContext.uri || null,
      name: windowContext.name,
      markdown: windowContext.markdown || currentMarkdown(),
      dirty: Boolean(windowContext.dirty),
      isTextPack: Boolean(windowContext.isTextPack),
      hasBom: Boolean(windowContext.hasBom),
      hasCrlf: Boolean(windowContext.hasCrlf),
      emptyContentExplicitlyEdited: Boolean(windowContext.emptyContentExplicitlyEdited)
    }, { activate: false, persist: false });
    activeTabId = tabs[0]?.id || null;
  }
  if (!tabs.length) {
    addTab({ uri: null, name: 'Untitled', markdown: currentMarkdown() }, {
      activate: false,
      persist: false
    });
    activeTabId = tabs[0]?.id || null;
  }
  if (activeTabId) activateTab(activeTabId, false);
  renderTabs();

  const onEditorChanged = (markdown) => {
    if (switchingTab || loadedTabId !== activeTabId) return;
    const tab = activeTab();
    if (!tab) return;
    tab.markdown = String(markdown ?? '');
    tab.dirty = true;
    tab.emptyContentExplicitlyEdited = tab.markdown === '';
    restoredTabIds.delete(tab.id);
    checkedRestoredTabIds.delete(tab.id);
    unverifiedRestoredTabIds.delete(tab.id);
    persistTabs();
    renderTabs();
  };

  const onNativeDocumentLoaded = (markdown) => {
    if (switchingTab) return;
    const context = parseBridgeResult(native?.getLeftPanelContext?.(), {});
    if (!context || typeof context !== 'object') return;
    const current = activeTab();
    if (pendingTabHistoryNavigation && current) {
      pendingTabHistoryNavigation = false;
      const oldId = current.id;
      current.id = uniqueDocumentTabId(context.uri, current);
      current.uri = context.uri || null;
      current.name = context.name || 'Untitled';
      current.markdown = String(markdown ?? context.markdown ?? '');
      current.dirty = Boolean(context.dirty);
      current.isTextPack = Boolean(context.isTextPack);
      current.hasBom = Boolean(context.hasBom);
      current.hasCrlf = Boolean(context.hasCrlf);
      current.emptyContentExplicitlyEdited =
        Boolean(context.emptyContentExplicitlyEdited);
      current.documentSessionId = native?.getCurrentDocumentSessionId?.() || null;
      restoredTabIds.delete(oldId);
      checkedRestoredTabIds.delete(oldId);
      unverifiedRestoredTabIds.delete(oldId);
      activeTabId = current.id;
      loadedTabId = current.id;
      captureTabHistoryState(current);
      renderTabs();
      persistTabs();
      return;
    }
    if (!tabsEnabled) {
      const target = current || (context.uri
        ? tabs.find((tab) => sameDocumentUri(tab.uri, context.uri))
        : null);
      if (!target) return;
      const oldId = target.id;
      target.id = uniqueDocumentTabId(context.uri, target);
      target.uri = context.uri || null;
      target.name = context.name || 'Untitled';
      target.markdown = String(markdown ?? context.markdown ?? '');
      target.dirty = Boolean(context.dirty);
      target.isTextPack = Boolean(context.isTextPack);
      target.hasBom = Boolean(context.hasBom);
      target.hasCrlf = Boolean(context.hasCrlf);
      target.emptyContentExplicitlyEdited =
        Boolean(context.emptyContentExplicitlyEdited);
      target.documentSessionId = native?.getCurrentDocumentSessionId?.() || null;
      restoredTabIds.delete(oldId);
      checkedRestoredTabIds.delete(oldId);
      unverifiedRestoredTabIds.delete(oldId);
      activeTabId = target.id;
      loadedTabId = target.id;
      renderTabs();
      persistTabs();
      return;
    }
    const replaceEmptyPlaceholder = context.uri &&
      current &&
      !current.uri &&
      !current.dirty &&
      tabs.length === 1 &&
      /^Untitled(?:\.md)?$/i.test(current.name);
    if (replaceEmptyPlaceholder) {
      current.id = context.uri;
      current.uri = context.uri;
      current.name = context.name || current.name;
      current.markdown = String(markdown ?? context.markdown ?? '');
      current.dirty = Boolean(context.dirty);
      current.isTextPack = Boolean(context.isTextPack);
      current.hasBom = Boolean(context.hasBom);
      current.hasCrlf = Boolean(context.hasCrlf);
      current.emptyContentExplicitlyEdited =
        Boolean(context.emptyContentExplicitlyEdited);
      activeTabId = current.id;
    } else if (!current || !sameDocumentUri(current.uri, context.uri || null)) {
      const existing = context.uri
        ? tabs.find((tab) => sameDocumentUri(tab.uri, context.uri))
        : null;
      if (existing) {
        existing.name = context.name || existing.name;
        existing.markdown = String(markdown ?? context.markdown ?? '');
        existing.dirty = Boolean(context.dirty);
        existing.isTextPack = Boolean(context.isTextPack);
        existing.hasBom = Boolean(context.hasBom);
        existing.hasCrlf = Boolean(context.hasCrlf);
        existing.emptyContentExplicitlyEdited =
          Boolean(context.emptyContentExplicitlyEdited);
        activeTabId = existing.id;
      } else {
        const newTab = {
          id: context.uri || `untitled:${Date.now()}`,
          uri: context.uri || null,
          name: context.name || 'Untitled',
          markdown: String(markdown ?? context.markdown ?? ''),
          dirty: Boolean(context.dirty),
          pinned: false,
          groupId: null,
          documentHistoryBack: [],
          documentHistoryForward: [],
          isTextPack: Boolean(context.isTextPack),
          hasBom: Boolean(context.hasBom),
          hasCrlf: Boolean(context.hasCrlf),
          emptyContentExplicitlyEdited:
            Boolean(context.emptyContentExplicitlyEdited),
          documentSessionId: null
        };
        tabs.push(newTab);
        activeTabId = newTab.id;
      }
    } else {
      current.name = context.name || current.name;
      current.markdown = String(markdown ?? context.markdown ?? '');
      current.dirty = Boolean(context.dirty);
      if (current.markdown || !current.dirty) current.emptyContentExplicitlyEdited = false;
    }
    const loadedTab = activeTab();
    if (loadedTab) {
      loadedTab.documentSessionId = native?.getCurrentDocumentSessionId?.() || null;
      loadedTab.emptyContentExplicitlyEdited =
        Boolean(context.emptyContentExplicitlyEdited);
      captureTabHistoryState(loadedTab);
    }
    loadedTabId = activeTabId;
    renderTabs();
    persistTabs();
  };

  const controller = {
    open: openPanel,
    close: closePanel,
    onEditorChanged,
    onNativeDocumentLoaded,
    focusDocumentUri(uri) {
      const current = activeTab();
      const target = sameDocumentUri(current?.uri || null, uri)
        ? current
        : tabs.find((tab) => sameDocumentUri(tab.uri, uri));
      if (!target) return false;
      if (target.id !== activeTabId) activateTab(target.id);
      return activeTabId === target.id;
    },
    onDocumentHistoryStateChanged(stateJson) {
      const state = parseBridgeResult(stateJson, null);
      const tab = activeTab();
      if (!tab || !state || !Array.isArray(state.back) || !Array.isArray(state.forward)) {
        return;
      }
      const back = state.back.filter((uri) => typeof uri === 'string');
      const forward = state.forward.filter((uri) => typeof uri === 'string');
      const sameHistory = (current, next) =>
        Array.isArray(current) &&
        current.length === next.length &&
        current.every((uri, index) => uri === next[index]);
      if (
        sameHistory(tab.documentHistoryBack, back) &&
        sameHistory(tab.documentHistoryForward, forward)
      ) return;
      tab.documentHistoryBack = back;
      tab.documentHistoryForward = forward;
      persistTabs();
    },
    onTabHistoryNavigationStarted() {
      pendingTabHistoryNavigation = true;
    },
    onTabHistoryNavigationCancelled() {
      pendingTabHistoryNavigation = false;
    },
    onSearchResults(requestId, json) {
      if (requestId !== searchRequestId) return;
      searchPending = false;
      const payload = parseBridgeResult(json, []);
      const results = Array.isArray(payload) ? payload : payload?.items || [];
      renderSearchResults(results, payload);
    },
    onDocumentSaved(uri) {
      const tab = tabs.find((item) => item.uri === uri) || activeTab();
      if (tab) {
        tab.dirty = false;
        persistTabs();
        renderTabs();
      }
    },
    onDocumentSavedAs(oldUri, newUri, name, sessionId) {
      const tab = sessionId
        ? tabs.find((item) => item.documentSessionId === sessionId)
        : tabs.find((item) => item.uri === oldUri);
      if (!tab) return;
      if (oldUri && tab.uri !== oldUri) return;
      if (!oldUri && tab.uri) return;
      restoredTabIds.delete(tab.id);
      checkedRestoredTabIds.delete(tab.id);
      unverifiedRestoredTabIds.delete(tab.id);
      tab.uri = newUri || tab.uri;
      tab.id = tab.uri || tab.id;
      tab.name = name || tab.name;
      tab.dirty = false;
      tab.emptyContentExplicitlyEdited = false;
      const context = parseBridgeResult(native?.getLeftPanelContext?.(), {});
      tab.isTextPack = Boolean(context?.isTextPack);
      tab.hasBom = Boolean(context?.hasBom);
      tab.hasCrlf = Boolean(context?.hasCrlf);
      activeTabId = tab.id;
      persistTabs();
      renderTabs();
    },
    onNativeDocumentSaved(uri) {
      const tab = tabs.find((item) => item.uri === uri);
      if (!tab) return;
      tab.dirty = false;
      tab.emptyContentExplicitlyEdited = false;
      restoredTabIds.delete(tab.id);
      checkedRestoredTabIds.delete(tab.id);
      unverifiedRestoredTabIds.delete(tab.id);
      persistTabs();
      renderTabs();
    },
    onWindowClosing() {
      if (!launcherWindow) {
        windowClosing = true;
        try {
          localStorage.removeItem(tabsStorageKey);
        } catch {
          // A stale per-task cache is ignored by every other window.
        }
      } else {
        persistTabsNow();
      }
    },
    applyPreferences(prefs) {
      panelEnabled = prefs?.pref_left_panel_enabled !== false;
      panel.classList.toggle('panel-disabled', !panelEnabled);
      overlay.classList.toggle('panel-disabled', !panelEnabled);
      if (!panelEnabled && panel.classList.contains('open')) closePanel();

      tabsEnabled = prefs?.pref_left_panel_tabs_enabled !== false;
      syncNativeOpenTabUris();
      hideTabFileExtension = prefs?.pref_left_panel_hide_file_extension !== false;
      for (const id of SECTION_ORDER) {
        const enabled = prefs?.[`pref_left_panel_${id}_keep_open`] === true;
        if (enabled && !keepOpen[id]) {
          wantedExpanded[id] = true;
        }
        keepOpen[id] = enabled;
      }
      persistPanelState();
      updateSectionVisibility();
      renderTabs();
      updateToolbarClearance();
      const nextShowSearchPath = prefs?.pref_left_panel_show_search_path === true;
      if (showSearchPath !== nextShowSearchPath) {
        showSearchPath = nextShowSearchPath;
        if (searchInput?.value.trim() && !searchPending) {
          renderSearchResults(lastSearchResults, { truncated: lastSearchTruncated });
        }
      }
      if (panel.classList.contains('open') && wantedExpanded.folders) {
        folderRootsLoaded = false;
        loadFolderRoots();
      }
    },
    refreshLayout() {
      updateToolbarClearance();
      requestAnimationFrame(reflowSections);
    },
    get isSwitchingTab() {
      return switchingTab;
    }
  };
  window.leftPanelController = controller;
  controller.activateTab = activateTab;
  controller.renderTabs = renderTabs;
  window.addEventListener('pagehide', autoSaveDirtyTabsOnLeave);
  window.addEventListener('resize', () => controller.refreshLayout());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autoSaveDirtyTabsOnLeave();
  });
  window.visualViewport?.addEventListener('resize', () => controller.refreshLayout());

  updateSectionVisibility();
  if (activeSection && wantedExpanded[activeSection] !== true) {
    activeSection = null;
  }
  persistPanelState();
  updateSectionVisibility();
  if (activeSection === 'folders') loadFolderRoots();

  setupPanelSwipe({
    panel,
    overlay,
    side: 'left',
    isOpen: () => panel.classList.contains('open'),
    isEnabled: () => panelEnabled,
    onOpen: openPanel,
    onClose: closePanel
  });
  updateToolbarClearance();

  return controller;
}
