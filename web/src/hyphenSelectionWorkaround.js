const HYPHENATION_PROPERTIES = ['hyphens', '-webkit-hyphens'];

function getParagraph(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.('.cm-paragraph') || null;
}

function getAutoHyphenatedParagraph(node) {
  const paragraph = getParagraph(node);
  const win = paragraph?.ownerDocument.defaultView;
  if (!paragraph || !win) return null;

  const style = win.getComputedStyle(paragraph);
  const mayHyphenate =
    style.getPropertyValue('hyphens').trim().toLowerCase() === 'auto' ||
    style.getPropertyValue('-webkit-hyphens').trim().toLowerCase() === 'auto';
  return mayHyphenate ? paragraph : null;
}

export function getHyphenatedParagraphForSelection(range) {
  if (!range || range.collapsed) return null;
  return getAutoHyphenatedParagraph(range.startContainer);
}

function disableHyphenation(paragraph) {
  const style = paragraph.style;
  const previousValues = HYPHENATION_PROPERTIES.map(property => ({
    property,
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property)
  }));

  for (const property of HYPHENATION_PROPERTIES) {
    style.setProperty(property, 'none', 'important');
  }

  return () => {
    for (const { property, value, priority } of previousValues) {
      if (value) style.setProperty(property, value, priority);
      else style.removeProperty(property);
    }
  };
}

export function installHyphenSelectionWorkaround(view) {
  const doc = view?.dom?.ownerDocument;
  const win = doc?.defaultView;
  if (
    !doc ||
    !win ||
    !/Android/i.test(win.navigator?.userAgent || '')
  ) {
    return null;
  }

  let activeParagraph = null;
  let restoreHyphenation = null;
  let pendingParagraph = null;
  let pendingRefreshTimer = null;
  let destroyed = false;

  const setActiveParagraph = nextParagraph => {
    if (nextParagraph === activeParagraph) return;
    restoreHyphenation?.();
    restoreHyphenation = null;
    activeParagraph = nextParagraph;
    if (activeParagraph) {
      restoreHyphenation = disableHyphenation(activeParagraph);
    }
  };

  const refresh = () => {
    if (destroyed) return;
    const selection = doc.getSelection();
    let range = null;
    if (selection?.rangeCount) {
      try {
        const candidate = selection.getRangeAt(0);
        if (view.dom.contains(candidate.commonAncestorContainer)) {
          range = candidate;
        }
      } catch {
        range = null;
      }
    }

    const selectedParagraph =
      getHyphenatedParagraphForSelection(range) ||
      (
        range &&
        !range.collapsed &&
        activeParagraph?.contains(range.startContainer)
          ? activeParagraph
          : null
      );
    setActiveParagraph(
      pendingParagraph || selectedParagraph
    );
  };

  const onPointerDown = event => {
    if (event.pointerType !== 'touch' || !view.dom.contains(event.target)) return;
    pendingParagraph = getAutoHyphenatedParagraph(event.target);
    refresh();
  };
  const onTouchStart = event => {
    if (!view.dom.contains(event.target)) return;
    pendingParagraph = getAutoHyphenatedParagraph(event.target);
    refresh();
  };
  const schedulePendingSelectionRefresh = () => {
    pendingParagraph = null;
    if (pendingRefreshTimer !== null) win.clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = win.setTimeout(() => {
      pendingRefreshTimer = null;
      refresh();
    }, 0);
  };
  const onPointerFinish = event => {
    if (event.pointerType !== 'touch') return;
    schedulePendingSelectionRefresh();
  };

  doc.addEventListener('selectionchange', refresh, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointerup', onPointerFinish, true);
  doc.addEventListener('pointercancel', onPointerFinish, true);
  doc.addEventListener('touchstart', onTouchStart, true);
  doc.addEventListener('touchend', schedulePendingSelectionRefresh, true);
  doc.addEventListener('touchcancel', schedulePendingSelectionRefresh, true);

  return {
    refresh,
    destroy() {
      destroyed = true;
      doc.removeEventListener('selectionchange', refresh, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('pointerup', onPointerFinish, true);
      doc.removeEventListener('pointercancel', onPointerFinish, true);
      doc.removeEventListener('touchstart', onTouchStart, true);
      doc.removeEventListener('touchend', schedulePendingSelectionRefresh, true);
      doc.removeEventListener('touchcancel', schedulePendingSelectionRefresh, true);
      if (pendingRefreshTimer !== null) win.clearTimeout(pendingRefreshTimer);
      pendingRefreshTimer = null;
      pendingParagraph = null;
      setActiveParagraph(null);
    }
  };
}
