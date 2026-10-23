const MAX_LINE_PREVIEW = 400;
const BATCH_SIZE = 40;
const FLUSH_DELAY_MS = 100;
const SCROLL_SNAPSHOT_INTERVAL_MS = 1000;

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function describeElement(element) {
  if (!element || element.nodeType !== 1) return null;
  return {
    tag: element.tagName?.toLowerCase() || null,
    id: element.id || null,
    className: typeof element.className === 'string' ? element.className.slice(0, 180) : null,
    role: element.getAttribute?.('role') || null,
    contentEditable: element.isContentEditable
  };
}

function rectSnapshot(rect) {
  if (!rect) return null;
  return {
    x: round(rect.x),
    y: round(rect.y),
    top: round(rect.top),
    right: round(rect.right),
    bottom: round(rect.bottom),
    left: round(rect.left),
    width: round(rect.width),
    height: round(rect.height)
  };
}

function renderedRowSnapshot(view, position, win) {
  try {
    const located = view.domAtPos(position, 1);
    let element = located.node?.nodeType === 1 ? located.node : located.node?.parentElement;
    const row = element?.closest?.('.cm-line');
    if (!row) return null;

    const style = win.getComputedStyle(row);
    const rows = [];
    let cursor = row;
    for (let index = 0; cursor && index < 3; index++) {
      if (cursor.classList?.contains('cm-line')) {
        rows.push({
          relation: index === 0 ? 'current' : 'next',
          className: String(cursor.className || '').slice(0, 180),
          text: String(cursor.textContent || '').slice(0, MAX_LINE_PREVIEW),
          rect: rectSnapshot(cursor.getBoundingClientRect())
        });
      }
      cursor = cursor.nextElementSibling;
    }
    cursor = row.previousElementSibling;
    for (let index = 0; cursor && index < 2; index++) {
      if (cursor.classList?.contains('cm-line')) {
        rows.push({
          relation: 'previous',
          className: String(cursor.className || '').slice(0, 180),
          text: String(cursor.textContent || '').slice(0, MAX_LINE_PREVIEW),
          rect: rectSnapshot(cursor.getBoundingClientRect())
        });
      }
      cursor = cursor.previousElementSibling;
    }

    return {
      className: String(row.className || '').slice(0, 180),
      rect: rectSnapshot(row.getBoundingClientRect()),
      style: {
        display: style.display,
        position: style.position,
        lineHeight: style.lineHeight,
        fontSize: style.fontSize,
        transform: style.transform,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom
      },
      rows
    };
  } catch (_) {
    return null;
  }
}

