const HYPHENATION_PROPERTIES = ['hyphens', '-webkit-hyphens'];

function getParagraph(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.('.cm-paragraph') || null;
}

export function isRangeStartAtParagraphStart(range) {
  const paragraph = getParagraph(range?.startContainer);
  if (!paragraph) return false;

  const probe = paragraph.ownerDocument.createRange();
  try {
    probe.selectNodeContents(paragraph);
    probe.setEnd(range.startContainer, range.startOffset);
  } catch {
    return false;
  }
  return probe.toString().trim().length === 0;
}

export function getHyphenatedParagraphForSelection(range) {
  if (!range || range.collapsed || !isRangeStartAtParagraphStart(range)) return null;
  const paragraph = getParagraph(range.startContainer);
  const win = paragraph?.ownerDocument.defaultView;
  if (!paragraph || !win) return null;

  const style = win.getComputedStyle(paragraph);
  const mayHyphenate =
    style.getPropertyValue('hyphens') === 'auto' ||
    style.getPropertyValue('-webkit-hyphens') === 'auto' ||
    (paragraph.textContent || '').includes('\u00ad');
  return mayHyphenate ? paragraph : null;
}

function disableHyphenation(paragraph) {
  const style = paragraph.style;
  const previousValues = HYPHENATION_PROPERTIES.map(property => ({
    property,
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property)
  }));

  for (const property of HYPHENATION_PROPERTIES) {
    style.setProperty(property, 'none', 'important');
  }

  return () => {
    for (const { property, value, priority } of previousValues) {
      if (value) style.setProperty(property, value, priority);
      else style.removeProperty(property);
    }
  };
}

export function installHyphenSelectionWorkaround(view) {
  const doc = view?.dom?.ownerDocument;
  const win = doc?.defaultView;
  if (
    !doc ||
    !win ||
    !/Android/i.test(win.navigator?.userAgent || '')
  ) {
    return null;
  }

  let activeParagraph = null;
  let restoreHyphenation = null;
  let destroyed = false;

  const refresh = () => {
    if (destroyed) return;
    const selection = doc.getSelection();
    let range = null;
    if (selection?.rangeCount) {
      try {
        const candidate = selection.getRangeAt(0);
        if (view.dom.contains(candidate.commonAncestorContainer)) {
          range = candidate;
        }
      } catch {
        range = null;
      }
    }

    const nextParagraph = getHyphenatedParagraphForSelection(range);
    if (nextParagraph === activeParagraph) return;

    restoreHyphenation?.();
    restoreHyphenation = null;
    activeParagraph = nextParagraph;
    if (activeParagraph) {
      restoreHyphenation = disableHyphenation(activeParagraph);
    }
  };

  doc.addEventListener('selectionchange', refresh, true);

  return {
    refresh,
    destroy() {
      destroyed = true;
      doc.removeEventListener('selectionchange', refresh, true);
      restoreHyphenation?.();
      restoreHyphenation = null;
      activeParagraph = null;
    }
  };
}
