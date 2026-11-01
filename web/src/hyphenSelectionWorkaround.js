export function installHyphenSelectionWorkaround(view) {
  const editor = view?.dom;
  const doc = editor?.ownerDocument;
  if (!editor || !/Android/i.test(doc?.defaultView?.navigator?.userAgent || '')) {
    return null;
  }

  const className = 'cm-android-no-auto-hyphens';
  const alreadyPresent = editor.classList.contains(className);
  editor.classList.add(className);

  return {
    destroy() {
      if (!alreadyPresent) editor.classList.remove(className);
    }
  };
}