export function captureNavigationState(view, win = window) {
  try {
    const state = view?.state;
    const doc = state?.doc;
    const selection = state?.selection?.main;
    const head = selection?.head ?? null;
    const anchor = selection?.anchor ?? null;
    const headLine = head == null || !doc ? null : doc.lineAt(head);
    const anchorLine = anchor == null || !doc ? null : doc.lineAt(anchor);
    const scroller = view?.scrollDOM;
    const content = view?.contentDOM;
    const editor = view?.dom;
    const activeElement = editor?.ownerDocument?.activeElement;
    const visualViewport = win.visualViewport;
    const caret = head == null ? null : view.coordsAtPos(head);
    const contentRect = content?.getBoundingClientRect?.();
    const editorRect = editor?.getBoundingClientRect?.();
    const scrollerRect = scroller?.getBoundingClientRect?.();
    const caretLine = headLine ? headLine.number : null;
    const around = [];
    if (doc && caretLine != null) {
      for (const number of [caretLine - 1, caretLine, caretLine + 1]) {
        if (number >= 1 && number <= doc.lines) {
          const line = doc.line(number);
          around.push({
            number,
            from: line.from,
            to: line.to,
            text: line.text.slice(0, MAX_LINE_PREVIEW)
          });
        }
      }
    }

    let computed = null;
    try {
      const styleTarget = editor?.querySelector?.('.cm-line');
      if (styleTarget) {
        const style = win.getComputedStyle(styleTarget);
        computed = {
          lineHeight: style.lineHeight,
          fontSize: style.fontSize,
          transform: style.transform,
          display: style.display
        };
      }
    } catch (_) {
      computed = null;
    }

    return {
      docLength: doc?.length ?? null,
      docLines: doc?.lines ?? null,
      selection: selection ? {
        anchor,
        head,
        empty: selection.empty,
        from: selection.from,
        to: selection.to,
        headLine: headLine?.number ?? null,
        anchorLine: anchorLine?.number ?? null,
        rangeCount: state.selection.ranges.length,
        headLineText: headLine?.text.slice(0, MAX_LINE_PREVIEW) ?? null,
        anchorLineText: anchorLine?.text.slice(0, MAX_LINE_PREVIEW) ?? null,
        headCoords: caret ? {
          top: round(caret.top),
          bottom: round(caret.bottom),
          left: round(caret.left),
          right: round(caret.right)
        } : null,
        renderedRow: head == null ? null : renderedRowSnapshot(view, head, win),
        linesAroundHead: around
      } : null,
      scroll: scroller ? {
        top: round(scroller.scrollTop),
        left: round(scroller.scrollLeft),
        height: scroller.scrollHeight,
        width: scroller.scrollWidth,
        clientHeight: scroller.clientHeight,
        clientWidth: scroller.clientWidth,
        rect: rectSnapshot(scrollerRect)
      } : null,
      editorRect: rectSnapshot(editorRect),
      contentRect: rectSnapshot(contentRect),
      window: {
        scrollX: round(win.scrollX),
        scrollY: round(win.scrollY),
        innerWidth: win.innerWidth,
        innerHeight: win.innerHeight,
        devicePixelRatio: win.devicePixelRatio ?? null,
        visibility: editor?.ownerDocument?.visibilityState ?? null,
        activeElement: describeElement(activeElement),
        visualViewport: visualViewport ? {
          width: round(visualViewport.width),
          height: round(visualViewport.height),
          offsetLeft: round(visualViewport.offsetLeft),
          offsetTop: round(visualViewport.offsetTop),
          pageLeft: round(visualViewport.pageLeft),
          pageTop: round(visualViewport.pageTop),
          scale: round(visualViewport.scale)
        } : null
      },
      computed
    };
  } catch (error) {
    return { snapshotError: String(error?.message || error).slice(0, 240) };
  }
}

