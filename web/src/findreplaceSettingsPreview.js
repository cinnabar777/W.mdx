const DEFAULT_ROW1 = ['prev', 'next', 'highlight', 'regex', 'close'];
const DEFAULT_ROW2 = ['replace-one', 'replace-all', 'case', 'word'];
const BUTTON_IDS = [...DEFAULT_ROW1, ...DEFAULT_ROW2];
const BUTTON_LABELS = {
  prev: 'Previous',
  next: 'Next',
  highlight: 'Highlight',
  regex: 'Regex',
  close: 'Close',
  'replace-one': 'Replace one',
  'replace-all': 'Replace all',
  case: 'Match case',
  word: 'Whole word'
};
const CATEGORY_BY_ID = Object.fromEntries(
  [...document.querySelectorAll('.search-icon-btn')].map(button => [
    button.dataset.buttonId,
    button.dataset.category
  ])
);
const buttonElements = new Map(
  [...document.querySelectorAll('.search-icon-btn')].map(button => [
    button.dataset.buttonId,
    button
  ])
);
const rowElements = {
  row1: document.querySelector('#findreplace-row1'),
  row2: document.querySelector('#findreplace-row2')
};
const state = {
  row1: [...DEFAULT_ROW1],
  row2: [...DEFAULT_ROW2],
  hidden: new Set(),
  dragging: null
};
let pointerCandidate = null;
let pointerTimer = 0;
let suppressClickUntil = 0;

