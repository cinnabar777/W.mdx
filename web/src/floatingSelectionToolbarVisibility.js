export function createFloatingSelectionToolbarVisibility({
  onHide = () => {},
  onResume = () => {},
  delayMs = 1000,
  schedule = setTimeout,
  cancel = clearTimeout
} = {}) {
  let currentView = null;
  let currentRange = null;
  let pointerActive = false;
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
      suppressed = false;
      return changed;
    }
    if (changed) {
      suppress();
      scheduleResume();
    }
    return changed;
  }

  function pointerDown() {
    pointerActive = true;
    if (!currentRange) return;
    clearResumeTimer();
    suppress();
  }

  function pointerMove() {
    if (!pointerActive || !currentRange) return;
    clearResumeTimer();
    suppress();
  }

  function pointerUp() {
    if (!pointerActive) return;
    pointerActive = false;
    scheduleResume();
  }

  function reset() {
    clearResumeTimer();
    currentView = null;
    currentRange = null;
    pointerActive = false;
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
