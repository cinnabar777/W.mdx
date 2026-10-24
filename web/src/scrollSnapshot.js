export function withScrollSnapshot(view, effects, scrollSnapshot = null) {
  const list = Array.isArray(effects) ? effects : [effects];
  return [...list, scrollSnapshot ?? view.scrollSnapshot()];
}
