export function computeWysiwygViewportMargin(viewportHeight) {
  const height = Number(viewportHeight);
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 800;
  return Math.max(20000, Math.ceil(safeHeight * 20));
}
