const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getPanelSwipeFrame(side, opening, deltaX, width) {
  const safeWidth = Math.max(1, width);
  const signedDistance = side === 'left'
    ? (opening ? deltaX : -deltaX)
    : (opening ? -deltaX : deltaX);
  const distance = clamp(signedDistance, 0, safeWidth);
  const progress = opening
    ? distance / safeWidth
    : 1 - distance / safeWidth;
  if (side === 'left') {
    return {
      progress,
      transform: opening
        ? `translateX(calc(-100% + ${distance}px))`
        : `translateX(-${distance}px)`
    };
  }
  return {
    progress,
    transform: opening
        ? `translateX(calc(100% - ${distance}px))`
        : `translateX(${distance}px)`
  };
}

export function setupPanelSwipe({
  panel,
  overlay,
  side,
  windowObject = window,
  isOpen,
  isEnabled = () => true,
  onOpen,
  onClose
}) {
  if (!panel || !overlay || !['left', 'right'].includes(side)) return () => {};

  let gesture = null;

  const resetStyles = () => {
    panel.classList.remove('dragging');
    overlay.classList.remove('dragging');
    windowObject.requestAnimationFrame(() => {
      panel.style.removeProperty('transform');
      overlay.style.removeProperty('opacity');
    });
  };

  const finish = (touch, cancelled = false) => {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    if (!current.moved) return;
    let shouldOpen = !current.opening;
    if (!cancelled) {
      const deltaX = touch.clientX - current.startX;
      const frame = getPanelSwipeFrame(side, current.opening, deltaX, current.width);
      shouldOpen = current.opening ? frame.progress >= 0.42 : frame.progress > 0.58;
    }
    const wasOpen = !current.opening;
    if (shouldOpen !== wasOpen) {
      if (shouldOpen) onOpen?.();
      else onClose?.();
    } else {
      panel.classList.toggle('open', wasOpen);
      overlay.classList.toggle('open', wasOpen);
    }
    resetStyles();
  };

  const onTouchStart = (event) => {
    if (!isEnabled()) {
      gesture = null;
      return;
    }
    if (event.touches?.length !== 1) {
      gesture = null;
      return;
    }
    if (
      event.target?.closest?.(
        '#bottom-toolbar, #popup-toolbar-strip, #floating-selection-toolbar'
      ) ||
      windowObject.getSelection?.()?.toString()
    ) {
      gesture = null;
      return;
    }
    const touch = event.touches[0];
    const screenWidth = windowObject.innerWidth || 1;
    const panelOpen = isOpen();
    if (panelOpen && !panel.contains(event.target)) {
      gesture = null;
      return;
    }
    const canStart = panelOpen
      ? true
      : side === 'left'
        ? touch.clientX <= screenWidth * 0.25
        : touch.clientX >= screenWidth * 0.8;
    if (!canStart) {
      gesture = null;
      return;
    }
    gesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      width: panel.getBoundingClientRect().width || screenWidth * 0.8,
      opening: !panelOpen,
      moved: false
    };
  };

  const onTouchMove = (event) => {
    if (!gesture || event.touches?.length !== 1) return;
    if (!isEnabled()) {
      finish(null, true);
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) {
      if (Math.abs(deltaY) > 16 && !gesture.moved) gesture = null;
      return;
    }
    const openingDirection = side === 'left' ? deltaX > 0 : deltaX < 0;
    if (!gesture.moved && openingDirection !== gesture.opening) return;
    event.preventDefault();
    gesture.moved = true;
    const frame = getPanelSwipeFrame(side, gesture.opening, deltaX, gesture.width);
    panel.classList.add('dragging', 'open');
    overlay.classList.add('dragging', 'open');
    panel.style.transform = frame.transform;
    overlay.style.opacity = String(frame.progress);
  };

  const onTouchEnd = (event) => {
    if (!gesture || !event.changedTouches?.length) return;
    finish(event.changedTouches[0]);
  };

  const onTouchCancel = () => finish(null, true);
  const startOptions = { passive: true };
  const moveOptions = { passive: false };
  windowObject.addEventListener('touchstart', onTouchStart, startOptions);
  windowObject.addEventListener('touchmove', onTouchMove, moveOptions);
  windowObject.addEventListener('touchend', onTouchEnd, startOptions);
  windowObject.addEventListener('touchcancel', onTouchCancel, startOptions);

  return () => {
    windowObject.removeEventListener('touchstart', onTouchStart, startOptions);
    windowObject.removeEventListener('touchmove', onTouchMove, moveOptions);
    windowObject.removeEventListener('touchend', onTouchEnd, startOptions);
    windowObject.removeEventListener('touchcancel', onTouchCancel, startOptions);
    gesture = null;
  };
}
