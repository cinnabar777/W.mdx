const VIEWPORT_MARGIN = 8;
const BELOW_SELECTION_GAP = 44;
const ABOVE_SELECTION_GAP = 72;
const TOOLBAR_GAP = 8;

function overlapsRect(top, menuHeight, menuLeft, menuWidth, rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const overlapsHorizontally =
    menuLeft < rect.right && menuLeft + menuWidth > rect.left;
  const overlapsVertically =
    top < rect.bottom + TOOLBAR_GAP &&
    top + menuHeight > rect.top - TOOLBAR_GAP;
  return overlapsHorizontally && overlapsVertically;
}

export function getResourceLinkActionTop({
  targetRect,
  menuHeight,
  menuLeft,
  menuWidth,
  viewportTop,
  viewportBottom,
  avoidRects = []
}) {
  const minTop = viewportTop + VIEWPORT_MARGIN;
  const maxTop = Math.max(
    minTop,
    viewportBottom - menuHeight - VIEWPORT_MARGIN
  );
  const belowTop = targetRect.bottom + BELOW_SELECTION_GAP;
  const aboveTop = targetRect.top - menuHeight - ABOVE_SELECTION_GAP;
  const fitsViewport = top => top >= minTop && top <= maxTop;
  const avoidsToolbars = top =>
    avoidRects.every(
      rect => !overlapsRect(top, menuHeight, menuLeft, menuWidth, rect)
    );

  if (fitsViewport(belowTop) && avoidsToolbars(belowTop)) return belowTop;
  if (fitsViewport(aboveTop) && avoidsToolbars(aboveTop)) return aboveTop;

  const fallbackTops = [
    minTop,
    maxTop,
    belowTop,
    aboveTop,
    ...avoidRects.flatMap(rect => [
      rect.top - menuHeight - TOOLBAR_GAP,
      rect.bottom + TOOLBAR_GAP
    ])
  ]
    .filter(Number.isFinite)
    .map(top => Math.max(minTop, Math.min(top, maxTop)));
  const uniqueFallbackTops = [...new Set(fallbackTops)];
  const overlapsSelection = top =>
    top < targetRect.bottom + BELOW_SELECTION_GAP &&
    top + menuHeight > targetRect.top - ABOVE_SELECTION_GAP;

  return uniqueFallbackTops.sort((left, right) => {
    const leftToolbarOverlap = avoidRects.filter(rect =>
      overlapsRect(left, menuHeight, menuLeft, menuWidth, rect)
    ).length;
    const rightToolbarOverlap = avoidRects.filter(rect =>
      overlapsRect(right, menuHeight, menuLeft, menuWidth, rect)
    ).length;
    if (leftToolbarOverlap !== rightToolbarOverlap) {
      return leftToolbarOverlap - rightToolbarOverlap;
    }
    const leftSelectionOverlap = overlapsSelection(left) ? 1 : 0;
    const rightSelectionOverlap = overlapsSelection(right) ? 1 : 0;
    if (leftSelectionOverlap !== rightSelectionOverlap) {
      return leftSelectionOverlap - rightSelectionOverlap;
    }
    return Math.abs(left - belowTop) - Math.abs(right - belowTop);
  })[0] ?? minTop;
}
