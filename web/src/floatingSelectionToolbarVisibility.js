export function createFloatingSelectionToolbarVisibility({
  onHide = () => {},
  onResume = () => {},
  delayMs = 1000,
  schedule = setTimeout,
  cancel = clearTimeout
} = {}) {
  let currentView = null;
  let currentRange = null;
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
    if (!currentRange) return;
    resumeTimer = schedule(() => {
      resumeTimer = null;
      if (!currentRange) return;
      suppressed = false;
      onResume();
    }, currentDelayMs);
  }

  function updateSelection(view, selection, { ignoreRangeChange = false } = {}) {
    const nextRange = selection && !selection.empty
      ? { from: selection.from, to: selection.to }
      : null;
    const changed =
      view !== currentView ||
      nextRange?.from !== currentRange?.from ||
      nextRange?.to !== currentRange?.to;
    const existingSelectionChanged =
      view === currentView &&
      currentRange !== null &&
      nextRange !== null &&
      (nextRange.from !== currentRange.from || nextRange.to !== currentRange.to);

    currentView = view;
    currentRange = nextRange;
    if (!nextRange) {
      clearResumeTimer();
      suppressed = false;
      return changed;
    }

    if (existingSelectionChanged && !ignoreRangeChange) {
      suppress();
      scheduleResume();
    }
    return changed;
  }

  function reset() {
    clearResumeTimer();
    currentView = null;
    currentRange = null;
    suppressed = false;
  }

  function setDelayMs(nextDelayMs) {
    const normalizedDelayMs = Number.isFinite(nextDelayMs)
      ? Math.max(0, Math.min(5000, Math.round(nextDelayMs)))
      : 1000;
    if (normalizedDelayMs === currentDelayMs) return;
    currentDelayMs = normalizedDelayMs;
    if (resumeTimer !== null) scheduleResume();
  }

  return {
    updateSelection,
    reset,
    setDelayMs,
    isSuppressed: () => suppressed
  };
}
