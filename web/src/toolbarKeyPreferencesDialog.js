import { getToolbarGestureActionId, TOOLBAR_GESTURE_GROUPS } from './toolbarGestures.js';

export function openToolbarKeyPreferencesDialog({
  keyId,
  keyTitle,
  surface,
  config,
  actions,
  onSave
}) {
  if (!keyId || !config || typeof document === 'undefined') return false;

  document.querySelector('#toolbar-key-preferences-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'toolbar-key-preferences-overlay';
  overlay.className = 'toolbar-key-preferences-overlay';
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('section');
  dialog.className = 'toolbar-key-preferences-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'toolbar-key-preferences-title');

  const header = document.createElement('header');
  header.className = 'toolbar-key-preferences-header';
  const title = document.createElement('h2');
  title.id = 'toolbar-key-preferences-title';
  title.textContent = keyTitle || 'Toolbar key';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'toolbar-key-preferences-close';
  closeButton.setAttribute('aria-label', 'Close key preferences');
  closeButton.textContent = '×';
  header.append(title, closeButton);
  dialog.appendChild(header);

  const content = document.createElement('div');
  content.className = 'toolbar-key-preferences-content';
  const description = document.createElement('p');
  description.className = 'toolbar-key-preferences-description';
  description.textContent = 'Choose what this key does for each tap or swipe.';
  content.appendChild(description);

  const gestureControls = [];
  const keyStyle = config.styles?.[keyId] || {};
  const actionOptions = [...(actions || [])]
    .filter(action => action?.id && action.id !== 'editToolbarKeyPreferences')
    .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));

  for (const group of TOOLBAR_GESTURE_GROUPS) {
    const section = document.createElement('section');
    section.className = 'toolbar-key-preferences-section';
    const heading = document.createElement('h3');
    heading.textContent = group.title;
    section.appendChild(heading);

    for (const gesture of group.gestures) {
      const label = document.createElement('label');
      label.className = 'toolbar-key-preferences-control';
      label.textContent = gesture.title;
      const select = document.createElement('select');
      select.setAttribute('aria-label', gesture.title);

      const noneOption = document.createElement('option');
      noneOption.value = '';
      noneOption.textContent = 'No action';
      select.appendChild(noneOption);

      for (const action of actionOptions) {
        const option = document.createElement('option');
        option.value = action.id;
        option.textContent = action.title || action.id;
        select.appendChild(option);
      }
      select.value = getToolbarGestureActionId(keyStyle, gesture.id);
      label.appendChild(select);
      section.appendChild(label);
      gestureControls.push({ gestureId: gesture.id, select });
    }
    content.appendChild(section);
  }

  const error = document.createElement('p');
  error.className = 'toolbar-key-preferences-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  content.appendChild(error);
  dialog.appendChild(content);

  const footer = document.createElement('footer');
  footer.className = 'toolbar-key-preferences-footer';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.className = 'toolbar-key-preferences-cancel';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  saveButton.className = 'toolbar-key-preferences-save';
  footer.append(cancelButton, saveButton);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => {
    document.removeEventListener('keydown', handleKeydown, true);
    overlay.remove();
  };
  const handleKeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', handleKeydown, true);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  closeButton.addEventListener('click', close);
  cancelButton.addEventListener('click', close);
  saveButton.addEventListener('click', () => {
    const nextConfig = JSON.parse(JSON.stringify(config));
    const nextStyle = { ...(nextConfig.styles[keyId] || {}) };
    const gestureActions = { ...(nextStyle.gestureActions || {}) };
    for (const { gestureId, select } of gestureControls) {
      if (select.value) gestureActions[gestureId] = select.value;
      else delete gestureActions[gestureId];
    }
    if (Object.keys(gestureActions).length) nextStyle.gestureActions = gestureActions;
    else delete nextStyle.gestureActions;
    delete nextStyle.gestureAction;
    nextConfig.styles[keyId] = nextStyle;

    try {
      if (onSave?.(surface, nextConfig)) {
        close();
        return;
      }
    } catch {
      // Keep the dialog open so the user can retry after a temporary bridge failure.
    }
    error.textContent = 'Could not save these key preferences. Please try again.';
    error.hidden = false;
  });

  dialog.querySelector('select')?.focus();
  return true;
}
