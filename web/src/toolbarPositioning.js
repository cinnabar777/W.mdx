export function getFloatingToolbarPosition({
  start,
  end,
  toolbarWidth,
  toolbarHeight,
  viewport,
  margin = 8
}) {
  const viewportLeft = viewport.offsetLeft || 0;
  const viewportTop = viewport.offsetTop || 0;
  const leftLimit = viewportLeft + margin;
  const rightLimit = viewportLeft + viewport.width - margin;
  const topLimit = viewportTop + margin;
  const bottomLimit = viewportTop + viewport.height - margin;
  const width = Math.min(toolbarWidth, Math.max(0, rightLimit - leftLimit));
  const selectionLeft = Math.min(start.left, end.left);
  const selectionRight = Math.max(start.right, end.right);
  const selectionTop = Math.min(start.top, end.top);
  const selectionBottom = Math.max(start.bottom, end.bottom);
  const left = Math.max(
    leftLimit,
    Math.min((selectionLeft + selectionRight - width) / 2, rightLimit - width)
  );
  const above = selectionTop - toolbarHeight - margin;
  const below = selectionBottom + margin;
  const top = above >= topLimit
    ? above
    : below + toolbarHeight <= bottomLimit
      ? below
      : Math.max(topLimit, Math.min(above, bottomLimit - toolbarHeight));
  return { left, top, width };
}
