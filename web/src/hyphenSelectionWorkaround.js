const HYPHEN_MAX_EM = 0.6;
const HYPHEN_ADJACENCY_PX = 2;
const HANDLE_LAYER_CLASS = 'wmdx-hyphen-selection-handle-layer';

function getParagraph(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.('.cm-paragraph') || null;
}

export function isRangeStartAtParagraphStart(range) {
  const paragraph = getParagraph(range?.startContainer);
  if (!paragraph) return false;

  const probe = paragraph.ownerDocument.createRange();
  try {
    probe.selectNodeContents(paragraph);
    probe.setEnd(range.startContainer, range.startOffset);
  } catch {
    return false;
  }
  return probe.toString().trim().length === 0;
}

export function hasTrailingHyphenRectPattern(rects, emPx, vertical = false) {
  for (let index = 1; index < rects.length; index += 1) {
    const previous = rects[index - 1];
    const current = rects[index];
    const sameLine = vertical
      ? Math.abs(previous.left - current.left) < Math.max(previous.width, current.width) / 2
      : Math.abs(previous.top - current.top) < Math.max(previous.height, current.height) / 2;
    if (!sameLine) continue;

    const adjacent = vertical
      ? Math.abs(current.top - (previous.top + previous.height)) <= HYPHEN_ADJACENCY_PX
      : Math.abs(current.left - (previous.left + previous.width)) <= HYPHEN_ADJACENCY_PX ||
        Math.abs(previous.left - (current.left + current.width)) <= HYPHEN_ADJACENCY_PX;
    if (!adjacent) continue;

    const size = vertical ? current.height : current.width;
    if (size > 0 && size <= emPx * HYPHEN_MAX_EM) return true;
  }
  return false;
}

function paragraphHasRenderedHyphens(paragraph, vertical) {
  const doc = paragraph.ownerDocument;
  const view = doc.defaultView;
  const fontSize = Number.parseFloat(view?.getComputedStyle(paragraph).fontSize) || 16;
  const walker = doc.createTreeWalker(paragraph, view.NodeFilter.SHOW_TEXT);
  const probe = doc.createRange();
  let node = walker.nextNode();

  while (node) {
    if (node.data.trim()) {
      try {
        probe.selectNodeContents(node);
        if (hasTrailingHyphenRectPattern(
          Array.from(probe.getClientRects()),
          fontSize,
          vertical
        )) {
          return true;
        }
      } catch {
        return false;
      }
    }
    node = walker.nextNode();
  }
  return false;
}

export function isHyphenHandleBugProneRange(range, vertical = false) {
  if (!range || range.collapsed) return false;
  const paragraph = getParagraph(range.startContainer);
  const view = paragraph?.ownerDocument.defaultView;
  if (!paragraph || !view || !isRangeStartAtParagraphStart(range)) return false;

  const style = view.getComputedStyle(paragraph);
  const text = paragraph.textContent || '';
  const mayHyphenate =
    style.getPropertyValue('hyphens') === 'auto' ||
    style.getPropertyValue('-webkit-hyphens') === 'auto' ||
    text.includes('\u00ad');
  if (!mayHyphenate) return false;

  return text.includes('\u00ad') || paragraphHasRenderedHyphens(paragraph, vertical);
}

export function repairJumpedSelectionRange(selection, initialNode, initialOffset) {
  if (!selection?.rangeCount || !initialNode?.isConnected) return null;
  const currentRange = selection.getRangeAt(0);
  const focusNode = selection.focusNode;
  const focusOffset = selection.focusOffset;
  const doc = currentRange.startContainer.ownerDocument;
  if (!focusNode || !doc) return null;

  try {
    if (currentRange.comparePoint(initialNode, initialOffset) === 0) return null;

    const initialPoint = doc.createRange();
    initialPoint.setStart(initialNode, initialOffset);
    initialPoint.collapse(true);
    const focusPoint = doc.createRange();
    focusPoint.setStart(focusNode, focusOffset);
    focusPoint.collapse(true);

    const repaired = doc.createRange();
    if (
      initialPoint.compareBoundaryPoints(
        doc.defaultView.Range.START_TO_START,
        focusPoint
      ) <= 0
    ) {
      repaired.setStart(initialNode, initialOffset);
      repaired.setEnd(focusNode, focusOffset);
    } else {
      repaired.setStart(focusNode, focusOffset);
      repaired.setEnd(initialNode, initialOffset);
    }
    return repaired.collapsed ? null : repaired;
  } catch {
    return null;
  }
}

