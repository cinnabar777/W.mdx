const LEFT_PANEL_STATE_KEY = 'wmdx.leftPanel.state.v2';
const LAUNCHER_TABS_KEY = 'wmdx.leftPanel.launcherTabs.v1';
const TASK_TABS_KEY_PREFIX = 'wmdx.leftPanel.taskTabs.';
const SECTION_ORDER = ['search', 'folders', 'tabs'];

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
  const restoredTabIds = new Set();
  const checkedRestoredTabIds = new Set();
  const unverifiedRestoredTabIds = new Set();
  let activeTabId = null;
  let loadedTabId = null;
  let switchingTab = false;
  let tabsPersistTimer = null;
  let windowClosing = false;
  let searchTimer = null;
  let searchRequestId = 0;
  let folderRootsLoaded = false;

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
        JSON.stringify({ expanded: wantedExpanded, activeSection, tabsManuallyCollapsed })
      );
    } catch {
      // Private browsing or storage exhaustion should not block panel use.
    }
  };

  const persistTabsNow = () => {
    clearTimeout(tabsPersistTimer);
    tabsPersistTimer = null;
    if (windowClosing && !launcherWindow) return;
    try {
      localStorage.setItem(tabsStorageKey, JSON.stringify({ activeTabId, tabs }));
    } catch {
      // A session remains usable in memory if WebView storage is unavailable.
    }
  };

  const persistTabs = () => {
    if (windowClosing && !launcherWindow) return;
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
    const sections = SECTION_ORDER.map((id) => {
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
      activeSection
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
  const searchResults = document.getElementById('left-panel-search-results');
  const searchStatus = document.getElementById('left-panel-search-status');
  const tabsList = document.getElementById('left-panel-tabs-list');
  const tabMenu = document.getElementById('left-panel-tab-menu');
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

  const syncActiveTab = () => {
    if (loadedTabId !== activeTabId) return;
    const tab = activeTab();
    if (!tab) return;
    tab.markdown = currentMarkdown();
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
    const existing = uri ? tabs.find((tab) => tab.uri === uri) : null;
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
      next.emptyContentExplicitlyEdited
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
    renderTabs();
    persistTabs();
    requestAnimationFrame(() => {
      switchingTab = false;
    });
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
      tab.emptyContentExplicitlyEdited
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
    renderTabs();
    persistTabs();
    requestAnimationFrame(() => {
      switchingTab = false;
    });
    return tab;
  };

  const openDocument = (uri) => {
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
      row.addEventListener('click', () => openDocument(entry.uri));
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
    searchStatus.textContent = 'Searching approved folders…';
    native.searchLeftPanelFiles(query, Boolean(searchContents?.checked), requestId);
  };

  const renderTabs = () => {
    if (!tabsList) return;
    tabsList.replaceChildren();
    tabs.forEach((tab, index) => {
      const row = document.createElement('div');
      row.className = `left-panel-row${tab.id === activeTabId ? ' selected' : ''}`;
      row.setAttribute('role', 'listitem');
      row.dataset.tabId = tab.id;

      const dragHandle = document.createElement('button');
      dragHandle.type = 'button';
      dragHandle.className = 'left-panel-icon-button left-panel-tab-drag';
      dragHandle.textContent = '⠿';
      dragHandle.setAttribute('aria-label', `Reorder ${tab.name}`);
      dragHandle.addEventListener('pointerdown', (event) => startTabDrag(event, tab.id));
      row.appendChild(dragHandle);

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'left-panel-row-label left-panel-tab-label';
      label.style.cssText = 'border:0;background:transparent;color:inherit;text-align:left;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      label.textContent = `${tab.pinned ? '◆ ' : ''}${tab.name}${tab.dirty ? ' •' : ''}`;
      label.title = tab.name;
      label.addEventListener('click', () => activateTab(tab.id));
      label.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showTabMenu(tab, event.clientX, event.clientY);
      });
      let longPressTimer = null;
      label.addEventListener('pointerdown', (event) => {
        longPressTimer = setTimeout(
          () => showTabMenu(tab, event.clientX, event.clientY),
          550
        );
      });
      for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
        label.addEventListener(eventName, () => {
          if (longPressTimer) clearTimeout(longPressTimer);
          longPressTimer = null;
        });
      }
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
      row.dataset.index = String(index);
      tabsList.appendChild(row);
    });
    requestAnimationFrame(reflowSections);
  };

  let dragState = null;
  const startTabDrag = (event, id) => {
    event.preventDefault();
    dragState = { id, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest?.('[data-tab-id]');
      if (!target || target.dataset.tabId === dragState.id) return;
      const from = tabs.findIndex((tab) => tab.id === dragState.id);
      const to = tabs.findIndex((tab) => tab.id === target.dataset.tabId);
      if (from < 0 || to < 0) return;
      const [tab] = tabs.splice(from, 1);
      tabs.splice(to, 0, tab);
      renderTabs();
    };
    const finish = (finishEvent) => {
      if (finishEvent.pointerId !== dragState?.pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      dragState = null;
      persistTabs();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };

  const hideTabMenu = () => {
    tabMenu?.classList.remove('open');
    tabMenu?.replaceChildren();
  };

  document.addEventListener('pointerdown', (event) => {
    if (!tabMenu?.classList.contains('open')) return;
    if (tabMenu.contains(event.target) || event.target.closest?.('.left-panel-tab-label')) return;
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
    const rect = tabMenu.getBoundingClientRect();
    tabMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    tabMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
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
    native.activateLeftPanelTab?.(
      tab.uri,
      tab.name,
      tab.markdown,
      tab.dirty,
      tab.isTextPack,
      tab.hasBom,
      tab.hasCrlf,
      tab.emptyContentExplicitlyEdited
    );
    activeTabId = tab.id;
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
    wantedExpanded.search = true;
    updateSearchPriority();
    persistPanelState();
    updateSectionVisibility();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 220);
  });
  searchContents?.addEventListener('change', () => {
    wantedExpanded.search = true;
    updateSearchPriority();
    persistPanelState();
    updateSectionVisibility();
    runSearch();
  });
  sectionElements.get('folders')?.querySelector('.left-panel-section-header')
    ?.addEventListener('click', () => {
      if (wantedExpanded.folders) {
        folderRootsLoaded = false;
        loadFolderRoots();
      }
    });

  const storedTabs = parseJson(readStorage(tabsStorageKey), null);
  if (Array.isArray(storedTabs?.tabs) && storedTabs.tabs.length) {
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
        emptyContentExplicitlyEdited: Boolean(savedTab.emptyContentExplicitlyEdited),
        isTextPack: Boolean(savedTab.isTextPack),
        hasBom: Boolean(savedTab.hasBom),
        hasCrlf: Boolean(savedTab.hasCrlf),
        documentSessionId: null
      };
      tabs.push(restoredTab);
      if (restoredTab.uri) restoredTabIds.add(restoredTab.id);
    }
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
    } else if (!current || current.uri !== (context.uri || null)) {
      const existing = context.uri ? tabs.find((tab) => tab.uri === context.uri) : null;
      if (existing) activeTabId = existing.id;
      else {
        const newTab = {
          id: context.uri || `untitled:${Date.now()}`,
          uri: context.uri || null,
          name: context.name || 'Untitled',
          markdown: String(markdown ?? context.markdown ?? ''),
          dirty: Boolean(context.dirty),
          pinned: false,
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
    onSearchResults(requestId, json) {
      if (requestId !== searchRequestId) return;
      const payload = parseBridgeResult(json, []);
      searchResults?.replaceChildren();
      const results = Array.isArray(payload) ? payload : payload?.items || [];
      searchStatus.textContent = results.length
        ? `${results.length} result${results.length === 1 ? '' : 's'}${payload?.truncated ? ' — search limit reached' : ''}`
        : payload?.truncated
          ? 'Search limit reached; no matches found in scanned files.'
          : 'No matches found.';
      results.forEach((result) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'left-panel-row';
        button.setAttribute('role', 'listitem');
        const wrapper = document.createElement('span');
        wrapper.className = 'left-panel-row-label';
        wrapper.textContent = result.name || 'Untitled';
        button.appendChild(wrapper);
        if (result.path) {
          const path = document.createElement('span');
          path.className = 'left-panel-result-path';
          path.textContent = result.path;
          button.appendChild(path);
        }
        button.addEventListener('click', () => openDocument(result.uri));
        searchResults.appendChild(button);
      });
      requestAnimationFrame(reflowSections);
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
      for (const id of SECTION_ORDER) {
        const enabled = prefs?.[`pref_left_panel_${id}_keep_open`] === true;
        if (enabled && !keepOpen[id]) {
          wantedExpanded[id] = true;
        }
        keepOpen[id] = enabled;
      }
      persistPanelState();
      updateSectionVisibility();
      updateToolbarClearance();
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

  let touchStartX = null;
  let touchStartY = null;
  let touchStartTarget = null;
  const resetTouchStart = () => {
    touchStartX = null;
    touchStartY = null;
    touchStartTarget = null;
  };
  const onTouchStart = (event) => {
    if (event.touches?.length !== 1) {
      resetTouchStart();
      return;
    }
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTarget = event.target instanceof Element ? event.target : null;
  };
  const onTouchEnd = (event) => {
    if (touchStartX == null || !event.changedTouches?.length) {
      resetTouchStart();
      return;
    }
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = Math.abs(touch.clientY - touchStartY);
    const isHorizontalSwipe = Math.abs(deltaX) > 60 &&
      Math.abs(deltaX) > deltaY * 1.5;
    const hasSelection = Boolean(window.getSelection?.()?.toString());
    const startedInToolbar = Boolean(
      touchStartTarget?.closest?.('#bottom-toolbar, #popup-toolbar-strip, #floating-selection-toolbar')
    );
    if (!hasSelection && !startedInToolbar && isHorizontalSwipe) {
      if (
        !panel.classList.contains('open') &&
        touchStartX <= window.innerWidth * 0.25 &&
        deltaX > 60
      ) {
        openPanel();
      } else if (
        panel.classList.contains('open') &&
        panel.contains(touchStartTarget) &&
        touchStartX <= Math.min(panel.getBoundingClientRect().right, window.innerWidth * 0.8) &&
        deltaX < -60
      ) {
        closePanel();
      }
    }
    resetTouchStart();
  };
  const touchListenerOptions = { passive: true };
  window.addEventListener('touchstart', onTouchStart, touchListenerOptions);
  window.addEventListener('touchend', onTouchEnd, touchListenerOptions);
  window.addEventListener('touchcancel', resetTouchStart, touchListenerOptions);
  updateToolbarClearance();

  return controller;
}
