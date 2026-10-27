export function createCaretGeometryAnchorElement(ownerDocument = document) {
  const anchor = ownerDocument.createElement('span');
  anchor.className = 'cm-caret-geometry-anchor';
  anchor.setAttribute('aria-hidden', 'true');
  anchor.setAttribute('contenteditable', 'false');
  anchor.style.cssText =
    'display:inline-block;width:1px;height:1em;line-height:1;' +
    'overflow:hidden;opacity:0;pointer-events:none;user-select:none;' +
    'vertical-align:baseline;';
  return anchor;
}
