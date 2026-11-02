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
  let pointerRangeAtDown = null;
  let pointerSelectionChanged = false;
  let releasePending = false;
  let suppressed = false;
  let resumeTimer = null;
  let currentDelayMs = Number.isFinite(delayMs)
    ? Math.max(0, Math.min(5000, Math.round(delayMs)))
    : 1000;

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
    }, currentDelayMs);
  }

  function updateSelection(view, selection) {
    const nextRange = selection && !selection.empty
      ? { from: selection.from, to: selection.to }
      : null;
    const rangeChanged =
      nextRange?.from !== currentRange?.from ||
      nextRange?.to !== currentRange?.to;
    const changed =
      view !== currentView ||
      rangeChanged;

    if (
      pointerActive &&
      rangeChanged &&
      nextRange &&
      (
        nextRange.from !== pointerRangeAtDown?.from ||
        nextRange.to !== pointerRangeAtDown?.to
      )
    ) {
      pointerSelectionChanged = true;
    }
    currentView = view;
    currentRange = nextRange;
    if (!nextRange) {
      clearResumeTimer();
      releasePending = false;
      suppressed = false;
      return changed;
    }
    if (changed) {
      if (pointerActive) {
        if (pointerDragging && pointerSelectionChanged && nextRange) {
          clearResumeTimer();
          suppress();
        }
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
    pointerRangeAtDown = currentRange ? { ...currentRange } : null;
    pointerSelectionChanged = false;
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
    if (pointerSelectionChanged && currentRange) suppress();
  }

  function pointerUp(event = {}) {
    if (!pointerActive) return;
    if (
      !pointerDragging &&
      pointerStart &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY) &&
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y
      ) >= dragThresholdPx
    ) {
      pointerDragging = true;
    }
    if (pointerDragging && pointerSelectionChanged && currentRange) suppress();
    pointerActive = false;
    pointerStart = null;
    pointerRangeAtDown = null;
    if (pointerDragging && pointerSelectionChanged && currentRange) {
      pointerDragging = false;
      pointerSelectionChanged = false;
      releasePending = true;
      scheduleResume();
      return;
    }
    pointerDragging = false;
    pointerSelectionChanged = false;
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
    pointerRangeAtDown = null;
    pointerSelectionChanged = false;
    releasePending = false;
    suppressed = false;
  }

  return {
    updateSelection,
    pointerDown,
    pointerMove,
    pointerUp,
    reset,
    setDelayMs(nextDelayMs) {
      const normalizedDelayMs = Number.isFinite(nextDelayMs)
        ? Math.max(0, Math.min(5000, Math.round(nextDelayMs)))
        : 1000;
      if (normalizedDelayMs === currentDelayMs) return;
      currentDelayMs = normalizedDelayMs;
      if (resumeTimer !== null && releasePending) scheduleResume();
    },
    isSuppressed: () => suppressed
  };
}
