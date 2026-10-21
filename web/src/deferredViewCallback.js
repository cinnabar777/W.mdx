export function createDeferredViewCallback(
  scheduleFrame = callback => requestAnimationFrame(callback)
) {
  const pendingViews = new WeakSet();

  return (view, callback) => {
    if (!view || view.destroyed || pendingViews.has(view)) return;
    pendingViews.add(view);

    scheduleFrame(() => {
      pendingViews.delete(view);
      if (view.destroyed) return;
      callback(view);
    });
  };
}