function getElement(target) {
  return target?.nodeType === 1 ? target : target?.parentElement;
}

function nextFrame(win) {
  return new Promise(resolve => win.requestAnimationFrame(resolve));
}

function getSelectionPositions(view, selection) {
  if (!selection?.anchorNode || !selection.focusNode) return null;
  try {
    return {
      anchor: view.posAtDOM(selection.anchorNode, selection.anchorOffset),
      head: view.posAtDOM(selection.focusNode, selection.focusOffset)
    };
  } catch {
    return null;
  }
}

export function installHyphenSelectionWorkaround(view, editorSelection) {
  const doc = view?.dom?.ownerDocument;
  const win = doc?.defaultView;
  const root = view?.dom?.closest?.('#editor-container') || view?.dom?.parentElement;
  if (
    !doc ||
    !win ||
    !root ||
    typeof editorSelection?.range !== 'function' ||
    !/Android/i.test(win.navigator?.userAgent || '')
  ) {
    return null;
  }

  const layer = doc.createElement('div');
  layer.className = HANDLE_LAYER_CLASS;
  layer.hidden = true;
  const anchorHandle = doc.createElement('button');
  const headHandle = doc.createElement('button');
  for (const [handle, label, endpoint] of [
    [anchorHandle, 'Adjust selection start', 'anchor'],
    [headHandle, 'Adjust selection end', 'head']
  ]) {
    handle.type = 'button';
    handle.className = 'wmdx-hyphen-selection-handle';
    handle.setAttribute('aria-label', label);
    handle.dataset.selectionEndpoint = endpoint;
    layer.appendChild(handle);
  }
  root.appendChild(layer);

  let gestureActive = false;
  let gestureEndScheduled = false;
  let initialSelection = null;
  let customHandlesActive = false;
  let suppressingNativeHandles = false;
  let programmaticSelectionTimer = null;
  let anchorPosition = null;
  let headPosition = null;
  let draggingEndpoint = null;
  let draggingPointerId = null;
  let destroyed = false;
  let refreshFrame = 0;

  const isValidSelection = selection =>
    Boolean(selection?.rangeCount && !selection.isCollapsed);

  const hideHandles = () => {
    layer.hidden = true;
  };

  const deactivateCustomHandles = () => {
    customHandlesActive = false;
    anchorPosition = null;
    headPosition = null;
    draggingEndpoint = null;
    draggingPointerId = null;
    hideHandles();
  };

  const positionHandle = (handle, coords, rootRect) => {
    if (!coords) {
      handle.hidden = true;
      return;
    }
    handle.hidden = false;
    handle.style.left = `${coords.left - rootRect.left}px`;
    handle.style.top = `${coords.bottom - rootRect.top}px`;
  };

  const refresh = () => {
    if (destroyed || !customHandlesActive || suppressingNativeHandles) return;
    const selection = view.state?.selection?.main;
    if (!selection) return;
    if (!selection.empty) {
      anchorPosition = selection.anchor;
      headPosition = selection.head;
    } else if (!isValidSelection(doc.getSelection())) {
      deactivateCustomHandles();
      return;
    }
    if (anchorPosition == null || headPosition == null) return;
    let anchorCoords;
    let headCoords;
    try {
      anchorCoords = view.coordsAtPos(anchorPosition);
      headCoords = view.coordsAtPos(headPosition);
    } catch {
      hideHandles();
      return;
    }
    if (!anchorCoords || !headCoords) {
      hideHandles();
      return;
    }

    const rootRect = root.getBoundingClientRect();
    layer.hidden = false;
    positionHandle(anchorHandle, anchorCoords, rootRect);
    positionHandle(headHandle, headCoords, rootRect);
  };

  const scheduleRefresh = () => {
    if (refreshFrame || destroyed) return;
    refreshFrame = win.requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  };

  const syncEditorSelection = selection => {
    const positions = getSelectionPositions(view, selection);
    if (!positions) return null;
    const current = view.state.selection.main;
    if (current.anchor !== positions.anchor || current.head !== positions.head) {
      view.dispatch({
        selection: editorSelection.range(positions.anchor, positions.head),
        userEvent: 'select.pointer'
      });
    }
    return positions;
  };

  const activateCustomHandles = async initial => {
    const selection = doc.getSelection();
    if (!isValidSelection(selection)) return;

    const focusNode = selection.focusNode;
    const focusOffset = selection.focusOffset;
    const repaired = repairJumpedSelectionRange(
      selection,
      initial.node,
      initial.offset
    );
    if (repaired && focusNode) {
      try {
        selection.setBaseAndExtent(
          initial.node,
          initial.offset,
          focusNode,
          focusOffset
        );
      } catch {
        return;
      }
    }

    let positions = syncEditorSelection(selection);
    if (!positions) return;
    const saved = {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset
    };
    if (
      !saved.anchorNode ||
      !saved.focusNode ||
      saved.anchorNode.isConnected === false ||
      saved.focusNode.isConnected === false
    ) {
      return;
    }

    suppressingNativeHandles = true;
    selection.removeAllRanges();
    await nextFrame(win);
    await nextFrame(win);
    if (destroyed || !view.dom.isConnected) {
      suppressingNativeHandles = false;
      return;
    }

    const currentSelection = doc.getSelection();
    if (currentSelection?.rangeCount) {
      const sameSelection =
        currentSelection.anchorNode === saved.anchorNode &&
        currentSelection.anchorOffset === saved.anchorOffset &&
        currentSelection.focusNode === saved.focusNode &&
        currentSelection.focusOffset === saved.focusOffset;
      if (!sameSelection) {
        suppressingNativeHandles = false;
        return;
      }
    } else {
      try {
        currentSelection?.setBaseAndExtent(
          saved.anchorNode,
          saved.anchorOffset,
          saved.focusNode,
          saved.focusOffset
        );
      } catch {
        suppressingNativeHandles = false;
        return;
      }
    }

    positions = syncEditorSelection(currentSelection);
    if (!positions) {
      suppressingNativeHandles = false;
      return;
    }
    anchorPosition = positions.anchor;
    headPosition = positions.head;
    customHandlesActive = true;
    suppressingNativeHandles = false;
    if (programmaticSelectionTimer !== null) {
      win.clearTimeout(programmaticSelectionTimer);
    }
    programmaticSelectionTimer = win.setTimeout(() => {
      programmaticSelectionTimer = null;
    }, 150);
    refresh();
  };

  const finishTouchGesture = () => {
    if (!gestureActive || gestureEndScheduled) return;
    gestureEndScheduled = true;
    win.setTimeout(() => {
      gestureEndScheduled = false;
      gestureActive = false;
      const initial = initialSelection;
      initialSelection = null;
      if (!customHandlesActive && initial?.prone) {
        activateCustomHandles(initial);
      }
    }, 32);
  };

  const onPointerDown = event => {
    const target = getElement(event.target);
    if (target?.closest?.(`.${HANDLE_LAYER_CLASS}`)) return;
    if (!view.dom.contains(target)) return;
    if (customHandlesActive) deactivateCustomHandles();
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    gestureActive = true;
    gestureEndScheduled = false;
    initialSelection = null;
  };

  const onTouchStart = event => {
    if (!view.dom.contains(getElement(event.target))) return;
    if (customHandlesActive) deactivateCustomHandles();
    if (!gestureActive) {
      gestureActive = true;
      gestureEndScheduled = false;
      initialSelection = null;
    }
  };

  const onSelectionChange = () => {
    if (destroyed || suppressingNativeHandles || programmaticSelectionTimer !== null) return;
    const selection = doc.getSelection();

    if (customHandlesActive) {
      if (!isValidSelection(selection)) {
        deactivateCustomHandles();
      } else {
        scheduleRefresh();
      }
      return;
    }

    if (!gestureActive || initialSelection || !isValidSelection(selection)) return;
    let range;
    try {
      range = selection.getRangeAt(0);
    } catch {
      return;
    }
    if (!view.dom.contains(getElement(range.commonAncestorContainer))) return;
    if (!isHyphenHandleBugProneRange(range)) return;
    initialSelection = {
      node: selection.anchorNode,
      offset: selection.anchorOffset,
      prone: true
    };
  };

  const updateFromPoint = (event, endpoint) => {
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position == null) return;
    const selection = view.state.selection.main;
    const currentAnchor = selection.empty ? anchorPosition : selection.anchor;
    const currentHead = selection.empty ? headPosition : selection.head;
    if (currentAnchor == null || currentHead == null) return;
    const anchor = endpoint === 'anchor' ? position : currentAnchor;
    const head = endpoint === 'head' ? position : currentHead;
    if (anchor === head) return;
    view.dispatch({
      selection: editorSelection.range(anchor, head),
      userEvent: 'select.pointer'
    });
    anchorPosition = anchor;
    headPosition = head;
    refresh();
  };

  for (const handle of [anchorHandle, headHandle]) {
    handle.addEventListener('pointerdown', event => {
      if (!customHandlesActive || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      draggingEndpoint = handle.dataset.selectionEndpoint;
      draggingPointerId = event.pointerId;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Window-level pointer listeners still handle older WebView versions.
      }
    });
  }

  const onPointerMove = event => {
    if (!draggingEndpoint || event.pointerId !== draggingPointerId) return;
    event.preventDefault();
    updateFromPoint(event, draggingEndpoint);
  };

  const onPointerUp = event => {
    if (draggingEndpoint && event.pointerId === draggingPointerId) {
      draggingEndpoint = null;
      draggingPointerId = null;
      refresh();
      return;
    }
    finishTouchGesture();
  };

  const onTouchEnd = () => finishTouchGesture();
  const onScroll = () => scheduleRefresh();
  const onResize = () => scheduleRefresh();

  view.dom.addEventListener('pointerdown', onPointerDown, true);
  view.dom.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  doc.addEventListener('selectionchange', onSelectionChange, true);
  win.addEventListener('pointermove', onPointerMove, true);
  win.addEventListener('pointerup', onPointerUp, true);
  win.addEventListener('touchend', onTouchEnd, true);
  win.addEventListener('resize', onResize, { passive: true });
  win.visualViewport?.addEventListener('resize', onResize, { passive: true });
  view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

  return {
    refresh: scheduleRefresh,
    destroy() {
      destroyed = true;
      view.dom.removeEventListener('pointerdown', onPointerDown, true);
      view.dom.removeEventListener('touchstart', onTouchStart, true);
      doc.removeEventListener('selectionchange', onSelectionChange, true);
      win.removeEventListener('pointermove', onPointerMove, true);
      win.removeEventListener('pointerup', onPointerUp, true);
      win.removeEventListener('touchend', onTouchEnd, true);
      win.removeEventListener('resize', onResize);
      win.visualViewport?.removeEventListener('resize', onResize);
      view.scrollDOM.removeEventListener('scroll', onScroll);
      if (programmaticSelectionTimer !== null) {
        win.clearTimeout(programmaticSelectionTimer);
      }
      if (refreshFrame) win.cancelAnimationFrame(refreshFrame);
      layer.remove();
    }
  };
}
