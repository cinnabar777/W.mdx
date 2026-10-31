export function calculateViewportClampedPopupPosition({
  bounds,
  anchorRect,
  width,
  height,
  gap = 8,
  inset = 8
}) {
  const minLeft = bounds.left + inset;
  const maxLeft = Math.max(minLeft, bounds.right - width - inset);
  const left = Math.min(Math.max(minLeft, anchorRect.right - width), maxLeft);
  const below = anchorRect.bottom + gap;
  const above = anchorRect.top - height - gap;
  const minTop = bounds.top + inset;
  const maxTop = Math.max(minTop, bounds.bottom - height - inset);
  const top = below + height <= bounds.bottom - inset
    ? below
    : Math.max(minTop, Math.min(above, maxTop));

  return { left, top };
}