export function setupFullNavigationCapture(view) {
  const editor = view?.dom;
  const doc = editor?.ownerDocument;
  const win = doc?.defaultView;
  const scroller = view?.scrollDOM;
  if (!editor || !doc || !win) return () => {};

  let sequence = 0;
  let queue = [];
  let flushTimer = null;
  let scrollEndTimer = null;
  let lastScrollSnapshotAt = -Infinity;
  const previousScrollTops = new WeakMap();
  const activePointerIds = new Set();
  let disposed = false;

  const now = () => Math.round(win.performance?.now?.() ?? Date.now());
  const bridge = () => win.AndroidNative;
  const isEditorTarget = (target) => target === editor || editor.contains(target);

  const flush = () => {
    if (disposed || !queue.length) return;
    if (flushTimer) {
      win.clearTimeout(flushTimer);
      flushTimer = null;
    }
    const native = bridge();
    if (native && typeof native.reportNavigationTraceBatch === 'function') {
      while (queue.length) {
        const batch = queue.splice(0, BATCH_SIZE);
        try {
          native.reportNavigationTraceBatch(JSON.stringify(batch));
        } catch (_) {
          queue = batch.concat(queue);
          break;
        }
      }
    } else if (native && typeof native.reportNavigationTrace === 'function') {
      const batch = queue.splice(0, BATCH_SIZE);
      for (const record of batch) {
        try {
          native.reportNavigationTrace(JSON.stringify(record));
        } catch (_) {
          queue.unshift(record);
          break;
        }
      }
    }
    if (queue.length && !flushTimer) {
      flushTimer = win.setTimeout(flush, FLUSH_DELAY_MS);
    }
  };

  const enqueue = (kind, data = {}) => {
    const record = {
      schema: 1,
      seq: ++sequence,
      elapsedMs: now(),
      wallTimeMs: Date.now(),
      kind,
      ...data,
      state: captureNavigationState(view, win)
    };
    queue.push(record);
    if (queue.length >= BATCH_SIZE) flush();
    else if (!flushTimer) flushTimer = win.setTimeout(flush, FLUSH_DELAY_MS);
    return record.seq;
  };

  const requestWindowSnapshot = (reason, urgent = false) => {
    const at = now();
    const minimumInterval = urgent ? 300 : SCROLL_SNAPSHOT_INTERVAL_MS;
    if (at - lastScrollSnapshotAt < minimumInterval) return;
    lastScrollSnapshotAt = at;
    enqueue('window_snapshot_requested', { reason });
    try {
      bridge()?.captureDiagnosticSnapshot?.(String(reason).slice(0, 100));
    } catch (_) {
      enqueue('window_snapshot_request_error', { reason });
    }
  };

  const keyHandler = (phase) => (event) => {
    if (!isEditorTarget(event.target) && !view.hasFocus) return;
    const eventId = enqueue(`key_${phase}`, {
      key: String(event.key || '').slice(0, 40),
      code: String(event.code || '').slice(0, 40),
      keyCode: Number.isFinite(event.keyCode) ? event.keyCode : null,
      repeat: Boolean(event.repeat),
      isComposing: Boolean(event.isComposing),
      defaultPreventedAtCapture: Boolean(event.defaultPrevented),
      altKey: Boolean(event.altKey),
      ctrlKey: Boolean(event.ctrlKey),
      metaKey: Boolean(event.metaKey),
      shiftKey: Boolean(event.shiftKey),
      target: describeElement(event.target)
    });
    if (phase === 'down' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const before = captureNavigationState(view, win);
      const raf = win.requestAnimationFrame || ((callback) => win.setTimeout(callback, 16));
      raf(() => {
        const afterRaf = captureNavigationState(view, win);
        enqueue('key_result', { eventId, phase: 'animation_frame', before, after: afterRaf });
        const beforeLine = before.selection?.headLine;
        const afterLine = afterRaf.selection?.headLine;
        const delta = Number.isFinite(beforeLine) && Number.isFinite(afterLine)
          ? afterLine - beforeLine
          : null;
        if (delta != null && Math.abs(delta) > 1) {
          requestWindowSnapshot(`arrow-line-jump-${delta}`, true);
        }
        win.setTimeout(() => {
          enqueue('key_result', {
            eventId,
            phase: '50ms',
            before,
            after: captureNavigationState(view, win)
          });
        }, 50);
      });
    }
  };

  const onPointer = (event) => {
    if (!isEditorTarget(event.target) && !activePointerIds.has(event.pointerId)) return;
    if (event.type === 'pointerdown') activePointerIds.add(event.pointerId);
    enqueue(event.type, {
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      pointerType: String(event.pointerType || 'unknown'),
      x: round(event.clientX),
      y: round(event.clientY),
      screenX: round(event.screenX),
      screenY: round(event.screenY),
      buttons: Number.isFinite(event.buttons) ? event.buttons : null,
      pressure: round(event.pressure),
      target: describeElement(event.target)
    });
    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      activePointerIds.delete(event.pointerId);
    }
  };

  const onTouch = (event) => {
    if (!isEditorTarget(event.target)) return;
    const touches = Array.from(event.changedTouches || []).slice(0, 4).map((touch) => ({
      identifier: touch.identifier,
      x: round(touch.clientX),
      y: round(touch.clientY),
      screenX: round(touch.screenX),
      screenY: round(touch.screenY),
      force: round(touch.force)
    }));
    enqueue(event.type, {
      touches,
      target: describeElement(event.target),
      cancelable: Boolean(event.cancelable),
      defaultPrevented: Boolean(event.defaultPrevented)
    });
  };

  const onScroll = (event) => {
    const target = event.target;
    const targetElement = target === doc ? doc.documentElement : target;
    const scrollKey = targetElement && typeof targetElement === 'object' ? targetElement : win;
    const currentTop = Number.isFinite(targetElement?.scrollTop)
      ? targetElement.scrollTop
      : (target === win ? win.scrollY : null);
    const previousTop = previousScrollTops.get(scrollKey);
    const deltaTop = Number.isFinite(currentTop) && Number.isFinite(previousTop)
      ? currentTop - previousTop
      : null;
    const targetScrollHeight = Number.isFinite(targetElement?.scrollHeight)
      ? targetElement.scrollHeight
      : null;
    enqueue('scroll', {
      target: target === win || target === doc ? 'page' : describeElement(target),
      scrollTop: round(currentTop),
      deltaTop: round(deltaTop),
      scrollLeft: round(targetElement?.scrollLeft),
      scrollHeight: targetScrollHeight,
      clientHeight: targetElement?.clientHeight ?? null,
      trusted: Boolean(event.isTrusted)
    });
    if (Number.isFinite(currentTop)) previousScrollTops.set(scrollKey, currentTop);

    if (Math.abs(deltaTop || 0) >= 300) {
      requestWindowSnapshot('large-scroll-delta', true);
    }

    if (scrollEndTimer) win.clearTimeout(scrollEndTimer);
    scrollEndTimer = win.setTimeout(() => {
      enqueue('scroll_idle');
      requestWindowSnapshot('scroll-idle');
    }, 250);
  };

  const onSelectionChange = () => {
    if (!view.hasFocus && !isEditorTarget(doc.activeElement)) return;
    enqueue('selectionchange');
  };

  const onViewport = (event) => {
    enqueue(event.type, {
      viewport: {
        innerWidth: win.innerWidth,
        innerHeight: win.innerHeight,
        outerWidth: win.outerWidth,
        outerHeight: win.outerHeight,
        devicePixelRatio: win.devicePixelRatio ?? null
      }
    });
  };

  const onWheel = (event) => {
    if (!isEditorTarget(event.target)) return;
    enqueue('wheel', {
      deltaX: round(event.deltaX),
      deltaY: round(event.deltaY),
      deltaZ: round(event.deltaZ),
      deltaMode: event.deltaMode,
      x: round(event.clientX),
      y: round(event.clientY),
      target: describeElement(event.target)
    });
  };

  const onVisibility = () => {
    enqueue('visibilitychange', { visibility: doc.visibilityState });
  };

  const onError = (event) => {
    enqueue('window_error', {
      message: String(event.message || '').slice(0, 500),
      filename: String(event.filename || '').slice(-180),
      line: event.lineno || null,
      column: event.colno || null
    });
  };

  const onUnhandledRejection = (event) => {
    enqueue('unhandledrejection', {
      reason: String(event.reason?.stack || event.reason || '').slice(0, 1000)
    });
  };

  const onKeyDown = keyHandler('down');
  const onKeyUp = keyHandler('up');
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('keyup', onKeyUp, true);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    win.addEventListener(type, onPointer, true);
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    win.addEventListener(type, onTouch, { capture: true, passive: true });
  }
  const seenScrollEvents = new WeakSet();
  const deduplicatedScrollHandler = (event) => {
    if (seenScrollEvents.has(event)) return;
    seenScrollEvents.add(event);
    onScroll(event);
  };
  doc.addEventListener('scroll', deduplicatedScrollHandler, true);
  scroller?.addEventListener('scroll', deduplicatedScrollHandler, { passive: true });
  win.addEventListener('scroll', deduplicatedScrollHandler, { passive: true });
  doc.addEventListener('wheel', onWheel, { capture: true, passive: true });
  doc.addEventListener('selectionchange', onSelectionChange, true);
  doc.addEventListener('visibilitychange', onVisibility);
  const focusHandlers = [];
  for (const type of ['focusin', 'focusout']) {
    const handler = (event) => {
      enqueue(type, { target: describeElement(event.target), relatedTarget: describeElement(event.relatedTarget) });
    };
    focusHandlers.push([type, handler]);
    editor.addEventListener(type, handler, true);
  }
  const viewportHandlers = [];
  for (const type of ['resize', 'pageshow', 'pagehide', 'focus', 'blur']) {
    viewportHandlers.push(type);
    win.addEventListener(type, onViewport, true);
  }
  win.visualViewport?.addEventListener('resize', onViewport);
  win.visualViewport?.addEventListener('scroll', onViewport);
  win.addEventListener('error', onError, true);
  win.addEventListener('unhandledrejection', onUnhandledRejection);

  let resizeObserver = null;
  if (typeof win.ResizeObserver === 'function') {
    resizeObserver = new win.ResizeObserver((entries) => {
      enqueue('resize_observer', {
        entries: entries.slice(0, 8).map((entry) => ({
          target: describeElement(entry.target),
          contentRect: rectSnapshot(entry.contentRect),
          borderBoxSize: Array.from(entry.borderBoxSize || []).slice(0, 2).map((box) => ({
            inlineSize: round(box.inlineSize),
            blockSize: round(box.blockSize)
          }))
        }))
      });
    });
    for (const element of [editor, view.contentDOM, scroller]) {
      if (element) resizeObserver.observe(element);
    }
  }

  let mutationObserver = null;
  if (typeof win.MutationObserver === 'function') {
    let mutationScheduled = false;
    let pendingMutationRecords = 0;
    let pendingMutationCounts = {};
    let firstMutationTarget = null;
    const mutationObserverCallback = (records) => {
      pendingMutationRecords += records.length;
      for (const record of records) {
        pendingMutationCounts[record.type] = (pendingMutationCounts[record.type] || 0) + 1;
      }
      const first = records[0];
      if (!firstMutationTarget && first) {
        firstMutationTarget = describeElement(
          first.target?.nodeType === 1 ? first.target : first.target?.parentElement
        );
      }
      if (mutationScheduled) return;
      mutationScheduled = true;
      const raf = win.requestAnimationFrame || ((callback) => win.setTimeout(callback, 16));
      raf(() => {
        mutationScheduled = false;
        enqueue('dom_mutation_batch', {
          counts: pendingMutationCounts,
          recordCount: pendingMutationRecords,
          firstTarget: firstMutationTarget
        });
        pendingMutationRecords = 0;
        pendingMutationCounts = {};
        firstMutationTarget = null;
      });
    };
    mutationObserver = new win.MutationObserver(mutationObserverCallback);
    mutationObserver.observe(editor, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'contenteditable']
    });
  }

  enqueue('capture_started', {
    userAgent: String(win.navigator?.userAgent || '').slice(0, 300),
    editor: describeElement(editor)
  });

  const dispose = () => {
    if (disposed) return;
    enqueue('capture_stopped');
    flush();
    disposed = true;
    if (flushTimer) win.clearTimeout(flushTimer);
    if (scrollEndTimer) win.clearTimeout(scrollEndTimer);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('keyup', onKeyUp, true);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      win.removeEventListener(type, onPointer, true);
    }
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      win.removeEventListener(type, onTouch, true);
    }
    doc.removeEventListener('scroll', deduplicatedScrollHandler, true);
    scroller?.removeEventListener('scroll', deduplicatedScrollHandler);
    win.removeEventListener('scroll', deduplicatedScrollHandler);
    doc.removeEventListener('wheel', onWheel, true);
    doc.removeEventListener('selectionchange', onSelectionChange, true);
    doc.removeEventListener('visibilitychange', onVisibility);
    for (const [type, handler] of focusHandlers) editor.removeEventListener(type, handler, true);
    for (const type of viewportHandlers) win.removeEventListener(type, onViewport, true);
    win.visualViewport?.removeEventListener('resize', onViewport);
    win.visualViewport?.removeEventListener('scroll', onViewport);
    win.removeEventListener('error', onError, true);
    win.removeEventListener('unhandledrejection', onUnhandledRejection);
  };

  win.addEventListener('pagehide', flush, { once: true });
  return dispose;
}
