const EMBEDDED_EDITOR_URL = './toolbar-settings-preview.html?embed=key-preferences';
const CLOSE_MESSAGE_TYPE = 'wmdx-toolbar-key-preferences-close';
const RESIZE_MESSAGE_TYPE = 'wmdx-toolbar-key-preferences-resize';

export function openToolbarKeyPreferencesDialog({ keyId, keyTitle, surface, config }) {
  if (!keyId || !config || typeof document === 'undefined') return false;
  document.querySelector('#toolbar-key-preferences-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'toolbar-key-preferences-overlay';
  overlay.className = 'toolbar-key-preferences-overlay';

  const frame = document.createElement('iframe');
  frame.id = 'toolbar-key-preferences-frame';
  frame.className = 'toolbar-key-preferences-frame';
  frame.title = `${keyTitle || 'Toolbar key'} preferences`;
  frame.src = EMBEDDED_EDITOR_URL;
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  const close = () => {
    window.removeEventListener('message', handleMessage);
    document.removeEventListener('keydown', handleKeydown, true);
    delete window.updateToolbarKeyPreferencesFrame;
    overlay.remove();
  };

  const handleMessage = event => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === CLOSE_MESSAGE_TYPE) {
      close();
      return;
    }
    if (event.data?.type === RESIZE_MESSAGE_TYPE) {
      const requestedHeight = Number(event.data.height);
      if (!Number.isFinite(requestedHeight)) return;
      const maxHeight = Math.max(1, window.innerHeight - 24);
      frame.style.height = `${Math.max(1, Math.min(requestedHeight, maxHeight))}px`;
    }
  };

  const handleKeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const applyToolbarConfig = (targetSurface, rawConfig) => {
    const configValue = JSON.parse(rawConfig);
    if (targetSurface === 'floating') {
      window.editorBridge?.applyFloatingToolbarConfig?.(configValue);
    } else {
      window.editorBridge?.applyBottomToolbarConfig?.(configValue);
    }
  };

  const settingsBridge = {
    setToolbarSurface: () => {},
    saveBottomToolbarConfig: rawConfig => {
      const save = window.AndroidNative?.saveToolbarKeyPreferences;
      if (typeof save !== 'function' || !save(surface, rawConfig)) return 'commit_failed';
      try {
        applyToolbarConfig(surface, rawConfig);
      } catch {
        return 'bridge_error';
      }
      return 'saved';
    },
    pickBottomToolbarColor: (itemId, property) =>
      window.AndroidNative?.pickToolbarKeyColor?.(surface, itemId, property),
    editBottomToolbarIcon: request => {
      let payload;
      try {
        payload = JSON.parse(request);
      } catch {
        return;
      }
      const property = payload.property || 'customSvg';
      if (payload.action === 'file') {
        window.AndroidNative?.pickToolbarKeySvg?.(surface, payload.itemId, property);
      } else if (payload.action === 'paste') {
        const svg = window.AndroidNative?.readClipboard?.() || '';
        window.AndroidNative?.setToolbarKeySvg?.(surface, payload.itemId, property, svg);
      }
    }
  };

  window.addEventListener('message', handleMessage);
  document.addEventListener('keydown', handleKeydown, true);
  window.updateToolbarKeyPreferencesFrame = (targetSurface, rawConfig) => {
    if (targetSurface !== surface) return;
    frame.contentWindow?.updateToolbarKeyPreferencesConfig?.(targetSurface, rawConfig);
  };

  frame.addEventListener('load', () => {
    const editorWindow = frame.contentWindow;
    if (!editorWindow) return;
    editorWindow.ToolbarSettings = settingsBridge;
    editorWindow.openToolbarKeyPreferencesEditor?.({
      keyId,
      surface,
      config
    });
  }, { once: true });

  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  return true;
}
