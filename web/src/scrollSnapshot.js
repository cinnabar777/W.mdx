let lastScrollTime = 0;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'scroll',
    () => {
      lastScrollTime = Date.now();
    },
    { capture: true, passive: true }
  );
}

export function isViewScrolling() {
  return Date.now() - lastScrollTime < 200;
}

export function withScrollSnapshot(view, effects) {
  const list = Array.isArray(effects) ? effects : [effects];
  if (!view || typeof view.scrollSnapshot !== 'function' || isViewScrolling()) {
    return list;
  }
  return [...list, view.scrollSnapshot()];
}
