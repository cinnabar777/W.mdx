import { audioControlIcons } from './audioControlIcons.js';
import { calloutTypeIcons } from './calloutIcons.js';
import { findReplaceIcons } from './findReplaceIcons.js';
import { TABLE_ACTIONS } from './tableActions.js';
import { svgIcons } from './toolbarIcons.js';

function titleFromName(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function textIcon(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="17" text-anchor="middle" font-size="15" font-weight="bold" font-family="system-ui, sans-serif" fill="currentColor">${escaped}</text></svg>`;
}

function letterIcon(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const length = [...text].length;
  const fontSize = length === 1 ? 18 : length === 2 ? 16 : 13;
  const fitting = length > 2
    ? ' textLength="22" lengthAdjust="spacingAndGlyphs"'
    : '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="17" text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif" fill="currentColor"${fitting}>${escaped}</text></svg>`;
}

const requestedLetterIcons = [
  ['text-mdz-upper', 'MDZ', 'MDZ'],
  ['text-mdz-lower', 'mdz', 'mdz'],
  ['text-mdzip-lower', 'mdzip', 'mdzip'],
  ['text-mdzip-upper', 'MDZIP', 'MDZIP'],
  ['text-wmds-lower', 'wmds', 'wmds'],
  ['text-wmds-upper', 'WMDS', 'WMDS'],
  ['text-w', 'W', 'W'],
  ['text-l', 'L', 'L'],
  ['text-s', 'S', 'S'],
  ['text-html-upper', 'HTML', 'HTML'],
  ['text-html-lower', 'html', 'html'],
  ['text-mhtml-upper', 'MHTML', 'MHTML'],
  ['text-mhtml-lower', 'mhtml', 'mhtml'],
  ['text-mht-upper', 'MHT', 'MHT'],
  ['text-mht-lower', 'mht', 'mht'],
  ['text-sa-mixed', 'Sa', 'Sa'],
  ['text-s-lower', 's', 's'],
  ['text-sa-lower', 'sa', 'sa']
].map(([id, title, text]) => ({ id, title, markup: letterIcon(text) }));

const textToolbarIcons = [
  ['previewParagraph', 'Paragraph', 'P'],
  ...Array.from({ length: 6 }, (_, index) => [
    `previewHeading${index + 1}`,
    `Heading ${index + 1}`,
    `H${index + 1}`
  ])
].map(([id, title, text]) => ({ id, title, markup: textIcon(text) }));

const tocExpandCollapseIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14"/><path d="M5 10h14"/><path d="M5 21h14"/></svg>`;

export const APP_ICON_CHOICES = Object.freeze([
  ...Object.entries(svgIcons).map(([id, markup]) => ({
    id,
    title: id === 'tocSettings' ? 'TOC Settings' : titleFromName(id),
    markup
  })),
  ...Object.entries(calloutTypeIcons).map(([id, markup]) => ({
    id: `callout-${id}`,
    title: `Callout: ${titleFromName(id)}`,
    markup
  })),
  ...Object.entries(findReplaceIcons).map(([id, markup]) => ({
    id: `findreplace-${id}`,
    title: `Find & Replace: ${titleFromName(id)}`,
    markup
  })),
  ...TABLE_ACTIONS.map(action => ({
    id: `table-${action.id}`,
    title: `Table: ${action.title}`,
    markup: action.icon
  })),
  ...Object.entries(audioControlIcons).map(([id, markup]) => ({
    id: `audio-${id}`,
    title: `Audio: ${titleFromName(id)}`,
    markup
  })),
  ...textToolbarIcons,
  ...requestedLetterIcons,
  { id: 'toc-expand-collapse', title: 'Expand or Collapse All', markup: tocExpandCollapseIcon }
]);

export function renderIconChoices(
  list,
  {
    query = '',
    selectedMarkup = '',
    titleOverrides,
    sanitizeMarkup = markup => markup,
    onSelect,
    noIconOption = false,
    noIconSelected = false,
    onNoIcon
  } = {}
) {
  if (!list) return 0;
  const normalizedQuery = String(query).trim().toLowerCase();
  const document = list.ownerDocument;
  list.replaceChildren();

  if (
    noIconOption &&
    (!normalizedQuery || ['no icon', 'none'].some(label => label.includes(normalizedQuery)))
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-preview-icon-choice toolbar-preview-no-icon-choice';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', 'No icon');
    button.setAttribute('aria-pressed', String(noIconSelected));
    button.innerHTML =
      '<span class="toolbar-preview-no-icon-mark" aria-hidden="true">∅</span>';
    const label = document.createElement('span');
    label.textContent = 'No icon';
    button.append(label);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onNoIcon?.();
    });
    button.addEventListener('pointerdown', event => event.preventDefault());
    list.append(button);
  }

  const choices = APP_ICON_CHOICES
    .map(choice => ({
      ...choice,
      title: titleOverrides?.get?.(choice.id) || choice.title
    }))
    .filter(choice =>
      `${choice.id} ${choice.title}`.toLowerCase().includes(normalizedQuery)
    )
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) ||
      a.id.localeCompare(b.id, undefined, { sensitivity: 'base', numeric: true })
    );

  for (const choice of choices) {
    const markup = sanitizeMarkup(choice.markup);
    if (typeof markup !== 'string' || !markup.includes('<svg')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-preview-icon-choice';
    button.dataset.iconId = choice.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', choice.title);
    button.setAttribute('aria-pressed', String(selectedMarkup === choice.markup));
    button.title = choice.title;
    button.innerHTML = markup;
    const label = document.createElement('span');
    label.textContent = choice.title;
    button.append(label);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onSelect?.(choice);
    });
    button.addEventListener('pointerdown', event => event.preventDefault());
    list.append(button);
  }

  if (list.children.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'toolbar-preview-icon-empty';
    empty.textContent = 'No matching icons';
    list.append(empty);
  }
  return choices.length;
}
