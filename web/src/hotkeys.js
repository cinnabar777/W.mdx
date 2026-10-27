function matchSingleHotkey(event, shortcutString) {
  if (!shortcutString || typeof shortcutString !== 'string') return false;
  const parts = shortcutString.toLowerCase().trim().split('+');
  const hasCtrl = parts.includes('ctrl') || parts.includes('control');
  const hasAlt = parts.includes('alt');
  const hasShift = parts.includes('shift');
  const keyParts = parts.filter(part =>
    part !== 'ctrl' && part !== 'control' && part !== 'alt' && part !== 'shift'
  );
  if (keyParts.length !== 1 || !keyParts[0]) return false;
  const keyPart = keyParts[0];
  const ctrlPressed = event.ctrlKey || event.metaKey;
  const altPressed = event.altKey;
  const shiftPressed = event.shiftKey;
  if (hasCtrl !== ctrlPressed) return false;
  if (hasAlt !== altPressed) return false;
  if (hasShift !== shiftPressed) return false;
  const keyLower = (event.key || '').toLowerCase();
  const codeLower = (event.code || '').toLowerCase();
  if (keyLower === keyPart) return true;
  if (codeLower === 'key' + keyPart || codeLower === keyPart) return true;
  if (keyPart === ',' && (keyLower === ',' || codeLower === 'comma')) return true;
  if (keyPart === '.' && (keyLower === '.' || codeLower === 'period')) return true;
  if (keyPart === 'tab' && (keyLower === 'tab' || codeLower === 'tab')) return true;
  if (keyPart === 'left' && (keyLower === 'arrowleft' || codeLower === 'arrowleft')) return true;
  if (keyPart === 'right' && (keyLower === 'arrowright' || codeLower === 'arrowright')) return true;
  return false;
}

export function parseAndMatchHotkey(event, shortcutString) {
  if (!shortcutString || typeof shortcutString !== 'string') return false;
  const shortcut = shortcutString.trim();
  if (!shortcut || /\s/.test(shortcut)) return false;
  return matchSingleHotkey(event, shortcut);
}