function colorValue(value, fallback) {
  if (typeof value !== 'string' || !value.trim() || value === 'default') return fallback;
  const color = value.trim();
  const argb = color.match(/^#([0-9a-f]{8})$/i);
  if (!argb) return color;
  const [alpha, red, green, blue] = argb[1].match(/../g).map(part => parseInt(part, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function setColorVariable(name, value, fallback) {
  const root = document.documentElement;
  if (typeof value !== 'string' || !value.trim() || value === 'default') {
    root.style.removeProperty(name);
    return;
  }
  root.style.setProperty(name, colorValue(value, fallback));
}

function normalizeRows(rawRow1, rawRow2, hiddenValues) {
  const valid = new Set(BUTTON_IDS);
  const hidden = new Set(
    String(hiddenValues || '')
      .split(',')
      .map(value => value.trim())
      .filter(value => valid.has(value))
  );
  const seen = new Set();
  const normalize = (raw, fallback) => {
    const items = String(raw || '')
      .split(',')
      .map(value => value.trim())
      .filter(value => valid.has(value) && !seen.has(value) && (seen.add(value), true));
    for (const id of fallback) {
      if (!seen.has(id)) {
        items.push(id);
        seen.add(id);
      }
    }
    return items;
  };
  return {
    row1: normalize(rawRow1, DEFAULT_ROW1),
    row2: normalize(rawRow2, DEFAULT_ROW2),
    hidden
  };
}

function applyStyles(prefs) {
  const root = document.documentElement;
  setColorVariable('--findreplace-panel-bg', prefs.pref_findreplace_panel_bg, '#121212');
  setColorVariable('--findreplace-panel-border', prefs.pref_findreplace_panel_border, '#282828');
  setColorVariable('--findreplace-field-find-bg', prefs.pref_findreplace_field_find_bg, '#1e1e1e');
  setColorVariable('--findreplace-field-find-color', prefs.pref_findreplace_field_find_color, '#ffffff');
  setColorVariable('--findreplace-field-find-placeholder', prefs.pref_findreplace_field_find_placeholder, '#888888');
  setColorVariable('--findreplace-field-find-border', prefs.pref_findreplace_field_find_border, '#333333');
  setColorVariable('--findreplace-field-find-focus-border', prefs.pref_findreplace_field_find_focus_border, '#0078d4');
  const findFontSize = Number(prefs.pref_findreplace_field_find_font_size ?? 14);
  root.style.setProperty(
    '--findreplace-field-find-font-size',
    `${Number.isFinite(findFontSize) ? findFontSize : 14}px`
  );
  setColorVariable('--findreplace-field-replace-bg', prefs.pref_findreplace_field_replace_bg, '#1e1e1e');
  setColorVariable('--findreplace-field-replace-color', prefs.pref_findreplace_field_replace_color, '#ffffff');
  setColorVariable('--findreplace-field-replace-placeholder', prefs.pref_findreplace_field_replace_placeholder, '#888888');
  setColorVariable('--findreplace-field-replace-border', prefs.pref_findreplace_field_replace_border, '#333333');
  setColorVariable('--findreplace-field-replace-focus-border', prefs.pref_findreplace_field_replace_focus_border, '#0078d4');
  const replaceFontSize = Number(prefs.pref_findreplace_field_replace_font_size ?? 14);
  root.style.setProperty(
    '--findreplace-field-replace-font-size',
    `${Number.isFinite(replaceFontSize) ? replaceFontSize : 14}px`
  );
  setColorVariable('--findreplace-counter-color', prefs.pref_findreplace_counter_color, '#888888');
  setColorVariable('--findreplace-counter-bg', prefs.pref_findreplace_counter_bg, 'transparent');
  setColorVariable('--findreplace-match-bg', prefs.pref_findreplace_match_bg, 'rgba(255, 255, 0, 0.35)');
  setColorVariable('--findreplace-current-match-bg', prefs.pref_findreplace_current_match_bg, '#0078d4');
  setColorVariable('--findreplace-current-match-color', prefs.pref_findreplace_current_match_color, '#ffffff');
  setColorVariable('--findreplace-btn-bg', prefs.pref_findreplace_btn_bg, '#1e1e1e');
  setColorVariable('--findreplace-btn-color', prefs.pref_findreplace_btn_color, '#aaaaaa');
  setColorVariable('--findreplace-field-border', prefs.pref_findreplace_field_border, '#333333');
  setColorVariable('--findreplace-btn-active-bg', prefs.pref_findreplace_btn_active_bg, '#0078d4');
  setColorVariable('--findreplace-btn-active-color', prefs.pref_findreplace_btn_active_color, '#ffffff');
  setColorVariable('--findreplace-btn-pressed-bg', prefs.pref_findreplace_btn_pressed_bg, '#0078d4');
  const fieldHeight = Number(prefs.pref_findreplace_field_height ?? 32);
  const safeFieldHeight = Number.isFinite(fieldHeight)
    ? Math.max(24, Math.min(56, fieldHeight))
    : 32;
  root.style.setProperty('--findreplace-field-height', `${safeFieldHeight}px`);

  for (const id of BUTTON_IDS) {
    const suffix = id.replace(/-/g, '_');
    const widthValue = Number(
      prefs[`pref_findreplace_btn_${suffix}_width`] ??
      prefs.pref_findreplace_btn_width ??
      28
    );
    const buttonWidth = Number.isFinite(widthValue)
      ? Math.max(20, Math.min(64, widthValue))
      : 28;
    const button = buttonElements.get(id);
    const cssId = id;
    root.style.setProperty(`--findreplace-${cssId}-width`, `${buttonWidth}px`);
    setColorVariable(
      `--findreplace-${cssId}-bg`,
      prefs[`pref_findreplace_btn_${suffix}_bg`] ?? prefs.pref_findreplace_btn_bg,
      '#1e1e1e'
    );
    setColorVariable(
      `--findreplace-${cssId}-color`,
      prefs[`pref_findreplace_btn_${suffix}_color`] ?? prefs.pref_findreplace_btn_color,
      '#aaaaaa'
    );
    setColorVariable(
      `--findreplace-${cssId}-active-bg`,
      prefs[`pref_findreplace_btn_${suffix}_active_bg`] ?? prefs.pref_findreplace_btn_active_bg,
      '#0078d4'
    );
    setColorVariable(
      `--findreplace-${cssId}-active-color`,
      prefs[`pref_findreplace_btn_${suffix}_active_color`] ?? prefs.pref_findreplace_btn_active_color,
      '#ffffff'
    );
    setColorVariable(
      `--findreplace-${cssId}-pressed-bg`,
      prefs[`pref_findreplace_btn_${suffix}_pressed_bg`] ?? prefs.pref_findreplace_btn_pressed_bg,
      '#0078d4'
    );
    if (button) {
      const iconSize = Math.max(12, Math.round(Math.min(buttonWidth, safeFieldHeight) - 8));
      button.style.setProperty('--findreplace-icon-size', `${iconSize}px`);
      const svg = prefs[`pref_findreplace_btn_${suffix}_svg`];
      if (typeof svg === 'string' && svg.trim()) {
        button.innerHTML = sanitizeSvg(svg) || button.dataset.defaultSvg;
      } else if (button.dataset.defaultSvg) {
        button.innerHTML = button.dataset.defaultSvg;
      }
    }
  }
}

function sanitizeSvg(svg) {
  const trimmed = String(svg || '').trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return null;
  if (
    /<script/i.test(trimmed) ||
    /<foreignObject/i.test(trimmed) ||
    /\son\w+=/i.test(trimmed) ||
    /javascript:/i.test(trimmed) ||
    /data:/i.test(trimmed) ||
    /<embed/i.test(trimmed) ||
    /<object/i.test(trimmed) ||
    /<iframe/i.test(trimmed)
  ) return null;
  return trimmed;
}

function mergeVisibleOrder(original, visibleOrder) {
  let index = 0;
  const merged = original
    .map(id => state.hidden.has(id) ? id : visibleOrder[index++])
    .filter(Boolean);
  while (index < visibleOrder.length) merged.push(visibleOrder[index++]);
  return merged;
}

function renderLayout() {
  for (const [rowId, element] of Object.entries(rowElements)) {
    if (!element) continue;
    element.replaceChildren();
    for (const id of state[rowId]) {
      if (!state.hidden.has(id)) element.append(buttonElements.get(id));
    }
  }

  const tray = document.querySelector('#findreplace-hidden-buttons');
  if (!tray) return;
  tray.replaceChildren();
  for (const id of BUTTON_IDS) {
    if (!state.hidden.has(id)) continue;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'findreplace-preview-hidden-button';
    restore.textContent = `+ ${BUTTON_LABELS[id]}`;
    restore.setAttribute('aria-label', `Restore ${BUTTON_LABELS[id]} button`);
    restore.addEventListener('click', () => {
      state.hidden.delete(id);
      renderLayout();
      saveLayout();
    });
    tray.append(restore);
  }
  tray.parentElement.hidden = state.hidden.size === 0;
}

function saveLayout() {
  const bridge = window.FindReplaceSettings;
  if (typeof bridge?.saveButtonLayout !== 'function') return;
  bridge.saveButtonLayout(
    state.row1.join(','),
    state.row2.join(','),
    [...state.hidden].join(',')
  );
}

function moveButton(id, targetRow, targetId, placeAfter) {
  const sourceRow = state.row1.includes(id) ? 'row1' : 'row2';
  const sourceOriginal = [...state[sourceRow]];
  const sourceVisible = sourceOriginal.filter(item => !state.hidden.has(item) && item !== id);
  state[sourceRow] = mergeVisibleOrder(sourceOriginal, sourceVisible);

  const targetOriginal = [...state[targetRow]];
  const targetVisible = targetOriginal.filter(item => !state.hidden.has(item) && item !== id);
  const targetIndex = targetId ? targetVisible.indexOf(targetId) : targetVisible.length;
  const insertAt = targetIndex < 0
    ? targetVisible.length
    : targetIndex + (placeAfter ? 1 : 0);
  targetVisible.splice(insertAt, 0, id);
  state[targetRow] = mergeVisibleOrder(targetOriginal, targetVisible);
  state.hidden.delete(id);
  renderLayout();
  saveLayout();
}

function finishPointerDrag(button, event, moved) {
  const draggedId = state.dragging;
  if (!draggedId) return;
  clearTimeout(pointerTimer);
  pointerTimer = 0;
  pointerCandidate = null;
  state.dragging = null;
  suppressClickUntil = Date.now() + 350;
  button.classList.remove('dragging');

  if (moved) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const targetRow = target?.closest('.search-icon-group');
    if (targetRow) {
      const rowId = targetRow.id === 'findreplace-row1' ? 'row1' : 'row2';
      const targetButton = target.closest('.search-icon-btn');
      const targetId = targetButton?.dataset.buttonId === draggedId
        ? null
        : targetButton?.dataset.buttonId || null;
      const placeAfter = targetButton
        ? event.clientX > targetButton.getBoundingClientRect().left + targetButton.offsetWidth / 2
        : true;
      moveButton(draggedId, rowId, targetId, placeAfter);
    } else if (target?.closest('#findreplace-hidden-tray')) {
      state.hidden.add(draggedId);
      renderLayout();
      saveLayout();
    } else {
      renderLayout();
    }
  } else {
    renderLayout();
  }
  document.querySelector('#findreplace-hidden-tray')?.classList.remove('drag-over');
}

for (const button of buttonElements.values()) {
  button.dataset.defaultSvg = button.innerHTML;
  button.addEventListener('click', event => {
    if (state.dragging || Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    window.FindReplaceSettings?.selectCategory?.(button.dataset.category);
  });
  button.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    clearTimeout(pointerTimer);
    pointerCandidate = {
      button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      active: false
    };
    pointerTimer = window.setTimeout(() => {
      if (!pointerCandidate || pointerCandidate.button !== button) return;
      pointerCandidate.active = true;
      state.dragging = button.dataset.buttonId;
      button.classList.add('dragging');
      button.setPointerCapture?.(pointerCandidate.pointerId);
    }, 360);
  });
  button.addEventListener('pointermove', event => {
    if (!pointerCandidate || pointerCandidate.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointerCandidate.startX;
    const deltaY = event.clientY - pointerCandidate.startY;
    if (!pointerCandidate.active && Math.hypot(deltaX, deltaY) > 10) {
      clearTimeout(pointerTimer);
      pointerTimer = 0;
      pointerCandidate = null;
      return;
    }
    if (!pointerCandidate.active) return;
    pointerCandidate.moved ||= Math.hypot(deltaX, deltaY) > 8;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    document.querySelector('#findreplace-hidden-tray')
      ?.classList.toggle('drag-over', Boolean(target?.closest('#findreplace-hidden-tray')));
  });
  button.addEventListener('pointerup', event => {
    if (!pointerCandidate || pointerCandidate.pointerId !== event.pointerId) return;
    const candidate = pointerCandidate;
    clearTimeout(pointerTimer);
    pointerTimer = 0;
    if (!candidate.active) {
      pointerCandidate = null;
      return;
    }
    event.preventDefault();
    finishPointerDrag(button, event, candidate.moved);
  });
  button.addEventListener('pointercancel', event => {
    if (!pointerCandidate || pointerCandidate.pointerId !== event.pointerId) return;
    const active = pointerCandidate.active;
    clearTimeout(pointerTimer);
    pointerTimer = 0;
    if (active) finishPointerDrag(button, event, false);
    else pointerCandidate = null;
  });
}

document.querySelector('#search-input')?.addEventListener('click', () => {
  window.FindReplaceSettings?.selectCategory?.('category_field_find');
});
document.querySelector('#replace-input')?.addEventListener('click', () => {
  window.FindReplaceSettings?.selectCategory?.('category_field_replace');
});
document.querySelector('#search-counter')?.addEventListener('click', () => {
  window.FindReplaceSettings?.selectCategory?.('category_counter');
});
document.querySelector('.findreplace-preview-card')?.addEventListener('click', event => {
  if (event.target.closest('button, input, .search-counter')) return;
  window.FindReplaceSettings?.selectCategory?.('category_panel');
});

window.applyFindReplaceSettings = rawPrefs => {
  let prefs = rawPrefs;
  if (typeof rawPrefs === 'string') {
    try {
      prefs = JSON.parse(rawPrefs);
    } catch {
      prefs = {};
    }
  }
  prefs = prefs && typeof prefs === 'object' ? prefs : {};
  applyStyles(prefs);
  const normalized = normalizeRows(
    prefs.pref_findreplace_button_row1,
    prefs.pref_findreplace_button_row2,
    prefs.pref_findreplace_hidden_buttons
  );
  state.row1 = normalized.row1;
  state.row2 = normalized.row2;
  state.hidden = normalized.hidden;
  renderLayout();
};

window.applyFindReplaceSettings({});
