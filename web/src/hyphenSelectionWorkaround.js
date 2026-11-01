const NO_AUTO_HYPHENS_CLASS = 'cm-android-selection-no-auto-hyphens';

function paragraphForNode(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.('.cm-paragraph') || null;
}

function autoHyphenatedParagraph(node, view, win) {
  const paragraph = paragraphForNode(node);
  if (!paragraph || !view.dom.contains(paragraph)) return null;

  const style = win.getComputedStyle(paragraph);
  const hyphens = style.getPropertyValue('hyphens').trim().toLowerCase();
  const webkitHyphens = style.getPropertyValue('-webkit-hyphens').trim().toLowerCase();
  return hyphens === 'auto' || webkitHyphens === 'auto' ? paragraph : null;
}

export function installHyphenSelectionWorkaround(view) {
  const editor = view?.dom;
  const doc = editor?.ownerDocument;
  const win = doc?.defaultView;
  if (!editor || !win || !/Android/i.test(win.navigator?.userAgent || '')) {
    return null;
  }

  let activeParagraph = null;
  let restoreActiveParagraph = null;
  let pendingParagraph = null;
  let pendingRefreshTimer = null;
  let destroyed = false;

  const setActiveParagraph = paragraph => {
    if (paragraph === activeParagraph) return;
    restoreActiveParagraph?.();
    restoreActiveParagraph = null;
    activeParagraph = paragraph;
    if (!activeParagraph) return;

    const alreadyMarked = activeParagraph.classList.contains(NO_AUTO_HYPHENS_CLASS);
    activeParagraph.classList.add(NO_AUTO_HYPHENS_CLASS);
    restoreActiveParagraph = () => {
      if (!alreadyMarked) activeParagraph?.classList.remove(NO_AUTO_HYPHENS_CLASS);
    };

    // Recalculate this paragraph before Android computes its native selection handles.
    void win.getComputedStyle(activeParagraph).hyphens;
    void activeParagraph.getBoundingClientRect().height;
  };

  const selectedParagraph = () => {
    const selection = doc.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;

    try {
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return null;
      return autoHyphenatedParagraph(range.startContainer, view, win);
    } catch {
      return null;
    }
  };

  const refresh = () => {
    if (!destroyed) setActiveParagraph(pendingParagraph || selectedParagraph());
  };

  const beginTouchSelection = event => {
    if (!editor.contains(event.target)) return;
    pendingParagraph = autoHyphenatedParagraph(event.target, view, win);
    refresh();
  };

  const scheduleSelectionRefresh = () => {
    pendingParagraph = null;
    if (pendingRefreshTimer !== null) win.clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = win.setTimeout(() => {
      pendingRefreshTimer = null;
      refresh();
    }, 0);
  };

  const onPointerDown = event => {
    if (event.pointerType === 'touch') beginTouchSelection(event);
  };
  const onPointerFinish = event => {
    if (event.pointerType === 'touch') scheduleSelectionRefresh();
  };

  doc.addEventListener('selectionchange', refresh, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointerup', onPointerFinish, true);
  doc.addEventListener('pointercancel', onPointerFinish, true);
  doc.addEventListener('touchstart', beginTouchSelection, true);
  doc.addEventListener('touchend', scheduleSelectionRefresh, true);
  doc.addEventListener('touchcancel', scheduleSelectionRefresh, true);

  return {
    refresh,
    destroy() {
      destroyed = true;
      doc.removeEventListener('selectionchange', refresh, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('pointerup', onPointerFinish, true);
      doc.removeEventListener('pointercancel', onPointerFinish, true);
      doc.removeEventListener('touchstart', beginTouchSelection, true);
      doc.removeEventListener('touchend', scheduleSelectionRefresh, true);
      doc.removeEventListener('touchcancel', scheduleSelectionRefresh, true);
      if (pendingRefreshTimer !== null) win.clearTimeout(pendingRefreshTimer);
      pendingRefreshTimer = null;
      pendingParagraph = null;
      setActiveParagraph(null);
    }
  };
}
