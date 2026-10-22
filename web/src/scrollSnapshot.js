export function withScrollSnapshot(view, effects) {
  const list = Array.isArray(effects) ? effects : [effects];
  return [...list, view.scrollSnapshot()];
}
