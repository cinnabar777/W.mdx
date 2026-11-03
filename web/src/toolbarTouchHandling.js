const TOOLBAR_CONTROL_SELECTOR =
  'button, [role="button"], [data-toolbar-key], [data-toolbar-style-id]';
const EDITABLE_CONTROL_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const SCROLLABLE_TOOLBAR_SURFACE_SELECTOR =
  '#popup-toolbar-strip, #floating-selection-toolbar';
const NATIVE_CLICK_SUPPRESSION_MS = 500;

export function installToolbarTouchHandling(documentRef, surfaceSelector) {
  if (!documentRef?.addEventListener || !surfaceSelector) return () => {};

  const activeTouchControls = new Map();
  const pendingNativeClickTimers = new Map();
  const view = documentRef.defaultView || globalThis;
  const getControl = target => {
    const element = target?.nodeType === 1 ? target : target?.parentElement;
    if (!element?.closest || element.closest(EDITABLE_CONTROL_SELECTOR)) return null;
    const control = element.closest(TOOLBAR_CONTROL_SELECTOR);
    return control?.closest(surfaceSelector) ? control : null;
  };
  const clearPendingNativeClick = control => {
    const timer = pendingNativeClickTimers.get(control);
    if (timer === undefined) return;
    view.clearTimeout(timer);
    pendingNativeClickTimers.delete(control);
  };
  const expectNativeClick = control => {
    clearPendingNativeClick(control);
    const timer = view.setTimeout(() => {
      pendingNativeClickTimers.delete(control);
    }, NATIVE_CLICK_SUPPRESSION_MS);
    pendingNativeClickTimers.set(control, timer);
  };
  const onTouchStart = event => {
    if (event.touches?.length > 1) return;
    const control = getControl(event.target);
    if (
      !control ||
      control.closest(SCROLLABLE_TOOLBAR_SURFACE_SELECTOR) ||
      !event.cancelable
    ) return;
    // Match the mobile toolbar pattern used by Gay Toolbar: cancel the
    // non-scrollable toolbar's touch default without changing WebView/editor
    // focus policy. Scrollable surfaces retain their pan gesture.
    event.preventDefault();
  };
  const onPointerDown = event => {
    if (event.pointerType !== 'touch' || event.isPrimary === false) return;
    const control = getControl(event.target);
    if (!control) return;
    // Prevent a toolbar button from taking focus. Pointer Events leave
    // touch-action-controlled scrolling to the scrollable toolbar surface.
    if (event.cancelable) event.preventDefault();
    const pointerId = event.pointerId ?? 0;
    clearPendingNativeClick(control);
    activeTouchControls.set(pointerId, control);
  };
  const onPointerUp = event => {
    const pointerId = event.pointerId ?? 0;
    const control = activeTouchControls.get(pointerId);
    if (!control) return;
    activeTouchControls.delete(pointerId);
    if (!control.isConnected) return;

    // Some WebViews still emit a trusted click after touchstart was canceled.
    // Let the click synthesized below run through the existing handlers, but
    // consume that duplicate native click if the WebView sends one.
    expectNativeClick(control);
    if (control.dataset?.toolbarGestureSuppressClick === 'true') {
      delete control.dataset.toolbarGestureSuppressClick;
      return;
    }
    control.click?.();
  };
  const onPointerCancel = event => {
    activeTouchControls.delete(event.pointerId ?? 0);
  };
  const onClick = event => {
    if (!event.isTrusted || event.detail < 1) return;
    const control = getControl(event.target);
    if (!control || !pendingNativeClickTimers.has(control)) return;
    clearPendingNativeClick(control);
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onWindowBlur = () => {
    activeTouchControls.clear();
    for (const control of pendingNativeClickTimers.keys()) {
      clearPendingNativeClick(control);
    }
  };

  documentRef.addEventListener('touchstart', onTouchStart, {
    capture: true,
    passive: false
  });
  documentRef.addEventListener('pointerdown', onPointerDown, true);
  documentRef.addEventListener('pointerup', onPointerUp);
  documentRef.addEventListener('pointercancel', onPointerCancel, true);
  documentRef.addEventListener('click', onClick, true);
  view.addEventListener?.('blur', onWindowBlur);

  return () => {
    documentRef.removeEventListener('touchstart', onTouchStart, true);
    documentRef.removeEventListener('pointerdown', onPointerDown, true);
    documentRef.removeEventListener('pointerup', onPointerUp);
    documentRef.removeEventListener('pointercancel', onPointerCancel, true);
    documentRef.removeEventListener('click', onClick, true);
    view.removeEventListener?.('blur', onWindowBlur);
    onWindowBlur();
  };
}
