export function createFloatingSelectionToolbarVisibility({
  onHide = () => {},
  onResume = () => {},
  delayMs = 1000,
  dragThresholdPx = 8,
  schedule = setTimeout,
  cancel = clearTimeout
} = {}) {
  let currentView = null;
  let currentRange = null;
  let pointerActive = false;
  let pointerDragging = false;
  let pointerStart = null;
  let releasePending = false;
  let suppressed = false;
  let resumeTimer = null;

  function clearResumeTimer() {
    if (resumeTimer !== null) cancel(resumeTimer);
    resumeTimer = null;
  }

  function suppress() {
    if (!suppressed) {
      suppressed = true;
      onHide();
    }
  }

  function scheduleResume() {
    clearResumeTimer();
    if (pointerActive || !currentRange) return;
    resumeTimer = schedule(() => {
      resumeTimer = null;
      if (pointerActive || !currentRange) return;
      releasePending = false;
      suppressed = false;
      onResume();
    }, delayMs);
  }

  function updateSelection(view, selection) {
    const nextRange = selection && !selection.empty
      ? { from: selection.from, to: selection.to }
      : null;
    const changed =
      view !== currentView ||
      nextRange?.from !== currentRange?.from ||
      nextRange?.to !== currentRange?.to;

    currentView = view;
    currentRange = nextRange;
    if (!nextRange) {
      clearResumeTimer();
      releasePending = false;
      suppressed = false;
      return changed;
    }
    if (changed) {
      if (pointerDragging) {
        clearResumeTimer();
        suppress();
      } else if (releasePending) {
        suppress();
        scheduleResume();
      } else {
        clearResumeTimer();
        releasePending = false;
        if (suppressed) {
          suppressed = false;
          onResume();
        }
      }
    }
    return changed;
  }

  function pointerDown(event = {}) {
    clearResumeTimer();
    releasePending = false;
    pointerActive = true;
    pointerDragging = false;
    pointerStart = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : null;
  }

  function pointerMove(event = {}) {
    if (!pointerActive) return;
    if (!pointerDragging) {
      if (!pointerStart) {
        pointerDragging = true;
      } else if (
        Number.isFinite(event.clientX) &&
        Number.isFinite(event.clientY) &&
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y
        ) >= dragThresholdPx
      ) {
        pointerDragging = true;
      }
    }
    if (!pointerDragging) return;
    clearResumeTimer();
    releasePending = false;
    suppress();
  }

  function pointerUp() {
    if (!pointerActive) return;
    pointerActive = false;
    pointerStart = null;
    if (pointerDragging) {
      pointerDragging = false;
      releasePending = true;
      scheduleResume();
      return;
    }
    if (suppressed) {
      clearResumeTimer();
      releasePending = false;
      suppressed = false;
      onResume();
    }
  }

  function reset() {
    clearResumeTimer();
    currentView = null;
    currentRange = null;
    pointerActive = false;
    pointerDragging = false;
    pointerStart = null;
    releasePending = false;
    suppressed = false;
  }

  return {
    updateSelection,
    pointerDown,
    pointerMove,
    pointerUp,
    reset,
    isSuppressed: () => suppressed
  };
}
