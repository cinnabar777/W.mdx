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

const textToolbarIcons = [
  ['previewParagraph', 'Paragraph', 'P'],
  ...Array.from({ length: 6 }, (_, index) => [
    `previewHeading${index + 1}`,
    `Heading ${index + 1}`,
    `H${index + 1}`
  ]),
  ['previewLineNumbers', 'Line Numbers', '#']
].map(([id, title, text]) => ({ id, title, markup: textIcon(text) }));

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
  { id: 'toc-expand-collapse', title: 'Expand or Collapse All', markup: textIcon('±') }
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
