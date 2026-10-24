const SHORT_RENDERED_DOCUMENT_LINE_LIMIT = 800;
const SHORT_RENDERED_DOCUMENT_CHARACTER_LIMIT = 25000;
const ESTIMATED_RENDERED_LINE_HEIGHT_PX = 48;

export function computeWysiwygViewportMargin(
  viewportHeight,
  documentLineCount,
  documentLength,
  editorMode
) {
  const height = Number(viewportHeight);
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 800;
  const viewportMargin = Math.max(6000, Math.ceil(safeHeight * 8));
  const lineCount = Number(documentLineCount);
  const textLength = Number(documentLength);

  if (
    editorMode !== 'source' &&
    Number.isFinite(lineCount) &&
    lineCount > 0 &&
    lineCount <= SHORT_RENDERED_DOCUMENT_LINE_LIMIT &&
    Number.isFinite(textLength) &&
    textLength <= SHORT_RENDERED_DOCUMENT_CHARACTER_LIMIT
  ) {
    return Math.max(
      viewportMargin,
      Math.ceil(lineCount * ESTIMATED_RENDERED_LINE_HEIGHT_PX),
      Math.ceil(textLength * 2)
    );
  }

  return viewportMargin;
}
