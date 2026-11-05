export function separateTableMenuFromFloatingToolbar(
  documentRef = globalThis.document,
  windowRef = globalThis.window
) {
  const floatingToolbar = documentRef?.querySelector?.('#floating-selection-toolbar');
  const tableMenu = documentRef?.querySelector?.('.cm-wp-table-context-menu');
  if (
    !floatingToolbar ||
    !tableMenu ||
    !floatingToolbar.classList?.contains('is-visible')
  ) {
    return false;
  }

  const toolbarRect = floatingToolbar.getBoundingClientRect();
  const menuRect = tableMenu.getBoundingClientRect();
  const overlapsHorizontally =
    menuRect.left < toolbarRect.right &&
    menuRect.right > toolbarRect.left;
  const overlapsVertically =
    menuRect.top < toolbarRect.bottom &&
    menuRect.bottom > toolbarRect.top;
  if (!overlapsHorizontally || !overlapsVertically) return false;

  const viewport = windowRef?.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? windowRef?.innerHeight ?? 0);
  const margin = 8;
  const gap = 8;
  const minTop = viewportTop + margin;
  const maxTop = Math.max(minTop, viewportBottom - menuRect.height - margin);
  const candidates = [
    toolbarRect.top - menuRect.height - gap,
    toolbarRect.bottom + gap
  ]
    .filter(top => top >= minTop && top <= maxTop)
    .filter(top => top + menuRect.height <= toolbarRect.top || top >= toolbarRect.bottom);

  const nextTop = candidates.length
    ? candidates.sort((a, b) => Math.abs(a - menuRect.top) - Math.abs(b - menuRect.top))[0]
    : Math.max(minTop, Math.min(toolbarRect.bottom + gap, maxTop));

  tableMenu.style.top = `${nextTop}px`;
  return true;
}
